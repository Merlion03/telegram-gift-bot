"""
Обработчик данных доставки из WebApp.
Принимает данные доставки физических призов и сохраняет их в Google Sheets и PostgreSQL.
"""

import json
from typing import Optional
from datetime import datetime
from aiogram import Router
from aiogram.types import Message
from aiogram.fsm.context import FSMContext

from services.google_sheets_service import GoogleSheetsService
from services.prize_service import PrizeService
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from database.connection import get_database
from utils.retry import retry_with_backoff
from utils.logging_config import get_logger
from utils.keyboard_utils import remove_inline_keyboard_by_id
from keyboards.reply_keyboards import get_main_menu_keyboard
from constants import (
    ERROR_MISSING_PRIZE_ID,
    ERROR_INVALID_PRIZE_ID,
    ERROR_SERVICE_UNAVAILABLE,
    ERROR_PRIZE_NOT_FOUND,
    ERROR_SHEETS_SAVE_FAILED,
    ERROR_PROCESSING_DATA,
    ERROR_INVALID_JSON
)

logger = get_logger(__name__)

# Создаём router для обработчиков доставки
router = Router()


class DeliveryHandler:
    """Обработчик данных доставки из WebApp"""
    
    def __init__(
        self,
        sheets_service: GoogleSheetsService,
        prize_repository: PrizeRepository,
        prize_service: PrizeService,
        notification_service,
        session_manager=None
    ):
        """
        Инициализирует обработчик данных доставки
        
        Args:
            sheets_service: Сервис для работы с Google Sheets
            prize_repository: Repository для работы с призами
            prize_service: Сервис для валидации prize_id
            notification_service: Сервис для отправки уведомлений
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
        """
        self.sheets_service = sheets_service
        self.prize_repository = prize_repository
        self.prize_service = prize_service
        self.notification_service = notification_service
        self.session_manager = session_manager
        
        logger.info("delivery_handler_initialized")
    
    async def handle_delivery_data(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает данные доставки из WebApp
        
        Args:
            message: Сообщение с web_app_data
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
            
        Validates:
            Requirements 7.8 - Сохранение данных доставки в Prize_Table
            Requirements 7.9 - Отправка подтверждения получения данных
            Requirements 7.10 - Отображение главного меню после сохранения
            Requirements 7.11 - Сброс FSM состояния в default_state
        """
        telegram_id = message.from_user.id
        
        # Проверяем наличие web_app_data
        if not message.web_app_data:
            logger.warning(
                "no_web_app_data",
                telegram_id=telegram_id
            )
            return
        
        try:
            # Парсим JSON данные из WebApp
            data = json.loads(message.web_app_data.data)
            
            # Извлекаем prize_id
            prize_id = data.get('prize_id')
            if not prize_id:
                logger.error(
                    "missing_prize_id",
                    telegram_id=telegram_id
                )
                await self._send_error_message(
                    message,
                    ERROR_MISSING_PRIZE_ID,
                    state,
                    session_id
                )
                return
            
            # Логируем получение запроса (Requirement 1.1, 5.1)
            logger.info(
                "request_received",
                telegram_id=telegram_id,
                prize_id=prize_id
            )
            
            # Валидация prize_id - проверяем, что приз принадлежит пользователю
            try:
                is_valid = await self.prize_service.validate_prize_id(
                    prize_id=prize_id,
                    telegram_id=telegram_id
                )
                
                if not is_valid:
                    logger.error(
                        "invalid_prize_id_ownership",
                        telegram_id=telegram_id,
                        prize_id=prize_id
                    )
                    await self._send_error_message(
                        message,
                        ERROR_INVALID_PRIZE_ID,
                        state,
                        session_id
                    )
                    return
                    
            except DatabaseUnavailableError as e:
                logger.error(
                    "database_unavailable_during_prize_validation",
                    telegram_id=telegram_id,
                    prize_id=prize_id,
                    error=str(e)
                )
                await self._send_error_message(
                    message,
                    ERROR_SERVICE_UNAVAILABLE,
                    state,
                    session_id
                )
                return
            
            # Удаляем WebApp клавиатуру из сообщения (Requirement 3.1, 3.2, 3.3)
            data_state = await state.get_data()
            webapp_message_id = data_state.get('webapp_message_id')
            
            logger.info(
                "attempting_to_remove_webapp_keyboard",
                telegram_id=telegram_id,
                webapp_message_id=webapp_message_id,
                has_webapp_message_id=webapp_message_id is not None
            )
            
            if webapp_message_id:
                removal_success = await remove_inline_keyboard_by_id(
                    bot=message.bot,
                    chat_id=telegram_id,
                    message_id=webapp_message_id,
                    logger=logger
                )
                logger.info(
                    "webapp_keyboard_removal_result",
                    telegram_id=telegram_id,
                    webapp_message_id=webapp_message_id,
                    success=removal_success
                )
            else:
                logger.warning(
                    "webapp_message_id_not_found_in_state",
                    telegram_id=telegram_id,
                    state_data=data_state
                )
            
            # Получаем приз из БД по prize_id (row_id)
            try:
                prize = await self._find_prize_by_id(telegram_id, prize_id)
            except DatabaseUnavailableError as e:
                logger.error(
                    "database_unavailable_during_delivery",
                    telegram_id=telegram_id,
                    prize_id=prize_id,
                    error=str(e)
                )
                await self._send_error_message(
                    message,
                    ERROR_SERVICE_UNAVAILABLE,
                    state,
                    session_id
                )
                return
            
            if not prize:
                logger.error(
                    "prize_not_found_for_delivery",
                    telegram_id=telegram_id,
                    prize_id=prize_id
                )
                await self._send_error_message(
                    message,
                    ERROR_PRIZE_NOT_FOUND,
                    state,
                    session_id
                )
                return
            
            # Подготавливаем данные доставки
            delivery_data = {
                'last_name': data.get('last_name', ''),
                'first_name': data.get('first_name', ''),
                'patronymic': data.get('patronymic', ''),
                'city': data.get('city', ''),
                'street': data.get('street', ''),
                'house': data.get('house', ''),
                'apartment': data.get('apartment', ''),
                'phone': data.get('phone', ''),
                'comment': data.get('comment', '')
            }
            
            # Сохраняем данные в Google Sheets с retry логикой
            sheets_success = await self._save_to_sheets(
                prize.row_id,
                prize.sheet_name,
                delivery_data
            )
            
            if not sheets_success:
                # Критическая ошибка - не удалось записать в Sheets
                logger.error(
                    "failed_to_save_delivery_to_sheets",
                    telegram_id=telegram_id,
                    prize_id=prize_id,
                    row_id=prize.row_id,
                    sheet_name=prize.sheet_name
                )
                await self._send_error_message(
                    message,
                    ERROR_SHEETS_SAVE_FAILED,
                    state,
                    session_id
                )
                return
            
            # Обновляем данные в PostgreSQL
            postgres_success = await self._save_to_postgres(
                telegram_id,
                prize.code_word,
                delivery_data
            )
            
            if not postgres_success:
                # Логируем предупреждение, но не блокируем пользователя
                # Данные уже сохранены в Sheets, синхронизация подхватит их позже
                logger.warning(
                    "failed_to_save_delivery_to_postgres",
                    telegram_id=telegram_id,
                    code_word=prize.code_word
                )
            
            # Устанавливаем claimed_at для физического приза после успешного сохранения данных доставки
            try:
                from datetime import timezone
                claimed_at = datetime.now(timezone.utc)
                await self.prize_repository.mark_prize_claimed(
                    telegram_id=telegram_id,
                    code_word=prize.code_word,
                    claimed_at=claimed_at
                )
                logger.info(
                    "physical_prize_claimed_at_set",
                    telegram_id=telegram_id,
                    code_word=prize.code_word,
                    claimed_at=claimed_at.isoformat()
                )
            except Exception as e:
                logger.error(
                    "failed_to_set_claimed_at_for_physical_prize",
                    telegram_id=telegram_id,
                    code_word=prize.code_word,
                    error=str(e),
                    exc_info=True
                )
                # Не блокируем пользователя, данные уже сохранены
            
            # Отправляем уведомления через NotificationService (Requirement 1.2, 7.2, 7.3)
            notification_result = await self.notification_service.send_delivery_notifications(
                telegram_id=telegram_id,
                prize_id=prize_id,
                session_id=session_id
            )
            
            # Логируем результат отправки уведомлений (Requirement 5.1)
            logger.info(
                "delivery_notifications_sent",
                telegram_id=telegram_id,
                prize_id=prize_id,
                confirmation_sent=notification_result.confirmation_sent,
                main_menu_sent=notification_result.main_menu_sent,
                both_sent=notification_result.both_sent
            )
            
            # Сбрасываем FSM состояние (Requirement 7.4)
            await state.clear()
            
            logger.info(
                "fsm_state_cleared_after_delivery",
                telegram_id=telegram_id,
                prize_id=prize_id
            )
            
            logger.info(
                "delivery_data_saved_successfully",
                telegram_id=telegram_id,
                prize_id=prize_id,
                sheets_success=sheets_success,
                postgres_success=postgres_success
            )
        
        except json.JSONDecodeError as e:
            logger.error(
                "invalid_json_from_webapp",
                telegram_id=telegram_id,
                error=str(e)
            )
            await self._send_error_message(
                message,
                ERROR_INVALID_JSON,
                state,
                session_id
            )
        
        except Exception as e:
            logger.error(
                "delivery_data_processing_error",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            await self._send_error_message(
                message,
                ERROR_PROCESSING_DATA,
                state,
                session_id
            )
    
    async def _find_prize_by_id(
        self,
        telegram_id: int,
        prize_id: int
    ) -> Optional[object]:
        """
        Находит приз по telegram_id и prize_id (row_id)
        
        Args:
            telegram_id: Telegram ID пользователя
            prize_id: ID приза (row_id)
        
        Returns:
            Prize объект или None
            
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        try:
            # Используем репозиторий для поиска приза по row_id
            # Поскольку в PrizeRepository нет метода find_by_row_id, 
            # используем прямой запрос через контекст менеджер
            from sqlalchemy import select, and_
            from database.models.prize import Prize
            
            async with self.prize_repository._get_session_context() as session:
                stmt = select(Prize).where(
                    and_(
                        Prize.telegram_id == telegram_id,
                        Prize.row_id == prize_id,
                        Prize.prize_type == 'physical'
                    )
                )
                
                result = await session.execute(stmt)
                prize = result.scalar_one_or_none()
                
                return prize
        
        except DatabaseUnavailableError:
            # Пробрасываем исключение наверх
            logger.error(
                "database_unavailable_finding_prize",
                telegram_id=telegram_id,
                prize_id=prize_id
            )
            raise
        
        except Exception as e:
            logger.error(
                "error_finding_prize_by_id",
                telegram_id=telegram_id,
                prize_id=prize_id,
                error=str(e)
            )
            # Преобразуем в DatabaseUnavailableError для единообразной обработки
            raise DatabaseUnavailableError(f"Ошибка доступа к БД: {str(e)}")
    
    async def _save_to_sheets(
        self,
        row_id: int,
        sheet_name: str,
        delivery_data: dict
    ) -> bool:
        """
        Сохраняет данные доставки в Google Sheets с retry логикой
        
        Args:
            row_id: Номер строки в Google Sheets
            sheet_name: Название листа
            delivery_data: Данные доставки
        
        Returns:
            True если успешно сохранено
        """
        try:
            # Используем метод save_delivery_data с встроенной retry логикой
            success = await self.sheets_service.save_delivery_data(
                row_id=row_id,
                delivery_data=delivery_data,
                worksheet_name=sheet_name
            )
            
            return success
        
        except Exception as e:
            logger.error(
                "sheets_save_error",
                row_id=row_id,
                sheet_name=sheet_name,
                error=str(e)
            )
            return False
    
    async def _save_to_postgres(
        self,
        telegram_id: int,
        code_word: str,
        delivery_data: dict
    ) -> bool:
        """
        Обновляет данные доставки в PostgreSQL
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            delivery_data: Данные доставки
        
        Returns:
            True если успешно обновлено
        """
        try:
            # Используем переданный prize_repository
            success = await self.prize_repository.update_delivery_data(
                telegram_id=telegram_id,
                code_word=code_word,
                delivery_data=delivery_data
            )
            
            return success
        
        except Exception as e:
            logger.error(
                "postgres_save_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )
            return False
    
    async def _send_error_message(
        self,
        message: Message,
        error_text: str,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Отправляет сообщение об ошибке пользователю с главным меню
        
        Args:
            message: Сообщение пользователя
            error_text: Текст ошибки
            state: FSM контекст для сброса состояния
            session_id: ID сессии (опционально)
        """
        keyboard = get_main_menu_keyboard()
        await message.answer(error_text, reply_markup=keyboard)
        
        # Сбрасываем FSM состояние при ошибке
        await state.clear()
        
        # Сохраняем ответ бота
        if self.session_manager:
            await self.session_manager.save_bot_response_safe(
                session_id=session_id,
                message_text=error_text,
            )
