"""
Property-based тесты производительности

Проверяет производительность критических операций системы
"""
import pytest
import time
import statistics
from typing import List
from hypothesis import given, settings, strategies as st

from database.repositories.prize_repository import PrizeRepository


@pytest.fixture(autouse=True)
async def init_db():
    """Инициализирует подключение к базе данных для тестов"""
    from database.connection import init_database, get_database
    from config import get_config
    
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
async def prize_repository():
    """Создает экземпляр PrizeRepository"""
    return PrizeRepository()


@pytest.fixture
async def populate_test_data(prize_repository):
    """
    Заполняет БД тестовыми данными для performance тестов
    
    Создает 10000 записей для тестирования производительности поиска
    """
    print("\n[SETUP] Создание 10000 тестовых записей...")
    start_time = time.time()
    
    # Генерируем 10000 тестовых призов
    test_prizes = []
    for i in range(10000):
        prize_data = {
            'telegram_id': 1000000 + i,
            'code_word': f'perf_test_{i % 100}',  # 100 разных code_word
            'prize_type': 'digital' if i % 2 == 0 else 'physical',
            'promo_code': f'PROMO{i}' if i % 2 == 0 else None,
            'instructions': f'Test instructions {i}' if i % 2 == 0 else None,
            'sheet_name': f'perf_test_{i % 100}',
            'row_id': i + 2
        }
        test_prizes.append(prize_data)
    
    # Batch upsert всех записей
    await prize_repository.batch_upsert_prizes(test_prizes)
    
    elapsed = time.time() - start_time
    print(f"[SETUP] Создано 10000 записей за {elapsed:.2f} секунд")
    
    yield
    
    # Cleanup - удаляем тестовые данные
    # (в реальном проекте можно использовать транзакции с rollback)


@pytest.mark.asyncio
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию, так как требует БД
    reason="Требует запущенной PostgreSQL БД"
)
async def test_search_performance_property(prize_repository, populate_test_data):
    """
    Feature: telegram-bot-postgres-sync
    Property 7: Производительность поиска
    
    Validates: Requirements 3.8, 9.2
    
    Проверяет, что:
    - Максимальное время поиска < 500ms
    - 95 перцентиль < 100ms
    
    Выполняет 100 случайных поисков по 10000 записям
    """
    print("\n[TEST] Запуск теста производительности поиска")
    
    # Выполняем 100 случайных поисков
    search_times = []
    
    for i in range(100):
        # Случайный telegram_id и code_word из существующих
        telegram_id = 1000000 + (i * 97) % 10000  # Псевдослучайное распределение
        code_word = f'perf_test_{(i * 37) % 100}'
        
        # Измеряем время поиска
        start_time = time.time()
        prize = await prize_repository.find_prize(telegram_id, code_word)
        elapsed_ms = (time.time() - start_time) * 1000
        
        search_times.append(elapsed_ms)
        
        if (i + 1) % 20 == 0:
            print(f"[TEST] Выполнено {i + 1}/100 поисков, текущее среднее: {statistics.mean(search_times):.2f}ms")
    
    # Вычисляем статистику
    max_time = max(search_times)
    mean_time = statistics.mean(search_times)
    median_time = statistics.median(search_times)
    p95_time = statistics.quantiles(search_times, n=20)[18]  # 95 перцентиль
    
    print(f"\n[RESULTS] Статистика производительности поиска:")
    print(f"  Максимальное время: {max_time:.2f}ms")
    print(f"  Среднее время: {mean_time:.2f}ms")
    print(f"  Медиана: {median_time:.2f}ms")
    print(f"  95 перцентиль: {p95_time:.2f}ms")
    
    # Проверяем требования
    assert max_time < 500, f"Максимальное время поиска {max_time:.2f}ms превышает лимит 500ms"
    assert p95_time < 100, f"95 перцентиль {p95_time:.2f}ms превышает лимит 100ms"
    
    print(f"[TEST] ✓ Тест производительности пройден")


