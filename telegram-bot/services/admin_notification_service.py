"""
Сервис уведомлений о предоставлении прав администратора
"""

from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, ReplyKeyboardRemove
from services.role_service import RoleService
from utils.logging_config import get_logger

logger = get_logger(__name__)


class AdminNotificationService:
    """
    Сервис для отправки уведомлений новым администраторам
    
    Отправляет уведомление с Inline Keyboard, содержащей кнопку WebApp
    для доступа к административной панели.
    
    Validates: Requirements 5.1, 5.2, 5.3, 5.4
    """
    
    def __init__(self, bot: Bot, webapp_url: str):
        """
        Инициализирует сервис уведомлений
        
        Args:
            bot: Экземпляр aiogram Bot для отправки сообщений
            webapp_url: URL WebApp административной панели
        """
        self._bot = bot
        self._webapp_url = webapp_url
    
    async def notify_new_admin(self, tg_id: int, username: str, role: int) -> None:
        """
        Отправляет уведомление новому администратору
        
        Логика:
        1. Формирует текст уведомления с указанием роли
        2. Создаёт Inline Keyboard с кнопкой WebApp
        3. Отправляет сообщение через Bot API с удалением ReplyKeyboard
        4. Обрабатывает ошибки отправки
        
        Args:
            tg_id: Telegram ID нового администратора
            username: Telegram username администратора
            role: Уровень роли (0-3)
        
        Examples:
            >>> await service.notify_new_admin(
            ...     tg_id=123456789,
            ...     username="john_doe",
            ...     role=2
            ... )
        
        Validates: Requirements 5.1, 5.2, 5.3, 5.4
        """
        try:
            # Получаем название роли
            role_name = RoleService.get_role_name(role)
            
            # Формируем текст уведомления
            notification_text = (
                f"🎉 Поздравляем, {username}!\n\n"
                f"Вам предоставлены права администратора.\n"
                f"Ваша роль: {role_name}\n\n"
                f"Нажмите кнопку ниже для доступа к административной панели."
            )
            
            # Создаём Inline Keyboard с кнопкой WebApp
            keyboard = self._create_admin_keyboard()
            
            # Отправляем уведомление с удалением ReplyKeyboard
            await self._bot.send_message(
                chat_id=tg_id,
                text=notification_text,
                reply_markup=keyboard
            )
            
            logger.info(
                "admin_notification_sent",
                extra={
                    "tg_id": tg_id,
                    "username": username,
                    "role": role,
                    "role_name": role_name
                }
            )
        
        except ValueError as e:
            # Ошибка получения названия роли
            logger.error(
                "admin_notification_invalid_role",
                extra={
                    "tg_id": tg_id,
                    "username": username,
                    "role": role,
                    "error": str(e)
                }
            )
        
        except Exception as e:
            # Ошибка отправки сообщения
            logger.error(
                "admin_notification_send_failed",
                extra={
                    "tg_id": tg_id,
                    "username": username,
                    "role": role,
                    "error": str(e)
                }
            )
    
    def _create_admin_keyboard(self) -> InlineKeyboardMarkup:
        """
        Создаёт Inline Keyboard с кнопкой WebApp для админ-панели
        
        Returns:
            InlineKeyboardMarkup с кнопкой доступа к WebApp
        
        Validates: Requirements 5.3
        """
        # Формируем URL админ-панели
        admin_url = f"{self._webapp_url.rstrip('/')}/admin"
        
        # Создаём кнопку с WebApp
        webapp_button = InlineKeyboardButton(
            text="🔐 Открыть админ-панель",
            web_app=WebAppInfo(url=admin_url)
        )
        
        # Создаём inline-клавиатуру
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[[webapp_button]]
        )
        
        return keyboard
