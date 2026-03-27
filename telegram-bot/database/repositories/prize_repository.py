"""
Repository для работы с призами в PostgreSQL

Предоставляет методы для:
- Поиска приза по telegram_id и code_word
- Upsert операций для синхронизации с Google Sheets
- Batch операций для производительности
- Обновления данных доставки
"""
import time
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from sqlalchemy import select, and_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.prize import Prize
from database.base_repository import BaseRepository
from database.connection import get_database
from utils.logging_config import get_logger


logger = get_logger(__name__)


class DatabaseUnavailableError(Exception):
    """Исключение при недоступности базы данных"""
    pass


class PrizeRepository(BaseRepository):
    """
    Repository для работы с призами
    
    Предоставляет высокоуровневые методы для работы с таблицей prizes,
    включая поиск, upsert операции и обновление данных доставки.
    
    Все методы логируют время выполнения для мониторинга производительности.
    """
    
    async def find_prize(
        self,
        telegram_id: int,
        code_word: str,
        timeout_ms: int = 500
    ) -> Optional[Prize]:
        """
        Ищет приз по telegram_id и code_word с таймаутом
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            timeout_ms: Таймаут в миллисекундах (по умолчанию 500ms)
        
        Returns:
            Prize или None если не найден
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
            asyncio.TimeoutError: Если запрос превысил таймаут
        """
        start_time = time.time()
        
        try:
            # Выполняем запрос с таймаутом
            async with asyncio.timeout(timeout_ms / 1000):
                # Используем контекст менеджер для правильного управления сессиями
                async with self._get_session_context() as session:
                    # Запрос с использованием составного индекса
                    query = select(Prize).where(
                        and_(
                            Prize.telegram_id == telegram_id,
                            Prize.code_word == code_word
                        )
                    )
                    
                    result = await session.execute(query)
                    prize = result.scalar_one_or_none()
                    
                    # Логирование времени выполнения
                    elapsed_ms = (time.time() - start_time) * 1000
                    
                    logger.info(
                        "prize_search_completed",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        found=prize is not None,
                        elapsed_ms=round(elapsed_ms, 2)
                    )
                    
                    # Предупреждение о медленном запросе
                    if elapsed_ms > 500:
                        logger.warning(
                            "slow_prize_search",
                            telegram_id=telegram_id,
                            code_word=code_word,
                            elapsed_ms=round(elapsed_ms, 2),
                            threshold_ms=500
                        )
                    
                    return prize
                
        except asyncio.TimeoutError:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "prize_search_timeout",
                telegram_id=telegram_id,
                code_word=code_word,
                timeout_ms=timeout_ms,
                elapsed_ms=round(elapsed_ms, 2)
            )
            raise
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "prize_search_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            raise DatabaseUnavailableError(
                f"Ошибка при поиске приза: {str(e)}"
            ) from e
    
    async def upsert_prize(
        self,
        prize_data: Dict[str, Any]
    ) -> Prize:
        """
        Вставляет или обновляет приз (идемпотентная операция)
        
        Использует PostgreSQL ON CONFLICT DO UPDATE для обеспечения
        идемпотентности. При конфликте уникального индекса
        (telegram_id, code_word) выполняется обновление существующей записи.
        
        Args:
            prize_data: Данные приза (должны содержать telegram_id и code_word)
        
        Returns:
            Prize: Созданный или обновленный приз
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
            ValueError: Если отсутствуют обязательные поля
        """
        start_time = time.time()
        
        # Валидация обязательных полей
        required_fields = ['telegram_id', 'code_word', 'prize_type', 'sheet_name', 'row_id']
        missing_fields = [field for field in required_fields if field not in prize_data]
        if missing_fields:
            raise ValueError(
                f"Отсутствуют обязательные поля: {', '.join(missing_fields)}"
            )
        
        try:
            if self._session:
                # Используем внешнюю сессию - управление транзакциями внешнее
                session = self._session
                
                # Добавляем временные метки
                now = datetime.now(timezone.utc)
                prize_data['updated_at'] = now
                if 'created_at' not in prize_data:
                    prize_data['created_at'] = now
                
                # PostgreSQL INSERT ... ON CONFLICT DO UPDATE
                stmt = insert(Prize).values(**prize_data)
                
                # При конфликте обновляем все поля кроме id и created_at
                update_dict = {}
                for col in Prize.__table__.columns:
                    if col.name not in ('id', 'created_at'):
                        update_dict[col.name] = getattr(stmt.excluded, col.name)
                
                stmt = stmt.on_conflict_do_update(
                    index_elements=['telegram_id', 'code_word'],
                    set_=update_dict
                ).returning(Prize)
                
                result = await session.execute(stmt)
                # Commit должен быть вызван внешним кодом
                
                prize = result.scalar_one()
                
            else:
                # Используем контекст менеджер - автоматическое управление транзакциями
                async with self._get_session_context() as session:
                    # Добавляем временные метки
                    now = datetime.now(timezone.utc)
                    prize_data['updated_at'] = now
                    if 'created_at' not in prize_data:
                        prize_data['created_at'] = now
                    
                    # PostgreSQL INSERT ... ON CONFLICT DO UPDATE
                    stmt = insert(Prize).values(**prize_data)
                    
                    # При конфликте обновляем все поля кроме id и created_at
                    update_dict = {}
                    for col in Prize.__table__.columns:
                        if col.name not in ('id', 'created_at'):
                            update_dict[col.name] = getattr(stmt.excluded, col.name)
                    
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['telegram_id', 'code_word'],
                        set_=update_dict
                    ).returning(Prize)
                    
                    result = await session.execute(stmt)
                    # Commit выполняется автоматически в контексте менеджере
                    
                    prize = result.scalar_one()
            
            # Логирование времени выполнения
            elapsed_ms = (time.time() - start_time) * 1000
            
            logger.info(
                "prize_upsert_completed",
                telegram_id=prize_data['telegram_id'],
                code_word=prize_data['code_word'],
                prize_id=prize.id,
                elapsed_ms=round(elapsed_ms, 2)
            )
            
            return prize
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "prize_upsert_error",
                telegram_id=prize_data.get('telegram_id'),
                code_word=prize_data.get('code_word'),
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при upsert приза: {str(e)}"
            ) from e
    
    async def batch_upsert_prizes(
        self,
        prizes_data: List[Dict[str, Any]]
    ) -> int:
        """
        Batch upsert для списка призов (эффективная массовая операция)
        
        Выполняет upsert для множества призов в одной транзакции,
        что значительно эффективнее чем множество отдельных операций.
        
        Args:
            prizes_data: Список данных призов
        
        Returns:
            int: Количество обработанных записей
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        if not prizes_data:
            logger.warning("batch_upsert_called_with_empty_list")
            return 0
        
        start_time = time.time()
        processed_count = 0
        
        try:
            if self._session:
                # Используем внешнюю сессию - управление транзакциями внешнее
                session = self._session
                
                # Добавляем временные метки ко всем записям
                now = datetime.now(timezone.utc)
                for prize_data in prizes_data:
                    prize_data['updated_at'] = now
                    if 'created_at' not in prize_data:
                        prize_data['created_at'] = now
                
                # Выполняем upsert для каждой записи в рамках внешней транзакции
                for prize_data in prizes_data:
                    stmt = insert(Prize).values(**prize_data)
                    
                    # При конфликте обновляем все поля кроме id и created_at
                    update_dict = {}
                    for col in Prize.__table__.columns:
                        if col.name not in ('id', 'created_at'):
                            update_dict[col.name] = getattr(stmt.excluded, col.name)
                    
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['telegram_id', 'code_word'],
                        set_=update_dict
                    )
                    
                    await session.execute(stmt)
                
                # Commit должен быть вызван внешним кодом
                processed_count = len(prizes_data)
                
            else:
                # Используем контекст менеджер - автоматическое управление транзакциями
                async with self._get_session_context() as session:
                    # Добавляем временные метки ко всем записям
                    now = datetime.now(timezone.utc)
                    for prize_data in prizes_data:
                        prize_data['updated_at'] = now
                        if 'created_at' not in prize_data:
                            prize_data['created_at'] = now
                    
                    # Выполняем upsert для каждой записи в рамках одной транзакции
                    for prize_data in prizes_data:
                        stmt = insert(Prize).values(**prize_data)
                        
                        # При конфликте обновляем все поля кроме id и created_at
                        update_dict = {}
                        for col in Prize.__table__.columns:
                            if col.name not in ('id', 'created_at'):
                                update_dict[col.name] = getattr(stmt.excluded, col.name)
                        
                        stmt = stmt.on_conflict_do_update(
                            index_elements=['telegram_id', 'code_word'],
                            set_=update_dict
                        )
                        
                        await session.execute(stmt)
                    
                    # Commit выполняется автоматически в контексте менеджере
                    processed_count = len(prizes_data)
            
            # Логирование времени выполнения
            elapsed_ms = (time.time() - start_time) * 1000
            
            logger.info(
                "batch_upsert_completed",
                records_count=processed_count,
                elapsed_ms=round(elapsed_ms, 2),
                records_per_second=round(processed_count / (elapsed_ms / 1000), 2)
            )
            
            return processed_count
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "batch_upsert_error",
                records_count=len(prizes_data),
                processed_count=processed_count,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при batch upsert призов: {str(e)}"
            ) from e
    
    async def update_delivery_data(
        self,
        telegram_id: int,
        code_word: str,
        delivery_data: Dict[str, str]
    ) -> bool:
        """
        Обновляет данные доставки для физического приза
        
        Обновляет поля: last_name, first_name, patronymic, city,
        street, house, apartment, phone, comment
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            delivery_data: Данные доставки (словарь с полями адреса)
        
        Returns:
            bool: True если запись успешно обновлена, False если приз не найден
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
            ValueError: Если переданы невалидные поля
        """
        start_time = time.time()
        
        # Валидация полей доставки
        valid_fields = {
            'last_name', 'first_name', 'patronymic', 'city',
            'street', 'house', 'apartment', 'phone', 'comment'
        }
        invalid_fields = set(delivery_data.keys()) - valid_fields
        if invalid_fields:
            raise ValueError(
                f"Невалидные поля доставки: {', '.join(invalid_fields)}"
            )
        
        try:
            async with self._get_session_context() as session:
                # Добавляем временную метку обновления
                delivery_data = delivery_data.copy()  # Не модифицируем оригинальный словарь
                delivery_data['updated_at'] = datetime.now(timezone.utc)
                
                # UPDATE запрос с условием
                stmt = (
                    update(Prize)
                    .where(
                        and_(
                            Prize.telegram_id == telegram_id,
                            Prize.code_word == code_word
                        )
                    )
                    .values(**delivery_data)
                )
                
                result = await session.execute(stmt)
                # Commit выполняется автоматически в контексте менеджере
                
                updated = result.rowcount > 0
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "delivery_data_update_completed",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    updated=updated,
                    fields_count=len(delivery_data),
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return updated
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "delivery_data_update_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при обновлении данных доставки: {str(e)}"
            ) from e
    
    async def check_user_exists(self, telegram_id: int) -> bool:
        """
        Проверяет наличие пользователя в таблице призов
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            bool: True если пользователь найден, False иначе
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Запрос на проверку существования пользователя
                query = select(Prize.id).where(Prize.telegram_id == telegram_id).limit(1)
                
                result = await session.execute(query)
                exists = result.scalar_one_or_none() is not None
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "user_existence_check_completed",
                    telegram_id=telegram_id,
                    exists=exists,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return exists
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "user_existence_check_error",
                telegram_id=telegram_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при проверке существования пользователя: {str(e)}"
            ) from e
    
    async def get_gdpr_consent_date(self, telegram_id: int) -> Optional[datetime]:
        """
        Получает дату GDPR согласия пользователя
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            datetime: Дата согласия или None если согласие не дано
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Запрос на получение даты согласия
                # Используем индекс idx_prizes_gdpr_consent для оптимизации
                query = select(Prize.gdpr_consent_date).where(
                    Prize.telegram_id == telegram_id
                ).limit(1)
                
                result = await session.execute(query)
                consent_date = result.scalar_one_or_none()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "gdpr_consent_check_completed",
                    telegram_id=telegram_id,
                    has_consent=consent_date is not None,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return consent_date
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "gdpr_consent_check_error",
                telegram_id=telegram_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при проверке GDPR согласия: {str(e)}"
            ) from e
    
    async def update_gdpr_consent(
        self,
        telegram_id: int,
        consent_date: datetime
    ) -> bool:
        """
        Сохраняет дату GDPR согласия пользователя
        
        Обновляет поле gdpr_consent_date для всех призов пользователя,
        так как согласие даётся один раз для всех призов.
        
        Args:
            telegram_id: Telegram ID пользователя
            consent_date: Дата и время согласия
        
        Returns:
            bool: True если записи успешно обновлены, False если пользователь не найден
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # UPDATE запрос для всех призов пользователя
                stmt = (
                    update(Prize)
                    .where(Prize.telegram_id == telegram_id)
                    .values(
                        gdpr_consent_date=consent_date,
                        updated_at=datetime.now(timezone.utc)
                    )
                )
                
                result = await session.execute(stmt)
                # Commit выполняется автоматически в контексте менеджере
                
                updated = result.rowcount > 0
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "gdpr_consent_update_completed",
                    telegram_id=telegram_id,
                    consent_date=consent_date.isoformat(),
                    updated=updated,
                    records_updated=result.rowcount,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return updated
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "gdpr_consent_update_error",
                telegram_id=telegram_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при сохранении GDPR согласия: {str(e)}"
            ) from e
    
    async def validate_prize_ownership(
        self,
        prize_id: int,
        telegram_id: int
    ) -> bool:
        """
        Проверяет, что prize_id принадлежит указанному пользователю
        
        Validates: Security Requirement 2
        
        Args:
            prize_id: ID приза для проверки
            telegram_id: Telegram ID пользователя
        
        Returns:
            bool: True если приз принадлежит пользователю, False иначе
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Запрос на проверку владения призом
                query = select(Prize.id).where(
                    and_(
                        Prize.id == prize_id,
                        Prize.telegram_id == telegram_id
                    )
                ).limit(1)
                
                result = await session.execute(query)
                is_owner = result.scalar_one_or_none() is not None
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "prize_ownership_validation_completed",
                    prize_id=prize_id,
                    telegram_id=telegram_id,
                    is_owner=is_owner,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                # Логирование попытки доступа к чужому призу
                if not is_owner:
                    logger.warning(
                        "unauthorized_prize_access_attempt",
                        prize_id=prize_id,
                        telegram_id=telegram_id
                    )
                
                return is_owner
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "prize_ownership_validation_error",
                prize_id=prize_id,
                telegram_id=telegram_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при проверке владения призом: {str(e)}"
            ) from e

