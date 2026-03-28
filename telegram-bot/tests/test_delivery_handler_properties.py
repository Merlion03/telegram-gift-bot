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
from services.prize_service import PrizeService
from services.notification_service import NotificationService
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
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=AsyncMock(spec=NotificationService)
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
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act - обработка данных доставки
    await handler.handle_delivery_data(mock_message, mock_state)
    
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
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=AsyncMock(spec=NotificationService)
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
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act - обработка данных доставки
    await handler.handle_delivery_data(mock_message, mock_state)
    
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
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        notification_service=AsyncMock(spec=NotificationService)
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
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act
    await handler.handle_delivery_data(mock_message, mock_state)
    
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


# ============================================================================
# Property 17: Delivery Data Persistence (Round-Trip Consistency)
# ============================================================================

@settings(max_examples=100)
@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    prize_id=st.integers(min_value=2, max_value=10000),
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
async def test_property_17_delivery_data_persistence(
    telegram_id,
    prize_id,
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
    Property 17: Delivery Data Persistence (Round-Trip Consistency)
    
    Для любых данных доставки, полученных из WebApp, после успешного
    сохранения в Prize_Table (Google Sheets и PostgreSQL), при последующем
    чтении данных из БД они должны полностью совпадать с отправленными.
    
    Это свойство гарантирует, что:
    1. Данные корректно сохраняются без потерь
    2. Нет искажений при записи/чтении
    3. Все поля сохраняются полностью
    4. Round-trip (отправка -> сохранение -> чтение) сохраняет данные
    
    Validates: Requirements 7.8
    """
    # Arrange - подготовка исходных данных доставки
    original_delivery_data = {
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
    
    # Mock GoogleSheetsService - успешная запись
    mock_sheets_service = AsyncMock(spec=GoogleSheetsService)
    mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
    
    # Mock PrizeRepository - успешное обновление
    # Сохраняем переданные данные для последующей проверки
    saved_data = {}
    
    async def mock_update_delivery_data(telegram_id, code_word, delivery_data):
        saved_data.update(delivery_data)
        return True
    
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    mock_prize_repository.update_delivery_data = AsyncMock(side_effect=mock_update_delivery_data)
    
    # Mock Prize объект
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
        notification_service=AsyncMock(spec=NotificationService)
    )
    
    # Mock метод _find_prize_by_id
    handler._find_prize_by_id = AsyncMock(return_value=mock_prize)
    
    # Mock Message с web_app_data
    mock_message = AsyncMock()
    mock_message.from_user.id = telegram_id
    mock_message.web_app_data = Mock()
    mock_message.web_app_data.data = json.dumps({
        'prize_id': prize_id,
        **original_delivery_data
    })
    mock_message.answer = AsyncMock()
    
    # Mock FSMContext
    mock_state = AsyncMock()
    mock_state.clear = AsyncMock()
    
    # Act - обработка данных доставки (сохранение)
    await handler.handle_delivery_data(mock_message, mock_state)
    
    # Assert - проверяем round-trip consistency
    # Данные, сохранённые в PostgreSQL, должны полностью совпадать с исходными
    
    assert saved_data['last_name'] == original_delivery_data['last_name'], \
        f"Round-trip failed: last_name изменилось при сохранении"
    
    assert saved_data['first_name'] == original_delivery_data['first_name'], \
        f"Round-trip failed: first_name изменилось при сохранении"
    
    assert saved_data['patronymic'] == original_delivery_data['patronymic'], \
        f"Round-trip failed: patronymic изменилось при сохранении"
    
    assert saved_data['city'] == original_delivery_data['city'], \
        f"Round-trip failed: city изменилось при сохранении"
    
    assert saved_data['street'] == original_delivery_data['street'], \
        f"Round-trip failed: street изменилось при сохранении"
    
    assert saved_data['house'] == original_delivery_data['house'], \
        f"Round-trip failed: house изменилось при сохранении"
    
    assert saved_data['apartment'] == original_delivery_data['apartment'], \
        f"Round-trip failed: apartment изменилось при сохранении"
    
    assert saved_data['phone'] == original_delivery_data['phone'], \
        f"Round-trip failed: phone изменилось при сохранении"
    
    assert saved_data['comment'] == original_delivery_data['comment'], \
        f"Round-trip failed: comment изменилось при сохранении"
    
    # Проверяем, что все поля присутствуют (нет потерь данных)
    for field in original_delivery_data.keys():
        assert field in saved_data, \
            f"Round-trip failed: поле '{field}' потеряно при сохранении"
    
    # Проверяем полное совпадение всех данных
    assert saved_data == original_delivery_data, \
        "Round-trip consistency нарушена: сохранённые данные не совпадают с исходными"
