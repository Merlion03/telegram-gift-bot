"""
Unit тесты для модуля keyboards.
Проверяют корректность создания клавиатур для главного меню и согласия GDPR.
"""

import pytest
from aiogram.types import InlineKeyboardMarkup

from keyboards.reply_keyboards import (
    get_main_menu_keyboard,
    get_consent_keyboard,
    get_support_end_keyboard
)


class TestMainMenuKeyboard:
    """Тесты для клавиатуры главного меню"""
    
    def test_get_main_menu_keyboard_returns_inline_keyboard_markup(self):
        """
        Проверяет, что функция возвращает объект InlineKeyboardMarkup.
        
        Validates: Requirements 1.2
        """
        keyboard = get_main_menu_keyboard()
        assert isinstance(keyboard, InlineKeyboardMarkup)
    
    def test_get_main_menu_keyboard_has_one_button(self):
        """
        Проверяет, что клавиатура содержит ровно одну кнопку.
        
        Validates: Requirements 1.2
        """
        keyboard = get_main_menu_keyboard()
        assert len(keyboard.inline_keyboard) == 1
        assert len(keyboard.inline_keyboard[0]) == 1
    
    def test_get_main_menu_keyboard_button_text(self):
        """
        Проверяет, что кнопка имеет правильный текст "🎁 Получить приз".
        
        Validates: Requirements 1.2
        """
        keyboard = get_main_menu_keyboard()
        button = keyboard.inline_keyboard[0][0]
        assert button.text == "🎁 Получить приз"
    
    def test_get_main_menu_keyboard_button_callback_data(self):
        """
        Проверяет, что кнопка имеет правильный callback_data.
        """
        keyboard = get_main_menu_keyboard()
        button = keyboard.inline_keyboard[0][0]
        assert button.callback_data == "get_prize"


class TestConsentKeyboard:
    """Тесты для клавиатуры согласия GDPR"""
    
    def test_get_consent_keyboard_returns_inline_keyboard_markup(self):
        """
        Проверяет, что функция возвращает объект InlineKeyboardMarkup.
        
        Validates: Requirements 3.2, 8.1
        """
        keyboard = get_consent_keyboard()
        assert isinstance(keyboard, InlineKeyboardMarkup)
    
    def test_get_consent_keyboard_has_two_buttons(self):
        """
        Проверяет, что клавиатура содержит две кнопки в двух рядах.
        
        Validates: Requirements 3.2, 8.1
        """
        keyboard = get_consent_keyboard()
        assert len(keyboard.inline_keyboard) == 2
        assert len(keyboard.inline_keyboard[0]) == 1
        assert len(keyboard.inline_keyboard[1]) == 1
    
    def test_get_consent_keyboard_button_texts(self):
        """
        Проверяет, что кнопки имеют правильные тексты "✅ Согласен" и "◀️ Назад".
        
        Validates: Requirements 3.2, 8.1
        """
        keyboard = get_consent_keyboard()
        agree_button = keyboard.inline_keyboard[0][0]
        back_button = keyboard.inline_keyboard[1][0]
        
        assert agree_button.text == "✅ Согласен"
        assert back_button.text == "◀️ Назад"
    
    def test_get_consent_keyboard_button_callback_data(self):
        """
        Проверяет, что кнопки имеют правильные callback_data.
        """
        keyboard = get_consent_keyboard()
        agree_button = keyboard.inline_keyboard[0][0]
        back_button = keyboard.inline_keyboard[1][0]
        
        assert agree_button.callback_data == "consent_agree"
        assert back_button.callback_data == "consent_back"


class TestSupportEndKeyboard:
    """Тесты для клавиатуры завершения поддержки"""
    
    def test_get_support_end_keyboard_returns_inline_keyboard_markup(self):
        """
        Проверяет, что функция возвращает объект InlineKeyboardMarkup.
        """
        keyboard = get_support_end_keyboard()
        assert isinstance(keyboard, InlineKeyboardMarkup)
    
    def test_get_support_end_keyboard_has_one_button(self):
        """
        Проверяет, что клавиатура содержит ровно одну кнопку.
        """
        keyboard = get_support_end_keyboard()
        assert len(keyboard.inline_keyboard) == 1
        assert len(keyboard.inline_keyboard[0]) == 1
    
    def test_get_support_end_keyboard_button_text(self):
        """
        Проверяет, что кнопка имеет правильный текст "Завершить диалог".
        """
        keyboard = get_support_end_keyboard()
        button = keyboard.inline_keyboard[0][0]
        assert button.text == "Завершить диалог"
    
    def test_get_support_end_keyboard_button_callback_data(self):
        """
        Проверяет, что кнопка имеет правильный callback_data.
        """
        keyboard = get_support_end_keyboard()
        button = keyboard.inline_keyboard[0][0]
        assert button.callback_data == "support_end"
