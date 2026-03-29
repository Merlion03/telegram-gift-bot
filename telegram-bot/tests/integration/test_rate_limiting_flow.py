"""
End-to-End тест: Rate limiting

Проверяет полный сценарий защиты от brute-force атак:
1. Симуляция 5 неудачных попыток входа
2. Проверка блокировки 6-й попытки (429 Too Many Requests)
3. Симуляция ожидания 15 минут (изменение timestamp в БД)
4. Проверка разблокировки

Validates: Requirements 12.4, 12.5
"""

import pytest
from datetime import datetime, timezone, timedelta

from database.repositories.admin_repository import AdminRepository
from database.repositories.auth_attempts_repository import AuthAttemptsRepository
from services.auth_service import AuthService
from services.password_hasher import PasswordHasher
from services.rate_limit_service import RateLimitService
from models.role import AdminRole


@pytest.fixture
async def test_db_connection():
    """
    Создаёт тестовое подключение к БД
    
    Очищает таблицы перед и после теста для изоляции
    """
    from database.asyncpg_connection import get_asyncpg_pool
    import os
    
    # Инициализируем connection pool
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    pool_instance = get_asyncpg_pool()
    await pool_instance.initialize(
        database_url=database_url,
        min_size=2,
        max_size=5
    )
    
    pool = pool_instance.get_pool()
    
    # Очищаем таблицы перед тестом
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE")
        await conn.execute("TRUNCATE TABLE administrators RESTART IDENTITY CASCADE")
    
    yield pool
    
    # Очищаем таблицы после теста
    async with pool.acquire() as conn:
        await conn.execute("TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE")
        await conn.execute("TRUNCATE TABLE administrators RESTART IDENTITY CASCADE")
    
    # Закрываем pool
    await pool_instance.close()


@pytest.fixture
def admin_repository():
    """Создаёт AdminRepository"""
    return AdminRepository()


@pytest.fixture
def auth_attempts_repository():
    """Создаёт AuthAttemptsRepository"""
    return AuthAttemptsRepository()


@pytest.fixture
def password_hasher():
    """Создаёт PasswordHasher с реальными параметрами"""
    return PasswordHasher(
        time_cost=2,
        memory_cost=65536,
        parallelism=4
    )


@pytest.fixture
def rate_limit_service(auth_attempts_repository):
    """Создаёт RateLimitService"""
    return RateLimitService(auth_attempts_repository=auth_attempts_repository)


@pytest.fixture
def auth_service(admin_repository, rate_limit_service, password_hasher):
    """Создаёт AuthService"""
    return AuthService(
        admin_repository=admin_repository,
        rate_limit_service=rate_limit_service,
        password_hasher=password_hasher
    )


@pytest.mark.asyncio
async def test_rate_limiting_blocks_after_5_attempts(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    rate_limit_service,
    password_hasher
):
    """
    End-to-End тест блокировки после 5 неудачных попыток
    
    Сценарий:
    1. Создаём администратора с паролем
    2. Делаем 5 неудачных попыток входа
    3. Проверяем блокировку 6-й попытки
    4. Проверяем, что rate_limit_service возвращает blocked_until
    
    Validates: Requirements 12.4, 12.5
    """
    # ===== ШАГ 1: Создание администратора =====
    tg_id = 123456789
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_rate_limit",
        role=AdminRole.OPERATOR
    )
    
    # Устанавливаем пароль
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # ===== ШАГ 2: Делаем 5 неудачных попыток =====
    for attempt in range(1, 6):
        # Проверяем rate limit перед попыткой
        rate_limit_result = await rate_limit_service.check_rate_limit(tg_id)
        assert rate_limit_result.allowed is True, f"Попытка {attempt} должна быть разрешена"
        assert rate_limit_result.attempts_count == attempt - 1
        
        # Пытаемся войти с неправильным паролем
        authenticated = await auth_service.authenticate(tg_id, wrong_password)
        assert authenticated is None
        
        # Проверяем, что попытка записана
        attempts_count = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
        assert attempts_count == attempt
    
    # ===== ШАГ 3: Проверяем блокировку 6-й попытки =====
    # Проверяем rate limit после 5 попыток
    rate_limit_result = await rate_limit_service.check_rate_limit(tg_id)
    
    # Проверяем, что доступ заблокирован
    assert rate_limit_result.allowed is False
    assert rate_limit_result.attempts_count == 5
    assert rate_limit_result.blocked_until is not None
    
    # Проверяем, что blocked_until в будущем
    now = datetime.now(timezone.utc)
    assert rate_limit_result.blocked_until > now
    
    # Пытаемся войти (должно быть заблокировано)
    authenticated = await auth_service.authenticate(tg_id, wrong_password)
    assert authenticated is None
    
    # Проверяем, что попытка НЕ записана (блокировка сработала до записи)
    attempts_count = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
    assert attempts_count == 5  # Всё ещё 5, не 6
    
    # ===== ИТОГОВАЯ ПРОВЕРКА =====
    # Проверяем, что даже с правильным паролем доступ заблокирован
    authenticated_correct = await auth_service.authenticate(tg_id, correct_password)
    assert authenticated_correct is None


