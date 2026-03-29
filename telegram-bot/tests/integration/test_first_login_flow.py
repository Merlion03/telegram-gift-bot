"""
End-to-End тест: Первый вход администратора

Проверяет полный сценарий первого входа администратора:
1. Создание администратора в БД с password_hash = NULL
2. Команда /start → проверка Reply Keyboard
3. Открытие WebApp → определение первого входа
4. Установка пароля → сохранение в БД
5. Генерация JWT → успешный доступ

Validates: Requirements 4.2, 6.1, 6.2, 7.1, 8.1, 8.2, 8.3, 10.1
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from aiogram.types import Message, User

from handlers.admin_start_handler import AdminStartHandler
from database.repositories.admin_repository import AdminRepository
from database.repositories.auth_attempts_repository import AuthAttemptsRepository
from services.auth_service import AuthService
from services.jwt_session_service import JWTSessionService
from services.password_hasher import PasswordHasher
from services.rate_limit_service import RateLimitService
from models.administrator import Administrator
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
async def test_first_login_complete_flow(
    test_db_connection,
    admin_repository,
    auth_service,
    jwt_session_service,
    mock_message
):
    """
    End-to-End тест полного сценария первого входа администратора
    
    Сценарий:
    1. Создаём администратора в БД с password_hash = NULL
    2. Симулируем команду /start → проверяем Reply Keyboard
    3. Симулируем открытие WebApp → проверяем определение первого входа
    4. Симулируем установку пароля → проверяем сохранение в БД
    5. Симулируем генерацию JWT → проверяем успешный доступ
    
    Validates: Requirements 4.2, 6.1, 6.2, 7.1, 8.1, 8.2, 8.3, 10.1
    """
    # ===== ШАГ 1: Создание администратора в БД =====
    test_tg_id = 123456789
    test_username = "test_admin"
    test_role = AdminRole.OPERATOR
    
    # Создаём администратора с password_hash = NULL
    created_admin = await admin_repository.create(
        tg_id=test_tg_id,
        username=test_username,
        role=test_role
    )
    
    # Проверяем, что администратор создан без пароля
    assert created_admin is not None
    assert created_admin.tg_id == test_tg_id
    assert created_admin.username == test_username
    assert created_admin.role == test_role
    assert created_admin.password_hash is None  # Первый вход
    assert created_admin.is_first_login() is True
    
    # ===== ШАГ 2: Симуляция команды /start =====
    # Создаём AdminStartHandler с mock session_manager
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
    
    # Проверяем наличие WebApp кнопки в клавиатуре
    assert 'reply_markup' in call_args.kwargs
    reply_markup = call_args.kwargs['reply_markup']
    assert reply_markup is not None
    
    # ===== ШАГ 3: Открытие WebApp и определение первого входа =====
    # Симулируем проверку первого входа через AuthService
    is_first_login = await auth_service.is_first_login(test_tg_id)
    
    # Проверяем, что система определила первый вход
    assert is_first_login is True
    
    # ===== ШАГ 4: Установка пароля =====
    test_password = "SecurePassword123"
    
    # Регистрируем пароль через AuthService
    registered_admin = await auth_service.register_password(test_tg_id, test_password)
    
    # Проверяем, что пароль был установлен
    assert registered_admin is not None
    assert registered_admin.tg_id == test_tg_id
    assert registered_admin.password_hash is not None
    assert registered_admin.password_hash.startswith("$argon2id$")
    
    # Проверяем, что пароль сохранён в БД
    admin_from_db = await admin_repository.get_by_tg_id(test_tg_id)
    assert admin_from_db is not None
    assert admin_from_db.password_hash is not None
    assert admin_from_db.password_hash == registered_admin.password_hash
    assert admin_from_db.is_first_login() is False
    
    # ===== ШАГ 5: Генерация JWT и проверка доступа =====
    # Генерируем JWT токен
    jwt_token = jwt_session_service.generate_token(
        tg_id=test_tg_id,
        role=test_role
    )
    
    # Проверяем, что токен сгенерирован
    assert jwt_token is not None
    assert isinstance(jwt_token, str)
    assert len(jwt_token) > 0
    
    # Валидируем токен
    session_claims = jwt_session_service.validate_token(jwt_token)
    
    # Проверяем claims
    assert session_claims is not None
    assert session_claims.tg_id == test_tg_id
    assert session_claims.role == test_role
    assert session_claims.exp > session_claims.iat
    
    # Проверяем, что токен не истёк
    is_expired = jwt_session_service.is_token_expired(jwt_token)
    assert is_expired is False
    
    # ===== ИТОГОВАЯ ПРОВЕРКА =====
    # Проверяем, что теперь можно аутентифицироваться с установленным паролем
    authenticated_admin = await auth_service.authenticate(test_tg_id, test_password)
    
    assert authenticated_admin is not None
    assert authenticated_admin.tg_id == test_tg_id
    assert authenticated_admin.role == test_role


@pytest.mark.asyncio
async def test_first_login_with_different_roles(
    test_db_connection,
    admin_repository,
    auth_service,
    jwt_session_service
):
    """
    Тест первого входа для администраторов с разными ролями
    
    Проверяет, что сценарий первого входа работает для всех ролей:
    - Developer (0)
    - Assistant (1)
    - Administrator (2)
    - Operator (3)
    
    Validates: Requirements 2.1, 2.2, 2.3, 2.4, 8.1, 8.2, 8.3
    """
    roles_to_test = [
        (AdminRole.DEVELOPER, "developer_user"),
        (AdminRole.ASSISTANT, "assistant_user"),
        (AdminRole.ADMINISTRATOR, "administrator_user"),
        (AdminRole.OPERATOR, "operator_user")
    ]
    
    for role, username in roles_to_test:
        # Генерируем уникальный tg_id для каждой роли
        tg_id = 100000000 + role
        
        # Создаём администратора
        admin = await admin_repository.create(
            tg_id=tg_id,
            username=username,
            role=role
        )
        
        # Проверяем первый вход
        assert admin.is_first_login() is True
        
        # Устанавливаем пароль
        password = f"Password{role}123"
        registered_admin = await auth_service.register_password(tg_id, password)
        
        # Проверяем установку пароля
        assert registered_admin.password_hash is not None
        assert registered_admin.is_first_login() is False
        
        # Генерируем JWT
        token = jwt_session_service.generate_token(tg_id=tg_id, role=role)
        
        # Валидируем JWT
        claims = jwt_session_service.validate_token(token)
        assert claims is not None
        assert claims.tg_id == tg_id
        assert claims.role == role
        
        # Аутентифицируемся с установленным паролем
        authenticated = await auth_service.authenticate(tg_id, password)
        assert authenticated is not None
        assert authenticated.tg_id == tg_id
        assert authenticated.role == role


@pytest.mark.asyncio
async def test_first_login_password_validation(
    test_db_connection,
    admin_repository,
    auth_service
):
    """
    Тест валидации пароля при первом входе
    
    Проверяет, что система отклоняет слабые пароли:
    - Пустой пароль
    - Короткий пароль (< 8 символов)
    
    Validates: Requirements 8.2
    """
    # Создаём администратора
    tg_id = 200000000
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_validation",
        role=AdminRole.OPERATOR
    )
    
    assert admin.is_first_login() is True
    
    # Тест 1: Пустой пароль
    with pytest.raises(ValueError, match="минимум 8 символов"):
        await auth_service.register_password(tg_id, "")
    
    # Тест 2: Короткий пароль
    with pytest.raises(ValueError, match="минимум 8 символов"):
        await auth_service.register_password(tg_id, "short")
    
    # Тест 3: Пароль ровно 8 символов (должен пройти)
    registered = await auth_service.register_password(tg_id, "12345678")
    assert registered.password_hash is not None
    
    # Проверяем, что пароль сохранён в БД
    admin_from_db = await admin_repository.get_by_tg_id(tg_id)
    assert admin_from_db.password_hash is not None
    assert admin_from_db.is_first_login() is False


@pytest.mark.asyncio
async def test_first_login_reject_repeat_registration(
    test_db_connection,
    admin_repository,
    auth_service
):
    """
    Тест отказа повторной регистрации пароля
    
    Проверяет, что после установки пароля нельзя установить его повторно
    
    Validates: Requirements 8.3
    """
    # Создаём администратора
    tg_id = 300000000
    admin = await admin_repository.create(
        tg_id=tg_id,
        username="test_repeat",
        role=AdminRole.OPERATOR
    )
    
    # Устанавливаем пароль первый раз
    password1 = "FirstPassword123"
    registered = await auth_service.register_password(tg_id, password1)
    assert registered.password_hash is not None
    
    # Пытаемся установить пароль повторно
    password2 = "SecondPassword456"
    with pytest.raises(ValueError, match="Пароль уже установлен"):
        await auth_service.register_password(tg_id, password2)
    
    # Проверяем, что пароль не изменился
    admin_from_db = await admin_repository.get_by_tg_id(tg_id)
    assert admin_from_db.password_hash == registered.password_hash
    
    # Проверяем, что можем войти с первым паролем
    authenticated = await auth_service.authenticate(tg_id, password1)
    assert authenticated is not None
    
    # Проверяем, что не можем войти со вторым паролем
    authenticated_wrong = await auth_service.authenticate(tg_id, password2)
    assert authenticated_wrong is None
