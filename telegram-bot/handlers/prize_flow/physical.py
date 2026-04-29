"""
Mixin: выдача физического приза (форма доставки через WebApp,
обработка кнопок "Получить приз"/"Назад" уже после сабмита формы).
"""

from typing import Optional

from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from aiogram.fsm.context import FSMContext

from constants import (
    PHYSICAL_PRIZE_BUTTON_TEXT,
    PHYSICAL_PRIZE_INSTRUCTION,
)
from fsm.states import PrizeFlowStates
from keyboards.reply_keyboards import get_main_menu_keyboard
from utils.logging_config import get_logger

logger = get_logger(__name__)


class PhysicalPrizeMixin:
    """Выдача физического приза + обработка возврата из формы доставки."""

    async def _send_physical_prize_form(
        self,
        message: Message,
        prize_result,
        state: FSMContext,
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        # Формируем URL для WebApp с prize_id
        webapp_url = f"{self.webapp_url.rstrip('/')}/webapp?prize_id={prize_result.prize_id}"

        # Создаём Inline-кнопку с WebApp
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="Заполнить форму",
                web_app=WebAppInfo(url=webapp_url),
                icon_custom_emoji_id="5274056321493115109",
                style="success",
            )]
        ])

        # Объединяем инструкцию и кнопку в одно сообщение
        combined_message = f"{PHYSICAL_PRIZE_INSTRUCTION}\n\n{PHYSICAL_PRIZE_BUTTON_TEXT}"

        # Отправляем сообщение с инструкцией и WebApp кнопкой
        sent_message = await message.answer(
            combined_message,
            reply_markup=keyboard,
            parse_mode='HTML',
        )

        # Обновляем URL с message_id для последующего удаления клавиатуры
        webapp_url_with_message = f"{webapp_url}&message_id={sent_message.message_id}"
        keyboard_updated = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="Заполнить форму",
                web_app=WebAppInfo(url=webapp_url_with_message),
                icon_custom_emoji_id="5274056321493115109",
                style="success",
            )]
        ])

        # Обновляем кнопку с message_id в URL
        await sent_message.edit_reply_markup(reply_markup=keyboard_updated)

        logger.info(
            "webapp_message_id_added_to_url",
            telegram_id=telegram_id,
            webapp_message_id=sent_message.message_id,
            prize_id=prize_result.prize_id,
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
            webapp_url=webapp_url,
        )

    async def handle_confirm_delivery_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        prize_id: int,
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        # Отправляем уведомления через NotificationService
        notification_result = await self.notification_service.send_delivery_notifications(
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id,
        )

        logger.info(
            "delivery_confirmation_resent",
            telegram_id=telegram_id,
            prize_id=prize_id,
            confirmation_sent=notification_result.confirmation_sent,
            main_menu_sent=notification_result.main_menu_sent,
        )

        # Подтверждаем callback
        await callback.answer("Данные отправлены!")

    async def handle_back_to_menu_callback(
        self,
        callback: CallbackQuery,
        state: FSMContext,
        prize_id: int,
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        # Удаляем inline-клавиатуру из сообщения
        await callback.message.edit_reply_markup(reply_markup=None)

        # Отправляем главное меню
        await callback.message.answer(
            text="Если вы выиграли в конкурсе и знаете кодовое слово, нажмите «Получить приз».",
            reply_markup=get_main_menu_keyboard(),
        )

        # Закрываем callback без всплывающего уведомления
        await callback.answer()

        # Сбрасываем FSM состояние
        await state.clear()

        logger.info(
            "back_to_menu_completed",
            telegram_id=telegram_id,
            prize_id=prize_id,
        )
