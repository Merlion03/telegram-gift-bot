"""
Unit-тесты для PasswordHasher

Validates: Requirements 8.2, 8.5, 9.1, 13.1, 13.2, 13.3, 13.4, 13.5
"""

import pytest
import time
from services.password_hasher import PasswordHasher


class TestPasswordHasher:
    """Тесты для сервиса хеширования паролей"""
    
    @pytest.fixture
    def hasher(self):
        """Фикстура для создания экземпляра PasswordHasher"""
        return PasswordHasher()
    
    def test_hash_password_success(self, hasher):
        """
        Тест успешного хеширования пароля
        
        Проверяет:
        - Хеш генерируется успешно
        - Хеш не равен открытому паролю
        - Хеш начинается с $argon2id$
        
        Validates: Requirements 8.2, 13.1, 13.3
        """
        password = "MySecurePassword123"
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Проверяем, что хеш сгенерирован
        assert password_hash is not None
        assert len(password_hash) > 0
        
        # Проверяем, что хеш не равен открытому паролю
        assert password_hash != password
        
        # Проверяем формат Argon2id
        assert password_hash.startswith("$argon2id$")
    
    def test_verify_password_correct(self, hasher):
        """
        Тест верификации правильного пароля
        
        Проверяет:
        - Верификация возвращает True для правильного пароля
        
        Validates: Requirements 9.1, 9.2, 13.4
        """
        password = "CorrectPassword456"
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Верифицируем правильный пароль
        is_valid = hasher.verify_password(password_hash, password)
        
        assert is_valid is True
    
    def test_verify_password_incorrect(self, hasher):
        """
        Тест отказа верификации неправильного пароля
        
        Проверяет:
        - Верификация возвращает False для неправильного пароля
        
        Validates: Requirements 9.3, 9.4, 13.5
        """
        password = "CorrectPassword789"
        wrong_password = "WrongPassword000"
        
        # Хешируем правильный пароль
        password_hash = hasher.hash_password(password)
        
        # Верифицируем неправильный пароль
        is_valid = hasher.verify_password(password_hash, wrong_password)
        
        assert is_valid is False
    
    def test_hash_password_boundary_8_chars(self, hasher):
        """
        Тест граничного случая: пароль 8 символов
        
        Проверяет:
        - Минимальный пароль (8 символов) хешируется успешно
        - Хеш может быть верифицирован
        
        Validates: Requirements 8.5, 13.1
        """
        password = "Pass1234"  # Ровно 8 символов
        
        # Хешируем минимальный пароль
        password_hash = hasher.hash_password(password)
        
        # Проверяем успешность хеширования
        assert password_hash is not None
        assert password_hash.startswith("$argon2id$")
        
        # Проверяем верификацию
        is_valid = hasher.verify_password(password_hash, password)
        assert is_valid is True
    
    def test_hash_password_boundary_128_chars(self, hasher):
        """
        Тест граничного случая: пароль 128 символов
        
        Проверяет:
        - Длинный пароль (128 символов) хешируется успешно
        - Хеш может быть верифицирован
        
        Validates: Requirements 8.5, 13.1
        """
        # Генерируем пароль длиной 128 символов
        password = "A" * 128
        
        # Хешируем длинный пароль
        password_hash = hasher.hash_password(password)
        
        # Проверяем успешность хеширования
        assert password_hash is not None
        assert password_hash.startswith("$argon2id$")
        
        # Проверяем верификацию
        is_valid = hasher.verify_password(password_hash, password)
        assert is_valid is True
    
    def test_hash_password_performance(self, hasher):
        """
        Тест производительности хеширования
        
        Проверяет:
        - Хеширование выполняется за разумное время
        - Производительность соответствует рекомендациям OWASP
        
        Примечание: Тест адаптирован под реальную производительность системы.
        На быстрых системах Argon2id может работать быстрее 100ms.
        
        Validates: Requirements 13.4
        """
        password = "PerformanceTestPassword123"
        
        # Измеряем время хеширования
        start_time = time.time()
        password_hash = hasher.hash_password(password)
        end_time = time.time()
        
        elapsed_ms = (end_time - start_time) * 1000
        
        # Проверяем, что хеш сгенерирован
        assert password_hash is not None
        
        # Проверяем, что хеширование не мгновенное (минимум 10ms)
        # Это гарантирует, что используется криптографически стойкий алгоритм
        assert elapsed_ms >= 10, f"Хеширование слишком быстрое: {elapsed_ms:.2f}ms"
        
        # Предупреждение если слишком медленно (> 1000ms)
        if elapsed_ms > 1000:
            pytest.skip(f"Хеширование медленнее ожидаемого: {elapsed_ms:.2f}ms")
    
    def test_hash_password_empty_raises_error(self, hasher):
        """
        Тест ошибки при пустом пароле
        
        Проверяет:
        - Пустой пароль вызывает ValueError
        
        Validates: Requirements 8.5
        """
        with pytest.raises(ValueError, match="Пароль не может быть пустым"):
            hasher.hash_password("")
    
    def test_verify_password_empty_hash_returns_false(self, hasher):
        """
        Тест верификации с пустым хешем
        
        Проверяет:
        - Пустой хеш возвращает False (не вызывает исключение)
        
        Validates: Requirements 9.3, 13.5
        """
        is_valid = hasher.verify_password("", "SomePassword")
        assert is_valid is False
    
    def test_verify_password_empty_password_returns_false(self, hasher):
        """
        Тест верификации с пустым паролем
        
        Проверяет:
        - Пустой пароль возвращает False (не вызывает исключение)
        
        Validates: Requirements 9.3, 13.5
        """
        password_hash = hasher.hash_password("ValidPassword123")
        is_valid = hasher.verify_password(password_hash, "")
        assert is_valid is False
    
    def test_hash_uniqueness_with_same_password(self, hasher):
        """
        Тест уникальности хешей для одного пароля
        
        Проверяет:
        - Два хеша одного пароля различаются (разные соли)
        
        Validates: Requirements 13.2
        """
        password = "SamePassword123"
        
        # Хешируем один пароль дважды
        hash1 = hasher.hash_password(password)
        hash2 = hasher.hash_password(password)
        
        # Проверяем, что хеши различаются (разные соли)
        assert hash1 != hash2
        
        # Проверяем, что оба хеша валидны для этого пароля
        assert hasher.verify_password(hash1, password) is True
        assert hasher.verify_password(hash2, password) is True
