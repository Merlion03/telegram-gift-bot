"""
Тесты для GoogleSheetsService.
Включает property-based тесты и unit-тесты для edge cases.
"""

import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import gspread
import sys
from pathlib import Path

# Добавляем корневую директорию проекта в путь
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.google_sheets_service import GoogleSheetsService


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_gspread_client():
    """Создаёт mock клиента gspread"""
    client = Mock(spec=gspread.Client)
    return client


@pytest.fixture
def mock_spreadsheet():
    """Создаёт mock spreadsheet"""
    spreadsheet = Mock(spec=gspread.Spreadsheet)
    return spreadsheet


@pytest.fixture
def mock_worksheet():
    """Создаёт mock worksheet"""
    worksheet = Mock(spec=gspread.Worksheet)
    return worksheet


@pytest.fixture
def google_sheets_service(tmp_path):
    """
    Создаёт экземпляр GoogleSheetsService с mock credentials
    """
    # Создаём временный файл credentials
    credentials_file = tmp_path / "credentials.json"
    credentials_file.write_text('{"type": "service_account", "project_id": "test"}')
    
    with patch('services.google_sheets_service.Credentials') as mock_creds, \
         patch('services.google_sheets_service.gspread.authorize') as mock_authorize:
        
        mock_creds.from_service_account_file.return_value = Mock()
        mock_client = Mock(spec=gspread.Client)
        mock_authorize.return_value = mock_client
        
        service = GoogleSheetsService(
            credentials_path=str(credentials_file),
            spreadsheet_id="test_spreadsheet_id"
        )
        service.client = mock_client
        
        yield service


# ============================================================================
# Property 1: Корректный поиск приза в Google Sheets
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))),
    prize_type=st.sampled_from(['digital', 'physical'])
)
@settings(max_examples=100, deadline=None)
@pytest.mark.asyncio
async def test_property_1_prize_lookup_digital(telegram_id, code_word, prize_type):
    """
    Property 1: Корректный поиск приза в Google Sheets
    Feature: telegram-bot-webapp-system, Property 1
    
    Validates: Requirements 1.2, 2.1
    
    Для любого Telegram ID и кодового слова, если ID присутствует в таблице,
    система должна корректно извлечь тип приза и связанные данные
    (промокод для digital или row_id для physical)
    """
    # Arrange: создаём GoogleSheetsService с mock (без использования fixtures)
    import tempfile
    import os
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        credentials_file = os.path.join(tmp_dir, "credentials.json")
        with open(credentials_file, 'w') as f:
            f.write('{"type": "service_account", "project_id": "test"}')
        
        with patch('services.google_sheets_service.Credentials') as mock_creds, \
             patch('services.google_sheets_service.gspread.authorize') as mock_authorize:
            
            mock_creds.from_service_account_file.return_value = Mock()
            mock_client = Mock(spec=gspread.Client)
            mock_authorize.return_value = mock_client
            
            google_sheets_service = GoogleSheetsService(
                credentials_path=credentials_file,
                spreadsheet_id="test_spreadsheet_id"
            )
            google_sheets_service.client = mock_client
            
            # Настраиваем mock для возврата данных приза
            mock_spreadsheet = Mock(spec=gspread.Spreadsheet)
            mock_worksheet = Mock(spec=gspread.Worksheet)
            mock_cell = Mock()
            mock_cell.row = 5
            
            google_sheets_service.client.open_by_key.return_value = mock_spreadsheet
            mock_spreadsheet.worksheet.return_value = mock_worksheet
            mock_worksheet.find.return_value = mock_cell
            
            # Формируем данные строки в зависимости от типа приза
            if prize_type == 'digital':
                row_values = [
                    str(telegram_id),
                    'digital',
                    'PROMO123',
                    'Use this code at checkout'
                ]
            else:
                row_values = [
                    str(telegram_id),
                    'physical',
                    '',
                    ''
                ]
            
            mock_worksheet.row_values.return_value = row_values
            
            # Act: выполняем поиск
            result = await google_sheets_service.find_winner(telegram_id, code_word)
            
            # Assert: проверяем корректность извлечённых данных
            assert result is not None, "Результат не должен быть None для существующего ID"
            assert result['telegram_id'] == telegram_id, "Telegram ID должен совпадать"
            assert result['prize_type'] in ['digital', 'physical'], "Тип приза должен быть digital или physical"
            assert result['row_id'] == 5, "row_id должен совпадать с номером строки"
            
            # Проверяем специфичные поля для типа приза
            if prize_type == 'digital':
                assert 'promo_code' in result, "Для digital приза должен быть promo_code"
                assert result['promo_code'] == 'PROMO123', "Промокод должен совпадать"
                assert 'instructions' in result, "Для digital приза должна быть инструкция"
                assert result['instructions'] == 'Use this code at checkout', "Инструкция должна совпадать"
            
            # Проверяем, что были вызваны правильные методы
            google_sheets_service.client.open_by_key.assert_called_once_with("test_spreadsheet_id")
            mock_spreadsheet.worksheet.assert_called_once_with(code_word)
            mock_worksheet.find.assert_called_once_with(str(telegram_id), in_column=1)


