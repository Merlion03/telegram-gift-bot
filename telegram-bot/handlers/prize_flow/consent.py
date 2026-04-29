"""
Mixin: обработка GDPR согласия (как через inline-кнопки, так и через
текстовый ответ пользователя).
"""

from typing import Optional

from aiogram.types import Message, CallbackQuery, ReplyKeyboardRemove
from aiogram.fsm.context import FSMContext

from constants import (
    CODE_WORD_REQUEST,
    CONSENT_BACK_MESSAGE,
    ERROR_SERVICE_UNAVAILABLE,
    INVALID_CONSENT_RESPONSE,
)
from database.repositories.prize_repository import DatabaseUnavailableError
from fsm.states import PrizeFlowStates
from keyboards.reply_keyboards import (
    get_consent_keyboard,
    get_main_menu_keyboard,
)
from utils.keyboard_utils import remove_inline_keyboard
from utils.logging_config import get_logger

logger = get_logger(__name__)


class ConsentMixin:
    """Согласие на обработку персональных данных (GDPR)."""

    async def handle_consent_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        session_id: Optional[int] = None,
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
            session_id=session_id,
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
                    telegram_id=telegram_id,
                )

            except DatabaseUnavailableError as e:
                # Обработка недоступности БД
                await callback.message.answer(
                    ERROR_SERVICE_UNAVAILABLE,
                    reply_markup=get_main_menu_keyboard(),
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
                    error=str(e),
                )

        elif callback_data == "consent_back":
            # Пользователь отменил процесс
            await callback.message.answer(
                CONSENT_BACK_MESSAGE,
                reply_markup=get_main_menu_keyboard(),
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
                telegram_id=telegram_id,
            )

        # Подтверждаем callback
        await callback.answer()

    async def handle_consent_response(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        # Проверка корректности ответа
        if response_text not in ["✅ Согласен", "◀️ Назад"]:
            # Некорректный ответ - просим использовать кнопки
            await message.answer(
                INVALID_CONSENT_RESPONSE,
                reply_markup=get_consent_keyboard(),
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
                response=response_text,
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
                    "gdpr_consent_accepted",
                    telegram_id=telegram_id,
                )

            except DatabaseUnavailableError as e:
                # Обработка недоступности БД
                await message.answer(
                    ERROR_SERVICE_UNAVAILABLE,
                    reply_markup=get_main_menu_keyboard(),
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
                    error=str(e),
                )

        elif response_text == "◀️ Назад":
            # Пользователь отменил процесс
            await message.answer(
                CONSENT_BACK_MESSAGE,
                reply_markup=get_main_menu_keyboard(),
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
                telegram_id=telegram_id,
            )
