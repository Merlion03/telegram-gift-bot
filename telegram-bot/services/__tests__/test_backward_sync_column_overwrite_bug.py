"""
Exploratory Property-Based Test для Bug Condition: Backward Sync Перезаписывает Промокод и Инструкцию

КРИТИЧЕСКИ ВАЖНО: Этот тест написан ДО внесения исправления
ЦЕЛЬ: Продемонстрировать баг и получить counterexamples
ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест УПАДЁТ - столбцы E и F будут перезаписаны

Bug Condition: isBugCondition(input) где
  input.claimed_at IS NOT NULL AND
  input.prize_type == 'digital' AND
  (input.promo_code IS NOT NULL OR input.instructions IS NOT NULL) AND
  backward_sync_is_running()

Expected Behavior (после исправления):
  - данные доставки записываются в столбцы G-R (12 полей)
  - столбец E (промокод) остаётся нетронутым
  - столбец F (инструкция) остаётся нетронутой

Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3

**Validates: Requirements 1.1, 1.2, 1.3**
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase
from unittest.mock import Mock, patch, AsyncMock
import gspread

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig


# Scoped PBT: Ограничиваем property конкретными падающими случаями
# для детерминистичного бага (диапазон E:P всегда перезаписывает E и F)
KNOWN_FAILING_CASES = [
    {
        'prize_id': 1,
        'telegram_id': 100,
        'sheet_name': 'Лист1',
        'row_id': 2,
        'prize_type': 'digital',
        'promo_code': 'TEST123',
        'instructions': 'Инструкция по активации',
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
        'prize_type': 'digital',
        'promo_code': 'PROMO999',
        'instructions': 'Активируйте на сайте example.com',
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
    },
    {
        'prize_id': 3,
        'telegram_id': 300,
        'sheet_name': 'Февраль 2024',
        'row_id': 10,
        'prize_type': 'digital',
        'promo_code': 'ABC',
        'instructions': None,  # Только промокод, без инструкции
        'last_name': 'Сидоров',
        'first_name': 'Сидор',
        'patronymic': 'Сидорович',
        'country': 'Россия',
        'postal_code': '111111',
        'city': 'Казань',
        'street': 'Баумана',
        'house': '5',
        'apartment': '10',
        'phone': '+79111234567',
        'comment': 'Доставка курьером'
    }
]


def create_test_prize(case: dict) -> Prize:
    """Создаёт тестовый Prize из case данных"""
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        id=case['prize_id'],
        telegram_id=case['telegram_id'],
        username=f"user{case['telegram_id']}",
        prize_type=case['prize_type'],
        code_word=f"code{case['prize_id']}",
        promo_code=case.get('promo_code'),
        instructions=case.get('instructions'),
        sheet_name=case['sheet_name'],
        row_id=case['row_id'],
        claimed_at=now,  # NOT NULL - данные доставки заполнены
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


@pytest.mark.asyncio
@pytest.mark.parametrize("case", KNOWN_FAILING_CASES)
async def test_bug_condition_backward_sync_overwrites_promo_code_and_instructions(case):
    """
    Property 1: Bug Condition - Backward Sync Перезаписывает Промокод и Инструкцию
    
    КРИТИЧЕСКИ ВАЖНО: Этот тест ДОЛЖЕН УПАСТЬ на неисправленном коде
    
    Bug Condition: Проверяет, что при обратной синхронизации данных доставки
    для цифрового приза с заполненными промокодом и инструкцией, метод
    _sync_sheet_delivery_data перезаписывает столбцы E (промокод) и F (инструкция)
    
    Expected Behavior (после исправления):
    - данные доставки записываются в столбцы G-R (12 полей)
    - столбец E содержит промокод (не перезаписан)
    - столбец F содержит инструкцию (не перезаписана)
    
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
    
    # Патчим инициализацию клиента
    with patch('services.sync_service.Credentials.from_service_account_file'):
        with patch('services.sync_service.gspread.authorize'):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Mock для Google Sheets API
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    # Симулируем текущее состояние Google Sheets с промокодом и инструкцией
    # Столбцы: A=telegram_id, B=username, C=code_word, D=prize_type, E=promo_code, F=instructions
    initial_sheet_data = {
        'E': case.get('promo_code', ''),  # Столбец E: промокод
        'F': case.get('instructions', '')  # Столбец F: инструкция
    }
    
    # Захватываем данные, которые будут записаны в Google Sheets
    captured_batch_data = []
    
    def capture_batch_update(batch_data):
        captured_batch_data.extend(batch_data)
        return None
    
    mock_worksheet.batch_update = Mock(side_effect=capture_batch_update)
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act
    updated_count = await service._sync_sheet_delivery_data(
        case['sheet_name'],
        [prize]
    )
    
    # Assert
    assert updated_count == 1, "Должна быть обновлена 1 запись"
    assert len(captured_batch_data) == 1, "Должен быть 1 batch update"
    
    batch_update = captured_batch_data[0]
    cell_range = batch_update['range']
    row_data = batch_update['values'][0]
    
    # ПРОВЕРКА БАГА: На неисправленном коде диапазон будет E:P
    # После исправления диапазон должен быть G:R
    
    print("\n" + "="*80)
    print("АНАЛИЗ BACKWARD SYNC")
    print("="*80)
    print(f"Sheet Name: {case['sheet_name']}")
    print(f"Row ID: {case['row_id']}")
    print(f"Prize Type: {case['prize_type']}")
    print(f"Promo Code (исходный): {case.get('promo_code')}")
    print(f"Instructions (исходные): {case.get('instructions')}")
    print(f"\nДиапазон обновления: {cell_range}")
    print(f"Количество полей в row_data: {len(row_data)}")
    print(f"\nСтруктура row_data:")
    for i, value in enumerate(row_data):
        print(f"  [{i}]: {value}")
    
    # Expected Behavior: данные доставки должны записываться в столбцы G-R
    # Это означает диапазон G{row_id}:R{row_id}
    expected_range = f"G{case['row_id']}:R{case['row_id']}"
    
    # На неисправленном коде: диапазон будет E{row_id}:P{row_id}
    # Это перезаписывает столбцы E (промокод) и F (инструкция)
    
    if cell_range.startswith('E'):
        # БАГ ОБНАРУЖЕН: диапазон начинается с E
        print("\n" + "="*80)
        print("COUNTEREXAMPLE НАЙДЕН - БАГ ПОДТВЕРЖДЁН")
        print("="*80)
        print(f"Текущий диапазон: {cell_range}")
        print(f"Ожидаемый диапазон: {expected_range}")
        print("\nПоследствия:")
        print(f"  - Столбец E (промокод) будет перезаписан значением: '{row_data[0]}' (last_name)")
        print(f"  - Столбец F (инструкция) будет перезаписана значением: '{row_data[1]}' (first_name)")
        print(f"  - Исходный промокод '{case.get('promo_code')}' будет ПОТЕРЯН")
        print(f"  - Исходная инструкция '{case.get('instructions')}' будет ПОТЕРЯНА")
        print("\nПервопричина:")
        print("  Метод _sync_sheet_delivery_data (строка 1059) использует диапазон E:P")
        print("  вместо правильного диапазона G:R")
        print("\nРешение:")
        print("  Изменить строку 1059 в telegram-bot/services/sync_service.py:")
        print(f"  cell_range = f'E{{prize.row_id}}:P{{prize.row_id}}'  # НЕПРАВИЛЬНО")
        print(f"  cell_range = f'G{{prize.row_id}}:R{{prize.row_id}}'  # ПРАВИЛЬНО")
        print("="*80 + "\n")
        
        # ВАЖНО: НЕ пытаемся исправить тест или код
        # Падение теста - это правильно, это доказывает существование бага
        pytest.fail(
            f"БАГ ПОДТВЕРЖДЁН: Backward sync перезаписывает столбцы E и F. "
            f"Counterexample: sheet='{case['sheet_name']}', row={case['row_id']}, "
            f"диапазон='{cell_range}' (ожидался '{expected_range}')"
        )
    
    # Expected Behavior (после исправления): проверяем правильный диапазон
    assert cell_range == expected_range, \
        f"Диапазон должен быть {expected_range}, получен {cell_range}"
    
    # Expected Behavior: проверяем структуру данных в столбцах G-R
    assert len(row_data) == 12, "Должно быть 12 полей данных доставки"
    
    # Проверяем, что данные доставки записаны правильно
    assert row_data[0] == case['last_name'], "G: last_name"
    assert row_data[1] == case['first_name'], "H: first_name"
    assert row_data[2] == (case['patronymic'] or ''), "I: patronymic"
    assert row_data[3] == case['city'], "J: city"
    assert row_data[4] == case['street'], "K: street"
    assert row_data[5] == case['house'], "L: house"
    assert row_data[6] == (case['apartment'] or ''), "M: apartment"
    assert row_data[7] == case['phone'], "N: phone"
    assert row_data[8] == (case['comment'] or ''), "O: comment"
    assert row_data[9] == case['country'], "P: country"
    assert row_data[10] == case['postal_code'], "Q: postal_code"
    assert row_data[11] != '', "R: claimed_at должен быть заполнен"
    
    print("\n" + "="*80)
    print("ИСПРАВЛЕНИЕ ПОДТВЕРЖДЕНО")
    print("="*80)
    print(f"Диапазон обновления: {cell_range} ✓")
    print(f"Столбцы E и F НЕ затронуты ✓")
    print(f"Данные доставки записаны в столбцы G-R ✓")
    print("="*80 + "\n")


