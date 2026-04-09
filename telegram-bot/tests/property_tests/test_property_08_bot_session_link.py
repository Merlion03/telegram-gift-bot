"""
Property 8: Связь ответа бота с сессией

Feature: bot-messages-tracking
Validates: Requirements 2.6

Property: For any сохранённого ответа бота, сообщение должно быть связано с активной сессией
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
async def test_property_8_bot_message_linked_to_session(message_text, session_id):
    """
    Feature: bot-messages-tracking, Property 8: Связь ответа бота с сессией
    
    **Validates: Requirements 2.6**
    
    Property: For any сохранённого ответа бота, сообщение должно быть связано
    с активной сессией через валидный session_id
    """
    assume(len(message_text.strip()) > 0)
    assume(session_id > 0)
    
    # Arrange
    mock_repository = MagicMock(spec=SupportRepository)
    mock_repository.save_message = AsyncMock(return_value=100)
    
    mock_session = MagicMock(spec=SupportSession)
    mock_session.id = session_id
    mock_session.telegram_id = 12345
    mock_repository.get_session_by_id = AsyncMock(return_value=mock_session)
    
    session_manager = SessionManager(repository=mock_repository)
    
    # Act
    await session_manager.save_bot_message(
        session_id=session_id,
        message_text=message_text
    )
    
    # Assert: Проверяем, что get_session_by_id был вызван для проверки существования сессии
    assert mock_repository.get_session_by_id.called
    call_args_get = mock_repository.get_session_by_id.call_args
    assert call_args_get[0][0] == session_id
    
    # Assert: Проверяем, что save_message был вызван с правильным session_id
    assert mock_repository.save_message.called
    call_args_save = mock_repository.save_message.call_args
    
    assert call_args_save[1]['session_id'] == session_id, (
        f"session_id должен совпадать. "
        f"Ожидалось: {session_id}, получено: {call_args_save[1]['session_id']}"
    )


@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=5,
        max_size=100
    ),
    invalid_session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_8_1_bot_message_fails_for_invalid_session(message_text, invalid_session_id):
    """
    Feature: bot-messages-tracking, Property 8.1: Ошибка при несуществующей сессии
    
    **Validates: Requirements 2.6**
    
    Property: For any ответа бота с несуществующим session_id, система должна
    выбросить ошибку и НЕ сохранять сообщение
    """
    assume(len(message_text.strip()) > 0)
    assume(invalid_session_id > 0)
    
    # Arrange
    mock_repository = MagicMock(spec=SupportRepository)
    mock_repository.save_message = AsyncMock(return_value=100)
    mock_repository.get_session_by_id = AsyncMock(return_value=None)  # Сессия не найдена
    
    session_manager = SessionManager(repository=mock_repository)
    
    # Act & Assert: Проверяем, что выбрасывается ошибка
    with pytest.raises(ValueError, match="Session .* not found"):
        await session_manager.save_bot_message(
            session_id=invalid_session_id,
            message_text=message_text
        )
    
    # Assert: Проверяем, что save_message НЕ был вызван
    assert not mock_repository.save_message.called, (
        "save_message НЕ должен быть вызван для несуществующей сессии"
    )
