"""
Обработчик медиа-сообщений для Telegram-бота.
Обеспечивает обработку входящих медиа-сообщений, скачивание файлов и сохранение метаданных.
"""

from typing import Optional, Tuple
import structlog
from aiogram.types import Message
from aiogram.fsm.context import FSMContext

from services.file_downloader import FileDownloader, FileDownloadError
from services.sticker_converter import StickerConverter, ConversionError
from services.support_service import SupportService


logger = structlog.get_logger(__name__)


class MediaHandler:
    """Обработчик медиа-сообщений от пользователей"""
    
    def __init__(
        self,
        file_downloader: FileDownloader,
        sticker_converter: StickerConverter,
        support_service: SupportService
    ):
        """
        Инициализирует обработчик медиа-сообщений
        
        Args:
            file_downloader: Сервис для скачивания файлов
            sticker_converter: Сервис для конвертации стикеров
            support_service: Сервис для работы с поддержкой
        """
        self.file_downloader = file_downloader
        self.sticker_converter = sticker_converter
        self.support_service = support_service
        
        logger.info("media_handler_initialized")
    
    async def handle_media_message(
        self,
        message: Message,
        state: FSMContext,
        session_id: int
    ) -> None:
        """
        Обрабатывает входящее медиа-сообщение
        
        Args:
            message: Сообщение от Telegram
            state: FSM контекст
            session_id: ID сессии поддержки
        
        Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.5
        """
        logger.info(
            "handling_media_message",
            session_id=session_id,
            telegram_id=message.from_user.id if message.from_user else None,
            message_id=message.message_id
        )
        
        try:
            # Определяем тип медиа
            media_type = self._determine_media_type(message)
            
            logger.debug(
                "media_type_determined",
                media_type=media_type,
                message_id=message.message_id
            )
            
            # Извлекаем caption если есть
            caption = self._extract_caption(message, media_type)
            
            # Для текстовых сообщений сохраняем без скачивания файлов
            if media_type == 'text':
                await self.support_service.save_message(
                    session_id=session_id,
                    telegram_id=message.from_user.id if message.from_user else 0,
                    message_type='from_user',
                    message_text=message.text or '',
                    media_type='text'
                )
                logger.info(
                    "text_message_saved",
                    session_id=session_id,
                    message_id=message.message_id
                )
                return
            
            # Извлекаем File_ID и расширение для медиа
            file_id, extension = self._extract_file_info(message, media_type)
            
            logger.debug(
                "file_info_extracted",
                file_id=file_id,
                extension=extension,
                media_type=media_type
            )
            
            # Скачиваем файл
            file_path = None
            file_size = None
            
            try:
                relative_file_path = await self.file_downloader.download_file(
                    file_id=file_id,
                    media_type=media_type,
                    chat_id=message.chat.id,
                    extension=extension
                )
                
                # Формируем полный путь для операций с файлом
                import os
                full_file_path = os.path.join(self.file_downloader.base_media_path, relative_file_path)
                
                # Получаем размер файла
                if os.path.exists(full_file_path):
                    file_size = os.path.getsize(full_file_path)
                
                # Сохраняем относительный путь для БД
                file_path = relative_file_path
                
                # Конвертируем TGS стикеры
                if media_type == 'sticker' and extension == 'tgs':
                    try:
                        converted_full_path = await self.sticker_converter.convert_tgs(full_file_path)
                        # Получаем относительный путь для сконвертированного файла
                        converted_relative_path = os.path.relpath(converted_full_path, self.file_downloader.base_media_path)
                        # Нормализуем путь к Unix-стилю
                        converted_relative_path = converted_relative_path.replace('\\', '/')
                        file_path = converted_relative_path
                        
                        logger.info(
                            "sticker_converted",
                            original_path=relative_file_path,
                            converted_path=converted_relative_path
                        )
                    except ConversionError as e:
                        logger.warning(
                            "sticker_conversion_failed_using_original",
                            file_path=relative_file_path,
                            error=str(e)
                        )
                        # Используем оригинальный файл при ошибке конвертации
                
            except FileDownloadError as e:
                logger.error(
                    "failed_to_download_media_file",
                    file_id=file_id,
                    media_type=media_type,
                    error=str(e),
                    exc_info=True
                )
                # Продолжаем сохранение без file_path
            
            # Сохраняем сообщение в БД
            message_text = caption if caption else f"[{media_type}]"
            
            await self.support_service.save_message(
                session_id=session_id,
                telegram_id=message.from_user.id if message.from_user else 0,
                message_type='from_user',
                message_text=message_text,
                file_id=file_id,
                media_type=media_type,
                file_path=file_path,
                caption=caption,
                file_size=file_size
            )
            
            logger.info(
                "media_message_saved",
                session_id=session_id,
                media_type=media_type,
                has_file_path=bool(file_path),
                file_size=file_size
            )
            
        except Exception as e:
            logger.error(
                "failed_to_handle_media_message",
                error=str(e),
                session_id=session_id,
                message_id=message.message_id,
                exc_info=True
            )
            raise
    
    def _determine_media_type(self, message: Message) -> str:
        """
        Определяет тип медиа из сообщения
        
        Args:
            message: Сообщение от Telegram
        
        Returns:
            Один из: 'text', 'photo', 'video', 'animation', 'sticker', 'voice', 'document'
        
        Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
        """
        if message.photo:
            return 'photo'
        elif message.video:
            return 'video'
        elif message.animation:
            return 'animation'
        elif message.sticker:
            return 'sticker'
        elif message.voice:
            return 'voice'
        elif message.document:
            return 'document'
        else:
            return 'text'
    
    def _extract_file_info(self, message: Message, media_type: str) -> Tuple[str, str]:
        """
        Извлекает File_ID и расширение файла из сообщения
        
        Args:
            message: Сообщение от Telegram
            media_type: Тип медиа
        
        Returns:
            Кортеж (file_id, extension)
        
        Raises:
            ValueError: Если не удалось извлечь File_ID
        
        Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.6, 3.7, 3.8
        """
        file_id = None
        extension = ''
        
        if media_type == 'photo':
            # Берём фото с наибольшим разрешением (последнее в списке)
            if message.photo:
                file_id = message.photo[-1].file_id
                extension = 'jpg'
        
        elif media_type == 'video':
            if message.video:
                file_id = message.video.file_id
                # Определяем расширение из mime_type или используем mp4 по умолчанию
                if message.video.mime_type:
                    if 'mp4' in message.video.mime_type:
                        extension = 'mp4'
                    elif 'avi' in message.video.mime_type:
                        extension = 'avi'
                    elif 'mov' in message.video.mime_type:
                        extension = 'mov'
                    else:
                        extension = 'mp4'
                else:
                    extension = 'mp4'
        
        elif media_type == 'animation':
            if message.animation:
                file_id = message.animation.file_id
                # Анимации обычно в формате mp4 или gif
                if message.animation.mime_type:
                    if 'gif' in message.animation.mime_type:
                        extension = 'gif'
                    else:
                        extension = 'mp4'
                else:
                    extension = 'mp4'
        
        elif media_type == 'sticker':
            if message.sticker:
                file_id = message.sticker.file_id
                # Определяем формат стикера
                if message.sticker.is_animated:
                    extension = 'tgs'  # Анимированный стикер (Lottie)
                elif message.sticker.is_video:
                    extension = 'webm'  # Видео-стикер
                else:
                    extension = 'webp'  # Статичный стикер
        
        elif media_type == 'voice':
            if message.voice:
                file_id = message.voice.file_id
                extension = 'ogg'  # Голосовые сообщения всегда в формате OGG
        
        elif media_type == 'document':
            if message.document:
                file_id = message.document.file_id
                # Пытаемся извлечь расширение из имени файла
                if message.document.file_name:
                    import os
                    _, ext = os.path.splitext(message.document.file_name)
                    extension = ext.lstrip('.') if ext else 'bin'
                else:
                    # Пытаемся определить по mime_type
                    if message.document.mime_type:
                        mime_to_ext = {
                            'application/pdf': 'pdf',
                            'application/zip': 'zip',
                            'application/x-rar': 'rar',
                            'text/plain': 'txt',
                            'application/msword': 'doc',
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
                        }
                        extension = mime_to_ext.get(message.document.mime_type, 'bin')
                    else:
                        extension = 'bin'
        
        if not file_id:
            raise ValueError(f"Could not extract file_id for media_type: {media_type}")
        
        return file_id, extension
    
    def _extract_caption(self, message: Message, media_type: str) -> Optional[str]:
        """
        Извлекает caption из медиа-сообщения
        
        Args:
            message: Сообщение от Telegram
            media_type: Тип медиа
        
        Returns:
            Caption или None если отсутствует
        
        Validates: Requirements 2.7
        """
        # Caption доступен для всех типов медиа кроме text
        if media_type != 'text' and message.caption:
            return message.caption
        
        return None
