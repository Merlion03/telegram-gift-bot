"""
Модуль подключения к PostgreSQL базе данных
Использует асинхронный SQLAlchemy engine с connection pooling
"""
import logging
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
    async_sessionmaker
)

from database.models import Base


logger = logging.getLogger(__name__)


class DatabaseConnection:
    """
    Класс для управления подключением к базе данных
    
    Обеспечивает:
    - Асинхронное подключение через asyncpg
    - Connection pooling для оптимизации производительности
    - Управление сессиями через async context manager
    """
    
    def __init__(
        self,
        database_url: str,
        echo: bool = False,
        pool_size: int = 5,
        max_overflow: int = 10,
        pool_timeout: int = 30,
        pool_recycle: int = 3600,
        pool_pre_ping: bool = True
    ):
        """
        Инициализирует подключение к базе данных
        
        Args:
            database_url: URL подключения к PostgreSQL (формат: postgresql+asyncpg://user:pass@host:port/db)
            echo: Логировать ли SQL запросы (для отладки)
            pool_size: Размер connection pool
            max_overflow: Максимальное количество дополнительных соединений
            pool_timeout: Таймаут ожидания свободного соединения (секунды)
            pool_recycle: Время жизни соединения перед переподключением (секунды)
            pool_pre_ping: Проверять соединение перед использованием
        """
        self.database_url = database_url
        self.echo = echo
        
        # Создание асинхронного engine с connection pooling
        # Для async engine не указываем poolclass - SQLAlchemy автоматически использует AsyncAdaptedQueuePool
        self.engine: AsyncEngine = create_async_engine(
            database_url,
            echo=echo,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            pool_recycle=pool_recycle,
            pool_pre_ping=pool_pre_ping,
            # Дополнительные параметры для asyncpg
            connect_args={
                "server_settings": {
                    "application_name": "telegram_bot",
                    "jit": "off"  # Отключение JIT для стабильности
                }
            }
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
            f"max_overflow={max_overflow}"
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
                await session.execute("SELECT 1")
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
