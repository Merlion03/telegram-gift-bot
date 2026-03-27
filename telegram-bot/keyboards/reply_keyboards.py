"""
Модуль для создания Inline клавиатур Telegram бота.
Содержит функции для генерации клавиатур главного меню, согласия GDPR и других.
"""

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def get_main_menu_keyboard() -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру главного меню.
    
    Клавиатура содержит кнопку для начала процесса получения приза.
    Используется после команды /start и при возврате в главное меню.
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопкой "🎁 Получить приз"
        
    Validates:
        Requirements 1.2 - Главное меню должно содержать кнопку "Получить приз"
    """
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🎁 Получить приз", callback_data="get_prize")]
        ]
    )
    return keyboard


def get_consent_keyboard() -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру для запроса GDPR согласия.
    
    Клавиатура содержит кнопки для подтверждения согласия на обработку
    персональных данных или возврата в главное меню.
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопками "✅ Согласен" и "◀️ Назад"
        
    Validates:
        Requirements 3.2 - Запрос согласия должен содержать кнопки "Согласен" и "Назад"
        Requirements 8.1 - Кнопка "Назад" должна быть доступна в состоянии waiting_for_consent
    """
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Согласен", callback_data="consent_agree")],
            [InlineKeyboardButton(text="◀️ Назад", callback_data="consent_back")]
        ]
    )
    return keyboard


def get_support_end_keyboard() -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру для завершения диалога с поддержкой.
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопкой "Завершить диалог"
    """
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Завершить диалог", callback_data="support_end")]
        ]
    )
    return keyboard
