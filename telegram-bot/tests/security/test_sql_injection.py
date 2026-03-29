"""
Security тесты: SQL Injection Protection

Проверяет защиту от SQL-инъекций в системе авторизации администраторов.
Тестирует использование параметризованных запросов в AdminRepository.
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck

from database.repositories.admin_repository import AdminRepository
from models.administrator import Administrator


# Стратегии для генерации потенциально опасных SQL-инъекций
sql_injection_payloads = st.sampled_from([
    # Классические SQL-инъекции
    "'; DROP TABLE administrators; --",
    "' OR '1'='1",
    "' OR 1=1 --",
    "admin'--",
    "' OR 'x'='x",
    "1' UNION SELECT NULL, NULL, NULL, NULL, NULL, NULL --",
    
    # Попытки извлечения данных
    "' UNION SELECT * FROM administrators --",
    "' UNION SELECT tg_id, username, password_hash FROM administrators --",
    
    # Временные атаки
    "'; WAITFOR DELAY '00:00:05' --",
    "'; SELECT pg_sleep(5) --",
    
    # Попытки обхода аутентификации
    "' OR tg_id IS NOT NULL --",
    "' OR role = 0 --",
    
    # Комментарии и специальные символы
    "test'; -- comment",
    "test'/**/OR/**/1=1",
    "test' AND '1'='1",
    
    # Экранирование кавычек
    "test\\'",
    "test''",
    "test\\\"",
    
    # Hex и Unicode инъекции
    "0x27 OR 1=1",
    "\\u0027 OR 1=1",
    
    # Stacked queries
    "'; DELETE FROM administrators WHERE 1=1; --",
    "'; UPDATE administrators SET role=0; --",
])


class TestSQLInjectionProtection:
    """Тесты защиты от SQL-инъекций в системе авторизации"""
    
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
    async def admin_repository(self, test_db_connection):
        """Фикстура для создания экземпляра AdminRepository"""
        return AdminRepository()
    
    @pytest.mark.asyncio
    async def test_create_admin_with_malicious_tg_id(self, admin_repository, test_db_connection):
        """
        Тест попытки инъекции в поле tg_id при создании администратора
        
        Проверяет:
        - tg_id является integer, поэтому прямая инъекция невозможна
        - Попытка передать строку вызывает ошибку типа или DataError
        
        Validates: Использование параметризованных запросов
        """
        # Попытка передать строку вместо числа должна вызвать ошибку типа или DataError
        from asyncpg.exceptions import DataError
        with pytest.raises((TypeError, ValueError, DataError)):
            await admin_repository.create(
                tg_id="'; DROP TABLE administrators; --",
                username="test_user",
                role=3
            )
    
    @pytest.mark.asyncio
    @given(malicious_username=sql_injection_payloads)
    @settings(
        max_examples=20,
        deadline=5000,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_create_admin_with_sql_injection_in_username(
        self,
        admin_repository,
        malicious_username
    ):
        """
        Тест попытки инъекции в поле username при создании администратора
        
        Проверяет:
        - Вредоносный username сохраняется как обычная строка
        - SQL-инъекция не выполняется
        - Параметризованные запросы защищают от инъекций
        
        Args:
            malicious_username: Потенциально опасный username с SQL-инъекцией
        """
        # Генерируем уникальный tg_id для каждого теста
        import random
        tg_id = random.randint(1000000, 9999999)
        
        try:
            # Создаём администратора с вредоносным username
            admin = await admin_repository.create(
                tg_id=tg_id,
                username=malicious_username,
                role=3
            )
            
            # Проверяем, что администратор создан
            assert admin is not None
            assert admin.tg_id == tg_id
            
            # Проверяем, что username сохранён как есть (экранирован)
            assert admin.username == malicious_username
            
            # Проверяем, что можем получить администратора обратно
            retrieved_admin = await admin_repository.get_by_tg_id(tg_id)
            assert retrieved_admin is not None
            assert retrieved_admin.username == malicious_username
            
        finally:
            # Очистка: удаляем тестового администратора
            try:
                from database.asyncpg_connection import get_asyncpg_pool
                pool = get_asyncpg_pool().get_pool()
                async with pool.acquire() as conn:
                    await conn.execute(
                        "DELETE FROM administrators WHERE tg_id = $1",
                        tg_id
                    )
            except:
                pass
    
    @pytest.mark.asyncio
    @given(malicious_password=sql_injection_payloads)
    @settings(
        max_examples=20,
        deadline=5000,
        suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    async def test_update_password_with_sql_injection(
        self,
        admin_repository,
        malicious_password
    ):
        """
        Тест попытки инъекции в поле password_hash при обновлении пароля
        
        Проверяет:
        - Вредоносный password_hash сохраняется как обычная строка
        - SQL-инъекция не выполняется
        - Параметризованные запросы защищают от инъекций
        
        Args:
            malicious_password: Потенциально опасный password_hash с SQL-инъекцией
        """
        # Генерируем уникальный tg_id для каждого теста
        import random
        tg_id = random.randint(1000000, 9999999)
        
        try:
            # Создаём администратора
            admin = await admin_repository.create(
                tg_id=tg_id,
                username="test_user",
                role=3
            )
            
            # Обновляем пароль с вредоносным значением
            await admin_repository.update_password(tg_id, malicious_password)
            
            # Проверяем, что пароль обновлён
            updated_admin = await admin_repository.get_by_tg_id(tg_id)
            assert updated_admin is not None
            assert updated_admin.password_hash == malicious_password
            
        finally:
            # Очистка: удаляем тестового администратора
            try:
                from database.asyncpg_connection import get_asyncpg_pool
                pool = get_asyncpg_pool().get_pool()
                async with pool.acquire() as conn:
                    await conn.execute(
                        "DELETE FROM administrators WHERE tg_id = $1",
                        tg_id
                    )
            except:
                pass
    
    @pytest.mark.asyncio
    async def test_get_by_tg_id_with_malicious_input(self, admin_repository, test_db_connection):
        """
        Тест попытки инъекции в метод get_by_tg_id
        
        Проверяет:
        - tg_id является integer, поэтому прямая инъекция невозможна
        - Попытка передать строку вызывает ошибку типа или DataError
        """
        # Попытка передать строку вместо числа должна вызвать ошибку типа или DataError
        from asyncpg.exceptions import DataError
        with pytest.raises((TypeError, ValueError, DataError)):
            await admin_repository.get_by_tg_id("1 OR 1=1")
    
    @pytest.mark.asyncio
    async def test_exists_with_malicious_input(self, admin_repository, test_db_connection):
        """
        Тест попытки инъекции в метод exists
        
        Проверяет:
        - tg_id является integer, поэтому прямая инъекция невозможна
        - Попытка передать строку вызывает ошибку типа или DataError
        """
        # Попытка передать строку вместо числа должна вызвать ошибку типа или DataError
        from asyncpg.exceptions import DataError
        with pytest.raises((TypeError, ValueError, DataError)):
            await admin_repository.exists("1'; DROP TABLE administrators; --")
    
    @pytest.mark.asyncio
    async def test_database_integrity_after_injection_attempts(self, admin_repository):
        """
        Тест целостности базы данных после множественных попыток инъекций
        
        Проверяет:
        - Таблица administrators существует после попыток инъекций
        - Данные не были изменены или удалены
        - Система остаётся работоспособной
        """
        # Создаём несколько администраторов с вредоносными данными
        injection_payloads = [
            "'; DROP TABLE administrators; --",
            "' OR '1'='1",
            "' UNION SELECT * FROM administrators --",
        ]
        
        import random
        tg_ids = []
        
        try:
            for i, payload in enumerate(injection_payloads):
                tg_id = random.randint(1000000, 9999999)
                tg_ids.append(tg_id)
                
                # Создаём администратора с вредоносным username
                admin = await admin_repository.create(
                    tg_id=tg_id,
                    username=payload,
                    role=3
                )
                
                # Обновляем пароль с вредоносным значением
                await admin_repository.update_password(tg_id, payload)
            
            # Проверяем, что все администраторы существуют
            for tg_id in tg_ids:
                admin = await admin_repository.get_by_tg_id(tg_id)
                assert admin is not None
            
            # Проверяем, что можем получить список всех администраторов
            all_admins = await admin_repository.get_all()
            assert len(all_admins) >= len(tg_ids)
            
            # Проверяем, что таблица administrators не была удалена
            # Выполняем прямой SQL-запрос для проверки существования таблицы
            from database.asyncpg_connection import get_asyncpg_pool
            pool = get_asyncpg_pool().get_pool()
            async with pool.acquire() as conn:
                result = await conn.fetch(
                    """
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'administrators'
                    """
                )
                tables = [row['table_name'] for row in result]
                assert 'administrators' in tables
        
        finally:
            # Очистка: удаляем тестовых администраторов
            try:
                from database.asyncpg_connection import get_asyncpg_pool
                pool = get_asyncpg_pool().get_pool()
                async with pool.acquire() as conn:
                    for tg_id in tg_ids:
                        await conn.execute(
                            "DELETE FROM administrators WHERE tg_id = $1",
                            tg_id
                        )
            except:
                pass
    
    @pytest.mark.asyncio
    async def test_special_characters_in_username(self, admin_repository):
        """
        Тест обработки специальных символов в username
        
        Проверяет:
        - Специальные символы сохраняются корректно
        - Не происходит SQL-инъекция
        """
        special_chars = [
            "Test with 'single quotes'",
            'Test with "double quotes"',
            "Test with `backticks`",
            "Test with \\ backslashes \\",
            "Test with % percent",
            "Test with _ underscore",
            "Test with ; semicolon;",
            "Test with -- comment",
            "Test with /* comment */",
        ]
        
        import random
        tg_ids = []
        
        try:
            for i, username in enumerate(special_chars):
                tg_id = random.randint(1000000, 9999999)
                tg_ids.append(tg_id)
                
                # Создаём администратора со специальными символами
                admin = await admin_repository.create(
                    tg_id=tg_id,
                    username=username,
                    role=3
                )
                
                assert admin.username == username
            
            # Проверяем, что все администраторы сохранены корректно
            for i, tg_id in enumerate(tg_ids):
                admin = await admin_repository.get_by_tg_id(tg_id)
                assert admin is not None
                assert admin.username == special_chars[i]
        
        finally:
            # Очистка: удаляем тестовых администраторов
            try:
                from database.asyncpg_connection import get_asyncpg_pool
                pool = get_asyncpg_pool().get_pool()
                async with pool.acquire() as conn:
                    for tg_id in tg_ids:
                        await conn.execute(
                            "DELETE FROM administrators WHERE tg_id = $1",
                            tg_id
                        )
            except:
                pass
