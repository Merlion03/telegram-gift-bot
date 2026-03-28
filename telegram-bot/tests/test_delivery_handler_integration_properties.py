"""
Property-based тесты для интеграции DeliveryHandler с NotificationService.
Проверяют универсальные свойства корректности интеграции.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from hypothesis import given, settings, strategies as st, HealthCheck
from aiogram.types import Message, User, WebAppInfo, WebAppData
from aiogram.fsm.context import FSMContext

from handlers.delivery_handler import DeliveryHandler
from services.notification_service import NotificationResult


# Стратегии для генерации тестовых данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
prize_ids = st.integers(min_value=1, max_value=100000)
session_ids = st.one_of(st.none(), st.integers(min_value=1, max_value=100000))


def create_mock_message(telegram_id: int, prize_id: int) -> Message:
    """Создаёт мок сообщения с WebApp данными"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.web_app_data = MagicMock(spec=WebAppData)
    message.web_app_data.data = f'{{"prize_id": {prize_id}, "first_name": "Test", "last_name": "User", "phone": "+1234567890"}}'
    message.answer = AsyncMock()
    return message


def create_mock_prize(telegram_id: int, prize_id: int):
    """Создаёт мок приза"""
    prize = MagicMock()
    prize.row_id = prize_id
    prize.sheet_name = "test_sheet"
    prize.code_word = "test_code"
    prize.telegram_id = telegram_id
    prize.prize_type = "physical"
    return prize


def create_delivery_handler():
    """Создаёт DeliveryHandler с новыми моками для каждого теста"""
    mock_sheets_service = AsyncMock()
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    mock_prize_repository = AsyncMock()
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    mock_prize_repository._get_session_context = MagicMock()
    
    mock_prize_service = AsyncMock()
    mock_prize_service.validate_prize_id = AsyncMock(return_value=True)
    
    mock_notification_service = AsyncMock()
    mock_notification_service.send_delivery_notifications = AsyncMock(
        return_value=NotificationResult(
            confirmation_sent=True,
            main_menu_sent=True,
            both_sent=True
        )
    )
    
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=mock_prize_service,
        notification_service=mock_notification_service,
        session_manager=mock_session_manager
    )
    
    return handler, mock_sheets_service, mock_prize_repository, mock_notification_service


# Feature: request-tracking-and-chat-notifications, Property 1: Логирование получения запроса
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_1_request_logging(telegram_id, prize_id, session_id):
    """Property 1: Логирование получения запроса. Validates: Requirements 5.1"""
    delivery_handler, _, _, _ = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        with patch('handlers.delivery_handler.logger') as mock_logger:
            await delivery_handler.handle_delivery_data(message, state, session_id)
            
            request_received_calls = [
                call for call in mock_logger.info.call_args_list
                if call[0][0] == "request_received"
            ]
            
            assert len(request_received_calls) > 0
            call_kwargs = request_received_calls[0][1]
            assert call_kwargs['telegram_id'] == telegram_id
            assert call_kwargs['prize_id'] == prize_id


# Feature: request-tracking-and-chat-notifications, Property 2: Инициация уведомлений после успешного сохранения
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids,
    postgres_success=st.booleans()
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_2_notifications_after_sheets_success(telegram_id, prize_id, session_id, postgres_success):
    """Property 2: Инициация уведомлений после успешного сохранения. Validates: Requirements 1.2, 1.3"""
    delivery_handler, mock_sheets_service, mock_prize_repository, mock_notification_service = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = True
    mock_prize_repository.update_delivery_data.return_value = postgres_success
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        mock_notification_service.send_delivery_notifications.assert_called_once()
        call_kwargs = mock_notification_service.send_delivery_notifications.call_args[1]
        assert call_kwargs['telegram_id'] == telegram_id
        assert call_kwargs['prize_id'] == prize_id
        assert call_kwargs['session_id'] == session_id


