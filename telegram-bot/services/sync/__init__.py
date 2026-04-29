"""
Пакет :mod:`services.sync` — синхронизация Google Sheets ↔ PostgreSQL.

Структура:

* :mod:`services.sync.sheets_io` — клиент gspread, чтение/конвертация данных.
* :mod:`services.sync.forward` — прямая синхронизация (Sheets → PostgreSQL).
* :mod:`services.sync.backward` — обратная синхронизация (PostgreSQL → Sheets).
* :mod:`services.sync.service` — фасад :class:`SyncService`.
"""

from services.sync.service import SyncService

__all__ = ["SyncService"]
