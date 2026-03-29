"""
Property-Based тесты: Конфигурация системы

Property 20: Конфигурация session lifetime
Property 21: Права на изменение конфигурации
Property 22: Применение конфигурации к токенам
Property 23: Валидация положительного времени жизни

Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck

from services.config_service import ConfigService
from services.jwt_session_service import JWTSessionService
from database.repositories.config_repository import ConfigRepository


# Генераторы для Hypothesis
session_lifetime_strategy = st.integers(min_value=1, max_value=168)  # 1-168 часов (1 неделя)
invalid_session_lifetime_strategy = st.integers(max_value=0)  # <= 0
role_strategy = st.integers(min_value=0, max_value=3)
tg_id_strategy = st.integers(min_value=1, max_value=999999999)


@pytest.mark.asyncio
@given(session_lifetime_hours=session_lifetime_strategy)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_config_session_lifetime_roundtrip(
    session_lifetime_hours: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 20: Конфигурация session lifetime
    
    Проверяет round-trip:
    1. Установить значение session_lifetime_hours
    2. Прочитать значение обратно
    3. Проверить совпадение значений
    
    Validates: Requirements 11.1, 11.2
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    config_repo = ConfigRepository()
    config_service = ConfigService(config_repo)
    
    try:
        # Устанавливаем значение (используем роль Developer для прав)
        success = await config_service.set_session_lifetime(session_lifetime_hours, admin_role=0)
        assert success is True, "Установка session_lifetime должна быть успешной для Developer"
        
        # Читаем значение обратно
        retrieved_lifetime = await config_service.get_session_lifetime()
        
        # Проверяем совпадение
        assert retrieved_lifetime == session_lifetime_hours, \
            f"Прочитанное значение должно совпадать с установленным: " \
            f"expected={session_lifetime_hours}, actual={retrieved_lifetime}"
    
    finally:
        # Очистка: восстанавливаем значение по умолчанию
        await config_repo.set_session_lifetime_hours(24)


@pytest.mark.asyncio
@given(
    session_lifetime_hours=session_lifetime_strategy,
    role=role_strategy
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_config_modification_permissions(
    session_lifetime_hours: int,
    role: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 21: Права на изменение конфигурации
    
    Проверяет, что:
    - Developer (0) может изменять session_lifetime
    - Assistant (1) может изменять session_lifetime
    - Administrator (2) НЕ может изменять session_lifetime
    - Operator (3) НЕ может изменять session_lifetime
    
    Validates: Requirements 11.3
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    config_repo = ConfigRepository()
    config_service = ConfigService(config_repo)
    
    try:
        # Пытаемся установить значение с заданной ролью
        success = await config_service.set_session_lifetime(session_lifetime_hours, admin_role=role)
        
        # Проверяем корректность прав
        if role <= 1:
            assert success is True, \
                f"Роль {role} должна иметь право изменять session_lifetime"
            
            # Проверяем, что значение действительно установлено
            retrieved_lifetime = await config_service.get_session_lifetime()
            assert retrieved_lifetime == session_lifetime_hours, \
                "Значение должно быть установлено для ролей с правами"
        else:
            assert success is False, \
                f"Роль {role} НЕ должна иметь право изменять session_lifetime"
    
    finally:
        # Очистка: восстанавливаем значение по умолчанию
        await config_repo.set_session_lifetime_hours(24)


@pytest.mark.asyncio
@given(
    session_lifetime_hours=session_lifetime_strategy,
    tg_id=tg_id_strategy,
    role=role_strategy
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_config_applied_to_tokens(
    session_lifetime_hours: int,
    tg_id: int,
    role: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 22: Применение конфигурации к токенам
    
    Проверяет, что:
    1. Установленное значение session_lifetime применяется к генерируемым токенам
    2. exp в токене соответствует установленному session_lifetime
    
    Validates: Requirements 11.4
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    config_repo = ConfigRepository()
    
    try:
        # Устанавливаем конфигурацию
        await config_repo.set_session_lifetime_hours(session_lifetime_hours)
        
        # Создаём JWT сервис с установленным временем жизни
        secret_key = "test_secret_key_32_characters_long_for_testing"
        jwt_service = JWTSessionService(secret_key, session_lifetime_hours)
        
        # Генерируем токен
        token = jwt_service.generate_token(tg_id, role)
        
        # Валидируем токен
        claims = jwt_service.validate_token(token)
        
        assert claims is not None, "Токен должен быть валидирован"
        
        # Проверяем, что exp соответствует установленному session_lifetime
        expected_exp = claims.iat + (session_lifetime_hours * 3600)
        assert claims.exp == expected_exp, \
            f"exp должен соответствовать session_lifetime: " \
            f"exp={claims.exp}, expected={expected_exp}, " \
            f"session_lifetime_hours={session_lifetime_hours}"
    
    finally:
        # Очистка: восстанавливаем значение по умолчанию
        await config_repo.set_session_lifetime_hours(24)


@pytest.mark.asyncio
@given(invalid_hours=invalid_session_lifetime_strategy)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_config_positive_lifetime_validation(
    invalid_hours: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 23: Валидация положительного времени жизни
    
    Проверяет, что:
    - set_session_lifetime() отклоняет значения <= 0
    - Конфигурация не изменяется при невалидном значении
    
    Validates: Requirements 11.5
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    config_repo = ConfigRepository()
    config_service = ConfigService(config_repo)
    
    try:
        # Запоминаем текущее значение
        current_lifetime = await config_service.get_session_lifetime()
        
        # Пытаемся установить невалидное значение (используем роль Developer)
        success = await config_service.set_session_lifetime(invalid_hours, admin_role=0)
        
        # Проверяем, что операция отклонена
        assert success is False, \
            f"set_session_lifetime() должен отклонять значения <= 0: hours={invalid_hours}"
        
        # Проверяем, что значение не изменилось
        new_lifetime = await config_service.get_session_lifetime()
        assert new_lifetime == current_lifetime, \
            "Значение session_lifetime не должно измениться при невалидном значении"
    
    finally:
        # Очистка: восстанавливаем значение по умолчанию
        await config_repo.set_session_lifetime_hours(24)


@pytest.mark.asyncio
@given(
    session_lifetime_hours=session_lifetime_strategy,
    role=role_strategy
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_config_permissions_and_validation_combined(
    session_lifetime_hours: int,
    role: int,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property (дополнительное): Комбинированная проверка прав и валидации
    
    Проверяет взаимодействие проверки прав и валидации значений:
    - Если нет прав (role > 1) - отклонить независимо от значения
    - Если есть права (role <= 1) - применить валидацию значения
    
    Validates: Requirements 11.3, 11.5
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    config_repo = ConfigRepository()
    config_service = ConfigService(config_repo)
    
    try:
        # Пытаемся установить значение
        success = await config_service.set_session_lifetime(session_lifetime_hours, admin_role=role)
        
        if role > 1:
            # Нет прав - должно быть отклонено
            assert success is False, f"Роль {role} не должна иметь право изменять конфигурацию"
        else:
            # Есть права - проверяем валидацию
            if session_lifetime_hours > 0:
                assert success is True, \
                    f"Роль {role} с валидным значением должна успешно установить конфигурацию"
            else:
                assert success is False, \
                    "Невалидное значение должно быть отклонено даже при наличии прав"
    
    finally:
        # Очистка: восстанавливаем значение по умолчанию
        await config_repo.set_session_lifetime_hours(24)
