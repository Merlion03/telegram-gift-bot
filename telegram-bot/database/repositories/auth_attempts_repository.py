"""
Repository для работы с попытками входа (rate limiting)

Предоставляет методы для:
- Подсчёта недавних попыток входа
- Записи попытки входа
- Очистки попыток после успешного входа
- Удаления старых попыток
- Получения самой старой попытки в окне времени
"""
from typing import Optional
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass

from database.asyncpg_connection import get_asyncpg_pool
from utils.logging_config import get_logger


logger = get_logger(__name__)


@dataclass
class AuthAttempt:
    """
    Модель попытки входа
    
    Attributes:
        id: Уникальный идентификатор попытки
        tg_id: Telegram ID администратора
        timestamp: Время попытки входа
        ip_address: IP адрес (если доступен)
        success: Успешность попытки входа
    """
    id: int
    tg_id: int
    timestamp: datetime
    ip_address: Optional[str]
    success: bool


class AuthAttemptsRepository:
    """
    Repository для работы с таблицей auth_attempts
    
    Используется для реализации rate limiting - защиты от brute-force атак.
    Отслеживает попытки входа и блокирует пользователей при превышении лимита.
    
    Validates: Requirements 12.4, 12.5
    """
    
    async def count_recent_attempts(
        self,
        tg_id: int,
        minutes: int = 15
    ) -> int:
        """
        Подсчитывает количество попыток входа за последние N минут
        
        Используется для проверки rate limit перед аутентификацией.
        
        Args:
            tg_id: Telegram ID администратора
            minutes: Временное окно в минутах (по умолчанию 15)
        
        Returns:
            int: Количество попыток за указанный период
        
        Raises:
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 12.4 (проверка <= 5 попыток за 15 минут)
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                # Вычисляем временную границу
                window_start = datetime.now(timezone.utc) - timedelta(minutes=minutes)
                
                count = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM auth_attempts
                    WHERE tg_id = $1 AND timestamp > $2
                    """,
                    tg_id, window_start
                )
                
                logger.info(
                    f"Подсчёт попыток входа: tg_id={tg_id}, "
                    f"minutes={minutes}, count={count}"
                )
                return count
                
        except Exception as e:
            logger.error(
                f"Ошибка подсчёта попыток входа: tg_id={tg_id}, "
                f"minutes={minutes}, error={e}",
                exc_info=True
            )
            raise
    
    async def record_attempt(
        self,
        tg_id: int,
        ip_address: Optional[str] = None
    ) -> None:
        """
        Записывает попытку входа в базу данных
        
        Используется для отслеживания неудачных попыток аутентификации.
        
        Args:
            tg_id: Telegram ID администратора
            ip_address: IP адрес (опционально)
        
        Raises:
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 12.5 (запись попыток для rate limiting)
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                
                await conn.execute(
                    """
                    INSERT INTO auth_attempts (tg_id, timestamp, ip_address, success)
                    VALUES ($1, $2, $3, FALSE)
                    """,
                    tg_id, now, ip_address
                )
                
                logger.info(
                    f"Попытка входа записана: tg_id={tg_id}, "
                    f"ip_address={ip_address}, timestamp={now}"
                )
                
        except Exception as e:
            logger.error(
                f"Ошибка записи попытки входа: tg_id={tg_id}, "
                f"ip_address={ip_address}, error={e}",
                exc_info=True
            )
            raise
    
    async def clear_attempts(self, tg_id: int) -> None:
        """
        Очищает все попытки входа для администратора
        
        Вызывается после успешной аутентификации для сброса счётчика попыток.
        
        Args:
            tg_id: Telegram ID администратора
        
        Raises:
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 12.5 (очистка попыток после успешного входа)
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                result = await conn.execute(
                    """
                    DELETE FROM auth_attempts
                    WHERE tg_id = $1
                    """,
                    tg_id
                )
                
                # Извлекаем количество удалённых записей
                rows_deleted = int(result.split()[-1])
                
                logger.info(
                    f"Попытки входа очищены: tg_id={tg_id}, "
                    f"deleted_count={rows_deleted}"
                )
                
        except Exception as e:
            logger.error(
                f"Ошибка очистки попыток входа: tg_id={tg_id}, error={e}",
                exc_info=True
            )
            raise
    
    async def cleanup_old_attempts(self, hours: int = 24) -> int:
        """
        Удаляет старые попытки входа (для периодической очистки)
        
        Используется для поддержания чистоты базы данных.
        Рекомендуется запускать периодически (например, раз в сутки).
        
        Args:
            hours: Возраст записей в часах (по умолчанию 24)
        
        Returns:
            int: Количество удалённых записей
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                # Вычисляем временную границу
                cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
                
                result = await conn.execute(
                    """
                    DELETE FROM auth_attempts
                    WHERE timestamp < $1
                    """,
                    cutoff_time
                )
                
                # Извлекаем количество удалённых записей
                rows_deleted = int(result.split()[-1])
                
                logger.info(
                    f"Старые попытки входа удалены: hours={hours}, "
                    f"deleted_count={rows_deleted}, cutoff_time={cutoff_time}"
                )
                return rows_deleted
                
        except Exception as e:
            logger.error(
                f"Ошибка удаления старых попыток входа: hours={hours}, error={e}",
                exc_info=True
            )
            raise
    
    async def get_oldest_in_window(
        self,
        tg_id: int,
        window_start: datetime
    ) -> Optional[AuthAttempt]:
        """
        Получает самую старую попытку входа в указанном временном окне
        
        Используется для вычисления времени разблокировки при rate limiting.
        
        Args:
            tg_id: Telegram ID администратора
            window_start: Начало временного окна
        
        Returns:
            AuthAttempt или None если попыток нет
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT id, tg_id, timestamp, ip_address, success
                    FROM auth_attempts
                    WHERE tg_id = $1 AND timestamp > $2
                    ORDER BY timestamp ASC
                    LIMIT 1
                    """,
                    tg_id, window_start
                )
                
                if row is None:
                    logger.info(
                        f"Попытки входа в окне не найдены: tg_id={tg_id}, "
                        f"window_start={window_start}"
                    )
                    return None
                
                attempt = AuthAttempt(
                    id=row['id'],
                    tg_id=row['tg_id'],
                    timestamp=row['timestamp'],
                    ip_address=row['ip_address'],
                    success=row['success']
                )
                
                logger.info(
                    f"Самая старая попытка в окне: tg_id={tg_id}, "
                    f"timestamp={attempt.timestamp}"
                )
                return attempt
                
        except Exception as e:
            logger.error(
                f"Ошибка получения самой старой попытки: tg_id={tg_id}, "
                f"window_start={window_start}, error={e}",
                exc_info=True
            )
            raise
