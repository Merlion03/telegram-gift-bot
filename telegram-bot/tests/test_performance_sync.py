"""
Benchmark тесты производительности синхронизации

Проверяет, что синхронизация данных из Google Sheets в PostgreSQL
выполняется за приемлемое время даже при большом объёме данных.
"""
import pytest
import time
from typing import List, Dict, Any
from unittest.mock import Mock
import gspread
from sqlalchemy.ext.asyncio import AsyncSession

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from config import GoogleSheetsConfig, SyncConfig


@pytest.mark.asyncio
async def test_benchmark_sync_1000_records(db_session: AsyncSession):
    """
    Benchmark тест производительности синхронизации
    
    Validates: Requirements 9.1
    
    Проверяет, что синхронизация листа с 1000 записями
    выполняется за время < 30 секунд
    """
    # Arrange - подготовка тестовых данных (1000 записей)
    test_sheet_name = 'benchmark_sheet_1000'
    
    # Генерируем заголовки
    test_data = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions']
    ]
    
    # Генерируем 1000 записей
    print("\n=== Генерация 1000 тестовых записей ===")
    for i in range(1000):
        row = [
            str(5000000 + i),  # telegram_id
            'digital' if i % 2 == 0 else 'physical',  # prize_type
            f'BENCH_PROMO_{i}' if i % 2 == 0 else '',  # promo_code
            f'Benchmark instructions {i}' if i % 2 == 0 else ''  # instructions
        ]
        test_data.append(row)
    
    print(f"Сгенерировано {len(test_data) - 1} записей")
    
    # Mock Google Sheets клиента
    mock_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    mock_client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheets.return_value = [mock_worksheet]
    mock_worksheet.title = test_sheet_name
    mock_worksheet.get_all_values.return_value = test_data
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    
    # Создаём конфигурации
    google_sheets_config = GoogleSheetsConfig(
        credentials_path='dummy_path.json',
        spreadsheet_id='dummy_spreadsheet_id'
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,  # Используем батчи по 100 записей
        max_retries=3
    )
    
    # Создаём repository и service
    prize_repository = PrizeRepository(session=db_session)
    sync_service = SyncService(
        google_sheets_config=google_sheets_config,
        sync_config=sync_config,
        prize_repository=prize_repository
    )
    
    sync_service.client = mock_client
    
    # Act - выполняем синхронизацию с измерением времени
    print("\n=== Запуск синхронизации ===")
    start_time = time.time()
    
    stats = await sync_service.sync_all_sheets()
    
    elapsed_time = time.time() - start_time
    
    # Assert - проверяем производительность
    print(f"\n=== Результаты benchmark ===")
    print(f"Время синхронизации: {elapsed_time:.2f} секунд")
    print(f"Обработано листов: {stats['sheets_processed']}")
    print(f"Всего записей: {stats['total_records']}")
    print(f"Новых записей: {stats['new_records']}")
    print(f"Ошибок: {len(stats['errors'])}")
    print(f"Скорость: {stats['total_records'] / elapsed_time:.2f} записей/сек")
    
    # Проверяем требование: время < 30 секунд
    assert elapsed_time < 30, f"Синхронизация заняла {elapsed_time:.2f}s, что превышает 30s"
    
    # Проверяем, что все записи синхронизированы
    assert stats['sheets_processed'] == 1
    assert stats['total_records'] == 1000
    assert len(stats['errors']) == 0
    
    # Проверяем несколько случайных записей в БД
    import random
    random.seed(42)
    
    for _ in range(10):
        random_id = 5000000 + random.randint(0, 999)
        prize = await prize_repository.find_prize(random_id, test_sheet_name)
        assert prize is not None, f"Запись {random_id} не найдена в БД"
        assert prize.telegram_id == random_id
        assert prize.sheet_name == test_sheet_name
    
    print("\n✓ Benchmark пройден успешно")


