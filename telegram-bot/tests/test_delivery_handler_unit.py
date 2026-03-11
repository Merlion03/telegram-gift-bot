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
from database.repositories.prize_repository import PrizeRepository


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
        prize_repository=mock_prize_repository
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
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
    # Assert - проверяем, что данные записаны в Sheets
    mock_sheets_service.save_delivery_data.assert_called_once()
    
    # Assert - проверяем, что данные обновлены в PostgreSQL
    mock_prize_repository.update_delivery_data.assert_called_once()
    
    # Assert - проверяем, что пользователь получил подтверждение
    mock_message.answer.assert_called_once()
    success_message = mock_message.answer.call_args[0][0]
    assert "успешно сохранены" in success_message.lower()


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
        prize_repository=mock_prize_repository
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
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
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
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
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
        prize_repository=mock_prize_repository
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
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
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
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository
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
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
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
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository
    )
    
    # Mock Message с невалидным JSON
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = "invalid json {{{{"
    mock_message.answer = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
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
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository
    )
    
    # Mock Message без prize_id
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps(delivery_data)  # Нет prize_id
    mock_message.answer = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
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
        prize_repository=mock_prize_repository
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
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
    # Assert - проверяем, что данные записаны в Sheets
    mock_sheets_service.save_delivery_data.assert_called_once()
    
    # Assert - проверяем, что попытка обновления PostgreSQL была
    mock_prize_repository.update_delivery_data.assert_called_once()
    
    # Assert - проверяем, что пользователь получил подтверждение
    # (несмотря на ошибку PostgreSQL, данные сохранены в Sheets)
    mock_message.answer.assert_called_once()
    success_message = mock_message.answer.call_args[0][0]
    assert "успешно" in success_message.lower()
