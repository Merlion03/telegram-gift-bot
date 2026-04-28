"""
Обработчик общих команд бота.
Обрабатывает команды /start, /help и кнопку "Позвать человека".
"""

from typing import Optional
from aiogram import Router, Bot
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command

from utils.logging_config import get_logger
from constants import get_welcome_message, HELP_MESSAGE

logger = get_logger(__name__)

# Создаём router для общих обработчиков
router = Router()


class CommonHandler:
    """Обработчик общих команд"""
    
    def __init__(self, session_manager=None, admin_start_handler=None):
        """
        Инициализирует обработчик общих команд
        
        Args:
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
            admin_start_handler: Обработчик для проверки администраторов (опционально)
        """
        self.session_manager = session_manager
        self.admin_start_handler = admin_start_handler
        logger.info("common_handler_initialized")
    
    async def handle_start(self, message: Message, session_id: Optional[int] = None, bot: Optional[Bot] = None) -> None:
        """
        Обрабатывает команду /start
        
        Сначала проверяет, является ли пользователь администратором.
        Если да - отправляет админ-клавиатуру, если нет - запускает Standard Flow.
        
        Отображает главное меню с описанием функций и кнопкой "Получить приз".
        Текст приветствия не содержит слово "бот" согласно Requirements 1.4.
        
        Args:
            message: Сообщение от пользователя
            session_id: ID сессии из middleware (опционально)
            bot: Экземпляр бота (опционально, для программного вызова)
            
        Validates:
            Requirements 1.1, 1.2, 1.3, 1.4, 3.1, 4.1, 10.7, 10.8
        """
        from keyboards.reply_keyboards import get_main_menu_keyboard
        
        telegram_id = message.from_user.id
        username = message.from_user.username or message.from_user.first_name
        
        logger.info(
            "handling_start_command",
            telegram_id=telegram_id,
            username=username
        )
        
        # Проверяем, является ли пользователь администратором
        should_run_standard_flow = True
        
        if self.admin_start_handler:
            try:
                is_admin = await self.admin_start_handler.handle_start(message, session_id)
                if is_admin:
                    # Администратор обработан, не запускаем Standard Flow
                    should_run_standard_flow = False
                    logger.info(
                        "start_command_handled_as_admin",
                        telegram_id=telegram_id
                    )
            except Exception as e:
                # При ошибке проверки администратора продолжаем Standard Flow
                logger.error(
                    "admin_check_error_fallback_to_standard_flow",
                    telegram_id=telegram_id,
                    error=str(e)
                )
        
        # Standard Flow для обычных пользователей
        if should_run_standard_flow:
            welcome_text = get_welcome_message(username)
            
            keyboard = get_main_menu_keyboard()
            
            # Используем переданный bot или получаем из message
            if bot:
                await bot.send_message(
                    chat_id=message.chat.id,
                    text=welcome_text,
                    reply_markup=keyboard
                )
            else:
                await message.answer(welcome_text, reply_markup=keyboard)
            
            # Сохраняем ответ бота, если есть session_manager и session_id
            if self.session_manager:
                await self.session_manager.save_bot_response_safe(
                    session_id=session_id,
                    message_text=welcome_text,
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
        
        await message.answer(HELP_MESSAGE)
        
        # Сохраняем ответ бота, если есть session_manager и session_id
        if self.session_manager:
            await self.session_manager.save_bot_response_safe(
                session_id=session_id,
                message_text=HELP_MESSAGE,
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
