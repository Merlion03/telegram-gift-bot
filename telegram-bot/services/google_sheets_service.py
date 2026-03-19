"""
Сервис для работы с Google Sheets API.
Обеспечивает поиск победителей и сохранение данных доставки.
"""

import asyncio
from typing import Optional, Dict
import gspread
from google.oauth2.service_account import Credentials

from utils.retry import retry_with_backoff
from utils.logging_config import get_logger

logger = get_logger(__name__)


class GoogleSheetsService:
    """Сервис для работы с Google Sheets"""
    
    def __init__(self, credentials_path: str, spreadsheet_id: str):
        """
        Инициализирует сервис Google Sheets
        
        Args:
            credentials_path: Путь к файлу с credentials
            spreadsheet_id: ID таблицы Google Sheets
        """
        self.credentials_path = credentials_path
        self.spreadsheet_id = spreadsheet_id
        self.client = self._init_client()
        logger.info(
            "google_sheets_service_initialized",
            spreadsheet_id=spreadsheet_id
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
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
            
            # Загружаем credentials из файла
            credentials = Credentials.from_service_account_file(
                self.credentials_path,
                scopes=scopes
            )
            
            # Авторизуем клиента
            client = gspread.authorize(credentials)
            
            logger.info("gspread_client_initialized")
            return client
            
        except Exception as e:
            logger.error(
                "failed_to_initialize_gspread_client",
                error=str(e),
                credentials_path=self.credentials_path
            )
            raise
    
    async def find_winner(
        self, 
        telegram_id: int, 
        code_word: str
    ) -> Optional[Dict]:
        """
        Ищет победителя в таблице по Telegram ID и кодовому слову.
        Использует retry логику для обработки временных сбоев API.
        
        Args:
            telegram_id: Telegram ID для поиска
            code_word: Кодовое слово (определяет worksheet)
            
        Returns:
            Словарь с данными приза или None если не найден
        """
        # Оборачиваем в retry логику
        return await retry_with_backoff(
            self._find_winner_async,
            max_retries=3,
            base_delay=1.0,
            telegram_id=telegram_id,
            code_word=code_word
        )
    
    async def _find_winner_async(
        self,
        telegram_id: int,
        code_word: str
    ) -> Optional[Dict]:
        """
        Асинхронная обёртка для синхронного поиска победителя
        
        Args:
            telegram_id: Telegram ID для поиска
            code_word: Кодовое слово
            
        Returns:
            Словарь с данными приза или None
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._find_winner_sync,
            telegram_id,
            code_word
        )
    
    def _find_winner_sync(
        self, 
        telegram_id: int, 
        code_word: str
    ) -> Optional[Dict]:
        """
        Синхронный поиск победителя в таблице
        
        Args:
            telegram_id: Telegram ID для поиска
            code_word: Кодовое слово (определяет worksheet)
            
        Returns:
            Словарь с данными приза или None
        """
        try:
            # Открываем таблицу по ID
            sheet = self.client.open_by_key(self.spreadsheet_id)
            
            # Получаем worksheet по имени (кодовое слово)
            try:
                worksheet = sheet.worksheet(code_word)
            except gspread.exceptions.WorksheetNotFound:
                logger.warning(
                    "worksheet_not_found",
                    code_word=code_word,
                    spreadsheet_id=self.spreadsheet_id
                )
                return None
            
            # Ищем Telegram ID в первом столбце
            try:
                cell = worksheet.find(str(telegram_id), in_column=1)
            except gspread.exceptions.CellNotFound:
                logger.info(
                    "telegram_id_not_found",
                    telegram_id=telegram_id,
                    code_word=code_word
                )
                return None
            
            if not cell:
                return None
            
            # Получаем данные всей строки
            row_values = worksheet.row_values(cell.row)
            
            # Проверяем минимальную длину строки
            if len(row_values) < 2:
                logger.error(
                    "invalid_row_format",
                    row_id=cell.row,
                    row_values=row_values
                )
                return None
            
            # Формируем результат
            # Структура столбцов (ОБНОВЛЕНО - добавлен столбец Username):
            # A (индекс 0): telegram_id
            # B (индекс 1): username (НОВЫЙ СТОЛБЕЦ)
            # C (индекс 2): prize_type (digital/physical) - СДВИНУТО с индекса 1
            # D (индекс 3): promo_code (для digital) - СДВИНУТО с индекса 2
            # E (индекс 4): instructions (для digital) - СДВИНУТО с индекса 3
            # F-N (индексы 5-13): данные доставки (для physical) - СДВИНУТО с индексов 4-12
            result = {
                'row_id': cell.row,
                'telegram_id': int(row_values[0]),
                'username': row_values[1] if len(row_values) > 1 else None,  # Колонка B (индекс 1) - НОВОЕ ПОЛЕ
                'prize_type': row_values[2] if len(row_values) > 2 else None,  # Колонка C (индекс 2) - СДВИНУТО
            }
            
            # Добавляем данные для цифрового приза
            if result['prize_type'] == 'digital':
                result['promo_code'] = row_values[3] if len(row_values) > 3 else None  # Колонка D (индекс 3) - СДВИНУТО
                result['instructions'] = row_values[4] if len(row_values) > 4 else None  # Колонка E (индекс 4) - СДВИНУТО
            
            logger.info(
                "winner_found",
                telegram_id=telegram_id,
                code_word=code_word,
                prize_type=result['prize_type']
            )
            
            return result
            
        except gspread.exceptions.APIError as e:
            logger.error(
                "google_sheets_api_error",
                error=str(e),
                telegram_id=telegram_id,
                code_word=code_word
            )
            raise
        except Exception as e:
            logger.error(
                "unexpected_error_finding_winner",
                error=str(e),
                telegram_id=telegram_id,
                code_word=code_word
            )
            raise
    
    async def save_delivery_data(
        self, 
        row_id: int, 
        delivery_data: Dict,
        worksheet_name: Optional[str] = None
    ) -> bool:
        """
        Сохраняет данные доставки в таблицу.
        Использует retry логику для обработки временных сбоев API.
        
        Args:
            row_id: Номер строки для обновления
            delivery_data: Данные доставки (full_name, address, phone, comment)
            worksheet_name: Имя worksheet (опционально, по умолчанию первый)
            
        Returns:
            True если успешно сохранено
        """
        # Оборачиваем в retry логику
        return await retry_with_backoff(
            self._save_delivery_data_async,
            max_retries=3,
            base_delay=1.0,
            row_id=row_id,
            delivery_data=delivery_data,
            worksheet_name=worksheet_name
        )
    
    async def _save_delivery_data_async(
        self,
        row_id: int,
        delivery_data: Dict,
        worksheet_name: Optional[str] = None
    ) -> bool:
        """
        Асинхронная обёртка для синхронного сохранения данных
        
        Args:
            row_id: Номер строки
            delivery_data: Данные доставки
            worksheet_name: Имя worksheet
            
        Returns:
            True если успешно
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._save_delivery_data_sync,
            row_id,
            delivery_data,
            worksheet_name
        )
    
    def _save_delivery_data_sync(
        self, 
        row_id: int, 
        delivery_data: Dict,
        worksheet_name: Optional[str] = None
    ) -> bool:
        """
        Синхронное сохранение данных доставки
        
        Args:
            row_id: Номер строки для обновления
            delivery_data: Данные доставки
            worksheet_name: Имя worksheet
            
        Returns:
            True если успешно
        """
        try:
            # Открываем таблицу
            sheet = self.client.open_by_key(self.spreadsheet_id)
            
            # Получаем worksheet
            if worksheet_name:
                worksheet = sheet.worksheet(worksheet_name)
            else:
                worksheet = sheet.get_worksheet(0)  # Первый worksheet
            
            # Обновляем ячейки с данными доставки
            # Новая структура столбцов для физических призов (после добавления Username в B):
            # F (индекс 5): last_name (сдвинуто с E)
            # G (индекс 6): first_name (сдвинуто с F)
            # H (индекс 7): patronymic (сдвинуто с G)
            # I (индекс 8): city (сдвинуто с H)
            # J (индекс 9): street (сдвинуто с I)
            # K (индекс 10): house (сдвинуто с J)
            # L (индекс 11): apartment (сдвинуто с K)
            # M (индекс 12): phone (сдвинуто с L)
            # N (индекс 13): comment (сдвинуто с M)
            # O (индекс 14): claimed_at (сдвинуто с N)
            updates = []
            
            # Данные доставки
            if 'last_name' in delivery_data:
                updates.append({
                    'range': f'F{row_id}',
                    'values': [[delivery_data.get('last_name', '')]]
                })
            if 'first_name' in delivery_data:
                updates.append({
                    'range': f'G{row_id}',
                    'values': [[delivery_data.get('first_name', '')]]
                })
            if 'patronymic' in delivery_data:
                updates.append({
                    'range': f'H{row_id}',
                    'values': [[delivery_data.get('patronymic', '')]]
                })
            if 'city' in delivery_data:
                updates.append({
                    'range': f'I{row_id}',
                    'values': [[delivery_data.get('city', '')]]
                })
            if 'street' in delivery_data:
                updates.append({
                    'range': f'J{row_id}',
                    'values': [[delivery_data.get('street', '')]]
                })
            if 'house' in delivery_data:
                updates.append({
                    'range': f'K{row_id}',
                    'values': [[delivery_data.get('house', '')]]
                })
            if 'apartment' in delivery_data:
                updates.append({
                    'range': f'L{row_id}',
                    'values': [[delivery_data.get('apartment', '')]]
                })
            if 'phone' in delivery_data:
                updates.append({
                    'range': f'M{row_id}',
                    'values': [[delivery_data.get('phone', '')]]
                })
            if 'comment' in delivery_data:
                updates.append({
                    'range': f'N{row_id}',
                    'values': [[delivery_data.get('comment', '')]]
                })
            
            # Время получения приза
            if 'claimed_at' in delivery_data:
                updates.append({
                    'range': f'O{row_id}',
                    'values': [[delivery_data.get('claimed_at', '')]]
                })
            
            # Выполняем batch update для эффективности (только если есть что обновлять)
            if updates:
                worksheet.batch_update(updates)
            
            logger.info(
                "delivery_data_saved",
                row_id=row_id,
                telegram_id=delivery_data.get('telegram_id')
            )
            
            return True
            
        except gspread.exceptions.APIError as e:
            logger.error(
                "google_sheets_api_error_saving_delivery",
                error=str(e),
                row_id=row_id
            )
            return False
        except Exception as e:
            logger.error(
                "unexpected_error_saving_delivery",
                error=str(e),
                row_id=row_id
            )
            return False
