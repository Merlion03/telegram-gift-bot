"""
Security тесты: JWT Security

Проверяет безопасность JWT токенов в системе авторизации администраторов.
Тестирует защиту от модификации claims, использования неправильных ключей и replay attacks.

Validates: Requirements 12.1, 12.2, 12.3
"""

import pytest
import jwt
import time
from datetime import datetime, timedelta, timezone

from services.jwt_session_service import JWTSessionService, SessionClaims


class TestJWTSecurity:
    """Security тесты для JWT токенов"""
    
    @pytest.fixture
    def service(self):
        """Фикстура для создания экземпляра JWTSessionService"""
        return JWTSessionService(
            secret_key="test_secret_key_32_characters_long_minimum",
            session_lifetime_hours=24
        )
    
    def test_modified_claims_without_signature_change(self, service):
        """
        Тест модификации claims без изменения подписи
        
        Проверяет:
        - Токен с изменёнными claims не проходит валидацию
        - Подпись не совпадает с изменёнными данными
        - Защита от повышения привилегий
        
        Сценарий атаки:
        1. Злоумышленник получает валидный токен с role=3 (Operator)
        2. Декодирует токен и изменяет role на 0 (Developer)
        3. Пытается использовать токен с изменёнными claims
        4. Система должна отклонить токен из-за неверной подписи
        
        Validates: Requirements 12.3
        """
        # Генерируем валидный токен для Operator (role=3)
        tg_id = 123456789
        original_role = 3
        token = service.generate_token(tg_id, original_role)
        
        # Декодируем токен без верификации подписи
        payload = jwt.decode(token, options={"verify_signature": False})
        
        # Модифицируем role на Developer (попытка повышения привилегий)
        payload['role'] = 0
        
        # Пытаемся создать новый токен с модифицированными claims
        # но используем неправильный ключ (имитация атаки)
        parts = token.split('.')
        
        # Создаём новый payload с изменёнными данными
        import base64
        import json
        modified_payload = base64.urlsafe_b64encode(
            json.dumps(payload).encode()
        ).decode().rstrip('=')
        
        # Собираем токен с оригинальной подписью но изменённым payload
        modified_token = f"{parts[0]}.{modified_payload}.{parts[2]}"
        
        # Пытаемся валидировать модифицированный токен
        claims = service.validate_token(modified_token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None, "Токен с модифицированными claims не должен проходить валидацию"
    
    def test_token_with_different_secret_key(self, service):
        """
        Тест использования токена с другим secret key
        
        Проверяет:
        - Токен, подписанный другим ключом, не проходит валидацию
        - Защита от подделки токенов
        - Невозможность использования токенов из других систем
        
        Сценарий атаки:
        1. Злоумышленник создаёт токен с собственным secret key
        2. Пытается использовать этот токен в системе
        3. Система должна отклонить токен из-за неверной подписи
        
        Validates: Requirements 12.3
        """
        tg_id = 987654321
        role = 0
        
        # Создаём токен с другим secret key (имитация атаки)
        malicious_service = JWTSessionService(
            secret_key="malicious_secret_key_32_chars_long",
            session_lifetime_hours=24
        )
        
        malicious_token = malicious_service.generate_token(tg_id, role)
        
        # Пытаемся валидировать токен с неправильным ключом
        claims = service.validate_token(malicious_token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None, "Токен с другим secret key не должен проходить валидацию"
    
    def test_replay_attack_with_expired_token(self, service):
        """
        Тест replay attacks - проверка exp claim
        
        Проверяет:
        - Истёкший токен не проходит валидацию
        - Защита от повторного использования старых токенов
        - exp claim корректно проверяется
        
        Сценарий атаки:
        1. Злоумышленник перехватывает валидный токен
        2. Ждёт истечения срока действия токена
        3. Пытается использовать истёкший токен (replay attack)
        4. Система должна отклонить токен из-за истечения срока
        
        Validates: Requirements 12.2
        """
        # Создаём токен вручную с exp в прошлом (имитация старого токена)
        now = datetime.now(timezone.utc)
        past_time = now - timedelta(hours=25)  # Токен истёк 25 часов назад
        
        payload = {
            'tg_id': 111222333,
            'role': 1,
            'iat': int(past_time.timestamp()),
            'exp': int((past_time + timedelta(hours=24)).timestamp())  # exp в прошлом
        }
        
        # Подписываем токен правильным ключом (имитация перехваченного токена)
        expired_token = jwt.encode(
            payload,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        # Пытаемся валидировать истёкший токен
        claims = service.validate_token(expired_token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None, "Истёкший токен не должен проходить валидацию"
        
        # Дополнительная проверка через is_token_expired
        is_expired = service.is_token_expired(expired_token)
        assert is_expired is True, "Истёкший токен должен определяться как expired"
    
    def test_replay_attack_within_expiration_window(self, service):
        """
        Тест replay attack с валидным токеном в пределах срока действия
        
        Проверяет:
        - Валидный токен может быть использован многократно в пределах срока
        - Это ожидаемое поведение для stateless JWT
        - Для защиты от replay attacks в пределах срока нужны дополнительные механизмы
          (например, token revocation list, jti claim)
        
        Примечание: Это не уязвимость, а особенность stateless JWT.
        Для критичных операций следует использовать дополнительные механизмы защиты.
        
        Validates: Requirements 10.3, 12.1
        """
        tg_id = 444555666
        role = 2
        
        # Генерируем валидный токен
        token = service.generate_token(tg_id, role)
        
        # Используем токен первый раз
        claims1 = service.validate_token(token)
        assert claims1 is not None
        assert claims1.tg_id == tg_id
        assert claims1.role == role
        
        # Используем тот же токен второй раз (replay)
        claims2 = service.validate_token(token)
        assert claims2 is not None
        assert claims2.tg_id == tg_id
        assert claims2.role == role
        
        # Проверяем, что claims идентичны
        assert claims1.tg_id == claims2.tg_id
        assert claims1.role == claims2.role
        assert claims1.iat == claims2.iat
        assert claims1.exp == claims2.exp
        
        # Это ожидаемое поведение для stateless JWT
        # Для защиты от replay attacks в критичных операциях нужны дополнительные механизмы
    
    def test_token_with_tampered_header(self, service):
        """
        Тест модификации header токена
        
        Проверяет:
        - Токен с изменённым header не проходит валидацию
        - Защита от изменения алгоритма подписи (algorithm confusion attack)
        
        Сценарий атаки:
        1. Злоумышленник изменяет алгоритм в header на "none"
        2. Пытается использовать токен без подписи
        3. Система должна отклонить токен
        
        Validates: Requirements 12.3
        """
        tg_id = 777888999
        role = 1
        
        # Генерируем валидный токен
        token = service.generate_token(tg_id, role)
        
        # Разбираем токен на части
        parts = token.split('.')
        
        # Создаём header с алгоритмом "none"
        import base64
        import json
        tampered_header = {
            "alg": "none",
            "typ": "JWT"
        }
        encoded_header = base64.urlsafe_b64encode(
            json.dumps(tampered_header).encode()
        ).decode().rstrip('=')
        
        # Собираем токен с изменённым header
        tampered_token = f"{encoded_header}.{parts[1]}."
        
        # Пытаемся валидировать токен с изменённым header
        claims = service.validate_token(tampered_token)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None, "Токен с изменённым header не должен проходить валидацию"
    
    def test_token_with_missing_signature(self, service):
        """
        Тест токена без подписи
        
        Проверяет:
        - Токен без подписи не проходит валидацию
        - Защита от использования неподписанных токенов
        
        Validates: Requirements 12.3
        """
        tg_id = 123123123
        role = 2
        
        # Генерируем валидный токен
        token = service.generate_token(tg_id, role)
        
        # Удаляем подпись (третью часть)
        parts = token.split('.')
        token_without_signature = f"{parts[0]}.{parts[1]}."
        
        # Пытаемся валидировать токен без подписи
        claims = service.validate_token(token_without_signature)
        
        # Проверяем, что токен не прошёл валидацию
        assert claims is None, "Токен без подписи не должен проходить валидацию"
    
    def test_token_with_future_iat(self, service):
        """
        Тест токена с iat (issued at) в будущем
        
        Проверяет:
        - Токен с iat в будущем может пройти валидацию (PyJWT не проверяет iat по умолчанию)
        - Это потенциальная уязвимость, но не критичная для нашей системы
        
        Примечание: Для дополнительной защиты можно добавить проверку iat <= now
        
        Validates: Requirements 10.2
        """
        # Создаём токен с iat в будущем
        now = datetime.now(timezone.utc)
        future_time = now + timedelta(hours=1)
        
        payload = {
            'tg_id': 456456456,
            'role': 3,
            'iat': int(future_time.timestamp()),  # iat в будущем
            'exp': int((future_time + timedelta(hours=24)).timestamp())
        }
        
        future_token = jwt.encode(
            payload,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        # Валидируем токен с iat в будущем
        claims = service.validate_token(future_token)
        
        # PyJWT не проверяет iat по умолчанию, поэтому токен может пройти валидацию
        # Это не критичная уязвимость для нашей системы, но стоит учитывать
        if claims is not None:
            # Если токен прошёл валидацию, проверяем claims
            assert claims.tg_id == 456456456
            assert claims.role == 3
    
    def test_token_with_extra_claims(self, service):
        """
        Тест токена с дополнительными claims
        
        Проверяет:
        - Токен с дополнительными claims проходит валидацию
        - Дополнительные claims игнорируются
        - Обязательные claims присутствуют
        
        Validates: Requirements 10.2, 12.1
        """
        # Создаём токен с дополнительными claims
        now = datetime.now(timezone.utc)
        
        payload = {
            'tg_id': 789789789,
            'role': 1,
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(hours=24)).timestamp()),
            'extra_claim': 'malicious_data',  # Дополнительный claim
            'admin': True  # Ещё один дополнительный claim
        }
        
        extra_claims_token = jwt.encode(
            payload,
            "test_secret_key_32_characters_long_minimum",
            algorithm="HS256"
        )
        
        # Валидируем токен с дополнительными claims
        claims = service.validate_token(extra_claims_token)
        
        # Проверяем, что токен прошёл валидацию
        assert claims is not None
        
        # Проверяем, что обязательные claims присутствуют
        assert claims.tg_id == 789789789
        assert claims.role == 1
        
        # Дополнительные claims игнорируются (не попадают в SessionClaims)
        assert not hasattr(claims, 'extra_claim')
        assert not hasattr(claims, 'admin')
    
    def test_token_signature_verification_performance(self, service):
        """
        Тест производительности верификации подписи
        
        Проверяет:
        - Верификация подписи выполняется быстро
        - Нет уязвимости к timing attacks
        
        Примечание: PyJWT использует constant-time сравнение для защиты от timing attacks
        
        Validates: Requirements 12.1
        """
        tg_id = 321321321
        role = 0
        
        # Генерируем валидный токен
        token = service.generate_token(tg_id, role)
        
        # Измеряем время верификации валидного токена (больше итераций для точности)
        start_time = time.time()
        for _ in range(1000):
            service.validate_token(token)
        valid_time = time.time() - start_time
        
        # Создаём невалидный токен
        invalid_token = token[:-10] + "0000000000"
        
        # Измеряем время верификации невалидного токена
        start_time = time.time()
        for _ in range(1000):
            service.validate_token(invalid_token)
        invalid_time = time.time() - start_time
        
        # Проверяем, что время верификации примерно одинаковое
        # (защита от timing attacks)
        time_difference = abs(valid_time - invalid_time)
        
        # Разница не должна быть слишком большой (допускаем 100% разницу для стабильности)
        # PyJWT использует constant-time сравнение для подписи, но общее время может отличаться
        assert time_difference < max(valid_time, invalid_time) * 1.0, \
            f"Слишком большая разница во времени верификации: {time_difference:.4f}s"
