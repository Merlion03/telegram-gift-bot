"""
SessionManager - сервис управления жизненным циклом сессий диалогов

Отвечает за:
- Создание и получение сессий
- Преобразование Chat_Session в Support_Session
- Закрытие неактивных сессий
- Сохранение сообщений пользователей и бота
"""
import structlog
from typing import Optional
from typing import Optional
from datetime import datetime, timezone, timedelta

from database.repository import SupportRepository
from database.models import SupportSession


logger = structlog.get_logger(__name__)


class SessionManager:
    """
    Сервис управления сессиями диалогов
    
    Предоставляет высокоуровневые методы для работы с жизненным циклом сессий:
    - Автоматическое создание сессий при первом сообщении
    - Переиспользование существующих активных сессий
    - Преобразование обычных диалогов в сессии поддержки
    - Закрытие неактивных сессий
    - Сохранение сообщений с правильной типизацией
    """
    
    def __init__(self, repository: SupportRepository):
        """
        Инициализирует SessionManager
        
        Args:
            repository: Репозиторий для работы с БД
        """
        self.repository = repository
        logger.debug("session_manager_initialized")

    async def get_or_create_session(
        self,
        telegram_id: int,
        session_type: str = 'chat',
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        username: Optional[str] = None
    ) -> int:
        """
        Получает активную сессию или создаёт новую с информацией о пользователе
        
        Validates: Requirements 1.1, 1.2
        
        Логика:
        1. Проверяет наличие активной сессии для пользователя
        2. Если есть - возвращает её ID
        3. Если нет - создаёт новую сессию с указанным типом и информацией о пользователе
        
        Args:
            telegram_id: Telegram ID пользователя
            session_type: Тип сессии ('chat' или 'support')
            first_name: Имя пользователя из Telegram (опционально)
            last_name: Фамилия пользователя из Telegram (опционально)
            username: Username пользователя из Telegram (опционально)
            
        Returns:
            ID сессии (существующей или новой)
            
        Raises:
            ValueError: Если session_type невалиден
            Exception: При ошибке работы с БД
        """
        if session_type not in ('chat', 'support'):
            raise ValueError(
                f"Invalid session_type: {session_type}. "
                "Must be 'chat' or 'support'"
            )
        
        try:
            # Проверяем наличие активной сессии
            existing_session = await self.repository.get_user_active_session(telegram_id)
            
            if existing_session:
                logger.debug(
                    "reusing_existing_session",
                    session_id=existing_session.id,
                    telegram_id=telegram_id
                )
                return existing_session.id
            
            # Создаём новую сессию с информацией о пользователе
            session_id = await self.repository.create_session(
                telegram_id=telegram_id,
                first_name=first_name,
                last_name=last_name,
                username=username
            )
            
            # Если нужен тип 'support', обновляем его
            if session_type == 'support':
                await self.convert_to_support_session(session_id)
            
            logger.info(
                "new_session_created",
                session_id=session_id,
                telegram_id=telegram_id,
                session_type=session_type,
                user_name=f"{first_name or ''} {last_name or ''}".strip() or None
            )
            
            return session_id
            
        except Exception as e:
            logger.error(
                "error_get_or_create_session",
                telegram_id=telegram_id,
                session_type=session_type,
                error=str(e),
                exc_info=True
            )
            raise

    async def convert_to_support_session(self, session_id: int) -> bool:
        """
        Преобразует обычную Chat_Session в Support_Session
        
        Validates: Requirements 1.5, 4.3, 6.4
        
        Используется когда:
        - Пользователь нажимает кнопку "Позвать человека"
        - Администратор отправляет первое сообщение в обычный диалог
        
        Args:
            session_id: ID сессии для преобразования
            
        Returns:
            True если успешно преобразовано, False если сессия не найдена
            
        Raises:
            Exception: При ошибке работы с БД
        """
        try:
            # Получаем сессию
            session = await self.repository.get_session_by_id(session_id)
            
            if not session:
                logger.warning(
                    "session_not_found_for_conversion",
                    session_id=session_id
                )
                return False
            
            # Проверяем, не является ли уже сессией поддержки
            if session.is_support_session():
                logger.debug(
                    "session_already_support_type",
                    session_id=session_id
                )
                return True
            
            # Преобразуем в Support_Session
            session.convert_to_support()
            
            logger.info(
                "session_converted_to_support",
                session_id=session_id,
                telegram_id=session.telegram_id
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "error_converting_session",
                session_id=session_id,
                error=str(e),
                exc_info=True
            )
            raise

    async def close_inactive_sessions(self, inactive_hours: int = 24) -> int:
        """
        Закрывает сессии без активности более указанного времени
        
        Validates: Requirements 5.1
        
        Логика:
        1. Получает все активные сессии
        2. Для каждой проверяет время последней активности (поле last_activity)
        3. Закрывает сессии с активностью старше inactive_hours
        
        Args:
            inactive_hours: Количество часов неактивности (по умолчанию 24)
            
        Returns:
            Количество закрытых сессий
            
        Raises:
            Exception: При ошибке работы с БД
        """
        try:
            # Получаем все активные сессии
            active_sessions = await self.repository.get_active_sessions()
            
            closed_count = 0
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=inactive_hours)
            
            for session in active_sessions:
                # Используем поле last_activity из модели SupportSession
                # Если last_activity не установлен, используем created_at
                last_activity = session.last_activity if hasattr(session, 'last_activity') and session.last_activity else session.created_at
                
                # Проверяем, неактивна ли сессия
                if last_activity < cutoff_time:
                    success = await self.repository.close_session(session.id)
                    if success:
                        closed_count += 1
                        logger.info(
                            "inactive_session_closed",
                            session_id=session.id,
                            telegram_id=session.telegram_id,
                            last_activity=last_activity.isoformat()
                        )
            
            logger.info(
                "inactive_sessions_cleanup_completed",
                closed_count=closed_count,
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

    async def save_user_message(
        self,
        session_id: int,
        telegram_id: int,
        message_text: str,
        file_id: Optional[str] = None
    ) -> int:
        """
        Сохраняет сообщение пользователя
        
        Validates: Requirements 2.1, 2.2, 2.3
        
        Args:
            session_id: ID сессии
            telegram_id: Telegram ID пользователя
            message_text: Текст сообщения
            file_id: ID файла для медиа-контента (опционально)
            
        Returns:
            ID созданного сообщения
            
        Raises:
            Exception: При ошибке сохранения
        """
        try:
            message_id = await self.repository.save_message(
                session_id=session_id,
                telegram_id=telegram_id,
                message_type='from_user',
                message_text=message_text,
                file_id=file_id
            )
            
            logger.debug(
                "user_message_saved",
                message_id=message_id,
                session_id=session_id,
                telegram_id=telegram_id,
                has_file=file_id is not None
            )
            
            return message_id
            
        except Exception as e:
            logger.error(
                "error_saving_user_message",
                session_id=session_id,
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            raise

    async def save_bot_message(
        self,
        session_id: int,
        message_text: str
    ) -> int:
        """
        Сохраняет ответ бота
        
        Validates: Requirements 2.5
        
        Args:
            session_id: ID сессии
            message_text: Текст ответа бота
            
        Returns:
            ID созданного сообщения
            
        Raises:
            Exception: При ошибке сохранения
        """
        try:
            # Для сообщений бота используем telegram_id = 0 (системный)
            message_id = await self.repository.save_message(
                session_id=session_id,
                telegram_id=0,  # Системный ID для бота
                message_type='from_bot',
                message_text=message_text,
                file_id=None
            )
            
            logger.debug(
                "bot_message_saved",
                message_id=message_id,
                session_id=session_id
            )
            
            return message_id
            
        except Exception as e:
            logger.error(
                "error_saving_bot_message",
                session_id=session_id,
                error=str(e),
                exc_info=True
            )
            raise
