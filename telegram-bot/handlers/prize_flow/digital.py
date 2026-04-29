"""
Mixin: выдача цифрового приза (промокоды + приветственное сообщение,
сброс FSM-состояния).
"""

from typing import Optional

from aiogram.types import Message
from aiogram.fsm.context import FSMContext

from constants import (
    MISSING_PROMO_CODE_ERROR,
    get_welcome_message,
)
from keyboards.reply_keyboards import get_main_menu_keyboard
from utils.logging_config import get_logger

logger = get_logger(__name__)


class DigitalPrizeMixin:
    """Выдача цифрового приза."""

    async def _send_digital_prize(
        self,
        message: Message,
        prize_result,
        state: FSMContext,
        session_id: Optional[int] = None,
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
            session_id=session_id,
        )

        # Логирование сырых данных из базы для отладки
        logger.info(
            "raw_prize_data_from_db",
            telegram_id=telegram_id,
            promo_code_raw=prize_result.promo_code,
            instructions_raw=prize_result.instructions,
            promo_code_type=type(prize_result.promo_code).__name__,
            instructions_type=type(prize_result.instructions).__name__,
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
            instructions=instructions,
        )

        # Обработка случая отсутствия промокодов
        if not promo_codes:
            logger.error(
                "no_promo_codes_after_parsing",
                telegram_id=telegram_id,
                prize_id=getattr(prize_result, 'prize_id', None),
            )
            await message.answer(
                MISSING_PROMO_CODE_ERROR,
                reply_markup=get_main_menu_keyboard(),
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
            prize_id=getattr(prize_result, 'prize_id', None),
        )

        # Логирование доступа к промокодам (Security Requirement 1, 3)
        for promo_code in promo_codes:
            logger.info(
                "promo_code_access",
                telegram_id=telegram_id,
                promo_code=promo_code,
                session_id=session_id,
                access_type="legitimate",
            )

        # Форматирование сообщения
        text = MessageFormatter.format_multiple_promos(
            promo_data_list=promo_data_list,
            telegram_id=telegram_id,
        )

        # Разделение сообщения если необходимо
        message_parts = MessageFormatter.split_message_if_needed(text, telegram_id)

        # Отправка сообщения(й) с промокодами БЕЗ кнопки
        for i, part in enumerate(message_parts):
            await message.answer(
                part,
                parse_mode="HTML",
                reply_markup=None,
                disable_web_page_preview=True,
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
            reply_markup=get_main_menu_keyboard(),
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
            message_parts=len(message_parts),
        )
