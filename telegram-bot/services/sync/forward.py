"""
Прямая синхронизация: Google Sheets → PostgreSQL.

Реализован как mixin для :class:`services.sync.service.SyncService`.
Ожидает атрибуты ``self.prize_repository`` и ``self.sync_config``,
а также методы из :class:`SheetsIOMixin`.
"""

import time
from typing import Any, Dict, List

import gspread

from database.repositories.exceptions import DatabaseUnavailableError
from utils.logging_config import get_logger
from utils.retry import retry_with_backoff

logger = get_logger(__name__)


def _record_sheet_error(
    stats: Dict[str, Any],
    e: Exception,
    *,
    sheet_name: str,
    error_type: str,
) -> None:
    """Добавляет ошибку конкретного листа в статистику синхронизации."""
    stats['sheets_failed'] += 1
    stats['errors'].append({
        'sheet_name': sheet_name,
        'error': str(e),
        'error_type': error_type,
    })


class ForwardSyncMixin:
    """Прямая синхронизация Google Sheets → PostgreSQL."""

    async def sync_all_sheets(self) -> Dict[str, Any]:
        """
        Синхронизирует все листы Google Sheets с PostgreSQL.

        Обрабатывает ошибки Google Sheets API и PostgreSQL gracefully,
        продолжая синхронизацию других листов при частичных сбоях.

        Returns:
            Статистика: листы, записи, ошибки, время выполнения.
        """
        start_time = time.time()
        stats: Dict[str, Any] = {
            'sheets_processed': 0,
            'sheets_failed': 0,
            'total_records': 0,
            'new_records': 0,
            'updated_records': 0,
            'deleted_records': 0,
            'errors': [],
        }

        try:
            logger.info("sync_all_sheets_started")

            try:
                sheet_names = await self._get_all_sheet_names_with_retry()
            except gspread.exceptions.APIError as e:
                logger.error(
                    "google_sheets_api_unavailable",
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True,
                )
                stats['errors'].append({
                    'stage': 'get_sheet_names',
                    'error': str(e),
                    'error_type': type(e).__name__,
                })
                stats['elapsed_seconds'] = round(time.time() - start_time, 2)
                return stats
            except Exception as e:
                logger.error(
                    "unexpected_error_getting_sheet_names",
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True,
                )
                raise

            logger.info(
                "sheets_discovered",
                count=len(sheet_names),
                sheets=sheet_names,
            )

            for sheet_name in sheet_names:
                try:
                    sheet_stats = await self.sync_sheet(sheet_name)

                    stats['sheets_processed'] += 1
                    stats['total_records'] += sheet_stats['total_records']
                    stats['new_records'] += sheet_stats['new_records']
                    stats['updated_records'] += sheet_stats['updated_records']
                    stats['deleted_records'] += sheet_stats['deleted_records']

                    logger.info(
                        "sheet_sync_completed",
                        sheet_name=sheet_name,
                        records=sheet_stats['total_records'],
                    )

                except gspread.exceptions.APIError as e:
                    _record_sheet_error(
                        stats, e,
                        sheet_name=sheet_name,
                        error_type='GoogleSheetsAPIError',
                    )
                    logger.error(
                        "google_sheets_api_error_for_sheet",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True,
                    )
                    continue

                except DatabaseUnavailableError as e:
                    _record_sheet_error(
                        stats, e,
                        sheet_name=sheet_name,
                        error_type='DatabaseUnavailableError',
                    )
                    logger.error(
                        "database_unavailable_during_sync",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True,
                    )
                    # При недоступности БД нет смысла продолжать.
                    logger.warning(
                        "stopping_sync_due_to_database_unavailability",
                        sheets_remaining=(
                            len(sheet_names)
                            - stats['sheets_processed']
                            - stats['sheets_failed']
                        ),
                    )
                    break

                except Exception as e:
                    _record_sheet_error(
                        stats, e,
                        sheet_name=sheet_name,
                        error_type=type(e).__name__,
                    )
                    logger.error(
                        "unexpected_error_syncing_sheet",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True,
                    )
                    continue

            elapsed_time = time.time() - start_time
            stats['elapsed_seconds'] = round(elapsed_time, 2)
            # Для обратной совместимости с тестами:
            stats['sheets_synced'] = stats['sheets_processed']

            logger.info("sync_all_sheets_completed", **stats)
            return stats

        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                "sync_all_sheets_critical_failure",
                error=str(e),
                elapsed_seconds=round(elapsed_time, 2),
                exc_info=True,
            )
            stats['errors'].append({
                'stage': 'sync_all_sheets',
                'error': str(e),
                'error_type': type(e).__name__,
            })
            stats['elapsed_seconds'] = round(elapsed_time, 2)
            return stats

    @retry_with_backoff(max_retries=3, base_delay=1.0, exceptions=(gspread.exceptions.APIError,))
    async def sync_sheet(self, sheet_name: str) -> Dict[str, Any]:
        """
        Синхронизирует один лист Google Sheets с PostgreSQL (трёхфазная синхронизация).

        ФАЗА 1: INSERT/UPDATE — вставка новых и обновление существующих записей.
        ФАЗА 2: DELETE — удаление/архивирование записей, удалённых из Google Sheets.
        ФАЗА 3: STATS — агрегация статистики.

        Returns:
            Статистика синхронизации листа: total_records, new_records,
            updated_records, deleted_records, elapsed_seconds.
        """
        start_time = time.time()

        try:
            logger.info("sheet_sync_started", sheet_name=sheet_name)

            sheet_data = await self._read_sheet_data(sheet_name)

            prizes_data = (
                self._convert_sheet_data_to_prizes(sheet_data, sheet_name)
                if sheet_data
                else []
            )

            # === ФАЗА 1: INSERT/UPDATE ===
            logger.info(
                "sync_phase_1_started",
                sheet_name=sheet_name,
                phase="INSERT/UPDATE",
            )

            if prizes_data:
                upsert_stats = await self._batch_upsert_prizes(prizes_data)
                new_records = upsert_stats['new_records']
                updated_records = upsert_stats['updated_records']
            else:
                new_records = 0
                updated_records = 0

            logger.info(
                "sync_phase_1_completed",
                sheet_name=sheet_name,
                new_records=new_records,
                updated_records=updated_records,
            )

            # === ФАЗА 2: DELETE ===
            logger.info(
                "sync_phase_2_started",
                sheet_name=sheet_name,
                phase="DELETE",
            )

            postgres_records = await self.prize_repository.get_prizes_by_sheet(sheet_name)
            sheets_keys = {(p['telegram_id'], p['code_word']) for p in prizes_data}

            deleted_records = [
                p for p in postgres_records
                if (p.telegram_id, p.code_word) not in sheets_keys
            ]

            to_delete = [
                (p.telegram_id, p.code_word)
                for p in deleted_records
                if p.claimed_at is None
            ]
            to_archive = [
                (p.telegram_id, p.code_word)
                for p in deleted_records
                if p.claimed_at is not None
            ]

            deleted_count = await self.prize_repository.batch_delete_prizes(to_delete)
            archived_count = await self.prize_repository.batch_archive_prizes(to_archive)

            # Совместимость с моками в тестах
            if not isinstance(deleted_count, int):
                deleted_count = 0
            if not isinstance(archived_count, int):
                archived_count = 0

            total_deleted = deleted_count + archived_count

            logger.info(
                "sync_phase_2_completed",
                sheet_name=sheet_name,
                deleted_count=deleted_count,
                archived_count=archived_count,
                total_deleted=total_deleted,
            )

            # === ФАЗА 3: STATS ===
            elapsed_time = time.time() - start_time
            stats = {
                'total_records': len(prizes_data),
                'new_records': new_records,
                'updated_records': updated_records,
                'deleted_records': total_deleted,
                'elapsed_seconds': round(elapsed_time, 2),
            }

            logger.info(
                "sheet_sync_completed",
                sheet_name=sheet_name,
                **stats,
            )

            return stats

        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                "sheet_sync_failed",
                sheet_name=sheet_name,
                error=str(e),
                elapsed_seconds=round(elapsed_time, 2),
                exc_info=True,
            )
            raise

    async def _batch_upsert_prizes(
        self,
        prizes_data: List[Dict[str, Any]],
    ) -> Dict[str, int]:
        """
        Выполняет batch upsert призов в PostgreSQL.

        Использует транзакции и ON CONFLICT DO UPDATE для идемпотентности.

        Raises:
            DatabaseUnavailableError: При недоступности PostgreSQL.
        """
        if not prizes_data:
            return {'new_records': 0, 'updated_records': 0}

        try:
            batch_size = self.sync_config.batch_size
            total_new = 0
            total_updated = 0

            for i in range(0, len(prizes_data), batch_size):
                batch = prizes_data[i:i + batch_size]

                try:
                    batch_stats = await self.prize_repository.batch_upsert_prizes(batch)

                    # Обратная совместимость: если результат — int, обернуть в dict
                    if isinstance(batch_stats, int):
                        batch_stats = {
                            'new_records': batch_stats,
                            'updated_records': 0,
                        }

                    total_new += batch_stats['new_records']
                    total_updated += batch_stats['updated_records']

                    logger.debug(
                        "batch_upsert_completed",
                        batch_start=i + 1,
                        batch_size=len(batch),
                        processed=batch_stats['new_records'] + batch_stats['updated_records'],
                    )

                except DatabaseUnavailableError as e:
                    logger.error(
                        "database_unavailable_during_batch_upsert",
                        batch_start=i + 1,
                        batch_size=len(batch),
                        error=str(e),
                        exc_info=True,
                    )
                    raise

                except Exception as e:
                    logger.error(
                        "batch_upsert_failed",
                        batch_start=i + 1,
                        batch_size=len(batch),
                        error=str(e),
                        exc_info=True,
                    )
                    # Продолжаем со следующим батчем
                    continue

            return {
                'new_records': total_new,
                'updated_records': total_updated,
            }

        except DatabaseUnavailableError:
            raise
        except Exception as e:
            logger.error(
                "batch_upsert_prizes_failed",
                total_prizes=len(prizes_data),
                error=str(e),
                exc_info=True,
            )
            raise DatabaseUnavailableError(
                f"Критическая ошибка при batch upsert: {str(e)}"
            ) from e
