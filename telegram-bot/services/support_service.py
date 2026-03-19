"""
Сервис для работы со службой поддержки.
Бизнес-логика управления сессиями и сообщениями поддержки.
"""

from typing import Optional, List
import structlog

from database.repository import SupportRepository
from database.models import SupportSession, SupportMessage

logger = structlog.get_logger(__name__)


class SupportService:
    """Сервис для работы с поддержкой"""
    
    def __init__(self, repository: SupportRepository):
        """
        Инициализирует сервис поддержки
        
        Args:
            repository: Repository для работы с БД
        """
        self.repository = repository
        logger.info("support_service_initialized")
    
    async def create_session(
        self, 
        telegram_id: int,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        username: Optional[str] = None
    ) -> int:
        """
        Создаёт новую сессию поддержки с информацией о пользователе
        
        Args:
            telegram_id: Telegram ID пользователя
            first_name: Имя пользователя из Telegram (опционально)
            last_name: Фамилия пользователя из Telegram (опционально)
            username: Username пользователя из Telegram (опционально)
        
        Returns:
            ID созданной сессии
            
        Raises:
            Exception: При ошибке создания сессии
        """
        logger.info(
            "creating_support_session",
            telegram_id=telegram_id,
            user_name=f"{first_name or ''} {last_name or ''}".strip() or None
        )
        
        try:
            session_id = await self.repository.create_session(
                telegram_id=telegram_id,
                first_name=first_name,
                last_name=last_name,
                username=username
            )
            
            logger.info(
                "support_session_created",
                session_id=session_id,
                telegram_id=telegram_id,
                user_name=f"{first_name or ''} {last_name or ''}".strip() or None
            )
            
            return session_id
            
        except Exception as e:
            logger.error(
                "failed_to_create_support_session",
                error=str(e),
                telegram_id=telegram_id
            )
            raise
    
    async def save_message(
        self,
        session_id: int,
        telegram_id: int,
        message_type: str,
        message_text: str,
        file_id: Optional[str] = None
    ) -> int:
        """
        Сохраняет сообщение в БД
        
        Args:
            session_id: ID сессии поддержки
            telegram_id: Telegram ID отправителя
            message_type: Тип сообщения ('from_user' или 'from_support')
            message_text: Текст сообщения
            file_id: ID файла для медиа-контента (опционально)
        
        Returns:
            ID созданного сообщения
            
        Raises:
            ValueError: Если message_type невалиден
            Exception: При ошибке сохранения
        """
        logger.info(
            "saving_support_message",
            session_id=session_id,
            telegram_id=telegram_id,
            message_type=message_type,
            has_file=bool(file_id)
        )
        
        try:
            message_id = await self.repository.save_message(
                session_id=session_id,
                telegram_id=telegram_id,
                message_type=message_type,
                message_text=message_text,
                file_id=file_id
            )
            
            logger.info(
                "support_message_saved",
                message_id=message_id,
                session_id=session_id,
                message_type=message_type
            )
            
            return message_id
            
        except ValueError as e:
            logger.error(
                "invalid_message_type",
                error=str(e),
                message_type=message_type
            )
            raise
        except Exception as e:
            logger.error(
                "failed_to_save_support_message",
                error=str(e),
                session_id=session_id,
                telegram_id=telegram_id
            )
            raise
    
    async def close_session(self, session_id: int) -> bool:
        """
        Закрывает сессию поддержки
        
        Args:
            session_id: ID сессии для закрытия
        
        Returns:
            True если сессия успешно закрыта, False если сессия не найдена
            
        Raises:
            Exception: При ошибке закрытия сессии
        """
        logger.info(
            "closing_support_session",
            session_id=session_id
        )
        
        try:
            success = await self.repository.close_session(session_id)
            
            if success:
                logger.info(
                    "support_session_closed",
                    session_id=session_id
                )
            else:
                logger.warning(
                    "support_session_not_found",
                    session_id=session_id
                )
            
            return success
            
        except Exception as e:
            logger.error(
                "failed_to_close_support_session",
                error=str(e),
                session_id=session_id
            )
            raise
    
    async def get_messages(
        self,
        session_id: int,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[SupportMessage]:
        """
        Получает сообщения для указанной сессии
        
        Args:
            session_id: ID сессии поддержки
            limit: Максимальное количество сообщений (None = все)
            offset: Смещение для пагинации
        
        Returns:
            Список сообщений, отсортированных по времени создания
        """
        logger.debug(
            "getting_support_messages",
            session_id=session_id,
            limit=limit,
            offset=offset
        )
        
        try:
            messages = await self.repository.get_messages(
                session_id=session_id,
                limit=limit,
                offset=offset
            )
            
            logger.debug(
                "support_messages_retrieved",
                session_id=session_id,
                count=len(messages)
            )
            
            return messages
            
        except Exception as e:
            logger.error(
                "failed_to_get_support_messages",
                error=str(e),
                session_id=session_id
            )
            raise
    
    async def get_active_sessions(
        self,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[SupportSession]:
        """
        Получает список активных сессий поддержки
        
        Args:
            limit: Максимальное количество сессий (None = все)
            offset: Смещение для пагинации
        
        Returns:
            Список активных сессий, отсортированных по времени создания
        """
        logger.debug(
            "getting_active_support_sessions",
            limit=limit,
            offset=offset
        )
        
        try:
            sessions = await self.repository.get_active_sessions(
                limit=limit,
                offset=offset
            )
            
            logger.debug(
                "active_support_sessions_retrieved",
                count=len(sessions)
            )
            
            return sessions
            
        except Exception as e:
            logger.error(
                "failed_to_get_active_support_sessions",
                error=str(e)
            )
            raise
    
    async def get_user_active_session(
        self,
        telegram_id: int
    ) -> Optional[SupportSession]:
        """
        Получает активную сессию пользователя
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            Активная сессия или None если нет активной сессии
        """
        logger.debug(
            "getting_user_active_session",
            telegram_id=telegram_id
        )
        
        try:
            session = await self.repository.get_user_active_session(telegram_id)
            
            if session:
                logger.debug(
                    "user_active_session_found",
                    telegram_id=telegram_id,
                    session_id=session.id
                )
            else:
                logger.debug(
                    "no_active_session_for_user",
                    telegram_id=telegram_id
                )
            
            return session
            
        except Exception as e:
            logger.error(
                "failed_to_get_user_active_session",
                error=str(e),
                telegram_id=telegram_id
            )
            raise
    
    async def mark_message_delivered(self, message_id: int) -> bool:
        """
        Отмечает сообщение как доставленное
        
        Args:
            message_id: ID сообщения
        
        Returns:
            True если сообщение успешно отмечено, False если не найдено
        """
        logger.debug(
            "marking_message_delivered",
            message_id=message_id
        )
        
        try:
            success = await self.repository.mark_message_delivered(message_id)
            
            if success:
                logger.debug(
                    "message_marked_delivered",
                    message_id=message_id
                )
            else:
                logger.warning(
                    "message_not_found_for_delivery_mark",
                    message_id=message_id
                )
            
            return success
            
        except Exception as e:
            logger.error(
                "failed_to_mark_message_delivered",
                error=str(e),
                message_id=message_id
            )
            raise
