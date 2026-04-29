"""
Фасад :class:`PrizeFlowHandler` — собирает все mixin'ы из подпакета
``handlers.prize_flow`` в один публичный класс.

Управляет полным циклом получения приза от нажатия кнопки "Получить приз"
до выдачи промокода или заполнения формы доставки.
"""

from aiogram import Router

from config import get_config
from handlers.prize_flow.code_word import CodeWordMixin
from handlers.prize_flow.consent import ConsentMixin
from handlers.prize_flow.digital import DigitalPrizeMixin
from handlers.prize_flow.navigation import NavigationMixin
from handlers.prize_flow.physical import PhysicalPrizeMixin
from handlers.prize_flow.start import StartFlowMixin
from services.prize_service import PrizeService
from utils.logging_config import get_logger

logger = get_logger(__name__)

# Создаём router для обработчиков prize flow
router = Router()


class PrizeFlowHandler(
    StartFlowMixin,
    ConsentMixin,
    CodeWordMixin,
    DigitalPrizeMixin,
    PhysicalPrizeMixin,
    NavigationMixin,
):
    """
    Обработчик процесса получения приза.

    Управляет FSM состояниями и координирует взаимодействие между
    пользователем, PrizeService и SessionManager для реализации
    полного цикла получения приза.

    Attributes:
        prize_service: Сервис для работы с призами и проверки данных
        session_manager: Менеджер сессий для сохранения истории диалогов
        webapp_url: URL WebApp для формы доставки физических призов
    """

    def __init__(
        self,
        prize_service: PrizeService,
        notification_service,
        session_manager=None,
        webapp_url: str = None,
    ):
        """
        Инициализирует обработчик процесса получения приза.

        Args:
            prize_service: Сервис для работы с призами
            notification_service: Сервис для отправки уведомлений
            session_manager: Менеджер сессий для сохранения ответов бота (опционально)
            webapp_url: URL WebApp (если None, загружается из конфигурации)
        """
        self.prize_service = prize_service
        self.notification_service = notification_service
        self.session_manager = session_manager

        # Загружаем webapp_url из конфигурации или используем переданный
        if webapp_url is None:
            config = get_config()
            self.webapp_url = config.app.webapp_url
        else:
            self.webapp_url = webapp_url

        logger.info("prize_flow_handler_initialized")
