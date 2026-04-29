"""
Обратная синхронизация: PostgreSQL → Google Sheets.

Реализован как mixin для :class:`services.sync.service.SyncService`.
Ожидает атрибуты ``self.client``, ``self.google_sheets_config`` и
``self.prize_repository``.
"""

import asyncio
import time
from typing import Any, Dict, List

import gspread

from database.models.prize import Prize
from database.repositories.exceptions import DatabaseUnavailableError
from utils.logging_config import get_logger

logger = get_logger(__name__)


def _record_backward_error(
    stats: Dict[str, Any],
    e: Exception,
    *,
    sheet_name: str,
    error_type: str,
) -> None:
    """Добавляет ошибку конкретного листа в статистику обратной синхронизации."""
    stats['errors'].append({
        'sheet_name': sheet_name,
        'error': str(e),
        'error_type': error_type,
    })


class BackwardSyncMixin:
    """Обратная синхронизация PostgreSQL → Google Sheets."""

    async def sync_delivery_data_to_sheets(self) -> Dict[str, Any]:
        """
        Синхронизирует данные доставки из PostgreSQL в Google Sheets.

        Вызывается периодически из Sync_Worker после прямой синхронизации,
        чтобы данные, сохранённые через Delivery_API, появились в таблице.

        Обновляются столбцы G–R (данные доставки + claimed_at).
        Все ошибки логируются и возвращаются в поле ``errors`` статистики;
        исключения наружу не выбрасываются.

        Returns:
            Dict[str, Any]: ``records_processed``, ``records_updated``,
            ``sheets_updated``, ``errors`` и ``elapsed_seconds``.

        Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 10.4, 10.5, 18.1
        """
        start_time = time.time()
        stats: Dict[str, Any] = {
            'records_processed': 0,
            'records_updated': 0,
            'sheets_updated': 0,
            'errors': [],
        }

        try:
            logger.info("backward_sync_started")

            # TODO: хранить last_sync_timestamp для инкрементальной синхронизации
            try:
                prizes = await self.prize_repository.get_claimed_prizes_for_sync(
                    last_sync_timestamp=None,
                )
                stats['records_processed'] = len(prizes)

                logger.info(
                    "claimed_prizes_retrieved_for_sync",
                    count=len(prizes),
                )

                if not prizes:
                    logger.info("no_prizes_to_sync")
                    stats['elapsed_seconds'] = round(time.time() - start_time, 2)
                    return stats

            except DatabaseUnavailableError as e:
                logger.error(
                    "database_unavailable_during_backward_sync",
                    error=str(e),
                    exc_info=True,
                )
                stats['errors'].append({
                    'stage': 'database_query',
                    'error': str(e),
                    'error_type': 'DatabaseUnavailableError',
                })
                stats['elapsed_seconds'] = round(time.time() - start_time, 2)
                return stats

            # Группируем призы по листу для batch операций
            prizes_by_sheet: Dict[str, List[Prize]] = {}
            for prize in prizes:
                prizes_by_sheet.setdefault(prize.sheet_name, []).append(prize)

            logger.info(
                "prizes_grouped_by_sheet",
                sheets_count=len(prizes_by_sheet),
                sheet_names=list(prizes_by_sheet.keys()),
            )

            for sheet_name, sheet_prizes in prizes_by_sheet.items():
                try:
                    updated_count = await self._sync_sheet_delivery_data(
                        sheet_name,
                        sheet_prizes,
                    )

                    stats['records_updated'] += updated_count
                    stats['sheets_updated'] += 1

                    logger.info(
                        "sheet_backward_sync_completed",
                        sheet_name=sheet_name,
                        records_updated=updated_count,
                    )

                except gspread.exceptions.APIError as e:
                    logger.error(
                        "google_sheets_api_error_backward_sync",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True,
                    )
                    _record_backward_error(
                        stats, e,
                        sheet_name=sheet_name,
                        error_type='GoogleSheetsAPIError',
                    )
                    continue

                except Exception as e:
                    logger.error(
                        "unexpected_error_backward_sync_sheet",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True,
                    )
                    _record_backward_error(
                        stats, e,
                        sheet_name=sheet_name,
                        error_type=type(e).__name__,
                    )
                    continue

            elapsed_time = time.time() - start_time
            stats['elapsed_seconds'] = round(elapsed_time, 2)

            logger.info("backward_sync_completed", **stats)
            return stats

        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                "backward_sync_critical_failure",
                error=str(e),
                elapsed_seconds=round(elapsed_time, 2),
                exc_info=True,
            )
            stats['errors'].append({
                'stage': 'backward_sync',
                'error': str(e),
                'error_type': type(e).__name__,
            })
            stats['elapsed_seconds'] = round(elapsed_time, 2)
            return stats

    async def _sync_sheet_delivery_data(
        self,
        sheet_name: str,
        prizes: List[Prize],
    ) -> int:
        """
        Синхронизирует данные доставки для одного листа Google Sheets.

        Обновляет столбцы G–R через batch update.
        """
        if not prizes:
            return 0

        try:
            logger.info(
                "sheet_backward_sync_started",
                sheet_name=sheet_name,
                records_count=len(prizes),
            )

            loop = asyncio.get_event_loop()
            spreadsheet = await loop.run_in_executor(
                None,
                self.client.open_by_key,
                self.google_sheets_config.spreadsheet_id,
            )
            worksheet = await loop.run_in_executor(
                None,
                spreadsheet.worksheet,
                sheet_name,
            )

            # Структура столбцов:
            # G: last_name   H: first_name  I: patronymic
            # J: city        K: street      L: house
            # M: apartment   N: phone       O: comment
            # P: country     Q: postal_code R: claimed_at
            batch_data = []
            for prize in prizes:
                row_data = [
                    prize.last_name or '',
                    prize.first_name or '',
                    prize.patronymic or '',
                    prize.city or '',
                    prize.street or '',
                    prize.house or '',
                    prize.apartment or '',
                    prize.phone or '',
                    prize.comment or '',
                    prize.country or '',
                    prize.postal_code or '',
                    prize.claimed_at.isoformat() if prize.claimed_at else '',
                ]

                batch_data.append({
                    'range': f'G{prize.row_id}:R{prize.row_id}',
                    'values': [row_data],
                })

            await loop.run_in_executor(
                None,
                worksheet.batch_update,
                batch_data,
            )

            logger.info(
                "sheet_backward_sync_batch_update_completed",
                sheet_name=sheet_name,
                records_updated=len(prizes),
            )

            return len(prizes)

        except gspread.exceptions.WorksheetNotFound:
            logger.error(
                "worksheet_not_found_backward_sync",
                sheet_name=sheet_name,
            )
            raise

        except Exception as e:
            logger.error(
                "sheet_backward_sync_error",
                sheet_name=sheet_name,
                error=str(e),
                exc_info=True,
            )
            raise