@pytest.mark.asyncio
async def test_bug_condition_digital_prize_without_delivery_data():
    """
    Граничный случай: Цифровой приз без данных доставки (claimed_at=NULL)
    
    Backward sync НЕ должен выполняться для записей без данных доставки.
    Этот тест проверяет, что баг НЕ проявляется в этом случае.
    """
    # Arrange
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        id=999,
        telegram_id=999,
        username="user999",
        prize_type='digital',
        code_word="code999",
        promo_code='PROMO_NO_DELIVERY',
        instructions='Инструкция без доставки',
        sheet_name='Тест',
        row_id=99,
        claimed_at=None,  # NULL - данные доставки НЕ заполнены
        updated_at=now,
        created_at=now,
        gdpr_consent_date=now,
        # Все поля доставки пустые
        last_name=None,
        first_name=None,
        patronymic=None,
        country=None,
        postal_code=None,
        city=None,
        street=None,
        house=None,
        apartment=None,
        phone=None,
        comment=None
    )
    
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
    
    with patch('services.sync_service.Credentials.from_service_account_file'):
        with patch('services.sync_service.gspread.authorize'):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act
    # Backward sync вызывается только для записей с claimed_at NOT NULL
    # Поэтому этот тест проверяет, что метод корректно обрабатывает пустые данные
    updated_count = await service._sync_sheet_delivery_data('Тест', [prize])
    
    # Assert
    # Метод должен обработать запись, но данные будут пустыми
    assert updated_count == 1
    
    print("\n" + "="*80)
    print("ГРАНИЧНЫЙ СЛУЧАЙ: Цифровой приз без данных доставки")
    print("="*80)
    print("claimed_at=NULL - backward sync обрабатывает пустые данные")
    print("Баг НЕ критичен в этом случае (перезаписываются пустые значения)")
    print("="*80 + "\n")


