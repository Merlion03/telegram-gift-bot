"""
Property-Based тест: Rate limiting

Property 24: Rate limiting после 5 попыток
Validates: Requirements 12.4, 12.5
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from datetime import datetime, timedelta, timezone

from services.rate_limit_service import RateLimitService
from database.repositories.auth_attempts_repository import AuthAttemptsRepository


# Генераторы для Hypothesis
tg_id_strategy = st.integers(min_value=1, max_value=999999999)


@pytest.mark.asyncio
@given(tg_id=tg_id_strategy)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_rate_limit_after_5_attempts(
    tg_id: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 24: Rate limiting после 5 попыток
    
    Проверяет, что:
    - Первые 5 попыток разрешены
    - 6-я попытка блокируется
    - blocked_until устанавливается корректно
    - Блокировка действует в течение 15 минут
    
    Validates: Requirements 12.4, 12.5
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    auth_attempts_repo = AuthAttemptsRepository()
    rate_limiter = RateLimitService(auth_attempts_repo)
    
    try:
        # Очищаем предыдущие попытки
        await auth_attempts_repo.clear_attempts(tg_id)
        
        # Записываем 5 неудачных попыток
        for i in range(5):
            await rate_limiter.record_failed_attempt(tg_id)
            
            # Проверяем, что попытки 1-5 разрешены
            result = await rate_limiter.check_rate_limit(tg_id)
            
            if i < 4:  # Попытки 1-4
                assert result.allowed is True, \
                    f"Попытка {i+1} должна быть разрешена"
                assert result.attempts_count == i + 1, \
                    f"Счётчик попыток должен быть {i+1}"
                assert result.blocked_until is None, \
                    f"blocked_until должен быть None для попытки {i+1}"
            else:  # Попытка 5
                # После 5-й попытки уже блокируем
                assert result.allowed is False, \
                    "После 5-й попытки должна быть блокировка"
                assert result.attempts_count == 5, \
                    "Счётчик попыток должен быть 5"
                assert result.blocked_until is not None, \
                    "blocked_until должен быть установлен после 5-й попытки"
        
        # Проверяем блокировку 6-й попытки
        result = await rate_limiter.check_rate_limit(tg_id)
        assert result.allowed is False, "6-я попытка должна быть заблокирована"
        assert result.attempts_count >= 5, "Счётчик попыток должен быть >= 5"
        assert result.blocked_until is not None, "blocked_until должен быть установлен"
        
        # Проверяем, что blocked_until в будущем (в пределах 15 минут)
        # ИСПРАВЛЕНИЕ: Используем datetime.now(timezone.utc) вместо utcnow()
        now = datetime.now(timezone.utc)
        time_diff = (result.blocked_until - now).total_seconds()
        assert 0 <= time_diff <= 900, \
            f"blocked_until должен быть в пределах 15 минут от текущего времени: {time_diff}s"
    
    finally:
        # Очистка: удаляем тестовые попытки
        await auth_attempts_repo.clear_attempts(tg_id)


@pytest.mark.asyncio
@given(tg_id=tg_id_strategy)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_rate_limit_clear_after_success(
    tg_id: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property (дополнительное): Очистка попыток после успешного входа
    
    Проверяет, что:
    - После очистки попыток счётчик сбрасывается
    - Новые попытки разрешены после очистки
    
    Validates: Requirements 12.4, 12.5
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    auth_attempts_repo = AuthAttemptsRepository()
    rate_limiter = RateLimitService(auth_attempts_repo)
    
    try:
        # Записываем несколько неудачных попыток
        for _ in range(3):
            await rate_limiter.record_failed_attempt(tg_id)
        
        # Проверяем, что попытки записаны
        result = await rate_limiter.check_rate_limit(tg_id)
        assert result.attempts_count == 3, "Должно быть 3 попытки"
        
        # Очищаем попытки (симулируем успешный вход)
        await rate_limiter.clear_attempts(tg_id)
        
        # Проверяем, что счётчик сброшен
        result = await rate_limiter.check_rate_limit(tg_id)
        assert result.allowed is True, "После очистки попытки должны быть разрешены"
        assert result.attempts_count == 0, "Счётчик попыток должен быть сброшен"
        assert result.blocked_until is None, "blocked_until должен быть None после очистки"
    
    finally:
        # Очистка: удаляем тестовые попытки
        await auth_attempts_repo.clear_attempts(tg_id)


@pytest.mark.asyncio
@given(
    tg_id_1=tg_id_strategy,
    tg_id_2=tg_id_strategy
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_rate_limit_isolation(
    tg_id_1: int, 
    tg_id_2: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property (дополнительное): Изоляция rate limiting между пользователями
    
    Проверяет, что попытки одного пользователя не влияют на другого.
    
    Validates: Requirements 12.4, 12.5
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    # Пропускаем случай, когда tg_id совпадают
    if tg_id_1 == tg_id_2:
        return
    
    auth_attempts_repo = AuthAttemptsRepository()
    rate_limiter = RateLimitService(auth_attempts_repo)
    
    try:
        # Очищаем предыдущие попытки
        await auth_attempts_repo.clear_attempts(tg_id_1)
        await auth_attempts_repo.clear_attempts(tg_id_2)
        
        # Записываем 5 попыток для первого пользователя
        for _ in range(5):
            await rate_limiter.record_failed_attempt(tg_id_1)
        
        # Проверяем, что первый пользователь заблокирован
        result_1 = await rate_limiter.check_rate_limit(tg_id_1)
        assert result_1.allowed is False, "Первый пользователь должен быть заблокирован"
        
        # Проверяем, что второй пользователь НЕ заблокирован
        result_2 = await rate_limiter.check_rate_limit(tg_id_2)
        assert result_2.allowed is True, \
            "Второй пользователь не должен быть заблокирован (изоляция)"
        assert result_2.attempts_count == 0, \
            "Счётчик второго пользователя должен быть 0"
    
    finally:
        # Очистка: удаляем тестовые попытки
        await auth_attempts_repo.clear_attempts(tg_id_1)
        await auth_attempts_repo.clear_attempts(tg_id_2)
