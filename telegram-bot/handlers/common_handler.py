"""
Обработчик общих команд бота.
Обрабатывает команды /start, /help и кнопку "Позвать человека".
"""

from aiogram import Router
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command
import structlog

logger = structlog.get_logger(__name__)

# Создаём router для общих обработчиков
router = Router()


class CommonHandler:
    """Обработчик общих команд"""
    
    def __init__(self):
        """Инициализирует обработчик общих команд"""
        logger.info("common_handler_initialized")
    
    async def handle_start(self, message: Message) -> None:
        """
        Обрабатывает команду /start
        
        Args:
            message: Сообщение от пользователя
        """
        telegram_id = message.from_user.id
        username = message.from_user.username or message.from_user.first_name
        
        logger.info(
            "handling_start_command",
            telegram_id=telegram_id,
            username=username
        )
        
        # Создаём клавиатуру с кнопкой "Позвать человека"
        keyboard = ReplyKeyboardMarkup(
            keyboard=[
                [KeyboardButton(text="Позвать человека")]
            ],
            resize_keyboard=True
        )
        
        welcome_text = (
            f"Привет, {username}! 👋\n\n"
            "Я бот для проверки призов в розыгрыше.\n\n"
            "Отправьте мне кодовое слово, чтобы проверить, выиграли ли вы приз.\n\n"
            "Если у вас возникли вопросы, нажмите кнопку \"Позвать человека\" "
            "для связи со службой поддержки."
        )
        
        await message.answer(welcome_text, reply_markup=keyboard)
        
        logger.info(
            "start_command_handled",
            telegram_id=telegram_id
        )
    
    async def handle_help(self, message: Message) -> None:
        """
        Обрабатывает команду /help
        
        Args:
            message: Сообщение от пользователя
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "handling_help_command",
            telegram_id=telegram_id
        )
        
        help_text = (
            "📋 Как пользоваться ботом:\n\n"
            "1️⃣ Отправьте кодовое слово из розыгрыша\n"
            "2️⃣ Бот проверит, выиграли ли вы приз\n"
            "3️⃣ Если вы победитель:\n"
            "   • Цифровой приз - получите промокод сразу\n"
            "   • Физический приз - укажите данные для доставки\n\n"
            "❓ Нужна помощь?\n"
            "Нажмите кнопку \"Позвать человека\" для связи с поддержкой.\n\n"
            "Команды:\n"
            "/start - Начать работу с ботом\n"
            "/help - Показать эту справку"
        )
        
        await message.answer(help_text)
        
        logger.info(
            "help_command_handled",
            telegram_id=telegram_id
        )
    
    async def handle_call_support_button(self, message: Message) -> None:
        """
        Обрабатывает нажатие кнопки "Позвать человека"
        
        Args:
            message: Сообщение от пользователя
        """
        telegram_id = message.from_user.id
        
        logger.info(
            "handling_call_support_button",
            telegram_id=telegram_id
        )
        
        # Эта функция будет вызывать start_support из SupportHandler
        # Здесь просто логируем событие
        # Фактическая обработка будет в роутере, который свяжет эту кнопку с SupportHandler
        
        logger.info(
            "call_support_button_pressed",
            telegram_id=telegram_id
        )
