"""
Обработчик процесса получения приза (Prize Flow).

Управляет полным циклом получения приза от нажатия кнопки "Получить приз"
до выдачи промокода или заполнения формы доставки.

Включает:
- Проверку наличия пользователя в таблице призов
- Проверку и запрос GDPR согласия
- Валидацию кодового слова
- Выдачу цифровых призов (промокоды)
- Отправку формы для физических призов
"""

from typing import Optional
from aiogram import Router
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, ReplyKeyboardRemove
from aiogram.fsm.context import FSMContext

from services.prize_service import (
    PrizeService,
    PrizeStatus,
    MissingPromoCodeError
)
from database.repositories.prize_repository import DatabaseUnavailableError
from keyboards.reply_keyboards import (
    get_main_menu_keyboard,
    get_consent_keyboard,
    get_user_not_found_keyboard,
    get_invalid_code_keyboard
)
from fsm.states import PrizeFlowStates
from config import get_config
from utils.logging_config import get_logger
from utils.keyboard_utils import remove_inline_keyboard
from constants import (
    USER_NOT_FOUND_IN_PRIZE_TABLE,
    GDPR_CONSENT_REQUEST,
    CODE_WORD_REQUEST,
    CONSENT_BACK_MESSAGE,
    INVALID_CONSENT_RESPONSE,
    EMPTY_CODE_WORD_HINT,
    INVALID_CODE_WORD_ATTEMPT_1,
    INVALID_CODE_WORD_ATTEMPT_2,
    INVALID_CODE_WORD_ATTEMPT_3_PLUS,
    PRIZE_ERROR_AFTER_VALIDATION,
    MISSING_PROMO_CODE_ERROR,
    ERROR_SERVICE_UNAVAILABLE,
    get_digital_prize_congratulations,
    get_welcome_message,
    DIGITAL_PRIZE_DEFAULT_INSTRUCTIONS,
    DIGITAL_PRIZE_MENU_MESSAGE,
    PHYSICAL_PRIZE_INSTRUCTION,
    PHYSICAL_PRIZE_BUTTON_TEXT
)

logger = get_logger(__name__)

# Создаём router для обработчиков prize flow
router = Router()


