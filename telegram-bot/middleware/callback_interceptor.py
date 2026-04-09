"""
CallbackInterceptor - middleware для обработки callback query

Отвечает за:
- Перехват всех callback query от пользователей
- Автоматическое создание/обновление Chat_Session
- Добавление session_id в контекст для использования в handlers
"""
import structlog
from typing import Callable, Any
from aiogram.types import CallbackQuery

from services.session_manager import SessionManager


logger = structlog.get_logger(__name__)


class CallbackInterceptor:
    """
    Middleware для обработки callback query
    
    Логика работы:
    1. Перехватывает все callback query
    2. Получает или создаёт активную сессию для пользователя
    3. Добавляет session_id в контекст
    4. Передаёт управление следующему обработчику
    """
    
    def __init__(self, session_manager: SessionManager):
        """
        Инициализирует CallbackInterceptor
        
        Args:
            session_manager: Менеджер сессий для создания и управления
        """
        self.session_manager = session_manager
        logger.debug("callback_interceptor_initialized")
    
    async def __call__(
        self,
        handler: Callable,
        event: CallbackQuery,
        data: dict
    ) -> Any:
        """
        Перехватывает callback query, создаёт/обновляет сессию
        
        Args:
            handler: Следующий обработчик в цепочке
            event: Callback query от пользователя
            data: Данные контекста
            
        Returns:
            Результат выполнения следующего обработчика
        """
        # Проверяем, что это callback от пользователя
        if not event.from_user:
            logger.debug("callback_without_user_skipped")
            return await handler(event, data)
        
        telegram_id = event.from_user.id
        
        # Пытаемся создать/получить сессию
        try:
            # Получаем или создаём активную сессию с информацией о пользователе
            session_id = await self.session_manager.get_or_create_session(
                telegram_id=telegram_id,
                session_type='chat',
                first_name=event.from_user.first_name,
                last_name=event.from_user.last_name,
                username=event.from_user.username
            )
            
            # Сохраняем session_id в контексте для использования в handlers
            data['session_id'] = session_id
            
            logger.debug(
                "callback_intercepted",
                session_id=session_id,
                telegram_id=telegram_id,
                callback_data=event.data
            )
        
        except Exception as e:
            # Логируем ошибку создания сессии, но не блокируем обработку
            logger.error(
                "failed_to_create_or_get_session_for_callback",
                telegram_id=telegram_id,
                callback_data=event.data,
                error=str(e),
                exc_info=True
            )
            # Продолжаем обработку callback даже при ошибке
        
        # Передаём управление следующему обработчику
        return await handler(event, data)
