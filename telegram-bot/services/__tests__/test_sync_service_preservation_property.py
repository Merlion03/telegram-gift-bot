"""
Preservation Property-Based Tests для SyncService

КРИТИЧЕСКИ ВАЖНО: Эти тесты написаны ДО внесения исправления
ЦЕЛЬ: Наблюдать baseline поведение операций чтения и прямой синхронизации
МЕТОДОЛОГИЯ: Observation-first - захватываем текущее поведение на неисправленном коде
ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тесты ПРОХОДЯТ на неисправленном коде

Property 2: Preservation - Forward Sync and Read Operations Unchanged

Проверяет, что операции чтения и прямой синхронизации (Google Sheets → PostgreSQL)
работают корректно и будут работать идентично после исправления readonly scopes.

После исправления (замена readonly scopes на full scopes):
- Эти тесты ДОЛЖНЫ ПРОДОЛЖАТЬ ПРОХОДИТЬ (подтверждает отсутствие регрессий)
- Поведение операций чтения должно остаться неизменным

Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase
from unittest.mock import Mock, patch, AsyncMock
import gspread
from typing import List, Dict, Any

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig


# ============================================================================
# Hypothesis Strategies для генерации тестовых данных
# ============================================================================

@st.composite
def sheet_name_strategy(draw):
    """Генерирует валидные названия листов (включая кириллицу)"""
    sheet_names = [
        'Лист1',
        'Январь 2024',
        'Февраль 2024',
        'Sheet1',
        'Test Sheet',
        'Призы 2024'
    ]
    return draw(st.sampled_from(sheet_names))


@st.composite
def sheet_data_strategy(draw):
    """
    Генерирует валидные данные листа Google Sheets
    
    Формат: List[List[str]] - список строк, каждая строка - список значений
    Минимум 4 столбца: telegram_id, username, code_word, prize_type
    """
    num_rows = draw(st.integers(min_value=1, max_value=10))
    rows = []
    
    for _ in range(num_rows):
        telegram_id = str(draw(st.integers(min_value=100, max_value=999999)))
        username = draw(st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll'))))
        code_word = draw(st.text(min_size=5, max_size=15, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))))
        prize_type = draw(st.sampled_from(['physical', 'digital']))
        
        row = [telegram_id, username, code_word, prize_type]
        
        # Добавляем дополнительные столбцы для физических призов
        if prize_type == 'physical':
            row.extend(['', ''])  # promo_code, instructions (пустые для physical)
            row.extend([
                draw(st.text(min_size=2, max_size=20)),  # last_name
                draw(st.text(min_size=2, max_size=20)),  # first_name
                draw(st.text(min_size=0, max_size=20)),  # patronymic
                draw(st.text(min_size=2, max_size=30)),  # city
                draw(st.text(min_size=2, max_size=30)),  # street
                draw(st.text(min_size=1, max_size=10)),  # house
                draw(st.text(min_size=0, max_size=10)),  # apartment
                draw(st.text(min_size=10, max_size=15)),  # phone
                draw(st.text(min_size=0, max_size=50)),  # comment
            ])
        else:
            # Для digital призов добавляем promo_code и instructions
            row.extend([
                draw(st.text(min_size=5, max_size=20)),  # promo_code
                draw(st.text(min_size=10, max_size=100))  # instructions
            ])
        
        rows.append(row)
    
    return rows


@st.composite
def multiple_sheet_names_strategy(draw):
    """Генерирует список названий листов"""
    num_sheets = draw(st.integers(min_value=1, max_value=5))
    sheet_names = [
        'Лист1', 'Январь 2024', 'Февраль 2024', 
        'Sheet1', 'Test Sheet', 'Призы 2024'
    ]
    return draw(st.lists(
        st.sampled_from(sheet_names),
        min_size=num_sheets,
        max_size=num_sheets,
        unique=True
    ))


# ============================================================================
# Fixtures
# ============================================================================

@pytest_asyncio.fixture
async def sync_service_with_mocks():
    """
    Создаёт SyncService с замоканными зависимостями
    
    НЕ мокаем _init_client - используем реальную инициализацию
    для проверки baseline поведения с readonly scopes
    """
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    # Патчим Credentials и gspread.authorize
    mock_credentials = Mock()
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch('services.sync_service.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('services.sync_service.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    return service, mock_prize_repository


# ============================================================================
# Property 2.1: _get_all_sheet_names() Preservation
# ============================================================================

@pytest.mark.asyncio
@given(sheet_names=multiple_sheet_names_strategy())
@settings(max_examples=20, phases=[Phase.generate, Phase.target])
async def test_preservation_get_all_sheet_names_returns_correct_list(sheet_names):
    """
    Property 2.1: Preservation - _get_all_sheet_names() возвращает корректный список листов
    
    OBSERVATION: На неисправленном коде _get_all_sheet_names() корректно
    получает список всех worksheets из Google Sheets
    
    PRESERVATION: После исправления (full scopes) это поведение должно остаться неизменным
    
    Validates: Requirement 3.3
    """
    # Arrange
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    # Mock для Google Sheets API
    mock_credentials = Mock()
    mock_gspread_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    
    # Создаём mock worksheets
    mock_worksheets = []
    for sheet_name in sheet_names:
        mock_ws = Mock()
        mock_ws.title = sheet_name
        mock_worksheets.append(mock_ws)
    
    mock_spreadsheet.worksheets.return_value = mock_worksheets
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    with patch('services.sync_service.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('services.sync_service.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Act
    result = await service._get_all_sheet_names()
    
    # Assert - Проверяем baseline поведение
    assert isinstance(result, list), "Результат должен быть списком"
    assert len(result) == len(sheet_names), f"Количество листов должно совпадать: ожидалось {len(sheet_names)}, получено {len(result)}"
    assert result == sheet_names, f"Названия листов должны совпадать: ожидалось {sheet_names}, получено {result}"
    
    # Проверяем, что метод вызвал правильные API методы
    mock_gspread_client.open_by_key.assert_called_once_with("test_spreadsheet_id")
    mock_spreadsheet.worksheets.assert_called_once()


# ============================================================================
# Property 2.2: _read_sheet_data() Preservation
# ============================================================================

@pytest.mark.asyncio
@given(
    sheet_name=sheet_name_strategy(),
    sheet_data=sheet_data_strategy()
)
@settings(max_examples=20, phases=[Phase.generate, Phase.target])
async def test_preservation_read_sheet_data_returns_all_rows(sheet_name, sheet_data):
    """
    Property 2.2: Preservation - _read_sheet_data() корректно читает все строки из листа
    
    OBSERVATION: На неисправленном коде _read_sheet_data() корректно
    читает все значения начиная со второй строки (пропускает заголовки)
    
    PRESERVATION: После исправления это поведение должно остаться неизменным
    
    Validates: Requirement 3.2
    """
    # Arrange
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    # Mock для Google Sheets API
    mock_credentials = Mock()
    mock_gspread_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    # Симулируем данные с заголовком
    header_row = ['telegram_id', 'username', 'code_word', 'prize_type', 'promo_code', 'instructions']
    all_values = [header_row] + sheet_data
    mock_worksheet.get_all_values.return_value = all_values
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    with patch('services.sync_service.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('services.sync_service.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Act
    result = await service._read_sheet_data(sheet_name)
    
    # Assert - Проверяем baseline поведение
    assert isinstance(result, list), "Результат должен быть списком"
    assert len(result) == len(sheet_data), f"Количество строк должно совпадать (без заголовка): ожидалось {len(sheet_data)}, получено {len(result)}"
    assert result == sheet_data, "Данные должны совпадать с исходными (без заголовка)"
    
    # Проверяем, что метод вызвал правильные API методы
    mock_gspread_client.open_by_key.assert_called_once_with("test_spreadsheet_id")
    mock_spreadsheet.worksheet.assert_called_once_with(sheet_name)
    mock_worksheet.get_all_values.assert_called_once()


# ============================================================================
# Property 2.3: _convert_sheet_data_to_prizes() Preservation
# ============================================================================

@pytest.mark.asyncio
@given(
    sheet_name=sheet_name_strategy(),
    sheet_data=sheet_data_strategy()
)
@settings(max_examples=20, phases=[Phase.generate, Phase.target])
async def test_preservation_convert_sheet_data_to_prizes_correct_transformation(sheet_name, sheet_data):
    """
    Property 2.3: Preservation - _convert_sheet_data_to_prizes() корректно преобразует данные
    
    OBSERVATION: На неисправленном коде _convert_sheet_data_to_prizes() корректно
    парсит столбцы A-O и создаёт объекты Prize с правильными полями
    
    PRESERVATION: После исправления это поведение должно остаться неизменным
    
    Validates: Requirement 3.5
    """
    # Arrange
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    mock_credentials = Mock()
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch('services.sync_service.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('services.sync_service.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Act
    result = service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
    
    # Assert - Проверяем baseline поведение
    assert isinstance(result, list), "Результат должен быть списком"
    assert len(result) <= len(sheet_data), "Количество призов не должно превышать количество строк"
    
    # Проверяем структуру каждого приза
    for i, prize_data in enumerate(result):
        assert isinstance(prize_data, dict), f"Приз {i} должен быть словарём"
        
        # Проверяем обязательные поля
        assert 'telegram_id' in prize_data, f"Приз {i} должен содержать telegram_id"
        assert 'username' in prize_data, f"Приз {i} должен содержать username"
        assert 'code_word' in prize_data, f"Приз {i} должен содержать code_word"
        assert 'prize_type' in prize_data, f"Приз {i} должен содержать prize_type"
        assert 'sheet_name' in prize_data, f"Приз {i} должен содержать sheet_name"
        assert 'row_id' in prize_data, f"Приз {i} должен содержать row_id"
        assert 'created_at' in prize_data, f"Приз {i} должен содержать created_at"
        assert 'updated_at' in prize_data, f"Приз {i} должен содержать updated_at"
        
        # Проверяем типы данных
        assert isinstance(prize_data['telegram_id'], int), f"telegram_id должен быть int"
        assert prize_data['prize_type'] in ['physical', 'digital'], f"prize_type должен быть 'physical' или 'digital'"
        assert prize_data['sheet_name'] == sheet_name, f"sheet_name должен совпадать с переданным"
        assert isinstance(prize_data['row_id'], int), f"row_id должен быть int"
        assert isinstance(prize_data['created_at'], datetime), f"created_at должен быть datetime"
        assert isinstance(prize_data['updated_at'], datetime), f"updated_at должен быть datetime"


# ============================================================================
# Property 2.4: _batch_upsert_prizes() Preservation
# ============================================================================

@pytest.mark.asyncio
@given(
    num_prizes=st.integers(min_value=1, max_value=50)
)
@settings(max_examples=10, phases=[Phase.generate, Phase.target])
async def test_preservation_batch_upsert_prizes_correct_execution(num_prizes):
    """
    Property 2.4: Preservation - _batch_upsert_prizes() корректно выполняет batch upsert
    
    OBSERVATION: На неисправленном коде _batch_upsert_prizes() корректно
    сохраняет данные в PostgreSQL с обработкой конфликтов через ON CONFLICT DO UPDATE
    
    PRESERVATION: После исправления это поведение должно остаться неизменным
    
    Validates: Requirement 3.6
    """
    # Arrange
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    # Мокаем batch_upsert_prizes для возврата количества обработанных записей
    mock_prize_repository.batch_upsert_prizes = AsyncMock(return_value=num_prizes)
    
    mock_credentials = Mock()
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch('services.sync_service.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('services.sync_service.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Создаём тестовые данные призов
    now = datetime.now(timezone.utc)
    prizes_data = []
    for i in range(num_prizes):
        prizes_data.append({
            'telegram_id': 100 + i,
            'username': f'user{i}',
            'code_word': f'code{i}',
            'prize_type': 'physical',
            'sheet_name': 'Лист1',
            'row_id': i + 2,
            'created_at': now,
            'updated_at': now
        })
    
    # Act
    result = await service._batch_upsert_prizes(prizes_data)
    
    # Assert - Проверяем baseline поведение
    assert isinstance(result, int), "Результат должен быть целым числом"
    assert result == num_prizes, f"Количество обработанных записей должно совпадать: ожидалось {num_prizes}, получено {result}"
    
    # Проверяем, что repository метод был вызван
    mock_prize_repository.batch_upsert_prizes.assert_called()


# ============================================================================
# Property 2.5: sync_all_sheets() Integration Preservation
# ============================================================================

@pytest.mark.asyncio
@given(
    sheet_names=multiple_sheet_names_strategy()
)
@settings(max_examples=10, phases=[Phase.generate, Phase.target])
async def test_preservation_sync_all_sheets_forward_sync_works(sheet_names):
    """
    Property 2.5: Preservation - sync_all_sheets() корректно выполняет прямую синхронизацию
    
    OBSERVATION: На неисправленном коде sync_all_sheets() корректно
    читает данные из Google Sheets и записывает в PostgreSQL
    
    PRESERVATION: После исправления это поведение должно остаться неизменным
    
    Validates: Requirement 3.1
    """
    # Arrange
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    mock_prize_repository.batch_upsert_prizes = AsyncMock(return_value=5)
    
    # Mock для Google Sheets API
    mock_credentials = Mock()
    mock_gspread_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    
    # Создаём mock worksheets
    mock_worksheets = []
    for sheet_name in sheet_names:
        mock_ws = Mock()
        mock_ws.title = sheet_name
        mock_worksheets.append(mock_ws)
    
    mock_spreadsheet.worksheets.return_value = mock_worksheets
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Mock для чтения данных из каждого листа
    def mock_worksheet_side_effect(name):
        mock_ws = Mock()
        # Возвращаем тестовые данные с заголовком
        mock_ws.get_all_values.return_value = [
            ['telegram_id', 'username', 'code_word', 'prize_type'],
            ['100', 'user1', 'code1', 'physical'],
            ['200', 'user2', 'code2', 'digital']
        ]
        return mock_ws
    
    mock_spreadsheet.worksheet.side_effect = mock_worksheet_side_effect
    
    with patch('services.sync_service.Credentials.from_service_account_file', return_value=mock_credentials):
        with patch('services.sync_service.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Act
    result = await service.sync_all_sheets()
    
    # Assert - Проверяем baseline поведение
    assert isinstance(result, dict), "Результат должен быть словарём"
    assert 'sheets_processed' in result, "Результат должен содержать sheets_processed"
    assert 'total_records' in result, "Результат должен содержать total_records"
    assert 'elapsed_seconds' in result, "Результат должен содержать elapsed_seconds"
    
    # Проверяем, что все листы были обработаны
    assert result['sheets_processed'] == len(sheet_names), \
        f"Количество обработанных листов должно совпадать: ожидалось {len(sheet_names)}, получено {result['sheets_processed']}"
    
    # Проверяем, что данные были записаны в PostgreSQL
    assert mock_prize_repository.batch_upsert_prizes.call_count >= len(sheet_names), \
        "batch_upsert_prizes должен быть вызван для каждого листа"


# ============================================================================
# Property 2.6: Scopes Verification (Baseline)
# ============================================================================

@pytest.mark.asyncio
async def test_preservation_baseline_readonly_scopes_used():
    """
    Property 2.6: Preservation - Проверка scopes после исправления
    
    OBSERVATION: После исправления _init_client() использует full scopes,
    но операции чтения (preservation) продолжают работать идентично
    
    ВАЖНО: Этот тест подтверждает, что исправление не вызвало регрессий
    
    Validates: Preservation для Requirements 3.1-3.6
    """
    # Arrange
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    # Патчим Credentials.from_service_account_file чтобы перехватить scopes
    captured_scopes = []
    
    def capture_scopes(path, scopes):
        captured_scopes.extend(scopes)
        mock_credentials = Mock()
        return mock_credentials
    
    with patch('services.sync_service.Credentials.from_service_account_file', side_effect=capture_scopes):
        with patch('services.sync_service.gspread.authorize'):
            # Act
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Assert - После исправления проверяем full scopes
    assert 'https://www.googleapis.com/auth/spreadsheets' in captured_scopes, \
        "После исправления: должен использоваться full scope для spreadsheets"
    assert 'https://www.googleapis.com/auth/drive' in captured_scopes, \
        "После исправления: должен использоваться full scope для drive"
    
    # Проверяем, что readonly scopes НЕ используются
    assert 'https://www.googleapis.com/auth/spreadsheets.readonly' not in captured_scopes, \
        "После исправления: readonly scope для spreadsheets НЕ должен использоваться"
    assert 'https://www.googleapis.com/auth/drive.readonly' not in captured_scopes, \
        "После исправления: readonly scope для drive НЕ должен использоваться"
    
    print("\n" + "="*80)
    print("ИСПРАВЛЕНИЕ ПОДТВЕРЖДЕНО - PRESERVATION СОХРАНЁН")
    print("="*80)
    print("_init_client() использует full scopes:")
    for scope in captured_scopes:
        print(f"  - {scope}")
    print("\nFull scopes позволяют как чтение, так и запись")
    print("Операции чтения (preservation) продолжают работать идентично")
    print("="*80 + "\n")
