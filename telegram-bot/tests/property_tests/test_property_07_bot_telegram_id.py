"""
Property 7: Системный идентификатор для ответов бота

Feature: bot-messages-tracking
Validates: Requirements 2.5

Property: For any ответа бота, сохранённое сообщение должно содержать `telegram_id = 0`
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock

from services.session_manager import SessionManager
from database.repository import SupportRepository
from database.models import SupportSession


@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
        min_size=5,
        max_size=200
    ),
    session_id=st.integers(min_value=1, max_value=999999),
    user_telegram_id=st.integers(min_value=1, max_value=999999999)
)
@settings(max_examples=100)
async def test_property_7_bot_telegram_id_zero(message_text, session_id, user_telegram_id):
    """
    Feature: bot-messages-tracking, Property 7: Системный идентификатор для ответов бота
    
    **Validates: Requirements 2.5**
    
    Property: For any ответа бота, сохранённое сообщение должно содержать telegram_id = 0
    (системный идентификатор), независимо от telegram_id пользователя в сессии
    """
    assume(len(message_text.strip()) > 0)
    assume(session_id > 0)
    assume(user_telegram_id > 0)
    
    # Arrange
    mock_repository = MagicMock(spec=SupportRepository)
    mock_repository.save_message = AsyncMock(return_value=100)
    
    mock_session = MagicMock(spec=SupportSession)
    mock_session.id = session_id
    mock_session.telegram_id = user_telegram_id  # ID пользователя в сессии
    mock_repository.get_session_by_id = AsyncMock(return_value=mock_session)
    
    session_manager = SessionManager(repository=mock_repository)
    
    # Act
    await session_manager.save_bot_message(
        session_id=session_id,
        message_text=message_text
    )
    
    # Assert: Проверяем, что telegram_id = 0 (системный ID для бота)
    call_args = mock_repository.save_message.call_args
    
    assert call_args[1]['telegram_id'] == 0, (
        f"telegram_id должен быть 0 для ответов бота. "
        f"Получено: {call_args[1]['telegram_id']}"
    )
    
    # Assert: Проверяем, что НЕ используется telegram_id из сессии
    assert call_args[1]['telegram_id'] != user_telegram_id, (
        f"telegram_id НЕ должен совпадать с telegram_id пользователя из сессии. "
        f"telegram_id пользователя: {user_telegram_id}, "
        f"telegram_id в сообщении: {call_args[1]['telegram_id']}"
    )
