"""
Конфигурация pytest для property-based тестов

Настраивает asyncpg connection pool и очистку БД для изоляции тестов.
"""

import pytest
import asyncio
import os


@pytest.fixture(scope="function")
async def asyncpg_pool():
    """
    Создаёт asyncpg connection pool для каждого теста
    
    Каждый тест получает свой pool, привязанный к текущему event loop.
    Это решает проблему "Task got Future attached to a different loop".
    
    ВАЖНО: Инициализирует глобальный pool через initialize_asyncpg_pool(),
    чтобы репозитории могли использовать get_asyncpg_pool() внутри Hypothesis итераций.
    
    Используется только в тестах, которым нужен доступ к БД.
    """
    from database.asyncpg_connection import initialize_asyncpg_pool, close_asyncpg_pool
    
    # Параметры подключения
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # Инициализируем глобальный pool для этого теста
    # Это позволяет репозиториям использовать get_asyncpg_pool() внутри Hypothesis итераций
    pool = await initialize_asyncpg_pool(database_url, min_size=2, max_size=5)
    
    yield pool
    
    # Закрываем глобальный pool после теста
    await close_asyncpg_pool()


@pytest.fixture(scope="function")
async def clean_admin_tables(asyncpg_pool):
    """
    Очищает таблицы администраторов перед каждым тестом
    
    Обеспечивает изоляцию для property-based тестов.
    Каждый тест начинается с чистой БД.
    
    Требует фикстуру asyncpg_pool.
    """
    pool = asyncpg_pool.get_pool()
    
    async with pool.acquire() as conn:
        # Очищаем таблицы перед тестом
        await conn.execute("TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE")
        await conn.execute("TRUNCATE TABLE administrators RESTART IDENTITY CASCADE")
        # Восстанавливаем дефолтное значение session_lifetime
        await conn.execute("""
            INSERT INTO system_config (key, value) 
            VALUES ('session_lifetime_hours', '24')
            ON CONFLICT (key) DO UPDATE SET value = '24'
        """)
    
    yield
    
    # Очищаем после теста
    async with pool.acquire() as conn:
        try:
            await conn.execute("TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE")
            await conn.execute("TRUNCATE TABLE administrators RESTART IDENTITY CASCADE")
            await conn.execute("""
                INSERT INTO system_config (key, value) 
                VALUES ('session_lifetime_hours', '24')
                ON CONFLICT (key) DO UPDATE SET value = '24'
            """)
        except Exception:
            # Игнорируем ошибки при очистке
            pass
