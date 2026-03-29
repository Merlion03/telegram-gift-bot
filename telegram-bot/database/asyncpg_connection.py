"""
Модуль для работы с asyncpg connection pool

Предоставляет connection pool для прямой работы с PostgreSQL через asyncpg.
Используется для репозиториев системы авторизации администраторов.
"""
import asyncpg
import os
from typing import Optional
from utils.logging_config import get_logger


logger = get_logger(__name__)


class AsyncpgConnectionPool:
    """
    Менеджер connection pool для asyncpg
    
    Обеспечивает:
    - Connection pooling для оптимизации производительности
    - Автоматическое управление жизненным циклом соединений
    - Переиспользование соединений
    """
    
    def __init__(self):
        """Инициализирует менеджер connection pool"""
        self._pool: Optional[asyncpg.Pool] = None
    
    async def initialize(
        self,
        database_url: Optional[str] = None,
        min_size: int = 5,
        max_size: int = 20
    ) -> None:
        """
        Инициализирует connection pool
        
        Args:
            database_url: URL подключения к PostgreSQL
            min_size: Минимальное количество соединений в пуле
            max_size: Максимальное количество соединений в пуле
        """
        if self._pool is not None:
            logger.warning("Connection pool уже инициализирован")
            return
        
        # Получаем database_url из переменных окружения если не передан
        if not database_url:
            database_url = os.getenv('DATABASE_URL')
            
            if not database_url:
                # Собираем из отдельных переменных
                db_host = os.getenv('DB_HOST', 'localhost')
                db_port = os.getenv('DB_PORT', '5433')
                db_name = os.getenv('DB_NAME', 'telegram_bot')
                db_user = os.getenv('DB_USER', 'postgres')
                db_password = os.getenv('DB_PASSWORD', 'postgres')
                
                database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        
        # Конвертируем SQLAlchemy DSN в asyncpg формат
        # SQLAlchemy использует postgresql+psycopg://, asyncpg требует postgresql://
        if database_url.startswith('postgresql+psycopg://'):
            database_url = database_url.replace('postgresql+psycopg://', 'postgresql://')
        elif database_url.startswith('postgresql+psycopg2://'):
            database_url = database_url.replace('postgresql+psycopg2://', 'postgresql://')
        
        try:
            self._pool = await asyncpg.create_pool(
                database_url,
                min_size=min_size,
                max_size=max_size,
                command_timeout=60
            )
            logger.info(
                f"Asyncpg connection pool инициализирован: "
                f"min_size={min_size}, max_size={max_size}"
            )
        except Exception as e:
            logger.error(f"Ошибка инициализации asyncpg pool: {e}", exc_info=True)
            raise
    
    async def close(self) -> None:
        """Закрывает connection pool"""
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("Asyncpg connection pool закрыт")
    
    def get_pool(self) -> asyncpg.Pool:
        """
        Получает connection pool
        
        Returns:
            asyncpg.Pool: Connection pool
        
        Raises:
            RuntimeError: Если pool не инициализирован
        """
        if self._pool is None:
            raise RuntimeError(
                "Asyncpg connection pool не инициализирован. "
                "Вызовите initialize() сначала."
            )
        return self._pool


# Глобальный экземпляр connection pool
_asyncpg_pool: Optional[AsyncpgConnectionPool] = None


def get_asyncpg_pool() -> AsyncpgConnectionPool:
    """
    Получает глобальный экземпляр asyncpg connection pool
    
    Returns:
        AsyncpgConnectionPool: Connection pool менеджер
    """
    global _asyncpg_pool
    if _asyncpg_pool is None:
        _asyncpg_pool = AsyncpgConnectionPool()
    return _asyncpg_pool


async def initialize_asyncpg_pool(
    database_url: Optional[str] = None,
    min_size: int = 5,
    max_size: int = 20
) -> AsyncpgConnectionPool:
    """
    Инициализирует глобальный asyncpg connection pool
    
    Используется в тестах для инициализации глобального pool.
    
    Args:
        database_url: URL подключения к PostgreSQL
        min_size: Минимальное количество соединений в пуле
        max_size: Максимальное количество соединений в пуле
    
    Returns:
        AsyncpgConnectionPool: Инициализированный connection pool
    """
    pool = get_asyncpg_pool()
    await pool.initialize(database_url, min_size, max_size)
    return pool


async def close_asyncpg_pool() -> None:
    """
    Закрывает глобальный asyncpg connection pool
    
    Используется в тестах для очистки после завершения.
    """
    global _asyncpg_pool
    if _asyncpg_pool is not None:
        await _asyncpg_pool.close()
        _asyncpg_pool = None
