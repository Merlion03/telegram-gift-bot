"""
Модуль обработчиков команд и сообщений бота.
"""

from handlers.prize_handler import PrizeHandler
from handlers.support_handler import SupportHandler
from handlers.common_handler import CommonHandler

__all__ = [
    'PrizeHandler',
    'SupportHandler',
    'CommonHandler',
]
