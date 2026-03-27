"""
Модуль клавиатур для Telegram бота.
Содержит функции для создания различных типов клавиатур.
"""

from .reply_keyboards import (
    get_main_menu_keyboard,
    get_consent_keyboard,
    get_support_end_keyboard
)

__all__ = [
    'get_main_menu_keyboard',
    'get_consent_keyboard',
    'get_support_end_keyboard'
]
