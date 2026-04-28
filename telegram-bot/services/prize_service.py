"""
DEPRECATED: re-export shim.

Сервис разбит на пакет :mod:`services.prize`. Этот файл сохранён только
для обратной совместимости старых импортов:

.. code-block:: python

    from services.prize_service import PrizeService, PrizeStatus, ...

Новый код должен импортировать напрямую из :mod:`services.prize`.
"""

from services.prize import (
    MissingPromoCodeError,
    PrizeResult,
    PrizeService,
    PrizeStatus,
)

__all__ = [
    "MissingPromoCodeError",
    "PrizeResult",
    "PrizeService",
    "PrizeStatus",
]
