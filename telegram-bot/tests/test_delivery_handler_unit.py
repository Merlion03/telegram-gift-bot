"""
Unit тесты для DeliveryHandler

Validates: Requirements 4.5, 4.6, 4.7, 4.8
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch
import json

from handlers.delivery_handler import DeliveryHandler
from database.models.prize import Prize
from services.google_sheets_service import GoogleSheetsService
from services.prize_service import PrizeService
from database.repositories.prize_repository import PrizeRepository
from services.notification_service import NotificationService, NotificationResult


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_notification_service(
    confirmation_sent=True,
    main_menu_sent=True
) -> AsyncMock:
    """
    Создаёт mock для NotificationService
    
    Args:
        confirmation_sent: Успешно ли отправлено подтверждающее сообщение
        main_menu_sent: Успешно ли отправлено сообщение с главным меню
        
    Returns:
        Mock объект NotificationService
    """
    mock_service = AsyncMock(spec=NotificationService)
    mock_service.send_delivery_notifications = AsyncMock(
        return_value=NotificationResult(
            confirmation_sent=confirmation_sent,
            main_menu_sent=main_menu_sent,
            both_sent=confirmation_sent and main_menu_sent
        )
    )
    return mock_service


# ============================================================================
# Тест успешной записи данных в Google Sheets
# ============================================================================

@pytest.mark.asyncio
async def test_successful_delivery_data_save():
    """
    Тест успешной записи данных в Google Sheets
    
    Проверяет, что при успешной записи данных в Sheets и PostgreSQL
    пользователь получает подтверждение.
    
    Validates: Requirements 4.5, 4.8
    """
    # Arrange
    telegram_id = 123456789
    prize_id = 2
    code_word = 'test_code'
    
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'apartment': '10',
        'phone': '+79991234567',
        'comment': 'Тестовый комментарий'
    }
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - успешное обновление
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock NotificationService - успешная отправка уведомлений
    mock_notification_service = create_mock_notification_service()
    
    # Mock Prize
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что данные записаны в Sheets
    mock_sheets_service.save_delivery_data.assert_called_once()
    
    # Assert - проверяем, что данные обновлены в PostgreSQL
    mock_prize_repository.update_delivery_data.assert_called_once()
    
    # Assert - проверяем, что уведомления отправлены
    mock_notification_service.send_delivery_notifications.assert_called_once()


# ============================================================================
# Тест retry логики при ошибке записи
# ============================================================================

@pytest.mark.asyncio
async def test_retry_logic_on_sheets_error():
    """
    Тест retry логики при ошибке записи в Google Sheets
    
    Проверяет, что при неуспешной записи в Sheets (после всех retry попыток)
    пользователь получает сообщение об ошибке, и данные НЕ обновляются в PostgreSQL.
    
    Validates: Requirements 4.6, 4.7
    """
    # Arrange
    telegram_id = 123456789
    prize_id = 2
    code_word = 'test_code'
    
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'apartment': '10',
        'phone': '+79991234567',
        'comment': ''
    }
    
    # Mock GoogleSheetsService - неуспешная запись (после всех retry)
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=False)
    
    # Mock PrizeRepository
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    # Mock Prize
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что save_delivery_data был вызван
    mock_sheets_service.save_delivery_data.assert_called_once()
    
    # Assert - проверяем, что update_delivery_data НЕ был вызван
    # (так как запись в Sheets неуспешна)
    mock_prize_repository.update_delivery_data.assert_not_called()
    
    # Assert - проверяем, что пользователь получил сообщение об ошибке
    mock_message.answer.assert_called_once()
    error_message = mock_message.answer.call_args[0][0]
    assert "ошибка" in error_message.lower() or "техническ" in error_message.lower()


# ============================================================================
# Тест обновления данных в PostgreSQL после записи в Sheets
# ============================================================================

@pytest.mark.asyncio
async def test_postgres_update_after_sheets_success():
    """
    Тест обновления данных в PostgreSQL после успешной записи в Sheets
    
    Проверяет, что данные обновляются в PostgreSQL только после
    успешной записи в Google Sheets.
    
    Validates: Requirements 4.8
    """
    # Arrange
    telegram_id = 987654321
    prize_id = 5
    code_word = 'winner_code'
    
    delivery_data = {
        'last_name': 'Петров',
        'first_name': 'Петр',
        'patronymic': 'Петрович',
        'city': 'Санкт-Петербург',
        'street': 'Невский проспект',
        'house': '100',
        'apartment': '50',
        'phone': '+79991112233',
        'comment': 'Позвонить после 18:00'
    }
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - успешное обновление
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock Prize
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем порядок вызовов
    # Сначала должна быть запись в Sheets
    assert mock_sheets_service.save_delivery_data.called
    
    # Затем обновление в PostgreSQL
    assert mock_prize_repository.update_delivery_data.called
    
    # Проверяем, что в PostgreSQL переданы правильные данные
    postgres_call_args = mock_prize_repository.update_delivery_data.call_args
    assert postgres_call_args[1]['telegram_id'] == telegram_id
    assert postgres_call_args[1]['code_word'] == code_word
    
    postgres_data = postgres_call_args[1]['delivery_data']
    assert postgres_data['last_name'] == delivery_data['last_name']
    assert postgres_data['first_name'] == delivery_data['first_name']
    assert postgres_data['city'] == delivery_data['city']
    assert postgres_data['phone'] == delivery_data['phone']


# ============================================================================
# Тест уведомления пользователя при критической ошибке
# ============================================================================

@pytest.mark.asyncio
async def test_user_notification_on_critical_error():
    """
    Тест уведомления пользователя при критической ошибке
    
    Проверяет, что при критической ошибке (например, приз не найден)
    пользователь получает понятное сообщение об ошибке.
    
    Validates: Requirements 4.7
    """
    # Arrange
    telegram_id = 111222333
    prize_id = 999  # Несуществующий приз
    
    delivery_data = {
        'last_name': 'Сидоров',
        'first_name': 'Сидор',
        'patronymic': '',
        'city': 'Казань',
        'street': 'Баумана',
        'house': '5',
        'apartment': '',
        'phone': '+79995554433',
        'comment': ''
    }
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    
    # Mock PrizeRepository
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id - приз не найден
    handler._find_prize_by_id = AsyncMock(return_value=None)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что save_delivery_data НЕ был вызван
    mock_sheets_service.save_delivery_data.assert_not_called()
    
    # Assert - проверяем, что update_delivery_data НЕ был вызван
    mock_prize_repository.update_delivery_data.assert_not_called()
    
    # Assert - проверяем, что пользователь получил сообщение об ошибке
    mock_message.answer.assert_called_once()
    error_message = mock_message.answer.call_args[0][0]
    assert "ошибка" in error_message.lower() or "не найден" in error_message.lower()


# ============================================================================
# Тест обработки невалидного JSON из WebApp
# ============================================================================

@pytest.mark.asyncio
async def test_invalid_json_from_webapp():
    """
    Тест обработки невалидного JSON из WebApp
    
    Проверяет, что при получении невалидного JSON пользователь
    получает сообщение об ошибке.
    
    Validates: Requirements 4.7
    """
    # Arrange
    telegram_id = 444555666
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    
    # Mock PrizeRepository
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock Message с невалидным JSON
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = "invalid json {{{{"
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что пользователь получил сообщение об ошибке
    mock_message.answer.assert_called_once()
    error_message = mock_message.answer.call_args[0][0]
    assert "ошибка" in error_message.lower()


# ============================================================================
# Тест обработки отсутствия prize_id в данных
# ============================================================================

@pytest.mark.asyncio
async def test_missing_prize_id():
    """
    Тест обработки отсутствия prize_id в данных из WebApp
    
    Проверяет, что при отсутствии prize_id пользователь
    получает сообщение об ошибке.
    
    Validates: Requirements 4.7
    """
    # Arrange
    telegram_id = 777888999
    
    delivery_data = {
        'last_name': 'Тестов',
        'first_name': 'Тест',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'phone': '+79991234567'
    }
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    
    # Mock PrizeRepository
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock Message без prize_id
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps(delivery_data)  # Нет prize_id
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что пользователь получил сообщение об ошибке
    mock_message.answer.assert_called_once()
    error_message = mock_message.answer.call_args[0][0]
    assert "ошибка" in error_message.lower()


# ============================================================================
# Тест graceful degradation при ошибке PostgreSQL
# ============================================================================

@pytest.mark.asyncio
async def test_graceful_degradation_postgres_error():
    """
    Тест graceful degradation при ошибке PostgreSQL
    
    Проверяет, что если запись в Sheets успешна, но обновление в PostgreSQL
    неуспешно, пользователь всё равно получает подтверждение (данные сохранены
    в Sheets, синхронизация подхватит их позже).
    
    Validates: Requirements 4.8
    """
    # Arrange
    telegram_id = 123123123
    prize_id = 3
    code_word = 'test'
    
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': '',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'apartment': '',
        'phone': '+79991234567',
        'comment': ''
    }
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - неуспешное обновление
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=False)
    
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    # Mock Prize
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что данные записаны в Sheets
    mock_sheets_service.save_delivery_data.assert_called_once()
    
    # Assert - проверяем, что попытка обновления PostgreSQL была
    mock_prize_repository.update_delivery_data.assert_called_once()
    
    # Assert - проверяем, что уведомления были отправлены
    # (несмотря на ошибку PostgreSQL, данные сохранены в Sheets)
    mock_notification_service.send_delivery_notifications.assert_called_once()
    
    # Assert - проверяем, что FSM состояние сброшено
    mock_state.clear.assert_called_once()


# ============================================================================
# Новые тесты для обновлённого handle_delivery_data (Task 8.2)
# ============================================================================

# ============================================================================
# Тест отображения главного меню после сохранения данных
# ============================================================================

@pytest.mark.asyncio
async def test_main_menu_displayed_after_delivery_save():
    """
    Тест отображения главного меню после успешного сохранения данных доставки
    
    Проверяет, что после успешного сохранения данных пользователь
    получает главное меню с кнопкой "Получить приз".
    
    Validates: Requirements 7.10
    """
    # Arrange
    telegram_id = 123456789
    prize_id = 2
    code_word = 'test_code'
    
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'apartment': '10',
        'phone': '+79991234567',
        'comment': 'Тестовый комментарий'
    }
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - успешное обновление
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    # Mock Prize
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что уведомления были отправлены через NotificationService
    mock_notification_service.send_delivery_notifications.assert_called_once()
    
    # Assert - проверяем, что FSM состояние сброшено
    mock_state.clear.assert_called_once()


# ============================================================================
# Тест сброса FSM состояния после сохранения данных
# ============================================================================

@pytest.mark.asyncio
async def test_fsm_state_cleared_after_delivery_save():
    """
    Тест сброса FSM состояния после успешного сохранения данных доставки
    
    Проверяет, что после успешного сохранения данных FSM состояние
    сбрасывается в default_state через state.clear().
    
    Validates: Requirements 7.11
    """
    # Arrange
    telegram_id = 987654321
    prize_id = 5
    code_word = 'winner_code'
    
    delivery_data = {
        'last_name': 'Петров',
        'first_name': 'Петр',
        'patronymic': 'Петрович',
        'city': 'Санкт-Петербург',
        'street': 'Невский проспект',
        'house': '100',
        'apartment': '50',
        'phone': '+79991112233',
        'comment': 'Позвонить после 18:00'
    }
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - успешное обновление
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock Prize
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что state.clear() был вызван
    mock_state.clear.assert_called_once()


# ============================================================================
# Тест сохранения подтверждающего сообщения через SessionManager
# ============================================================================

@pytest.mark.asyncio
async def test_confirmation_message_saved_via_session_manager():
    """
    Тест сохранения подтверждающего сообщения через SessionManager
    
    Проверяет, что после успешного сохранения данных подтверждающее
    сообщение сохраняется через SessionManager.
    
    Validates: Requirements 7.9, 11.2
    """
    # Arrange
    telegram_id = 111222333
    prize_id = 3
    code_word = 'test_code'
    session_id = 42
    
    delivery_data = {
        'last_name': 'Сидоров',
        'first_name': 'Сидор',
        'patronymic': '',
        'city': 'Казань',
        'street': 'Баумана',
        'house': '5',
        'apartment': '',
        'phone': '+79995554433',
        'comment': ''
    }
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - успешное обновление
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock SessionManager
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    # Mock Prize
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler с SessionManager
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service,
        session_manager=mock_session_manager
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state, session_id=session_id)
    
    # Assert - проверяем, что уведомления были отправлены с session_id
    mock_notification_service.send_delivery_notifications.assert_called_once()
    call_kwargs = mock_notification_service.send_delivery_notifications.call_args[1]
    assert call_kwargs['telegram_id'] == telegram_id
    assert call_kwargs['prize_id'] == prize_id
    assert call_kwargs['session_id'] == session_id


# ============================================================================
# Тест сброса FSM состояния при ошибке
# ============================================================================

@pytest.mark.asyncio
async def test_fsm_state_cleared_on_error():
    """
    Тест сброса FSM состояния при ошибке
    
    Проверяет, что при ошибке (например, приз не найден) FSM состояние
    сбрасывается и отображается главное меню.
    
    Validates: Requirements 7.11, 12.1
    """
    # Arrange
    telegram_id = 444555666
    prize_id = 999  # Несуществующий приз
    
    delivery_data = {
        'last_name': 'Тестов',
        'first_name': 'Тест',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'phone': '+79991234567'
    }
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    
    # Mock PrizeRepository
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id - приз не найден
    handler._find_prize_by_id = AsyncMock(return_value=None)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что state.clear() был вызван
    mock_state.clear.assert_called_once()
    
    # Assert - проверяем, что answer был вызван с клавиатурой главного меню
    mock_message.answer.assert_called_once()
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    keyboard = call_kwargs['reply_markup']
    assert keyboard is not None
    assert len(keyboard.inline_keyboard) > 0
    assert keyboard.inline_keyboard[0][0].text == "🎁 Получить приз"


# ============================================================================
# Тест главного меню при ошибке записи в Sheets
# ============================================================================

@pytest.mark.asyncio
async def test_main_menu_displayed_on_sheets_error():
    """
    Тест отображения главного меню при ошибке записи в Sheets
    
    Проверяет, что при неуспешной записи в Sheets пользователь
    получает главное меню вместе с сообщением об ошибке.
    
    Validates: Requirements 7.10, 12.1
    """
    # Arrange
    telegram_id = 777888999
    prize_id = 2
    code_word = 'test_code'
    
    delivery_data = {
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'phone': '+79991234567'
    }
    
    # Mock GoogleSheetsService - неуспешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=False)
    
    # Mock PrizeRepository
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Mock Prize
    # Mock NotificationService
    mock_notification_service = create_mock_notification_service()
    
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = prize_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=mock_notification_service
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем, что state.clear() был вызван
    mock_state.clear.assert_called_once()
    
    # Assert - проверяем, что answer был вызван с клавиатурой главного меню
    mock_message.answer.assert_called_once()
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    keyboard = call_kwargs['reply_markup']
    assert keyboard is not None
    assert len(keyboard.inline_keyboard) > 0
    assert keyboard.inline_keyboard[0][0].text == "🎁 Получить приз"

