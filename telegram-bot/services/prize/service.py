"""
Фасад :class:`PrizeService` — собирает все mixin'ы из подпакета
``services.prize`` в один публичный класс.

Зависимости передаются через конструктор; mixin'ы используют атрибуты:
- ``self.sheets_service`` (Google Sheets)
- ``self.prize_repository`` (PostgreSQL)
- ``self.gdpr_consent_repository`` (GDPR consents)
- ``self.update_queue_service`` (асинхронная очередь обновлений Sheets)
- ``self.config``
"""

from typing import Optional

from config import get_config
from database.repositories.gdpr_consent_repository import GdprConsentRepository
from database.repositories.prize_repository import PrizeRepository
from services.google_sheets_service import GoogleSheetsService
from services.prize.checker import CheckerMixin
from services.prize.claim import ClaimMixin
from services.prize.consent import ConsentMixin
from services.prize.validation import ValidationMixin
from services.update_queue_service import UpdateQueueService
from utils.logging_config import get_logger

logger = get_logger(__name__)


class PrizeService(
    ConsentMixin,
    ValidationMixin,
    CheckerMixin,
    ClaimMixin,
):
    """Сервис для работы с призами (фасад над mixin'ами)."""

    def __init__(
        self,
        sheets_service: GoogleSheetsService,
        prize_repository: Optional[PrizeRepository] = None,
        update_queue_service: Optional[UpdateQueueService] = None,
        gdpr_consent_repository: Optional[GdprConsentRepository] = None,
    ):
        """
        Инициализирует сервис призов.

        Args:
            sheets_service: Сервис для работы с Google Sheets
            prize_repository: Repository для работы с PostgreSQL (опционально)
            update_queue_service: Сервис очереди обновлений (опционально)
            gdpr_consent_repository: Repository для работы с GDPR-согласиями
                (опционально)
        """
        self.sheets_service = sheets_service
        self.prize_repository = prize_repository or PrizeRepository()
        self.gdpr_consent_repository = (
            gdpr_consent_repository or GdprConsentRepository()
        )
        self.update_queue_service = update_queue_service
        self.config = get_config()
        logger.info(
            "prize_service_initialized",
            use_postgres=self.config.sync.use_postgres,
        )