@pytest.mark.asyncio
@settings(max_examples=50, deadline=None)
@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
)
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию
    reason="Требует запущенной PostgreSQL БД"
)
async def test_search_timeout_property(prize_repository, telegram_id, code_word):
    """
    Feature: telegram-bot-postgres-sync
    Property: Поиск всегда завершается в пределах таймаута
    
    Validates: Requirements 3.8
    
    Для любых telegram_id и code_word, поиск должен завершаться
    в пределах 500ms таймаута (или выбрасывать TimeoutError)
    """
    start_time = time.time()
    
    try:
        prize = await prize_repository.find_prize(telegram_id, code_word, timeout_ms=500)
        elapsed_ms = (time.time() - start_time) * 1000
        
        # Если поиск завершился успешно, он должен быть быстрым
        assert elapsed_ms < 600, f"Поиск занял {elapsed_ms:.2f}ms, что больше таймаута + буфера"
        
    except TimeoutError:
        # TimeoutError допустим - это означает, что таймаут сработал корректно
        elapsed_ms = (time.time() - start_time) * 1000
        assert elapsed_ms >= 500, f"TimeoutError выброшен слишком рано: {elapsed_ms:.2f}ms"
        assert elapsed_ms < 600, f"TimeoutError выброшен слишком поздно: {elapsed_ms:.2f}ms"


@pytest.mark.asyncio
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию
    reason="Требует запущенной PostgreSQL БД"
)
async def test_batch_upsert_performance(prize_repository):
    """
    Feature: telegram-bot-postgres-sync
    Performance Test: Производительность batch upsert
    
    Validates: Requirements 9.4
    
    Проверяет, что batch upsert эффективно обрабатывает большие объемы данных
    """
    print("\n[TEST] Тест производительности batch upsert")
    
    # Создаем 1000 тестовых записей
    test_prizes = []
    for i in range(1000):
        prize_data = {
            'telegram_id': 2000000 + i,
            'code_word': f'batch_test_{i}',
            'prize_type': 'digital',
            'promo_code': f'BATCH{i}',
            'instructions': f'Batch test {i}',
            'sheet_name': f'batch_test_{i}',
            'row_id': i + 2
        }
        test_prizes.append(prize_data)
    
    # Измеряем время batch upsert
    start_time = time.time()
    processed_count = await prize_repository.batch_upsert_prizes(test_prizes)
    elapsed_time = time.time() - start_time
    
    print(f"[RESULTS] Batch upsert:")
    print(f"  Обработано записей: {processed_count}")
    print(f"  Время выполнения: {elapsed_time:.2f}s")
    print(f"  Записей в секунду: {processed_count / elapsed_time:.2f}")
    
    # Проверяем, что все записи обработаны
    assert processed_count == 1000, f"Ожидалось 1000 записей, обработано {processed_count}"
    
    # Проверяем производительность (должно быть быстро)
    assert elapsed_time < 10, f"Batch upsert 1000 записей занял {elapsed_time:.2f}s, ожидалось < 10s"
    
    print(f"[TEST] ✓ Тест производительности batch upsert пройден")


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None)
@given(
    batch_size=st.integers(min_value=1, max_value=100)
)
@pytest.mark.skipif(
    True,  # Пропускаем по умолчанию
    reason="Требует запущенной PostgreSQL БД"
)
async def test_batch_upsert_scales_linearly(prize_repository, batch_size):
    """
    Feature: telegram-bot-postgres-sync
    Property: Batch upsert масштабируется линейно
    
    Validates: Requirements 9.4
    
    Для любого размера батча, производительность должна масштабироваться
    примерно линейно (время на запись не должно сильно расти)
    """
    # Создаем тестовые данные
    test_prizes = []
    for i in range(batch_size):
        prize_data = {
            'telegram_id': 3000000 + i,
            'code_word': f'scale_test_{i}',
            'prize_type': 'digital',
            'promo_code': f'SCALE{i}',
            'instructions': f'Scale test {i}',
            'sheet_name': f'scale_test_{i}',
            'row_id': i + 2
        }
        test_prizes.append(prize_data)
    
    # Измеряем время
    start_time = time.time()
    processed_count = await prize_repository.batch_upsert_prizes(test_prizes)
    elapsed_time = time.time() - start_time
    
    # Вычисляем время на одну запись
    time_per_record = elapsed_time / batch_size if batch_size > 0 else 0
    
    # Проверяем, что время на запись разумное (< 100ms на запись)
    assert time_per_record < 0.1, f"Время на запись {time_per_record*1000:.2f}ms слишком велико"
    
    # Проверяем, что все записи обработаны
    assert processed_count == batch_size