@pytest.mark.asyncio
async def test_benchmark_sync_multiple_batches(db_session: AsyncSession):
    """
    Benchmark тест синхронизации с несколькими батчами
    
    Validates: Requirements 9.1, 9.4
    
    Проверяет эффективность batch операций при синхронизации
    """
    # Arrange - подготовка данных для тестирования разных размеров батчей
    test_sheet_name = 'benchmark_batches'
    
    # Генерируем 500 записей
    test_data = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions']
    ]
    
    for i in range(500):
        row = [
            str(6000000 + i),
            'digital',
            f'BATCH_PROMO_{i}',
            f'Batch instructions {i}'
        ]
        test_data.append(row)
    
    # Mock Google Sheets клиента
    mock_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    mock_client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheets.return_value = [mock_worksheet]
    mock_worksheet.title = test_sheet_name
    mock_worksheet.get_all_values.return_value = test_data
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    
    google_sheets_config = GoogleSheetsConfig(
        credentials_path='dummy_path.json',
        spreadsheet_id='dummy_spreadsheet_id'
    )
    
    # Тестируем разные размеры батчей
    batch_sizes = [50, 100, 200]
    results = []
    
    for batch_size in batch_sizes:
        print(f"\n=== Тест с batch_size={batch_size} ===")
        
        # Очищаем БД перед каждым тестом
        from sqlalchemy import text
        await db_session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
        await db_session.commit()
        
        sync_config = SyncConfig(
            sync_interval_seconds=60,
            use_postgres=True,
            batch_size=batch_size,
            max_retries=3
        )
        
        prize_repository = PrizeRepository(session=db_session)
        sync_service = SyncService(
            google_sheets_config=google_sheets_config,
            sync_config=sync_config,
            prize_repository=prize_repository
        )
        
        sync_service.client = mock_client
        
        # Выполняем синхронизацию
        start_time = time.time()
        stats = await sync_service.sync_all_sheets()
        elapsed_time = time.time() - start_time
        
        results.append({
            'batch_size': batch_size,
            'elapsed_time': elapsed_time,
            'records_per_second': stats['total_records'] / elapsed_time
        })
        
        print(f"Время: {elapsed_time:.2f}s")
        print(f"Скорость: {stats['total_records'] / elapsed_time:.2f} записей/сек")
        
        # Проверяем, что все записи синхронизированы
        assert stats['total_records'] == 500
        assert len(stats['errors']) == 0
    
    # Assert - анализируем результаты
    print(f"\n=== Сравнение результатов ===")
    for result in results:
        print(f"Batch size {result['batch_size']}: "
              f"{result['elapsed_time']:.2f}s, "
              f"{result['records_per_second']:.2f} записей/сек")
    
    # Проверяем, что все варианты укладываются в разумное время
    for result in results:
        assert result['elapsed_time'] < 15, \
            f"Синхронизация с batch_size={result['batch_size']} слишком медленная"
    
    print("\n✓ Все размеры батчей показывают хорошую производительность")


@pytest.mark.asyncio
async def test_benchmark_sync_with_updates(db_session: AsyncSession):
    """
    Benchmark тест синхронизации с обновлениями существующих записей
    
    Validates: Requirements 9.1, 2.4
    
    Проверяет производительность upsert операций при обновлении
    существующих записей (не только INSERT, но и UPDATE)
    """
    # Arrange - подготовка начальных данных
    test_sheet_name = 'benchmark_updates'
    
    initial_data = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions']
    ]
    
    # Генерируем 500 начальных записей
    for i in range(500):
        row = [
            str(7000000 + i),
            'digital',
            f'OLD_PROMO_{i}',
            f'Old instructions {i}'
        ]
        initial_data.append(row)
    
    # Mock Google Sheets клиента
    mock_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    mock_client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheets.return_value = [mock_worksheet]
    mock_worksheet.title = test_sheet_name
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    
    google_sheets_config = GoogleSheetsConfig(
        credentials_path='dummy_path.json',
        spreadsheet_id='dummy_spreadsheet_id'
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )
    
    prize_repository = PrizeRepository(session=db_session)
    sync_service = SyncService(
        google_sheets_config=google_sheets_config,
        sync_config=sync_config,
        prize_repository=prize_repository
    )
    
    sync_service.client = mock_client
    
    # Act 1 - первая синхронизация (INSERT)
    print("\n=== Первая синхронизация (INSERT) ===")
    mock_worksheet.get_all_values.return_value = initial_data
    
    start_time = time.time()
    stats1 = await sync_service.sync_all_sheets()
    insert_time = time.time() - start_time
    
    print(f"Время INSERT: {insert_time:.2f}s")
    print(f"Скорость: {stats1['total_records'] / insert_time:.2f} записей/сек")
    
    # Подготовка обновлённых данных
    updated_data = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions']
    ]
    
    for i in range(500):
        row = [
            str(7000000 + i),
            'digital',
            f'NEW_PROMO_{i}',  # Обновлённый промокод
            f'New instructions {i}'  # Обновлённые инструкции
        ]
        updated_data.append(row)
    
    # Act 2 - вторая синхронизация (UPDATE)
    print("\n=== Вторая синхронизация (UPDATE) ===")
    mock_worksheet.get_all_values.return_value = updated_data
    
    start_time = time.time()
    stats2 = await sync_service.sync_all_sheets()
    update_time = time.time() - start_time
    
    print(f"Время UPDATE: {update_time:.2f}s")
    print(f"Скорость: {stats2['total_records'] / update_time:.2f} записей/сек")
    
    # Assert - проверяем производительность
    assert insert_time < 15, f"INSERT синхронизация слишком медленная: {insert_time:.2f}s"
    assert update_time < 15, f"UPDATE синхронизация слишком медленная: {update_time:.2f}s"
    
    # Проверяем, что данные действительно обновились
    import random
    random.seed(42)
    
    for _ in range(10):
        random_id = 7000000 + random.randint(0, 499)
        prize = await prize_repository.find_prize(random_id, test_sheet_name)
        assert prize is not None
        assert prize.promo_code.startswith('NEW_PROMO_'), \
            f"Промокод не обновился для {random_id}"
        assert prize.instructions.startswith('New instructions'), \
            f"Инструкции не обновились для {random_id}"
    
    print(f"\n=== Сравнение производительности ===")
    print(f"INSERT: {insert_time:.2f}s ({stats1['total_records'] / insert_time:.2f} записей/сек)")
    print(f"UPDATE: {update_time:.2f}s ({stats2['total_records'] / update_time:.2f} записей/сек)")
    
    # UPDATE может быть немного медленнее INSERT, но не должен быть значительно медленнее
    slowdown_ratio = update_time / insert_time
    print(f"Замедление UPDATE относительно INSERT: {slowdown_ratio:.2f}x")
    
    assert slowdown_ratio < 2.0, \
        f"UPDATE слишком медленный относительно INSERT: {slowdown_ratio:.2f}x"
    
    print("\n✓ Производительность UPDATE приемлема")


