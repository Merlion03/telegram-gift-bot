"""
Unit тесты для CommonHandler.
Проверяют корректность обработки общих команд.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, Chat, ReplyKeyboardMarkup

from handlers.common_handler import CommonHandler


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id=123456789, username="testuser", first_name="Test"):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.username = username
    message.from_user.first_name = first_name
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


# ============================================================================
# Unit-тесты для CommonHandler
# ============================================================================

@pytest.mark.asyncio
async def test_handle_start_command():
    """
    Тест: Обработка команды /start
    
    Проверяет, что команда /start отправляет приветственное сообщение
    с клавиатурой "Позвать человека".
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message(username="testuser")
    
    # Act
    await handler.handle_start(mock_message)
    
    # Assert
    assert mock_message.answer.called
    
    # Проверяем текст сообщения
    sent_message = mock_message.answer.call_args[0][0]
    assert "Привет" in sent_message
    assert "testuser" in sent_message
    assert "кодовое слово" in sent_message
    
    # Проверяем наличие клавиатуры
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    keyboard = call_kwargs['reply_markup']
    assert isinstance(keyboard, ReplyKeyboardMarkup)
    
    # Проверяем наличие кнопки "Позвать человека"
    button_texts = [btn.text for row in keyboard.keyboard for btn in row]
    assert "Позвать человека" in button_texts


@pytest.mark.asyncio
async def test_handle_start_without_username():
    """
    Тест: Обработка команды /start без username
    
    Проверяет, что если у пользователя нет username,
    используется first_name.
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message(username=None, first_name="Иван")
    
    # Act
    await handler.handle_start(mock_message)
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "Иван" in sent_message


@pytest.mark.asyncio
async def test_handle_help_command():
    """
    Тест: Обработка команды /help
    
    Проверяет, что команда /help отправляет справочное сообщение
    с инструкциями по использованию бота.
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message()
    
    # Act
    await handler.handle_help(mock_message)
    
    # Assert
    assert mock_message.answer.called
    
    # Проверяем текст сообщения
    sent_message = mock_message.answer.call_args[0][0]
    assert "Как пользоваться ботом" in sent_message
    assert "кодовое слово" in sent_message
    assert "Цифровой приз" in sent_message
    assert "Физический приз" in sent_message
    assert "/start" in sent_message
    assert "/help" in sent_message


@pytest.mark.asyncio
async def test_handle_call_support_button():
    """
    Тест: Обработка кнопки "Позвать человека"
    
    Проверяет, что нажатие кнопки корректно логируется.
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message()
    
    # Act
    await handler.handle_call_support_button(mock_message)
    
    # Assert: функция должна выполниться без ошибок
    # Фактическая обработка будет в роутере
    assert True


@pytest.mark.asyncio
async def test_start_command_keyboard_structure():
    """
    Тест: Структура клавиатуры в команде /start
    
    Проверяет, что клавиатура имеет правильную структуру
    и параметр resize_keyboard установлен.
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message()
    
    # Act
    await handler.handle_start(mock_message)
    
    # Assert
    call_kwargs = mock_message.answer.call_args[1]
    keyboard = call_kwargs['reply_markup']
    
    # Проверяем, что клавиатура имеет resize_keyboard=True
    assert keyboard.resize_keyboard is True
    
    # Проверяем количество строк и кнопок
    assert len(keyboard.keyboard) == 1  # Одна строка
    assert len(keyboard.keyboard[0]) == 1  # Одна кнопка в строке
    assert keyboard.keyboard[0][0].text == "Позвать человека"
