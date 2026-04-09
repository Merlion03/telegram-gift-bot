"""
Модуль для создания Inline клавиатур Telegram бота.
Содержит функции для генерации клавиатур главного меню, согласия GDPR и других.
"""

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo


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
            [InlineKeyboardButton(
                text="Получить приз", 
                callback_data="get_prize",
                icon_custom_emoji_id="5341654051555677887",
                style="primary"
            )]
        ]
    )
    return keyboard


def get_consent_keyboard() -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру для запроса GDPR согласия.
    
    Клавиатура содержит кнопки для подтверждения согласия на обработку
    персональных данных или возврата в главное меню.
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопками "✅ Согласен" (зелёная) и "◀️ Назад" (красная)
        
    Validates:
        Requirements 3.2 - Запрос согласия должен содержать кнопки "Согласен" и "Назад"
        Requirements 8.1 - Кнопка "Назад" должна быть доступна в состоянии waiting_for_consent
    """
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text="Продолжить", 
                callback_data="consent_agree",
                style="success",
                icon_custom_emoji_id="5379890388750330965"
            )],
            [InlineKeyboardButton(
                text="Назад", 
                callback_data="consent_back",
                style="danger",
                icon_custom_emoji_id="5316911646906541152"
            )]
        ]
    )
    return keyboard


def get_user_not_found_keyboard() -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру для случая, когда пользователь не найден в списке победителей.
    
    Клавиатура содержит кнопки для возврата в главное меню или запроса помощи.
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопками "Назад" и "Нужна помощь"
    """
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text="Назад", 
                callback_data="back_to_main_menu",
                style="primary",
                icon_custom_emoji_id="5316911646906541152"
            )],
            [InlineKeyboardButton(
                text="Нужна помощь", 
                callback_data="need_help",
                style="success",
                icon_custom_emoji_id="5314181313094193732"
            )]
        ]
    )
    return keyboard


def get_invalid_code_keyboard(show_help: bool = False) -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру для случая неправильного кодового слова.
    
    Клавиатура содержит кнопку "Назад" и опционально кнопку "Нужна помощь"
    (после 3-х неправильных попыток).
    
    Args:
        show_help: Показывать ли кнопку "Нужна помощь" (после 3-х попыток)
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопками "Назад" и опционально "Нужна помощь"
    """
    buttons = [
        [InlineKeyboardButton(
            text="Назад", 
            callback_data="invalid_code_back",
            style="primary",
            icon_custom_emoji_id="5316911646906541152"
        )]
    ]
    
    if show_help:
        buttons.append([InlineKeyboardButton(
            text="Нужна помощь", 
            callback_data="invalid_code_help",
            style="success",
            icon_custom_emoji_id="5314181313094193732"
        )])
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
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



def get_delivery_actions_keyboard(prize_id: int, webapp_url: str) -> InlineKeyboardMarkup:
    """
    Создаёт inline клавиатуру для действий с уже заполненными данными доставки.
    
    Клавиатура содержит кнопки для получения приза или изменения данных доставки.
    Используется когда пользователь уже заполнил форму доставки и вводит кодовое слово снова.
    
    Args:
        prize_id: ID приза для передачи в callback_data
        webapp_url: Базовый URL WebApp для формы доставки
    
    Returns:
        InlineKeyboardMarkup: Клавиатура с кнопками "Получить приз" и "Изменить данные"
    """
    # Формируем URL для WebApp с prize_id
    form_url = f"{webapp_url.rstrip('/')}/webapp?prize_id={prize_id}"
    
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text="Назад", 
                callback_data=f"back_to_menu:{prize_id}",
                style="primary",
                icon_custom_emoji_id="5316911646906541152"
            )],
            [InlineKeyboardButton(
                text="Изменить данные", 
                web_app=WebAppInfo(url=form_url),
                style="success",
                icon_custom_emoji_id="5274056321493115109"
            )]
        ]
    )
    return keyboard


