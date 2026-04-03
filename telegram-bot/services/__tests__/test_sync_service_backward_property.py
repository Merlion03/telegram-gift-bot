"""
Property-based тесты для обратной синхронизации Sync_Service (PostgreSQL → Google Sheets)

Property 15: Синхронизация данных PostgreSQL → Google Sheets
Validates: Requirements 5.3, 18.1
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings
from unittest.mock import Mock, AsyncMock, patch

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig
import gspread


# Стратегии для генерации тестовых данных
delivery_data_strategy = st.fixed_dictionaries({
    'last_name': st.text(min_size=2, max_size=50, alphabet=st.characters(whitelist_categories=('L',))),
    'first_name': st.text(min_size=2, max_size=50, alphabet=st.characters(whitelist_categories=('L',))),
    'patronymic': st.one_of(st.none(), st.text(min_size=2, max_size=50, alphabet=st.characters(whitelist_categories=('L',)))),
    'country': st.text(min_size=2, max_size=100, alphabet=st.characters(whitelist_categories=('L',))),
    'postal_code': st.text(min_size=3, max_size=20, alphabet=st.characters(whitelist_categories=('Nd', 'L'))),
    'city': st.text(min_size=2, max_size=100, alphabet=st.characters(whitelist_categories=('L',))),
    'street': st.text(min_size=2, max_size=200, alphabet=st.characters(whitelist_categories=('L',))),
    'house': st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('Nd', 'L'))),
    'apartment': st.one_of(st.none(), st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('Nd', 'L')))),
    'phone': st.text(min_size=10, max_size=15, alphabet=st.characters(whitelist_categories=('Nd',))).map(lambda x: f'+{x}'),
    'comment': st.one_of(st.none(), st.text(min_size=0, max_size=500, alphabet=st.characters(whitelist_categories=('L', 'Nd', 'P'))))
})


def create_prize_with_delivery_data(
    prize_id: int,
    telegram_id: int,
    sheet_name: str,
    row_id: int,
    delivery_data: dict
) -> Prize:
    """Создаёт Prize с данными доставки"""
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        id=prize_id,
        telegram_id=telegram_id,
        username=f'user{telegram_id}',
        prize_type='physical',
        code_word=f'code{prize_id}',
        sheet_name=sheet_name,
        row_id=row_id,
        claimed_at=now,
        updated_at=now,
        created_at=now,
        gdpr_consent_date=now,
        **delivery_data
    )
    
    return prize


@pytest_asyncio.fixture
async def mock_prize_repository():
    """Mock для Prize_Repository"""
    repo = Mock(spec=PrizeRepository)
    repo.get_claimed_prizes_for_sync = AsyncMock()
    return repo


@pytest_asyncio.fixture
async def mock_gspread_client():
    """Mock для gspread клиента"""
    client = Mock(spec=gspread.Client)
    return client


@pytest_asyncio.fixture
async def sync_service(mock_prize_repository, mock_gspread_client):
    """Создаёт экземпляр SyncService с mock зависимостями"""
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="test_credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    # Патчим _init_client чтобы избежать реальной инициализации
    with patch.object(SyncService, '_init_client', return_value=mock_gspread_client):
        service = SyncService(
            google_sheets_config=google_sheets_config,
            sync_config=sync_config,
            prize_repository=mock_prize_repository
        )
    
    return service


@pytest.mark.asyncio
@given(delivery_data=delivery_data_strategy)
@settings(max_examples=50, deadline=None)
async def test_property_sync_delivery_data_format(delivery_data):
    """
    Property 15: Синхронизация данных PostgreSQL → Google Sheets
    
    Проверяет, что данные доставки из PostgreSQL корректно форматируются
    для синхронизации в Google Sheets.
    
    Validates: Requirements 5.3, 18.1
    """
    # Arrange
    prize = create_prize_with_delivery_data(
        prize_id=1,
        telegram_id=100,
        sheet_name="Лист1",
        row_id=2,
        delivery_data=delivery_data
    )
    
    # Создаём mock для SyncService
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="test_credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch.object(SyncService, '_init_client', return_value=mock_gspread_client):
        service = SyncService(
            google_sheets_config=google_sheets_config,
            sync_config=sync_config,
            prize_repository=mock_prize_repository
        )
    
    # Mock для Google Sheets
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Act
    await service._sync_sheet_delivery_data("Лист1", [prize])
    
    # Assert
    mock_worksheet.batch_update.assert_called_once()
    
    # Проверяем структуру batch_data
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    assert len(batch_data) == 1
    
    # Проверяем диапазон
    assert batch_data[0]['range'] == 'E2:P2'
    
    # Проверяем данные
    row_data = batch_data[0]['values'][0]
    
    # Структура: E-P (12 полей)
    # E: last_name, F: first_name, G: patronymic
    # H: city, I: street, J: house, K: apartment, L: phone
    # M: comment, N: country, O: postal_code, P: claimed_at
    assert len(row_data) == 12
    
    # Проверяем соответствие данных
    assert row_data[0] == delivery_data['last_name']
    assert row_data[1] == delivery_data['first_name']
    assert row_data[2] == (delivery_data['patronymic'] or '')
    assert row_data[3] == delivery_data['city']
    assert row_data[4] == delivery_data['street']
    assert row_data[5] == delivery_data['house']
    assert row_data[6] == (delivery_data['apartment'] or '')
    assert row_data[7] == delivery_data['phone']
    assert row_data[8] == (delivery_data['comment'] or '')
    assert row_data[9] == delivery_data['country']
    assert row_data[10] == delivery_data['postal_code']
    assert row_data[11] != ''  # claimed_at должен быть установлен


@pytest.mark.asyncio
@given(
    prizes_count=st.integers(min_value=1, max_value=10),
    delivery_data=delivery_data_strategy
)
@settings(max_examples=50, deadline=None)
async def test_property_batch_sync_preserves_all_records(prizes_count, delivery_data):
    """
    Property: Batch синхронизация сохраняет все записи
    
    Проверяет, что при batch синхронизации все записи обрабатываются
    и ни одна не теряется.
    
    Validates: Requirements 5.3, 5.4
    """
    # Arrange
    prizes = [
        create_prize_with_delivery_data(
            prize_id=i,
            telegram_id=100 + i,
            sheet_name="Лист1",
            row_id=2 + i,
            delivery_data=delivery_data
        )
        for i in range(prizes_count)
    ]
    
    # Создаём mock для SyncService
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="test_credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch.object(SyncService, '_init_client', return_value=mock_gspread_client):
        service = SyncService(
            google_sheets_config=google_sheets_config,
            sync_config=sync_config,
            prize_repository=mock_prize_repository
        )
    
    # Mock для Google Sheets
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Act
    updated_count = await service._sync_sheet_delivery_data("Лист1", prizes)
    
    # Assert
    assert updated_count == prizes_count
    
    # Проверяем, что batch_update был вызван
    mock_worksheet.batch_update.assert_called_once()
    
    # Проверяем количество записей в batch
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    assert len(batch_data) == prizes_count
    
    # Проверяем, что все row_id уникальны и соответствуют призам
    row_ids = [int(item['range'].split(':')[0][1:]) for item in batch_data]
    expected_row_ids = [prize.row_id for prize in prizes]
    assert sorted(row_ids) == sorted(expected_row_ids)


@pytest.mark.asyncio
@given(delivery_data=delivery_data_strategy)
@settings(max_examples=50, deadline=None)
async def test_property_none_values_converted_to_empty_strings(delivery_data):
    """
    Property: None значения конвертируются в пустые строки
    
    Проверяет, что опциональные поля с None значениями корректно
    конвертируются в пустые строки для Google Sheets.
    
    Validates: Requirement 5.3
    """
    # Arrange
    prize = create_prize_with_delivery_data(
        prize_id=1,
        telegram_id=100,
        sheet_name="Лист1",
        row_id=2,
        delivery_data=delivery_data
    )
    
    # Создаём mock для SyncService
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="test_credentials.json",
        spreadsheet_id="test_spreadsheet_id"
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch.object(SyncService, '_init_client', return_value=mock_gspread_client):
        service = SyncService(
            google_sheets_config=google_sheets_config,
            sync_config=sync_config,
            prize_repository=mock_prize_repository
        )
    
    # Mock для Google Sheets
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Act
    await service._sync_sheet_delivery_data("Лист1", [prize])
    
    # Assert
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    row_data = batch_data[0]['values'][0]
    
    # Проверяем, что все значения - строки (не None)
    for value in row_data:
        assert isinstance(value, str), f"Значение {value} должно быть строкой"
    
    # Проверяем опциональные поля
    if delivery_data['patronymic'] is None:
        assert row_data[2] == ''  # patronymic
    
    if delivery_data['apartment'] is None:
        assert row_data[6] == ''  # apartment
    
    if delivery_data['comment'] is None:
        assert row_data[8] == ''  # comment