class PrizeFlowHandler:
    """
    Обработчик процесса получения приза.
    
    Управляет FSM состояниями и координирует взаимодействие между
    пользователем, PrizeService и SessionManager для реализации
    полного цикла получения приза.
    
    Attributes:
        prize_service: Сервис для работы с призами и проверки данных
        session_manager: Менеджер сессий для сохранения истории диалогов
        webapp_url: URL WebApp для формы доставки физических призов
    """
    
    def __init__(
        self,
        prize_service: PrizeService,
        notification_service,
        session_manager=None,
        webapp_url: str = None
    ):
        """
        Инициализирует обработчик процесса получения приза.
        
        Args:
            prize_service: Сервис для работы с призами
            notification_service: Сервис для отправки уведомлений
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
            webapp_url: URL WebApp (если None, загружается из конфигурации)
        """
        self.prize_service = prize_service
        self.notification_service = notification_service
        self.session_manager = session_manager
        
        # Загружаем webapp_url из конфигурации или используем переданный
        if webapp_url is None:
            config = get_config()
            self.webapp_url = config.app.webapp_url
        else:
            self.webapp_url = webapp_url
        
        logger.info("prize_flow_handler_initialized")

    async def handle_get_prize_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает нажатие на inline кнопку "Получить приз".
        
        Args:
            callback: Callback от inline кнопки
            state: FSM контекст
            session_id: ID сессии из middleware (опционально)
        """
        # Удаляем inline-клавиатуру из сообщения
        await remove_inline_keyboard(callback, logger)
        
        # Просто вызываем start_prize_flow, передавая callback вместо message
        await self.start_prize_flow_from_callback(callback, state, session_id)
        
        # Подтверждаем callback
        await callback.answer()
    
    async def start_prize_flow_from_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Начинает процесс получения приза из callback.
        
        Args:
            callback: Callback от inline кнопки
            state: FSM контекст
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = callback.from_user.id
        username = callback.from_user.username or callback.from_user.first_name
        
        logger.info(
            "prize_flow_started",
            telegram_id=telegram_id,
            username=username,
            session_id=session_id
        )
        
        try:
            # Шаг 1: Проверка наличия пользователя в таблице
            user_exists = await self.prize_service.check_user_exists(telegram_id)
            
            if not user_exists:
                # Пользователь не найден в таблице призов
                await callback.message.answer(
                    USER_NOT_FOUND_IN_PRIZE_TABLE,
                    reply_markup=get_user_not_found_keyboard()
                )
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=USER_NOT_FOUND_IN_PRIZE_TABLE,
                    )
                logger.info(
                    "user_not_found_in_prize_table",
                    telegram_id=telegram_id
                )
                return
            
            # Шаг 2: Проверка GDPR согласия
            has_consent = await self.prize_service.check_gdpr_consent(telegram_id)
            
            if not has_consent:
                # Запрос согласия на обработку персональных данных
                await callback.message.answer(
                    GDPR_CONSENT_REQUEST,
                    reply_markup=get_consent_keyboard(),
                    parse_mode='HTML'
                )
                
                # Устанавливаем состояние ожидания согласия
                await state.set_state(PrizeFlowStates.waiting_for_consent)
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=GDPR_CONSENT_REQUEST,
                    )
                logger.info(
                    "gdpr_consent_requested",
                    telegram_id=telegram_id
                )
                return
            
            # Шаг 3: Запрос кодового слова (если согласие уже есть)
            await callback.message.answer(CODE_WORD_REQUEST)
            
            # Устанавливаем состояние ожидания кодового слова и сбрасываем счётчик попыток
            await state.set_state(PrizeFlowStates.waiting_for_code_word)
            await state.update_data(invalid_code_attempts=0, last_error_message_id=None)
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=CODE_WORD_REQUEST,
                )
            logger.info(
                "code_word_requested",
                telegram_id=telegram_id
            )
        
        except DatabaseUnavailableError as e:
            # Обработка недоступности БД
            await callback.message.answer(
                ERROR_SERVICE_UNAVAILABLE,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=ERROR_SERVICE_UNAVAILABLE,
                )
            logger.error(
                "database_unavailable_during_prize_flow",
                telegram_id=telegram_id,
                error=str(e)
            )

    async def start_prize_flow(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Начинает процесс получения приза.
        
        Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 11.1, 11.2
        
        Логика:
        1. Проверяет наличие пользователя в Prize_Table
        2. Если не найден - отправляет сообщение и главное меню
        3. Если найден - проверяет GDPR согласие
        4. Если согласия нет - запрашивает согласие
        5. Если согласие есть - запрашивает кодовое слово
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        username = message.from_user.username or message.from_user.first_name
        
        logger.info(
            "prize_flow_started",
            telegram_id=telegram_id,
            username=username,
            session_id=session_id
        )
        
        try:
            # Шаг 1: Проверка наличия пользователя в таблице
            user_exists = await self.prize_service.check_user_exists(telegram_id)
            
            if not user_exists:
                # Пользователь не найден в таблице призов
                await message.answer(
                    USER_NOT_FOUND_IN_PRIZE_TABLE,
                    reply_markup=get_user_not_found_keyboard()
                )
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=USER_NOT_FOUND_IN_PRIZE_TABLE,
                    )
                logger.info(
                    "user_not_found_in_prize_table",
                    telegram_id=telegram_id
                )
                return
            
            # Шаг 2: Проверка GDPR согласия
            has_consent = await self.prize_service.check_gdpr_consent(telegram_id)
            
            if not has_consent:
                # Запрос согласия на обработку персональных данных
                await message.answer(
                    GDPR_CONSENT_REQUEST,
                    reply_markup=get_consent_keyboard(),
                    parse_mode='HTML'
                )
                
                # Устанавливаем состояние ожидания согласия
                await state.set_state(PrizeFlowStates.waiting_for_consent)
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=GDPR_CONSENT_REQUEST,
                    )
                logger.info(
                    "gdpr_consent_requested",
                    telegram_id=telegram_id
                )
            else:
                # Согласие уже дано, запрашиваем кодовое слово
                await message.answer(
                    CODE_WORD_REQUEST,
                    reply_markup=ReplyKeyboardRemove()
                )
                
                # Устанавливаем состояние ожидания кодового слова и сбрасываем счётчик попыток
                await state.set_state(PrizeFlowStates.waiting_for_code_word)
                await state.update_data(invalid_code_attempts=0, last_error_message_id=None)
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=CODE_WORD_REQUEST,
                    )
                logger.info(
                    "code_word_requested",
                    telegram_id=telegram_id
                )
        
        except DatabaseUnavailableError as e:
            # Обработка недоступности БД
            error_text = (
                "⚠️ Сервис временно недоступен. Попробуйте позже."
            )
            
            await message.answer(
                error_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=error_text,
                )
            logger.error(
                "database_unavailable_in_prize_flow",
                telegram_id=telegram_id,
                error=str(e)
            )

    async def handle_consent_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает нажатие на inline кнопки согласия GDPR.
        
        Validates: Requirements 3.3, 3.4, 8.2, 8.3, 8.4, 11.1, 11.2
        
        Логика:
        1. Если "consent_agree" - сохраняет согласие и запрашивает кодовое слово
        2. Если "consent_back" - отображает главное меню и сбрасывает состояние
        
        Args:
            callback: Callback от inline кнопки
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = callback.from_user.id
        callback_data = callback.data
        
        # Удаляем inline-клавиатуру из сообщения
        await remove_inline_keyboard(callback, logger)
        
        logger.info(
            "handling_consent_callback",
            telegram_id=telegram_id,
            callback_data=callback_data,
            session_id=session_id
        )
        
        if callback_data == "consent_agree":
            # Пользователь дал согласие
            try:
                # Сохраняем согласие в БД
                await self.prize_service.save_gdpr_consent(telegram_id)
                
                # Запрашиваем кодовое слово
                await callback.message.answer(CODE_WORD_REQUEST)
                
                # Устанавливаем состояние ожидания кодового слова и сбрасываем счётчик попыток
                await state.set_state(PrizeFlowStates.waiting_for_code_word)
                await state.update_data(invalid_code_attempts=0, last_error_message_id=None)
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=CODE_WORD_REQUEST,
                    )
                logger.info(
                    "gdpr_consent_accepted",
                    telegram_id=telegram_id
                )
            
            except DatabaseUnavailableError as e:
                # Обработка недоступности БД
                await callback.message.answer(
                    ERROR_SERVICE_UNAVAILABLE,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сбрасываем состояние
                await state.clear()
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=ERROR_SERVICE_UNAVAILABLE,
                    )
                logger.error(
                    "database_unavailable_during_consent_save",
                    telegram_id=telegram_id,
                    error=str(e)
                )
        
        elif callback_data == "consent_back":
            # Пользователь отменил процесс
            await callback.message.answer(
                CONSENT_BACK_MESSAGE,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=CONSENT_BACK_MESSAGE,
                )
            logger.info(
                "consent_cancelled_by_user",
                telegram_id=telegram_id
            )
        
        # Подтверждаем callback
        await callback.answer()
    
    async def handle_consent_response(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает ответ на запрос согласия GDPR.
        
        Validates: Requirements 3.3, 3.4, 8.2, 8.3, 8.4, 11.1, 11.2
        
        Логика:
        1. Если "Согласен" - сохраняет согласие и запрашивает кодовое слово
        2. Если "Назад" - отображает главное меню и сбрасывает состояние
        
        Args:
            message: Сообщение от пользователя
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        response_text = message.text
        
        logger.info(
            "handling_consent_response",
            telegram_id=telegram_id,
            response=response_text,
            session_id=session_id
        )
        
        # Проверка корректности ответа
        if response_text not in ["✅ Согласен", "◀️ Назад"]:
            # Некорректный ответ - просим использовать кнопки
            await message.answer(
                INVALID_CONSENT_RESPONSE,
                reply_markup=get_consent_keyboard()
            )
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=INVALID_CONSENT_RESPONSE,
                )
            logger.warning(
                "invalid_consent_response",
                telegram_id=telegram_id,
                response=response_text
            )
            return
        
        if response_text == "✅ Согласен":
            # Пользователь дал согласие
            try:
                # Сохраняем согласие в БД
                await self.prize_service.save_gdpr_consent(telegram_id)
                
                # Запрашиваем кодовое слово
                await message.answer(
                    CODE_WORD_REQUEST,
                    reply_markup=ReplyKeyboardRemove()
                )
                
                # Устанавливаем состояние ожидания кодового слова и сбрасываем счётчик попыток
                await state.set_state(PrizeFlowStates.waiting_for_code_word)
                await state.update_data(invalid_code_attempts=0, last_error_message_id=None)
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=CODE_WORD_REQUEST,
                    )
                logger.info(
                    "gdpr_consent_accepted",
                    telegram_id=telegram_id
                )
            
            except DatabaseUnavailableError as e:
                # Обработка недоступности БД
                await message.answer(
                    ERROR_SERVICE_UNAVAILABLE,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сбрасываем состояние
                await state.clear()
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=ERROR_SERVICE_UNAVAILABLE,
                    )
                logger.error(
                    "database_unavailable_during_consent_save",
                    telegram_id=telegram_id,
                    error=str(e)
                )
        
        elif response_text == "◀️ Назад":
            # Пользователь отменил процесс
            await message.answer(
                CONSENT_BACK_MESSAGE,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=CONSENT_BACK_MESSAGE,
                )
            logger.info(
                "consent_cancelled_by_user",
                telegram_id=telegram_id
            )

    async def handle_code_word_input(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает ввод кодового слова.
        
        Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 11.1, 11.2
        
        Логика:
        1. Проверяет кодовое слово через PrizeService
        2. Если неверно - отправляет сообщение об ошибке, остаётся в состоянии
        3. Если верно и цифровой приз - выдаёт промокод
        4. Если верно и физический приз - отправляет WebApp кнопку
        
        Args:
            message: Сообщение от пользователя с кодовым словом
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        code_word = message.text.strip() if message.text else ""
        
        logger.info(
            "handling_code_word_input",
            telegram_id=telegram_id,
            code_word=code_word,
            session_id=session_id
        )
        
        # Валидация входных данных
        if not code_word or len(code_word) == 0:
            await message.answer(EMPTY_CODE_WORD_HINT)
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=EMPTY_CODE_WORD_HINT,
                )
            logger.warning(
                "empty_code_word",
                telegram_id=telegram_id
            )
            return
        
        try:
            # Валидация кодового слова
            is_valid = await self.prize_service.validate_code_word(telegram_id, code_word)
            
            if not is_valid:
                # Неверное кодовое слово - увеличиваем счётчик попыток
                state_data = await state.get_data()
                invalid_attempts = state_data.get('invalid_code_attempts', 0) + 1
                last_error_message_id = state_data.get('last_error_message_id')
                
                # Удаляем клавиатуру из предыдущего сообщения с ошибкой (если есть)
                if last_error_message_id:
                    try:
                        await message.bot.edit_message_reply_markup(
                            chat_id=message.chat.id,
                            message_id=last_error_message_id,
                            reply_markup=None
                        )
                    except Exception as e:
                        # Игнорируем ошибки (сообщение могло быть удалено)
                        logger.debug(
                            "failed_to_remove_keyboard_from_previous_message",
                            error=str(e)
                        )
                
                # Определяем текст сообщения в зависимости от количества попыток
                if invalid_attempts == 1:
                    error_message = INVALID_CODE_WORD_ATTEMPT_1
                elif invalid_attempts == 2:
                    error_message = INVALID_CODE_WORD_ATTEMPT_2
                else:  # 3 и более попыток
                    error_message = INVALID_CODE_WORD_ATTEMPT_3_PLUS
                
                # Определяем, показывать ли кнопку "Нужна помощь" (после 3-х попыток)
                show_help = invalid_attempts >= 3
                
                sent_message = await message.answer(
                    error_message,
                    reply_markup=get_invalid_code_keyboard(show_help=show_help)
                )
                
                # Сохраняем ID нового сообщения с кнопками
                await state.update_data(
                    invalid_code_attempts=invalid_attempts,
                    last_error_message_id=sent_message.message_id
                )
                
                # Сохраняем состояние waiting_for_code_word (остаёмся в нём)
                # Состояние уже установлено, ничего не меняем
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=error_message,
                    )
                logger.info(
                    "invalid_code_word",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    invalid_attempts=invalid_attempts
                )
                return
            
            # Кодовое слово верно - получаем данные приза
            prize_result = await self.prize_service.check_prize(telegram_id, code_word)
            
            if prize_result.status == PrizeStatus.DIGITAL:
                # Цифровой приз
                await self._send_digital_prize(message, prize_result, state, session_id)
            
            elif prize_result.status == PrizeStatus.PHYSICAL:
                # Физический приз - проверяем, заполнена ли форма доставки
                is_delivery_filled = await self.prize_service.check_delivery_data_filled(
                    telegram_id=telegram_id,
                    code_word=code_word
                )
                
                if is_delivery_filled:
                    # Форма уже заполнена - показываем кнопки действий
                    from keyboards.reply_keyboards import get_delivery_actions_keyboard
                    from constants import DELIVERY_DATA_ALREADY_FILLED
                    
                    keyboard = get_delivery_actions_keyboard(prize_result.prize_id, self.webapp_url)
                    await message.answer(
                        DELIVERY_DATA_ALREADY_FILLED,
                        reply_markup=keyboard,
                        parse_mode="HTML"
                    )
                    
                    # Сбрасываем состояние
                    await state.clear()
                    
                    # Сохраняем ответ бота
                    if self.session_manager:
                        await self.session_manager.save_bot_response_safe(
                            session_id=session_id,
                            message_text=DELIVERY_DATA_ALREADY_FILLED,
                        )
                    logger.info(
                        "delivery_data_already_filled_shown",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        prize_id=prize_result.prize_id
                    )
                else:
                    # Форма не заполнена - отправляем форму
                    await self._send_physical_prize_form(message, prize_result, state, session_id)
            
            else:
                # Приз не найден (не должно происходить после валидации)
                await message.answer(
                    PRIZE_ERROR_AFTER_VALIDATION,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сбрасываем состояние
                await state.clear()
                
                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=PRIZE_ERROR_AFTER_VALIDATION,
                    )
                logger.error(
                    "prize_not_found_after_validation",
                    telegram_id=telegram_id,
                    code_word=code_word
                )
        
        except DatabaseUnavailableError as e:
            # Обработка недоступности БД
            error_text = (
                "⚠️ Сервис временно недоступен. Попробуйте позже."
            )
            
            await message.answer(
                error_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=error_text,
                )
            logger.error(
                "database_unavailable_during_code_word_check",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )
        
        except MissingPromoCodeError as e:
            # Отсутствует промокод для цифрового приза
            await message.answer(
                MISSING_PROMO_CODE_ERROR,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=MISSING_PROMO_CODE_ERROR,
                )
            logger.error(
                "missing_promo_code_in_code_word_handler",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )

    async def _send_digital_prize(
        self,
        message: Message,
        prize_result,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Выдаёт цифровой приз (один или несколько промокодов).
        
        Validates: Requirements 3.1-3.7, 4.1-4.4, 5.1, 6.1-6.5, 7.4, 11.1, 11.2
        
        Логика:
        1. Парсит промокоды и инструкции из базы данных
        2. Форматирует сообщение с промокодами
        3. Отправляет сообщение(я) пользователю
        4. Отмечает приз как полученный (claimed_at)
        5. Отображает главное меню
        6. Сбрасывает FSM состояние
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с промокодом(ами)
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        from utils.promo_parser import PromoCodeParser
        from utils.message_formatter import MessageFormatter
        
        telegram_id = message.from_user.id
        
        logger.info(
            "sending_digital_prize",
            telegram_id=telegram_id,
            has_promo_code=bool(prize_result.promo_code),
            session_id=session_id
        )
        
        # Логирование сырых данных из базы для отладки
        logger.info(
            "raw_prize_data_from_db",
            telegram_id=telegram_id,
            promo_code_raw=prize_result.promo_code,
            instructions_raw=prize_result.instructions,
            promo_code_type=type(prize_result.promo_code).__name__,
            instructions_type=type(prize_result.instructions).__name__
        )
        
        # Парсинг промокодов и инструкций
        promo_codes = PromoCodeParser.parse_promo_codes(prize_result.promo_code)
        instructions = PromoCodeParser.parse_instructions(prize_result.instructions)
        
        # Логирование распарсенных данных
        logger.info(
            "parsed_promo_data",
            telegram_id=telegram_id,
            promo_codes_count=len(promo_codes),
            instructions_count=len(instructions),
            promo_codes=promo_codes,
            instructions=instructions
        )
        
        # Обработка случая отсутствия промокодов
        if not promo_codes:
            logger.error(
                "no_promo_codes_after_parsing",
                telegram_id=telegram_id,
                prize_id=getattr(prize_result, 'prize_id', None)
            )
            await message.answer(
                MISSING_PROMO_CODE_ERROR,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=MISSING_PROMO_CODE_ERROR,
                )
            return
        
        # Объединение данных
        promo_data_list = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id,
            prize_id=getattr(prize_result, 'prize_id', None)
        )
        
        # Логирование доступа к промокодам (Security Requirement 1, 3)
        for promo_code in promo_codes:
            logger.info(
                "promo_code_access",
                telegram_id=telegram_id,
                promo_code=promo_code,
                session_id=session_id,
                access_type="legitimate"
            )
        
        # Форматирование сообщения
        text = MessageFormatter.format_multiple_promos(
            promo_data_list=promo_data_list,
            telegram_id=telegram_id
        )
        
        # Разделение сообщения если необходимо
        message_parts = MessageFormatter.split_message_if_needed(text, telegram_id)
        
        # Отправка сообщения(й) с промокодами БЕЗ кнопки
        for i, part in enumerate(message_parts):
            await message.answer(
                part,
                parse_mode="HTML",
                reply_markup=None,
                disable_web_page_preview=True
            )
            
            # Сохранение ответа бота
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=part,
                )
        # Отправляем отдельное сообщение из /start с кнопкой "Получить приз"
        username = message.from_user.username or message.from_user.first_name
        welcome_text = get_welcome_message(username)
        
        await message.answer(
            welcome_text,
            reply_markup=get_main_menu_keyboard()
        )
        
        # Сохранение приветственного сообщения
        if self.session_manager:
            await self.session_manager.save_bot_response_safe(
                session_id=session_id,
                message_text=welcome_text,
            )
        # Сбрасываем FSM состояние
        await state.clear()
        
        logger.info(
            "digital_prize_sent",
            telegram_id=telegram_id,
            promo_count=len(promo_codes),
            message_parts=len(message_parts)
        )

    async def _send_physical_prize_form(
        self,
        message: Message,
        prize_result,
        state: FSMContext,
        session_id: Optional[int] = None
    ) -> None:
        """
        Отправляет форму для физического приза.
        
        Validates: Requirements 7.1, 7.2, 7.3, 11.1, 11.2
        
        Логика:
        1. Отправляет инструкцию по заполнению формы
        2. Отправляет WebApp кнопку с prize_id
        3. Устанавливает состояние waiting_for_delivery_data
        4. Отмечает приз как полученный (claimed_at)
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с prize_id
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "sending_physical_prize_form",
            telegram_id=telegram_id,
            prize_id=prize_result.prize_id,
            session_id=session_id
        )
        
        # Формируем URL для WebApp с prize_id
        webapp_url = f"{self.webapp_url.rstrip('/')}/webapp?prize_id={prize_result.prize_id}"
        
        # Создаём Inline-кнопку с WebApp
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="Заполнить форму", 
                web_app=WebAppInfo(url=webapp_url),
                icon_custom_emoji_id="5274056321493115109",
                style="success"
            )]
        ])
        
        # Объединяем инструкцию и кнопку в одно сообщение
        combined_message = f"{PHYSICAL_PRIZE_INSTRUCTION}\n\n{PHYSICAL_PRIZE_BUTTON_TEXT}"
        
        # Отправляем сообщение с инструкцией и WebApp кнопкой
        sent_message = await message.answer(
            combined_message,
            reply_markup=keyboard,
            parse_mode='HTML'
        )
        
        # Обновляем URL с message_id для последующего удаления клавиатуры
        webapp_url_with_message = f"{webapp_url}&message_id={sent_message.message_id}"
        keyboard_updated = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="Заполнить форму", 
                web_app=WebAppInfo(url=webapp_url_with_message),
                icon_custom_emoji_id="5274056321493115109",
                style="success"
            )]
        ])
        
        # Обновляем кнопку с message_id в URL
        await sent_message.edit_reply_markup(reply_markup=keyboard_updated)
        
        logger.info(
            "webapp_message_id_added_to_url",
            telegram_id=telegram_id,
            webapp_message_id=sent_message.message_id,
            prize_id=prize_result.prize_id
        )
        
        # Сохраняем объединённое сообщение
        if self.session_manager:
            await self.session_manager.save_bot_response_safe(
                session_id=session_id,
                message_text=combined_message,
            )
        # Устанавливаем состояние ожидания данных доставки
        await state.set_state(PrizeFlowStates.waiting_for_delivery_data)
        
        logger.info(
            "physical_prize_form_sent_successfully",
            telegram_id=telegram_id,
            prize_id=prize_result.prize_id,
            webapp_url=webapp_url
        )


    async def handle_confirm_delivery_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        prize_id: int,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает нажатие на кнопку "Получить приз" для уже заполненной формы.
        
        ПРИМЕЧАНИЕ: Этот метод больше не обрабатывает кнопку "Назад".
        Кнопка "Назад" теперь обрабатывается методом handle_back_to_menu_callback.
        
        Отправляет подтверждающее сообщение и главное меню.
        
        Args:
            callback: Callback от inline кнопки
            state: FSM контекст
            prize_id: ID приза
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = callback.from_user.id
        
        logger.info(
            "confirm_delivery_callback",
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        # Отправляем уведомления через NotificationService
        notification_result = await self.notification_service.send_delivery_notifications(
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        logger.info(
            "delivery_confirmation_resent",
            telegram_id=telegram_id,
            prize_id=prize_id,
            confirmation_sent=notification_result.confirmation_sent,
            main_menu_sent=notification_result.main_menu_sent
        )
        
        # Подтверждаем callback
        await callback.answer("Данные отправлены!")

    async def handle_back_to_menu_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        prize_id: int,
        session_id: Optional[int] = None
    ) -> None:
        """
        Обрабатывает нажатие на кнопку "Назад" в процессе получения физического приза.
        
        Возвращает пользователя в главное меню без отправки уведомлений о доставке.
        Используется когда пользователь уже заполнил форму доставки и хочет просто
        вернуться в меню, не подтверждая повторно отправку данных.
        
        Args:
            callback: Callback от inline кнопки
            state: FSM контекст
            prize_id: ID приза
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = callback.from_user.id
        
        logger.info(
            "back_to_menu_callback",
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        # Удаляем inline-клавиатуру из сообщения
        await callback.message.edit_reply_markup(reply_markup=None)
        
        # Отправляем главное меню
        await callback.message.answer(
            text="Если вы выиграли в конкурсе и знаете кодовое слово, нажмите «Получить приз».",
            reply_markup=get_main_menu_keyboard()
        )
        
        # Закрываем callback без всплывающего уведомления
        await callback.answer()
        
        # Сбрасываем FSM состояние
        await state.clear()
        
        logger.info(
            "back_to_menu_completed",
            telegram_id=telegram_id,
            prize_id=prize_id
        )


    async def _send_welcome_and_clear(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int],
        log_prefix: str,
    ) -> None:
        """
        Удаляет inline-клавиатуру, показывает приветствие с главным меню и
        сбрасывает FSM состояние. Используется обработчиками "Назад"
        в нескольких сценариях, где результат — возврат в главное меню.

        Args:
            callback: Callback от inline кнопки
            state: FSM контекст
            session_id: ID сессии из middleware (опционально)
            log_prefix: Префикс для лог-событий (например "back_to_main_menu")
        """
        telegram_id = callback.from_user.id
        username = callback.from_user.username or callback.from_user.first_name

        logger.info(
            f"{log_prefix}_callback",
            telegram_id=telegram_id,
            session_id=session_id,
        )

        await callback.message.edit_reply_markup(reply_markup=None)

        welcome_text = get_welcome_message(username)
        await callback.message.answer(
            text=welcome_text,
            reply_markup=get_main_menu_keyboard(),
        )

        if self.session_manager:
            await self.session_manager.save_bot_response_safe(
                session_id=session_id,
                message_text=welcome_text,
            )

        await callback.answer()
        await state.clear()

        logger.info(
            f"{log_prefix}_completed",
            telegram_id=telegram_id,
        )

    async def _send_help_and_clear(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int],
        log_prefix: str,
    ) -> None:
        """
        Удаляет inline-клавиатуру, отправляет сообщение о проверке,
        выставляет флаг ``help_needed`` для активной сессии пользователя
        и сбрасывает FSM состояние.

        Используется обработчиками "Нужна помощь" в нескольких сценариях.
        """
        telegram_id = callback.from_user.id

        logger.info(
            f"{log_prefix}_callback",
            telegram_id=telegram_id,
            session_id=session_id,
        )

        await callback.message.edit_reply_markup(reply_markup=None)

        help_message = "Всё проверю и вернусь. Пожалуйста, подождите."
        await callback.message.answer(text=help_message)

        if self.session_manager:
            await self.session_manager.save_bot_response_safe(
                session_id=session_id,
                message_text=help_message,
            )

            try:
                session = await self.session_manager.repository.get_user_active_session(telegram_id)

                if session:
                    session.set_help_needed(True)

                    async with self.session_manager.repository._get_session_context() as db_session:
                        db_session.add(session)
                        await db_session.flush()

                    logger.info(
                        f"Set help_needed flag for session {session.id}",
                        session_id=session.id,
                        telegram_id=telegram_id,
                    )
                else:
                    logger.warning(
                        "no_active_session_found_for_help_needed",
                        telegram_id=telegram_id,
                    )
            except Exception as e:
                logger.error(
                    "failed_to_set_help_needed_flag",
                    telegram_id=telegram_id,
                    error=str(e),
                )

        await callback.answer()
        await state.clear()

        logger.info(
            f"{log_prefix}_completed",
            telegram_id=telegram_id,
        )

    async def handle_back_to_main_menu_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None,
    ) -> None:
        """Обрабатывает кнопку "Назад", когда пользователь не найден в списке победителей."""
        await self._send_welcome_and_clear(
            callback, state, session_id, log_prefix="back_to_main_menu",
        )

    async def handle_need_help_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None,
    ) -> None:
        """Обрабатывает кнопку "Нужна помощь", когда пользователь не найден в списке победителей."""
        await self._send_help_and_clear(
            callback, state, session_id, log_prefix="need_help",
        )

    async def handle_invalid_code_back_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None,
    ) -> None:
        """Обрабатывает кнопку "Назад" после неправильного ввода кодового слова."""
        await self._send_welcome_and_clear(
            callback, state, session_id, log_prefix="invalid_code_back",
        )

    async def handle_invalid_code_help_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None,
    ) -> None:
        """Обрабатывает кнопку "Нужна помощь" после 3-х неправильных попыток ввода кодового слова."""
        await self._send_help_and_clear(
            callback, state, session_id, log_prefix="invalid_code_help",
        )
