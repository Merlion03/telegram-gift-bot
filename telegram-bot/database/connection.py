"""
Модуль подключения к PostgreSQL базе данных
Использует асинхронный SQLAlchemy engine с psycopg3 и connection pooling
"""
import logging
import sys
import asyncio
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
    async_sessionmaker
)
from sqlalchemy import text

from database.models import Base


logger = logging.getLogger(__name__)


# КРИТИЧЕСКИ ВАЖНО: Исправление для Windows
# psycopg не может работать с ProactorEventLoop на Windows
# Необходимо использовать SelectorEventLoop
if sys.platform == "win32":
    import selectors
    
    class WindowsSelectorEventLoopPolicy(asyncio.DefaultEventLoopPolicy):
        """
        Политика event loop для Windows, использующая SelectorEventLoop
        вместо ProactorEventLoop для совместимости с psycopg
        """
        def new_event_loop(self):
            selector = selectors.SelectSelector()
            return asyncio.SelectorEventLoop(selector)
    
    # Устанавливаем политику глобально перед любыми операциями с БД
    asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())
    logger.info("Windows detected: using SelectorEventLoop for psycopg compatibility")


class DatabaseConnection:
    """
    Класс для управления подключением к базе данных
    
    Обеспечивает:
    - Асинхронное подключение через psycopg3
    - Connection pooling для оптимизации производительности
    - Управление сессиями через async context manager
    """
    
    def __init__(
        self,
        database_url: str,
        echo: bool = False,
        pool_size: int = 5,
        max_overflow: int = 15,
        pool_timeout: int = 30,
        pool_recycle: int = 3600,
        pool_pre_ping: bool = True
    ):
        """
        Инициализирует подключение к базе данных
        
        Args:
            database_url: URL подключения к PostgreSQL (формат: postgresql+psycopg://user:pass@host:port/db)
            echo: Логировать ли SQL запросы (для отладки)
            pool_size: Размер connection pool (по умолчанию 5)
            max_overflow: Максимальное количество дополнительных соединений (по умолчанию 15, итого max 20)
            pool_timeout: Таймаут ожидания свободного соединения в секундах (по умолчанию 30)
            pool_recycle: Время жизни соединения перед переподключением в секундах (по умолчанию 3600)
            pool_pre_ping: Проверять соединение перед использованием для автоматического переподключения (по умолчанию True)
        """
        self.database_url = database_url
        self.echo = echo
        
        # Создание асинхронного engine с connection pooling
        # asyncpg используется для асинхронных операций
        # 
        # Connection pooling обеспечивает:
        # - Переиспользование соединений для производительности
        # - Ограничение максимального количества соединений
        # - Автоматическое переподключение при сбоях (pool_pre_ping)
        # - Управление жизненным циклом соединений (pool_recycle)
        self.engine: AsyncEngine = create_async_engine(
            database_url,
            echo=echo,
            pool_size=pool_size,  # Минимальное количество соединений в пуле
            max_overflow=max_overflow,  # Дополнительные соединения сверх pool_size
            pool_timeout=pool_timeout,  # Таймаут ожидания свободного соединения
            pool_recycle=pool_recycle,  # Переподключение после указанного времени
            pool_pre_ping=pool_pre_ping  # Проверка соединения перед использованием
        )
        
        # Создание session factory
        self.async_session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,  # Не истекать объекты после commit
            autoflush=False,  # Ручное управление flush
            autocommit=False  # Ручное управление commit
        )
        
        logger.info(
            f"Database connection initialized: pool_size={pool_size}, "
            f"max_overflow={max_overflow}, total_max_connections={pool_size + max_overflow}, "
            f"pool_pre_ping={pool_pre_ping}"
        )
    
    async def create_tables(self) -> None:
        """
        Создаёт все таблицы в базе данных
        Используется для инициализации схемы
        """
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created successfully")
    
    async def drop_tables(self) -> None:
        """
        Удаляет все таблицы из базы данных
        ВНИМАНИЕ: Используйте только для тестирования!
        """
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.warning("Database tables dropped")
    
    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Async context manager для работы с сессией БД
        
        Использование:
            async with db.session() as session:
                result = await session.execute(query)
                await session.commit()
        
        Yields:
            AsyncSession: Асинхронная сессия SQLAlchemy
        """
        session: AsyncSession = self.async_session_factory()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}", exc_info=True)
            raise
        finally:
            await session.close()
    
    def get_session(self) -> AsyncSession:
        """
        Создаёт новую сессию БД
        
        ВНИМАНИЕ: При использовании этого метода необходимо вручную
        управлять жизненным циклом сессии (commit/rollback/close)
        
        Рекомендуется использовать context manager session() вместо этого метода
        
        Returns:
            AsyncSession: Новая асинхронная сессия
        """
        return self.async_session_factory()
    
    async def close(self) -> None:
        """
        Закрывает все соединения с базой данных
        Должен вызываться при завершении работы приложения
        """
        await self.engine.dispose()
        logger.info("Database connections closed")
    
    async def health_check(self) -> bool:
        """
        Проверяет доступность базы данных
        
        Returns:
            bool: True если БД доступна, False в противном случае
        """
        try:
            async with self.session() as session:
                await session.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False


# Глобальный экземпляр подключения (инициализируется в main.py)
db_connection: DatabaseConnection | None = None


def init_database(database_url: str, **kwargs) -> DatabaseConnection:
    """
    Инициализирует глобальное подключение к базе данных
    
    Args:
        database_url: URL подключения к PostgreSQL
        **kwargs: Дополнительные параметры для DatabaseConnection
    
    Returns:
        DatabaseConnection: Инициализированное подключение
    """
    global db_connection
    db_connection = DatabaseConnection(database_url, **kwargs)
    return db_connection


def get_database() -> DatabaseConnection:
    """
    Получает глобальный экземпляр подключения к БД
    
    Returns:
        DatabaseConnection: Подключение к БД
    
    Raises:
        RuntimeError: Если БД не инициализирована
    """
    if db_connection is None:
        raise RuntimeError(
            "Database not initialized. Call init_database() first."
        )
    return db_connection
