"""
Mixin: общие "back/help"-callback'и (несколько сценариев) и приватные
помощники, разделяющие повторяющуюся часть этих обработчиков.
"""

from typing import Optional

from aiogram.types import CallbackQuery
from aiogram.fsm.context import FSMContext

from constants import get_welcome_message
from keyboards.reply_keyboards import get_main_menu_keyboard
from utils.logging_config import get_logger

logger = get_logger(__name__)


class NavigationMixin:
    """Возврат в главное меню и запрос помощи из разных сценариев."""

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
