"""
Пакет :mod:`services.prize` — бизнес-логика работы с призами.

Структура:

* :mod:`services.prize.types` — данные и исключения (``PrizeStatus``,
  ``PrizeResult``, ``MissingPromoCodeError``, константа ``MSK_TZ``).
* :mod:`services.prize.consent` — GDPR-консенс.
* :mod:`services.prize.validation` — валидация пользователя/кода/принадлежности.
* :mod:`services.prize.checker` — проверка приза в PostgreSQL/Sheets.
* :mod:`services.prize.claim` — отметка приза как полученного.
* :mod:`services.prize.service` — фасад :class:`PrizeService`.
"""

from services.prize.service import PrizeService
from services.prize.types import (
    MissingPromoCodeError,
    PrizeResult,
    PrizeStatus,
)

__all__ = [
    "MissingPromoCodeError",
    "PrizeResult",
    "PrizeService",
    "PrizeStatus",
]
