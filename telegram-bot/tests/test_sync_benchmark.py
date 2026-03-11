"""
Benchmark тесты производительности синхронизации

Проверяет производительность синхронизации больших объемов данных
"""
import pytest
import asyncio
import time
from typing import List, Dict, Any

import gspread
from google.oauth2.service_account import Credentials

from config import get_config
from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository
from database.connection import init_database, get_database


@pytest.fixture(scope="session", autouse=True)
def reload_env():
    """Перезагружает переменные окружения перед тестами"""
    from dotenv import load_dotenv
    import config
    
    # Перезагружаем .env
    load_dotenv(override=True)
    
    # Сбрасываем кэш конфигурации
    config.config = None


@pytest.fixture(autouse=True)
async def init_db():
    """Инициализирует подключение к базе данных для тестов"""
    config = get_config()
    
    # Инициализируем БД
    init_database(
        database_url=config.database.connection_url,
        pool_size=config.database.pool_size,
        max_overflow=config.database.max_overflow,
        pool_pre_ping=config.database.pool_pre_ping
    )
    
    yield
    
    # Закрываем подключение после теста
    await get_database().close()


@pytest.fixture
async def test_worksheet_name():
    """Генерирует уникальное имя для тестового листа"""
    return f"benchmark_sync_{int(time.time())}"


@pytest.fixture
async def gspread_client():
    """Создает клиент gspread для управления тестовыми листами"""
    config = get_config()
    
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    
    credentials = Credentials.from_service_account_file(
        config.google_sheets.credentials_path,
        scopes=scopes
    )
    
    client = gspread.authorize(credentials)
    return client


@pytest.fixture
async def test_spreadsheet(gspread_client):
    """Открывает тестовую таблицу"""
    config = get_config()
    return gspread_client.open_by_key(config.google_sheets.spreadsheet_id)


def create_large_test_worksheet(
    spreadsheet: gspread.Spreadsheet,
    worksheet_name: str,
    num_records: int = 1000
) -> gspread.Worksheet:
    """
    Создает тестовый лист с большим количеством записей
    
    Args:
        spreadsheet: Объект таблицы
        worksheet_name: Имя листа
        num_records: Количество записей для создания
    
    Returns:
        Созданный worksheet
    """
    print(f"\n[SETUP] Создание тестового листа с {num_records} записями...")
    start_time = time.time()
    
    # Создаем новый лист
    worksheet = spreadsheet.add_worksheet(
        title=worksheet_name,
        rows=num_records + 10,
        cols=13  # A-M столбцы
    )
    
    # Подготавливаем данные
    test_data = [
        # Заголовки
        ['telegram_id', 'prize_type', 'promo_code', 'instructions', 'last_name', 'first_name', 'patronymic', 'city', 'street', 'house', 'apartment', 'phone', 'comment']
    ]
    
    # Генерируем записи
    for i in range(num_records):
        if i % 2 == 0:
            # Цифровой приз
            row = [
                str(5000000 + i),  # telegram_id
                'digital',
                f'BENCH{i}',
                f'Benchmark test prize {i}',
                '', '', '', '', '', '', '', '', ''
            ]
        else:
            # Физический приз
            row = [
                str(5000000 + i),  # telegram_id
                'physical',
                '',
                '',
                f'Фамилия{i}',
                f'Имя{i}',
                f'Отчество{i}',
                'Москва',
                'Тестовая улица',
                str(i % 100),
                str(i % 50),
                f'+7999{i:07d}',
                'Тестовый комментарий'
            ]
        test_data.append(row)
    
    # Заполняем данные (batch update для эффективности)
    worksheet.update(values=test_data, range_name=f'A1:M{len(test_data)}')
    
    elapsed = time.time() - start_time
    print(f"[SETUP] Лист создан за {elapsed:.2f} секунд")
    
    return worksheet


def delete_test_worksheet(
    spreadsheet: gspread.Spreadsheet,
    worksheet_name: str
):
    """
    Удаляет тестовый лист
    
    Args:
        spreadsheet: Объект таблицы
        worksheet_name: Имя листа для удаления
    """
    try:
        worksheet = spreadsheet.worksheet(worksheet_name)
        spreadsheet.del_worksheet(worksheet)
    except gspread.exceptions.WorksheetNotFound:
        pass  # Лист уже удален


