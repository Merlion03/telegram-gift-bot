"""
Отметка приза как полученного: PostgreSQL + асинхронная очередь обновления
Google Sheets с fallback на синхронный путь.

Реализован как mixin для :class:`services.prize.service.PrizeService`.
Ожидает атрибуты ``self.prize_repository``, ``self.sheets_service`` и
``self.update_queue_service``.
"""

import asyncio
from datetime import datetime, timezone

from services.prize.types import MSK_TZ
from utils.logging_config import get_logger

logger = get_logger(__name__)


class ClaimMixin:
    """Методы отметки приза как полученного."""

    async def _mark_prize_claimed_async(
        self,
        telegram_id: int,
        code_word: str,
        row_id: int,
        sheet_name: str,
    ) -> None:
        """
        Отмечает приз как полученный через асинхронную очередь и обновляет
        PostgreSQL.

        Args:
            telegram_id: Telegram ID пользователя
            code_word: Кодовое слово
            row_id: Номер строки в таблице
            sheet_name: Имя worksheet
        """
        try:
            claimed_at_str = datetime.now(MSK_TZ).strftime('%d.%m.%Y %H:%M:%S')
            claimed_at_dt = datetime.now(timezone.utc)

            # Обновляем claimed_at в PostgreSQL
            try:
                await self.prize_repository.mark_prize_claimed(
                    telegram_id=telegram_id,
                    code_word=code_word,
                    claimed_at=claimed_at_dt,
                )
                logger.info(
                    "prize_claimed_updated_in_postgres",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    claimed_at=claimed_at_dt.isoformat(),
                )
            except Exception as db_error:
                logger.error(
                    "failed_to_update_claimed_at_in_postgres",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    error=str(db_error),
                    exc_info=True,
                )
                # Продолжаем выполнение — обновление PG не критично здесь.

            # Если есть сервис очереди — используем его (асинхронно)
            if self.update_queue_service:
                await self.update_queue_service.add_prize_claimed_update(
                    telegram_id=telegram_id,
                    code_word=code_word,
                    sheet_name=sheet_name,
                    row_id=row_id,
                    claimed_at=claimed_at_str,
                )

                logger.info(
                    "prize_claimed_queued_for_update",
                    telegram_id=telegram_id,
                    code_word=code_word,
                    row_id=row_id,
                    claimed_at=claimed_at_str,
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
                exc_info=True,
            )
            # Не прерываем выполнение, отметка приза не критична для UX.

    async def _mark_prize_claimed(
        self,
        row_id: int,
        worksheet_name: str,
    ) -> None:
        """
        Отмечает приз как полученный (claimed_at) — fallback метод.

        Args:
            row_id: Номер строки в таблице
            worksheet_name: Имя worksheet
        """
        try:
            claimed_at = datetime.now(MSK_TZ).strftime('%d.%m.%Y %H:%M:%S')

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._mark_prize_claimed_sync,
                row_id,
                worksheet_name,
                claimed_at,
            )

            logger.info(
                "prize_marked_as_claimed",
                row_id=row_id,
                worksheet_name=worksheet_name,
                claimed_at=claimed_at,
            )

        except Exception as e:
            logger.error(
                "failed_to_mark_prize_claimed",
                error=str(e),
                row_id=row_id,
                worksheet_name=worksheet_name,
            )
            # Не прерываем выполнение, отметка приза не критична для UX.

    def _mark_prize_claimed_sync(
        self,
        row_id: int,
        worksheet_name: str,
        claimed_at: str,
    ) -> None:
        """
        Синхронная отметка приза как полученного.

        Args:
            row_id: Номер строки
            worksheet_name: Имя worksheet
            claimed_at: Время получения приза (формат: ДД.ММ.ГГГГ ЧЧ:ММ:СС МСК)
        """
        try:
            sheet = self.sheets_service.client.open_by_key(
                self.sheets_service.spreadsheet_id,
            )
            worksheet = sheet.worksheet(worksheet_name)

            # Обновляем ячейку N (столбец 14) с временем получения
            worksheet.update_cell(row_id, 14, claimed_at)

        except Exception as e:
            logger.error(
                "sync_mark_prize_claimed_error",
                error=str(e),
                row_id=row_id,
            )
            raise
