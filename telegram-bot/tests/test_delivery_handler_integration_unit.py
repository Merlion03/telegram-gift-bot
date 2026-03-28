"""
Unit-тесты для интеграции DeliveryHandler с NotificationService.
Проверяют конкретные сценарии и граничные случаи.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User, WebAppData
from aiogram.fsm.context import FSMContext

from handlers.delivery_handler import DeliveryHandler
from services.notification_service import NotificationResult


@pytest.fixture
def mock_sheets_service():
    """Мок Google Sheets сервиса"""
    service = AsyncMock()
    service.save_delivery_data = AsyncMock(return_value=True)
    return service


@pytest.fixture
def mock_prize_repository():
    """Мок Prize Repository"""
    repo = AsyncMock()
    repo.update_delivery_data = AsyncMock(return_value=True)
    repo._get_session_context = MagicMock()
    return repo


@pytest.fixture
def mock_prize_service():
    """Мок Prize Service"""
    service = AsyncMock()
    service.validate_prize_id = AsyncMock(return_value=True)
    return service


@pytest.fixture
def mock_notification_service():
    """Мок Notification Service"""
    service = AsyncMock()
    service.send_delivery_notifications = AsyncMock(
        return_value=NotificationResult(
            confirmation_sent=True,
            main_menu_sent=True,
            both_sent=True
        )
    )
    return service


@pytest.fixture
def mock_session_manager():
    """Мок Session Manager"""
    manager = AsyncMock()
    manager.save_bot_message = AsyncMock()
    return manager


@pytest.fixture
def delivery_handler(
    mock_sheets_service,
    mock_prize_repository,
    mock_prize_service,
    mock_notification_service,
    mock_session_manager
):
    """Создаёт DeliveryHandler с моками"""
    return DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=mock_prize_service,
        notification_service=mock_notification_service,
        session_manager=mock_session_manager
    )


def create_mock_message(telegram_id: int, prize_id: int) -> Message:
    """Создаёт мок сообщения с WebApp данными"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.web_app_data = MagicMock(spec=WebAppData)
    message.web_app_data.data = f'{{"prize_id": {prize_id}, "first_name": "Иван", "last_name": "Петров", "phone": "+79991234567"}}'
    message.answer = AsyncMock()
    return message


def create_mock_prize(telegram_id: int, prize_id: int):
    """Создаёт мок приза"""
    prize = MagicMock()
    prize.row_id = prize_id
    prize.sheet_name = "Лист1"
    prize.code_word = "ТЕСТОВЫЙ_КОД"
    prize.telegram_id = telegram_id
    prize.prize_type = "physical"
    return prize


@pytest.mark.asyncio
async def test_full_flow_with_successful_notifications(
    delivery_handler,
    mock_sheets_service,
    mock_prize_repository,
    mock_notification_service
):
    """
    Тест полного flow с успешной отправкой уведомлений
    
    Validates: Requirements 1.2, 1.3, 7.1, 7.3
    """
    # Arrange
    telegram_id = 123456
    prize_id = 42
    session_id = 1
    
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    
    prize = create_mock_prize(telegram_id, prize_id)
    
    # Мокируем _find_prize_by_id
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        # Act
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        # Assert
        # Проверяем, что данные были сохранены в Sheets
        mock_sheets_service.save_delivery_data.assert_called_once()
        
        # Проверяем, что данные были сохранены в PostgreSQL
        mock_prize_repository.update_delivery_data.assert_called_once()
        
        # Проверяем, что уведомления были отправлены
        mock_notification_service.send_delivery_notifications.assert_called_once_with(
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        # Проверяем, что FSM состояние было сброшено
        state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_abort_on_sheets_error(
    delivery_handler,
    mock_sheets_service,
    mock_notification_service
):
    """
    Тест прерывания при ошибке Sheets
    
    Validates: Requirements 1.4
    """
    # Arrange
    telegram_id = 123456
    prize_id = 42
    session_id = 1
    
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    
    prize = create_mock_prize(telegram_id, prize_id)
    
    # Sheets возвращает ошибку
    mock_sheets_service.save_delivery_data.return_value = False
    
    # Мокируем _find_prize_by_id
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        # Act
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        # Assert
        # Проверяем, что уведомления НЕ были отправлены
        mock_notification_service.send_delivery_notifications.assert_not_called()
        
        # Проверяем, что было отправлено сообщение об ошибке
        message.answer.assert_called_once()
        
        # Проверяем, что FSM состояние было сброшено (даже при ошибке)
        state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_continue_on_postgres_error(
    delivery_handler,
    mock_sheets_service,
    mock_prize_repository,
    mock_notification_service
):
    """
    Тест продолжения при ошибке PostgreSQL
    
    Validates: Requirements 1.3
    """
    # Arrange
    telegram_id = 123456
    prize_id = 42
    session_id = 1
    
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    
    prize = create_mock_prize(telegram_id, prize_id)
    
    # Sheets успешно, PostgreSQL возвращает ошибку
    mock_sheets_service.save_delivery_data.return_value = True
    mock_prize_repository.update_delivery_data.return_value = False
    
    # Мокируем _find_prize_by_id
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        # Act
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        # Assert
        # Проверяем, что уведомления БЫЛИ отправлены (несмотря на ошибку PostgreSQL)
        mock_notification_service.send_delivery_notifications.assert_called_once()
        
        # Проверяем, что FSM состояние было сброшено
        state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_fsm_state_cleared_after_notifications(
    delivery_handler,
    mock_sheets_service
):
    """
    Тест сброса FSM состояния после отправки уведомлений
    
    Validates: Requirements 3.5, 7.3
    """
    # Arrange
    telegram_id = 123456
    prize_id = 42
    session_id = 1
    
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    
    prize = create_mock_prize(telegram_id, prize_id)
    
    # Мокируем _find_prize_by_id
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        # Act
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        # Assert
        # Проверяем, что FSM состояние было сброшено ровно один раз
        state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_no_duplicate_messages(
    delivery_handler,
    mock_sheets_service,
    mock_notification_service
):
    """
    Тест отсутствия дублирующих сообщений
    
    Validates: Requirements 4.4
    """
    # Arrange
    telegram_id = 123456
    prize_id = 42
    session_id = 1
    
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    
    prize = create_mock_prize(telegram_id, prize_id)
    
    # Мокируем _find_prize_by_id
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        # Act
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        # Assert
        # Проверяем, что уведомления были отправлены ровно один раз
        mock_notification_service.send_delivery_notifications.assert_called_once()
        
        # Проверяем, что старое сообщение НЕ было отправлено
        # (message.answer вызывается только для ошибок)
        assert message.answer.call_count == 0
