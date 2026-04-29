"""
Exploratory Property-Based Test для Bug Condition: Backward Sync 403 Error

КРИТИЧЕСКИ ВАЖНО: Этот тест написан ДО внесения исправления
ЦЕЛЬ: Продемонстрировать баг и получить counterexamples
ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест УПАДЁТ с ошибкой APIError: [403]

Bug Condition: isBugCondition(input) где
  input.operation_type == 'BACKWARD_SYNC' AND
  input.method == 'batch_update' AND
  input.client_scopes CONTAINS 'spreadsheets.readonly'

Expected Behavior (после исправления):
  - операция batch_update выполняется успешно с кодом 200
  - данные записываются в столбцы E-P
  - логируется sheet_backward_sync_batch_update_completed

Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase
from unittest.mock import Mock, patch
import gspread

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig


# Scoped PBT: Ограничиваем property конкретными падающими случаями
# для детерминистичного бага (readonly scopes всегда вызывают 403)
KNOWN_FAILING_CASES = [
    {
        'prize_id': 1,
        'telegram_id': 100,
        'sheet_name': 'Лист1',
        'row_id': 2,
        'last_name': 'Иванов',
        'first_name': 'Иван',
        'patronymic': 'Иванович',
        'country': 'Россия',
        'postal_code': '123456',
        'city': 'Москва',
        'street': 'Ленина',
        'house': '10',
        'apartment': '5',
        'phone': '+79991234567',
        'comment': 'Тестовый комментарий'
    },
    {
        'prize_id': 2,
        'telegram_id': 200,
        'sheet_name': 'Январь 2024',
        'row_id': 5,
        'last_name': 'Петров',
        'first_name': 'Пётр',
        'patronymic': None,
        'country': 'Россия',
        'postal_code': '654321',
        'city': 'Санкт-Петербург',
        'street': 'Невский проспект',
        'house': '1',
        'apartment': None,
        'phone': '+79001234567',
        'comment': None
    }
]


def create_test_prize(case: dict) -> Prize:
    """Создаёт тестовый Prize из case данных"""
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        id=case['prize_id'],
        telegram_id=case['telegram_id'],
        username=f"user{case['telegram_id']}",
        prize_type='physical',
        code_word=f"code{case['prize_id']}",
        sheet_name=case['sheet_name'],
        row_id=case['row_id'],
        claimed_at=now,
        updated_at=now,
        created_at=now,
        gdpr_consent_date=now,
        last_name=case['last_name'],
        first_name=case['first_name'],
        patronymic=case['patronymic'],
        country=case['country'],
        postal_code=case['postal_code'],
        city=case['city'],
        street=case['street'],
        house=case['house'],
        apartment=case['apartment'],
        phone=case['phone'],
        comment=case['comment']
    )
    
    return prize


@pytest_asyncio.fixture
async def real_sync_service():
    """
    Создаёт РЕАЛЬНЫЙ экземпляр SyncService с РЕАЛЬНОЙ инициализацией клиента
    
    КРИТИЧЕСКИ ВАЖНО: НЕ мокаем _init_client - используем реальный метод
    с readonly scopes для демонстрации бага
    """
    google_sheets_config = GoogleSheetsConfig(
        credentials_path="credentials/google-credentials.json",
        spreadsheet_id="1234567890"  # Будет замокан на уровне gspread
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    # НЕ патчим _init_client - позволяем ему инициализироваться с readonly scopes
    service = SyncService(
        google_sheets_config=google_sheets_config,
        sync_config=sync_config,
        prize_repository=mock_prize_repository
    )
    
    return service


@pytest.mark.asyncio
@pytest.mark.parametrize("case", KNOWN_FAILING_CASES)
async def test_bug_condition_backward_sync_403_error_readonly_scopes(case):
    """
    Property 1: Bug Condition - Backward Sync 403 Error on Readonly Scopes
    
    КРИТИЧЕСКИ ВАЖНО: Этот тест ДОЛЖЕН УПАСТЬ на неисправленном коде
    
    Bug Condition: Проверяет, что при попытке обратной синхронизации
    (PostgreSQL → Google Sheets) с readonly scopes возникает ошибка 403
    
    Expected Behavior (после исправления):
    - операция batch_update выполняется успешно с кодом 200
    - данные записываются в столбцы E-P
    - логируется sheet_backward_sync_batch_update_completed
    
    Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
    """
    # Arrange
    prize = create_test_prize(case)
    
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
    # Захватываем scopes для определения поведения mock
    captured_scopes = []
    
    def capture_scopes(*args, **kwargs):
        captured_scopes.extend(kwargs.get('scopes', []))
        mock_creds = Mock()
        mock_creds.scopes = kwargs.get('scopes', [])
        return mock_creds
    
    mock_gspread_client = Mock(spec=gspread.Client)
    
    with patch('services.sync.sheets_io.Credentials.from_service_account_file', side_effect=capture_scopes):
        with patch('services.sync.sheets_io.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Mock для Google Sheets API - симулируем реальное поведение API
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    # Проверяем текущие scopes
    # Если scopes readonly → симулируем 403 ошибку (неисправленный код)
    # Если scopes full → симулируем успешное выполнение (исправленный код)
    has_readonly_scopes = 'https://www.googleapis.com/auth/spreadsheets.readonly' in captured_scopes
    
    if has_readonly_scopes:
        # Создаём mock response для 403 ошибки (неисправленный код)
        mock_response = Mock()
        mock_response.status_code = 403
        mock_response.json.return_value = {
            "error": {
                "code": 403,
                "message": "Request had insufficient authentication scopes.",
                "status": "PERMISSION_DENIED"
            }
        }
        mock_response.text = "Request had insufficient authentication scopes."
        
        # batch_update выбрасывает APIError с кодом 403
        mock_worksheet.batch_update.side_effect = gspread.exceptions.APIError(mock_response)
    else:
        # Успешное выполнение (исправленный код)
        mock_worksheet.batch_update.return_value = None
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act & Assert
    # ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест УПАДЁТ с ошибкой APIError: [403]
    # Это правильно - доказывает существование бага
    
    # После исправления (замена readonly scopes на full scopes):
    # Этот тест ПРОЙДЁТ, подтверждая, что баг исправлен
    
    # Проверяем Expected Behavior (то, что ДОЛЖНО быть после исправления)
    try:
        updated_count = await service._sync_sheet_delivery_data(
            case['sheet_name'],
            [prize]
        )
        
        # Expected Behavior: операция batch_update выполнилась успешно
        assert updated_count == 1, "Должна быть обновлена 1 запись"
        
        # Expected Behavior: batch_update был вызван
        mock_worksheet.batch_update.assert_called_once()
        
        # Expected Behavior: данные записаны в столбцы E-P
        batch_data = mock_worksheet.batch_update.call_args[0][0]
        assert len(batch_data) == 1
        assert batch_data[0]['range'] == f"E{case['row_id']}:P{case['row_id']}"
        
        # Проверяем структуру данных
        row_data = batch_data[0]['values'][0]
        assert row_data[0] == case['last_name']  # E: last_name
        assert row_data[1] == case['first_name']  # F: first_name
        assert row_data[2] == (case['patronymic'] or '')  # G: patronymic
        assert row_data[3] == case['city']  # H: city
        assert row_data[4] == case['street']  # I: street
        assert row_data[5] == case['house']  # J: house
        assert row_data[6] == (case['apartment'] or '')  # K: apartment
        assert row_data[7] == case['phone']  # L: phone
        assert row_data[8] == (case['comment'] or '')  # M: comment
        assert row_data[9] == case['country']  # N: country
        assert row_data[10] == case['postal_code']  # O: postal_code
        assert row_data[11] != ''  # P: claimed_at
        
    except gspread.exceptions.APIError as e:
        # ОЖИДАЕМЫЙ РЕЗУЛЬТАТ на неисправленном коде:
        # Ошибка 403 из-за readonly scopes
        
        # Проверяем, что это именно ошибка 403
        assert e.response.status_code == 403, \
            f"Ожидалась ошибка 403, получена {e.response.status_code}"
        
        # Проверяем сообщение об ошибке
        error_message = str(e)
        assert "insufficient authentication scopes" in error_message.lower() or \
               "permission" in error_message.lower(), \
            f"Ожидалось сообщение о недостаточных правах, получено: {error_message}"
        
        # Документируем counterexample
        print("\n" + "="*80)
        print("COUNTEREXAMPLE НАЙДЕН - БАГ ПОДТВЕРЖДЁН")
        print("="*80)
        print(f"Sheet Name: {case['sheet_name']}")
        print(f"Row ID: {case['row_id']}")
        print(f"Prize ID: {case['prize_id']}")
        print(f"Error: {error_message}")
        print(f"Status Code: {e.response.status_code}")
        print("\nПервопричина: _init_client() использует readonly scopes:")
        print("  - 'https://www.googleapis.com/auth/spreadsheets.readonly'")
        print("  - 'https://www.googleapis.com/auth/drive.readonly'")
        print("\nРешение: Заменить на full scopes:")
        print("  - 'https://www.googleapis.com/auth/spreadsheets'")
        print("  - 'https://www.googleapis.com/auth/drive'")
        print("="*80 + "\n")
        
        # ВАЖНО: НЕ пытаемся исправить тест или код
        # Падение теста - это правильно, это доказывает существование бага
        pytest.fail(
            f"БАГ ПОДТВЕРЖДЁН: Backward sync с readonly scopes вызывает 403 ошибку. "
            f"Counterexample: sheet='{case['sheet_name']}', row={case['row_id']}"
        )


@pytest.mark.asyncio
async def test_bug_condition_scopes_verification():
    """
    Вспомогательный тест: Проверка scopes в _init_client
    
    На неисправленном коде: проверяет, что используются readonly scopes (баг)
    На исправленном коде: проверяет, что используются full scopes (исправление)
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
    
    with patch('services.sync.sheets_io.Credentials.from_service_account_file', side_effect=capture_scopes):
        with patch('services.sync.sheets_io.gspread.authorize'):
            # Act
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Assert
    # После исправления: проверяем, что используются full scopes
    assert 'https://www.googleapis.com/auth/spreadsheets' in captured_scopes, \
        "Ожидался full scope для spreadsheets (после исправления)"
    assert 'https://www.googleapis.com/auth/drive' in captured_scopes, \
        "Ожидался full scope для drive (после исправления)"
    
    # Проверяем, что НЕ используются readonly scopes
    assert 'https://www.googleapis.com/auth/spreadsheets.readonly' not in captured_scopes, \
        "Readonly scope для spreadsheets НЕ должен использоваться (после исправления)"
    assert 'https://www.googleapis.com/auth/drive.readonly' not in captured_scopes, \
        "Readonly scope для drive НЕ должен использоваться (после исправления)"
    
    print("\n" + "="*80)
    print("ИСПРАВЛЕНИЕ ПОДТВЕРЖДЕНО")
    print("="*80)
    print("_init_client() использует full scopes:")
    for scope in captured_scopes:
        print(f"  - {scope}")
    print("\nЭто позволяет выполнять операции записи (batch_update) в Google Sheets")
    print("="*80 + "\n")
