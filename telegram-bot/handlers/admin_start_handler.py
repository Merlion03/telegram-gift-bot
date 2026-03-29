"""
Обработчик команды /start для администраторов

Проверяет наличие пользователя в таблице administrators и:
- Если найден - отправляет Inline Keyboard с WebApp кнопкой
- Если не найден - запускает Standard Flow (существующая логика)
"""

from typing import Optional
from aiogram import Bot
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

from database.repositories.admin_repository import AdminRepository
from services.session_manager import SessionManager
from utils.logging_config import get_logger

logger = get_logger(__name__)


class AdminStartHandler:
    """
    Обработчик команды /start с проверкой прав администратора
    
    Интегрируется с существующим common_handler.py для проверки
    администраторов перед запуском Standard Flow.
    
    Validates: Requirements 3.1, 3.2, 4.1, 4.2, 4.3
    """
    
    def __init__(
        self,
        admin_repository: AdminRepository,
        session_manager: SessionManager,
        webapp_url: str
    ):
        """
        Инициализирует обработчик
        
        Args:
            admin_repository: Repository для работы с администраторами
            session_manager: Существующий SessionManager для support сессий
            webapp_url: URL WebApp административной панели
        """
        self._admin_repo = admin_repository
        self._session_manager = session_manager
        self._webapp_url = webapp_url
        logger.info("admin_start_handler_initialized")
    
    async def handle_start(
        self,
        message: Message,
        session_id: Optional[int] = None
    ) -> bool:
        """
        Обрабатывает команду /start с проверкой администратора
        
        Логика:
        1. Извлекает tg_id из message.from_user.id
        2. Проверяет наличие tg_id в таблице administrators
        3. Если найден - отправляет Inline Keyboard с WebApp кнопкой
        4. Если не найден - возвращает False (запустить Standard Flow)
        
        Args:
            message: Сообщение от пользователя
            session_id: ID сессии из middleware (опционально)
        
        Returns:
            bool: True если пользователь администратор (обработано),
                  False если нужно запустить Standard Flow
        
        Validates: Requirements 3.1, 3.2, 4.1, 4.2, 4.3
        """
        tg_id = message.from_user.id
        username = message.from_user.username or message.from_user.first_name
        
        logger.info(
            "checking_admin_status",
            extra={
                "tg_id": tg_id,
                "username": username
            }
        )
        
        try:
            # Проверяем существование администратора
            is_admin = await self._admin_repo.exists(tg_id)
            
            if is_admin:
                # Пользователь является администратором
                logger.info(
                    "admin_detected",
                    extra={
                        "tg_id": tg_id,
                        "username": username
                    }
                )
                
                # Отправляем Inline Keyboard с WebApp кнопкой
                await self._send_admin_keyboard(message)
                
                # Сохраняем ответ бота, если есть session_id
                if session_id:
                    try:
                        await self._session_manager.save_bot_message(
                            session_id=session_id,
                            message_text="Добро пожаловать в админ-панель!"
                        )
                    except Exception as e:
                        logger.error(
                            "failed_to_save_bot_response",
                            extra={
                                "session_id": session_id,
                                "error": str(e)
                            }
                        )
                
                return True  # Обработано как администратор
            
            else:
                # Пользователь не является администратором
                logger.info(
                    "regular_user_detected",
                    extra={
                        "tg_id": tg_id,
                        "username": username
                    }
                )
                return False  # Запустить Standard Flow
        
        except Exception as e:
            # При ошибке проверки БД запускаем Standard Flow
            logger.error(
                "admin_check_failed",
                extra={
                    "tg_id": tg_id,
                    "username": username,
                    "error": str(e)
                },
                exc_info=True
            )
            return False  # Запустить Standard Flow при ошибке
    
    async def _send_admin_keyboard(self, message: Message) -> None:
        """
        Отправляет Inline Keyboard с кнопкой WebApp
        
        Args:
            message: Сообщение от пользователя
        
        Validates: Requirements 4.2, 4.3
        """
        # Формируем URL админ-панели
        admin_url = f"{self._webapp_url.rstrip('/')}/admin"
        
        # Создаём кнопку с WebApp
        webapp_button = InlineKeyboardButton(
            text="🔐 Открыть админ-панель",
            web_app=WebAppInfo(url=admin_url)
        )
        
        # Создаём Inline Keyboard
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[webapp_button]]
        )
        
        # Формируем приветственное сообщение
        welcome_text = (
            f"👋 Добро пожаловать, {message.from_user.first_name}!\n\n"
            f"Вы вошли как администратор.\n"
            f"Нажмите кнопку ниже для доступа к административной панели."
        )
        
        # Отправляем сообщение с клавиатурой
        await message.answer(
            text=welcome_text,
            reply_markup=keyboard
        )
        
        logger.info(
            "admin_keyboard_sent",
            extra={
                "tg_id": message.from_user.id
            }
        )
