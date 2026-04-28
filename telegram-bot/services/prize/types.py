"""
Типы и исключения, используемые в модулях `services.prize`.
"""

from dataclasses import dataclass
from datetime import timedelta, timezone
from enum import Enum
from typing import Optional


# Московская временная зона (UTC+3) — используется для отметки времени получения
# приза в формате, который ожидают Google Sheets.
MSK_TZ = timezone(timedelta(hours=3))


class PrizeStatus(Enum):
    """Статус проверки приза."""
    NOT_FOUND = "not_found"
    DIGITAL = "digital"
    PHYSICAL = "physical"


@dataclass
class PrizeResult:
    """Результат проверки приза."""
    status: PrizeStatus
    promo_code: Optional[str] = None
    instructions: Optional[str] = None
    row_id: Optional[int] = None
    prize_id: Optional[int] = None


class MissingPromoCodeError(Exception):
    """Исключение при отсутствии промокода для цифрового приза."""
    pass
