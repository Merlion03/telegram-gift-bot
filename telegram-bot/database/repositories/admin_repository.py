"""
Repository для работы с администраторами системы

Предоставляет методы для:
- Получения администратора по tg_id
- Проверки существования администратора
- Создания нового администратора
- Обновления пароля администратора
- Получения списка всех администраторов
"""
from typing import Optional, List
from datetime import datetime, timezone

from models.administrator import Administrator
from database.asyncpg_connection import get_asyncpg_pool
from utils.logging_config import get_logger


logger = get_logger(__name__)


class AdminRepository:
    """
    Repository для работы с таблицей administrators
    
    Использует asyncpg для прямых асинхронных запросов к PostgreSQL.
    Все методы логируют операции для мониторинга и отладки.
    
    Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 8.3
    """
    
    async def get_by_tg_id(self, tg_id: int) -> Optional[Administrator]:
        """
        Получает администратора по Telegram ID
        
        Args:
            tg_id: Telegram ID администратора
        
        Returns:
            Administrator или None если не найден
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT tg_id, username, role, password_hash, created_at, updated_at
                    FROM administrators
                    WHERE tg_id = $1
                    """,
                    tg_id
                )
                
                if row is None:
                    logger.info(f"Администратор не найден: tg_id={tg_id}")
                    return None
                
                admin = Administrator(
                    tg_id=row['tg_id'],
                    username=row['username'],
                    role=row['role'],
                    password_hash=row['password_hash'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )
                
                logger.info(
                    f"Администратор получен: tg_id={tg_id}, "
                    f"role={admin.role}, username={admin.username}"
                )
                return admin
                
        except Exception as e:
            logger.error(
                f"Ошибка получения администратора: tg_id={tg_id}, error={e}",
                exc_info=True
            )
            raise
    
    async def exists(self, tg_id: int) -> bool:
        """
        Проверяет существование администратора по Telegram ID
        
        Args:
            tg_id: Telegram ID администратора
        
        Returns:
            True если администратор существует, False иначе
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                result = await conn.fetchval(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM administrators WHERE tg_id = $1
                    )
                    """,
                    tg_id
                )
                
                logger.info(f"Проверка существования администратора: tg_id={tg_id}, exists={result}")
                return result
                
        except Exception as e:
            logger.error(
                f"Ошибка проверки существования администратора: tg_id={tg_id}, error={e}",
                exc_info=True
            )
            raise
    
    async def create(
        self,
        tg_id: int,
        username: str,
        role: int
    ) -> Administrator:
        """
        Создаёт нового администратора с password_hash = NULL
        
        Новый администратор создаётся без пароля (password_hash IS NULL).
        Пароль устанавливается при первом входе через метод update_password().
        
        Args:
            tg_id: Telegram ID администратора
            username: Telegram username администратора
            role: Уровень роли (0=Developer, 1=Assistant, 2=Administrator, 3=Operator)
        
        Returns:
            Administrator: Созданный администратор
        
        Raises:
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 1.5 (password_hash может быть NULL)
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                
                row = await conn.fetchrow(
                    """
                    INSERT INTO administrators (tg_id, username, role, password_hash, created_at, updated_at)
                    VALUES ($1, $2, $3, NULL, $4, $5)
                    RETURNING tg_id, username, role, password_hash, created_at, updated_at
                    """,
                    tg_id, username, role, now, now
                )
                
                admin = Administrator(
                    tg_id=row['tg_id'],
                    username=row['username'],
                    role=row['role'],
                    password_hash=row['password_hash'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )
                
                logger.info(
                    f"Администратор создан: tg_id={tg_id}, "
                    f"username={username}, role={role}"
                )
                return admin
                
        except Exception as e:
            logger.error(
                f"Ошибка создания администратора: tg_id={tg_id}, "
                f"username={username}, role={role}, error={e}",
                exc_info=True
            )
            raise
    
    async def update_password(self, tg_id: int, password_hash: str) -> None:
        """
        Обновляет хеш пароля администратора
        
        Используется при первичной регистрации пароля и при его изменении.
        
        Args:
            tg_id: Telegram ID администратора
            password_hash: Хеш пароля (Argon2id)
        
        Raises:
            Exception: При ошибке выполнения запроса
        
        Validates: Requirements 8.3 (обновление password_hash)
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                
                result = await conn.execute(
                    """
                    UPDATE administrators
                    SET password_hash = $1, updated_at = $2
                    WHERE tg_id = $3
                    """,
                    password_hash, now, tg_id
                )
                
                # Проверяем, что запись была обновлена
                rows_updated = int(result.split()[-1])
                if rows_updated == 0:
                    logger.warning(f"Администратор не найден для обновления пароля: tg_id={tg_id}")
                else:
                    logger.info(f"Пароль администратора обновлён: tg_id={tg_id}")
                
        except Exception as e:
            logger.error(
                f"Ошибка обновления пароля администратора: tg_id={tg_id}, error={e}",
                exc_info=True
            )
            raise
    
    async def get_all(self) -> List[Administrator]:
        """
        Получает список всех администраторов
        
        Returns:
            List[Administrator]: Список всех администраторов
        
        Raises:
            Exception: При ошибке выполнения запроса
        """
        pool = get_asyncpg_pool().get_pool()
        
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT tg_id, username, role, password_hash, created_at, updated_at
                    FROM administrators
                    ORDER BY role ASC, created_at ASC
                    """
                )
                
                admins = [
                    Administrator(
                        tg_id=row['tg_id'],
                        username=row['username'],
                        role=row['role'],
                        password_hash=row['password_hash'],
                        created_at=row['created_at'],
                        updated_at=row['updated_at']
                    )
                    for row in rows
                ]
                
                logger.info(f"Получен список администраторов: count={len(admins)}")
                return admins
                
        except Exception as e:
            logger.error(f"Ошибка получения списка администраторов: error={e}", exc_info=True)
            raise
