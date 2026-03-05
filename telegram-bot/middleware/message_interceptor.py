"""
MessageInterceptor - middleware для автоматического сохранения всех сообщений пользователей

Отвечает за:
- Перехват всех входящих сообщений от пользователей
- Автоматическое создание/обновление Chat_Session
- Сохранение сообщений пользователя в БД
- Обработку медиа-контента (file_id, caption)
- Фильтрацию системных команд
- Обработку ошибок без блокировки работы бота
"""
import structlog
from typing import Callable, Any, Optional
from aiogram.types import Message

from services.session_manager import SessionManager


logger = structlog.get_logger(__name__)


# Системные команды, которые не должны сохраняться в историю диалогов
SYSTEM_COMMANDS = {'/start', '/help'}


class MessageInterceptor:
    """
    Middleware для автоматического сохранения всех сообщений пользователей
    
    Validates: Requirements 1.1, 1.4, 2.1, 2.2, 8.4
    
    Логика работы:
    1. Перехватывает все входящие сообщения
    2. Фильтрует системные команды (/start, /help)
    3. Получает или создаёт активную сессию для пользователя
    4. Сохраняет сообщение пользователя в БД
    5. Передаёт управление следующему обработчику
    6. Обрабатывает ошибки без блокировки работы бота
    
    Особенности:
    - Работает как aiogram middleware
    - Не блокирует обработку сообщений при ошибках
    - Сохраняет как текстовые, так и медиа-сообщения
    - Логирует все операции для отладки
    """
    
    def __init__(self, session_manager: SessionManager):
        """
        Инициализирует MessageInterceptor
        
        Args:
            session_manager: Менеджер сессий для создания и управления
        """
        self.session_manager = session_manager
        logger.debug("message_interceptor_initialized")
    
    async def __call__(
        self,
        handler: Callable,
        event: Message,
        data: dict
    ) -> Any:
        """
        Перехватывает сообщение, создаёт/обновляет сессию, сохраняет сообщение
        
        Validates: Requirements 1.1, 1.4, 2.1, 2.2, 8.4
        
        Args:
            handler: Следующий обработчик в цепочке
            event: Сообщение от пользователя
            data: Данные контекста
            
        Returns:
            Результат выполнения следующего обработчика
        """
        # Проверяем, что это сообщение от пользователя
        if not event.from_user:
            logger.debug("message_without_user_skipped")
            return await handler(event, data)
        
        telegram_id = event.from_user.id
        
        # Фильтруем системные команды
        if self._is_system_command(event):
            logger.debug(
                "system_command_skipped",
                telegram_id=telegram_id,
                command=event.text
            )
            return await handler(event, data)
        
        # Пытаемся создать/получить сессию и сохранить сообщение
        try:
            # Получаем или создаём активную сессию
            session_id = await self.session_manager.get_or_create_session(
                telegram_id=telegram_id,
                session_type='chat'
            )
            
            # Сохраняем session_id в контексте для использования в handlers
            data['session_id'] = session_id
            
            # Извлекаем текст и file_id из сообщения
            message_text = self._extract_message_text(event)
            file_id = self._extract_file_id(event)
            
            # Сохраняем сообщение пользователя
            try:
                await self.session_manager.save_user_message(
                    session_id=session_id,
                    telegram_id=telegram_id,
                    message_text=message_text,
                    file_id=file_id
                )
                
                logger.debug(
                    "user_message_intercepted_and_saved",
                    session_id=session_id,
                    telegram_id=telegram_id,
                    has_text=bool(message_text),
                    has_file=file_id is not None
                )
            
            except Exception as e:
                # Логируем ошибку сохранения, но не блокируем обработку
                logger.error(
                    "failed_to_save_user_message",
                    session_id=session_id,
                    telegram_id=telegram_id,
                    error=str(e),
                    exc_info=True
                )
                # Продолжаем обработку сообщения
        
        except Exception as e:
            # Логируем ошибку создания сессии, но не блокируем обработку
            logger.error(
                "failed_to_create_or_get_session",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            # Продолжаем обработку сообщения даже при ошибке
        
        # Передаём управление следующему обработчику
        return await handler(event, data)
    
    def _is_system_command(self, message: Message) -> bool:
        """
        Проверяет, является ли сообщение системной командой
        
        Validates: Requirements 8.4
        
        Args:
            message: Сообщение для проверки
            
        Returns:
            True если это системная команда, False иначе
        """
        if not message.text:
            return False
        
        # Проверяем, начинается ли текст с системной команды
        text = message.text.strip()
        
        for command in SYSTEM_COMMANDS:
            if text.startswith(command):
                return True
        
        return False
    
    def _extract_message_text(self, message: Message) -> str:
        """
        Извлекает текст из сообщения
        
        Validates: Requirements 2.1, 2.2
        
        Логика:
        - Для текстовых сообщений возвращает message.text
        - Для медиа с caption возвращает caption
        - Для медиа без caption возвращает описание типа медиа
        
        Args:
            message: Сообщение для извлечения текста
            
        Returns:
            Текст сообщения или описание медиа
        """
        # Текстовое сообщение
        if message.text:
            return message.text
        
        # Медиа с caption
        if message.caption:
            return message.caption
        
        # Медиа без caption - возвращаем описание типа
        if message.photo:
            return "[Фото]"
        elif message.document:
            return "[Документ]"
        elif message.video:
            return "[Видео]"
        elif message.audio:
            return "[Аудио]"
        elif message.voice:
            return "[Голосовое сообщение]"
        elif message.sticker:
            return "[Стикер]"
        elif message.animation:
            return "[GIF]"
        else:
            return "[Медиа-контент]"
    
    def _extract_file_id(self, message: Message) -> Optional[str]:
        """
        Извлекает file_id из медиа-сообщения
        
        Validates: Requirements 2.2
        
        Args:
            message: Сообщение для извлечения file_id
            
        Returns:
            file_id если это медиа-сообщение, None иначе
        """
        # Фото (берём самое большое разрешение)
        if message.photo:
            return message.photo[-1].file_id
        
        # Документ
        if message.document:
            return message.document.file_id
        
        # Видео
        if message.video:
            return message.video.file_id
        
        # Аудио
        if message.audio:
            return message.audio.file_id
        
        # Голосовое сообщение
        if message.voice:
            return message.voice.file_id
        
        # Стикер
        if message.sticker:
            return message.sticker.file_id
        
        # Анимация (GIF)
        if message.animation:
            return message.animation.file_id
        
        return None
