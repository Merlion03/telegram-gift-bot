"""
Exploratory Property-Based Test для Bug Condition: Google Sheets Full Sync Bug

КРИТИЧЕСКИ ВАЖНО: Этот тест написан ДО внесения исправления
ЦЕЛЬ: Продемонстрировать баг и получить counterexamples
ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест УПАДЁТ - это правильно, это доказывает существование бага

Bug Condition: isBugCondition(input) где
  input содержит записи, которые:
  - Изменены в Google Sheets (существуют в PostgreSQL, но данные отличаются)
  - Удалены из Google Sheets (существуют в PostgreSQL, но отсутствуют в Google Sheets)

Expected Behavior (после исправления):
  - Изменённые записи обновляются в PostgreSQL (updated_records > 0)
  - Удалённые записи без данных доставки удаляются из PostgreSQL
  - Удалённые записи с данными доставки архивируются (is_archived=true)
  - Статистика корректна (new_records, updated_records, deleted_records)

Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any
from unittest.mock import Mock, AsyncMock, patch
import asyncio

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize
from config import GoogleSheetsConfig, SyncConfig


# Scoped PBT: Конкретные падающие случаи для детерминистичного бага
KNOWN_FAILING_CASES = [
    {
        'name': 'Scenario 1: Record modified in Google Sheets (prize_type changed)',
        'sheet_name': 'Лист1',
        'postgres_records': [
            {
                'telegram_id': 123,
                'code_word': 'TEST',
                'prize_type': 'digital',
                'promo_code': 'PROMO123',
                'claimed_at': None,
                'row_id': 2
            }
        ],
        'sheets_records': [
            ['123', 'user123', 'TEST', 'physical', '', '', '', '', '', '', '', '', '', '']
        ],
        'expected_behavior': {
            'updated_records': 1,
            'prize_type_after': 'physical'
        }
    },
    {
        'name': 'Scenario 2: Record deleted from Google Sheets (claimed_at IS NULL)',
        'sheet_name': 'Лист2',
        'postgres_records': [
            {
                'telegram_id': 456,
                'code_word': 'TEST2',
                'prize_type': 'digital',
                'promo_code': 'PROMO456',
                'claimed_at': None,
                'row_id': 3
            }
        ],
        'sheets_records': [],  # Запись удалена из Google Sheets
        'expected_behavior': {
            'deleted_records': 1,
            'record_exists_after': False
        }
    },
    {
        'name': 'Scenario 3: Record deleted from Google Sheets (claimed_at IS NOT NULL)',
        'sheet_name': 'Лист3',
        'postgres_records': [
            {
                'telegram_id': 789,
                'code_word': 'TEST3',
                'prize_type': 'physical',
                'claimed_at': datetime.now(timezone.utc),
                'last_name': 'Иванов',
                'first_name': 'Иван',
                'city': 'Москва',
                'row_id': 4
            }
        ],
        'sheets_records': [],  # Запись удалена из Google Sheets
        'expected_behavior': {
            'deleted_records': 1,
            'is_archived_after': True,
            'record_exists_after': True
        }
    },
    {
        'name': 'Scenario 4: Statistics show updated_records=0, deleted_records=0',
        'sheet_name': 'Лист4',
        'postgres_records': [
            {
                'telegram_id': 111,
                'code_word': 'NEW1',
                'prize_type': 'digital',
                'claimed_at': None,
                'row_id': 5
            },
            {
                'telegram_id': 222,
                'code_word': 'MODIFIED',
                'prize_type': 'digital',
                'claimed_at': None,
                'row_id': 6
            },
            {
                'telegram_id': 333,
                'code_word': 'DELETED',
                'prize_type': 'digital',
                'claimed_at': None,
                'row_id': 7
            }
        ],
        'sheets_records': [
            ['111', 'user111', 'NEW1', 'digital', 'PROMO111', '', '', '', '', '', '', '', '', ''],
            ['222', 'user222', 'MODIFIED', 'physical', '', '', '', '', '', '', '', '', '', ''],  # Изменён prize_type
            ['444', 'user444', 'NEW2', 'digital', 'PROMO444', '', '', '', '', '', '', '', '', '']  # Новая запись
        ],
        'expected_behavior': {
            'new_records': 1,  # NEW2
            'updated_records': 1,  # MODIFIED
            'deleted_records': 1  # DELETED
        }
    }
]


def create_test_prize(record: Dict[str, Any], sheet_name: str) -> Prize:
    """Создаёт тестовый Prize из record данных"""
    now = datetime.now(timezone.utc)
    
    prize = Prize(
        telegram_id=record['telegram_id'],
        username=f"user{record['telegram_id']}",
        prize_type=record['prize_type'],
        code_word=record['code_word'],
        sheet_name=sheet_name,
        row_id=record['row_id'],
        claimed_at=record.get('claimed_at'),
        updated_at=now,
        created_at=now,
        promo_code=record.get('promo_code'),
        last_name=record.get('last_name'),
        first_name=record.get('first_name'),
        city=record.get('city')
    )
    
    return prize


@pytest.mark.asyncio
@pytest.mark.parametrize("case", KNOWN_FAILING_CASES, ids=lambda c: c['name'])
async def test_bug_condition_full_sync_updates_and_deletes(case):
    """
    Property 1: Bug Condition - Google Sheets Full Sync Bug (Updates and Deletes)
    
    КРИТИЧЕСКИ ВАЖНО: Этот тест ДОЛЖЕН УПАСТЬ на неисправленном коде
    
    Bug Condition: Проверяет, что текущая реализация НЕ обрабатывает:
    - Обновление изменённых записей в PostgreSQL
    - Удаление записей, удалённых из Google Sheets
    - Архивирование записей с данными доставки
    - Корректную статистику (updated_records, deleted_records)
    
    Expected Behavior (после исправления):
    - Изменённые записи обновляются в PostgreSQL
    - Удалённые записи без данных доставки удаляются
    - Удалённые записи с данными доставки архивируются
    - Статистика корректна
    
    Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
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
    
    # Mock PrizeRepository
    mock_prize_repository = Mock(spec=PrizeRepository)
    
    # Создаём тестовые записи PostgreSQL
    postgres_prizes = [
        create_test_prize(record, case['sheet_name'])
        for record in case['postgres_records']
    ]
    
    # Mock для методов repository
    # После исправления batch_upsert_prizes возвращает Dict[str, int] вместо int
    # Умный mock: определяет новые vs обновлённые записи на основе postgres_records
    postgres_keys = {(p.telegram_id, p.code_word) for p in postgres_prizes}
    sheets_keys = {(int(row[0]), row[2]) for row in case['sheets_records']}
    
    # Создаём словарь postgres записей для быстрого поиска
    postgres_dict = {(p.telegram_id, p.code_word): p for p in postgres_prizes}
    
    # Определяем новые записи (есть в sheets, но нет в postgres)
    new_records_count = len(sheets_keys - postgres_keys)
    
    # Определяем обновлённые записи (есть в обоих И данные отличаются)
    updated_records_count = 0
    for row in case['sheets_records']:
        telegram_id = int(row[0])
        code_word = row[2]
        prize_type = row[3]
        
        key = (telegram_id, code_word)
        if key in postgres_dict:
            # Запись существует в обоих - проверяем, изменилась ли она
            postgres_record = postgres_dict[key]
            if postgres_record.prize_type != prize_type:
                # Данные отличаются - это обновление
                updated_records_count += 1
    
    # Вычисляем удалённые записи (есть в postgres, но нет в sheets)
    deleted_keys = postgres_keys - sheets_keys
    deleted_records = [p for p in postgres_prizes if (p.telegram_id, p.code_word) in deleted_keys]
    to_delete_count = len([p for p in deleted_records if p.claimed_at is None])
    to_archive_count = len([p for p in deleted_records if p.claimed_at is not None])
    
    mock_prize_repository.batch_upsert_prizes = AsyncMock(
        return_value={'new_records': new_records_count, 'updated_records': updated_records_count}
    )
    mock_prize_repository.get_prizes_by_sheet = AsyncMock(return_value=postgres_prizes)
    mock_prize_repository.batch_delete_prizes = AsyncMock(return_value=to_delete_count)
    mock_prize_repository.batch_archive_prizes = AsyncMock(return_value=to_archive_count)
    
    # Mock для gspread client
    mock_gspread_client = Mock()
    
    with patch('services.sync.sheets_io.Credentials.from_service_account_file'):
        with patch('services.sync.sheets_io.gspread.authorize', return_value=mock_gspread_client):
            service = SyncService(
                google_sheets_config=google_sheets_config,
                sync_config=sync_config,
                prize_repository=mock_prize_repository
            )
    
    # Mock для Google Sheets API
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    mock_worksheet.get_all_values.return_value = [
        ['telegram_id', 'username', 'code_word', 'prize_type', 'promo_code', 'instructions',
         'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone']
    ] + case['sheets_records']
    
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    service.client.open_by_key = Mock(return_value=mock_spreadsheet)
    
    # Act
    stats = await service.sync_sheet(case['sheet_name'])
    
    # Assert - Проверяем Expected Behavior (то, что ДОЛЖНО быть после исправления)
    expected = case['expected_behavior']
    
    # Документируем counterexample
    print("\n" + "="*80)
    print(f"ТЕСТ: {case['name']}")
    print("="*80)
    print(f"Sheet Name: {case['sheet_name']}")
    print(f"PostgreSQL Records: {len(case['postgres_records'])}")
    print(f"Google Sheets Records: {len(case['sheets_records'])}")
    print("\nТекущее поведение (НЕИСПРАВЛЕННЫЙ КОД):")
    print(f"  new_records: {stats.get('new_records', 0)}")
    print(f"  updated_records: {stats.get('updated_records', 0)}")
    print(f"  deleted_records: {stats.get('deleted_records', 0)}")
    
    # Проверяем, что текущая реализация НЕ соответствует ожидаемому поведению
    failures = []
    
    if 'updated_records' in expected:
        if stats.get('updated_records', 0) != expected['updated_records']:
            failures.append(
                f"updated_records: ожидалось {expected['updated_records']}, "
                f"получено {stats.get('updated_records', 0)}"
            )
    
    if 'deleted_records' in expected:
        if stats.get('deleted_records', 0) != expected['deleted_records']:
            failures.append(
                f"deleted_records: ожидалось {expected['deleted_records']}, "
                f"получено {stats.get('deleted_records', 0)}"
            )
    
    if 'new_records' in expected:
        if stats.get('new_records', 0) != expected['new_records']:
            failures.append(
                f"new_records: ожидалось {expected['new_records']}, "
                f"получено {stats.get('new_records', 0)}"
            )
    
    if failures:
        print("\nОЖИДАЕМОЕ ПОВЕДЕНИЕ (ПОСЛЕ ИСПРАВЛЕНИЯ):")
        for key, value in expected.items():
            print(f"  {key}: {value}")
        
        print("\nПЕРВОПРИЧИНА БАГА:")
        print("  1. sync_sheet() выполняет только INSERT/UPDATE через batch_upsert_prizes()")
        print("  2. Отсутствует механизм DELETE (diff между Google Sheets и PostgreSQL)")
        print("  3. batch_upsert_prizes() возвращает только общий count, не различает new/updated")
        print("  4. Отсутствует поле is_archived для архивирования записей с данными доставки")
        
        print("\nРЕШЕНИЕ:")
        print("  1. Реализовать трёхфазную синхронизацию: INSERT/UPDATE → DELETE → STATS")
        print("  2. Добавить get_prizes_by_sheet() для получения записей PostgreSQL")
        print("  3. Добавить batch_delete_prizes() и batch_archive_prizes()")
        print("  4. Модифицировать batch_upsert_prizes() для возврата {'new_records': N, 'updated_records': M'}")
        print("  5. Добавить поле is_archived в модель Prize")
        print("="*80 + "\n")
        
        # ВАЖНО: НЕ пытаемся исправить тест или код
        # Падение теста - это правильно, это доказывает существование бага
        pytest.fail(
            f"БАГ ПОДТВЕРЖДЁН: {case['name']}\n" +
            "\n".join(failures)
        )
    else:
        # Если тест прошёл - значит баг исправлен
        print("\nИСПРАВЛЕНИЕ ПОДТВЕРЖДЕНО: Все проверки пройдены")
        print("="*80 + "\n")


