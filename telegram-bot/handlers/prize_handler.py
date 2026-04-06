"""
Обработчик проверки призов.
Обрабатывает кодовые слова и выдаёт призы пользователям.
"""

from typing import Optional
from aiogram import Router
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import Command

from services.prize_service import PrizeService, PrizeStatus, MissingPromoCodeError
from config import get_config
from utils.logging_config import get_logger
from utils.promo_parser import PromoCodeParser
from utils.message_formatter import MessageFormatter
from keyboards.reply_keyboards import get_main_menu_keyboard
from constants import (
    PRIZE_NOT_FOUND_RESPONSE,
    PRIZE_CHECK_ERROR,
    PRIZE_MISSING_PROMO_CODE_SUPPORT,
    MISSING_PROMO_CODE_ERROR,
    get_digital_prize_message,
    PHYSICAL_PRIZE_CONGRATULATIONS
)

logger = get_logger(__name__)

# Создаём router для обработчиков призов
router = Router()


class PrizeHandler:
    """Обработчик проверки призов"""
    
    def __init__(self, prize_service: PrizeService, webapp_url: str = None, session_manager=None):
        """
        Инициализирует обработчик призов
        
        Args:
            prize_service: Сервис для работы с призами
            webapp_url: URL WebApp (если None, загружается из конфигурации)
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
        """
        self.prize_service = prize_service
        self.session_manager = session_manager
        
        # Загружаем webapp_url из конфигурации или используем переданный
        if webapp_url is None:
            config = get_config()
            self.webapp_url = config.app.webapp_url
        else:
            self.webapp_url = webapp_url
        
        logger.info("prize_handler_initialized")
    
    async def handle_code_word(self, message: Message, code_word: str, session_id: Optional[int] = None) -> None:
        """
        Обрабатывает кодовое слово от пользователя
        
        Args:
            message: Сообщение от пользователя с кодовым словом
            code_word: Кодовое слово для проверки
            session_id: ID сессии из middleware (опционально)
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "handling_code_word",
            telegram_id=telegram_id,
            code_word=code_word
        )
        
        try:
            # Проверка приза через сервис
            prize_result = await self.prize_service.check_prize(telegram_id, code_word)
            
            if prize_result.status == PrizeStatus.NOT_FOUND:
                await message.answer(PRIZE_NOT_FOUND_RESPONSE)
                
                # Сохраняем ответ бота
                if self.session_manager and session_id:
                    try:
                        await self.session_manager.save_bot_message(
                            session_id=session_id,
                            message_text=PRIZE_NOT_FOUND_RESPONSE
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            session_id=session_id,
                            error=str(e)
                        )
                
                logger.info(
                    "prize_not_found_response_sent",
                    telegram_id=telegram_id,
                    code_word=code_word
                )
            
            elif prize_result.status == PrizeStatus.DIGITAL:
                await self._send_digital_prize(message, prize_result, session_id)
            
            elif prize_result.status == PrizeStatus.PHYSICAL:
                await self._send_physical_prize_button(message, prize_result, session_id)
        
        except MissingPromoCodeError as e:
            # Уведомление пользователя о необходимости обратиться в поддержку
            await message.answer(PRIZE_MISSING_PROMO_CODE_SUPPORT)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=PRIZE_MISSING_PROMO_CODE_SUPPORT
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
                    )
            
            logger.error(
                "missing_promo_code_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )
        
        except Exception as e:
            # Общая обработка ошибок
            await message.answer(PRIZE_CHECK_ERROR)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=PRIZE_CHECK_ERROR
                    )
                except Exception as save_error:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(save_error)
                    )
            
            logger.error(
                "prize_check_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
                exc_info=True
            )
    
    async def _send_digital_prize(self, message: Message, prize_result, session_id: Optional[int] = None) -> None:
        """
        Отправляет цифровой приз (один или несколько промокодов)
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с промокодом(ами)
            session_id: ID сессии из middleware (опционально)
            
        Validates: Requirements 3.1-3.7, 4.1-4.4, 5.1, 6.1-6.5, 7.4
        """
        telegram_id = message.from_user.id
        
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
            await message.answer(MISSING_PROMO_CODE_ERROR)
            
            # Сохраняем ответ бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=MISSING_PROMO_CODE_ERROR
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
            return
        
        # Объединение данных
        promo_data_list = PromoCodeParser.combine_promo_data(
            promo_codes=promo_codes,
            instructions=instructions,
            telegram_id=telegram_id,
            prize_id=getattr(prize_result, 'prize_id', None)
        )
        
        # Форматирование сообщения
        text = MessageFormatter.format_multiple_promos(
            promo_data_list=promo_data_list,
            telegram_id=telegram_id
        )
        
        # Разделение сообщения если необходимо
        message_parts = MessageFormatter.split_message_if_needed(text, telegram_id)
        
        # Отправка сообщения(й)
        for i, part in enumerate(message_parts):
            # Кнопка только в последнем сообщении
            keyboard = get_main_menu_keyboard() if i == len(message_parts) - 1 else None
            
            await message.answer(
                part,
                parse_mode="HTML",
                reply_markup=keyboard,
                disable_web_page_preview=True
            )
            
            # Сохранение ответа бота
            if self.session_manager and session_id:
                try:
                    await self.session_manager.save_bot_message(
                        session_id=session_id,
                        message_text=part
                    )
                except Exception as e:
                    logger.error(
                        "failed_to_save_bot_response",
                        session_id=session_id,
                        error=str(e)
                    )
        
        logger.info(
            "digital_prize_sent",
            telegram_id=telegram_id,
            promo_count=len(promo_codes),
            message_parts=len(message_parts)
        )
    
    async def _send_physical_prize_button(self, message: Message, prize_result, session_id: Optional[int] = None) -> None:
        """
        Отправляет кнопку для открытия WebApp для физического приза
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с prize_id
            session_id: ID сессии из middleware (опционально)
        """
        # Формируем URL для WebApp с prize_id
        webapp_url = f"{self.webapp_url.rstrip('/')}/webapp?prize_id={prize_result.prize_id}"
        
        # Создаём Inline-кнопку с WebApp
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="📦 Указать данные доставки",
                web_app=WebAppInfo(url=webapp_url)
            )]
        ])
        
        await message.answer(
            PHYSICAL_PRIZE_CONGRATULATIONS,
            reply_markup=keyboard
        )
        
        # Сохраняем ответ бота
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=PHYSICAL_PRIZE_CONGRATULATIONS
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        logger.info(
            "physical_prize_button_sent",
            telegram_id=message.from_user.id,
            prize_id=prize_result.prize_id,
            webapp_url=webapp_url
        )
