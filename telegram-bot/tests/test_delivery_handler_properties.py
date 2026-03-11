"""
Property-based тесты для DeliveryHandler

Property 8: Round-trip синхронизация данных доставки
Property 9: Корректность записи данных доставки в Google Sheets

Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.8
"""

import pytest
from hypothesis import given, settings, strategies as st
from unittest.mock import AsyncMock, Mock, patch
import json

from handlers.delivery_handler import DeliveryHandler
from database.models.prize import Prize
from services.google_sheets_service import GoogleSheetsService
from database.repositories.prize_repository import PrizeRepository


# ============================================================================
# Property 8: Round-trip синхронизация данных доставки
# ============================================================================

@settings(max_examples=100)
@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=3, max_size=20, alphabet=st.characters(blacklist_characters='\n\r\t')),
    last_name=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    first_name=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    patronymic=st.text(min_size=0, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    city=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    street=st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_characters='\n\r\t')),
    house=st.text(min_size=1, max_size=20, alphabet=st.characters(blacklist_characters='\n\r\t')),
    apartment=st.text(min_size=0, max_size=20, alphabet=st.characters(blacklist_characters='\n\r\t')),
    phone=st.text(min_size=10, max_size=20, alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='+-()')),
    comment=st.text(min_size=0, max_size=200, alphabet=st.characters(blacklist_characters='\n\r\t'))
)
@pytest.mark.asyncio
async def test_property_8_round_trip_delivery_data_sync(
    telegram_id,
    code_word,
    last_name,
    first_name,
    patronymic,
    city,
    street,
    house,
    apartment,
    phone,
    comment
):
    """
    Property 8: Round-trip синхронизация данных доставки
    Feature: telegram-bot-postgres-sync
    
    Для любых данных доставки физического приза, после успешной записи 
    в Google Sheets бот должен также обновить соответствующие поля 
    в PostgreSQL. При последующем чтении из PostgreSQL данные должны 
    совпадать с записанными.
    
    Validates: Requirements 4.8
    """
    # Arrange - подготовка данных доставки
    delivery_data = {
        'last_name': last_name,
        'first_name': first_name,
        'patronymic': patronymic,
        'city': city,
        'street': street,
        'house': house,
        'apartment': apartment,
        'phone': phone,
        'comment': comment
    }
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock Prize объект
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.sheet_name = code_word
    mock_prize.row_id = 2
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message с web_app_data
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': 2,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Act - обработка данных доставки
    await handler.handle_delivery_data(mock_message)
    
    # Assert - проверяем, что данные записаны в Sheets
    mock_sheets_service.save_delivery_data.assert_called_once()
    sheets_call_args = mock_sheets_service.save_delivery_data.call_args
    
    assert sheets_call_args[1]['row_id'] == 2
    assert sheets_call_args[1]['worksheet_name'] == code_word
    
    sheets_delivery_data = sheets_call_args[1]['delivery_data']
    assert sheets_delivery_data['last_name'] == last_name
    assert sheets_delivery_data['first_name'] == first_name
    assert sheets_delivery_data['patronymic'] == patronymic
    assert sheets_delivery_data['city'] == city
    assert sheets_delivery_data['street'] == street
    assert sheets_delivery_data['house'] == house
    assert sheets_delivery_data['apartment'] == apartment
    assert sheets_delivery_data['phone'] == phone
    assert sheets_delivery_data['comment'] == comment
    
    # Assert - проверяем, что данные обновлены в PostgreSQL
    mock_prize_repository.update_delivery_data.assert_called_once()
    postgres_call_args = mock_prize_repository.update_delivery_data.call_args
    
    assert postgres_call_args[1]['telegram_id'] == telegram_id
    assert postgres_call_args[1]['code_word'] == code_word
    
    postgres_delivery_data = postgres_call_args[1]['delivery_data']
    assert postgres_delivery_data['last_name'] == last_name
    assert postgres_delivery_data['first_name'] == first_name
    assert postgres_delivery_data['patronymic'] == patronymic
    assert postgres_delivery_data['city'] == city
    assert postgres_delivery_data['street'] == street
    assert postgres_delivery_data['house'] == house
    assert postgres_delivery_data['apartment'] == apartment
    assert postgres_delivery_data['phone'] == phone
    assert postgres_delivery_data['comment'] == comment
    
    # Assert - проверяем, что данные в Sheets и PostgreSQL идентичны
    assert sheets_delivery_data == postgres_delivery_data, \
        "Данные в Google Sheets и PostgreSQL должны быть идентичными"


# ============================================================================
# Property 9: Корректность записи данных доставки в Google Sheets
# ============================================================================

