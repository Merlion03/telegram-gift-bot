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

from sqlalchemy import select, and_, update, case, func, tuple_
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


class PrizeNotFoundError(Exception):
    """Исключение при отсутствии приза в базе данных"""
    pass


class PrizeNotFoundError(Exception):
    """Исключение при отсутствии приза в базе данных"""
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
        
        ЗАЩИТА ОТ ПЕРЕЗАПИСИ: Если запись имеет claimed_at IS NOT NULL,
        то поля данных доставки НЕ перезаписываются из Google Sheets.
        PostgreSQL является источником истины для данных доставки.
        
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
        protected_count = 0  # Счётчик защищённых записей
        
        # Поля данных доставки, которые защищены от перезаписи
        DELIVERY_DATA_FIELDS = {
            'last_name', 'first_name', 'patronymic',
            'country', 'postal_code', 'city', 'street',
            'house', 'apartment', 'phone', 'comment'
        }
        
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
                    
                    # При конфликте обновляем поля с учётом защиты данных доставки
                    # Используем CASE WHEN для условного обновления:
                    # - Если claimed_at IS NULL, обновляем все поля
                    # - Если claimed_at IS NOT NULL, НЕ обновляем поля данных доставки
                    update_dict = {}
                    for col in Prize.__table__.columns:
                        col_name = col.name
                        
                        # Пропускаем поля, которые никогда не обновляются
                        if col_name in ('id', 'created_at', 'claimed_at', 'gdpr_consent_date'):
                            continue
                        
                        # Для полей данных доставки используем условное обновление
                        if col_name in DELIVERY_DATA_FIELDS:
                            # Обновляем только если claimed_at IS NULL
                            # Иначе сохраняем существующее значение
                            update_dict[col_name] = case(
                                (Prize.claimed_at.is_(None), getattr(stmt.excluded, col_name)),
                                else_=getattr(Prize, col_name)
                            )
                        else:
                            # Остальные поля обновляем всегда
                            update_dict[col_name] = getattr(stmt.excluded, col_name)
                    
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
                        
                        # При конфликте обновляем поля с учётом защиты данных доставки
                        # Используем CASE WHEN для условного обновления:
                        # - Если claimed_at IS NULL, обновляем все поля
                        # - Если claimed_at IS NOT NULL, НЕ обновляем поля данных доставки
                        update_dict = {}
                        for col in Prize.__table__.columns:
                            col_name = col.name
                            
                            # Пропускаем поля, которые никогда не обновляются
                            if col_name in ('id', 'created_at', 'claimed_at', 'gdpr_consent_date'):
                                continue
                            
                            # Для полей данных доставки используем условное обновление
                            if col_name in DELIVERY_DATA_FIELDS:
                                # Обновляем только если claimed_at IS NULL
                                # Иначе сохраняем существующее значение
                                update_dict[col_name] = case(
                                    (Prize.claimed_at.is_(None), getattr(stmt.excluded, col_name)),
                                    else_=getattr(Prize, col_name)
                                )
                            else:
                                # Остальные поля обновляем всегда
                                update_dict[col_name] = getattr(stmt.excluded, col_name)
                        
                        stmt = stmt.on_conflict_do_update(
                            index_elements=['telegram_id', 'code_word'],
                            set_=update_dict
                        )
                        
                        await session.execute(stmt)
                    
                    # Commit выполняется автоматически в контексте менеджере
                    processed_count = len(prizes_data)
                    
                    # Подсчитываем количество защищённых записей для логирования
                    result = await session.execute(
                        select(func.count()).select_from(Prize).where(
                            Prize.claimed_at.isnot(None)
                        ).where(
                            tuple_(Prize.telegram_id, Prize.code_word).in_(
                                [(p['telegram_id'], p['code_word']) for p in prizes_data]
                            )
                        )
                    )
                    protected_count = result.scalar() or 0
            
            # Логирование времени выполнения
            elapsed_ms = (time.time() - start_time) * 1000
            
            logger.info(
                "batch_upsert_completed",
                records_count=processed_count,
                protected_records=protected_count,
                elapsed_ms=round(elapsed_ms, 2),
                records_per_second=round(processed_count / (elapsed_ms / 1000), 2)
            )
            
            if protected_count > 0:
                logger.info(
                    "delivery_data_protection_applied",
                    protected_records=protected_count,
                    message="Данные доставки защищены от перезаписи для записей с claimed_at IS NOT NULL"
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
        Проверяет наличие пользователя в таблице призов независимо от статуса получения приза (claimed_at)
        
        Args:
            telegram_id: Telegram ID пользователя
        
        Returns:
            bool: True если пользователь существует в таблице призов, False иначе
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Запрос на проверку существования пользователя в таблице призов
                query = select(Prize.id).where(
                    Prize.telegram_id == telegram_id
                ).limit(1)
                
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


    async def mark_prize_claimed(
        self,
        telegram_id: int,
        code_word: str,
        claimed_at: datetime
    ) -> bool:
        """
        Отмечает приз как полученный (устанавливает claimed_at)
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            claimed_at: Дата и время получения приза
        
        Returns:
            bool: True если успешно обновлено, False иначе
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Обновляем claimed_at для приза
                stmt = update(Prize).where(
                    and_(
                        Prize.telegram_id == telegram_id,
                        Prize.code_word == code_word
                    )
                ).values(claimed_at=claimed_at)
                
                result = await session.execute(stmt)
                await session.commit()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "prize_claimed_marked",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    claimed_at=claimed_at.isoformat(),
                    rows_updated=result.rowcount,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return result.rowcount > 0
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "mark_prize_claimed_error",
                telegram_id=telegram_id,
                code_word=code_word,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при отметке приза как полученного: {str(e)}"
            ) from e


    async def find_prize_by_id(
        self,
        prize_id: int
    ) -> Optional[Prize]:
        """
        Находит приз по ID
        
        Args:
            prize_id: ID приза
        
        Returns:
            Prize или None если не найден
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                query = select(Prize).where(Prize.id == prize_id)
                
                result = await session.execute(query)
                prize = result.scalar_one_or_none()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "prize_find_by_id_completed",
                    prize_id=prize_id,
                    found=prize is not None,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return prize
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "prize_find_by_id_error",
                prize_id=prize_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при поиске приза по ID: {str(e)}"
            ) from e

    async def update_delivery_data_by_prize_id(
        self,
        prize_id: int,
        delivery_data: Dict[str, Any]
    ) -> Prize:
        """
        Обновляет данные доставки для приза по prize_id
        
        НАЗНАЧЕНИЕ:
        Метод используется для сохранения данных доставки физического приза в PostgreSQL.
        Вызывается из Backend API endpoint /api/delivery/update после валидации владения призом.
        
        ОБНОВЛЯЕМЫЕ ПОЛЯ:
        - Персональные данные: last_name, first_name, patronymic
        - Адрес доставки: country, postal_code, city, street, house, apartment
        - Контактные данные: phone
        - Дополнительно: comment
        
        АВТОМАТИЧЕСКИЕ ПОЛЯ:
        - claimed_at: устанавливается в текущее время UTC при первом обновлении (если NULL)
        - updated_at: автоматически обновляется на текущее время UTC при каждом обновлении
        
        ВАЛИДАЦИЯ:
        - Проверяет существование prize_id в таблице prizes
        - Валидирует, что переданы только разрешённые поля (из списка valid_fields)
        - Отклоняет невалидные поля с исключением ValueError
        
        ТРАНЗАКЦИОННОСТЬ:
        - Все обновления выполняются в рамках одной транзакции
        - При ошибке транзакция автоматически откатывается
        - Использует _get_session_context() для управления сессиями
        
        ПРОИЗВОДИТЕЛЬНОСТЬ:
        - Ожидаемое время выполнения: < 100 мс
        - Логирует предупреждение, если запрос выполняется дольше 100 мс
        - Использует индексы для быстрого поиска по prize_id
        
        Args:
            prize_id (int): Уникальный идентификатор приза в таблице prizes
            delivery_data (Dict[str, Any]): Словарь с данными доставки.
                Допустимые ключи: last_name, first_name, patronymic, country, 
                postal_code, city, street, house, apartment, phone, comment
        
        Returns:
            Prize: Обновлённый объект Prize со всеми актуальными данными,
                включая автоматически установленные claimed_at и updated_at
        
        Raises:
            PrizeNotFoundError: Если приз с указанным prize_id не найден в БД
            DatabaseUnavailableError: Если БД недоступна или произошла ошибка транзакции
            ValueError: Если в delivery_data переданы невалидные поля (не из списка valid_fields)
        
        Example:
            >>> delivery_data = {
            ...     'last_name': 'Иванов',
            ...     'first_name': 'Иван',
            ...     'country': 'Россия',
            ...     'postal_code': '123456',
            ...     'city': 'Москва',
            ...     'street': 'Ленина',
            ...     'house': '10',
            ...     'phone': '+79991234567'
            ... }
            >>> prize = await repo.update_delivery_data_by_prize_id(123, delivery_data)
            >>> print(prize.claimed_at)  # datetime.datetime(2024, 1, 15, 12, 30, 0, tzinfo=timezone.utc)
        
        Validates: Requirements 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5
        """
        start_time = time.time()
        
        # Валидация полей доставки
        valid_fields = {
            'last_name', 'first_name', 'patronymic', 'country', 'postal_code',
            'city', 'street', 'house', 'apartment', 'phone', 'comment'
        }
        invalid_fields = set(delivery_data.keys()) - valid_fields
        if invalid_fields:
            raise ValueError(
                f"Невалидные поля доставки: {', '.join(invalid_fields)}"
            )
        
        try:
            async with self._get_session_context() as session:
                # Сначала проверяем существование приза
                check_query = select(Prize).where(Prize.id == prize_id)
                check_result = await session.execute(check_query)
                existing_prize = check_result.scalar_one_or_none()
                
                if existing_prize is None:
                    raise PrizeNotFoundError(
                        f"Приз с ID {prize_id} не найден"
                    )
                
                # Подготавливаем данные для обновления
                update_data = delivery_data.copy()
                update_data['updated_at'] = datetime.now(timezone.utc)
                
                # Устанавливаем claimed_at, если оно ещё не установлено
                if existing_prize.claimed_at is None:
                    update_data['claimed_at'] = datetime.now(timezone.utc)
                
                # Выполняем UPDATE запрос
                stmt = (
                    update(Prize)
                    .where(Prize.id == prize_id)
                    .values(**update_data)
                    .returning(Prize)
                )
                
                result = await session.execute(stmt)
                updated_prize = result.scalar_one()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "delivery_data_update_by_prize_id_completed",
                    prize_id=prize_id,
                    fields_count=len(delivery_data),
                    claimed_at_set=existing_prize.claimed_at is None,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                # Предупреждение о медленном запросе
                if elapsed_ms > 100:
                    logger.warning(
                        "slow_delivery_data_update",
                        prize_id=prize_id,
                        elapsed_ms=round(elapsed_ms, 2),
                        threshold_ms=100
                    )
                
                return updated_prize
            
        except PrizeNotFoundError:
            # Пробрасываем PrizeNotFoundError без изменений
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "prize_not_found_for_delivery_update",
                prize_id=prize_id,
                elapsed_ms=round(elapsed_ms, 2)
            )
            raise
            
        except ValueError:
            # Пробрасываем ValueError без изменений
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "invalid_delivery_data_fields",
                prize_id=prize_id,
                invalid_fields=list(invalid_fields),
                elapsed_ms=round(elapsed_ms, 2)
            )
            raise
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "delivery_data_update_by_prize_id_error",
                prize_id=prize_id,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при обновлении данных доставки: {str(e)}"
            ) from e

    async def get_claimed_prizes_for_sync(
        self,
        last_sync_timestamp: Optional[datetime] = None
    ) -> List[Prize]:
        """
        Получает записи с данными доставки для обратной синхронизации в Google Sheets
        
        Находит все записи с claimed_at IS NOT NULL. Если указан last_sync_timestamp,
        возвращает только записи с updated_at > last_sync_timestamp для инкрементальной синхронизации.
        
        Использует индекс idx_prizes_sync_delivery для оптимизации запроса.
        
        Validates: Requirements 5.2, 12.3, 18.5
        
        Args:
            last_sync_timestamp: Временная метка последней синхронизации (опционально)
        
        Returns:
            List[Prize]: Список призов с данными доставки для синхронизации
        
        Raises:
            DatabaseUnavailableError: Если БД недоступна
        """
        start_time = time.time()
        
        try:
            async with self._get_session_context() as session:
                # Базовый запрос: все записи с claimed_at IS NOT NULL
                query = select(Prize).where(Prize.claimed_at.isnot(None))
                
                # Инкрементальная синхронизация: только обновлённые записи
                if last_sync_timestamp is not None:
                    query = query.where(Prize.updated_at > last_sync_timestamp)
                
                # Сортировка для предсказуемого порядка обработки
                query = query.order_by(Prize.sheet_name, Prize.row_id)
                
                result = await session.execute(query)
                prizes = result.scalars().all()
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                
                logger.info(
                    "get_claimed_prizes_for_sync_completed",
                    records_found=len(prizes),
                    incremental=last_sync_timestamp is not None,
                    last_sync_timestamp=last_sync_timestamp.isoformat() if last_sync_timestamp else None,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                return list(prizes)
                
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(
                "get_claimed_prizes_for_sync_error",
                last_sync_timestamp=last_sync_timestamp.isoformat() if last_sync_timestamp else None,
                error=str(e),
                elapsed_ms=round(elapsed_ms, 2),
                exc_info=True
            )
            
            raise DatabaseUnavailableError(
                f"Ошибка при получении призов для синхронизации: {str(e)}"
            ) from e
