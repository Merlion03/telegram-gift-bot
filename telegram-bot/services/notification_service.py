"""
NotificationService - сервис для отправки уведомлений пользователям

Отвечает за:
- Отправку последовательных уведомлений в Telegram
- Логирование событий отправки
- Обработку ошибок отправки с graceful degradation
- Сохранение сообщений через SessionManager
"""
import structlog
from dataclasses import dataclass
from typing import Optional
from aiogram import Bot

from services.session_manager import SessionManager
from keyboards.reply_keyboards import get_main_menu_keyboard
from constants.messages import DELIVERY_CONFIRMATION_MESSAGE, DELIVERY_MAIN_MENU_MESSAGE


logger = structlog.get_logger(__name__)


@dataclass
class NotificationResult:
    """
    Результат отправки уведомлений
    
    Validates: Requirements 2.1, 3.1, 4.3
    """
    
    confirmation_sent: bool
    """Успешно ли отправлено подтверждающее сообщение"""
    
    main_menu_sent: bool
    """Успешно ли отправлено сообщение с главным меню"""
    
    both_sent: bool
    """Успешно ли отправлены оба сообщения"""
    
    @property
    def at_least_one_sent(self) -> bool:
        """Отправлено ли хотя бы одно сообщение"""
        return self.confirmation_sent or self.main_menu_sent


class NotificationService:
    """
    Сервис для отправки уведомлений пользователям
    
    Предоставляет высокоуровневые методы для:
    - Отправки последовательных уведомлений о получении данных доставки
    - Graceful degradation при ошибках отправки
    - Логирования всех событий отправки
    - Сохранения сообщений в историю через SessionManager
    
    Validates: Requirements 7.1, 7.2
    """
    
    def __init__(
        self,
        bot: Bot,
        session_manager: Optional[SessionManager] = None
    ):
        """
        Инициализирует NotificationService
        
        Args:
            bot: Экземпляр Telegram бота
            session_manager: Менеджер сессий для сохранения истории (опционально)
        """
        self.bot = bot
        self.session_manager = session_manager
        logger.debug("notification_service_initialized")

    async def send_delivery_notifications(
        self,
        telegram_id: int,
        prize_id: int,
        session_id: Optional[int] = None
    ) -> NotificationResult:
        """
        Отправляет последовательные уведомления о получении данных доставки
        
        Validates: Requirements 1.2, 1.3, 2.3, 4.1, 4.2, 4.3
        
        Логика:
        1. Отправляет подтверждающее сообщение
        2. Отправляет сообщение с главным меню
        3. Логирует результаты отправки
        4. Использует graceful degradation - ошибка первого сообщения не блокирует второе
        
        Args:
            telegram_id: Telegram ID пользователя
            prize_id: ID приза
            session_id: ID сессии для сохранения истории (опционально)
            
        Returns:
            NotificationResult с информацией об успешности отправки
        """
        # Отправка подтверждающего сообщения
        confirmation_sent = await self._send_confirmation_message(
            telegram_id=telegram_id,
            session_id=session_id
        )
        
        # Отправка сообщения с главным меню (независимо от результата первого)
        main_menu_sent = await self._send_main_menu_message(
            telegram_id=telegram_id,
            session_id=session_id
        )
        
        # Формирование результата
        both_sent = confirmation_sent and main_menu_sent
        result = NotificationResult(
            confirmation_sent=confirmation_sent,
            main_menu_sent=main_menu_sent,
            both_sent=both_sent
        )
        
        # Логирование результата
        logger.info(
            "delivery_notifications_sent",
            telegram_id=telegram_id,
            prize_id=prize_id,
            confirmation_sent=confirmation_sent,
            main_menu_sent=main_menu_sent,
            both_sent=both_sent
        )
        
        return result
    
    async def _send_confirmation_message(
        self,
        telegram_id: int,
        session_id: Optional[int]
    ) -> bool:
        """
        Отправляет подтверждающее сообщение
        
        Validates: Requirements 2.1, 2.2, 2.4, 2.5, 5.2, 6.1, 8.1, 8.3
        
        Args:
            telegram_id: Telegram ID пользователя
            session_id: ID сессии для сохранения истории (опционально)
            
        Returns:
            True если сообщение успешно отправлено, False при ошибке
        """
        try:
            # Отправка сообщения
            await self.bot.send_message(
                chat_id=telegram_id,
                text=DELIVERY_CONFIRMATION_MESSAGE
            )
            
            # Логирование успеха
            logger.info(
                "confirmation_message_sent",
                telegram_id=telegram_id
            )
            
            # Сохранение в session_manager
            await self._save_to_session_manager(
                session_id=session_id,
                message_text=DELIVERY_CONFIRMATION_MESSAGE
            )
            
            return True
            
        except Exception as e:
            # Логирование ошибки
            logger.error(
                "confirmation_message_failed",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            return False
    
    async def _send_main_menu_message(
        self,
        telegram_id: int,
        session_id: Optional[int]
    ) -> bool:
        """
        Отправляет сообщение с главным меню
        
        Validates: Requirements 3.1, 3.2, 3.3, 3.4, 5.3, 6.2, 8.2, 8.3
        
        Args:
            telegram_id: Telegram ID пользователя
            session_id: ID сессии для сохранения истории (опционально)
            
        Returns:
            True если сообщение успешно отправлено, False при ошибке
        """
        try:
            # Получение клавиатуры главного меню
            keyboard = get_main_menu_keyboard()
            
            # Отправка сообщения
            await self.bot.send_message(
                chat_id=telegram_id,
                text=DELIVERY_MAIN_MENU_MESSAGE,
                reply_markup=keyboard
            )
            
            # Логирование успеха
            logger.info(
                "main_menu_message_sent",
                telegram_id=telegram_id
            )
            
            # Сохранение в session_manager
            await self._save_to_session_manager(
                session_id=session_id,
                message_text=DELIVERY_MAIN_MENU_MESSAGE
            )
            
            return True
            
        except Exception as e:
            # Логирование ошибки
            logger.error(
                "main_menu_message_failed",
                telegram_id=telegram_id,
                error=str(e),
                exc_info=True
            )
            return False
    
    async def _save_to_session_manager(
        self,
        session_id: Optional[int],
        message_text: str
    ) -> None:
        """
        Сохраняет текст сообщения через session_manager
        
        Validates: Requirements 8.1, 8.2, 8.4, 8.5
        
        Args:
            session_id: ID сессии (опционально)
            message_text: Текст сообщения для сохранения
        """
        # Проверка наличия session_manager и session_id
        if not self.session_manager or not session_id:
            return
        
        try:
            # Сохранение сообщения
            await self.session_manager.save_bot_message(
                session_id=session_id,
                message_text=message_text
            )
            
        except Exception as e:
            # Логирование ошибки без прерывания процесса
            logger.error(
                "session_manager_save_failed",
                session_id=session_id,
                error=str(e)
            )
