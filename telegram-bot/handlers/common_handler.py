"""
Обработчик общих команд бота.
Обрабатывает команды /start, /help и кнопку "Позвать человека".
"""

from typing import Optional
from aiogram import Router
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command

from utils.logging_config import get_logger

logger = get_logger(__name__)

# Создаём router для общих обработчиков
router = Router()


class CommonHandler:
    """Обработчик общих команд"""
    
    def __init__(self, session_manager=None):
        """
        Инициализирует обработчик общих команд
        
        Args:
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
        """
        self.session_manager = session_manager
        logger.info("common_handler_initialized")
    
    async def handle_start(self, message: Message, session_id: Optional[int] = None) -> None:
        """
        Обрабатывает команду /start
        
        Отображает главное меню с описанием функций и кнопкой "Получить приз".
        Текст приветствия не содержит слово "бот" согласно Requirements 1.4.
        
        Args:
            message: Сообщение от пользователя
            session_id: ID сессии из middleware (опционально)
            
        Validates:
            Requirements 1.1, 1.2, 1.3, 1.4, 10.7, 10.8
        """
        from keyboards.reply_keyboards import get_main_menu_keyboard
        
        telegram_id = message.from_user.id
        username = message.from_user.username or message.from_user.first_name
        
        logger.info(
            "handling_start_command",
            telegram_id=telegram_id,
            username=username
        )
        
        welcome_text = (
            f"Привет, {username}! 👋\n\n"
            "Здесь вы можете проверить, выиграли ли вы приз в розыгрыше.\n\n"
            "Нажмите кнопку ниже, чтобы начать."
        )
        
        keyboard = get_main_menu_keyboard()
        await message.answer(welcome_text, reply_markup=keyboard)
        
        # Сохраняем ответ бота, если есть session_manager и session_id
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=welcome_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
        logger.info(
            "start_command_handled",
            telegram_id=telegram_id
        )
    
    async def handle_help(self, message: Message, session_id: Optional[int] = None) -> None:
        """
        Обрабатывает команду /help
        
        Args:
            message: Сообщение от пользователя
            session_id: ID сессии из middleware (опционально)
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
            "Команды:\n"
            "/start - Начать работу с ботом\n"
            "/help - Показать эту справку"
        )
        
        await message.answer(help_text)
        
        # Сохраняем ответ бота, если есть session_manager и session_id
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=help_text
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
        
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
