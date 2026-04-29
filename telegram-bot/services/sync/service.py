"""
Фасад :class:`SyncService` — собирает все mixin'ы из подпакета
``services.sync`` в один публичный класс.
"""

from typing import Optional

from config import GoogleSheetsConfig, SyncConfig
from database.repositories.prize_repository import PrizeRepository
from services.sync.backward import BackwardSyncMixin
from services.sync.forward import ForwardSyncMixin
from services.sync.sheets_io import SheetsIOMixin
from utils.logging_config import get_logger

logger = get_logger(__name__)


class SyncService(
    SheetsIOMixin,
    ForwardSyncMixin,
    BackwardSyncMixin,
):
    """Сервис синхронизации Google Sheets ↔ PostgreSQL (фасад над mixin'ами)."""

    def __init__(
        self,
        google_sheets_config: GoogleSheetsConfig,
        sync_config: SyncConfig,
        prize_repository: Optional[PrizeRepository] = None,
    ):
        """
        Инициализирует сервис синхронизации.

        Args:
            google_sheets_config: Конфигурация Google Sheets.
            sync_config: Конфигурация синхронизации.
            prize_repository: Repository призов (опционально).
        """
        self.google_sheets_config = google_sheets_config
        self.sync_config = sync_config
        self.prize_repository = prize_repository or PrizeRepository()
        self.client = self._init_client()

        logger.info(
            "sync_service_initialized",
            spreadsheet_id=google_sheets_config.spreadsheet_id,
            sync_interval=sync_config.sync_interval_seconds,
            batch_size=sync_config.batch_size,
            max_retries=sync_config.max_retries,
        )
