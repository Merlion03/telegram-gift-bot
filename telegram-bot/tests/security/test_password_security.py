"""
Security тесты: Password Security

Проверяет безопасность хранения и обработки паролей в системе авторизации администраторов.
Тестирует отсутствие логирования паролей, минимальную сложность хеширования и уникальность солей.

Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5
"""

import pytest
import re
import logging
from io import StringIO
from unittest.mock import patch, MagicMock

from services.password_hasher import PasswordHasher
from services.auth_service import AuthService
from database.repositories.admin_repository import AdminRepository
from database.repositories.auth_attempts_repository import AuthAttemptsRepository
from services.rate_limit_service import RateLimitService


class TestPasswordSecurity:
    """Security тесты для безопасности паролей"""
    
    @pytest.fixture
    async def test_db_connection(self):
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
    def hasher(self):
        """Фикстура для создания экземпляра PasswordHasher"""
        return PasswordHasher()
    
    @pytest.fixture
    async def auth_service(self, test_db_connection):
        """Фикстура для создания экземпляра AuthService"""
        admin_repo = AdminRepository()
        auth_attempts_repo = AuthAttemptsRepository()
        rate_limit_service = RateLimitService(auth_attempts_repo)
        hasher = PasswordHasher()
        
        return AuthService(admin_repo, rate_limit_service, hasher)
    
    def test_passwords_not_logged_in_hash_operation(self, hasher):
        """
        Тест, что пароли не логируются при хешировании
        
        Проверяет:
        - Открытый пароль не попадает в логи
        - Хеш пароля может логироваться (это безопасно)
        - Защита от утечки паролей через логи
        
        Validates: Requirements 13.4
        """
        password = "SuperSecretPassword123"
        
        # Создаём буфер для перехвата логов
        log_buffer = StringIO()
        handler = logging.StreamHandler(log_buffer)
        handler.setLevel(logging.DEBUG)
        
        # Получаем logger для password_hasher
        logger = logging.getLogger('services.password_hasher')
        original_level = logger.level
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        
        try:
            # Хешируем пароль
            password_hash = hasher.hash_password(password)
            
            # Получаем содержимое логов
            log_contents = log_buffer.getvalue()
            
            # Проверяем, что открытый пароль НЕ попал в логи
            assert password not in log_contents, \
                "Открытый пароль не должен попадать в логи"
            
            # Хеш может быть в логах (это безопасно)
            # Но открытый пароль - никогда
            
        finally:
            # Восстанавливаем оригинальные настройки логгера
            logger.removeHandler(handler)
            logger.setLevel(original_level)
            log_buffer.close()
    
    def test_passwords_not_logged_in_verify_operation(self, hasher):
        """
        Тест, что пароли не логируются при верификации
        
        Проверяет:
        - Открытый пароль не попадает в логи при верификации
        - Защита от утечки паролей через логи
        
        Validates: Requirements 13.4
        """
        password = "AnotherSecretPassword456"
        password_hash = hasher.hash_password(password)
        
        # Создаём буфер для перехвата логов
        log_buffer = StringIO()
        handler = logging.StreamHandler(log_buffer)
        handler.setLevel(logging.DEBUG)
        
        # Получаем logger для password_hasher
        logger = logging.getLogger('services.password_hasher')
        original_level = logger.level
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        
        try:
            # Верифицируем пароль
            is_valid = hasher.verify_password(password_hash, password)
            
            # Получаем содержимое логов
            log_contents = log_buffer.getvalue()
            
            # Проверяем, что открытый пароль НЕ попал в логи
            assert password not in log_contents, \
                "Открытый пароль не должен попадать в логи при верификации"
            
        finally:
            # Восстанавливаем оригинальные настройки логгера
            logger.removeHandler(handler)
            logger.setLevel(original_level)
            log_buffer.close()
    
    @pytest.mark.asyncio
    async def test_passwords_not_logged_in_auth_service(self, auth_service):
        """
        Тест, что пароли не логируются в AuthService
        
        Проверяет:
        - Пароли не попадают в логи при регистрации
        - Пароли не попадают в логи при аутентификации
        - Защита от утечки паролей на уровне сервиса
        
        Validates: Requirements 13.4
        """
        password = "ServiceTestPassword789"
        tg_id = 999888777
        
        # Создаём буфер для перехвата логов
        log_buffer = StringIO()
        handler = logging.StreamHandler(log_buffer)
        handler.setLevel(logging.DEBUG)
        
        # Получаем logger для auth_service
        logger = logging.getLogger('services.auth_service')
        original_level = logger.level
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        
        try:
            # Создаём тестового администратора
            from database.asyncpg_connection import get_asyncpg_pool
            pool = get_asyncpg_pool().get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO administrators (tg_id, username, role, password_hash, created_at, updated_at)
                    VALUES ($1, $2, $3, NULL, NOW(), NOW())
                    ON CONFLICT (tg_id) DO NOTHING
                    """,
                    tg_id, "test_user", 3
                )
            
            # Регистрируем пароль
            await auth_service.register_password(tg_id, password)
            
            # Аутентифицируемся
            await auth_service.authenticate(tg_id, password)
            
            # Получаем содержимое логов
            log_contents = log_buffer.getvalue()
            
            # Проверяем, что открытый пароль НЕ попал в логи
            assert password not in log_contents, \
                "Открытый пароль не должен попадать в логи AuthService"
            
        finally:
            # Очистка: удаляем тестового администратора
            try:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "DELETE FROM administrators WHERE tg_id = $1",
                        tg_id
                    )
                    await conn.execute(
                        "DELETE FROM auth_attempts WHERE tg_id = $1",
                        tg_id
                    )
            except:
                pass
            
            # Восстанавливаем оригинальные настройки логгера
            logger.removeHandler(handler)
            logger.setLevel(original_level)
            log_buffer.close()
    
    def test_minimum_hashing_cost_factor(self, hasher):
        """
        Тест минимальной сложности хеширования (cost factor)
        
        Проверяет:
        - Argon2id использует достаточные параметры сложности
        - time_cost >= 2 (минимум 2 итерации)
        - memory_cost >= 65536 KB (минимум 64 MB)
        - parallelism >= 4 (минимум 4 потока)
        - Соответствие рекомендациям OWASP
        
        Validates: Requirements 13.5
        """
        password = "TestPasswordForCostFactor"
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Проверяем формат Argon2id
        assert password_hash.startswith("$argon2id$"), \
            "Хеш должен использовать Argon2id"
        
        # Парсим параметры из хеша
        # Формат: $argon2id$v=19$m=65536,t=2,p=4$<salt>$<hash>
        match = re.match(
            r'\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$',
            password_hash
        )
        
        assert match is not None, "Не удалось распарсить параметры хеша"
        
        memory_cost = int(match.group(1))
        time_cost = int(match.group(2))
        parallelism = int(match.group(3))
        
        # Проверяем минимальные значения параметров
        assert time_cost >= 2, \
            f"time_cost должен быть >= 2, получено: {time_cost}"
        
        assert memory_cost >= 65536, \
            f"memory_cost должен быть >= 65536 KB (64 MB), получено: {memory_cost}"
        
        assert parallelism >= 4, \
            f"parallelism должен быть >= 4, получено: {parallelism}"
    
    def test_salt_uniqueness_multiple_passwords(self, hasher):
        """
        Тест уникальности солей для разных паролей
        
        Проверяет:
        - Каждый хеш использует уникальную соль
        - Соли генерируются случайно
        - Защита от rainbow table атак
        
        Validates: Requirements 13.2
        """
        passwords = [
            "Password1",
            "Password2",
            "Password3",
            "Password4",
            "Password5"
        ]
        
        hashes = []
        salts = []
        
        for password in passwords:
            # Хешируем пароль
            password_hash = hasher.hash_password(password)
            hashes.append(password_hash)
            
            # Извлекаем соль из хеша
            # Формат: $argon2id$v=19$m=65536,t=2,p=4$<salt>$<hash>
            parts = password_hash.split('$')
            salt = parts[4]  # Соль находится в 5-й части (индекс 4)
            salts.append(salt)
        
        # Проверяем, что все хеши различаются
        assert len(set(hashes)) == len(hashes), \
            "Все хеши должны быть уникальными"
        
        # Проверяем, что все соли различаются
        assert len(set(salts)) == len(salts), \
            "Все соли должны быть уникальными"
    
    def test_salt_uniqueness_same_password(self, hasher):
        """
        Тест уникальности солей для одного пароля
        
        Проверяет:
        - Хеширование одного пароля дважды даёт разные соли
        - Защита от идентификации одинаковых паролей
        
        Validates: Requirements 13.2
        """
        password = "SamePasswordMultipleTimes"
        
        # Хешируем один пароль 10 раз
        hashes = []
        salts = []
        
        for _ in range(10):
            password_hash = hasher.hash_password(password)
            hashes.append(password_hash)
            
            # Извлекаем соль
            parts = password_hash.split('$')
            salt = parts[4]
            salts.append(salt)
        
        # Проверяем, что все хеши различаются
        assert len(set(hashes)) == len(hashes), \
            "Хеши одного пароля должны различаться из-за разных солей"
        
        # Проверяем, что все соли различаются
        assert len(set(salts)) == len(salts), \
            "Соли должны быть уникальными даже для одного пароля"
    
    def test_salt_length(self, hasher):
        """
        Тест длины соли
        
        Проверяет:
        - Соль имеет достаточную длину (минимум 16 байт)
        - Соответствие рекомендациям безопасности
        
        Validates: Requirements 13.2
        """
        password = "TestPasswordForSaltLength"
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Извлекаем соль
        parts = password_hash.split('$')
        salt_base64 = parts[4]
        
        # Декодируем соль из base64
        import base64
        try:
            salt_bytes = base64.b64decode(salt_base64 + '==')  # Добавляем padding
            salt_length = len(salt_bytes)
            
            # Проверяем минимальную длину соли (16 байт)
            assert salt_length >= 16, \
                f"Длина соли должна быть >= 16 байт, получено: {salt_length}"
        except Exception:
            # Если не удалось декодировать, проверяем длину base64 строки
            # 16 байт в base64 = примерно 22 символа
            assert len(salt_base64) >= 22, \
                f"Длина соли (base64) должна быть >= 22 символов, получено: {len(salt_base64)}"
    
    def test_password_not_stored_in_plain_text(self, hasher):
        """
        Тест, что пароли не хранятся в открытом виде
        
        Проверяет:
        - Хеш не содержит открытый пароль
        - Хеш не является простым кодированием пароля
        - Невозможно восстановить пароль из хеша
        
        Validates: Requirements 13.3
        """
        password = "PlainTextTestPassword"
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Проверяем, что хеш не содержит открытый пароль
        assert password not in password_hash, \
            "Хеш не должен содержать открытый пароль"
        
        # Проверяем, что хеш не является base64 кодированием пароля
        import base64
        try:
            decoded = base64.b64decode(password_hash)
            assert password.encode() not in decoded, \
                "Хеш не должен быть простым base64 кодированием пароля"
        except:
            # Если не удалось декодировать - это хорошо
            pass
        
        # Проверяем, что хеш имеет формат Argon2id (криптографически стойкий)
        assert password_hash.startswith("$argon2id$"), \
            "Хеш должен использовать криптографически стойкий алгоритм Argon2id"
    
    def test_hash_contains_no_sensitive_metadata(self, hasher):
        """
        Тест, что хеш не содержит чувствительных метаданных
        
        Проверяет:
        - Хеш не содержит username
        - Хеш не содержит tg_id
        - Хеш содержит только криптографические данные
        
        Validates: Requirements 13.3
        """
        password = "PasswordWithMetadata"
        username = "sensitive_username"
        tg_id = 123456789
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Проверяем, что хеш не содержит username
        assert username not in password_hash, \
            "Хеш не должен содержать username"
        
        # Проверяем, что хеш не содержит tg_id
        assert str(tg_id) not in password_hash, \
            "Хеш не должен содержать tg_id"
        
        # Проверяем формат хеша (только криптографические данные)
        parts = password_hash.split('$')
        assert len(parts) == 6, \
            "Хеш должен иметь стандартный формат Argon2id"
        
        # Проверяем, что части хеша содержат только допустимые символы
        # (base64 для соли и хеша)
        salt = parts[4]
        hash_part = parts[5]
        
        import re
        base64_pattern = re.compile(r'^[A-Za-z0-9+/]+$')
        
        assert base64_pattern.match(salt), \
            "Соль должна содержать только base64 символы"
        
        assert base64_pattern.match(hash_part), \
            "Хеш должен содержать только base64 символы"
    
    def test_timing_attack_resistance(self, hasher):
        """
        Тест устойчивости к timing attacks при верификации
        
        Проверяет:
        - Время верификации правильного и неправильного пароля примерно одинаковое
        - Защита от определения правильности пароля по времени ответа
        
        Примечание: Argon2 использует constant-time сравнение
        
        Validates: Requirements 13.5
        """
        password = "TimingAttackTestPassword"
        wrong_password = "WrongPasswordForTiming"
        
        # Хешируем пароль
        password_hash = hasher.hash_password(password)
        
        # Измеряем время верификации правильного пароля
        import time
        
        correct_times = []
        for _ in range(10):
            start = time.time()
            hasher.verify_password(password_hash, password)
            correct_times.append(time.time() - start)
        
        # Измеряем время верификации неправильного пароля
        wrong_times = []
        for _ in range(10):
            start = time.time()
            hasher.verify_password(password_hash, wrong_password)
            wrong_times.append(time.time() - start)
        
        # Вычисляем средние значения
        avg_correct = sum(correct_times) / len(correct_times)
        avg_wrong = sum(wrong_times) / len(wrong_times)
        
        # Проверяем, что разница во времени не слишком большая
        # Допускаем 30% разницу (из-за вариативности системы)
        time_difference = abs(avg_correct - avg_wrong)
        max_allowed_difference = max(avg_correct, avg_wrong) * 0.3
        
        assert time_difference < max_allowed_difference, \
            f"Слишком большая разница во времени верификации: {time_difference:.6f}s"