# ============================================================================
# Unit-тесты для edge cases
# ============================================================================

@pytest.mark.asyncio
async def test_worksheet_not_found(google_sheets_service):
    """
    Edge case: обработка несуществующего worksheet
    
    Validates: Requirements 1.5
    
    Когда worksheet с указанным кодовым словом не существует,
    система должна вернуть None и залогировать предупреждение
    """
    # Arrange
    mock_spreadsheet = Mock(spec=gspread.Spreadsheet)
    google_sheets_service.client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheet.side_effect = gspread.exceptions.WorksheetNotFound("Worksheet not found")
    
    # Act
    result = await google_sheets_service.find_winner(12345, "nonexistent_code")
    
    # Assert
    assert result is None, "Должен вернуть None для несуществующего worksheet"
    google_sheets_service.client.open_by_key.assert_called_once()


@pytest.mark.asyncio
async def test_telegram_id_not_found(google_sheets_service):
    """
    Edge case: Telegram ID не найден в таблице
    
    Validates: Requirements 1.3
    
    Когда Telegram ID отсутствует в таблице,
    система должна вернуть None
    """
    # Arrange
    mock_spreadsheet = Mock(spec=gspread.Spreadsheet)
    mock_worksheet = Mock(spec=gspread.Worksheet)
    
    google_sheets_service.client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    # find возвращает None когда ячейка не найдена
    mock_worksheet.find.return_value = None
    
    # Act
    result = await google_sheets_service.find_winner(99999999, "test_code")
    
    # Assert
    assert result is None, "Должен вернуть None для несуществующего Telegram ID"


@pytest.mark.asyncio
async def test_google_sheets_api_unavailable(google_sheets_service):
    """
    Edge case: обработка недоступности Google Sheets API
    
    Validates: Requirements 1.5, 16.1
    
    Когда Google Sheets API недоступен,
    система должна выбросить исключение для последующей retry логики
    """
    # Arrange: создаём mock response для APIError
    mock_response = Mock()
    mock_response.json.return_value = {
        "error": {
            "code": 503,
            "message": "API unavailable"
        }
    }
    mock_response.text = "API unavailable"
    
    google_sheets_service.client.open_by_key.side_effect = gspread.exceptions.APIError(mock_response)
    
    # Act & Assert
    with pytest.raises(gspread.exceptions.APIError):
        await google_sheets_service.find_winner(12345, "test_code")


@pytest.mark.asyncio
async def test_invalid_row_format(google_sheets_service):
    """
    Edge case: некорректный формат данных в строке
    
    Когда строка содержит недостаточно данных,
    система должна вернуть None и залогировать ошибку
    """
    # Arrange
    mock_spreadsheet = Mock(spec=gspread.Spreadsheet)
    mock_worksheet = Mock(spec=gspread.Worksheet)
    mock_cell = Mock()
    mock_cell.row = 3
    
    google_sheets_service.client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_worksheet.find.return_value = mock_cell
    mock_worksheet.row_values.return_value = ["12345"]  # Только один столбец
    
    # Act
    result = await google_sheets_service.find_winner(12345, "test_code")
    
    # Assert
    assert result is None, "Должен вернуть None для некорректного формата строки"


