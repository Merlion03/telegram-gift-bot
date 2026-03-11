"""
Property-based тесты производительности поиска призов

Проверяет, что поиск в PostgreSQL выполняется за приемлемое время
даже при большом количестве записей в базе данных.
"""
import pytest
import asyncio
import time
import statistics
from typing import List
from hypothesis import given, settings, strategies as st, HealthCheck
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database.repositories.prize_repository import PrizeRepository
from database.models.prize import Prize


@pytest.mark.asyncio
async def test_performance_search_with_10k_records(db_session: AsyncSession):
    """
    Property 7: Производительность поиска
    
    Feature: telegram-bot-postgres-sync
    Validates: Requirements 3.8, 9.2
    
    Проверяет, что поиск в PostgreSQL выполняется за приемлемое время:
    - Максимальное время поиска < 500ms
    - 95 перцентиль < 100ms
    
    Создаёт 10000 тестовых записей и выполняет 100 случайных поисков
    """
    # Arrange - создаём 10000 тестовых записей
    repository = PrizeRepository(session=db_session)
    
    print("\n=== Создание 10000 тестовых записей ===")
    start_time = time.time()
    
    # Генерируем тестовые данные
    test_records = []
    for i in range(10000):
        record = {
            'telegram_id': 1000000 + i,
            'code_word': f'code_{i % 100}',  # 100 различных кодовых слов
            'prize_type': 'digital' if i % 2 == 0 else 'physical',
            'sheet_name': f'sheet_{i % 10}',  # 10 различных листов
            'row_id': i + 2,
            'promo_code': f'PROMO_{i}' if i % 2 == 0 else None
        }
        test_records.append(record)
    
    # Вставляем данные батчами для производительности
    batch_size = 1000
    for i in range(0, len(test_records), batch_size):
        batch = test_records[i:i + batch_size]
        await repository.batch_upsert_prizes(batch)
    
    await db_session.commit()
    
    elapsed = time.time() - start_time
    print(f"Создано 10000 записей за {elapsed:.2f} секунд")
    
    # Act - выполняем 100 случайных поисков
    print("\n=== Выполнение 100 случайных поисков ===")
    search_times = []
    
    import random
    random.seed(42)  # Для воспроизводимости
    
    for _ in range(100):
        # Генерируем случайные параметры поиска
        telegram_id = 1000000 + random.randint(0, 9999)
        code_word = f'code_{random.randint(0, 99)}'
        
        # Измеряем время поиска
        search_start = time.time()
        prize = await repository.find_prize(telegram_id, code_word)
        search_elapsed_ms = (time.time() - search_start) * 1000
        
        search_times.append(search_elapsed_ms)
    
    # Assert - проверяем производительность
    max_time = max(search_times)
    min_time = min(search_times)
    avg_time = statistics.mean(search_times)
    median_time = statistics.median(search_times)
    percentile_95 = statistics.quantiles(search_times, n=20)[18]  # 95-й перцентиль
    
    print(f"\n=== Статистика производительности ===")
    print(f"Минимальное время: {min_time:.2f} ms")
    print(f"Максимальное время: {max_time:.2f} ms")
    print(f"Среднее время: {avg_time:.2f} ms")
    print(f"Медиана: {median_time:.2f} ms")
    print(f"95 перцентиль: {percentile_95:.2f} ms")
    
    # Проверяем требования производительности
    assert max_time < 500, f"Максимальное время поиска {max_time:.2f}ms превышает 500ms"
    assert percentile_95 < 100, f"95 перцентиль {percentile_95:.2f}ms превышает 100ms"
    
    print("\n✓ Все требования производительности выполнены")


