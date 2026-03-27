"""
Property-based тесты для CommonHandler.
Проверяют универсальные свойства корректности обработки команд.
"""

import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, Chat

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
# Property 23: Main Menu Text Constraint
# ============================================================================

@pytest.mark.asyncio
@given(
    username=st.one_of(
        st.text(min_size=1, max_size=32, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))),
        st.none()
    ),
    first_name=st.text(min_size=1, max_size=64, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
)
@settings(max_examples=100, deadline=None)
async def test_property_main_menu_text_no_bot_word(username, first_name):
    """
    Property 23: Main Menu Text Constraint
    
    Проверяет, что текст главного меню не содержит слово "бот"
    для любых валидных значений username и first_name.
    
    Validates: Requirements 1.4
    
    Property:
        FOR ALL valid usernames and first_names,
        WHEN handle_start is called,
        THEN the welcome text SHALL NOT contain the word "бот"
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message(
        username=username,
        first_name=first_name
    )
    
    # Act
    await handler.handle_start(mock_message)
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    # Проверяем отсутствие слова "бот" (регистронезависимо)
    assert "бот" not in sent_message.lower(), (
        f"Текст главного меню содержит слово 'бот': {sent_message}"
    )


@pytest.mark.asyncio
@given(
    telegram_id=st.integers(min_value=1, max_value=999999999999),
    username=st.one_of(
        st.text(min_size=1, max_size=32, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))),
        st.none()
    ),
    first_name=st.text(min_size=1, max_size=64, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
)
@settings(max_examples=100, deadline=None)
async def test_property_main_menu_always_displays_keyboard(telegram_id, username, first_name):
    """
    Property: Main Menu Always Displays Keyboard
    
    Проверяет, что главное меню всегда отображает клавиатуру
    с кнопкой "🎁 Получить приз" для любых валидных пользователей.
    
    Validates: Requirements 1.2
    
    Property:
        FOR ALL valid telegram_id, username, first_name,
        WHEN handle_start is called,
        THEN the response SHALL include a keyboard with "🎁 Получить приз" button
    """
    # Arrange
    handler = CommonHandler()
    mock_message = create_mock_message(
        telegram_id=telegram_id,
        username=username,
        first_name=first_name
    )
    
    # Act
    await handler.handle_start(mock_message)
    
    # Assert
    assert mock_message.answer.called
    call_kwargs = mock_message.answer.call_args[1]
    
    # Проверяем наличие клавиатуры
    assert 'reply_markup' in call_kwargs, "Клавиатура не была отправлена"
    
    keyboard = call_kwargs['reply_markup']
    button_texts = [btn.text for row in keyboard.inline_keyboard for btn in row]
    
    assert "🎁 Получить приз" in button_texts, (
        f"Кнопка '🎁 Получить приз' отсутствует в клавиатуре. "
        f"Найденные кнопки: {button_texts}"
    )


@pytest.mark.asyncio
@given(
    username=st.one_of(
        st.text(min_size=1, max_size=32, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))),
        st.none()
    ),
    first_name=st.text(min_size=1, max_size=64, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
)
@settings(max_examples=50, deadline=None)
async def test_property_session_manager_saves_message(username, first_name):
    """
    Property: Session Manager Message Persistence
    
    Проверяет, что если предоставлен SessionManager и session_id,
    то сообщение всегда сохраняется.
    
    Validates: Requirements 10.7, 10.8
    
    Property:
        FOR ALL valid users,
        WHEN handle_start is called with session_manager and session_id,
        THEN the bot message SHALL be saved via session_manager
    """
    # Arrange
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = CommonHandler(session_manager=mock_session_manager)
    mock_message = create_mock_message(
        username=username,
        first_name=first_name
    )
    session_id = 12345
    
    # Act
    await handler.handle_start(mock_message, session_id=session_id)
    
    # Assert
    assert mock_session_manager.save_bot_message.called, (
        "SessionManager.save_bot_message не был вызван"
    )
    
    call_args = mock_session_manager.save_bot_message.call_args
    assert call_args[1]['session_id'] == session_id, (
        f"Неверный session_id: ожидался {session_id}, "
        f"получен {call_args[1]['session_id']}"
    )
    
    assert 'message_text' in call_args[1], (
        "message_text не был передан в save_bot_message"
    )
