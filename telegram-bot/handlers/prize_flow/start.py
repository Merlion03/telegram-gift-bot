"""
Mixin: запуск процесса получения приза (точка входа Prize Flow).

Содержит обработчики:

* ``handle_get_prize_callback`` — кнопка "Получить приз" из главного меню.
* ``start_prize_flow_from_callback`` — общий путь из callback'а.
* ``start_prize_flow``               — общий путь из текстового сообщения.
"""

from typing import Optional

from aiogram.types import Message, CallbackQuery, ReplyKeyboardRemove
from aiogram.fsm.context import FSMContext

from constants import (
    USER_NOT_FOUND_IN_PRIZE_TABLE,
    GDPR_CONSENT_REQUEST,
    CODE_WORD_REQUEST,
    ERROR_SERVICE_UNAVAILABLE,
)
from database.repositories.prize_repository import DatabaseUnavailableError
from fsm.states import PrizeFlowStates
from keyboards.reply_keyboards import (
    get_consent_keyboard,
    get_main_menu_keyboard,
    get_user_not_found_keyboard,
)
from utils.keyboard_utils import remove_inline_keyboard
from utils.logging_config import get_logger

logger = get_logger(__name__)


class StartFlowMixin:
    """Точка входа в Prize Flow."""

    async def handle_get_prize_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None,
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
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        try:
            # Шаг 1: Проверка наличия пользователя в таблице
            user_exists = await self.prize_service.check_user_exists(telegram_id)

            if not user_exists:
                # Пользователь не найден в таблице призов
                await callback.message.answer(
                    USER_NOT_FOUND_IN_PRIZE_TABLE,
                    reply_markup=get_user_not_found_keyboard(),
                )

                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=USER_NOT_FOUND_IN_PRIZE_TABLE,
                    )
                logger.info(
                    "user_not_found_in_prize_table",
                    telegram_id=telegram_id,
                )
                return

            # Шаг 2: Проверка GDPR согласия
            has_consent = await self.prize_service.check_gdpr_consent(telegram_id)

            if not has_consent:
                # Запрос согласия на обработку персональных данных
                await callback.message.answer(
                    GDPR_CONSENT_REQUEST,
                    reply_markup=get_consent_keyboard(),
                    parse_mode='HTML',
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
                    telegram_id=telegram_id,
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
                telegram_id=telegram_id,
            )

        except DatabaseUnavailableError as e:
            # Обработка недоступности БД
            await callback.message.answer(
                ERROR_SERVICE_UNAVAILABLE,
                reply_markup=get_main_menu_keyboard(),
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
                error=str(e),
            )

    async def start_prize_flow(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        try:
            # Шаг 1: Проверка наличия пользователя в таблице
            user_exists = await self.prize_service.check_user_exists(telegram_id)

            if not user_exists:
                # Пользователь не найден в таблице призов
                await message.answer(
                    USER_NOT_FOUND_IN_PRIZE_TABLE,
                    reply_markup=get_user_not_found_keyboard(),
                )

                # Сохраняем ответ бота
                if self.session_manager:
                    await self.session_manager.save_bot_response_safe(
                        session_id=session_id,
                        message_text=USER_NOT_FOUND_IN_PRIZE_TABLE,
                    )
                logger.info(
                    "user_not_found_in_prize_table",
                    telegram_id=telegram_id,
                )
                return

            # Шаг 2: Проверка GDPR согласия
            has_consent = await self.prize_service.check_gdpr_consent(telegram_id)

            if not has_consent:
                # Запрос согласия на обработку персональных данных
                await message.answer(
                    GDPR_CONSENT_REQUEST,
                    reply_markup=get_consent_keyboard(),
                    parse_mode='HTML',
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
                    telegram_id=telegram_id,
                )
            else:
                # Согласие уже дано, запрашиваем кодовое слово
                await message.answer(
                    CODE_WORD_REQUEST,
                    reply_markup=ReplyKeyboardRemove(),
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
                    telegram_id=telegram_id,
                )

        except DatabaseUnavailableError as e:
            # Обработка недоступности БД
            error_text = (
                "⚠️ Сервис временно недоступен. Попробуйте позже."
            )

            await message.answer(
                error_text,
                reply_markup=get_main_menu_keyboard(),
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
                error=str(e),
            )
