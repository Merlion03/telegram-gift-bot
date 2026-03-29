"""
Unit-тесты для JWTSessionService

Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3
"""

import pytest
import jwt
import time
from datetime import datetime, timedelta, timezone
from services.jwt_session_service import JWTSessionService, SessionClaims


class TestJWTSessionService:
    """Тесты для сервиса JWT сессий"""
    
    @pytest.fixture
    def service(self):
        """Фикстура для создания экземпляра JWTSessionService"""
        return JWTSessionService(
            secret_key="test_secret_key_32_characters_long_minimum",
            session_lifetime_hours=24
        )
    
    def test_generate_token_success(self, service):
        """
        Тест генерации JWT токена
        
        Проверяет:
        - Токен генерируется успешно
        - Токен является строкой
        - Токен не пустой
        - Токен содержит три части (header.payload.signature)
        
        Validates: Requirements 10.1, 10.2
        """
        tg_id = 123456789
        role = 0
        
        # Генерируем токен
        token = service.generate_token(tg_id, role)
        
        # Проверяем, что токен сгенерирован
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Проверяем формат JWT (три части разделённые точками)
        parts = token.split('.')
        assert len(parts) == 3
    
    def test_validate_token_valid(self, service):
        """
        Тест валидации валидного токена
        
        Проверяет:
        - Валидный токен успешно валидируется
        - Claims содержат правильные значения
        - tg_id и role совпадают с исходными
        
        Validates: Requirements 10.3, 10.4, 12.1
        """
        tg_id = 987654321
        role = 2
        
        # Генерируем токен
        token = service.generate_token(tg_id, role)
        
        # Валидируем токен
        claims = service.validate_token(token)
        
        # Проверяем, что claims получены
        assert claims is not None
        assert isinstance(claims, SessionClaims)
        
        # Проверяем значения claims
        assert claims.tg_id == tg_id
        assert claims.role == role
        assert claims.iat > 0
        assert claims.exp > claims.iat
        
        # Проверяем, что exp = iat + 24 часа (в секундах)
        expected_exp = claims.iat + (24 * 3600)
        assert claims.exp == expected_exp
    
    def test_validate_token_expired(self, service):
        """
        Тест отказа валидации истёкшего токена
        
        Проверяет:
        - Истёкший токен возвращает None
        - Токен с exp в прошлом не проходит валидацию
        
        Validates: Requirements 10.4, 12.2
        """
        # Создаём токен вручную с exp в прошлом
        now = datetime.now(timezone.utc)
        past_time = now - timedelta(hours=1)
        
        payload = {
            'tg_id': 123456789,
            'role': 1,
            'iat': int(past_time.timestamp()),
            'exp': int(past_time.timestamp())  # exp в прошлом
        }
        
        expired_token = jwt.encode(
            payload,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        # Валидируем истёкший токен
        claims = service.validate_token(expired_token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None
    
    def test_validate_token_invalid_signature(self, service):
        """
        Тест отказа валидации токена с неправильной подписью
        
        Проверяет:
        - Токен с неправильной подписью возвращает None
        - Защита от подделки токенов
        
        Validates: Requirements 12.3
        """
        tg_id = 111222333
        role = 3
        
        # Генерируем токен с одним ключом
        token = service.generate_token(tg_id, role)
        
        # Создаём другой сервис с другим ключом
        other_service = JWTSessionService(
            secret_key="different_secret_key_32_chars_long",
            session_lifetime_hours=24
        )
        
        # Пытаемся валидировать токен с неправильным ключом
        claims = other_service.validate_token(token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None
    
    def test_validate_token_modified_claims(self, service):
        """
        Тест отказа валидации токена с модифицированными claims
        
        Проверяет:
        - Токен с изменёнными claims не проходит валидацию
        - Защита от модификации токенов
        
        Validates: Requirements 12.3
        """
        tg_id = 444555666
        role = 1
        
        # Генерируем валидный токен
        token = service.generate_token(tg_id, role)
        
        # Декодируем токен без верификации
        payload = jwt.decode(
            token,
            options={"verify_signature": False}
        )
        
        # Модифицируем role в payload
        payload['role'] = 0  # Пытаемся повысить права
        
        # Создаём новый токен с модифицированными claims но старой подписью
        # (просто изменяем payload часть)
        modified_token = jwt.encode(
            payload,
            "wrong_key",  # Используем неправильный ключ
            algorithm="HS256"
        )
        
        # Пытаемся валидировать модифицированный токен
        claims = service.validate_token(modified_token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None
    
    def test_is_token_expired_fresh_token(self, service):
        """
        Тест проверки истечения свежего токена
        
        Проверяет:
        - Свежий токен не считается истёкшим
        
        Validates: Requirements 10.4
        """
        tg_id = 777888999
        role = 2
        
        # Генерируем свежий токен
        token = service.generate_token(tg_id, role)
        
        # Проверяем, что токен не истёк
        is_expired = service.is_token_expired(token)
        
        assert is_expired is False
    
    def test_is_token_expired_expired_token(self, service):
        """
        Тест проверки истечения истёкшего токена
        
        Проверяет:
        - Истёкший токен определяется как истёкший
        
        Validates: Requirements 10.4, 12.2
        """
        # Создаём токен вручную с exp в прошлом
        now = datetime.now(timezone.utc)
        past_time = now - timedelta(hours=2)
        
        payload = {
            'tg_id': 123456789,
            'role': 1,
            'iat': int(past_time.timestamp()),
            'exp': int(past_time.timestamp())
        }
        
        expired_token = jwt.encode(
            payload,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        # Проверяем, что токен истёк
        is_expired = service.is_token_expired(expired_token)
        
        assert is_expired is True
    
    def test_validate_token_missing_required_fields(self, service):
        """
        Тест валидации токена без обязательных полей
        
        Проверяет:
        - Токен без tg_id не проходит валидацию
        - Токен без role не проходит валидацию
        
        Validates: Requirements 10.2, 12.1
        """
        now = datetime.now(timezone.utc)
        
        # Токен без tg_id
        payload_no_tg_id = {
            'role': 1,
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(hours=24)).timestamp())
        }
        
        token_no_tg_id = jwt.encode(
            payload_no_tg_id,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        claims = service.validate_token(token_no_tg_id)
        assert claims is None
        
        # Токен без role
        payload_no_role = {
            'tg_id': 123456789,
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(hours=24)).timestamp())
        }
        
        token_no_role = jwt.encode(
            payload_no_role,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        claims = service.validate_token(token_no_role)
        assert claims is None
    
    def test_generate_token_invalid_tg_id(self, service):
        """
        Тест генерации токена с невалидным tg_id
        
        Проверяет:
        - tg_id <= 0 вызывает ValueError
        
        Validates: Requirements 10.1
        """
        with pytest.raises(ValueError, match="tg_id должен быть положительным числом"):
            service.generate_token(0, 1)
        
        with pytest.raises(ValueError, match="tg_id должен быть положительным числом"):
            service.generate_token(-123, 1)
    
    def test_generate_token_invalid_role(self, service):
        """
        Тест генерации токена с невалидной ролью
        
        Проверяет:
        - role < 0 или role > 3 вызывает ValueError
        
        Validates: Requirements 10.1
        """
        tg_id = 123456789
        
        # role < 0
        with pytest.raises(ValueError, match="role должен быть в диапазоне 0-3"):
            service.generate_token(tg_id, -1)
        
        # role > 3
        with pytest.raises(ValueError, match="role должен быть в диапазоне 0-3"):
            service.generate_token(tg_id, 4)
    
    def test_session_lifetime_configuration(self):
        """
        Тест конфигурации времени жизни сессии
        
        Проверяет:
        - Токен использует настроенное время жизни
        - exp = iat + session_lifetime_hours * 3600
        
        Validates: Requirements 10.5, 11.4
        """
        # Создаём сервис с кастомным временем жизни
        custom_lifetime = 48  # 48 часов
        service = JWTSessionService(
            secret_key="test_secret_key_32_characters_long_minimum",
            session_lifetime_hours=custom_lifetime
        )
        
        # Генерируем токен
        token = service.generate_token(123456789, 1)
        
        # Валидируем и проверяем claims
        claims = service.validate_token(token)
        
        assert claims is not None
        
        # Проверяем, что exp = iat + 48 часов
        expected_exp = claims.iat + (custom_lifetime * 3600)
        assert claims.exp == expected_exp