@pytest.mark.asyncio
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию, так как требует БД и долго выполняется
    reason="Требует запущенной PostgreSQL БД и Google Sheets. Долгий тест."
)
async def test_sync_performance_1000_records(
    test_worksheet_name,
    gspread_client,
    test_spreadsheet
):
    """
    Feature: telegram-bot-postgres-sync
    Benchmark Test: Производительность синхронизации 1000 записей
    
    Validates: Requirements 9.1
    
    Проверяет, что синхронизация листа с 1000 записями
    выполняется за время < 30 секунд
    """
    config = get_config()
    prize_repository = PrizeRepository()
    
    worksheet = None
    
    try:
        # Создаем тестовый лист с 1000 записями
        print(f"\n[TEST] Benchmark: синхронизация 1000 записей")
        loop = asyncio.get_event_loop()
        worksheet = await loop.run_in_executor(
            None,
            create_large_test_worksheet,
            test_spreadsheet,
            test_worksheet_name,
            1000
        )
        
        # Даем Google Sheets время на обработку
        await asyncio.sleep(3)
        
        # Создаем SyncService
        sync_service = SyncService(
            google_sheets_config=config.google_sheets,
            sync_config=config.sync,
            prize_repository=prize_repository
        )
        
        # Измеряем время синхронизации
        print(f"[TEST] Запуск синхронизации...")
        start_time = time.time()
        
        stats = await sync_service.sync_sheet(test_worksheet_name)
        
        elapsed_time = time.time() - start_time
        
        # Выводим результаты
        print(f"\n[RESULTS] Benchmark синхронизации:")
        print(f"  Записей обработано: {stats['total_records']}")
        print(f"  Время выполнения: {elapsed_time:.2f}s")
        print(f"  Записей в секунду: {stats['total_records'] / elapsed_time:.2f}")
        print(f"  Среднее время на запись: {(elapsed_time / stats['total_records']) * 1000:.2f}ms")
        
        # Проверяем требования
        assert stats['total_records'] == 1000, f"Ожидалось 1000 записей, получено {stats['total_records']}"
        assert elapsed_time < 30, f"Синхронизация заняла {elapsed_time:.2f}s, ожидалось < 30s"
        
        # Проверяем, что данные действительно синхронизированы
        print(f"\n[TEST] Проверка синхронизированных данных...")
        
        # Проверяем несколько случайных записей
        test_ids = [5000000, 5000100, 5000500, 5000999]
        for telegram_id in test_ids:
            prize = await prize_repository.find_prize(telegram_id, test_worksheet_name)
            assert prize is not None, f"Запись {telegram_id} не найдена в БД"
            assert prize.sheet_name == test_worksheet_name
            assert prize.code_word == test_worksheet_name
        
        print(f"[TEST] ✓ Benchmark тест пройден")
        print(f"[TEST] ✓ Производительность: {stats['total_records'] / elapsed_time:.2f} записей/сек")
        
    finally:
        # Удаляем тестовый лист
        if worksheet:
            print(f"\n[CLEANUP] Удаление тестового листа")
            await loop.run_in_executor(
                None,
                delete_test_worksheet,
                test_spreadsheet,
                test_worksheet_name
            )


