"""
Unit-тесты для AuthService

Validates: Requirements 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 12.4, 12.5
"""

import pytest
from unittest.mock import AsyncMock, Mock
from services.auth_service import AuthService
from models.administrator import Administrator
from services.rate_limit_service import RateLimitResult
from datetime import datetime


@pytest.fixture
def mock_admin_repo():
    """Мок репозитория администраторов"""
    return AsyncMock()


@pytest.fixture
def mock_rate_limiter():
    """Мок сервиса rate limiting"""
    return AsyncMock()


@pytest.fixture
def mock_password_hasher():
    """Мок сервиса хеширования паролей"""
    hasher = Mock()
    hasher.hash_password = Mock(return_value="$argon2id$v=19$m=65536,t=2,p=4$hashed")
    hasher.verify_password = Mock(return_value=True)
    return hasher


@pytest.fixture
def auth_service(mock_admin_repo, mock_rate_limiter, mock_password_hasher):
    """Фикстура AuthService с моками"""
    return AuthService(
        admin_repository=mock_admin_repo,
        rate_limit_service=mock_rate_limiter,
        password_hasher=mock_password_hasher
    )


class TestRegisterPassword:
    """Тесты регистрации пароля"""
    
    @pytest.mark.asyncio
    async def test_successful_password_registration(
        self, auth_service, mock_admin_repo, mock_password_hasher
    ):
        """
        Тест успешной регистрации пароля
        
        Validates: Requirements 8.1, 8.2, 8.3, 8.4
        """
        # Arrange: создаём администратора без пароля
        admin_without_password = Administrator(
            tg_id=123456789,
            username="test_user",
            role=3,
            password_hash=None,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        admin_with_password = Administrator(
            tg_id=123456789,
            username="test_user",
            role=3,
            password_hash="$argon2id$v=19$m=65536,t=2,p=4$hashed",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # Настраиваем моки
        mock_admin_repo.get_by_tg_id.side_effect = [
            admin_without_password,  # Первый вызов - до установки пароля
            admin_with_password      # Второй вызов - после установки пароля
        ]
        mock_admin_repo.update_password = AsyncMock()
        
        # Act: регистрируем пароль
        result = await auth_service.register_password(123456789, "SecurePassword123")
        
        # Assert: проверяем результат
        assert result is not None
        assert result.tg_id == 123456789
        assert result.password_hash is not None
        
        # Проверяем, что пароль был захеширован
        mock_password_hasher.hash_password.assert_called_once_with("SecurePassword123")
        
        # Проверяем, что password_hash был обновлён в БД
        mock_admin_repo.update_password.assert_called_once_with(
            123456789,
            "$argon2id$v=19$m=65536,t=2,p=4$hashed"
        )
    
    @pytest.mark.asyncio
    async def test_reject_repeat_password_registration(
        self, auth_service, mock_admin_repo
    ):
        """
        Тест отказа повторной регистрации пароля
        
        Validates: Requirements 8.3
        """
        # Arrange: администратор с уже установленным паролем
        admin_with_password = Administrator(
            tg_id=123456789,
            username="test_user",
            role=3,
            password_hash="$argon2id$v=19$m=65536,t=2,p=4$existing_hash",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        mock_admin_repo.get_by_tg_id.return_value = admin_with_password
        
        # Act & Assert: попытка повторной регистрации должна вызвать ошибку
        with pytest.raises(ValueError, match="Пароль уже установлен"):
            await auth_service.register_password(123456789, "NewPassword123")
    
    @pytest.mark.asyncio
    async def test_reject_short_password(self, auth_service):
        """
        Тест отказа регистрации короткого пароля
        
        Validates: Requirements 8.2
        """
        # Act & Assert: пароль короче 8 символов должен быть отклонён
        with pytest.raises(ValueError, match="минимум 8 символов"):
            await auth_service.register_password(123456789, "short")
    
    @pytest.mark.asyncio
    async def test_reject_empty_password(self, auth_service):
        """
        Тест отказа регистрации пустого пароля
        
        Validates: Requirements 8.2
        """
        # Act & Assert: пустой пароль должен быть отклонён
        with pytest.raises(ValueError, match="минимум 8 символов"):
            await auth_service.register_password(123456789, "")
    
    @pytest.mark.asyncio
    async def test_reject_nonexistent_admin(self, auth_service, mock_admin_repo):
        """
        Тест отказа регистрации для несуществующего администратора
        
        Validates: Requirements 8.1, 9.5
        """
        # Arrange: администратор не найден
        mock_admin_repo.get_by_tg_id.return_value = None
        
        # Act & Assert: должна быть ошибка с единообразным сообщением
        with pytest.raises(ValueError, match="Ошибка регистрации пароля"):
            await auth_service.register_password(123456789, "SecurePassword123")


class TestAuthenticate:
    """Тесты аутентификации"""
    
    @pytest.mark.asyncio
    async def test_successful_authentication(
        self, auth_service, mock_admin_repo, mock_rate_limiter, mock_password_hasher
    ):
        """
        Тест успешной аутентификации с правильным паролем
        
        Validates: Requirements 9.1, 9.2, 9.3
        """
        # Arrange: администратор с установленным паролем
        admin = Administrator(
            tg_id=123456789,
            username="test_user",
            role=2,
            password_hash="$argon2id$v=19$m=65536,t=2,p=4$hashed",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # Настраиваем моки
        mock_rate_limiter.check_rate_limit.return_value = RateLimitResult(
            allowed=True,
            attempts_count=0,
            blocked_until=None
        )
        mock_admin_repo.get_by_tg_id.return_value = admin
        mock_password_hasher.verify_password.return_value = True
        mock_rate_limiter.clear_attempts = AsyncMock()
        
        # Act: аутентифицируемся
        result = await auth_service.authenticate(123456789, "CorrectPassword")
        
        # Assert: проверяем успешную аутентификацию
        assert result is not None
        assert result.tg_id == 123456789
        assert result.role == 2
        
        # Проверяем, что пароль был верифицирован
        mock_password_hasher.verify_password.assert_called_once_with(
            "$argon2id$v=19$m=65536,t=2,p=4$hashed",
            "CorrectPassword"
        )
        
        # Проверяем, что попытки были очищены после успеха
        mock_rate_limiter.clear_attempts.assert_called_once_with(123456789)
    
    @pytest.mark.asyncio
    async def test_reject_wrong_password(
        self, auth_service, mock_admin_repo, mock_rate_limiter, mock_password_hasher
    ):
        """
        Тест отказа аутентификации с неправильным паролем
        
        Validates: Requirements 9.2, 9.4
        """
        # Arrange
        admin = Administrator(
            tg_id=123456789,
            username="test_user",
            role=2,
            password_hash="$argon2id$v=19$m=65536,t=2,p=4$hashed",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        mock_rate_limiter.check_rate_limit.return_value = RateLimitResult(
            allowed=True,
            attempts_count=2,
            blocked_until=None
        )
        mock_admin_repo.get_by_tg_id.return_value = admin
        mock_password_hasher.verify_password.return_value = False  # Неправильный пароль
        mock_rate_limiter.record_failed_attempt = AsyncMock()
        
        # Act: пытаемся аутентифицироваться с неправильным паролем
        result = await auth_service.authenticate(123456789, "WrongPassword")
        
        # Assert: аутентификация должна провалиться
        assert result is None
        
        # Проверяем, что неудачная попытка была записана
        mock_rate_limiter.record_failed_attempt.assert_called_once_with(123456789)
    
    @pytest.mark.asyncio
    async def test_uniform_error_messages_nonexistent_admin(
        self, auth_service, mock_admin_repo, mock_rate_limiter
    ):
        """
        Тест единообразия сообщений об ошибках для несуществующего администратора
        
        Validates: Requirements 9.5
        """
        # Arrange: администратор не найден
        mock_rate_limiter.check_rate_limit.return_value = RateLimitResult(
            allowed=True,
            attempts_count=0,
            blocked_until=None
        )
        mock_admin_repo.get_by_tg_id.return_value = None
        mock_rate_limiter.record_failed_attempt = AsyncMock()
        
        # Act: пытаемся аутентифицироваться
        result = await auth_service.authenticate(999999999, "SomePassword")
        
        # Assert: должен вернуть None (не раскрывая существование tg_id)
        assert result is None
        
        # Проверяем, что попытка была записана
        mock_rate_limiter.record_failed_attempt.assert_called_once_with(999999999)
    
    @pytest.mark.asyncio
    async def test_check_rate_limit_before_authentication(
        self, auth_service, mock_rate_limiter
    ):
        """
        Тест проверки rate limit перед аутентификацией
        
        Validates: Requirements 12.4, 12.5
        """
        # Arrange: rate limit превышен
        mock_rate_limiter.check_rate_limit.return_value = RateLimitResult(
            allowed=False,
            attempts_count=5,
            blocked_until=datetime.now()
        )
        
        # Act: пытаемся аутентифицироваться
        result = await auth_service.authenticate(123456789, "SomePassword")
        
        # Assert: аутентификация должна быть заблокирована
        assert result is None
        
        # Проверяем, что rate limit был проверен первым
        mock_rate_limiter.check_rate_limit.assert_called_once_with(123456789)
    
    @pytest.mark.asyncio
    async def test_reject_first_login_admin_without_password(
        self, auth_service, mock_admin_repo, mock_rate_limiter
    ):
        """
        Тест отказа аутентификации для администратора без пароля
        
        Validates: Requirements 8.1, 9.4
        """
        # Arrange: администратор без пароля (первый вход)
        admin_without_password = Administrator(
            tg_id=123456789,
            username="test_user",
            role=3,
            password_hash=None,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        mock_rate_limiter.check_rate_limit.return_value = RateLimitResult(
            allowed=True,
            attempts_count=0,
            blocked_until=None
        )
        mock_admin_repo.get_by_tg_id.return_value = admin_without_password
        mock_rate_limiter.record_failed_attempt = AsyncMock()
        
        # Act: пытаемся аутентифицироваться
        result = await auth_service.authenticate(123456789, "SomePassword")
        
        # Assert: аутентификация должна провалиться
        assert result is None
        
        # Проверяем, что попытка была записана
        mock_rate_limiter.record_failed_attempt.assert_called_once_with(123456789)


class TestIsFirstLogin:
    """Тесты проверки первого входа"""
    
    @pytest.mark.asyncio
    async def test_first_login_detection(self, auth_service, mock_admin_repo):
        """
        Тест определения первого входа (password_hash IS NULL)
        
        Validates: Requirements 8.1
        """
        # Arrange: администратор без пароля
        admin_without_password = Administrator(
            tg_id=123456789,
            username="test_user",
            role=3,
            password_hash=None,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        mock_admin_repo.get_by_tg_id.return_value = admin_without_password
        
        # Act
        is_first = await auth_service.is_first_login(123456789)
        
        # Assert: должен определить первый вход
        assert is_first is True
    
    @pytest.mark.asyncio
    async def test_not_first_login_detection(self, auth_service, mock_admin_repo):
        """
        Тест определения повторного входа (password_hash NOT NULL)
        
        Validates: Requirements 8.1
        """
        # Arrange: администратор с паролем
        admin_with_password = Administrator(
            tg_id=123456789,
            username="test_user",
            role=3,
            password_hash="$argon2id$v=19$m=65536,t=2,p=4$hashed",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        mock_admin_repo.get_by_tg_id.return_value = admin_with_password
        
        # Act
        is_first = await auth_service.is_first_login(123456789)
        
        # Assert: не должен определить первый вход
        assert is_first is False
    
    @pytest.mark.asyncio
    async def test_nonexistent_admin_not_first_login(
        self, auth_service, mock_admin_repo
    ):
        """
        Тест для несуществующего администратора
        
        Validates: Requirements 8.1
        """
        # Arrange: администратор не найден
        mock_admin_repo.get_by_tg_id.return_value = None
        
        # Act
        is_first = await auth_service.is_first_login(999999999)
        
        # Assert: должен вернуть False
        assert is_first is False