@pytest.mark.asyncio
async def test_missing_promo_code_for_digital_prize(google_sheets_service):
    """
    Edge case: отсутствующий промокод для цифрового приза
    
    Validates: Requirements 2.5
    
    Когда для digital приза отсутствует промокод,
    система должна вернуть None в поле promo_code
    """
    # Arrange
    mock_spreadsheet = Mock(spec=gspread.Spreadsheet)
    mock_worksheet = Mock(spec=gspread.Worksheet)
    mock_cell = Mock()
    mock_cell.row = 5
    
    google_sheets_service.client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_worksheet.find.return_value = mock_cell
    mock_worksheet.row_values.return_value = ["12345", "digital"]  # Нет промокода
    
    # Act
    result = await google_sheets_service.find_winner(12345, "test_code")
    
    # Assert
    assert result is not None
    assert result['prize_type'] == 'digital'
    assert result['promo_code'] is None, "promo_code должен быть None если отсутствует"


# ============================================================================
# Property 8: Round-trip сохранения данных доставки
# ============================================================================

@given(
    row_id=st.integers(min_value=2, max_value=1000),
    last_name=st.text(min_size=2, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))),
    first_name=st.text(min_size=2, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))),
    patronymic=st.text(min_size=0, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))),
    city=st.text(min_size=2, max_size=100, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Zs'))),
    street=st.text(min_size=5, max_size=100, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs', 'Po'))),
    house=st.text(min_size=1, max_size=10, alphabet=st.characters(min_codepoint=48, max_codepoint=90)),  # 0-9, A-Z
    apartment=st.text(min_size=0, max_size=10, alphabet=st.characters(min_codepoint=48, max_codepoint=57)),  # 0-9
    phone=st.from_regex(r'^\+?[0-9]{10,15}$', fullmatch=True),
    comment=st.text(max_size=500, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs', 'Po')))
)
@settings(max_examples=100, deadline=None)
@pytest.mark.asyncio
async def test_property_8_round_trip_delivery_data(row_id, last_name, first_name, patronymic, city, street, house, apartment, phone, comment):
    """
    Property 8: Round-trip сохранения данных доставки
    Feature: telegram-bot-webapp-system, Property 8
    
    Validates: Requirements 4.5
    
    Для любых валидных данных доставки, после сохранения в Google Sheets
    и последующего чтения из той же строки, данные должны совпадать с исходными
    """
    # Arrange: создаём GoogleSheetsService с mock
    import tempfile
    import os
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        credentials_file = os.path.join(tmp_dir, "credentials.json")
        with open(credentials_file, 'w') as f:
            f.write('{"type": "service_account", "project_id": "test"}')
        
        with patch('services.google_sheets_service.Credentials') as mock_creds, \
             patch('services.google_sheets_service.gspread.authorize') as mock_authorize:
            
            mock_creds.from_service_account_file.return_value = Mock()
            mock_client = Mock(spec=gspread.Client)
            mock_authorize.return_value = mock_client
            
            google_sheets_service = GoogleSheetsService(
                credentials_path=credentials_file,
                spreadsheet_id="test_spreadsheet_id"
            )
            google_sheets_service.client = mock_client
            
            # Настраиваем mock для сохранения
            mock_spreadsheet = Mock(spec=gspread.Spreadsheet)
            mock_worksheet = Mock(spec=gspread.Worksheet)
            
            google_sheets_service.client.open_by_key.return_value = mock_spreadsheet
            mock_spreadsheet.get_worksheet.return_value = mock_worksheet
            
            # Создаём хранилище для сохранённых данных (имитация Google Sheets)
            saved_data = {}
            
            def mock_batch_update(updates):
                """Имитация batch_update - сохраняем данные"""
                for update in updates:
                    cell_range = update['range']
                    value = update['values'][0][0]
                    saved_data[cell_range] = value
            
            mock_worksheet.batch_update.side_effect = mock_batch_update
            
            # Подготавливаем данные доставки (новая структура)
            delivery_data = {
                'last_name': last_name,
                'first_name': first_name,
                'patronymic': patronymic,
                'city': city,
                'street': street,
                'house': house,
                'apartment': apartment,
                'phone': phone,
                'comment': comment,
                'telegram_id': 12345
            }
            
            # Act: сохраняем данные
            result = await google_sheets_service.save_delivery_data(row_id, delivery_data)
            
            # Assert: проверяем успешность сохранения
            assert result is True, "Сохранение должно быть успешным"
            
            # Проверяем, что данные были сохранены в правильные ячейки (E-M)
            assert f'E{row_id}' in saved_data, "Фамилия должна быть сохранена в столбец E"
            assert f'F{row_id}' in saved_data, "Имя должно быть сохранено в столбец F"
            assert f'G{row_id}' in saved_data, "Отчество должно быть сохранено в столбец G"
            assert f'H{row_id}' in saved_data, "Город должен быть сохранён в столбец H"
            assert f'I{row_id}' in saved_data, "Улица должна быть сохранена в столбец I"
            assert f'J{row_id}' in saved_data, "Дом должен быть сохранён в столбец J"
            assert f'K{row_id}' in saved_data, "Квартира должна быть сохранена в столбец K"
            assert f'L{row_id}' in saved_data, "Телефон должен быть сохранён в столбец L"
            assert f'M{row_id}' in saved_data, "Комментарий должен быть сохранён в столбец M"
            
            # Round-trip проверка: сохранённые данные должны совпадать с исходными
            assert saved_data[f'E{row_id}'] == last_name, "Фамилия должна совпадать после сохранения"
            assert saved_data[f'F{row_id}'] == first_name, "Имя должно совпадать после сохранения"
            assert saved_data[f'G{row_id}'] == patronymic, "Отчество должно совпадать после сохранения"
            assert saved_data[f'H{row_id}'] == city, "Город должен совпадать после сохранения"
            assert saved_data[f'I{row_id}'] == street, "Улица должна совпадать после сохранения"
            assert saved_data[f'J{row_id}'] == house, "Дом должен совпадать после сохранения"
            assert saved_data[f'K{row_id}'] == apartment, "Квартира должна совпадать после сохранения"
            assert saved_data[f'L{row_id}'] == phone, "Телефон должен совпадать после сохранения"
            assert saved_data[f'M{row_id}'] == comment, "Комментарий должен совпадать после сохранения"
            
            # Проверяем, что batch_update был вызван один раз
            mock_worksheet.batch_update.assert_called_once()


# ============================================================================
# Unit-тест для retry логики при ошибках Google Sheets API
# ============================================================================

@pytest.mark.asyncio
async def test_retry_logic_on_api_error(google_sheets_service):
    """
    Edge case: retry логика при ошибках Google Sheets API
    
    Validates: Requirements 16.1
    
    Когда Google Sheets API возвращает временную ошибку,
    система должна повторить попытку до 3 раз с экспоненциальной задержкой
    """
    from utils.retry import retry_with_backoff
    
    # Arrange: создаём функцию, которая падает первые 2 раза, а на 3-й раз успешна
    call_count = 0
    mock_response = Mock()
    mock_response.json.return_value = {
        "error": {
            "code": 503,
            "message": "Temporary API error"
        }
    }
    mock_response.text = "Temporary API error"
    
    async def flaky_function():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise gspread.exceptions.APIError(mock_response)
        return "success"
    
    # Act: выполняем с retry
    result = await retry_with_backoff(flaky_function, max_retries=3, base_delay=0.1)
    
    # Assert: функция должна была быть вызвана 3 раза и вернуть успех
    assert call_count == 3, "Функция должна быть вызвана 3 раза"
    assert result == "success", "Должен вернуть успешный результат"


@pytest.mark.asyncio
async def test_retry_exhausted_raises_exception(google_sheets_service):
    """
    Edge case: исчерпание всех попыток retry
    
    Validates: Requirements 16.1, 16.2
    
    Когда все попытки retry исчерпаны,
    система должна выбросить исключение и уведомить пользователя
    """
    from utils.retry import retry_with_backoff
    
    # Arrange: создаём функцию, которая всегда падает
    mock_response = Mock()
    mock_response.json.return_value = {
        "error": {
            "code": 503,
            "message": "Persistent API error"
        }
    }
    mock_response.text = "Persistent API error"
    
    async def always_failing_function():
        raise gspread.exceptions.APIError(mock_response)
    
    # Act & Assert: должно выброситься исключение после всех попыток
    with pytest.raises(gspread.exceptions.APIError):
        await retry_with_backoff(always_failing_function, max_retries=3, base_delay=0.1)
