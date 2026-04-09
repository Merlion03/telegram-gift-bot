"""
Property 6: Сохранение только текстового содержимого

Feature: bot-messages-tracking
Validates: Requirements 2.2, 2.3, 2.4

Property: For any ответа бота, сохранённое сообщение должно содержать только текст без inline keyboard
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
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_6_text_only_no_keyboard(message_text, session_id):
    """
    Feature: bot-messages-tracking, Property 6: Сохранение только текстового содержимого
    
    **Validates: Requirements 2.2, 2.3, 2.4**
    
    Property: For any ответа бота, сохранённое сообщение должно содержать только текст
    без inline keyboard (file_id = None)
    """
    assume(len(message_text.strip()) > 0)
    assume(session_id > 0)
    
    # Arrange
    mock_repository = MagicMock(spec=SupportRepository)
    mock_repository.save_message = AsyncMock(return_value=100)
    
    mock_session = MagicMock(spec=SupportSession)
    mock_session.id = session_id
    mock_repository.get_session_by_id = AsyncMock(return_value=mock_session)
    
    session_manager = SessionManager(repository=mock_repository)
    
    # Act
    await session_manager.save_bot_message(
        session_id=session_id,
        message_text=message_text
    )
    
    # Assert: Проверяем, что file_id = None (только текст, без медиа/keyboard)
    call_args = mock_repository.save_message.call_args
    
    assert call_args[1]['file_id'] is None, (
        f"file_id должен быть None для текстовых ответов бота. "
        f"Получено: {call_args[1]['file_id']}"
    )
    
    # Assert: Проверяем, что сохранён только текст
    saved_text = call_args[1]['message_text']
    assert saved_text == message_text
