"""
Сервис синхронизации данных между Google Sheets и PostgreSQL

Обеспечивает периодическую синхронизацию данных призов из Google Sheets
в PostgreSQL для быстрого доступа без обращения к Google Sheets API.
"""
import asyncio
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

import gspread
from google.oauth2.service_account import Credentials

from config import SyncConfig, GoogleSheetsConfig
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from utils.retry import retry_with_backoff
from utils.logging_config import get_logger

logger = get_logger(__name__)


class SyncService:
    """
    Сервис синхронизации данных между Google Sheets и PostgreSQL
    
    Читает данные из всех листов Google Sheets и синхронизирует их
    с таблицей prizes в PostgreSQL для быстрого доступа.
    """
    
    def __init__(
        self,
        google_sheets_config: GoogleSheetsConfig,
        sync_config: SyncConfig,
        prize_repository: Optional[PrizeRepository] = None
    ):
        """
        Инициализирует сервис синхронизации
        
        Args:
            google_sheets_config: Конфигурация Google Sheets
            sync_config: Конфигурация синхронизации
            prize_repository: Repository для работы с призами (опционально)
        """
        self.google_sheets_config = google_sheets_config
        self.sync_config = sync_config
        self.prize_repository = prize_repository or PrizeRepository()
        self.client = self._init_client()
        
        logger.info(
            "sync_service_initialized",
            spreadsheet_id=google_sheets_config.spreadsheet_id,
            sync_interval=sync_config.sync_interval_seconds,
            batch_size=sync_config.batch_size,
            max_retries=sync_config.max_retries
        )
    
    def _init_client(self) -> gspread.Client:
        """
        Инициализирует клиент gspread с credentials
        
        Returns:
            Авторизованный клиент gspread
        """
        try:
            # Определяем необходимые scopes для работы с Google Sheets
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
            
            # Загружаем credentials из файла
            credentials = Credentials.from_service_account_file(
                self.google_sheets_config.credentials_path,
                scopes=scopes
            )
            
            # Авторизуем клиента
            client = gspread.authorize(credentials)
            
            logger.info("sync_gspread_client_initialized")
            return client
            
        except Exception as e:
            logger.error(
                "failed_to_initialize_sync_gspread_client",
                error=str(e),
                credentials_path=self.google_sheets_config.credentials_path
            )
            raise
    
    async def sync_all_sheets(self) -> Dict[str, Any]:
        """
        Синхронизирует все листы Google Sheets с PostgreSQL
        
        Обрабатывает ошибки Google Sheets API и PostgreSQL gracefully,
        продолжая синхронизацию других листов при частичных сбоях.
        
        Returns:
            Статистика синхронизации: листы, записи, ошибки, время выполнения
        """
        start_time = time.time()
        stats = {
            'sheets_processed': 0,
            'sheets_failed': 0,
            'total_records': 0,
            'new_records': 0,
            'updated_records': 0,
            'errors': []
        }
        
        try:
            logger.info("sync_all_sheets_started")
            
            # Получаем список всех листов с retry логикой
            try:
                sheet_names = await self._get_all_sheet_names_with_retry()
            except gspread.exceptions.APIError as e:
                # Критическая ошибка Google Sheets API - не можем получить список листов
                logger.error(
                    "google_sheets_api_unavailable",
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True
                )
                stats['errors'].append({
                    'stage': 'get_sheet_names',
                    'error': str(e),
                    'error_type': type(e).__name__
                })
                elapsed_time = time.time() - start_time
                stats['elapsed_seconds'] = round(elapsed_time, 2)
                return stats
            except Exception as e:
                # Неожиданная ошибка
                logger.error(
                    "unexpected_error_getting_sheet_names",
                    error=str(e),
                    error_type=type(e).__name__,
                    exc_info=True
                )
                raise
            
            logger.info(
                "sheets_discovered",
                count=len(sheet_names),
                sheets=sheet_names
            )
            
            # Синхронизируем каждый лист
            for sheet_name in sheet_names:
                try:
                    sheet_stats = await self.sync_sheet(sheet_name)
                    
                    stats['sheets_processed'] += 1
                    stats['total_records'] += sheet_stats['total_records']
                    stats['new_records'] += sheet_stats['new_records']
                    stats['updated_records'] += sheet_stats['updated_records']
                    
                    logger.info(
                        "sheet_sync_completed",
                        sheet_name=sheet_name,
                        records=sheet_stats['total_records']
                    )
                    
                except gspread.exceptions.APIError as e:
                    # Ошибка Google Sheets API для конкретного листа
                    stats['sheets_failed'] += 1
                    error_info = {
                        'sheet_name': sheet_name,
                        'error': str(e),
                        'error_type': 'GoogleSheetsAPIError'
                    }
                    stats['errors'].append(error_info)
                    
                    logger.error(
                        "google_sheets_api_error_for_sheet",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True
                    )
                    
                    # Продолжаем синхронизацию других листов
                    continue
                    
                except DatabaseUnavailableError as e:
                    # Ошибка PostgreSQL - критическая для всей синхронизации
                    stats['sheets_failed'] += 1
                    error_info = {
                        'sheet_name': sheet_name,
                        'error': str(e),
                        'error_type': 'DatabaseUnavailableError'
                    }
                    stats['errors'].append(error_info)
                    
                    logger.error(
                        "database_unavailable_during_sync",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True
                    )
                    
                    # При недоступности БД прекращаем синхронизацию
                    # (нет смысла продолжать если БД недоступна)
                    logger.warning(
                        "stopping_sync_due_to_database_unavailability",
                        sheets_remaining=len(sheet_names) - stats['sheets_processed'] - stats['sheets_failed']
                    )
                    break
                    
                except Exception as e:
                    # Неожиданная ошибка для конкретного листа
                    stats['sheets_failed'] += 1
                    error_info = {
                        'sheet_name': sheet_name,
                        'error': str(e),
                        'error_type': type(e).__name__
                    }
                    stats['errors'].append(error_info)
                    
                    logger.error(
                        "unexpected_error_syncing_sheet",
                        sheet_name=sheet_name,
                        error=str(e),
                        exc_info=True
                    )
                    
                    # Продолжаем синхронизацию других листов
                    continue
            
            # Финальная статистика
            elapsed_time = time.time() - start_time
            stats['elapsed_seconds'] = round(elapsed_time, 2)
            
            logger.info(
                "sync_all_sheets_completed",
                **stats
            )
            
            return stats
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                "sync_all_sheets_critical_failure",
                error=str(e),
                elapsed_seconds=round(elapsed_time, 2),
                exc_info=True
            )
            # Не пробрасываем исключение - возвращаем статистику с ошибкой
            stats['errors'].append({
                'stage': 'sync_all_sheets',
                'error': str(e),
                'error_type': type(e).__name__
            })
            stats['elapsed_seconds'] = round(elapsed_time, 2)
            return stats
    
    @retry_with_backoff(max_retries=3, base_delay=1.0, exceptions=(gspread.exceptions.APIError,))
    async def sync_sheet(self, sheet_name: str) -> Dict[str, Any]:
        """
        Синхронизирует один лист Google Sheets с PostgreSQL
        
        Args:
            sheet_name: Название листа для синхронизации
        
        Returns:
            Статистика синхронизации листа
        """
        start_time = time.time()
        
        try:
            logger.info("sheet_sync_started", sheet_name=sheet_name)
            
            # Читаем данные из Google Sheets
            sheet_data = await self._read_sheet_data(sheet_name)
            
            if not sheet_data:
                logger.warning("sheet_empty_or_invalid", sheet_name=sheet_name)
                return {
                    'total_records': 0,
                    'new_records': 0,
                    'updated_records': 0,
                    'elapsed_seconds': round(time.time() - start_time, 2)
                }
            
            # Преобразуем данные в формат для PostgreSQL
            prizes_data = self._convert_sheet_data_to_prizes(sheet_data, sheet_name)
            
            # Выполняем batch upsert в PostgreSQL
            processed_count = await self._batch_upsert_prizes(prizes_data)
            
            elapsed_time = time.time() - start_time
            
            stats = {
                'total_records': len(prizes_data),
                'new_records': processed_count,  # В batch upsert мы не различаем new/updated
                'updated_records': 0,
                'elapsed_seconds': round(elapsed_time, 2)
            }
            
            logger.info(
                "sheet_sync_completed",
                sheet_name=sheet_name,
                **stats
            )
            
            return stats
            
        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                "sheet_sync_failed",
                sheet_name=sheet_name,
                error=str(e),
                elapsed_seconds=round(elapsed_time, 2),
                exc_info=True
            )
            raise
    
    async def _get_all_sheet_names_with_retry(self) -> List[str]:
        """
        Получает список всех листов в Google Sheets с retry логикой
        
        Returns:
            Список названий листов
        
        Raises:
            gspread.exceptions.APIError: При недоступности Google Sheets API
        """
        # Применяем retry логику через декоратор
        @retry_with_backoff(max_retries=self.sync_config.max_retries, base_delay=1.0, exceptions=(gspread.exceptions.APIError,))
        async def _get_with_retry():
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._get_all_sheet_names_sync)
        
        return await _get_with_retry()
    
    async def _get_all_sheet_names(self) -> List[str]:
        """
        Получает список всех листов в Google Sheets (без retry)
        
        Returns:
            Список названий листов
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_all_sheet_names_sync)
    
    def _get_all_sheet_names_sync(self) -> List[str]:
        """
        Синхронное получение списка листов
        
        Returns:
            Список названий листов
        """
        try:
            # Открываем таблицу по ID
            spreadsheet = self.client.open_by_key(self.google_sheets_config.spreadsheet_id)
            
            # Получаем все worksheets
            worksheets = spreadsheet.worksheets()
            
            # Возвращаем только названия
            sheet_names = [ws.title for ws in worksheets]
            
            logger.debug(
                "sheet_names_retrieved",
                count=len(sheet_names),
                names=sheet_names
            )
            
            return sheet_names
            
        except Exception as e:
            logger.error(
                "failed_to_get_sheet_names",
                error=str(e),
                spreadsheet_id=self.google_sheets_config.spreadsheet_id
            )
            raise
    
    async def _read_sheet_data(self, sheet_name: str) -> List[List[str]]:
        """
        Читает данные из листа Google Sheets
        
        Args:
            sheet_name: Название листа
        
        Returns:
            Данные листа (список строк, каждая строка - список значений)
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._read_sheet_data_sync, sheet_name)
    
    def _read_sheet_data_sync(self, sheet_name: str) -> List[List[str]]:
        """
        Синхронное чтение данных из листа
        
        Args:
            sheet_name: Название листа
        
        Returns:
            Данные листа
        """
        try:
            # Открываем таблицу и лист
            spreadsheet = self.client.open_by_key(self.google_sheets_config.spreadsheet_id)
            worksheet = spreadsheet.worksheet(sheet_name)
            
            # Получаем все значения, начиная со второй строки (пропускаем заголовки)
            all_values = worksheet.get_all_values()
            
            # Пропускаем первую строку (заголовки) и возвращаем данные
            data_rows = all_values[1:] if len(all_values) > 1 else []
            
            logger.debug(
                "sheet_data_read",
                sheet_name=sheet_name,
                rows_count=len(data_rows)
            )
            
            return data_rows
            
        except gspread.exceptions.WorksheetNotFound:
            logger.warning(
                "worksheet_not_found",
                sheet_name=sheet_name,
                spreadsheet_id=self.google_sheets_config.spreadsheet_id
            )
            return []
        except Exception as e:
            logger.error(
                "failed_to_read_sheet_data",
                sheet_name=sheet_name,
                error=str(e)
            )
            raise
    
    def _convert_sheet_data_to_prizes(
            self,
            sheet_data: List[List[str]],
            sheet_name: str
        ) -> List[Dict[str, Any]]:
            """
            Преобразует данные из Google Sheets в формат для PostgreSQL

            Args:
                sheet_data: Данные из листа
                sheet_name: Название листа

            Returns:
                Список данных призов для PostgreSQL
            """
            # Валидация структуры листа - минимум 4 столбца (telegram_id, username, code_word, prize_type)
            if not sheet_data:
                logger.error(
                    "sheet_structure_invalid",
                    sheet_name=sheet_name,
                    reason="empty_sheet",
                    found_columns=0,
                    required_columns=4
                )
                return []

            # Проверяем первую строку данных на наличие минимум 4 столбцов
            first_row = sheet_data[0] if sheet_data else []
            if len(first_row) < 4:
                logger.error(
                    "sheet_structure_invalid",
                    sheet_name=sheet_name,
                    reason="insufficient_columns",
                    found_columns=len(first_row),
                    required_columns=4,
                    message="Требуется минимум 4 столбца: telegram_id, username, code_word, prize_type"
                )
                return []

            prizes_data = []
            now = datetime.now(timezone.utc)

            for row_index, row_values in enumerate(sheet_data):
                # Пропускаем пустые строки
                if not row_values or not any(row_values):
                    continue

                # Проверяем минимальные требования (telegram_id, username, code_word и prize_type)
                if len(row_values) < 4:
                    logger.warning(
                        "invalid_row_skipped",
                        sheet_name=sheet_name,
                        row_index=row_index + 2,
                        reason="insufficient_columns",
                        found_columns=len(row_values),
                        required_columns=4
                    )
                    continue

                # Проверяем обязательные поля
                if not row_values[0]:
                    logger.warning(
                        "invalid_row_skipped",
                        sheet_name=sheet_name,
                        row_index=row_index + 2,
                        reason="missing_telegram_id"
                    )
                    continue

                # Валидация code_word (столбец C, индекс 2)
                if not row_values[2] or not row_values[2].strip():
                    logger.warning(
                        "invalid_row_skipped",
                        sheet_name=sheet_name,
                        row_index=row_index + 2,
                        reason="missing_code_word",
                        message="Столбец code_word (C) обязателен для заполнения"
                    )
                    continue

                if not row_values[3]:
                    logger.warning(
                        "invalid_row_skipped",
                        sheet_name=sheet_name,
                        row_index=row_index + 2,
                        reason="missing_prize_type"
                    )
                    continue

                try:
                    # Парсим telegram_id
                    telegram_id = int(row_values[0])

                    # Извлекаем username из столбца B (индекс 1) с обработкой пустых значений
                    username = row_values[1].strip() if len(row_values) > 1 and row_values[1] else None

                    # Извлекаем code_word из столбца C (индекс 2) и применяем .strip()
                    code_word = row_values[2].strip()

                    # Базовые данные приза
                    prize_data = {
                        'telegram_id': telegram_id,
                        'username': username,  # Новое поле из столбца B
                        'prize_type': row_values[3],  # Сдвинуто с индекса 2 на индекс 3
                        'code_word': code_word,  # Теперь из столбца C, а не B
                        'sheet_name': sheet_name,  # Сохраняем для аудита
                        'row_id': row_index + 2,  # +2 потому что пропустили заголовок и индекс с 0
                        'created_at': now,
                        'updated_at': now
                    }

                    # Добавляем данные для цифрового приза (индексы сдвинуты на +1)
                    if prize_data['prize_type'] == 'digital':
                        prize_data['promo_code'] = row_values[4] if len(row_values) > 4 else None  # Было: индекс 3
                        prize_data['instructions'] = row_values[5] if len(row_values) > 5 else None  # Было: индекс 4

                    # Добавляем данные для физического приза (индексы сдвинуты на +1)
                    if prize_data['prize_type'] == 'physical' and len(row_values) > 6:
                        # Структура столбцов для физических призов (все индексы +1):
                        # G (индекс 6): last_name (было: индекс 5)
                        # H (индекс 7): first_name (было: индекс 6)
                        # I (индекс 8): patronymic (было: индекс 7)
                        # J (индекс 9): city (было: индекс 8)
                        # K (индекс 10): street (было: индекс 9)
                        # L (индекс 11): house (было: индекс 10)
                        # M (индекс 12): apartment (было: индекс 11)
                        # N (индекс 13): phone (было: индекс 12)
                        # O (индекс 14): comment (было: индекс 13)
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
                        row_values=row_values[:5]
                    )
                    continue

            logger.debug(
                "sheet_data_converted",
                sheet_name=sheet_name,
                total_rows=len(sheet_data),
                valid_prizes=len(prizes_data)
            )

            return prizes_data

    
    async def _batch_upsert_prizes(self, prizes_data: List[Dict[str, Any]]) -> int:
        """
        Выполняет batch upsert призов в PostgreSQL с обработкой ошибок
        
        Использует транзакции для обеспечения консистентности данных.
        При конфликте уникального индекса выполняет UPDATE существующей записи.
        
        Args:
            prizes_data: Список данных призов
        
        Returns:
            Количество обработанных записей
        
        Raises:
            DatabaseUnavailableError: При недоступности PostgreSQL
        """
        if not prizes_data:
            return 0
        
        try:
            # Разбиваем на батчи для эффективности
            batch_size = self.sync_config.batch_size
            total_processed = 0
            
            for i in range(0, len(prizes_data), batch_size):
                batch = prizes_data[i:i + batch_size]
                
                try:
                    # batch_upsert_prizes использует транзакции внутри
                    # и обрабатывает конфликты уникального индекса через ON CONFLICT DO UPDATE
                    processed_count = await self.prize_repository.batch_upsert_prizes(batch)
                    total_processed += processed_count
                    
                    logger.debug(
                        "batch_upsert_completed",
                        batch_start=i + 1,
                        batch_size=len(batch),
                        processed=processed_count
                    )
                    
                except DatabaseUnavailableError as e:
                    # Критическая ошибка БД - пробрасываем наверх
                    logger.error(
                        "database_unavailable_during_batch_upsert",
                        batch_start=i + 1,
                        batch_size=len(batch),
                        error=str(e),
                        exc_info=True
                    )
                    raise
                    
                except Exception as e:
                    # Неожиданная ошибка в батче - логируем и продолжаем
                    logger.error(
                        "batch_upsert_failed",
                        batch_start=i + 1,
                        batch_size=len(batch),
                        error=str(e),
                        exc_info=True
                    )
                    # Продолжаем со следующим батчем
                    continue
            
            return total_processed
            
        except DatabaseUnavailableError:
            # Пробрасываем DatabaseUnavailableError без изменений
            raise
        except Exception as e:
            logger.error(
                "batch_upsert_prizes_failed",
                total_prizes=len(prizes_data),
                error=str(e),
                exc_info=True
            )
            raise DatabaseUnavailableError(
                f"Критическая ошибка при batch upsert: {str(e)}"
            ) from e