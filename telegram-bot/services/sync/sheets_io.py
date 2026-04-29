"""
I/O Google Sheets: инициализация клиента, чтение списка листов и данных,
конвертация в формат для PostgreSQL.

Реализован как mixin для :class:`services.sync.service.SyncService`.
Ожидает атрибуты ``self.client``, ``self.google_sheets_config`` и
``self.sync_config``.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List

import gspread
from google.oauth2.service_account import Credentials

from utils.logging_config import get_logger
from utils.retry import retry_with_backoff

logger = get_logger(__name__)


class SheetsIOMixin:
    """Чтение и парсинг данных Google Sheets."""

    def _init_client(self) -> gspread.Client:
        """Инициализирует клиент gspread с credentials."""
        try:
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive',
            ]

            credentials = Credentials.from_service_account_file(
                self.google_sheets_config.credentials_path,
                scopes=scopes,
            )

            client = gspread.authorize(credentials)

            logger.info("sync_gspread_client_initialized")
            return client

        except Exception as e:
            logger.error(
                "failed_to_initialize_sync_gspread_client",
                error=str(e),
                credentials_path=self.google_sheets_config.credentials_path,
            )
            raise

    async def _get_all_sheet_names_with_retry(self) -> List[str]:
        """Получает список всех листов с retry-логикой."""
        @retry_with_backoff(
            max_retries=self.sync_config.max_retries,
            base_delay=1.0,
            exceptions=(gspread.exceptions.APIError,),
        )
        async def _get_with_retry():
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._get_all_sheet_names_sync)

        return await _get_with_retry()

    async def _get_all_sheet_names(self) -> List[str]:
        """Получает список всех листов (без retry)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_all_sheet_names_sync)

    def _get_all_sheet_names_sync(self) -> List[str]:
        """Синхронное получение списка листов."""
        try:
            spreadsheet = self.client.open_by_key(self.google_sheets_config.spreadsheet_id)
            worksheets = spreadsheet.worksheets()
            sheet_names = [ws.title for ws in worksheets]

            logger.debug(
                "sheet_names_retrieved",
                count=len(sheet_names),
                names=sheet_names,
            )

            return sheet_names

        except Exception as e:
            logger.error(
                "failed_to_get_sheet_names",
                error=str(e),
                spreadsheet_id=self.google_sheets_config.spreadsheet_id,
            )
            raise

    async def _read_sheet_data(self, sheet_name: str) -> List[List[str]]:
        """Читает данные из листа Google Sheets."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._read_sheet_data_sync, sheet_name)

    def _read_sheet_data_sync(self, sheet_name: str) -> List[List[str]]:
        """Синхронное чтение данных из листа."""
        try:
            spreadsheet = self.client.open_by_key(self.google_sheets_config.spreadsheet_id)
            worksheet = spreadsheet.worksheet(sheet_name)

            all_values = worksheet.get_all_values()

            # Пропускаем первую строку (заголовки) и возвращаем данные
            data_rows = all_values[1:] if len(all_values) > 1 else []

            logger.debug(
                "sheet_data_read",
                sheet_name=sheet_name,
                rows_count=len(data_rows),
            )

            return data_rows

        except gspread.exceptions.WorksheetNotFound:
            logger.warning(
                "worksheet_not_found",
                sheet_name=sheet_name,
                spreadsheet_id=self.google_sheets_config.spreadsheet_id,
            )
            return []
        except Exception as e:
            logger.error(
                "failed_to_read_sheet_data",
                sheet_name=sheet_name,
                error=str(e),
            )
            raise

    def _convert_sheet_data_to_prizes(
        self,
        sheet_data: List[List[str]],
        sheet_name: str,
    ) -> List[Dict[str, Any]]:
        """
        Преобразует данные из Google Sheets в формат для PostgreSQL.

        Структура столбцов:
            A: telegram_id    (обязательный)
            B: username       (опциональный)
            C: code_word      (обязательный)
            D: prize_type     (обязательный — 'digital' или 'physical')
            E: promo_code     (для digital)
            F: instructions   (для digital)
            G..O: данные доставки (для physical)
        """
        # Минимум 4 столбца: telegram_id, username, code_word, prize_type
        if not sheet_data:
            logger.error(
                "sheet_structure_invalid",
                sheet_name=sheet_name,
                reason="empty_sheet",
                found_columns=0,
                required_columns=4,
            )
            return []

        first_row = sheet_data[0] if sheet_data else []
        if len(first_row) < 4:
            logger.error(
                "sheet_structure_invalid",
                sheet_name=sheet_name,
                reason="insufficient_columns",
                found_columns=len(first_row),
                required_columns=4,
                message="Требуется минимум 4 столбца: telegram_id, username, code_word, prize_type",
            )
            return []

        prizes_data: List[Dict[str, Any]] = []
        now = datetime.now(timezone.utc)

        for row_index, row_values in enumerate(sheet_data):
            if not row_values or not any(row_values):
                continue

            if len(row_values) < 4:
                logger.warning(
                    "invalid_row_skipped",
                    sheet_name=sheet_name,
                    row_index=row_index + 2,
                    reason="insufficient_columns",
                    found_columns=len(row_values),
                    required_columns=4,
                )
                continue

            if not row_values[0]:
                logger.warning(
                    "invalid_row_skipped",
                    sheet_name=sheet_name,
                    row_index=row_index + 2,
                    reason="missing_telegram_id",
                )
                continue

            if not row_values[2] or not row_values[2].strip():
                logger.warning(
                    "invalid_row_skipped",
                    sheet_name=sheet_name,
                    row_index=row_index + 2,
                    reason="missing_code_word",
                    message="Столбец code_word (C) обязателен для заполнения",
                )
                continue

            if not row_values[3]:
                logger.warning(
                    "invalid_row_skipped",
                    sheet_name=sheet_name,
                    row_index=row_index + 2,
                    reason="missing_prize_type",
                )
                continue

            try:
                telegram_id = int(row_values[0])
                username = (
                    row_values[1].strip()
                    if len(row_values) > 1 and row_values[1]
                    else None
                )
                code_word = row_values[2].strip()

                prize_data: Dict[str, Any] = {
                    'telegram_id': telegram_id,
                    'username': username,
                    'prize_type': row_values[3],
                    'code_word': code_word,
                    'sheet_name': sheet_name,
                    'row_id': row_index + 2,  # +2: пропускаем заголовок и индекс с 0
                    'created_at': now,
                    'updated_at': now,
                }

                if prize_data['prize_type'] == 'digital':
                    prize_data['promo_code'] = (
                        row_values[4] if len(row_values) > 4 else None
                    )
                    prize_data['instructions'] = (
                        row_values[5] if len(row_values) > 5 else None
                    )

                if prize_data['prize_type'] == 'physical' and len(row_values) > 6:
                    prize_data['last_name'] = row_values[6] if len(row_values) > 6 else None
                    prize_data['first_name'] = row_values[7] if len(row_values) > 7 else None
                    prize_data['patronymic'] = row_values[8] if len(row_values) > 8 else None
                    prize_data['city'] = row_values[9] if len(row_values) > 9 else None
                    prize_data['street'] = row_values[10] if len(row_values) > 10 else None
                    prize_data['house'] = row_values[11] if len(row_values) > 11 else None
                    prize_data['apartment'] = row_values[12] if len(row_values) > 12 else None
                    prize_data['phone'] = row_values[13] if len(row_values) > 13 else None
                    prize_data['comment'] = row_values[14] if len(row_values) > 14 else None

                prizes_data.append(prize_data)

            except (ValueError, IndexError) as e:
                logger.warning(
                    "invalid_row_data_skipped",
                    sheet_name=sheet_name,
                    row_index=row_index + 2,
                    error=str(e),
                    row_values=row_values[:5],
                )
                continue

        logger.debug(
            "sheet_data_converted",
            sheet_name=sheet_name,
            total_rows=len(sheet_data),
            valid_prizes=len(prizes_data),
        )

        return prizes_data
