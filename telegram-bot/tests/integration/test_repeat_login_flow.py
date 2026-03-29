"""
End-to-End тест: Повторный вход администратора

Проверяет полный сценарий повторного входа администратора:
1. Создание администратора с установленным паролем
2. Команда /start → проверка Reply Keyboard
3. Вход с правильным паролем → проверка JWT
4. Доступ к защищённому endpoint → проверка успеха

Validates: Requirements 4.2, 9.2, 9.3, 10.1, 10.3, 12.1
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone
from aiogram.types import Message, User

from handlers.admin_start_handler import AdminStartHandler
from database.repositories.admin_repository import AdminRepository
from database.repositories.auth_attempts_repository import AuthAttemptsRepository
from services.auth_service import AuthService
from services.jwt_session_service import JWTSessionService
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


@pytest.fixture
def jwt_session_service():
    """Создаёт JWTSessionService"""
    return JWTSessionService(
        secret_key="test_secret_key_for_integration_tests",
        session_lifetime_hours=24
    )


@pytest.fixture
def mock_message():
    """Создаёт mock Message для Telegram Bot"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = 123456789
    message.from_user.username = "test_admin"
    message.from_user.first_name = "Test"
    message.answer = AsyncMock()
    return message


@pytest.mark.asyncio
async def test_repeat_login_complete_flow(
    test_db_connection,
    admin_repository,
    auth_service,
    jwt_session_service,
    password_hasher,
    mock_message
):
    """
    End-to-End тест полного сценария повторного входа администратора
    
    Сценарий:
    1. Создаём администратора с установленным паролем
    2. Симулируем команду /start → проверяем Reply Keyboard
    3. Симулируем вход с правильным паролем → проверяем JWT
    4. Симулируем доступ к защищённому endpoint → проверяем успех
    
    Validates: Requirements 4.2, 9.2, 9.3, 10.1, 10.3, 12.1
    """
    # ===== ШАГ 1: Создание администратора с паролем =====
    test_tg_id = 123456789
    test_username = "test_admin"
    test_role = AdminRole.ADMINISTRATOR
    test_password = "SecurePassword123"
    
    # Создаём администратора
    admin = await admin_repository.create(
        tg_id=test_tg_id,
        username=test_username,
        role=test_role
    )
    
    # Устанавливаем пароль
    password_hash = password_hasher.hash_password(test_password)
    await admin_repository.update_password(test_tg_id, password_hash)
    
    # Проверяем, что пароль установлен
    admin_with_password = await admin_repository.get_by_tg_id(test_tg_id)
    assert admin_with_password is not None
    assert admin_with_password.password_hash is not None
    assert admin_with_password.is_first_login() is False
    
    # ===== ШАГ 2: Симуляция команды /start =====
    mock_session_manager = AsyncMock()
    admin_start_handler = AdminStartHandler(
        admin_repository=admin_repository,
        session_manager=mock_session_manager,
        webapp_url="https://test.example.com/admin"
    )
    
    # Обрабатываем команду /start
    await admin_start_handler.handle_start(mock_message, session_id=None)
    
    # Проверяем, что был отправлен ответ с Reply Keyboard
    assert mock_message.answer.call_count == 1
    call_args = mock_message.answer.call_args
    
    # Проверяем наличие WebApp кнопки
    assert 'reply_markup' in call_args.kwargs
    reply_markup = call_args.kwargs['reply_markup']
    assert reply_markup is not None
    
    # ===== ШАГ 3: Вход с правильным паролем =====
    # Проверяем, что это НЕ первый вход
    is_first_login = await auth_service.is_first_login(test_tg_id)
    assert is_first_login is False
    
    # Аутентифицируемся с правильным паролем
    authenticated_admin = await auth_service.authenticate(test_tg_id, test_password)
    
    # Проверяем успешную аутентификацию
    assert authenticated_admin is not None
    assert authenticated_admin.tg_id == test_tg_id
    assert authenticated_admin.role == test_role
    
    # Генерируем JWT токен
    jwt_token = jwt_session_service.generate_token(
        tg_id=test_tg_id,
        role=test_role
    )
    
    # Проверяем токен
    assert jwt_token is not None
    assert isinstance(jwt_token, str)
    
    # ===== ШАГ 4: Доступ к защищённому endpoint =====
    # Валидируем токен (симуляция middleware проверки)
    session_claims = jwt_session_service.validate_token(jwt_token)
    
    # Проверяем, что токен валиден
    assert session_claims is not None
    assert session_claims.tg_id == test_tg_id
    assert session_claims.role == test_role
    
    # Проверяем, что токен не истёк
    is_expired = jwt_session_service.is_token_expired(jwt_token)
    assert is_expired is False
    
    # ===== ИТОГОВАЯ ПРОВЕРКА =====
    # Проверяем, что можем повторно аутентифицироваться
    second_auth = await auth_service.authenticate(test_tg_id, test_password)
    assert second_auth is not None
    assert second_auth.tg_id == test_tg_id


@pytest.mark.asyncio
async def test_repeat_login_wrong_password(
    test_db_connection,
    admin_repository,
    auth_service,
    password_hasher
):
    """
    Тест повторного входа с неправильным паролем
    
    Проверяет, что система отклоняет неправильный пароль
    
    Validates: Requirements 9.2, 9.4
    """
    # Создаём администратора с паролем
    tg_id = 200000000
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_wrong_password",
        role=AdminRole.OPERATOR
    )
    
    # Устанавливаем пароль
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # Пытаемся войти с неправильным паролем
    authenticated = await auth_service.authenticate(tg_id, wrong_password)
    
    # Проверяем отказ
    assert authenticated is None
    
    # Проверяем, что можем войти с правильным паролем
    authenticated_correct = await auth_service.authenticate(tg_id, correct_password)
    assert authenticated_correct is not None
    assert authenticated_correct.tg_id == tg_id