@pytest.mark.asyncio
async def test_benchmark_sync_large_dataset(db_session: AsyncSession):
    """
    Benchmark тест синхронизации большого датасета (2000 записей)
    
    Validates: Requirements 9.1
    
    Проверяет, что система может эффективно обрабатывать
    большие объёмы данных
    """
    # Arrange - подготовка большого датасета
    test_sheet_name = 'benchmark_large'
    
    print("\n=== Генерация 2000 тестовых записей ===")
    test_data = [
        ['telegram_id', 'prize_type', 'promo_code', 'instructions']
    ]
    
    for i in range(2000):
        row = [
            str(8000000 + i),
            'digital' if i % 3 != 0 else 'physical',
            f'LARGE_PROMO_{i}' if i % 3 != 0 else '',
            f'Large dataset instructions {i}' if i % 3 != 0 else ''
        ]
        test_data.append(row)
    
    # Mock Google Sheets клиента
    mock_client = Mock(spec=gspread.Client)
    mock_spreadsheet = Mock()
    mock_worksheet = Mock()
    
    mock_client.open_by_key.return_value = mock_spreadsheet
    mock_spreadsheet.worksheets.return_value = [mock_worksheet]
    mock_worksheet.title = test_sheet_name
    mock_worksheet.get_all_values.return_value = test_data
    mock_spreadsheet.worksheet.return_value = mock_worksheet
    
    google_sheets_config = GoogleSheetsConfig(
        credentials_path='dummy_path.json',
        spreadsheet_id='dummy_spreadsheet_id'
    )
    
    sync_config = SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=200,  # Увеличиваем размер батча для больших данных
        max_retries=3
    )
    
    prize_repository = PrizeRepository(session=db_session)
    sync_service = SyncService(
        google_sheets_config=google_sheets_config,
        sync_config=sync_config,
        prize_repository=prize_repository
    )
    
    sync_service.client = mock_client
    
    # Act - выполняем синхронизацию
    print("\n=== Запуск синхронизации 2000 записей ===")
    start_time = time.time()
    
    stats = await sync_service.sync_all_sheets()
    
    elapsed_time = time.time() - start_time
    
    # Assert - проверяем производительность
    print(f"\n=== Результаты benchmark (2000 записей) ===")
    print(f"Время синхронизации: {elapsed_time:.2f} секунд")
    print(f"Обработано записей: {stats['total_records']}")
    print(f"Скорость: {stats['total_records'] / elapsed_time:.2f} записей/сек")
    print(f"Ошибок: {len(stats['errors'])}")
    
    # Для 2000 записей допускаем до 60 секунд (пропорционально 30s для 1000)
    assert elapsed_time < 60, f"Синхронизация 2000 записей заняла {elapsed_time:.2f}s"
    
    # Проверяем, что все записи синхронизированы
    assert stats['sheets_processed'] == 1
    assert stats['total_records'] == 2000
    assert len(stats['errors']) == 0
    
    # Проверяем скорость обработки (должна быть не менее 30 записей/сек)
    records_per_second = stats['total_records'] / elapsed_time
    assert records_per_second >= 30, \
        f"Скорость обработки слишком низкая: {records_per_second:.2f} записей/сек"
    
    print("\n✓ Benchmark для большого датасета пройден успешно")
