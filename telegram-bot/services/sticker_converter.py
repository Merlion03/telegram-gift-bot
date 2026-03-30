"""
Сервис для конвертации стикеров в веб-совместимые форматы.
Обеспечивает конвертацию TGS (анимированных) стикеров в GIF/WebP для отображения в браузере.
"""

import os
import subprocess
from pathlib import Path
from typing import Optional
import structlog


logger = structlog.get_logger(__name__)


class ConversionError(Exception):
    """Исключение при ошибке конвертации стикера"""
    pass


class StickerConverter:
    """Сервис для конвертации стикеров в веб-совместимые форматы"""
    
    def __init__(self):
        """Инициализирует конвертер стикеров"""
        logger.info("sticker_converter_initialized")
    
    async def convert_tgs(self, tgs_file_path: str) -> str:
        """
        Конвертирует TGS стикер в GIF или WebP для веб-отображения
        
        Args:
            tgs_file_path: Путь к TGS файлу для конвертации
        
        Returns:
            Путь к сконвертированному файлу (GIF или WebP)
            При ошибке конвертации возвращает путь к оригинальному файлу
        
        Raises:
            ConversionError: При критической ошибке конвертации (если требуется)
        
        Validates: Requirements 4.1, 4.4, 4.5
        """
        logger.info(
            "converting_tgs_sticker",
            tgs_file_path=tgs_file_path
        )
        
        # Проверяем, что файл действительно TGS формата
        if not self._is_tgs_format(tgs_file_path):
            logger.warning(
                "file_is_not_tgs_format",
                file_path=tgs_file_path
            )
            return tgs_file_path
        
        try:
            # Генерируем путь для выходного файла (заменяем .tgs на .gif)
            output_path = tgs_file_path.rsplit('.', 1)[0] + '.gif'
            
            # Конвертируем TGS в GIF используя rlottie
            self._convert_with_rlottie(tgs_file_path, output_path)
            
            logger.info(
                "tgs_sticker_converted_successfully",
                input_path=tgs_file_path,
                output_path=output_path
            )
            
            return output_path
        
        except Exception as e:
            logger.warning(
                "sticker_conversion_failed_using_original",
                file_path=tgs_file_path,
                error=str(e),
                exc_info=True
            )
            # Fallback: возвращаем оригинальный файл
            return tgs_file_path
    
    def _is_tgs_format(self, file_path: str) -> bool:
        """
        Проверяет, является ли файл TGS форматом
        
        TGS файлы - это gzip-сжатые JSON файлы с Lottie анимацией.
        Проверяем по расширению и магическим байтам.
        
        Args:
            file_path: Путь к файлу для проверки
        
        Returns:
            True если файл в формате TGS, иначе False
        """
        # Проверяем расширение файла
        if not file_path.lower().endswith('.tgs'):
            return False
        
        # Проверяем существование файла
        if not os.path.exists(file_path):
            logger.warning(
                "file_does_not_exist",
                file_path=file_path
            )
            return False
        
        try:
            # Проверяем магические байты gzip (1f 8b)
            with open(file_path, 'rb') as f:
                magic_bytes = f.read(2)
                is_gzip = magic_bytes == b'\x1f\x8b'
            
            if not is_gzip:
                logger.warning(
                    "tgs_file_missing_gzip_signature",
                    file_path=file_path
                )
                return False
            
            return True
        
        except Exception as e:
            logger.error(
                "error_checking_tgs_format",
                file_path=file_path,
                error=str(e)
            )
            return False
    
    def _convert_with_rlottie(self, input_path: str, output_path: str) -> None:
        """
        Конвертирует TGS файл в GIF используя rlottie-python
        
        Args:
            input_path: Путь к входному TGS файлу
            output_path: Путь для сохранения GIF файла
        
        Raises:
            ConversionError: При ошибке конвертации
        """
        try:
            # Импортируем rlottie только при необходимости конвертации
            import rlottie_python
            from PIL import Image
            import gzip
            import json
            
            # Распаковываем TGS (gzip-сжатый JSON)
            with gzip.open(input_path, 'rt', encoding='utf-8') as f:
                lottie_data = json.load(f)
            
            # Создаём временный JSON файл для rlottie
            temp_json_path = input_path.rsplit('.', 1)[0] + '_temp.json'
            with open(temp_json_path, 'w', encoding='utf-8') as f:
                json.dump(lottie_data, f)
            
            # Загружаем анимацию через rlottie
            anim = rlottie_python.LottieAnimation.from_file(temp_json_path)
            
            # Получаем параметры анимации
            frame_count = anim.totalFrame()
            width, height = 512, 512  # Стандартный размер стикеров Telegram
            
            # Генерируем кадры
            frames = []
            for frame_num in range(frame_count):
                # Рендерим кадр
                buffer = anim.render(frame_num, width, height)
                
                # Конвертируем buffer в PIL Image
                img = Image.frombytes('RGBA', (width, height), bytes(buffer))
                frames.append(img)
            
            # Сохраняем как GIF
            if frames:
                frames[0].save(
                    output_path,
                    save_all=True,
                    append_images=frames[1:],
                    duration=int(1000 / 30),  # 30 FPS
                    loop=0,  # Бесконечный цикл
                    optimize=False
                )
            
            # Удаляем временный JSON файл
            if os.path.exists(temp_json_path):
                os.remove(temp_json_path)
            
            logger.debug(
                "rlottie_conversion_completed",
                input_path=input_path,
                output_path=output_path,
                frame_count=frame_count
            )
        
        except ImportError as e:
            logger.error(
                "rlottie_library_not_available",
                error=str(e)
            )
            raise ConversionError(f"rlottie-python library not installed: {str(e)}")
        
        except Exception as e:
            logger.error(
                "rlottie_conversion_failed",
                input_path=input_path,
                output_path=output_path,
                error=str(e),
                exc_info=True
            )
            raise ConversionError(f"Failed to convert TGS to GIF: {str(e)}")
