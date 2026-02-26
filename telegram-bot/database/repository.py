"""
Repository слой для работы с базой данных поддержки
Инкапсулирует всю логику доступа к данным
"""
import structlog
from typing import List, Optional
from datetime import datetime
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database.models import SupportSession, SupportMessage
from database.connection import get_database


logger = structlog.get_logger(__name__)


class SupportRepository:
    """
    Repository для работы с сессиями и сообщениями поддержки
    
    Предоставляет высокоуровневые методы для:
    - Создания и управления сессиями
    - Сохранения и получения сообщений
    - Получения активных сессий
    """
    
    def __init__(self, session: Optional[AsyncSession] = None):
        """
        Инициализирует repository
        
        Args:
            session: Опциональная сессия БД. Если не указана,
                    будет использоваться глобальное подключение
        """
        self.session = session
    
    async def create_session(self, telegram_id: int) -> int:
        """
        Создаёт новую сессию поддержки
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            int: ID созданной сессии
        
        Raises:
            Exception: При ошибке создания сессии
        """
        try:
            new_session = SupportSession(
                telegram_id=telegram_id,
                status='active',
                created_at=datetime.utcnow()
            )
            
            if self.session:
                self.session.add(new_session)
                await self.session.flush()
                session_id = new_session.id
            else:
                db = get_database()
                async with db.session() as session:
                    session.add(new_session)
                    await session.flush()
                    session_id = new_session.id
            
            logger.info(
                "support_session_created",
                session_id=session_id,
                telegram_id=telegram_id
            )
            return session_id
            
        except Exception as e:
            logger.error(
                "error_creating_support_session",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
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
        Сохраняет сообщение в базу данных
        
        Args:
            session_id: ID сессии поддержки
            telegram_id: Telegram ID отправителя
            message_type: Тип сообщения ('from_user' или 'from_support')
            message_text: Текст сообщения
            file_id: ID файла для медиа-контента (опционально)
        
        Returns:
            int: ID созданного сообщения
        
        Raises:
            ValueError: Если message_type невалиден
            Exception: При ошибке сохранения
        """
        if message_type not in ('from_user', 'from_support'):
            raise ValueError(
                f"Invalid message_type: {message_type}. "
                "Must be 'from_user' or 'from_support'"
            )
        
        try:
            new_message = SupportMessage(
                session_id=session_id,
                telegram_id=telegram_id,
                message_type=message_type,
                message_text=message_text,
                file_id=file_id,
                created_at=datetime.utcnow(),
                delivered=False
            )
            
            if self.session:
                self.session.add(new_message)
                await self.session.flush()
                message_id = new_message.id
            else:
                db = get_database()
                async with db.session() as session:
                    session.add(new_message)
                    await session.flush()
                    message_id = new_message.id
            
            logger.info(
                "message_saved",
                message_id=message_id,
                session_id=session_id,
                message_type=message_type
            )
            return message_id
            
        except Exception as e:
            logger.error(
                "error_saving_message",
                session_id=session_id,
                telegram_id=telegram_id,
                message_type=message_type,
                error=str(e),
                exc_info=True
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
            List[SupportMessage]: Список сообщений, отсортированных по времени создания
        """
        try:
            query = (
                select(SupportMessage)
                .where(SupportMessage.session_id == session_id)
                .order_by(SupportMessage.created_at.asc())
                .offset(offset)
            )
            
            if limit is not None:
                query = query.limit(limit)
            
            if self.session:
                result = await self.session.execute(query)
            else:
                db = get_database()
                async with db.session() as session:
                    result = await session.execute(query)
            
            messages = result.scalars().all()
            
            logger.debug(
                "messages_retrieved",
                count=len(messages),
                session_id=session_id
            )
            return list(messages)
            
        except Exception as e:
            logger.error(
                "error_getting_messages",
                session_id=session_id,
                error=str(e),
                exc_info=True
            )
            raise
    
    async def close_session(self, session_id: int) -> bool:
        """
        Закрывает сессию поддержки
        
        Args:
            session_id: ID сессии для закрытия
        
        Returns:
            bool: True если сессия успешно закрыта, False если сессия не найдена
        
        Raises:
            Exception: При ошибке закрытия сессии
        """
        try:
            query = select(SupportSession).where(SupportSession.id == session_id)
            
            if self.session:
                result = await self.session.execute(query)
                support_session = result.scalar_one_or_none()
                
                if support_session:
                    support_session.close()
                    await self.session.flush()
            else:
                db = get_database()
                async with db.session() as session:
                    result = await session.execute(query)
                    support_session = result.scalar_one_or_none()
                    
                    if support_session:
                        support_session.close()
            
            if support_session:
                logger.info("support_session_closed", session_id=session_id)
                return True
            else:
                logger.warning("session_not_found", session_id=session_id)
                return False
                
        except Exception as e:
            logger.error(
                "error_closing_session",
                session_id=session_id,
                error=str(e),
                exc_info=True
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
            List[SupportSession]: Список активных сессий, отсортированных по времени создания (новые первыми)
        """
        try:
            query = (
                select(SupportSession)
                .where(SupportSession.status == 'active')
                .order_by(desc(SupportSession.created_at))
                .offset(offset)
            )
            
            if limit is not None:
                query = query.limit(limit)
            
            if self.session:
                result = await self.session.execute(query)
            else:
                db = get_database()
                async with db.session() as session:
                    result = await session.execute(query)
            
            sessions = result.scalars().all()
            
            logger.debug("active_sessions_retrieved", count=len(sessions))
            return list(sessions)
            
        except Exception as e:
            logger.error(
                "error_getting_active_sessions",
                error=str(e),
                exc_info=True
            )
            raise
    
    async def get_session_by_id(self, session_id: int) -> Optional[SupportSession]:
        """
        Получает сессию по ID
        
        Args:
            session_id: ID сессии
        
        Returns:
            Optional[SupportSession]: Сессия или None если не найдена
        """
        try:
            query = (
                select(SupportSession)
                .where(SupportSession.id == session_id)
                .options(selectinload(SupportSession.messages))
            )
            
            if self.session:
                result = await self.session.execute(query)
            else:
                db = get_database()
                async with db.session() as session:
                    result = await session.execute(query)
            
            support_session = result.scalar_one_or_none()
            
            if support_session:
                logger.debug("session_retrieved", session_id=session_id)
            else:
                logger.debug("session_not_found", session_id=session_id)
            
            return support_session
            
        except Exception as e:
            logger.error(
                "error_getting_session_by_id",
                session_id=session_id,
                error=str(e),
                exc_info=True
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
            Optional[SupportSession]: Активная сессия или None если нет активной сессии
        """
        try:
            query = (
                select(SupportSession)
                .where(
                    and_(
                        SupportSession.telegram_id == telegram_id,
                        SupportSession.status == 'active'
                    )
                )
                .order_by(desc(SupportSession.created_at))
                .limit(1)
            )
            
            if self.session:
                result = await self.session.execute(query)
            else:
                db = get_database()
                async with db.session() as session:
                    result = await session.execute(query)
            
            support_session = result.scalar_one_or_none()
            
            if support_session:
                logger.debug(
                    "active_session_found",
                    telegram_id=telegram_id,
                    session_id=support_session.id
                )
            else:
                logger.debug("no_active_session", telegram_id=telegram_id)
            
            return support_session
            
        except Exception as e:
            logger.error(
                "error_getting_user_active_session",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            raise
    
    async def mark_message_delivered(self, message_id: int) -> bool:
        """
        Отмечает сообщение как доставленное
        
        Args:
            message_id: ID сообщения
        
        Returns:
            bool: True если сообщение успешно отмечено, False если не найдено
        """
        try:
            query = select(SupportMessage).where(SupportMessage.id == message_id)
            
            if self.session:
                result = await self.session.execute(query)
                message = result.scalar_one_or_none()
                
                if message:
                    message.mark_delivered()
                    await self.session.flush()
            else:
                db = get_database()
                async with db.session() as session:
                    result = await session.execute(query)
                    message = result.scalar_one_or_none()
                    
                    if message:
                        message.mark_delivered()
            
            if message:
                logger.debug("message_marked_delivered", message_id=message_id)
                return True
            else:
                logger.warning("message_not_found", message_id=message_id)
                return False
                
        except Exception as e:
            logger.error(
                "error_marking_message_delivered",
                message_id=message_id,
                error=str(e),
                exc_info=True
            )
            raise
