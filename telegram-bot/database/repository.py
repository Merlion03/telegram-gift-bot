"""
Repository слой для работы с базой данных поддержки
Инкапсулирует всю логику доступа к данным
"""
import structlog
from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database.models import SupportSession, SupportMessage
from database.base_repository import BaseRepository


logger = structlog.get_logger(__name__)


def sanitize_text(text: str) -> str:
    """
    Удаляет NUL bytes из текста для совместимости с PostgreSQL
    
    Args:
        text: Исходный текст
    
    Returns:
        str: Очищенный текст без NUL bytes
    """
    if text is None:
        return None
    return text.replace('\x00', '')


class SupportRepository(BaseRepository):
    """
    Repository для работы с сессиями и сообщениями поддержки
    
    Предоставляет высокоуровневые методы для:
    - Создания и управления сессиями
    - Сохранения и получения сообщений
    - Получения активных сессий
    """
    
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
            int: ID созданной сессии
        
        Raises:
            Exception: При ошибке создания сессии
        """
        try:
            new_session = SupportSession(
                telegram_id=telegram_id,
                status='active',
                first_name=first_name,
                last_name=last_name,
                username=username
            )
            
            async with self._get_session_context() as session:
                session.add(new_session)
                await session.flush()
                session_id = new_session.id
                # Commit выполняется автоматически в контексте менеджере
            
            logger.info(
                "support_session_created",
                session_id=session_id,
                telegram_id=telegram_id,
                user_name=f"{first_name or ''} {last_name or ''}".strip() or None
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
        if message_type not in ('from_user', 'from_support', 'from_bot'):
            raise ValueError(
                f"Invalid message_type: {message_type}. "
                "Must be 'from_user', 'from_support', or 'from_bot'"
            )
        
        try:
            # Санитизация текста от NUL bytes для совместимости с PostgreSQL
            sanitized_text = sanitize_text(message_text)
            sanitized_file_id = sanitize_text(file_id) if file_id else None
            
            new_message = SupportMessage(
                session_id=session_id,
                telegram_id=telegram_id,
                message_type=message_type,
                message_text=sanitized_text,
                file_id=sanitized_file_id
            )
            
            async with self._get_session_context() as session:
                session.add(new_message)
                await session.flush()
                message_id = new_message.id
                # Commit выполняется автоматически в контексте менеджере
            
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
            
            async with self._get_session_context() as session:
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
            
            async with self._get_session_context() as session:
                result = await session.execute(query)
                support_session = result.scalar_one_or_none()
                
                if support_session:
                    support_session.close()
                    # Commit выполняется автоматически в контексте менеджере
            
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
            
            async with self._get_session_context() as session:
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
            
            async with self._get_session_context() as session:
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
            
            async with self._get_session_context() as session:
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
            
            async with self._get_session_context() as session:
                result = await session.execute(query)
                message = result.scalar_one_or_none()
                
                if message:
                    message.mark_delivered()
                    # Commit выполняется автоматически в контексте менеджере
            
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
    
    async def update_session_type(
        self,
        session_id: int,
        session_type: str
    ) -> bool:
        """
        Обновляет тип сессии
        
        Args:
            session_id: ID сессии
            session_type: Новый тип ('chat' или 'support')
        
        Returns:
            bool: True если успешно обновлено, False если сессия не найдена
        
        Raises:
            ValueError: Если session_type невалиден
            Exception: При ошибке обновления
        """
        if session_type not in ('chat', 'support'):
            raise ValueError(
                f"Invalid session_type: {session_type}. "
                "Must be 'chat' or 'support'"
            )
        
        try:
            query = select(SupportSession).where(SupportSession.id == session_id)
            
            async with self._get_session_context() as session:
                result = await session.execute(query)
                support_session = result.scalar_one_or_none()
                
                if support_session:
                    support_session.session_type = session_type
                    # Commit выполняется автоматически в контексте менеджере
            
            if support_session:
                logger.info(
                    "session_type_updated",
                    session_id=session_id,
                    new_type=session_type
                )
                return True
            else:
                logger.warning("session_not_found", session_id=session_id)
                return False
                
        except Exception as e:
            logger.error(
                "error_updating_session_type",
                session_id=session_id,
                session_type=session_type,
                error=str(e),
                exc_info=True
            )
            raise
    
    async def get_all_sessions(
        self,
        status: Optional[str] = None,
        session_type: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[SupportSession]:
        """
        Получает список всех сессий с фильтрацией
        
        Args:
            status: Фильтр по статусу ('active' или 'closed'), None = все
            session_type: Фильтр по типу ('chat' или 'support'), None = все
            limit: Максимальное количество сессий (None = дефолтный лимит 50)
            offset: Смещение для пагинации
        
        Returns:
            List[SupportSession]: Список сессий, отсортированных по времени последнего сообщения (новые первыми)
        
        Raises:
            ValueError: Если status или session_type невалидны
            Exception: При ошибке получения сессий
        """
        if status is not None and status not in ('active', 'closed'):
            raise ValueError(
                f"Invalid status: {status}. "
                "Must be 'active', 'closed', or None"
            )
        
        if session_type is not None and session_type not in ('chat', 'support'):
            raise ValueError(
                f"Invalid session_type: {session_type}. "
                "Must be 'chat', 'support', or None"
            )
        
        try:
            # Применяем дефолтный лимит 50 если не указан
            effective_limit = limit if limit is not None else 50
            
            # Базовый запрос с eager loading сообщений для определения времени последнего сообщения
            query = (
                select(SupportSession)
                .options(selectinload(SupportSession.messages))
            )
            
            # Применяем фильтры
            conditions = []
            if status is not None:
                conditions.append(SupportSession.status == status)
            if session_type is not None:
                conditions.append(SupportSession.session_type == session_type)
            
            if conditions:
                query = query.where(and_(*conditions))
            
            # Сортировка по времени создания (будет уточнена после загрузки)
            query = query.order_by(desc(SupportSession.created_at))
            
            # Пагинация
            query = query.offset(offset).limit(effective_limit)
            
            async with self._get_session_context() as session:
                result = await session.execute(query)
                sessions = result.scalars().all()
            
            # Сортируем по времени последнего сообщения
            sessions_list = list(sessions)
            
            def get_sort_key(session):
                """Получает ключ для сортировки, приводя все datetime к UTC"""
                from datetime import timezone
                
                # Получаем время создания сессии
                session_time = session.created_at
                if session_time.tzinfo is None:
                    session_time = session_time.replace(tzinfo=timezone.utc)
                
                # Получаем время последнего сообщения
                if session.messages:
                    message_times = []
                    for msg in session.messages:
                        msg_time = msg.created_at
                        if msg_time.tzinfo is None:
                            msg_time = msg_time.replace(tzinfo=timezone.utc)
                        message_times.append(msg_time)
                    return max(message_times)
                else:
                    return session_time
            
            sessions_list.sort(key=get_sort_key, reverse=True)
            
            logger.debug(
                "all_sessions_retrieved",
                count=len(sessions_list),
                status=status,
                session_type=session_type
            )
            return sessions_list
            
        except Exception as e:
            logger.error(
                "error_getting_all_sessions",
                status=status,
                session_type=session_type,
                error=str(e),
                exc_info=True
            )
            raise
    
    async def close_sessions_by_inactivity(
        self,
        inactive_hours: int
    ) -> int:
        """
        Закрывает сессии без активности более указанного времени
        
        Args:
            inactive_hours: Количество часов неактивности
        
        Returns:
            int: Количество закрытых сессий
        
        Raises:
            ValueError: Если inactive_hours невалиден
            Exception: При ошибке закрытия сессий
        """
        if inactive_hours <= 0:
            raise ValueError(
                f"Invalid inactive_hours: {inactive_hours}. "
                "Must be positive integer"
            )
        
        try:
            from datetime import timedelta
            
            # Вычисляем пороговое время
            threshold_time = datetime.now(timezone.utc) - timedelta(hours=inactive_hours)
            
            # Получаем все активные сессии с сообщениями
            query = (
                select(SupportSession)
                .where(SupportSession.status == 'active')
                .options(selectinload(SupportSession.messages))
            )
            
            async with self._get_session_context() as session:
                result = await session.execute(query)
                sessions_list = result.scalars().all()
                
                closed_count = 0
                for support_session in sessions_list:
                    last_activity = self._get_last_activity_time_sync(support_session)
                    
                    if last_activity < threshold_time:
                        support_session.close()
                        closed_count += 1
                
                # Commit выполняется автоматически в контексте менеджере
            
            logger.info(
                "inactive_sessions_closed",
                count=closed_count,
                inactive_hours=inactive_hours
            )
            return closed_count
            
        except Exception as e:
            logger.error(
                "error_closing_inactive_sessions",
                inactive_hours=inactive_hours,
                error=str(e),
                exc_info=True
            )
            raise
    
    def _get_last_activity_time_sync(
        self,
        session: SupportSession
    ) -> datetime:
        """
        Синхронный вспомогательный метод для получения времени последней активности
        
        Args:
            session: Объект сессии с загруженными сообщениями
        
        Returns:
            datetime: Время последнего сообщения или время создания сессии
        """
        if session.messages:
            return max(message.created_at for message in session.messages)
        return session.created_at
    
    async def get_session_last_activity(
        self,
        session_id: int
    ) -> Optional[datetime]:
        """
        Получает время последней активности в сессии
        
        Args:
            session_id: ID сессии
        
        Returns:
            Optional[datetime]: Время последнего сообщения или время создания сессии,
                               None если сессия не найдена
        
        Raises:
            Exception: При ошибке получения времени активности
        """
        try:
            query = (
                select(SupportSession)
                .where(SupportSession.id == session_id)
                .options(selectinload(SupportSession.messages))
            )
            
            async with self._get_session_context() as session:
                result = await session.execute(query)
                support_session = result.scalar_one_or_none()
            
            if not support_session:
                logger.debug("session_not_found", session_id=session_id)
                return None
            
            last_activity = self._get_last_activity_time_sync(support_session)
            
            logger.debug(
                "session_last_activity_retrieved",
                session_id=session_id,
                last_activity=last_activity
            )
            return last_activity
            
        except Exception as e:
            logger.error(
                "error_getting_session_last_activity",
                session_id=session_id,
                error=str(e),
                exc_info=True
            )
            raise
    
    async def _get_last_activity_time(
        self,
        session: SupportSession
    ) -> datetime:
        """
        Вспомогательный метод для получения времени последней активности
        
        Args:
            session: Объект сессии с загруженными сообщениями
        
        Returns:
            datetime: Время последнего сообщения или время создания сессии
        """
        if session.messages:
            return max(message.created_at for message in session.messages)
        return session.created_at