"""
Обработчик проверки призов.
Обрабатывает кодовые слова и выдаёт призы пользователям.
"""

from aiogram import Router
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import Command
import structlog

from services.prize_service import PrizeService, PrizeStatus, MissingPromoCodeError
from config import get_config

logger = structlog.get_logger(__name__)

# Создаём router для обработчиков призов
router = Router()


class PrizeHandler:
    """Обработчик проверки призов"""
    
    def __init__(self, prize_service: PrizeService, webapp_url: str = None):
        """
        Инициализирует обработчик призов
        
        Args:
            prize_service: Сервис для работы с призами
            webapp_url: URL WebApp (если None, загружается из конфигурации)
        """
        self.prize_service = prize_service
        
        # Загружаем webapp_url из конфигурации или используем переданный
        if webapp_url is None:
            config = get_config()
            self.webapp_url = config.app.webapp_url
        else:
            self.webapp_url = webapp_url
        
        logger.info("prize_handler_initialized")
    
    async def handle_code_word(self, message: Message, code_word: str) -> None:
        """
        Обрабатывает кодовое слово от пользователя
        
        Args:
            message: Сообщение от пользователя с кодовым словом
            code_word: Кодовое слово для проверки
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
                await message.answer("Вы ещё не победили в конкурсе")
                logger.info(
                    "prize_not_found_response_sent",
                    telegram_id=telegram_id,
                    code_word=code_word
                )
            
            elif prize_result.status == PrizeStatus.DIGITAL:
                await self._send_digital_prize(message, prize_result)
            
            elif prize_result.status == PrizeStatus.PHYSICAL:
                await self._send_physical_prize_button(message, prize_result)
        
        except MissingPromoCodeError as e:
            # Уведомление пользователя о необходимости обратиться в поддержку
            await message.answer(
                "К сожалению, произошла ошибка при получении вашего приза. "
                "Пожалуйста, обратитесь в службу поддержки."
            )
            logger.error(
                "missing_promo_code_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e)
            )
        
        except Exception as e:
            # Общая обработка ошибок
            await message.answer(
                "Произошла ошибка при проверке приза. Пожалуйста, попробуйте позже."
            )
            logger.error(
                "prize_check_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
                exc_info=True
            )
    
    async def _send_digital_prize(self, message: Message, prize_result) -> None:
        """
        Отправляет цифровой приз (промокод)
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с промокодом
        """
        text = (
            f"🎉 Поздравляем! Ваш промокод: {prize_result.promo_code}\n\n"
            f"{prize_result.instructions}"
        )
        
        await message.answer(text)
        
        logger.info(
            "digital_prize_sent",
            telegram_id=message.from_user.id,
            has_promo_code=bool(prize_result.promo_code),
            has_instructions=bool(prize_result.instructions)
        )
    
    async def _send_physical_prize_button(self, message: Message, prize_result) -> None:
        """
        Отправляет кнопку для открытия WebApp для физического приза
        
        Args:
            message: Сообщение пользователя
            prize_result: Результат проверки приза с prize_id
        """
        # Формируем URL для WebApp с prize_id
        webapp_url = f"{self.webapp_url}?prize_id={prize_result.prize_id}"
        
        # Создаём Inline-кнопку с WebApp
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(
                text="📦 Указать данные доставки",
                web_app=WebAppInfo(url=webapp_url)
            )]
        ])
        
        await message.answer(
            "🎉 Поздравляем! Укажите данные для доставки:",
            reply_markup=keyboard
        )
        
        logger.info(
            "physical_prize_button_sent",
            telegram_id=message.from_user.id,
            prize_id=prize_result.prize_id,
            webapp_url=webapp_url
        )
