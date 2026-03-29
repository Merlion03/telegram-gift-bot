"""
Property-Based тесты: Хеширование паролей

Property 12: Пароли всегда хешируются
Property 13: Round-trip установки пароля
Property 14: Верификация паролей
Property 16: Уникальность солей

Validates: Requirements 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 13.2, 13.3
"""

import pytest
from hypothesis import given, strategies as st, settings, assume, HealthCheck

from services.password_hasher import PasswordHasher
from services.auth_service import AuthService
from database.repositories.admin_repository import AdminRepository
from services.rate_limit_service import RateLimitService
from database.repositories.auth_attempts_repository import AuthAttemptsRepository


# Генераторы для Hypothesis
password_strategy = st.text(
    alphabet=st.characters(
        whitelist_categories=('Lu', 'Ll', 'Nd'),
        whitelist_characters='!@#$%^&*()_+-=[]{}|;:,.<>?',
        min_codepoint=33,
        max_codepoint=126
    ),
    min_size=8,
    max_size=128
)

tg_id_strategy = st.integers(min_value=1, max_value=999999999)
username_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), min_codepoint=65, max_codepoint=122),
    min_size=3,
    max_size=32
)
role_strategy = st.integers(min_value=0, max_value=3)


@given(password=password_strategy)
@settings(max_examples=100)
def test_property_passwords_always_hashed(password: str):
    """
    Property 12: Пароли всегда хешируются
    
    Проверяет, что:
    - hash_password() никогда не возвращает открытый пароль
    - Хеш начинается с $argon2id$
    - Хеш отличается от исходного пароля
    
    Validates: Requirements 8.2, 9.1, 13.3
    """
    hasher = PasswordHasher()
    
    # Хешируем пароль
    password_hash = hasher.hash_password(password)
    
    # Проверяем, что хеш не равен открытому паролю
    assert password_hash != password, "Хеш не должен совпадать с открытым паролем"
    
    # Проверяем, что хеш начинается с $argon2id$
    assert password_hash.startswith("$argon2id$"), "Хеш должен начинаться с $argon2id$"
    
    # Проверяем, что хеш содержит все необходимые компоненты
    parts = password_hash.split("$")
    assert len(parts) >= 5, "Хеш должен содержать минимум 5 частей (разделённых $)"
    assert parts[1] == "argon2id", "Алгоритм должен быть argon2id"


@given(password=password_strategy)
@settings(max_examples=100)
def test_property_salt_uniqueness(password: str):
    """
    Property 16: Уникальность солей
    
    Проверяет, что:
    - Хеширование одного пароля дважды даёт разные хеши
    - Каждый хеш использует уникальную соль
    
    Validates: Requirements 13.2
    """
    hasher = PasswordHasher()
    
    # Хешируем один пароль дважды
    hash1 = hasher.hash_password(password)
    hash2 = hasher.hash_password(password)
    
    # Проверяем, что хеши различаются (разные соли)
    assert hash1 != hash2, "Хеши одного пароля должны различаться (уникальные соли)"
    
    # Оба хеша должны быть валидными Argon2id хешами
    assert hash1.startswith("$argon2id$"), "Первый хеш должен быть Argon2id"
    assert hash2.startswith("$argon2id$"), "Второй хеш должен быть Argon2id"


@given(
    correct_password=password_strategy,
    wrong_password=password_strategy
)
@settings(max_examples=100)
def test_property_password_verification(correct_password: str, wrong_password: str):
    """
    Property 14: Верификация паролей
    
    Проверяет, что:
    - Верификация с правильным паролем возвращает True
    - Верификация с неправильным паролем возвращает False
    
    Validates: Requirements 9.2, 9.3, 9.4
    """
    # Пропускаем случай, когда пароли совпадают
    assume(correct_password != wrong_password)
    
    hasher = PasswordHasher()
    
    # Хешируем правильный пароль
    password_hash = hasher.hash_password(correct_password)
    
    # Проверяем верификацию с правильным паролем
    assert hasher.verify_password(password_hash, correct_password) is True, \
        "Верификация с правильным паролем должна возвращать True"
    
    # Проверяем верификацию с неправильным паролем
    assert hasher.verify_password(password_hash, wrong_password) is False, \
        "Верификация с неправильным паролем должна возвращать False"


@pytest.mark.asyncio
@given(
    tg_id=tg_id_strategy,
    username=username_strategy,
    password=password_strategy
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_property_password_roundtrip(
    tg_id: int, 
    username: str, 
    password: str,
    asyncpg_pool,
    clean_admin_tables
):
    """
    Property 13: Round-trip установки пароля
    
    Проверяет полный цикл:
    1. Создать администратора без пароля
    2. Установить пароль через register_password()
    3. Аутентифицироваться с тем же паролем через authenticate()
    4. Проверить успешность аутентификации
    
    Validates: Requirements 8.3, 8.4
    
    Требует: asyncpg_pool, clean_admin_tables
    """
    # Инициализируем сервисы
    admin_repo = AdminRepository()
    auth_attempts_repo = AuthAttemptsRepository()
    rate_limiter = RateLimitService(auth_attempts_repo)
    hasher = PasswordHasher()
    auth_service = AuthService(admin_repo, rate_limiter, hasher)
    
    try:
        # 1. Создаём администратора без пароля
        admin = await admin_repo.create(tg_id=tg_id, username=username, role=2)
        assert admin.password_hash is None, "Новый администратор должен быть без пароля"
        
        # 2. Устанавливаем пароль
        updated_admin = await auth_service.register_password(tg_id, password)
        assert updated_admin.password_hash is not None, "Пароль должен быть установлен"
        
        # 3. Аутентифицируемся с тем же паролем
        authenticated_admin = await auth_service.authenticate(tg_id, password)
        
        # 4. Проверяем успешность аутентификации
        assert authenticated_admin is not None, \
            "Аутентификация с правильным паролем должна быть успешной"
        assert authenticated_admin.tg_id == tg_id, "tg_id должен совпадать"
        assert authenticated_admin.username == username, "username должен совпадать"
        
    finally:
        # Очистка: удаляем тестового администратора и попытки входа
        pool = asyncpg_pool.get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM auth_attempts WHERE tg_id = $1", tg_id)
            await conn.execute("DELETE FROM administrators WHERE tg_id = $1", tg_id)
