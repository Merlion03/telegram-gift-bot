"""
Property 5: Сохранение ответов бота с правильным типом

Feature: bot-messages-tracking
Validates: Requirements 2.1

Property: For any ответа бота, система должна сохранить его как сообщение типа `from_bot`
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock

from services.session_manager import SessionManager
from database.repository import SupportRepository
from database.models import SupportSession


@st.composite
def bot_message_strategy(draw):
    """Генерирует текст ответа бота"""
    # Простой текст
    if draw(st.booleans()):
        return draw(st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs", "Po")),
            min_size=5,
            max_size=200
        ))
    
    # Многострочный текст
    lines = draw(st.lists(
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
            min_size=5,
            max_size=50
        ),
        min_size=2,
        max_size=5
    ))
    return "\n".join(lines)


@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=bot_message_strategy(),
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_5_bot_message_type_correct(message_text, session_id):
    """
    Feature: bot-messages-tracking, Property 5: Сохранение ответов бота с правильным типом
    
    **Validates: Requirements 2.1**
    
    Property: For any ответа бота, система должна сохранить его как сообщение типа `from_bot`
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
    
    # Assert: Проверяем, что save_message был вызван с message_type='from_bot'
    assert mock_repository.save_message.called
    call_args = mock_repository.save_message.call_args
    
    assert call_args[1]['message_type'] == 'from_bot', (
        f"message_type должен быть 'from_bot'. "
        f"Получено: '{call_args[1]['message_type']}'"
    )
    
    # Assert: Проверяем, что НЕ используется 'from_user' или 'from_support'
    assert call_args[1]['message_type'] != 'from_user'
    assert call_args[1]['message_type'] != 'from_support'


@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=bot_message_strategy(),
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_5_1_bot_message_text_preserved(message_text, session_id):
    """
    Feature: bot-messages-tracking, Property 5.1: Текст ответа бота сохраняется полностью
    
    **Validates: Requirements 2.2**
    
    Property: For any ответа бота, сохранённое сообщение должно содержать полный текст
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
    
    # Assert: Проверяем, что текст сохранён полностью
    call_args = mock_repository.save_message.call_args
    saved_text = call_args[1]['message_text']
    
    assert saved_text == message_text, (
        f"Текст ответа бота должен быть сохранён полностью. "
        f"Ожидалось: '{message_text}', получено: '{saved_text}'"
    )
