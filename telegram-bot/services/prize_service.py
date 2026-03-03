"""
Сервис для работы с призами.
Бизнес-логика проверки призов и выдачи.
"""

import asyncio
from typing import Optional
from enum import Enum
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import structlog

from services.google_sheets_service import GoogleSheetsService

logger = structlog.get_logger(__name__)


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
    
    def __init__(self, sheets_service: GoogleSheetsService):
        """
        Инициализирует сервис призов
        
        Args:
            sheets_service: Сервис для работы с Google Sheets
        """
        self.sheets_service = sheets_service
        logger.info("prize_service_initialized")
    
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
        """
        logger.info(
            "checking_prize",
            telegram_id=telegram_id,
            code_word=code_word
        )
        
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
            
            # Отметка о получении приза
            await self._mark_prize_claimed(
                prize_data.get('row_id'),
                code_word
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
            # Отметка о получении приза
            await self._mark_prize_claimed(
                prize_data.get('row_id'),
                code_word
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
    
    async def _mark_prize_claimed(
        self, 
        row_id: int, 
        worksheet_name: str
    ) -> None:
        """
        Отмечает приз как полученный (claimed_at)
        
        Args:
            row_id: Номер строки в таблице
            worksheet_name: Имя worksheet
        """
        try:
            # Получаем текущее время в МСК (UTC+3)
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
