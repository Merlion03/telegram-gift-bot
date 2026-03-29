"""
Repository для работы с конфигурацией системы

Предоставляет методы для:
- Получения значения конфигурации по ключу
- Установки значения конфигурации
- Получения времени жизни сессий
- Установки времени жизни сессий
"""
from typing import Optional
from datetime import datetime, timezone

from database.asyncpg_connection import get_asyncpg_pool
from utils.logging_config import get_logger


logger = get_logger(__name__)


class ConfigRepository:
    """
    Repository для работы с таблицей system_config
    
    Управляет конфигурацией системы через key-value хранилище.
    Основное назначение - управление временем жизни сессий (session_lifetime_hours).
    
    Validates: Requirements 11.1, 11.2, 11.4
    """
    
    async def get_value(self, key: str) -> Optional[str]:
        """
        Получает значение конфигурации по ключу
        
        Args:
            key: Ключ конфигурации
        
        Returns:
            str или None если ключ не найден
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                value = await conn.fetchval(
                    """
                    SELECT value
                    FROM system_config
                    WHERE key = $1
                    """,
                    key
                )
                
                logger.info(f"Получено значение конфигурации: key={key}, value={value}")
                return value
                
        except Exception as e:
            logger.error(
                f"Ошибка получения значения конфигурации: key={key}, error={e}",
                exc_info=True
            )
            raise
    
    async def set_value(self, key: str, value: str) -> None:
        """
        Устанавливает значение конфигурации
        
        Использует INSERT ... ON CONFLICT DO UPDATE для идемпотентности.
        Если ключ существует - обновляет значение, если нет - создаёт новую запись.
        
        Args:
            key: Ключ конфигурации
            value: Значение конфигурации
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                
                await conn.execute(
                    """
                    INSERT INTO system_config (key, value, updated_at)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (key)
                    DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                    """,
                    key, value, now
                )
                
                logger.info(f"Значение конфигурации установлено: key={key}, value={value}")
                
        except Exception as e:
            logger.error(
                f"Ошибка установки значения конфигурации: key={key}, "
                f"value={value}, error={e}",
                exc_info=True
            )
            raise
    
    async def get_session_lifetime_hours(self) -> int:
        """
        Получает время жизни сессий в часах
        
        Если значение не установлено в БД, возвращает значение по умолчанию (24 часа).
        
        Returns:
            int: Время жизни сессий в часах
        
        Raises:
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 11.1 (хранение session_lifetime)
        """
        try:
            value = await self.get_value('session_lifetime_hours')
            
            if value is None:
                logger.info("session_lifetime_hours не установлен, используется значение по умолчанию: 24")
                return 24
            
            lifetime = int(value)
            logger.info(f"Получено время жизни сессий: {lifetime} часов")
            return lifetime
            
        except ValueError as e:
            logger.error(
                f"Ошибка преобразования session_lifetime_hours в int: value={value}, error={e}",
                exc_info=True
            )
            # Возвращаем значение по умолчанию при ошибке
            return 24
        except Exception as e:
            logger.error(
                f"Ошибка получения session_lifetime_hours: error={e}",
                exc_info=True
            )
            raise
    
    async def set_session_lifetime_hours(self, hours: int) -> None:
        """
        Устанавливает время жизни сессий в часах
        
        Args:
            hours: Время жизни сессий в часах (должно быть > 0)
        
        Raises:
            ValueError: Если hours <= 0
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 11.2 (изменение session_lifetime через конфигурацию)
        """
        if hours <= 0:
            raise ValueError(f"Время жизни сессий должно быть положительным: hours={hours}")
        
        try:
            await self.set_value('session_lifetime_hours', str(hours))
            logger.info(f"Время жизни сессий установлено: {hours} часов")
            
        except Exception as e:
            logger.error(
                f"Ошибка установки session_lifetime_hours: hours={hours}, error={e}",
                exc_info=True
            )
            raise