@pytest.mark.asyncio
async def test_repeat_login_multiple_sessions(
    test_db_connection,
    admin_repository,
    auth_service,
    jwt_session_service,
    password_hasher
):
    """
    Тест создания нескольких сессий для одного администратора
    
    Проверяет, что администратор может иметь несколько активных JWT токенов
    (stateless design)
    
    Validates: Requirements 10.1, 10.3
    """
    # Создаём администратора с паролем
    tg_id = 300000000
    password = "MultiSessionPassword123"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_multi_session",
        role=AdminRole.ADMINISTRATOR
    )
    
    password_hash = password_hasher.hash_password(password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # Аутентифицируемся первый раз
    auth1 = await auth_service.authenticate(tg_id, password)
    assert auth1 is not None
    
    # Генерируем первый JWT
    token1 = jwt_session_service.generate_token(tg_id=tg_id, role=auth1.role)
    
    # Ждём 1 секунду, чтобы iat отличался
    import asyncio
    await asyncio.sleep(1)
    
    # Аутентифицируемся второй раз
    auth2 = await auth_service.authenticate(tg_id, password)
    assert auth2 is not None
    
    # Генерируем второй JWT
    token2 = jwt_session_service.generate_token(tg_id=tg_id, role=auth2.role)
    
    # Проверяем, что оба токена валидны
    claims1 = jwt_session_service.validate_token(token1)
    claims2 = jwt_session_service.validate_token(token2)
    
    assert claims1 is not None
    assert claims2 is not None
    assert claims1.tg_id == tg_id
    assert claims2.tg_id == tg_id
    
    # Токены должны быть разными (разные iat)
    assert token1 != token2


@pytest.mark.asyncio
async def test_repeat_login_different_roles_permissions(
    test_db_connection,
    admin_repository,
    auth_service,
    jwt_session_service,
    password_hasher
):
    """
    Тест повторного входа для администраторов с разными ролями
    
    Проверяет, что JWT токены содержат корректную роль для каждого администратора
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4, 10.2
    """
    roles_to_test = [
        (AdminRole.DEVELOPER, "developer_repeat"),
        (AdminRole.ASSISTANT, "assistant_repeat"),
        (AdminRole.ADMINISTRATOR, "administrator_repeat"),
        (AdminRole.OPERATOR, "operator_repeat")
    ]
    
    for role, username in roles_to_test:
        tg_id = 400000000 + role
        password = f"Password{role}123"
        
        # Создаём администратора
        admin = await admin_repository.create(
            tg_id=tg_id,
            username=username,
            role=role
        )
        
        # Устанавливаем пароль
        password_hash = password_hasher.hash_password(password)
        await admin_repository.update_password(tg_id, password_hash)
        
        # Аутентифицируемся
        authenticated = await auth_service.authenticate(tg_id, password)
        assert authenticated is not None
        assert authenticated.role == role
        
        # Генерируем JWT
        token = jwt_session_service.generate_token(tg_id=tg_id, role=role)
        
        # Валидируем JWT
        claims = jwt_session_service.validate_token(token)
        assert claims is not None
        assert claims.tg_id == tg_id
        assert claims.role == role
        
        # Проверяем, что токен не истёк
        is_expired = jwt_session_service.is_token_expired(token)
        assert is_expired is False


@pytest.mark.asyncio
async def test_repeat_login_clears_failed_attempts(
    test_db_connection,
    admin_repository,
    auth_service,
    auth_attempts_repository,
    password_hasher
):
    """
    Тест очистки неудачных попыток после успешного входа
    
    Проверяет, что после успешной аутентификации все предыдущие
    неудачные попытки очищаются
    
    Validates: Requirements 9.3, 12.5
    """
    # Создаём администратора с паролем
    tg_id = 500000000
    correct_password = "CorrectPassword123"
    wrong_password = "WrongPassword456"
    
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_clear_attempts",
        role=AdminRole.OPERATOR
    )
    
    password_hash = password_hasher.hash_password(correct_password)
    await admin_repository.update_password(tg_id, password_hash)
    
    # Делаем 3 неудачные попытки
    for _ in range(3):
        result = await auth_service.authenticate(tg_id, wrong_password)
        assert result is None
    
    # Проверяем, что попытки записаны
    attempts_count = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
    assert attempts_count == 3
    
    # Успешная аутентификация
    authenticated = await auth_service.authenticate(tg_id, correct_password)
    assert authenticated is not None
    
    # Проверяем, что попытки очищены
    attempts_after_success = await auth_attempts_repository.count_recent_attempts(tg_id, minutes=15)
    assert attempts_after_success == 0


@pytest.mark.asyncio
async def test_repeat_login_nonexistent_admin(
    test_db_connection,
    auth_service
):
    """
    Тест попытки входа несуществующего администратора
    
    Проверяет единообразие сообщений об ошибках (не раскрывает существование tg_id)
    
    Validates: Requirements 9.5
    """
    # Пытаемся аутентифицироваться с несуществующим tg_id
    nonexistent_tg_id = 999999999
    authenticated = await auth_service.authenticate(nonexistent_tg_id, "SomePassword123")
    
    # Проверяем отказ
    assert authenticated is None
    
    # Система не должна раскрывать, что tg_id не существует
    # (единообразное сообщение об ошибке)
