"""
Repository для работы с GDPR согласиями в PostgreSQL

Предоставляет методы для:
- Получения согласия пользователя
- Сохранения согласия (upsert)
- Проверки наличия согласия
"""
import time
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from database.models.gdpr_consent import GdprConsent
from database.base_repository import BaseRepository
from utils.logging_config import get_logger


logger = get_logger(__name__)


class DatabaseUnavailableError(Exception):
    """Исключение при недоступности базы данных"""
    pass


class GdprConsentRepository(BaseRepository):
    """
    Repository для работы с GDPR согласиями
    
    Предоставляет высокоуровневые методы для работы с таблицей gdpr_consents,
    включая получение, сохранение и проверку согласий.
    
    Все методы логируют время выполнения для мониторинга производительности.
    """
    
    async def get_consent(self, telegram_id: int) -> Optional[GdprConsent]:
        """
        Получает согласие пользователя
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            GdprConsent или None если согласие не найдено
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Запрос на получение согласия
                query = select(GdprConsent).where(
                    GdprConsent.telegram_id == telegram_id
                )
                
                result = await session.execute(query)
                consent = result.scalar_one_or_none()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "gdpr_consent_get_completed",
                    telegram_id=telegram_id,
                    found=consent is not None,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return consent
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "gdpr_consent_get_error",
                telegram_id=telegram_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при получении GDPR согласия: {str(e)}"
            ) from e
    
    async def save_consent(
        self,
        telegram_id: int,
        consent_date: datetime
    ) -> GdprConsent:
        """
        Сохраняет согласие пользователя (upsert операция)
        
        Использует PostgreSQL ON CONFLICT DO UPDATE для обеспечения
        идемпотентности. При конфликте уникального индекса telegram_id
        выполняется обновление существующей записи.
        
        Args:
            telegram_id: Telegram ID пользователя
            consent_date: Дата и время согласия
        
        Returns:
            GdprConsent: Созданное или обновленное согласие
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Добавляем временные метки
                now = datetime.now(timezone.utc)
                
                # PostgreSQL INSERT ... ON CONFLICT DO UPDATE
                stmt = insert(GdprConsent).values(
                    telegram_id=telegram_id,
                    consent_date=consent_date,
                    created_at=now,
                    updated_at=now
                )
                
                # При конфликте обновляем consent_date и updated_at
                stmt = stmt.on_conflict_do_update(
                    index_elements=['telegram_id'],
                    set_={
                        'consent_date': stmt.excluded.consent_date,
                        'updated_at': stmt.excluded.updated_at
                    }
                ).returning(GdprConsent)
                
                result = await session.execute(stmt)
                # Commit выполняется автоматически в контексте менеджере
                
                consent = result.scalar_one()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "gdpr_consent_save_completed",
                    telegram_id=telegram_id,
                    consent_date=consent_date.isoformat(),
                    consent_id=consent.id,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return consent
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "gdpr_consent_save_error",
                telegram_id=telegram_id,
                consent_date=consent_date.isoformat(),
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при сохранении GDPR согласия: {str(e)}"
            ) from e
    
    async def check_consent_exists(self, telegram_id: int) -> bool:
        """
        Проверяет наличие согласия у пользователя
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            bool: True если согласие существует, False иначе
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Запрос на проверку существования согласия
                query = select(GdprConsent.id).where(
                    GdprConsent.telegram_id == telegram_id
                ).limit(1)
                
                result = await session.execute(query)
                exists = result.scalar_one_or_none() is not None
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "gdpr_consent_exists_check_completed",
                    telegram_id=telegram_id,
                    exists=exists,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return exists
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "gdpr_consent_exists_check_error",
                telegram_id=telegram_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при проверке существования GDPR согласия: {str(e)}"
            ) from e