@pytest.mark.asyncio
async def test_rate_limiting_unblocks_after_15_minutes(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    rate_limit_service,
    password_hasher
):
    """
    End-to-End тест разблокировки через 15 минут
    
    Сценарий:
    1. Создаём администратора с паролем
    2. Делаем 5 неудачных попыток
    3. Проверяем блокировку
    4. Изменяем timestamp попыток в БД (симуляция ожидания 15 минут)
    5. Проверяем разблокировку
    6. Проверяем успешный вход с правильным паролем
    
    Validates: Requirements 12.4, 12.5
    """
    # ===== ШАГ 1: Создание администратора =====
    tg_id = 200000000
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_unblock",
        role=AdminRole.OPERATOR
    )
    
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # ===== ШАГ 2: Делаем 5 неудачных попыток =====
    for _ in range(5):
        authenticated = await auth_service.authenticate(tg_id, wrong_password)
        assert authenticated is None
    
    # ===== ШАГ 3: Проверяем блокировку =====
    rate_limit_result = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_result.allowed is False
    assert rate_limit_result.attempts_count == 5
    
    # ===== ШАГ 4: Симулируем ожидание 15 минут =====
    # Изменяем timestamp всех попыток на 16 минут назад
    from database.asyncpg_connection import get_asyncpg_pool
    pool = get_asyncpg_pool().get_pool()
    
    old_timestamp = datetime.now(timezone.utc) - timedelta(minutes=16)
    
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE auth_attempts
            SET timestamp = $1
            WHERE tg_id = $2
            """,
            old_timestamp,
            tg_id
        )
    
    # ===== ШАГ 5: Проверяем разблокировку =====
    rate_limit_result_after = await rate_limit_service.check_rate_limit(tg_id)
    
    # Проверяем, что доступ разблокирован
    assert rate_limit_result_after.allowed is True
    assert rate_limit_result_after.attempts_count == 0  # Попытки старше 15 минут не учитываются
    assert rate_limit_result_after.blocked_until is None
    
    # ===== ШАГ 6: Проверяем успешный вход =====
    authenticated = await auth_service.authenticate(tg_id, correct_password)
    
    # Проверяем успешную аутентификацию
    assert authenticated is not None
    assert authenticated.tg_id == tg_id
    
    # Проверяем, что попытки очищены после успешного входа
    attempts_after_success = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
    assert attempts_after_success == 0


@pytest.mark.asyncio
async def test_rate_limiting_isolation_between_users(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    rate_limit_service,
    password_hasher
):
    """
    Тест изоляции rate limiting между разными пользователями
    
    Проверяет, что блокировка одного администратора не влияет на других
    
    Validates: Requirements 12.4, 12.5
    """
    # Создаём двух администраторов
    tg_id_1 = 300000000
    tg_id_2 = 300000001
    password = "TestPassword123"
    wrong_password = "WrongPassword456"
    
    # Администратор 1
    admin1 = await admin_repository.create(
        tg_id=tg_id_1,
        username="test_user_1",
        role=AdminRole.OPERATOR
    )
    password_hash_1 = password_hasher.hash_password(password)
    await admin_repository.update_password(tg_id_1, password_hash_1)
    
    # Администратор 2
    admin2 = await admin_repository.create(
        tg_id=tg_id_2,
        username="test_user_2",
        role=AdminRole.OPERATOR
    )
    password_hash_2 = password_hasher.hash_password(password)
    await admin_repository.update_password(tg_id_2, password_hash_2)
    
    # Делаем 5 неудачных попыток для администратора 1
    for _ in range(5):
        authenticated = await auth_service.authenticate(tg_id_1, wrong_password)
        assert authenticated is None
    
    # Проверяем блокировку администратора 1
    rate_limit_1 = await rate_limit_service.check_rate_limit(tg_id_1)
    assert rate_limit_1.allowed is False
    assert rate_limit_1.attempts_count == 5
    
    # Проверяем, что администратор 2 НЕ заблокирован
    rate_limit_2 = await rate_limit_service.check_rate_limit(tg_id_2)
    assert rate_limit_2.allowed is True
    assert rate_limit_2.attempts_count == 0
    
    # Проверяем, что администратор 2 может войти
    authenticated_2 = await auth_service.authenticate(tg_id_2, password)
    assert authenticated_2 is not None
    assert authenticated_2.tg_id == tg_id_2
    
    # Проверяем, что администратор 1 всё ещё заблокирован
    authenticated_1 = await auth_service.authenticate(tg_id_1, password)
    assert authenticated_1 is None


@pytest.mark.asyncio
async def test_rate_limiting_clears_after_successful_login(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    rate_limit_service,
    password_hasher
):
    """
    Тест очистки rate limit после успешного входа
    
    Проверяет, что после успешной аутентификации счётчик попыток сбрасывается
    
    Validates: Requirements 12.5
    """
    # Создаём администратора
    tg_id = 400000000
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_clear_rate_limit",
        role=AdminRole.OPERATOR
    )
    
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # Делаем 4 неудачные попытки (не достигаем лимита)
    for _ in range(4):
        authenticated = await auth_service.authenticate(tg_id, wrong_password)
        assert authenticated is None
    
    # Проверяем, что доступ ещё разрешён
    rate_limit_result = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_result.allowed is True
    assert rate_limit_result.attempts_count == 4
    
    # Успешная аутентификация
    authenticated = await auth_service.authenticate(tg_id, correct_password)
    assert authenticated is not None
    
    # Проверяем, что попытки очищены
    attempts_after = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
    assert attempts_after == 0
    
    # Проверяем, что rate limit сброшен
    rate_limit_after = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_after.allowed is True
    assert rate_limit_after.attempts_count == 0


@pytest.mark.asyncio
async def test_rate_limiting_sliding_window(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    rate_limit_service,
    password_hasher
):
    """
    Тест sliding window алгоритма rate limiting
    
    Проверяет, что старые попытки (> 15 минут) не учитываются в лимите
    
    Validates: Requirements 12.4, 12.5
    """
    # Создаём администратора
    tg_id = 500000000
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_sliding_window",
        role=AdminRole.OPERATOR
    )
    
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # Делаем 3 неудачные попытки
    for _ in range(3):
        authenticated = await auth_service.authenticate(tg_id, wrong_password)
        assert authenticated is None
    
    # Проверяем текущее состояние
    rate_limit_result = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_result.allowed is True
    assert rate_limit_result.attempts_count == 3
    
    # Изменяем timestamp первых 2 попыток на 16 минут назад
    from database.asyncpg_connection import get_asyncpg_pool
    pool = get_asyncpg_pool().get_pool()
    
    old_timestamp = datetime.now(timezone.utc) - timedelta(minutes=16)
    
    async with pool.acquire() as conn:
        # Получаем первые 2 попытки
        attempts = await conn.fetch(
            """
            SELECT id FROM auth_attempts
            WHERE tg_id = $1
            ORDER BY timestamp ASC
            LIMIT 2
            """,
            tg_id
        )
        
        # Обновляем их timestamp
        for attempt in attempts:
            await conn.execute(
                """
                UPDATE auth_attempts
                SET timestamp = $1
                WHERE id = $2
                """,
                old_timestamp,
                attempt['id']
            )
    
    # Проверяем rate limit после изменения timestamp
    rate_limit_after = await rate_limit_service.check_rate_limit(tg_id)
    
    # Должна остаться только 1 попытка в окне (3 - 2 старые)
    assert rate_limit_after.allowed is True
    assert rate_limit_after.attempts_count == 1
    
    # Делаем ещё 4 неудачные попытки (итого 5 в окне)
    for _ in range(4):
        authenticated = await auth_service.authenticate(tg_id, wrong_password)
        assert authenticated is None
    
    # Проверяем блокировку
    rate_limit_final = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_final.allowed is False
    assert rate_limit_final.attempts_count == 5


@pytest.mark.asyncio
async def test_rate_limiting_correct_password_after_block(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    rate_limit_service,
    password_hasher
):
    """
    Тест блокировки даже с правильным паролем после 5 неудачных попыток
    
    Проверяет, что rate limiting блокирует все попытки входа,
    даже если пароль правильный
    
    Validates: Requirements 12.4
    """
    # Создаём администратора
    tg_id = 600000000
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_block_correct",
        role=AdminRole.OPERATOR
    )
    
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # Делаем 5 неудачных попыток
    for _ in range(5):
        authenticated = await auth_service.authenticate(tg_id, wrong_password)
        assert authenticated is None
    
    # Проверяем блокировку
    rate_limit_result = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_result.allowed is False
    
    # Пытаемся войти с ПРАВИЛЬНЫМ паролем (должно быть заблокировано)
    authenticated_correct = await auth_service.authenticate(tg_id, correct_password)
    assert authenticated_correct is None
    
    # Симулируем ожидание 15 минут
    from database.asyncpg_connection import get_asyncpg_pool
    pool = get_asyncpg_pool().get_pool()
    
    old_timestamp = datetime.now(timezone.utc) - timedelta(minutes=16)
    
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE auth_attempts
            SET timestamp = $1
            WHERE tg_id = $2
            """,
            old_timestamp,
            tg_id
        )
    
    # Проверяем разблокировку
    rate_limit_after = await rate_limit_service.check_rate_limit(tg_id)
    assert rate_limit_after.allowed is True
    
    # Теперь можем войти с правильным паролем
    authenticated_after_unblock = await auth_service.authenticate(tg_id, correct_password)
    assert authenticated_after_unblock is not None
    assert authenticated_after_unblock.tg_id == tg_id
    
    # Проверяем, что попытки очищены после успешного входа
    attempts_after = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
    assert attempts_after == 0