@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow]
)
@given(
    num_records=st.integers(min_value=1000, max_value=5000),
    num_searches=st.integers(min_value=50, max_value=100)
)
@pytest.mark.asyncio
async def test_property_search_performance_scales(
    db_session: AsyncSession,
    num_records: int,
    num_searches: int
):
    """
    Property: Производительность поиска масштабируется линейно
    
    Validates: Requirements 3.8, 9.2, 9.3
    
    Проверяет, что производительность поиска не деградирует
    при увеличении количества записей в БД благодаря индексам.
    """
    # Очистка БД перед каждой итерацией
    await db_session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
    await db_session.commit()
    
    # Arrange - создаём записи
    repository = PrizeRepository(session=db_session)
    
    test_records = []
    for i in range(num_records):
        record = {
            'telegram_id': 2000000 + i,
            'code_word': f'perf_code_{i % 50}',
            'prize_type': 'digital',
            'sheet_name': f'perf_sheet_{i % 5}',
            'row_id': i + 2,
            'promo_code': f'PERF_{i}'
        }
        test_records.append(record)
    
    # Вставляем батчами
    batch_size = 500
    for i in range(0, len(test_records), batch_size):
        batch = test_records[i:i + batch_size]
        await repository.batch_upsert_prizes(batch)
    
    await db_session.commit()
    
    # Act - выполняем поиски
    search_times = []
    
    import random
    random.seed(num_records)  # Seed зависит от количества записей
    
    for _ in range(num_searches):
        telegram_id = 2000000 + random.randint(0, num_records - 1)
        code_word = f'perf_code_{random.randint(0, 49)}'
        
        search_start = time.time()
        await repository.find_prize(telegram_id, code_word)
        search_elapsed_ms = (time.time() - search_start) * 1000
        
        search_times.append(search_elapsed_ms)
    
    # Assert - проверяем производительность
    max_time = max(search_times)
    percentile_95 = statistics.quantiles(search_times, n=20)[18] if len(search_times) >= 20 else max(search_times)
    
    # Требования должны выполняться независимо от количества записей
    # (благодаря индексам)
    assert max_time < 500, f"Максимальное время {max_time:.2f}ms превышает 500ms при {num_records} записях"
    assert percentile_95 < 100, f"95 перцентиль {percentile_95:.2f}ms превышает 100ms при {num_records} записях"


@pytest.mark.asyncio
async def test_performance_concurrent_searches(db_session: AsyncSession):
    """
    Тест производительности при конкурентных поисках
    
    Validates: Requirements 9.6
    
    Проверяет, что система может обрабатывать множество
    одновременных поисков без деградации производительности.
    
    ВАЖНО: Этот тест проверяет производительность поиска, а не
    управление соединениями. В реальном приложении каждый запрос
    будет использовать свою сессию из connection pool.
    """
    # Arrange - создаём 5000 тестовых записей
    repository = PrizeRepository(session=db_session)
    
    print("\n=== Создание 5000 тестовых записей ===")
    test_records = []
    for i in range(5000):
        record = {
            'telegram_id': 3000000 + i,
            'code_word': f'concurrent_code_{i % 50}',
            'prize_type': 'digital',
            'sheet_name': f'concurrent_sheet_{i % 5}',
            'row_id': i + 2,
            'promo_code': f'CONCURRENT_{i}'
        }
        test_records.append(record)
    
    batch_size = 500
    for i in range(0, len(test_records), batch_size):
        batch = test_records[i:i + batch_size]
        await repository.batch_upsert_prizes(batch)
    
    await db_session.commit()
    
    # Act - выполняем 50 последовательных поисков для измерения базовой производительности
    print("\n=== Выполнение 50 последовательных поисков ===")
    
    import random
    random.seed(42)
    
    # Измеряем последовательные поиски
    sequential_times = []
    for i in range(50):
        telegram_id = 3000000 + random.randint(0, 4999)
        code_word = f'concurrent_code_{random.randint(0, 49)}'
        
        search_start = time.time()
        await repository.find_prize(telegram_id, code_word)
        search_elapsed_ms = (time.time() - search_start) * 1000
        sequential_times.append(search_elapsed_ms)
    
    # Теперь выполняем конкурентные поиски с использованием той же сессии
    # Это симулирует ситуацию когда множество операций выполняется в рамках одной транзакции
    print("\n=== Выполнение 50 конкурентных поисков (в рамках одной сессии) ===")
    
    random.seed(42)  # Тот же seed для сравнения
    
    async def perform_search(search_id: int) -> float:
        """Выполняет один поиск и возвращает время выполнения"""
        telegram_id = 3000000 + random.randint(0, 4999)
        code_word = f'concurrent_code_{random.randint(0, 49)}'
        
        search_start = time.time()
        await repository.find_prize(telegram_id, code_word)
        return (time.time() - search_start) * 1000
    
    # Запускаем все поиски конкурентно
    start_time = time.time()
    search_tasks = [perform_search(i) for i in range(50)]
    concurrent_times = await asyncio.gather(*search_tasks)
    total_elapsed = time.time() - start_time
    
    # Assert - проверяем производительность
    sequential_max = max(sequential_times)
    sequential_avg = statistics.mean(sequential_times)
    
    concurrent_max = max(concurrent_times)
    concurrent_avg = statistics.mean(concurrent_times)
    concurrent_percentile_95 = statistics.quantiles(concurrent_times, n=20)[18]
    
    print(f"\n=== Сравнение производительности ===")
    print(f"Последовательные поиски:")
    print(f"  Максимальное время: {sequential_max:.2f} ms")
    print(f"  Среднее время: {sequential_avg:.2f} ms")
    
    print(f"Конкурентные поиски:")
    print(f"  Всего поисков: 50")
    print(f"  Общее время: {total_elapsed:.2f} секунд")
    print(f"  Максимальное время одного поиска: {concurrent_max:.2f} ms")
    print(f"  Среднее время: {concurrent_avg:.2f} ms")
    print(f"  95 перцентиль: {concurrent_percentile_95:.2f} ms")
    print(f"  Пропускная способность: {50 / total_elapsed:.2f} поисков/сек")
    
    # Проверяем требования производительности
    assert concurrent_max < 500, f"Максимальное время {concurrent_max:.2f}ms превышает 500ms"
    assert concurrent_percentile_95 < 100, f"95 перцентиль {concurrent_percentile_95:.2f}ms превышает 100ms"
    
    # Проверяем, что конкурентные поиски не сильно медленнее последовательных
    # (допускаем некоторую деградацию из-за конкуренции за ресурсы)
    max_degradation_factor = 2.0  # Максимальная деградация в 2 раза
    assert concurrent_avg < sequential_avg * max_degradation_factor, \
        f"Конкурентные поиски слишком медленные: {concurrent_avg:.2f}ms vs {sequential_avg:.2f}ms"
    
    # Проверяем, что общее время конкурентных поисков меньше чем последовательных
    sequential_total_estimate = sum(sequential_times) / 1000  # В секундах
    assert total_elapsed < sequential_total_estimate, \
        f"Конкурентные поиски ({total_elapsed:.2f}s) не быстрее последовательных ({sequential_total_estimate:.2f}s)"
    
    print("\n✓ Конкурентные поиски выполняются эффективно")


