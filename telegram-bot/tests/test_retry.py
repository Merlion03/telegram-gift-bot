"""
Тесты для retry логики с экспоненциальной задержкой.

Property 31: Retry логика для Google Sheets API
Feature: telegram-bot-webapp-system, Property 31
Validates: Requirements 16.1
"""

import pytest
import asyncio
from hypothesis import given, strategies as st, settings
from unittest.mock import AsyncMock, MagicMock
from typing import List

from utils.retry import retry_with_backoff


class RetryTestException(Exception):
    """Исключение для тестирования retry логики"""
    pass


@given(
    max_retries=st.integers(min_value=1, max_value=5),
    success_on_attempt=st.integers(min_value=1, max_value=5)
)
@settings(max_examples=50)  # Уменьшаем количество примеров для скорости
@pytest.mark.asyncio
async def test_property_31_retry_succeeds_within_max_attempts(max_retries, success_on_attempt):
    """
    Property 31: Retry логика для Google Sheets API
    
    Для любой функции, которая падает N раз и затем успешно выполняется,
    если N < max_retries, retry_with_backoff должен вернуть успешный результат.
    
    Feature: telegram-bot-webapp-system, Property 31
    Validates: Requirements 16.1
    """
    # Arrange: создаём функцию, которая падает несколько раз, затем успешно выполняется
    call_count = 0
    expected_result = "success"
    
    async def flaky_function():
        nonlocal call_count
        call_count += 1
        
        if call_count < success_on_attempt:
            raise RetryTestException(f"Attempt {call_count} failed")
        
        return expected_result
    
    # Act & Assert
    if success_on_attempt <= max_retries:
        # Функция должна успешно выполниться
        result = await retry_with_backoff(
            flaky_function,
            max_retries=max_retries,
            base_delay=0.01  # Минимальная задержка для скорости тестов
        )
        
        assert result == expected_result, \
            f"Должен вернуться успешный результат после {success_on_attempt} попыток"
        assert call_count == success_on_attempt, \
            f"Функция должна быть вызвана ровно {success_on_attempt} раз"
    else:
        # Функция должна выбросить исключение после исчерпания попыток
        with pytest.raises(RetryTestException):
            await retry_with_backoff(
                flaky_function,
                max_retries=max_retries,
                base_delay=0.01
            )
        
        assert call_count == max_retries, \
            f"Функция должна быть вызвана ровно {max_retries} раз"


@given(
    max_retries=st.integers(min_value=2, max_value=4),  # Уменьшаем диапазон
    base_delay=st.floats(min_value=0.01, max_value=0.05)  # Уменьшаем максимальную задержку
)
@settings(max_examples=20, deadline=None)  # Отключаем deadline
@pytest.mark.asyncio
async def test_property_31_exponential_backoff_delays(max_retries, base_delay):
    """
    Property 31: Экспоненциальная задержка между попытками
    
    Для любых параметров max_retries и base_delay, задержки между попытками
    должны расти экспоненциально.
    
    Feature: telegram-bot-webapp-system, Property 31
    Validates: Requirements 16.1
    """
    # Arrange: создаём функцию, которая всегда падает и записывает время вызовов
    call_times: List[float] = []
    
    async def always_failing_function():
        call_times.append(asyncio.get_event_loop().time())
        raise RetryTestException("Always fails")
    
    # Act
    with pytest.raises(RetryTestException):
        await retry_with_backoff(
            always_failing_function,
            max_retries=max_retries,
            base_delay=base_delay
        )
    
    # Assert: проверяем, что задержки растут
    assert len(call_times) == max_retries, \
        f"Должно быть ровно {max_retries} вызовов"
    
    # Проверяем теоретические задержки (без учёта накладных расходов)
    # Задержки должны быть: base_delay, base_delay*2, base_delay*4, ...
    expected_delays = [base_delay * (2 ** i) for i in range(max_retries - 1)]
    
    # Проверяем, что каждая следующая теоретическая задержка больше предыдущей в 2 раза
    for i in range(1, len(expected_delays)):
        assert expected_delays[i] > expected_delays[i-1] * 1.9, \
            f"Теоретическая задержка должна расти экспоненциально: {expected_delays[i]} должна быть > {expected_delays[i-1] * 1.9}"
    
    # Проверяем, что фактические задержки близки к ожидаемым (с допуском на накладные расходы)
    for i in range(1, len(call_times)):
        actual_delay = call_times[i] - call_times[i-1]
        expected_delay = expected_delays[i-1]
        
        # Фактическая задержка должна быть не меньше 80% от ожидаемой
        # (допускаем накладные расходы на выполнение кода)
        assert actual_delay >= expected_delay * 0.8, \
            f"Фактическая задержка {actual_delay} должна быть >= {expected_delay * 0.8}"


