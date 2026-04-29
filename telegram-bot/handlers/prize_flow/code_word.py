"""
Mixin: обработка ввода кодового слова и маршрутизация на нужный
сценарий выдачи приза (digital / physical).
"""

from typing import Optional

from aiogram.types import Message
from aiogram.fsm.context import FSMContext

from constants import (
    EMPTY_CODE_WORD_HINT,
    INVALID_CODE_WORD_ATTEMPT_1,
    INVALID_CODE_WORD_ATTEMPT_2,
    INVALID_CODE_WORD_ATTEMPT_3_PLUS,
    MISSING_PROMO_CODE_ERROR,
    PRIZE_ERROR_AFTER_VALIDATION,
)
from database.repositories.prize_repository import DatabaseUnavailableError
from keyboards.reply_keyboards import (
    get_invalid_code_keyboard,
    get_main_menu_keyboard,
)
from services.prize_service import MissingPromoCodeError, PrizeStatus
from utils.logging_config import get_logger

logger = get_logger(__name__)


class CodeWordMixin:
    """Ввод кодового слова и переход к выдаче приза."""

    async def handle_code_word_input(
        self,
        message: Message,
        state: FSMContext,
        session_id: Optional[int] = None,
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
            session_id=session_id,
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
                telegram_id=telegram_id,
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
                            reply_markup=None,
                        )
                    except Exception as e:
                        # Игнорируем ошибки (сообщение могло быть удалено)
                        logger.debug(
                            "failed_to_remove_keyboard_from_previous_message",
                            error=str(e),
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
                    reply_markup=get_invalid_code_keyboard(show_help=show_help),
                )

                # Сохраняем ID нового сообщения с кнопками
                await state.update_data(
                    invalid_code_attempts=invalid_attempts,
                    last_error_message_id=sent_message.message_id,
                )

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
                    invalid_attempts=invalid_attempts,
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
                    code_word=code_word,
                )

                if is_delivery_filled:
                    # Форма уже заполнена - показываем кнопки действий
                    from keyboards.reply_keyboards import get_delivery_actions_keyboard
                    from constants import DELIVERY_DATA_ALREADY_FILLED

                    keyboard = get_delivery_actions_keyboard(prize_result.prize_id, self.webapp_url)
                    await message.answer(
                        DELIVERY_DATA_ALREADY_FILLED,
                        reply_markup=keyboard,
                        parse_mode="HTML",
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
                        prize_id=prize_result.prize_id,
                    )
                else:
                    # Форма не заполнена - отправляем форму
                    await self._send_physical_prize_form(message, prize_result, state, session_id)

            else:
                # Приз не найден (не должно происходить после валидации)
                await message.answer(
                    PRIZE_ERROR_AFTER_VALIDATION,
                    reply_markup=get_main_menu_keyboard(),
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
                    code_word=code_word,
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
                "database_unavailable_during_code_word_check",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
            )

        except MissingPromoCodeError as e:
            # Отсутствует промокод для цифрового приза
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
            logger.error(
                "missing_promo_code_in_code_word_handler",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
            )
