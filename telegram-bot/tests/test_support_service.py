"""
Тесты для SupportService.
Включает property-based тесты и unit-тесты.
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from unittest.mock import Mock, AsyncMock
from datetime import datetime, timezone

from services.support_service import SupportService
from database.repository import SupportRepository
from database.models import SupportSession, SupportMessage


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_repository():
    """Создаёт mock для SupportRepository"""
    repository = Mock(spec=SupportRepository)
    return repository


@pytest.fixture
def support_service(mock_repository):
    """Создаёт экземпляр SupportService с mock зависимостями"""
    return SupportService(repository=mock_repository)


# ============================================================================
# Property-Based Tests
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999)
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_10_create_support_session(
    telegram_id,
    mock_repository
):
    """
    Property 10: Создание сессии поддержки
    Feature: telegram-bot-webapp-system, Property 10
    
    Для любого запроса на создание сессии поддержки,
    в Support_Database должна появиться новая запись с Telegram_ID пользователя,
    статусом "active" и timestamp создания
    
    Validates: Requirements 5.1, 5.5
    """
    # Arrange
    support_service = SupportService(repository=mock_repository)
    session_id = 42
    
    # Настраиваем mock для create_session
    mock_repository.create_session = AsyncMock(return_value=session_id)
    
    # Act
    result_session_id = await support_service.create_session(telegram_id)
    
    # Assert
    assert result_session_id == session_id
    
    # Проверяем, что repository.create_session был вызван с правильным telegram_id
    mock_repository.create_session.assert_called_once_with(telegram_id)


@given(
    session_id=st.integers(min_value=1, max_value=999999),
    telegram_id=st.integers(min_value=1, max_value=999999999),
    message_text=st.text(min_size=1, max_size=500)
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_13_save_user_message(
    session_id,
    telegram_id,
    message_text,
    mock_repository
):
    """
    Property 13: Перехват и сохранение сообщений в режиме поддержки
    Feature: telegram-bot-webapp-system, Property 13
    
    Для любого сообщения от пользователя в FSM состоянии поддержки,
    сообщение должно быть сохранено в Support_Database с типом "from_user",
    текстом сообщения, session_id и timestamp
    
    Validates: Requirements 6.1, 6.2, 6.3
    """
    # Arrange
    support_service = SupportService(repository=mock_repository)
    message_id = 100
    
    # Настраиваем mock для save_message
    mock_repository.save_message = AsyncMock(return_value=message_id)
    
    # Act
    result_message_id = await support_service.save_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_user',
        message_text=message_text
    )
    
    # Assert
    assert result_message_id == message_id
    
    # Проверяем, что repository.save_message был вызван с правильными параметрами
    mock_repository.save_message.assert_called_once_with(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_user',
        message_text=message_text,
        file_id=None
    )


@given(
    session_id=st.integers(min_value=1, max_value=999999),
    telegram_id=st.integers(min_value=1, max_value=999999999),
    message_text=st.text(min_size=1, max_size=500),
    file_id=st.text(min_size=10, max_size=100)
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_15_save_media_message(
    session_id,
    telegram_id,
    message_text,
    file_id,
    mock_repository
):
    """
    Property 15: Сохранение file_id для медиа-контента
    Feature: telegram-bot-webapp-system, Property 15
    
    Для любого сообщения с медиа-контентом (фото, документы) в режиме поддержки,
    в Support_Database должен быть сохранён file_id вместе с сообщением
    
    Validates: Requirements 6.5
    """
    # Arrange
    support_service = SupportService(repository=mock_repository)
    message_id = 100
    
    # Настраиваем mock для save_message
    mock_repository.save_message = AsyncMock(return_value=message_id)
    
    # Act
    result_message_id = await support_service.save_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_user',
        message_text=message_text,
        file_id=file_id
    )
    
    # Assert
    assert result_message_id == message_id
    
    # Проверяем, что file_id был передан в repository
    call_args = mock_repository.save_message.call_args
    assert call_args.kwargs['file_id'] == file_id


@given(
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_21_close_support_session(
    session_id,
    mock_repository
):
    """
    Property 21: Завершение сессии поддержки
    Feature: telegram-bot-webapp-system, Property 21
    
    Для любой активной Support_Session, при нажатии кнопки "Завершить диалог",
    статус сессии должен измениться на "closed"
    
    Validates: Requirements 9.1, 9.2, 9.4
    """
    # Arrange
    support_service = SupportService(repository=mock_repository)
    
    # Настраиваем mock для close_session
    mock_repository.close_session = AsyncMock(return_value=True)
    
    # Act
    success = await support_service.close_session(session_id)
    
    # Assert
    assert success is True
    
    # Проверяем, что repository.close_session был вызван с правильным session_id
    mock_repository.close_session.assert_called_once_with(session_id)


# ============================================================================
# Unit Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_session_success(support_service, mock_repository):
    """
    Unit-тест: успешное создание сессии
    """
    # Arrange
    telegram_id = 12345
    session_id = 42
    mock_repository.create_session = AsyncMock(return_value=session_id)
    
    # Act
    result = await support_service.create_session(telegram_id)
    
    # Assert
    assert result == session_id
    mock_repository.create_session.assert_called_once_with(telegram_id)


@pytest.mark.asyncio
async def test_create_session_error(support_service, mock_repository):
    """
    Unit-тест: ошибка при создании сессии
    """
    # Arrange
    telegram_id = 12345
    mock_repository.create_session = AsyncMock(
        side_effect=Exception("Database error")
    )
    
    # Act & Assert
    with pytest.raises(Exception, match="Database error"):
        await support_service.create_session(telegram_id)


@pytest.mark.asyncio
async def test_save_message_from_user(support_service, mock_repository):
    """
    Unit-тест: сохранение сообщения от пользователя
    """
    # Arrange
    session_id = 10
    telegram_id = 12345
    message_text = "Помогите с заказом"
    message_id = 100
    
    mock_repository.save_message = AsyncMock(return_value=message_id)
    
    # Act
    result = await support_service.save_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_user',
        message_text=message_text
    )
    
    # Assert
    assert result == message_id
    mock_repository.save_message.assert_called_once_with(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_user',
        message_text=message_text,
        file_id=None
    )


@pytest.mark.asyncio
async def test_save_message_from_support(support_service, mock_repository):
    """
    Unit-тест: сохранение сообщения от поддержки
    """
    # Arrange
    session_id = 10
    telegram_id = 12345
    message_text = "Мы вам поможем"
    message_id = 101
    
    mock_repository.save_message = AsyncMock(return_value=message_id)
    
    # Act
    result = await support_service.save_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_support',
        message_text=message_text
    )
    
    # Assert
    assert result == message_id
    mock_repository.save_message.assert_called_once()


@pytest.mark.asyncio
async def test_save_message_invalid_type(support_service, mock_repository):
    """
    Edge case: невалидный тип сообщения
    """
    # Arrange
    session_id = 10
    telegram_id = 12345
    message_text = "Test"
    
    mock_repository.save_message = AsyncMock(
        side_effect=ValueError("Invalid message_type")
    )
    
    # Act & Assert
    with pytest.raises(ValueError):
        await support_service.save_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_type='invalid_type',
            message_text=message_text
        )


@pytest.mark.asyncio
async def test_save_message_with_file_id(support_service, mock_repository):
    """
    Unit-тест: сохранение сообщения с медиа-контентом
    """
    # Arrange
    session_id = 10
    telegram_id = 12345
    message_text = "Вот фото"
    file_id = "AgACAgIAAxkBAAIBY2..."
    message_id = 102
    
    mock_repository.save_message = AsyncMock(return_value=message_id)
    
    # Act
    result = await support_service.save_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_user',
        message_text=message_text,
        file_id=file_id
    )
    
    # Assert
    assert result == message_id
    call_args = mock_repository.save_message.call_args
    assert call_args.kwargs['file_id'] == file_id


@pytest.mark.asyncio
async def test_close_session_success(support_service, mock_repository):
    """
    Unit-тест: успешное закрытие сессии
    """
    # Arrange
    session_id = 10
    mock_repository.close_session = AsyncMock(return_value=True)
    
    # Act
    result = await support_service.close_session(session_id)
    
    # Assert
    assert result is True
    mock_repository.close_session.assert_called_once_with(session_id)


@pytest.mark.asyncio
async def test_close_session_not_found(support_service, mock_repository):
    """
    Edge case: закрытие несуществующей сессии
    """
    # Arrange
    session_id = 999
    mock_repository.close_session = AsyncMock(return_value=False)
    
    # Act
    result = await support_service.close_session(session_id)
    
    # Assert
    assert result is False


@pytest.mark.asyncio
async def test_get_messages(support_service, mock_repository):
    """
    Unit-тест: получение сообщений сессии
    """
    # Arrange
    session_id = 10
    messages = [
        Mock(spec=SupportMessage, id=1, message_text="Message 1"),
        Mock(spec=SupportMessage, id=2, message_text="Message 2")
    ]
    mock_repository.get_messages = AsyncMock(return_value=messages)
    
    # Act
    result = await support_service.get_messages(session_id)
    
    # Assert
    assert len(result) == 2
    assert result == messages
    mock_repository.get_messages.assert_called_once_with(
        session_id=session_id,
        limit=None,
        offset=0
    )


@pytest.mark.asyncio
async def test_get_messages_with_pagination(support_service, mock_repository):
    """
    Unit-тест: получение сообщений с пагинацией
    """
    # Arrange
    session_id = 10
    limit = 50
    offset = 100
    messages = [Mock(spec=SupportMessage) for _ in range(50)]
    mock_repository.get_messages = AsyncMock(return_value=messages)
    
    # Act
    result = await support_service.get_messages(
        session_id=session_id,
        limit=limit,
        offset=offset
    )
    
    # Assert
    assert len(result) == 50
    mock_repository.get_messages.assert_called_once_with(
        session_id=session_id,
        limit=limit,
        offset=offset
    )


@pytest.mark.asyncio
async def test_get_active_sessions(support_service, mock_repository):
    """
    Unit-тест: получение активных сессий
    """
    # Arrange
    sessions = [
        Mock(spec=SupportSession, id=1, status='active'),
        Mock(spec=SupportSession, id=2, status='active')
    ]
    mock_repository.get_active_sessions = AsyncMock(return_value=sessions)
    
    # Act
    result = await support_service.get_active_sessions()
    
    # Assert
    assert len(result) == 2
    assert result == sessions


@pytest.mark.asyncio
async def test_get_user_active_session_found(support_service, mock_repository):
    """
    Unit-тест: получение активной сессии пользователя
    """
    # Arrange
    telegram_id = 12345
    session = Mock(spec=SupportSession, id=10, telegram_id=telegram_id)
    mock_repository.get_user_active_session = AsyncMock(return_value=session)
    
    # Act
    result = await support_service.get_user_active_session(telegram_id)
    
    # Assert
    assert result == session
    assert result.telegram_id == telegram_id


@pytest.mark.asyncio
async def test_get_user_active_session_not_found(support_service, mock_repository):
    """
    Edge case: пользователь без активной сессии
    """
    # Arrange
    telegram_id = 12345
    mock_repository.get_user_active_session = AsyncMock(return_value=None)
    
    # Act
    result = await support_service.get_user_active_session(telegram_id)
    
    # Assert
    assert result is None


@pytest.mark.asyncio
async def test_mark_message_delivered(support_service, mock_repository):
    """
    Unit-тест: отметка сообщения как доставленного
    """
    # Arrange
    message_id = 100
    mock_repository.mark_message_delivered = AsyncMock(return_value=True)
    
    # Act
    result = await support_service.mark_message_delivered(message_id)
    
    # Assert
    assert result is True
    mock_repository.mark_message_delivered.assert_called_once_with(message_id)
