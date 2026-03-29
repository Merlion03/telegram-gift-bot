"""
Конфигурация pytest для всех тестов.

Настраивает логирование и общие фикстуры.
"""

import sys
import asyncio
import os
from pathlib import Path

# Добавляем путь к telegram-bot модулям
sys.path.insert(0, str(Path(__file__).parent.parent))

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
    # В Python 3.14+ используем прямую установку через asyncio.Runner
    # Вместо deprecated set_event_loop_policy
    try:
        # Для Python 3.14+ не используем deprecated API
        # asyncio.Runner автоматически использует правильный event loop
        pass
    except AttributeError:
        # Fallback для старых версий
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        except AttributeError:
            pass

import pytest
import structlog
import logging
from io import StringIO


@pytest.fixture(scope="session")
def event_loop_policy():
    """
    Фикстура для настройки event loop policy на уровне сессии
    
    Используется pytest-asyncio для создания event loop с правильной policy
    """
    if sys.platform == 'win32':
        # Для Windows в Python 3.14+ не используем deprecated API
        # pytest-asyncio автоматически создаст правильный event loop
        return None
    else:
        # Для Linux/Mac используем default policy
        return asyncio.DefaultEventLoopPolicy()


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


@pytest.fixture(scope="function")
async def db_session():
    """
    Создаёт тестовую сессию базы данных с изоляцией через TRUNCATE
    
    Очищает БД перед каждым использованием фикстуры.
    Это гарантирует изоляцию для каждого примера Hypothesis.
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
        # Очищаем таблицы ПЕРЕД использованием сессии
        # Это критически важно для изоляции примеров Hypothesis
        await session.execute(text("TRUNCATE TABLE support_messages RESTART IDENTITY CASCADE"))
        await session.execute(text("TRUNCATE TABLE support_sessions RESTART IDENTITY CASCADE"))
        await session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
        await session.commit()
        
        yield session
        
    finally:
        # Очищаем таблицы ПОСЛЕ использования для следующего теста
        try:
            await session.execute(text("TRUNCATE TABLE support_messages RESTART IDENTITY CASCADE"))
            await session.execute(text("TRUNCATE TABLE support_sessions RESTART IDENTITY CASCADE"))
            await session.execute(text("TRUNCATE TABLE prizes RESTART IDENTITY CASCADE"))
            await session.commit()
        except Exception:
            # Игнорируем ошибки при очистке после теста
            pass
        
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


class ListenConnection:
    """
    Обёртка для PostgreSQL LISTEN подключения в тестах
    
    Предоставляет удобный API для ожидания уведомлений
    """
    
    def __init__(self, conn):
        self.conn = conn
        self.notifications = []
    
    async def wait_for_notification(self, channel: str, timeout: float = 2.0):
        """
        Ожидает уведомление на указанном канале
        
        Args:
            channel: Имя канала для ожидания
            timeout: Максимальное время ожидания в секундах
        
        Returns:
            Notification объект или None при timeout
        """
        import time
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            # Проверяем уже полученные уведомления
            for i, notification in enumerate(self.notifications):
                if notification.channel == channel:
                    # Удаляем из списка и возвращаем
                    return self.notifications.pop(i)
            
            # Проверяем новые уведомления через notifies() (без handler)
            # Используем короткий timeout для notifies
            try:
                gen = self.conn.notifies(timeout=0.1)
                for notify in gen:
                    if notify.channel == channel:
                        return notify
                    else:
                        # Сохраняем для других каналов
                        self.notifications.append(notify)
            except Exception:
                # Timeout в notifies - продолжаем цикл
                pass
            
            # Небольшая задержка перед следующей проверкой
            await asyncio.sleep(0.05)
        
        return None
    
    def listen(self, channel: str):
        """Подписывается на канал LISTEN"""
        with self.conn.cursor() as cur:
            cur.execute(f"LISTEN {channel}")
    
    def unlisten(self, channel: str):
        """Отписывается от канала"""
        with self.conn.cursor() as cur:
            cur.execute(f"UNLISTEN {channel}")


@pytest.fixture
async def listen_connection():
    """
    Создаёт PostgreSQL LISTEN подключение для тестов
    
    Используется для получения уведомлений от триггеров
    """
    import psycopg
    import os
    
    # Параметры подключения
    db_host = 'localhost'
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    # Создаём синхронное подключение с autocommit для LISTEN
    conn = psycopg.connect(conn_string, autocommit=True)
    
    # Создаём обёртку
    listen_conn = ListenConnection(conn)
    
    # Подписываемся на все каналы
    listen_conn.listen('new_message')
    listen_conn.listen('session_status_change')
    listen_conn.listen('session_type_change')
    
    yield listen_conn
    
    # Отписываемся и закрываем подключение
    try:
        listen_conn.unlisten('new_message')
        listen_conn.unlisten('session_status_change')
        listen_conn.unlisten('session_type_change')
    except:
        pass
    
    conn.close()