# Feature: request-tracking-and-chat-notifications, Property 3: Прерывание при ошибке Sheets
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_3_abort_on_sheets_error(telegram_id, prize_id, session_id):
    """Property 3: Прерывание при ошибке Sheets. Validates: Requirements 1.4"""
    delivery_handler, mock_sheets_service, _, mock_notification_service = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = False
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        mock_notification_service.send_delivery_notifications.assert_not_called()
        message.answer.assert_called_once()


# Feature: request-tracking-and-chat-notifications, Property 9: Сброс FSM состояния
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_9_fsm_state_cleared(telegram_id, prize_id, session_id):
    """Property 9: Сброс FSM состояния. Validates: Requirements 3.5"""
    delivery_handler, mock_sheets_service, _, _ = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = True
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        await delivery_handler.handle_delivery_data(message, state, session_id)
        state.clear.assert_called_once()


# Feature: request-tracking-and-chat-notifications, Property 10: Завершение обработки
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_10_processing_completes(telegram_id, prize_id, session_id):
    """Property 10: Завершение обработки. Validates: Requirements 4.3"""
    delivery_handler, mock_sheets_service, _, mock_notification_service = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = True
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        mock_notification_service.send_delivery_notifications.assert_called_once()
        state.clear.assert_called_once()


# Feature: request-tracking-and-chat-notifications, Property 14: Обработка ошибки второго сообщения
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_14_second_message_error_handling(telegram_id, prize_id, session_id):
    """Property 14: Обработка ошибки второго сообщения. Validates: Requirements 6.2"""
    delivery_handler, mock_sheets_service, _, mock_notification_service = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = True
    mock_notification_service.send_delivery_notifications.return_value = NotificationResult(
        confirmation_sent=True,
        main_menu_sent=False,
        both_sent=False
    )
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        with patch('handlers.delivery_handler.logger') as mock_logger:
            await delivery_handler.handle_delivery_data(message, state, session_id)
            
            state.clear.assert_called_once()
            
            notification_sent_calls = [
                call for call in mock_logger.info.call_args_list
                if call[0][0] == "delivery_notifications_sent"
            ]
            
            assert len(notification_sent_calls) > 0
            call_kwargs = notification_sent_calls[0][1]
            assert call_kwargs['main_menu_sent'] is False


# Feature: request-tracking-and-chat-notifications, Property 15: Сохранение данных при ошибке отправки
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=20,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_15_data_preserved_on_notification_error(telegram_id, prize_id, session_id):
    """Property 15: Сохранение данных при ошибке отправки. Validates: Requirements 6.3"""
    delivery_handler, mock_sheets_service, mock_prize_repository, mock_notification_service = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = True
    mock_prize_repository.update_delivery_data.return_value = True
    mock_notification_service.send_delivery_notifications.return_value = NotificationResult(
        confirmation_sent=False,
        main_menu_sent=False,
        both_sent=False
    )
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        await delivery_handler.handle_delivery_data(message, state, session_id)
        
        mock_sheets_service.save_delivery_data.assert_called_once()
        mock_prize_repository.update_delivery_data.assert_called_once()
        state.clear.assert_called_once()


# Feature: request-tracking-and-chat-notifications, Property 6: Производительность отправки уведомлений
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@settings(
    max_examples=10,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@pytest.mark.asyncio
async def test_property_6_notification_performance(telegram_id, prize_id, session_id):
    """Property 6: Производительность отправки уведомлений. Validates: Requirements 2.4, 3.4"""
    import time
    
    delivery_handler, mock_sheets_service, _, _ = create_delivery_handler()
    message = create_mock_message(telegram_id, prize_id)
    state = AsyncMock(spec=FSMContext)
    state.clear = AsyncMock()
    prize = create_mock_prize(telegram_id, prize_id)
    
    mock_sheets_service.save_delivery_data.return_value = True
    
    with patch.object(delivery_handler, '_find_prize_by_id', return_value=prize):
        start_time = time.time()
        await delivery_handler.handle_delivery_data(message, state, session_id)
        elapsed_time = time.time() - start_time
        
        assert elapsed_time < 2.0, f"Время выполнения {elapsed_time:.2f}s превышает 2 секунды"
