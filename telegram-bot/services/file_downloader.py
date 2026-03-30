"""
Сервис для скачивания медиафайлов из Telegram.
Обеспечивает автоматическое скачивание файлов на сервер с организацией в структурированные директории.
"""

import os
import re
from datetime import datetime
from typing import Optional
from pathlib import Path
import structlog

from aiogram import Bot


logger = structlog.get_logger(__name__)


class FileDownloadError(Exception):
    """Исключение при ошибке скачивания файла"""
    pass


class FileDownloader:
    """Сервис для скачивания медиафайлов из Telegram"""
    
    def __init__(self, bot: Bot, base_media_path: str = "media"):
        """
        Инициализирует загрузчик файлов
        
        Args:
            bot: Экземпляр Telegram Bot для скачивания файлов
            base_media_path: Базовый путь для сохранения медиафайлов (относительно корня telegram-bot)
        """
        self.bot = bot
        self.base_media_path = base_media_path
        
        logger.info(
            "file_downloader_initialized",
            base_media_path=base_media_path
        )
    
    async def download_file(
        self,
        file_id: str,
        media_type: str,
        chat_id: int,
        extension: str
    ) -> str:
        """
        Скачивает файл из Telegram и сохраняет в структурированную директорию
        
        Args:
            file_id: Telegram File_ID для скачивания
            media_type: Тип медиа (photo, video, animation, sticker, voice, document)
            chat_id: ID чата для организации файлов по пользователям
            extension: Расширение файла (например: jpg, mp4, webm)
        
        Returns:
            Относительный путь к сохранённому файлу (от корня telegram-bot)
        
        Raises:
            FileDownloadError: При ошибке скачивания или сохранения файла
        
        Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
        """
        logger.info(
            "downloading_file",
            file_id=file_id,
            media_type=media_type,
            chat_id=chat_id,
            extension=extension
        )
        
        try:
            # Генерируем путь для сохранения файла
            file_path = self._generate_file_path(
                media_type=media_type,
                chat_id=chat_id,
                file_id=file_id,
                extension=extension
            )
            
            # Создаём директорию если не существует
            directory = os.path.dirname(file_path)
            self._ensure_directory_exists(directory)
            
            # Получаем информацию о файле из Telegram
            file = await self.bot.get_file(file_id)
            
            # Скачиваем файл
            await self.bot.download_file(file.file_path, destination=file_path)
            
            # Получаем размер скачанного файла
            file_size = self._get_file_size(file_path)
            
            # Проверяем размер файла и выдаём warning если >20MB
            if file_size > 20 * 1024 * 1024:  # 20MB в байтах
                logger.warning(
                    "large_file_downloaded",
                    file_path=file_path,
                    file_size_mb=round(file_size / (1024 * 1024), 2),
                    file_id=file_id
                )
            
            logger.info(
                "file_downloaded_successfully",
                file_path=file_path,
                file_size=file_size,
                file_id=file_id
            )
            
            # Возвращаем относительный путь (от base_media_path)
            relative_path = os.path.relpath(file_path, self.base_media_path)
            # Нормализуем путь к Unix-стилю (заменяем \ на /)
            relative_path = relative_path.replace('\\', '/')
            return relative_path
        
        except Exception as e:
            logger.error(
                "failed_to_download_file",
                file_id=file_id,
                media_type=media_type,
                error=str(e),
                exc_info=True
            )
            raise FileDownloadError(f"Failed to download file {file_id}: {str(e)}")
    
    def _generate_file_path(
        self,
        media_type: str,
        chat_id: int,
        file_id: str,
        extension: str
    ) -> str:
        """
        Генерирует путь для сохранения файла
        
        Формат: media/{media_type}/{chat_id}/{timestamp}_{file_id}.{extension}
        
        Args:
            media_type: Тип медиа (photo, video, animation, sticker, voice, document)
            chat_id: ID чата
            file_id: Telegram File_ID
            extension: Расширение файла
        
        Returns:
            Полный путь к файлу для сохранения
        
        Validates: Requirements 3.2, 3.3, 3.6
        """
        # Генерируем timestamp в формате YYYYMMDD_HHMMSS
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Санитизируем file_id для использования в имени файла
        sanitized_file_id = self._sanitize_filename(file_id)
        
        # Убираем точку из расширения если она есть
        extension = extension.lstrip('.')
        
        # Формируем имя файла
        filename = f"{timestamp}_{sanitized_file_id}.{extension}"
        
        # Формируем полный путь
        file_path = os.path.join(
            self.base_media_path,
            media_type,
            str(chat_id),
            filename
        )
        
        return file_path
    
    def _ensure_directory_exists(self, directory: str) -> None:
        """
        Создаёт директорию если она не существует
        
        Args:
            directory: Путь к директории
        
        Raises:
            FileDownloadError: При ошибке создания директории
        
        Validates: Requirements 9.1, 9.2
        """
        try:
            os.makedirs(directory, exist_ok=True)
            
            # Устанавливаем права доступа 755 (rwxr-xr-x)
            os.chmod(directory, 0o755)
            
            logger.debug(
                "directory_ensured",
                directory=directory
            )
        
        except OSError as e:
            logger.error(
                "failed_to_create_directory",
                directory=directory,
                error=str(e),
                exc_info=True
            )
            raise FileDownloadError(f"Cannot create directory: {directory}")
    
    def _get_file_size(self, file_path: str) -> int:
        """
        Возвращает размер файла в байтах
        
        Args:
            file_path: Путь к файлу
        
        Returns:
            Размер файла в байтах
        
        Validates: Requirements 9.5
        """
        try:
            return os.path.getsize(file_path)
        except OSError as e:
            logger.warning(
                "failed_to_get_file_size",
                file_path=file_path,
                error=str(e)
            )
            return 0
    
    def _sanitize_filename(self, filename: str) -> str:
        """
        Санитизирует имя файла, удаляя небезопасные символы
        
        Args:
            filename: Исходное имя файла
        
        Returns:
            Безопасное имя файла
        """
        # Заменяем все символы кроме букв, цифр, дефиса и подчёркивания на подчёркивание
        sanitized = re.sub(r'[^\w\-]', '_', filename)
        
        # Ограничиваем длину до 50 символов
        if len(sanitized) > 50:
            sanitized = sanitized[:50]
        
        return sanitized
