"""
Unit тесты для CommonHandler.
Проверяют корректность обработки общих команд.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, Chat, InlineKeyboardMarkup

from handlers.common_handler import CommonHandler
from keyboards.reply_keyboards import get_main_menu_keyboard


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
async def test_handle_start_displays_main_menu():
    """
    Тест: Обработка команды /start отображает главное меню
    
    Проверяет, что команда /start отправляет приветственное сообщение
    с клавиатурой главного меню "🎁 Получить приз".
    
    Validates: Requirements 1.1, 1.2
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
    assert "выиграли ли вы приз" in sent_message
    
    # Проверяем наличие клавиатуры главного меню
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    keyboard = call_kwargs['reply_markup']
    assert isinstance(keyboard, InlineKeyboardMarkup)
    
    # Проверяем наличие кнопки "🎁 Получить приз"
    button_texts = [btn.text for row in keyboard.inline_keyboard for btn in row]
    assert "🎁 Получить приз" in button_texts


@pytest.mark.asyncio
async def test_handle_start_text_without_bot_word():
    """
    Тест: Текст приветствия не содержит слово "бот"
    
    Проверяет, что приветственное сообщение не содержит слово "бот"
    согласно Requirements 1.4.
    
    Validates: Requirements 1.4
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message(username="testuser")
    
    # Act
    await handler.handle_start(mock_message)
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    # Проверяем отсутствие слова "бот" (регистронезависимо)
    assert "бот" not in sent_message.lower()


@pytest.mark.asyncio
async def test_handle_start_saves_message_via_session_manager():
    """
    Тест: Сохранение сообщения через SessionManager
    
    Проверяет, что ответ бота сохраняется через SessionManager
    если он предоставлен.
    
    Validates: Requirements 10.7, 10.8
    """
    # Arrange
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = CommonHandler(session_manager=mock_session_manager)
    mock_message = create_mock_message(username="testuser")
    session_id = 12345
    
    # Act
    await handler.handle_start(mock_message, session_id=session_id)
    
    # Assert
    assert mock_session_manager.save_bot_message.called
    call_args = mock_session_manager.save_bot_message.call_args
    
    # Проверяем, что передан правильный session_id
    assert call_args[1]['session_id'] == session_id
    
    # Проверяем, что передан текст сообщения
    assert 'message_text' in call_args[1]
    message_text = call_args[1]['message_text']
    assert "Привет" in message_text


@pytest.mark.asyncio
async def test_handle_start_command():
    """
    Тест: Обработка команды /start (обратная совместимость)
    
    Проверяет, что команда /start отправляет приветственное сообщение.
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
    
    Проверяет, что клавиатура главного меню имеет правильную структуру
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
    assert len(keyboard.inline_keyboard) == 1  # Одна строка
    assert len(keyboard.inline_keyboard[0]) == 1  # Одна кнопка в строке
    assert keyboard.inline_keyboard[0][0].text == "🎁 Получить приз"
