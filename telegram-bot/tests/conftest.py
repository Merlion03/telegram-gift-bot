"""
Конфигурация pytest для всех тестов.

Настраивает логирование и общие фикстуры.
"""

import sys
import asyncio
import os
from pathlib import Path

# Загружаем .env.test перед всеми импортами
from dotenv import load_dotenv

# Определяем путь к .env.test (в корне проекта, на уровень выше telegram-bot)
env_test_path = Path(__file__).parent.parent.parent / '.env.test'
if env_test_path.exists():
    load_dotenv(env_test_path, override=True)
else:
    # Если не нашли в корне проекта, пробуем в telegram-bot
    env_test_path = Path(__file__).parent.parent / '.env.test'
    if env_test_path.exists():
        load_dotenv(env_test_path, override=True)

# КРИТИЧЕСКИ ВАЖНО: Настроить event loop policy ДО импорта pytest
# psycopg3 не работает с ProactorEventLoop на Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
import structlog
import logging
from io import StringIO


@pytest.fixture(scope="session", autouse=True)
def configure_test_logging():
    """
    Настраивает безопасное логирование для тестов.
    
    Использует StringIO вместо sys.stdout, чтобы избежать
    ошибок "I/O operation on closed file" в тестах.
    """
    # Создаём буфер для логов
    log_buffer = StringIO()
    
    # Настройка стандартного logging
    logging.basicConfig(
        format='%(message)s',
        stream=log_buffer,
        level=logging.DEBUG,
        force=True  # Переопределяем существующую конфигурацию
    )
    
    # Процессоры для structlog
    processors = [
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ]
    
    # Конфигурация structlog для тестов
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=log_buffer),
        cache_logger_on_first_use=False,  # Не кешируем в тестах
    )
    
    yield
    
    # Очистка после тестов
    log_buffer.close()


@pytest.fixture(autouse=True)
def reset_structlog_cache():
    """
    Сбрасывает кеш structlog между тестами.
    
    Это предотвращает проблемы с закрытыми файловыми дескрипторами.
    """
    # Очищаем кеш логгеров перед каждым тестом
    structlog.reset_defaults()
    
    yield
    
    # Очищаем кеш после теста
    structlog.reset_defaults()



@pytest.fixture
async def db_session():
    """
    Создаёт тестовую сессию базы данных
    
    Использует TRUNCATE для полной изоляции тестов.
    Каждый тест получает чистую БД.
    """
    from database.connection import DatabaseConnection
    from sqlalchemy import text
    import os
    
    # Для локальных тестов всегда используем localhost
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    # Используем asyncpg для асинхронных операций (как в основном коде)
    database_url = f'postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    # Создаём подключение с минимальным pool для каждого теста
    db = DatabaseConnection(database_url, echo=False, pool_size=2, max_overflow=5)
    
    # Получаем сессию напрямую (без context manager)
    session = db.get_session()
    
    try:
        # Очищаем таблицы ПЕРЕД тестом для полной изоляции
        await session.execute(text("TRUNCATE TABLE support_messages CASCADE"))
        await session.execute(text("TRUNCATE TABLE support_sessions RESTART IDENTITY CASCADE"))
        await session.commit()
        
        yield session
    finally:
        # Закрываем сессию
        await session.close()
        # Закрываем подключение после теста
        await db.close()


@pytest.fixture
def support_repository(db_session):
    """
    Создаёт экземпляр SupportRepository для тестов
    
    Args:
        db_session: Фикстура сессии базы данных
    
    Returns:
        SupportRepository: Репозиторий для работы с поддержкой
    """
    from database.repository import SupportRepository
    return SupportRepository(session=db_session)
