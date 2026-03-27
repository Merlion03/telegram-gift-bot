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
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.fsm.context import FSMContext

from services.prize_service import (
    PrizeService,
    PrizeStatus,
    MissingPromoCodeError
)
from database.repositories.prize_repository import DatabaseUnavailableError
from keyboards.reply_keyboards import (
    get_main_menu_keyboard,
    get_consent_keyboard
)
from fsm.states import PrizeFlowStates
from config import get_config
from utils.logging_config import get_logger

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
        session_manager=None,
        webapp_url: str = None
    ):
        """
        Инициализирует обработчик процесса получения приза.
        
        Args:
            prize_service: Сервис для работы с призами
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
            webapp_url: URL WebApp (если None, загружается из конфигурации)
        """
        self.prize_service = prize_service
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
                not_found_text = (
                    "❌ Ваш аккаунт отсутствует в списке победителей.\n\n"
                    "Попробуйте зайти с другого аккаунта или обратитесь в поддержку."
                )
                
                await callback.message.answer(
                    not_found_text,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=not_found_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
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
                consent_text = (
                    "Для получения приза необходимо ваше согласие на обработку персональных данных.\n\n"
                    "Нажмите кнопку ниже, если вы согласны."
                )
                
                await callback.message.answer(
                    consent_text,
                    reply_markup=get_consent_keyboard()
                )
                
                # Устанавливаем состояние ожидания согласия
                await state.set_state(PrizeFlowStates.waiting_for_consent)
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=consent_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
                        )
                
                logger.info(
                    "gdpr_consent_requested",
                    telegram_id=telegram_id
                )
                return
            
            # Шаг 3: Запрос кодового слова (если согласие уже есть)
            code_word_text = (
                "Введите кодовое слово для получения приза:"
            )
            
            await callback.message.answer(code_word_text)
            
            # Устанавливаем состояние ожидания кодового слова
            await state.set_state(PrizeFlowStates.waiting_for_code_word)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=code_word_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
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
            
            await callback.message.answer(
                error_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=error_text
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
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
                not_found_text = (
                    "❌ Ваш аккаунт отсутствует в списке победителей.\n\n"
                    "Попробуйте зайти с другого аккаунта или обратитесь в поддержку."
                )
                
                await message.answer(
                    not_found_text,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=not_found_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
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
                consent_text = (
                    "Для получения приза необходимо ваше согласие на обработку персональных данных.\n\n"
                    "Нажмите кнопку ниже, если вы согласны."
                )
                
                await message.answer(
                    consent_text,
                    reply_markup=get_consent_keyboard()
                )
                
                # Устанавливаем состояние ожидания согласия
                await state.set_state(PrizeFlowStates.waiting_for_consent)
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=consent_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
                        )
                
                logger.info(
                    "gdpr_consent_requested",
                    telegram_id=telegram_id
                )
            else:
                # Согласие уже дано, запрашиваем кодовое слово
                code_word_text = (
                    "Введите кодовое слово для получения приза:"
                )
                
                await message.answer(
                    code_word_text,
                    reply_markup=remove_keyboard()
                )
                
                # Устанавливаем состояние ожидания кодового слова
                await state.set_state(PrizeFlowStates.waiting_for_code_word)
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=code_word_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
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
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=error_text
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
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
                code_word_text = (
                    "Введите кодовое слово для получения приза:"
                )
                
                await callback.message.answer(code_word_text)
                
                # Устанавливаем состояние ожидания кодового слова
                await state.set_state(PrizeFlowStates.waiting_for_code_word)
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=code_word_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
                        )
                
                logger.info(
                    "gdpr_consent_accepted",
                    telegram_id=telegram_id
                )
            
            except DatabaseUnavailableError as e:
                # Обработка недоступности БД
                error_text = (
                    "⚠️ Сервис временно недоступен. Попробуйте позже."
                )
                
                await callback.message.answer(
                    error_text,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сбрасываем состояние
                await state.clear()
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=error_text
                        )
                    except Exception as save_error:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(save_error)
                        )
                
                logger.error(
                    "database_unavailable_during_consent_save",
                    telegram_id=telegram_id,
                    error=str(e)
                )
        
        elif callback_data == "consent_back":
            # Пользователь отменил процесс
            back_text = (
                "Вы вернулись в главное меню."
            )
            
            await callback.message.answer(
                back_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=back_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
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
            hint_text = (
                "⚠️ Пожалуйста, используйте кнопки ниже для ответа."
            )
            
            await message.answer(
                hint_text,
                reply_markup=get_consent_keyboard()
            )
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=hint_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
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
                code_word_text = (
                    "Введите кодовое слово для получения приза:"
                )
                
                await message.answer(
                    code_word_text,
                    reply_markup=remove_keyboard()
                )
                
                # Устанавливаем состояние ожидания кодового слова
                await state.set_state(PrizeFlowStates.waiting_for_code_word)
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=code_word_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
                        )
                
                logger.info(
                    "gdpr_consent_accepted",
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
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=error_text
                        )
                    except Exception as save_error:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(save_error)
                        )
                
                logger.error(
                    "database_unavailable_during_consent_save",
                    telegram_id=telegram_id,
                    error=str(e)
                )
        
        elif response_text == "◀️ Назад":
            # Пользователь отменил процесс
            back_text = (
                "Вы вернулись в главное меню."
            )
            
            await message.answer(
                back_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=back_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
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
            hint_text = (
                "⚠️ Пожалуйста, введите кодовое слово текстом."
            )
            
            await message.answer(hint_text)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=hint_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
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
                # Неверное кодовое слово
                invalid_text = (
                    "❌ Кодовое слово введено неверно. Попробуйте ещё раз."
                )
                
                await message.answer(invalid_text)
                
                # Сохраняем состояние waiting_for_code_word (остаёмся в нём)
                # Состояние уже установлено, ничего не меняем
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=invalid_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
                        )
                
                logger.info(
                    "invalid_code_word",
                    telegram_id=telegram_id,
                    code_word=code_word
                )
                return
            
            # Кодовое слово верно - получаем данные приза
            prize_result = await self.prize_service.check_prize(telegram_id, code_word)
            
            if prize_result.status == PrizeStatus.DIGITAL:
                # Цифровой приз
                await self._send_digital_prize(message, prize_result, state, session_id)
            
            elif prize_result.status == PrizeStatus.PHYSICAL:
                # Физический приз
                await self._send_physical_prize_form(message, prize_result, state, session_id)
            
            else:
                # Приз не найден (не должно происходить после валидации)
                error_text = (
                    "❌ Произошла ошибка при получении приза. Обратитесь в поддержку."
                )
                
                await message.answer(
                    error_text,
                    reply_markup=get_main_menu_keyboard()
                )
                
                # Сбрасываем состояние
                await state.clear()
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=error_text
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
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
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=error_text
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
                    )
            
            logger.error(
                "database_unavailable_during_code_word_check",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )
        
        except MissingPromoCodeError as e:
            # Отсутствует промокод для цифрового приза
            error_text = (
                "❌ Произошла ошибка. Обратитесь в поддержку."
            )
            
            await message.answer(
                error_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=error_text
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
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
        Выдаёт цифровой приз (промокод).
        
        Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 11.1, 11.2
        
        Логика:
        1. Отправляет поздравление с промокодом
        2. Отправляет инструкцию по использованию
        3. Отмечает приз как полученный (claimed_at)
        4. Отображает главное меню
        5. Сбрасывает FSM состояние
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с промокодом
            state: FSM контекст для управления состояниями
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "sending_digital_prize",
            telegram_id=telegram_id,
            has_promo_code=bool(prize_result.promo_code),
            session_id=session_id
        )
        
        # Дополнительная проверка наличия промокода
        if not prize_result.promo_code:
            error_text = (
                "❌ Произошла ошибка. Обратитесь в поддержку."
            )
            
            await message.answer(
                error_text,
                reply_markup=get_main_menu_keyboard()
            )
            
            # Сбрасываем состояние
            await state.clear()
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=error_text
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
            
            logger.error(
                "missing_promo_code_in_send_digital_prize",
                telegram_id=telegram_id
            )
            return
        
        # Формируем поздравительное сообщение с промокодом
        congratulations_text = (
            f"🎉 Поздравляем! Ваш промокод: {prize_result.promo_code}"
        )
        
        # Логирование доступа к промокоду (Security Requirement 1, 3)
        logger.info(
            "promo_code_access",
            telegram_id=telegram_id,
            promo_code=prize_result.promo_code,
            session_id=session_id,
            access_type="legitimate"
        )
        
        await message.answer(congratulations_text)
        
        # Сохраняем поздравление
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=congratulations_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        # Отправляем инструкцию по использованию
        instructions_text = prize_result.instructions or "Используйте промокод при оформлении заказа"
        
        await message.answer(instructions_text)
        
        # Сохраняем инструкцию
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=instructions_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        # Отображаем главное меню
        menu_text = "Выберите действие:"
        
        await message.answer(
            menu_text,
            reply_markup=get_main_menu_keyboard()
        )
        
        # Сохраняем сообщение с меню
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=menu_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        # Сбрасываем FSM состояние
        await state.clear()
        
        logger.info(
            "digital_prize_sent_successfully",
            telegram_id=telegram_id,
            promo_code=prize_result.promo_code
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
        
        # Отправляем инструкцию по заполнению формы
        instruction_text = (
            "🎉 Поздравляем! Вы выиграли физический приз.\n\n"
            "Пожалуйста, укажите данные для доставки, нажав на кнопку ниже."
        )
        
        await message.answer(instruction_text)
        
        # Сохраняем инструкцию
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=instruction_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        # Формируем URL для WebApp с prize_id
        webapp_url = f"{self.webapp_url}?prize_id={prize_result.prize_id}"
        
        # Создаём Inline-кнопку с WebApp
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="📦 Указать данные доставки",
                web_app=WebAppInfo(url=webapp_url)
            )]
        ])
        
        button_text = "Нажмите кнопку для заполнения формы:"
        
        await message.answer(
            button_text,
            reply_markup=keyboard
        )
        
        # Сохраняем сообщение с кнопкой
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=button_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        # Устанавливаем состояние ожидания данных доставки
        await state.set_state(PrizeFlowStates.waiting_for_delivery_data)
        
        logger.info(
            "physical_prize_form_sent_successfully",
            telegram_id=telegram_id,
            prize_id=prize_result.prize_id,
            webapp_url=webapp_url
        )