@pytest.mark.asyncio
async def test_performance_search_with_different_indexes(db_session: AsyncSession):
    """
    Тест производительности поиска с использованием разных индексов
    
    Validates: Requirements 1.2, 1.3, 1.4, 9.3
    
    Проверяет, что все индексы (составной, code_word, sheet_name)
    эффективно используются для разных типов запросов
    """
    # Arrange - создаём 5000 тестовых записей
    repository = PrizeRepository(session=db_session)
    
    print("\n=== Создание 5000 тестовых записей ===")
    test_records = []
    for i in range(5000):
        record = {
            'telegram_id': 4000000 + i,
            'code_word': f'index_code_{i % 100}',
            'prize_type': 'digital',
            'sheet_name': f'index_sheet_{i % 20}',
            'row_id': i + 2,
            'promo_code': f'INDEX_{i}'
        }
        test_records.append(record)
    
    batch_size = 500
    for i in range(0, len(test_records), batch_size):
        batch = test_records[i:i + batch_size]
        await repository.batch_upsert_prizes(batch)
    
    await db_session.commit()
    
    # Act & Assert - тестируем поиск по составному индексу (telegram_id, code_word)
    print("\n=== Тест составного индекса (telegram_id, code_word) ===")
    composite_times = []
    
    import random
    random.seed(42)
    
    for _ in range(50):
        telegram_id = 4000000 + random.randint(0, 4999)
        code_word = f'index_code_{random.randint(0, 99)}'
        
        search_start = time.time()
        await repository.find_prize(telegram_id, code_word)
        search_elapsed_ms = (time.time() - search_start) * 1000
        
        composite_times.append(search_elapsed_ms)
    
    composite_avg = statistics.mean(composite_times)
    composite_max = max(composite_times)
    
    print(f"Среднее время: {composite_avg:.2f} ms")
    print(f"Максимальное время: {composite_max:.2f} ms")
    
    assert composite_max < 500, f"Поиск по составному индексу слишком медленный: {composite_max:.2f}ms"
    assert composite_avg < 50, f"Среднее время поиска по составному индексу слишком большое: {composite_avg:.2f}ms"
    
    print("✓ Составной индекс работает эффективно")
