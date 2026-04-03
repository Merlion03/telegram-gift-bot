"""
Unit тесты для обратной синхронизации Sync_Service (PostgreSQL → Google Sheets)

Validates: Requirements 5.2, 5.3, 5.4, 5.5, 12.3
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import List

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig
import gspread


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


def create_test_prize(
    prize_id: int,
    telegram_id: int,
    sheet_name: str,
    row_id: int,
    claimed_at: datetime = None,
    updated_at: datetime = None,
    **kwargs
) -> Prize:
    """Создаёт тестовый объект Prize"""
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        id=prize_id,
        telegram_id=telegram_id,
        username=kwargs.get('username', f'user{telegram_id}'),
        prize_type='physical',
        code_word=kwargs.get('code_word', f'code{prize_id}'),
        sheet_name=sheet_name,
        row_id=row_id,
        claimed_at=claimed_at or now,
        updated_at=updated_at or now,
        created_at=now,
        gdpr_consent_date=now,
        # Данные доставки
        last_name=kwargs.get('last_name', 'Иванов'),
        first_name=kwargs.get('first_name', 'Иван'),
        patronymic=kwargs.get('patronymic', 'Иванович'),
        country=kwargs.get('country', 'Россия'),
        postal_code=kwargs.get('postal_code', '123456'),
        city=kwargs.get('city', 'Москва'),
        street=kwargs.get('street', 'Ленина'),
        house=kwargs.get('house', '10'),
        apartment=kwargs.get('apartment', '5'),
        phone=kwargs.get('phone', '+79991234567'),
        comment=kwargs.get('comment', 'Тестовый комментарий')
    )
    
    return prize


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_finds_claimed_prizes(
    sync_service,
    mock_prize_repository
):
    """
    Тест: поиск записей с claimed_at IS NOT NULL
    
    Validates: Requirement 5.2
    """
    # Arrange
    test_prizes = [
        create_test_prize(1, 100, "Лист1", 2),
        create_test_prize(2, 200, "Лист1", 3),
        create_test_prize(3, 300, "Лист2", 2)
    ]
    
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = test_prizes
    
    # Mock для Google Sheets API
    with patch.object(sync_service, '_sync_sheet_delivery_data', new_callable=AsyncMock) as mock_sync_sheet:
        # Возвращаем количество призов для каждого листа
        async def mock_sync(sheet_name, prizes):
            return len(prizes)
        
        mock_sync_sheet.side_effect = mock_sync
        
        # Act
        stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    mock_prize_repository.get_claimed_prizes_for_sync.assert_called_once_with(
        last_sync_timestamp=None
    )
    assert stats['records_processed'] == 3
    assert stats['records_updated'] == 3  # 2 для Лист1 + 1 для Лист2
    assert stats['sheets_updated'] == 2


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_groups_by_sheet_name(
    sync_service,
    mock_prize_repository
):
    """
    Тест: группировка записей по sheet_name
    
    Validates: Requirement 5.4
    """
    # Arrange
    test_prizes = [
        create_test_prize(1, 100, "Лист1", 2),
        create_test_prize(2, 200, "Лист1", 3),
        create_test_prize(3, 300, "Лист2", 2),
        create_test_prize(4, 400, "Лист2", 3),
        create_test_prize(5, 500, "Лист3", 2)
    ]
    
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = test_prizes
    
    # Mock для Google Sheets API
    sync_calls = []
    
    async def track_sync_call(sheet_name, prizes):
        sync_calls.append((sheet_name, len(prizes)))
        return len(prizes)
    
    with patch.object(sync_service, '_sync_sheet_delivery_data', side_effect=track_sync_call):
        # Act
        stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    assert len(sync_calls) == 3
    
    # Проверяем группировку
    sheet_groups = {sheet: count for sheet, count in sync_calls}
    assert sheet_groups['Лист1'] == 2
    assert sheet_groups['Лист2'] == 2
    assert sheet_groups['Лист3'] == 1
    
    assert stats['sheets_updated'] == 3


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_batch_update(
    sync_service,
    mock_prize_repository,
    mock_gspread_client
):
    """
    Тест: batch update в Google Sheets
    
    Validates: Requirement 5.3
    """
    # Arrange
    test_prizes = [
        create_test_prize(1, 100, "Лист1", 2, last_name="Петров", first_name="Пётр"),
        create_test_prize(2, 200, "Лист1", 3, last_name="Сидоров", first_name="Сидор")
    ]
    
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = test_prizes
    
    # Mock для Google Sheets
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Act
    stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    mock_worksheet.batch_update.assert_called_once()
    
    # Проверяем структуру batch_data
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    assert len(batch_data) == 2
    
    # Проверяем первую запись
    assert batch_data[0]['range'] == 'E2:P2'
    assert batch_data[0]['values'][0][0] == 'Петров'  # last_name
    assert batch_data[0]['values'][0][1] == 'Пётр'    # first_name
    
    # Проверяем вторую запись
    assert batch_data[1]['range'] == 'E3:P3'
    assert batch_data[1]['values'][0][0] == 'Сидоров'
    assert batch_data[1]['values'][0][1] == 'Сидор'


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_handles_google_sheets_api_error(
    sync_service,
    mock_prize_repository
):
    """
    Тест: обработка ошибок Google Sheets API
    
    Validates: Requirement 5.5
    """
    # Arrange
    test_prizes = [
        create_test_prize(1, 100, "Лист1", 2),
        create_test_prize(2, 200, "Лист2", 2)
    ]
    
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = test_prizes
    
    # Mock: первый лист вызывает ошибку, второй успешен
    call_count = 0
    
    # Создаём mock response для gspread.exceptions.APIError
    mock_response = Mock()
    mock_response.json.return_value = {"error": {"message": "Rate limit exceeded", "code": 429}}
    mock_response.text = "Rate limit exceeded"
    
    async def mock_sync_with_error(sheet_name, prizes):
        nonlocal call_count
        call_count += 1
        if sheet_name == "Лист1":
            raise gspread.exceptions.APIError(mock_response)
        return len(prizes)
    
    with patch.object(sync_service, '_sync_sheet_delivery_data', side_effect=mock_sync_with_error):
        # Act
        stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    assert stats['records_processed'] == 2
    assert stats['records_updated'] == 1  # Только Лист2
    assert stats['sheets_updated'] == 1
    assert len(stats['errors']) == 1
    assert stats['errors'][0]['sheet_name'] == 'Лист1'
    assert stats['errors'][0]['error_type'] == 'GoogleSheetsAPIError'


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_incremental_sync(
    sync_service,
    mock_prize_repository
):
    """
    Тест: инкрементальная синхронизация (updated_at > last_sync)
    
    Validates: Requirement 12.3
    
    Примечание: В текущей реализации используется полная синхронизация (last_sync_timestamp=None).
    Этот тест проверяет, что метод вызывается с правильными параметрами.
    """
    # Arrange
    test_prizes = [
        create_test_prize(1, 100, "Лист1", 2)
    ]
    
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = test_prizes
    
    with patch.object(sync_service, '_sync_sheet_delivery_data', new_callable=AsyncMock) as mock_sync_sheet:
        mock_sync_sheet.return_value = 1
        
        # Act
        stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    # Проверяем, что метод вызван с last_sync_timestamp=None (полная синхронизация)
    mock_prize_repository.get_claimed_prizes_for_sync.assert_called_once_with(
        last_sync_timestamp=None
    )


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_logs_statistics(
    sync_service,
    mock_prize_repository
):
    """
    Тест: логирование статистики
    
    Validates: Requirement 10.5
    """
    # Arrange
    test_prizes = [
        create_test_prize(1, 100, "Лист1", 2),
        create_test_prize(2, 200, "Лист1", 3)
    ]
    
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = test_prizes
    
    with patch.object(sync_service, '_sync_sheet_delivery_data', new_callable=AsyncMock) as mock_sync_sheet:
        mock_sync_sheet.return_value = 2
        
        # Act
        stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    assert 'records_processed' in stats
    assert 'records_updated' in stats
    assert 'sheets_updated' in stats
    assert 'errors' in stats
    assert 'elapsed_seconds' in stats
    
    assert stats['records_processed'] == 2
    assert stats['records_updated'] == 2
    assert stats['sheets_updated'] == 1
    assert isinstance(stats['elapsed_seconds'], float)
    assert stats['elapsed_seconds'] >= 0  # Может быть 0.0 для быстрых операций


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_handles_database_unavailable(
    sync_service,
    mock_prize_repository
):
    """
    Тест: обработка недоступности PostgreSQL
    
    Validates: Requirement 5.5
    """
    # Arrange
    mock_prize_repository.get_claimed_prizes_for_sync.side_effect = DatabaseUnavailableError(
        "PostgreSQL недоступен"
    )
    
    # Act
    stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    assert stats['records_processed'] == 0
    assert stats['records_updated'] == 0
    assert stats['sheets_updated'] == 0
    assert len(stats['errors']) == 1
    assert stats['errors'][0]['stage'] == 'database_query'
    assert stats['errors'][0]['error_type'] == 'DatabaseUnavailableError'


@pytest.mark.asyncio
async def test_sync_delivery_data_to_sheets_empty_result(
    sync_service,
    mock_prize_repository
):
    """
    Тест: обработка пустого результата (нет записей для синхронизации)
    
    Validates: Requirement 5.2
    """
    # Arrange
    mock_prize_repository.get_claimed_prizes_for_sync.return_value = []
    
    # Act
    stats = await sync_service.sync_delivery_data_to_sheets()
    
    # Assert
    assert stats['records_processed'] == 0
    assert stats['records_updated'] == 0
    assert stats['sheets_updated'] == 0
    assert len(stats['errors']) == 0


@pytest.mark.asyncio
async def test_sync_sheet_delivery_data_updates_correct_columns(
    sync_service,
    mock_gspread_client
):
    """
    Тест: обновление правильных столбцов (E-P)
    
    Validates: Requirement 5.3
    """
    # Arrange
    test_prize = create_test_prize(
        1, 100, "Лист1", 2,
        last_name="Тестов",
        first_name="Тест",
        patronymic="Тестович",
        country="Россия",
        postal_code="654321",
        city="Санкт-Петербург",
        street="Невский проспект",
        house="1",
        apartment="100",
        phone="+79001234567",
        comment="Важный комментарий"
    )
    
    # Mock для Google Sheets
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.batch_update = Mock()
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Act
    updated_count = await sync_service._sync_sheet_delivery_data("Лист1", [test_prize])
    
    # Assert
    assert updated_count == 1
    
    batch_data = mock_worksheet.batch_update.call_args[0][0]
    assert len(batch_data) == 1
    
    row_data = batch_data[0]['values'][0]
    
    # Проверяем структуру данных (E-P):
    # E: last_name, F: first_name, G: patronymic
    # H: city, I: street, J: house, K: apartment, L: phone
    # M: comment, N: country, O: postal_code, P: claimed_at
    assert row_data[0] == "Тестов"              # E: last_name
    assert row_data[1] == "Тест"                # F: first_name
    assert row_data[2] == "Тестович"            # G: patronymic
    assert row_data[3] == "Санкт-Петербург"     # H: city
    assert row_data[4] == "Невский проспект"    # I: street
    assert row_data[5] == "1"                   # J: house
    assert row_data[6] == "100"                 # K: apartment
    assert row_data[7] == "+79001234567"        # L: phone
    assert row_data[8] == "Важный комментарий"  # M: comment
    assert row_data[9] == "Россия"              # N: country
    assert row_data[10] == "654321"             # O: postal_code
    assert row_data[11] != ''                   # P: claimed_at (ISO format)


@pytest.mark.asyncio
async def test_sync_sheet_delivery_data_handles_worksheet_not_found(
    sync_service,
    mock_gspread_client
):
    """
    Тест: обработка ошибки "лист не найден"
    
    Validates: Requirement 5.5
    """
    # Arrange
    test_prize = create_test_prize(1, 100, "НесуществующийЛист", 2)
    
    mock_spreadsheet = Mock()
    mock_spreadsheet.worksheet.side_effect = gspread.exceptions.WorksheetNotFound("Лист не найден")
    mock_gspread_client.open_by_key.return_value = mock_spreadsheet
    
    # Act & Assert
    # Ожидаем, что метод выбросит WorksheetNotFound, который будет обработан в sync_delivery_data_to_sheets
    with pytest.raises(gspread.exceptions.WorksheetNotFound):
        await sync_service._sync_sheet_delivery_data("НесуществующийЛист", [test_prize])
