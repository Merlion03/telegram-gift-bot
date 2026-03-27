"""
Repository для получения информации о призе по prize_id

Предоставляет методы для получения информации о призе (sheet_name, row_id, code_word)
для использования в Backend API endpoint.
"""
from typing import Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.prize import Prize
from database.base_repository import BaseRepository
from utils.logging_config import get_logger


logger = get_logger(__name__)


class PrizeInfoRepository(BaseRepository):
    """
    Repository для получения информации о призе по prize_id
    
    Предоставляет метод get_prize_info для получения данных о призе,
    необходимых для сохранения данных доставки в Google Sheets.
    """
    
    async def get_prize_info(self, prize_id: int) -> Optional[Dict[str, Any]]:
        """
        Получает информацию о призе по prize_id
        
        Args:
            prize_id: ID приза (соответствует row_id в Google Sheets)
        
        Returns:
            Dict с полями sheet_name, row_id, code_word или None если приз не найден
        
        Raises:
            Exception: При ошибке работы с базой данных
        """
        try:
            async with self._get_session_context() as session:
                # SELECT запрос для получения информации о призе
                query = select(
                    Prize.sheet_name,
                    Prize.row_id,
                    Prize.code_word
                ).where(Prize.id == prize_id)
                
                result = await session.execute(query)
                row = result.first()
                
                if row is None:
                    logger.info(
                        "prize_not_found",
                        prize_id=prize_id
                    )
                    return None
                
                prize_info = {
                    'sheet_name': row.sheet_name,
                    'row_id': row.row_id,
                    'code_word': row.code_word
                }
                
                logger.info(
                    "prize_info_retrieved",
                    prize_id=prize_id,
                    sheet_name=row.sheet_name,
                    row_id=row.row_id
                )
                
                return prize_info
                
        except Exception as e:
            logger.error(
                "prize_info_retrieval_error",
                prize_id=prize_id,
                error=str(e),
                exc_info=True
            )
            raise