@pytest.mark.asyncio
async def test_retry_with_api_error_simulation():
    """
    Unit-тест: симуляция ошибки Google Sheets API с успешным retry
    
    Validates: Requirements 16.1
    """
    # Arrange: симулируем временную ошибку API
    call_count = 0
    
    async def api_call_with_temporary_error():
        nonlocal call_count
        call_count += 1
        
        if call_count < 3:
            # Первые 2 попытки - ошибка API
            raise Exception("API Error: Service temporarily unavailable")
        
        # Третья попытка - успех
        return {"status": "success", "data": "prize_info"}
    
    # Act
    result = await retry_with_backoff(
        api_call_with_temporary_error,
        max_retries=3,
        base_delay=0.01
    )
    
    # Assert
    assert result["status"] == "success"
    assert call_count == 3, "Должно быть 3 попытки (2 неудачных + 1 успешная)"


@pytest.mark.asyncio
async def test_retry_exhausted_raises_last_exception():
    """
    Unit-тест: после исчерпания попыток выбрасывается последнее исключение
    
    Validates: Requirements 16.1, 16.2
    """
    # Arrange
    call_count = 0
    
    async def always_failing_function():
        nonlocal call_count
        call_count += 1
        raise RetryTestException(f"Attempt {call_count} failed")
    
    # Act & Assert
    with pytest.raises(RetryTestException) as exc_info:
        await retry_with_backoff(
            always_failing_function,
            max_retries=3,
            base_delay=0.01
        )
    
    # Проверяем, что выброшено последнее исключение
    assert "Attempt 3 failed" in str(exc_info.value)
    assert call_count == 3


@pytest.mark.asyncio
async def test_retry_with_function_arguments():
    """
    Unit-тест: retry работает с аргументами функции
    
    Validates: Requirements 16.1
    """
    # Arrange
    call_count = 0
    
    async def function_with_args(x: int, y: str, z: bool = False):
        nonlocal call_count
        call_count += 1
        
        if call_count < 2:
            raise RetryTestException("First attempt fails")
        
        return f"{x}-{y}-{z}"
    
    # Act
    result = await retry_with_backoff(
        function_with_args,
        max_retries=3,
        base_delay=0.01,
        x=42,
        y="test",
        z=True
    )
    
    # Assert
    assert result == "42-test-True"
    assert call_count == 2


@pytest.mark.asyncio
async def test_first_attempt_success_no_retry():
    """
    Unit-тест: если первая попытка успешна, retry не выполняется
    
    Validates: Requirements 16.1
    """
    # Arrange
    call_count = 0
    
    async def successful_function():
        nonlocal call_count
        call_count += 1
        return "success"
    
    # Act
    result = await retry_with_backoff(
        successful_function,
        max_retries=3,
        base_delay=0.01
    )
    
    # Assert
    assert result == "success"
    assert call_count == 1, "Функция должна быть вызвана только один раз"


@given(
    max_retries=st.integers(min_value=1, max_value=5)
)
@settings(max_examples=20)
@pytest.mark.asyncio
async def test_property_31_all_attempts_executed(max_retries):
    """
    Property 31: Все попытки выполняются при постоянных ошибках
    
    Для любого max_retries, если функция всегда падает,
    она должна быть вызвана ровно max_retries раз.
    
    Feature: telegram-bot-webapp-system, Property 31
    Validates: Requirements 16.1
    """
    # Arrange
    call_count = 0
    
    async def always_failing():
        nonlocal call_count
        call_count += 1
        raise RetryTestException("Always fails")
    
    # Act
    with pytest.raises(RetryTestException):
        await retry_with_backoff(
            always_failing,
            max_retries=max_retries,
            base_delay=0.01
        )
    
    # Assert
    assert call_count == max_retries, \
        f"Функция должна быть вызвана ровно {max_retries} раз"