@pytest.mark.asyncio
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию
    reason="Требует запущенной PostgreSQL БД и Google Sheets. Очень долгий тест."
)
async def test_sync_performance_scaling(
    test_worksheet_name,
    gspread_client,
    test_spreadsheet
):
    """
    Feature: telegram-bot-postgres-sync
    Benchmark Test: Масштабируемость синхронизации
    
    Проверяет, как производительность синхронизации масштабируется
    с увеличением количества записей (100, 500, 1000)
    """
    config = get_config()
    prize_repository = PrizeRepository()
    
    record_counts = [100, 500, 1000]
    results = []
    
    for num_records in record_counts:
        worksheet_name = f"{test_worksheet_name}_{num_records}"
        worksheet = None
        
        try:
            print(f"\n[TEST] Benchmark: синхронизация {num_records} записей")
            
            # Создаем тестовый лист
            loop = asyncio.get_event_loop()
            worksheet = await loop.run_in_executor(
                None,
                create_large_test_worksheet,
                test_spreadsheet,
                worksheet_name,
                num_records
            )
            
            await asyncio.sleep(2)
            
            # Создаем SyncService
            sync_service = SyncService(
                google_sheets_config=config.google_sheets,
                sync_config=config.sync,
                prize_repository=prize_repository
            )
            
            # Измеряем время синхронизации
            start_time = time.time()
            stats = await sync_service.sync_sheet(worksheet_name)
            elapsed_time = time.time() - start_time
            
            records_per_second = stats['total_records'] / elapsed_time
            
            results.append({
                'records': num_records,
                'time': elapsed_time,
                'records_per_second': records_per_second
            })
            
            print(f"[RESULTS] {num_records} записей:")
            print(f"  Время: {elapsed_time:.2f}s")
            print(f"  Производительность: {records_per_second:.2f} записей/сек")
            
        finally:
            # Удаляем тестовый лист
            if worksheet:
                await loop.run_in_executor(
                    None,
                    delete_test_worksheet,
                    test_spreadsheet,
                    worksheet_name
                )
    
    # Анализируем масштабируемость
    print(f"\n[ANALYSIS] Анализ масштабируемости:")
    for result in results:
        print(f"  {result['records']} записей: {result['records_per_second']:.2f} записей/сек")
    
    # Проверяем, что производительность не деградирует сильно
    # (допускаем снижение до 50% при увеличении объема в 10 раз)
    perf_100 = results[0]['records_per_second']
    perf_1000 = results[2]['records_per_second']
    
    degradation = (perf_100 - perf_1000) / perf_100
    
    print(f"\n[ANALYSIS] Деградация производительности: {degradation * 100:.1f}%")
    
    assert degradation < 0.5, f"Производительность деградировала на {degradation * 100:.1f}%, ожидалось < 50%"
    
    print(f"[TEST] ✓ Тест масштабируемости пройден")


@pytest.mark.asyncio
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию
    reason="Требует запущенной PostgreSQL БД"
)
async def test_batch_upsert_benchmark():
    """
    Feature: telegram-bot-postgres-sync
    Benchmark Test: Производительность batch upsert
    
    Измеряет производительность batch upsert для разных размеров батчей
    """
    prize_repository = PrizeRepository()
    
    batch_sizes = [10, 50, 100, 500, 1000]
    results = []
    
    for batch_size in batch_sizes:
        print(f"\n[TEST] Benchmark batch upsert: {batch_size} записей")
        
        # Создаем тестовые данные
        test_prizes = []
        for i in range(batch_size):
            prize_data = {
                'telegram_id': 6000000 + i,
                'code_word': f'batch_bench_{batch_size}_{i}',
                'prize_type': 'digital',
                'promo_code': f'BATCH{i}',
                'instructions': f'Batch benchmark {i}',
                'sheet_name': f'batch_bench_{batch_size}',
                'row_id': i + 2
            }
            test_prizes.append(prize_data)
        
        # Измеряем время
        start_time = time.time()
        processed_count = await prize_repository.batch_upsert_prizes(test_prizes)
        elapsed_time = time.time() - start_time
        
        records_per_second = processed_count / elapsed_time
        
        results.append({
            'batch_size': batch_size,
            'time': elapsed_time,
            'records_per_second': records_per_second
        })
        
        print(f"[RESULTS] Batch {batch_size}:")
        print(f"  Время: {elapsed_time:.3f}s")
        print(f"  Производительность: {records_per_second:.2f} записей/сек")
    
    # Выводим сводную таблицу
    print(f"\n[SUMMARY] Производительность batch upsert:")
    print(f"{'Размер батча':<15} {'Время (s)':<12} {'Записей/сек':<15}")
    print("-" * 42)
    for result in results:
        print(f"{result['batch_size']:<15} {result['time']:<12.3f} {result['records_per_second']:<15.2f}")
    
    print(f"\n[TEST] ✓ Benchmark batch upsert завершен")