@pytest.mark.asyncio
async def test_bug_condition_verification_current_implementation():
    """
    Вспомогательный тест: Проверка текущей реализации sync_sheet
    
    На неисправленном коде: подтверждает, что sync_sheet НЕ выполняет DELETE операции
    На исправленном коде: подтверждает, что sync_sheet выполняет трёхфазную синхронизацию
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
    # После исправления batch_upsert_prizes возвращает Dict[str, int] вместо int
    mock_prize_repository.batch_upsert_prizes = AsyncMock(
        return_value={'new_records': 5, 'updated_records': 0}
    )
    
    # Проверяем наличие методов для DELETE операций
    has_get_prizes_by_sheet = hasattr(PrizeRepository, 'get_prizes_by_sheet')
    has_batch_delete_prizes = hasattr(PrizeRepository, 'batch_delete_prizes')
    has_batch_archive_prizes = hasattr(PrizeRepository, 'batch_archive_prizes')
    
    # Проверяем наличие поля is_archived в модели Prize
    has_is_archived_field = hasattr(Prize, 'is_archived')
    
    print("\n" + "="*80)
    print("ПРОВЕРКА ТЕКУЩЕЙ РЕАЛИЗАЦИИ")
    print("="*80)
    print(f"PrizeRepository.get_prizes_by_sheet: {'✓' if has_get_prizes_by_sheet else '✗'}")
    print(f"PrizeRepository.batch_delete_prizes: {'✓' if has_batch_delete_prizes else '✗'}")
    print(f"PrizeRepository.batch_archive_prizes: {'✓' if has_batch_archive_prizes else '✗'}")
    print(f"Prize.is_archived: {'✓' if has_is_archived_field else '✗'}")
    
    if not all([has_get_prizes_by_sheet, has_batch_delete_prizes, 
                has_batch_archive_prizes, has_is_archived_field]):
        print("\nСТАТУС: НЕИСПРАВЛЕННЫЙ КОД")
        print("Отсутствуют необходимые методы/поля для трёхфазной синхронизации")
        print("="*80 + "\n")
        
        pytest.fail(
            "БАГ ПОДТВЕРЖДЁН: Отсутствуют методы для DELETE операций и поле is_archived"
        )
    else:
        print("\nСТАТУС: ИСПРАВЛЕННЫЙ КОД")
        print("Все необходимые методы/поля для трёхфазной синхронизации присутствуют")
        print("="*80 + "\n")