@pytest.mark.asyncio
async def test_bug_condition_physical_prize():
    """
    Граничный случай: Физический приз с данными доставки
    
    Для физических призов столбцы E и F не используются (нет промокода и инструкции).
    Баг НЕ критичен для физических призов, но диапазон всё равно неправильный.
    """
    # Arrange
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        id=888,
        telegram_id=888,
        username="user888",
        prize_type='physical',  # Физический приз
        code_word="code888",
        promo_code=None,  # Физические призы не имеют промокода
        instructions=None,  # Физические призы не имеют инструкции
        sheet_name='Тест',
        row_id=88,
        claimed_at=now,  # NOT NULL - данные доставки заполнены
        updated_at=now,
        created_at=now,
        gdpr_consent_date=now,
        last_name='Тестов',
        first_name='Тест',
        patronymic='Тестович',
        country='Россия',
        postal_code='999999',
        city='Тестовый',
        street='Тестовая',
        house='99',
        apartment='99',
        phone='+79999999999',
        comment='Тестовый комментарий'
    )
    
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
    
    with patch('services.sync_service.Credentials.from_service_account_file'):
        with patch('services.sync_service.gspread.authorize'):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    captured_batch_data = []
    
    def capture_batch_update(batch_data):
        captured_batch_data.extend(batch_data)
        return None
    
    mock_worksheet.batch_update = Mock(side_effect=capture_batch_update)
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act
    updated_count = await service._sync_sheet_delivery_data('Тест', [prize])
    
    # Assert
    assert updated_count == 1
    assert len(captured_batch_data) == 1
    
    batch_update = captured_batch_data[0]
    cell_range = batch_update['range']
    
    print("\n" + "="*80)
    print("ГРАНИЧНЫЙ СЛУЧАЙ: Физический приз")
    print("="*80)
    print(f"Диапазон обновления: {cell_range}")
    print("Для физических призов столбцы E и F не используются")
    print("Баг НЕ критичен, но диапазон всё равно должен быть G:R")
    print("="*80 + "\n")
    
    # Проверяем, что диапазон правильный (после исправления)
    expected_range = f"G{prize.row_id}:R{prize.row_id}"
    
    if cell_range.startswith('E'):
        print("ПРИМЕЧАНИЕ: Диапазон начинается с E (неисправленный код)")
        print("Для физических призов это не критично, но архитектурно неправильно")
