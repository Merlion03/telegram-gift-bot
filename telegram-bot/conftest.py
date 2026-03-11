"""
Конфигурация pytest для тестов Telegram-бота

Исправляет проблему с event loop на Windows для работы с PostgreSQL
"""
import asyncio
import sys
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, Mock
import structlog

# Исправление для Windows: принудительно используем SelectorEventLoop
if sys.platform == "win32":
    import selectors
    # Используем встроенную политику для Windows с SelectorEventLoop
    try:
        # Для Python 3.14+ используем новый подход
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except AttributeError:
        # Для старых версий Python создаем собственную политику
        class WindowsSelectorEventLoopPolicy(asyncio.DefaultEventLoopPolicy):
            def new_event_loop(self):
                return asyncio.SelectorEventLoop(selectors.SelectSelector())
        
        asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())


@pytest.fixture(scope="session")
def event_loop():
    """
    Создает event loop для всей сессии тестов
    
    На Windows принудительно использует SelectorEventLoop
    для совместимости с psycopg
    """
    if sys.platform == "win32":
        # Используем SelectorEventLoop для совместимости с psycopg на Windows
        import selectors
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
    else:
        loop = asyncio.new_event_loop()
    
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def setup_logging():
    """
    Настраивает логирование для тестов
    """
    # Настраиваем structlog для тестов
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


@pytest.fixture
def mock_database_config():
    """
    Mock конфигурация базы данных для тестов
    """
    config = Mock()
    config.database_url = "postgresql+asyncpg://test:test@localhost:5432/test_db"
    config.pool_size = 5
    config.max_overflow = 15
    config.pool_pre_ping = True
    return config


@pytest.fixture
def mock_sync_config():
    """
    Mock конфигурация синхронизации для тестов
    """
    config = Mock()
    config.sync_interval_seconds = 60
    config.use_postgres = True
    config.batch_size = 100
    config.max_retries = 3
    return config


@pytest.fixture
def mock_google_sheets_service():
    """
    Mock Google Sheets Service для тестов
    """
    service = Mock()
    service.get_all_worksheets = Mock(return_value=[])
    service.get_worksheet = Mock()
    service.batch_update = AsyncMock()
    return service


@pytest.fixture
def mock_prize_repository():
    """
    Mock Prize Repository для тестов
    """
    repo = Mock()
    repo.find_prize = AsyncMock(return_value=None)
    repo.upsert_prize = AsyncMock()
    repo.batch_upsert_prizes = AsyncMock(return_value=0)
    repo.update_delivery_data = AsyncMock(return_value=True)
    return repo