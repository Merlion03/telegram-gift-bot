"""
StateResetService - сервис для сброса состояния пользователя

Отвечает за:
- Сброс FSM состояния пользователя
- Программный вызов обработчика команды /start
- Сохранение команды /start в историю сообщений
- Логирование всех операций сброса состояния
"""
import structlog
from typing import Dict, Any, Optional
from aiogram import Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.types import Message, User, Chat

from handlers.common_handler import CommonHandler
from services.session_manager import SessionManager


logger = structlog.get_logger(__name__)


class StateResetService:
    """
    Сервис для сброса состояния пользователя и отправки команды /start
    
    Validates: Requirements 3.1, 3.2, 3.3, 3.4, 5.2, 5.3, 5.4, 9.1, 9.2, 9.3
    """
    
    def __init__(
        self,
        bot: Bot,
        common_handler: CommonHandler,
        session_manager: SessionManager,
        storage
    ):
        """
        Инициализирует StateResetService
        
        Args:
            bot: Экземпляр aiogram Bot для создания фейкового Message
            common_handler: Обработчик команды /start
            session_manager: Менеджер сессий для сохранения команды /start
            storage: FSM storage для получения FSMContext
        """
        self.bot = bot
        self.common_handler = common_handler
        self.session_manager = session_manager
        self.storage = storage
        logger.debug("state_reset_service_initialized")
    
    async def reset_user_state(
        self,
        telegram_id: int,
        session_id: int,
        admin_id: str
    ) -> Dict[str, Any]:
        """
        Сбрасывает состояние пользователя и отправляет команду /start
        
        Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 5.2, 5.3, 5.4, 9.1, 9.2, 9.3
        
        Порядок операций:
        1. Валидация входных данных
        2. Получение активной сессии
        3. Очистка FSM состояния через FSMContext.clear()
        4. Сброс флага help_needed (если сессия существует)
        5. Сохранение команды /start в БД с типом from_user
        6. Программный вызов CommonHandler.handle_start()
        7. Логирование операции
        
        Args:
            telegram_id: Telegram ID пользователя
            session_id: ID сессии поддержки
            admin_id: ID администратора, инициировавшего сброс
        
        Returns:
            Dict с результатом операции:
            {
                "success": True,
                "message": "State reset successfully",
                "telegram_id": int,
                "session_id": int
            }
        
        Raises:
            ValueError: Если telegram_id или session_id невалидны
            RuntimeError: Если не удалось сбросить состояние
        """
        # Валидация входных данных
        if not telegram_id or not isinstance(telegram_id, int):
            raise ValueError("telegram_id must be a valid integer")
        
        if not session_id or not isinstance(session_id, int):
            raise ValueError("session_id must be a valid integer")
        
        logger.info(
            "state_reset_started",
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Получение активной сессии для сброса флага help_needed
        user_session = None
        try:
            user_session = await self.session_manager.repository.get_user_active_session(telegram_id)
            if not user_session:
                logger.warning(
                    "no_active_session_for_reset",
                    telegram_id=telegram_id,
                    session_id=session_id
                )
        except Exception as e:
            logger.error(
                "error_getting_session_for_reset",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            # Продолжаем выполнение даже если не удалось получить сессию
        
        help_needed_reset = False
        
        try:
            # Шаг 1: Очистка FSM состояния
            await self._clear_fsm_state(telegram_id)
            
            # Шаг 2: Сброс флага help_needed (если сессия существует)
            if user_session:
                try:
                    user_session.reset_help_needed()
                    # Изменения сохраняются автоматически при commit в контексте repository
                    # Но нужно явно сохранить через контекст БД
                    await self._save_session_changes(user_session)
                    help_needed_reset = True
                    logger.info(
                        "help_needed_flag_reset",
                        telegram_id=telegram_id,
                        session_id=user_session.id
                    )
                except Exception as e:
                    logger.error(
                        "help_needed_reset_error",
                        telegram_id=telegram_id,
                        session_id=user_session.id,
                        error=str(e),
                        exc_info=True
                    )
                    # Не прерываем выполнение - пользователь должен вернуться в главное меню
            
            # Шаг 3: Сохранение команды /start в БД
            await self._save_start_command(telegram_id, session_id)
            
            # Шаг 4: Программный вызов обработчика /start
            await self._invoke_start_handler(telegram_id, session_id)
            
            # Шаг 5: Логирование успешной операции
            self._log_reset_operation(
                telegram_id=telegram_id,
                session_id=session_id,
                admin_id=admin_id,
                success=True,
                help_needed_reset=help_needed_reset
            )
            
            return {
                "success": True,
                "message": "State reset successfully",
                "telegram_id": telegram_id,
                "session_id": session_id
            }
        
        except Exception as e:
            # Логирование ошибки
            self._log_reset_operation(
                telegram_id=telegram_id,
                session_id=session_id,
                admin_id=admin_id,
                success=False,
                help_needed_reset=help_needed_reset,
                error=str(e)
            )
            
            logger.error(
                "state_reset_failed",
                telegram_id=telegram_id,
                session_id=session_id,
                admin_id=admin_id,
                error=str(e),
                exc_info=True
            )
            
            raise RuntimeError(f"Failed to reset user state: {str(e)}")
    
    async def _clear_fsm_state(self, telegram_id: int) -> None:
        """
        Очищает FSM состояние пользователя
        
        Validates: Requirements 3.2, 5.2, 5.3
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Raises:
            RuntimeError: Если не удалось очистить FSM состояние
        """
        try:
            # Создаём StorageKey для пользователя
            # Используем telegram_id как user_id и chat_id
            storage_key = StorageKey(
                bot_id=self.bot.id,
                user_id=telegram_id,
                chat_id=telegram_id
            )
            
            # Получаем FSMContext для пользователя
            fsm_context = FSMContext(
                storage=self.storage,
                key=storage_key
            )
            
            # Очищаем состояние
            await fsm_context.clear()
            
            logger.debug(
                "fsm_state_cleared",
                telegram_id=telegram_id
            )
        
        except Exception as e:
            logger.error(
                "fsm_clear_error",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            raise RuntimeError(f"Failed to clear FSM state: {str(e)}")
    
    async def _save_start_command(self, telegram_id: int, session_id: int) -> None:
        """
        Сохраняет команду /start в БД с типом from_user
        
        Validates: Requirements 3.4
        
        Args:
            telegram_id: Telegram ID пользователя
            session_id: ID сессии
        
        Raises:
            RuntimeError: Если не удалось сохранить команду
        """
        try:
            await self.session_manager.save_user_message(
                session_id=session_id,
                telegram_id=telegram_id,
                message_text="/start",
                file_id=None
            )
            
            logger.debug(
                "start_command_saved",
                telegram_id=telegram_id,
                session_id=session_id
            )
        
        except Exception as e:
            logger.error(
                "save_start_command_error",
                telegram_id=telegram_id,
                session_id=session_id,
                error=str(e),
                exc_info=True
            )
            # Не прерываем операцию - команда уже обработана
            # Просто логируем ошибку
    
    async def _invoke_start_handler(self, telegram_id: int, session_id: int) -> None:
        """
        Программно вызывает обработчик команды /start
        
        Validates: Requirements 3.3, 5.4
        
        Args:
            telegram_id: Telegram ID пользователя
            session_id: ID сессии
        
        Raises:
            RuntimeError: Если не удалось вызвать обработчик
        """
        try:
            # Создаём фейковый Message объект
            fake_message = self._create_fake_message(telegram_id)
            
            # Вызываем обработчик /start
            # ВАЖНО: Передаём bot явно, чтобы handler мог использовать bot.send_message()
            await self.common_handler.handle_start(fake_message, session_id, bot=self.bot)
            
            logger.debug(
                "start_handler_invoked",
                telegram_id=telegram_id,
                session_id=session_id
            )
        
        except Exception as e:
            logger.error(
                "start_handler_invocation_error",
                telegram_id=telegram_id,
                session_id=session_id,
                error=str(e),
                exc_info=True
            )
            raise RuntimeError(f"Failed to invoke start handler: {str(e)}")
    
    async def _save_session_changes(self, session: 'SupportSession') -> None:
        """
        Сохраняет изменения в объекте сессии в БД
        
        Args:
            session: Объект SupportSession с изменениями
        
        Raises:
            RuntimeError: Если не удалось сохранить изменения
        """
        try:
            # Используем контекст repository для сохранения изменений
            async with self.session_manager.repository._get_session_context() as db_session:
                # Добавляем объект в сессию БД (merge для обновления существующего)
                db_session.add(session)
                # Commit выполняется автоматически при выходе из контекста
            
            logger.debug(
                "session_changes_saved",
                session_id=session.id,
                telegram_id=session.telegram_id
            )
        
        except Exception as e:
            logger.error(
                "session_save_error",
                session_id=session.id,
                telegram_id=session.telegram_id,
                error=str(e),
                exc_info=True
            )
            raise RuntimeError(f"Failed to save session changes: {str(e)}")
    
    def _create_fake_message(self, telegram_id: int) -> Message:
        """
        Создаёт фейковый Message объект для вызова обработчика
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            Фейковый Message объект
        """
        # Создаём минимальный Message объект с необходимыми полями
        fake_user = User(
            id=telegram_id,
            is_bot=False,
            first_name="User"
        )
        
        fake_chat = Chat(
            id=telegram_id,
            type="private"
        )
        
        # Создаём Message с bot в конструкторе (Message - frozen pydantic модель)
        fake_message = Message(
            message_id=0,
            date=0,
            chat=fake_chat,
            from_user=fake_user,
            text="/start",
            bot=self.bot
        )
        
        return fake_message
    
    def _log_reset_operation(
        self,
        telegram_id: int,
        session_id: int,
        admin_id: str,
        success: bool,
        help_needed_reset: bool = False,
        error: Optional[str] = None
    ) -> None:
        """
        Логирует операцию сброса состояния
        
        Validates: Requirements 9.1, 9.2, 9.3
        
        Args:
            telegram_id: Telegram ID пользователя
            session_id: ID сессии
            admin_id: ID администратора
            success: Успешность операции
            help_needed_reset: Был ли сброшен флаг help_needed
            error: Текст ошибки (если есть)
        """
        log_data = {
            "telegram_id": telegram_id,
            "session_id": session_id,
            "admin_id": admin_id,
            "success": success,
            "help_needed_reset": help_needed_reset
        }
        
        if error:
            log_data["error"] = error
        
        if success:
            logger.info("state_reset_completed", **log_data)
        else:
            logger.error("state_reset_failed", **log_data)
