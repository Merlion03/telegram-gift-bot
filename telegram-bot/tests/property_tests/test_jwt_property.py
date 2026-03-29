"""
Property-Based тест: JWT структура и срок действия

Property 17: JWT структура и срок действия
Validates: Requirements 10.1, 10.2, 10.5
"""

import pytest
from hypothesis import given, strategies as st, settings
from datetime import datetime, timezone
import time

from services.jwt_session_service import JWTSessionService


# Генераторы для Hypothesis
tg_id_strategy = st.integers(min_value=1, max_value=999999999)
role_strategy = st.integers(min_value=0, max_value=3)
session_lifetime_strategy = st.integers(min_value=1, max_value=168)  # 1-168 часов (1 неделя)


@given(
    tg_id=tg_id_strategy,
    role=role_strategy,
    session_lifetime_hours=session_lifetime_strategy
)
@settings(max_examples=100)
def test_property_jwt_structure_and_expiration(
    tg_id: int,
    role: int,
    session_lifetime_hours: int
):
    """
    Property 17: JWT структура и срок действия
    
    Проверяет, что:
    - JWT токен генерируется корректно
    - Токен содержит все необходимые claims (tg_id, role, iat, exp)
    - exp = iat + session_lifetime_hours * 3600
    - Токен может быть валидирован
    - Claims извлекаются корректно
    
    Validates: Requirements 10.1, 10.2, 10.5
    """
    # Создаём сервис с заданным временем жизни сессии
    secret_key = "test_secret_key_32_characters_long_for_testing"
    jwt_service = JWTSessionService(secret_key, session_lifetime_hours)
    
    # Запоминаем время до генерации токена
    # ИСПРАВЛЕНИЕ: Используем datetime.now(timezone.utc) вместо utcnow()
    time_before = int(datetime.now(timezone.utc).timestamp())
    
    # Генерируем JWT токен
    token = jwt_service.generate_token(tg_id, role)
    
    # Запоминаем время после генерации токена
    time_after = int(datetime.now(timezone.utc).timestamp())
    
    # Проверяем, что токен не пустой
    assert token is not None, "Токен не должен быть None"
    assert len(token) > 0, "Токен не должен быть пустым"
    assert isinstance(token, str), "Токен должен быть строкой"
    
    # Валидируем токен
    claims = jwt_service.validate_token(token)
    
    # Проверяем, что claims извлечены
    assert claims is not None, "Claims должны быть извлечены из токена"
    
    # Проверяем корректность claims
    assert claims.tg_id == tg_id, "tg_id в claims должен совпадать"
    assert claims.role == role, "role в claims должен совпадать"
    
    # Проверяем временные метки
    assert claims.iat >= time_before, "iat должен быть >= времени до генерации"
    assert claims.iat <= time_after, "iat должен быть <= времени после генерации"
    
    # Проверяем, что exp = iat + session_lifetime_hours * 3600
    expected_exp = claims.iat + (session_lifetime_hours * 3600)
    assert claims.exp == expected_exp, \
        f"exp должен быть равен iat + session_lifetime_hours * 3600: " \
        f"exp={claims.exp}, expected={expected_exp}"
    
    # Проверяем, что токен не истёк (только что созданный)
    assert jwt_service.is_token_expired(token) is False, \
        "Только что созданный токен не должен быть истёкшим"


@given(
    tg_id=tg_id_strategy,
    role=role_strategy
)
@settings(max_examples=100)
def test_property_jwt_validation_roundtrip(tg_id: int, role: int):
    """
    Property (дополнительное): Round-trip генерации и валидации JWT
    
    Проверяет, что:
    - Сгенерированный токен может быть валидирован
    - Claims после валидации совпадают с исходными данными
    
    Validates: Requirements 10.1, 10.3
    """
    secret_key = "test_secret_key_32_characters_long_for_testing"
    jwt_service = JWTSessionService(secret_key, session_lifetime_hours=24)
    
    # Генерируем токен
    token = jwt_service.generate_token(tg_id, role)
    
    # Валидируем токен
    claims = jwt_service.validate_token(token)
    
    # Проверяем round-trip
    assert claims is not None, "Токен должен быть валидирован"
    assert claims.tg_id == tg_id, "tg_id должен совпадать после round-trip"
    assert claims.role == role, "role должен совпадать после round-trip"


@given(tg_id=tg_id_strategy, role=role_strategy)
@settings(max_examples=100)
def test_property_jwt_invalid_signature_rejected(tg_id: int, role: int):
    """
    Property (дополнительное): Отклонение токенов с неправильной подписью
    
    Проверяет, что токен с другим secret key не валидируется.
    
    Validates: Requirements 12.1, 12.3
    """
    secret_key_1 = "test_secret_key_32_characters_long_for_testing_1"
    secret_key_2 = "test_secret_key_32_characters_long_for_testing_2"
    
    # Генерируем токен с первым ключом
    jwt_service_1 = JWTSessionService(secret_key_1, session_lifetime_hours=24)
    token = jwt_service_1.generate_token(tg_id, role)
    
    # Пытаемся валидировать с другим ключом
    jwt_service_2 = JWTSessionService(secret_key_2, session_lifetime_hours=24)
    claims = jwt_service_2.validate_token(token)
    
    # Проверяем, что валидация не прошла
    assert claims is None, "Токен с неправильной подписью должен быть отклонён"
