"""
Сервис для работы с призами.
Бизнес-логика проверки призов и выдачи.
"""

import asyncio
import time
from typing import Optional
from enum import Enum
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

from services.google_sheets_service import GoogleSheetsService
from services.update_queue_service import UpdateQueueService
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from database.models.prize import Prize
from config import get_config
from utils.logging_config import get_logger

logger = get_logger(__name__)


class PrizeStatus(Enum):
    """Статус проверки приза"""
    NOT_FOUND = "not_found"
    DIGITAL = "digital"
    PHYSICAL = "physical"


@dataclass
class PrizeResult:
    """Результат проверки приза"""
    status: PrizeStatus
    promo_code: Optional[str] = None
    instructions: Optional[str] = None
    row_id: Optional[int] = None
    prize_id: Optional[int] = None


class MissingPromoCodeError(Exception):
    """Исключение при отсутствии промокода для цифрового приза"""
    pass


class PrizeService:
    """Сервис для работы с призами"""
    
    def __init__(
        self, 
        sheets_service: GoogleSheetsService,
        prize_repository: Optional[PrizeRepository] = None,
        update_queue_service: Optional[UpdateQueueService] = None
    ):
        """
        Инициализирует сервис призов
        
        Args:
            sheets_service: Сервис для работы с Google Sheets
            prize_repository: Repository для работы с PostgreSQL (опционально)
            update_queue_service: Сервис очереди обновлений (опционально)
        """
        self.sheets_service = sheets_service
        self.prize_repository = prize_repository or PrizeRepository()
        self.update_queue_service = update_queue_service
        self.config = get_config()
        logger.info(
            "prize_service_initialized",
            use_postgres=self.config.sync.use_postgres
        )
    
    async def check_prize(
        self, 
        telegram_id: int, 
        code_word: str
    ) -> PrizeResult:
        """
        Проверяет наличие приза для пользователя
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово розыгрыша
            
        Returns:
            PrizeResult с информацией о призе
            
        Raises:
            MissingPromoCodeError: Если для цифрового приза отсутствует промокод
            DatabaseUnavailableError: Если БД недоступна (при use_postgres=True)
        """
        logger.info(
            "checking_prize",
            telegram_id=telegram_id,
            code_word=code_word,
            use_postgres=self.config.sync.use_postgres
        )
        
        start_time = time.time()
        
        # Проверка feature flag для выбора источника данных
        if self.config.sync.use_postgres:
            # Новая логика: поиск в PostgreSQL
            try:
                prize = await self._check_prize_postgres(telegram_id, code_word)
                
                # Логирование времени выполнения
                elapsed_ms = (time.time() - start_time) * 1000
                logger.info(
                    "prize_check_completed_postgres",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    found=prize.status != PrizeStatus.NOT_FOUND,
                    elapsed_ms=round(elapsed_ms, 2)
                )
                
                # Предупреждение о медленном поиске
                if elapsed_ms > 500:
                    logger.warning(
                        "slow_prize_check",
                        telegram_id=telegram_id,
                        code_word=code_word,
                        elapsed_ms=round(elapsed_ms, 2),
                        threshold_ms=500
                    )
                
                return prize
                
            except DatabaseUnavailableError as e:
                logger.error(
                    "database_unavailable_during_prize_check",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    error=str(e)
                )
                # Пробрасываем исключение наверх для обработки в хендлере
                raise
        else:
            # Старая логика: поиск в Google Sheets
            prize = await self._check_prize_sheets(telegram_id, code_word)
            
            # Логирование времени выполнения
            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(
                "prize_check_completed_sheets",
                telegram_id=telegram_id,
                code_word=code_word,
                found=prize.status != PrizeStatus.NOT_FOUND,
                elapsed_ms=round(elapsed_ms, 2)
            )
            
            return prize
    
    async def _check_prize_postgres(
        self,
        telegram_id: int,
        code_word: str
    ) -> PrizeResult:
        """
        Проверяет приз через PostgreSQL
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            
        Returns:
            PrizeResult с информацией о призе
            
        Raises:
            DatabaseUnavailableError: Если БД недоступна
            MissingPromoCodeError: Если для цифрового приза отсутствует промокод
        """
        # Поиск приза в PostgreSQL с таймаутом 500ms
        prize = await self.prize_repository.find_prize(
            telegram_id=telegram_id,
            code_word=code_word,
            timeout_ms=500
        )
        
        if not prize:
            logger.info(
                "prize_not_found_postgres",
                telegram_id=telegram_id,
                code_word=code_word
            )
            return PrizeResult(status=PrizeStatus.NOT_FOUND)
        
        # Обработка цифрового приза
        if prize.is_digital():
            promo_code = prize.promo_code
            instructions = prize.instructions
            
            # Проверка наличия промокода
            if not promo_code:
                logger.error(
                    "missing_promo_code_postgres",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    prize_id=prize.id
                )
                raise MissingPromoCodeError(
                    f"Промокод отсутствует для пользователя {telegram_id}"
                )
            
            # Отметка о получении приза (асинхронно)
            await self._mark_prize_claimed_async(
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=prize.row_id,
                sheet_name=prize.sheet_name
            )
            
            logger.info(
                "digital_prize_found_postgres",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_id=prize.id,
                has_promo_code=bool(promo_code)
            )
            
            return PrizeResult(
                status=PrizeStatus.DIGITAL,
                promo_code=promo_code,
                instructions=instructions or "Используйте промокод при оформлении заказа"
            )
        
        # Обработка физического приза
        elif prize.is_physical():
            # Отметка о получении приза (асинхронно)
            await self._mark_prize_claimed_async(
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=prize.row_id,
                sheet_name=prize.sheet_name
            )
            
            logger.info(
                "physical_prize_found_postgres",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_id=prize.id,
                row_id=prize.row_id
            )
            
            return PrizeResult(
                status=PrizeStatus.PHYSICAL,
                row_id=prize.row_id,
                prize_id=prize.id
            )
        
        else:
            logger.warning(
                "unknown_prize_type_postgres",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_type=prize.prize_type,
                prize_id=prize.id
            )
            return PrizeResult(status=PrizeStatus.NOT_FOUND)
    
    async def _check_prize_sheets(
        self,
        telegram_id: int,
        code_word: str
    ) -> PrizeResult:
        """
        Проверяет приз через Google Sheets (старая логика)
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            
        Returns:
            PrizeResult с информацией о призе
            
        Raises:
            MissingPromoCodeError: Если для цифрового приза отсутствует промокод
        """
        # Поиск в Google Sheets
        prize_data = await self.sheets_service.find_winner(telegram_id, code_word)
        
        if not prize_data:
            logger.info(
                "prize_not_found",
                telegram_id=telegram_id,
                code_word=code_word
            )
            return PrizeResult(status=PrizeStatus.NOT_FOUND)
        
        # Определение типа приза
        prize_type = prize_data.get('prize_type')
        
        if prize_type == 'digital':
            promo_code = prize_data.get('promo_code')
            instructions = prize_data.get('instructions')
            
            # Проверка наличия промокода
            if not promo_code:
                logger.error(
                    "missing_promo_code",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=prize_data.get('row_id')
                )
                raise MissingPromoCodeError(
                    f"Промокод отсутствует для пользователя {telegram_id}"
                )
            
            # Отметка о получении приза (асинхронно)
            await self._mark_prize_claimed_async(
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=prize_data.get('row_id'),
                sheet_name=code_word
            )
            
            logger.info(
                "digital_prize_found",
                telegram_id=telegram_id,
                code_word=code_word,
                has_promo_code=bool(promo_code)
            )
            
            return PrizeResult(
                status=PrizeStatus.DIGITAL,
                promo_code=promo_code,
                instructions=instructions or "Используйте промокод при оформлении заказа"
            )
        
        elif prize_type == 'physical':
            # Отметка о получении приза (асинхронно)
            await self._mark_prize_claimed_async(
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=prize_data.get('row_id'),
                sheet_name=code_word
            )
            
            logger.info(
                "physical_prize_found",
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=prize_data.get('row_id')
            )
            
            return PrizeResult(
                status=PrizeStatus.PHYSICAL,
                row_id=prize_data.get('row_id'),
                prize_id=prize_data.get('row_id')
            )
        
        else:
            logger.warning(
                "unknown_prize_type",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_type=prize_type
            )
            return PrizeResult(status=PrizeStatus.NOT_FOUND)
    
    async def _mark_prize_claimed_async(
        self,
        telegram_id: int,
        code_word: str,
        row_id: int,
        sheet_name: str
    ) -> None:
        """
        Отмечает приз как полученный через асинхронную очередь
        
        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            row_id: Номер строки в таблице
            sheet_name: Имя worksheet
        """
        try:
            # Получаем текущее время в МСК (UTC+3)
            from datetime import timedelta
            msk_tz = timezone(timedelta(hours=3))
            claimed_at = datetime.now(msk_tz).strftime('%d.%m.%Y %H:%M:%S')
            
            # Если есть сервис очереди - используем его (асинхронно)
            if self.update_queue_service:
                await self.update_queue_service.add_prize_claimed_update(
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=row_id,
                    claimed_at=claimed_at
                )
                
                logger.info(
                    "prize_claimed_queued_for_update",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=row_id,
                    claimed_at=claimed_at
                )
            else:
                # Fallback: синхронное обновление (старая логика)
                await self._mark_prize_claimed(row_id, sheet_name)
                
        except Exception as e:
            logger.error(
                "failed_to_mark_prize_claimed_async",
                error=str(e),
                telegram_id=telegram_id,
                code_word=code_word,
                row_id=row_id,
                sheet_name=sheet_name,
                exc_info=True
            )
            # Не прерываем выполнение, так как это не критично

    async def _mark_prize_claimed(
        self, 
        row_id: int, 
        worksheet_name: str
    ) -> None:
        """
        Отмечает приз как полученный (claimed_at) - fallback метод
        
        Args:
            row_id: Номер строки в таблице
            worksheet_name: Имя worksheet
        """
        try:
            # Получаем текущее время в МСК (UTC+3)
            from datetime import timedelta
            msk_tz = timezone(timedelta(hours=3))
            claimed_at = datetime.now(msk_tz).strftime('%d.%m.%Y %H:%M:%S')
            
            # Сохраняем отметку в столбец N (claimed_at)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._mark_prize_claimed_sync,
                row_id,
                worksheet_name,
                claimed_at
            )
            
            logger.info(
                "prize_marked_as_claimed",
                row_id=row_id,
                worksheet_name=worksheet_name,
                claimed_at=claimed_at
            )
            
        except Exception as e:
            logger.error(
                "failed_to_mark_prize_claimed",
                error=str(e),
                row_id=row_id,
                worksheet_name=worksheet_name
            )
            # Не прерываем выполнение, так как это не критично
    
    def _mark_prize_claimed_sync(
        self, 
        row_id: int, 
        worksheet_name: str,
        claimed_at: str
    ) -> None:
        """
        Синхронная отметка приза как полученного
        
        Args:
            row_id: Номер строки
            worksheet_name: Имя worksheet
            claimed_at: Время получения приза (формат: ДД.ММ.ГГГГ ЧЧ:ММ:СС МСК)
        """
        try:
            # Открываем таблицу
            sheet = self.sheets_service.client.open_by_key(
                self.sheets_service.spreadsheet_id
            )
            worksheet = sheet.worksheet(worksheet_name)
            
            # Обновляем ячейку N (столбец 14) с временем получения
            worksheet.update_cell(row_id, 14, claimed_at)
            
        except Exception as e:
            logger.error(
                "sync_mark_prize_claimed_error",
                error=str(e),
                row_id=row_id
            )
            raise