@settings(max_examples=100)
@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    sheet_name=st.text(min_size=3, max_size=20, alphabet=st.characters(blacklist_characters='\n\r\t')),
    row_id=st.integers(min_value=2, max_value=10000),
    last_name=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    first_name=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    city=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\n\r\t')),
    street=st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_characters='\n\r\t')),
    house=st.text(min_size=1, max_size=20, alphabet=st.characters(blacklist_characters='\n\r\t')),
    phone=st.text(min_size=10, max_size=20, alphabet=st.characters(whitelist_categories=('Nd',), whitelist_characters='+-()')),
)
@pytest.mark.asyncio
async def test_property_9_correct_sheets_write_location(
    telegram_id,
    sheet_name,
    row_id,
    last_name,
    first_name,
    city,
    street,
    house,
    phone
):
    """
    Property 9: Корректность записи данных доставки в Google Sheets
    Feature: telegram-bot-postgres-sync
    
    Для любых данных доставки физического приза, при записи в Google Sheets 
    бот должен использовать sheet_name и row_id из Prize_Record для 
    определения целевого листа и строки, и должен обновить все указанные 
    колонки (E-M) одним batch update запросом.
    
    Validates: Requirements 4.1, 4.2, 4.3, 4.4
    """
    # Arrange - подготовка данных
    delivery_data = {
        'last_name': last_name,
        'first_name': first_name,
        'patronymic': '',
        'city': city,
        'street': street,
        'house': house,
        'apartment': '',
        'phone': phone,
        'comment': ''
    }
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock Prize объект с конкретными sheet_name и row_id
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = sheet_name
    mock_prize.sheet_name = sheet_name
    mock_prize.row_id = row_id
    mock_prize.prize_type = 'physical'
    
    # Создаём handler
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message с web_app_data
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': row_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Act - обработка данных доставки
    await handler.handle_delivery_data(mock_message)
    
    # Assert - проверяем, что save_delivery_data вызван с правильными параметрами
    mock_sheets_service.save_delivery_data.assert_called_once()
    call_args = mock_sheets_service.save_delivery_data.call_args
    
    # Проверяем, что используется правильный row_id из Prize
    assert call_args[1]['row_id'] == row_id, \
        f"Должен использоваться row_id={row_id} из Prize_Record"
    
    # Проверяем, что используется правильный sheet_name из Prize
    assert call_args[1]['worksheet_name'] == sheet_name, \
        f"Должен использоваться sheet_name='{sheet_name}' из Prize_Record"
    
    # Проверяем, что все поля доставки переданы
    passed_delivery_data = call_args[1]['delivery_data']
    assert 'last_name' in passed_delivery_data
    assert 'first_name' in passed_delivery_data
    assert 'patronymic' in passed_delivery_data
    assert 'city' in passed_delivery_data
    assert 'street' in passed_delivery_data
    assert 'house' in passed_delivery_data
    assert 'apartment' in passed_delivery_data
    assert 'phone' in passed_delivery_data
    assert 'comment' in passed_delivery_data
    
    # Проверяем, что значения совпадают
    assert passed_delivery_data['last_name'] == last_name
    assert passed_delivery_data['first_name'] == first_name
    assert passed_delivery_data['city'] == city
    assert passed_delivery_data['street'] == street
    assert passed_delivery_data['house'] == house
    assert passed_delivery_data['phone'] == phone


# ============================================================================
# Property 9.1: Batch update для всех полей доставки
# ============================================================================

@settings(max_examples=50)
@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    row_id=st.integers(min_value=2, max_value=1000)
)
@pytest.mark.asyncio
async def test_property_9_1_batch_update_all_fields(telegram_id, row_id):
    """
    Property 9.1: Batch update для всех полей доставки
    Feature: telegram-bot-postgres-sync
    
    Для любых данных доставки, метод save_delivery_data должен 
    обновлять все 9 полей (E-M) одним batch update запросом.
    
    Validates: Requirements 4.4
    """
    # Arrange
    delivery_data = {
        'last_name': 'Тест',
        'first_name': 'Тестович',
        'patronymic': 'Тестовый',
        'city': 'Москва',
        'street': 'Тестовая',
        'house': '1',
        'apartment': '1',
        'phone': '+79991234567',
        'comment': 'Тестовый комментарий'
    }
    
    # Mock GoogleSheetsService
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(return_value=True)
    
    # Mock Prize
    mock_prize = Mock(spec=Prize)
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = 'test'
    mock_prize.sheet_name = 'test'
    mock_prize.row_id = row_id
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
        'prize_id': row_id,
        **delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message)
    
    # Assert - проверяем, что save_delivery_data вызван ровно один раз
    # (это означает batch update, а не отдельные запросы для каждого поля)
    assert mock_sheets_service.save_delivery_data.call_count == 1, \
        "save_delivery_data должен быть вызван ровно один раз (batch update)"
    
    # Проверяем, что все 9 полей переданы в одном вызове
    call_args = mock_sheets_service.save_delivery_data.call_args
    passed_data = call_args[1]['delivery_data']
    
    expected_fields = [
        'last_name', 'first_name', 'patronymic',
        'city', 'street', 'house', 'apartment',
        'phone', 'comment'
    ]
    
    for field in expected_fields:
        assert field in passed_data, \
            f"Поле '{field}' должно быть передано в batch update"
