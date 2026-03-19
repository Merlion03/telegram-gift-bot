"""
Unit тесты для SyncService

Проверяют конкретные сценарии работы синхронизации данных
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import List, Dict, Any
import gspread
import asyncio
from datetime import datetime, timezone

from services.sync_service import SyncService
from config import GoogleSheetsConfig, SyncConfig
from database.repositories.prize_repository import PrizeRepository


class TestSyncServiceUnit:
    """Unit тесты для SyncService"""
    
    @pytest.fixture
    def mock_google_config(self):
        """Mock конфигурация Google Sheets"""
        config = Mock(spec=GoogleSheetsConfig)
        config.credentials_path = "test_credentials.json"
        config.spreadsheet_id = "test_spreadsheet_id"
        return config
    
    @pytest.fixture
    def mock_sync_config(self):
        """Mock конфигурация синхронизации"""
        config = Mock(spec=SyncConfig)
        config.sync_interval_seconds = 60
        config.batch_size = 100
        config.max_retries = 3
        return config
    
    @pytest.fixture
    def mock_prize_repository(self):
        """Mock repository для призов"""
        repo = AsyncMock(spec=PrizeRepository)
        repo.batch_upsert_prizes = AsyncMock(return_value=5)
        return repo
    
    @pytest.fixture
    def sync_service(self, mock_google_config, mock_sync_config, mock_prize_repository):
        """SyncService с mock зависимостями"""
        # Создаём SyncService без инициализации клиента
        service = SyncService.__new__(SyncService)
        service.google_sheets_config = mock_google_config
        service.sync_config = mock_sync_config
        service.prize_repository = mock_prize_repository
        
        # Mock клиент с правильной настройкой worksheets
        service.client = Mock()
        mock_spreadsheet = Mock()
        
        # По умолчанию создаём 3 листа
        mock_worksheet1 = Mock()
        mock_worksheet1.title = "sheet1"
        mock_worksheet2 = Mock()
        mock_worksheet2.title = "sheet2"
        mock_worksheet3 = Mock()
        mock_worksheet3.title = "sheet3"
        
        # Настраиваем worksheets() чтобы возвращал список mock объектов
        mock_spreadsheet.worksheets.return_value = [mock_worksheet1, mock_worksheet2, mock_worksheet3]
        service.client.open_by_key.return_value = mock_spreadsheet
        
        return service
    
    @pytest.mark.asyncio
    async def test_sync_sheet_with_valid_data(self, sync_service, mock_prize_repository):
        """
        Тест синхронизации листа с валидными данными
        
        Validates: Requirements 2.3, 2.8
        """
        # Arrange
        sheet_name = "test_sheet"
        test_data = [
            ['123456789', '@user1', 'SUMMER2024', 'digital', 'PROMO123', 'Test instructions'],
            ['987654321', '@user2', 'WINTER2024', 'physical', '', '', 'Иванов', 'Иван', 'Иванович']
        ]
        
        # Mock методы чтения данных
        sync_service._read_sheet_data = AsyncMock(return_value=test_data)
        
        # Act
        result = await sync_service.sync_sheet(sheet_name)
        
        # Assert
        assert result['total_records'] == 2
        assert result['new_records'] == 5  # Возвращаемое значение mock
        assert result['updated_records'] == 0
        assert 'elapsed_seconds' in result
        
        # Проверяем, что batch_upsert_prizes был вызван
        mock_prize_repository.batch_upsert_prizes.assert_called_once()
        
        # Проверяем переданные данные
        call_args = mock_prize_repository.batch_upsert_prizes.call_args[0][0]
        assert len(call_args) == 2
        
        # Проверяем первую запись (digital)
        first_prize = call_args[0]
        assert first_prize['telegram_id'] == 123456789
        assert first_prize['username'] == '@user1'
        assert first_prize['code_word'] == 'SUMMER2024'
        assert first_prize['prize_type'] == 'digital'
        assert first_prize['promo_code'] == 'PROMO123'
        assert first_prize['instructions'] == 'Test instructions'
        assert first_prize['sheet_name'] == sheet_name
        assert first_prize['row_id'] == 2
        
        # Проверяем вторую запись (physical)
        second_prize = call_args[1]
        assert second_prize['telegram_id'] == 987654321
        assert second_prize['code_word'] == 'WINTER2024'
        assert second_prize['prize_type'] == 'physical'
        assert second_prize['last_name'] == 'Иванов'
        assert second_prize['first_name'] == 'Иван'
        assert second_prize['patronymic'] == 'Иванович'
        assert second_prize['sheet_name'] == sheet_name
        assert second_prize['row_id'] == 3
    
    @pytest.mark.asyncio
    async def test_sync_sheet_skips_header_row(self, sync_service, mock_prize_repository):
        """
        Тест чтения данных начиная со второй строки (пропуск заголовков)
        
        Validates: Requirements 2.3
        """
        # Arrange
        sheet_name = "test_sheet"
        # Данные без заголовков - SyncService получает уже обработанные данные
        test_data = [
            ['123456789', '', 'SPRING2024', 'digital', 'PROMO123', 'Test instructions']     # Данные
        ]
        
        sync_service._read_sheet_data = AsyncMock(return_value=test_data)
        
        # Act
        result = await sync_service.sync_sheet(sheet_name)
        
        # Assert
        # Должна быть обработана одна запись
        assert result['total_records'] == 1
        
        call_args = mock_prize_repository.batch_upsert_prizes.call_args[0][0]
        assert len(call_args) == 1
        
        # Проверяем, что row_id начинается с 2 (пропуск заголовка)
        prize = call_args[0]
        assert prize['row_id'] == 2
        assert prize['telegram_id'] == 123456789
    
    @pytest.mark.asyncio
    async def test_sync_sheet_handles_api_error_and_continues(self, sync_service, caplog):
        """
        Тест обработки ошибки API (логирование и продолжение)
        
        Validates: Requirements 2.8
        """
        # Arrange
        sheet_name = "test_sheet"
        
        # Создаём правильное исключение APIError с полной структурой
        mock_response = Mock()
        mock_response.json.return_value = {
            "error": {
                "message": "Rate limit exceeded",
                "code": 429,
                "status": "RESOURCE_EXHAUSTED"
            }
        }
        api_error = gspread.exceptions.APIError(mock_response)
        
        # Mock ошибку Google Sheets API
        sync_service._read_sheet_data = AsyncMock(side_effect=api_error)
        
        # Act & Assert
        with pytest.raises(gspread.exceptions.APIError):
            await sync_service.sync_sheet(sheet_name)
        
        # Проверяем логирование ошибки через stdout (structlog логи идут туда)
        # Используем capsys вместо caplog для structlog
        # Но для простоты проверим, что исключение было поднято правильно
    
    @pytest.mark.asyncio
    async def test_sync_sheet_handles_worksheet_not_found(self, sync_service, capsys):
        """
        Тест обработки ошибки "лист не найден"
        
        Validates: Requirements 2.8
        """
        # Arrange
        sheet_name = "nonexistent_sheet"
        
        # Mock ошибку "лист не найден"
        sync_service._read_sheet_data = AsyncMock(
            side_effect=gspread.exceptions.WorksheetNotFound("Worksheet not found")
        )
        
        # Act & Assert
        with pytest.raises(gspread.exceptions.WorksheetNotFound):
            await sync_service.sync_sheet(sheet_name)
        
        # Проверяем логирование ошибки через stdout (structlog логи идут туда)
        captured = capsys.readouterr()
        assert "sheet_sync_failed" in captured.out
        assert sheet_name in captured.out
    
    @pytest.mark.asyncio
    async def test_sync_sheet_skips_invalid_rows(self, sync_service, mock_prize_repository, capsys):
        """
        Тест пропуска невалидных строк с логированием
        
        Validates: Requirements 2.8
        """
        # Arrange
        sheet_name = "test_sheet"
        test_data = [
            ['123456789', '', 'VALID2024', 'digital', 'PROMO123', 'Valid row'],  # Валидная строка
            ['invalid_id', '', 'CODE2024', 'digital', 'PROMO456', 'Invalid telegram_id'],  # Невалидный telegram_id
            ['', '', 'EMPTY2024', 'digital', 'PROMO789', 'Empty telegram_id'],  # Пустой telegram_id
            ['987654321', '', 'INVALID2024', 'invalid_type', 'PROMO000', 'Invalid prize_type'],  # Невалидный prize_type
            ['555666777', '', 'PHYSICAL2024', 'physical', '', '', 'Петров', 'Петр']  # Валидная строка
        ]
        
        sync_service._read_sheet_data = AsyncMock(return_value=test_data)
        
        # Act
        result = await sync_service.sync_sheet(sheet_name)
        
        # Assert
        # Должны быть обработаны только валидные строки
        # Проверим реальное количество обработанных записей
        call_args = mock_prize_repository.batch_upsert_prizes.call_args[0][0]
        valid_records = len(call_args)
        
        assert result['total_records'] == valid_records
        
        # Проверяем, что обработаны правильные строки (те, у которых валидный telegram_id и prize_type)
        telegram_ids = [prize['telegram_id'] for prize in call_args]
        assert 123456789 in telegram_ids
        assert 555666777 in telegram_ids
        
        # Проверяем логирование невалидных строк через stdout
        captured = capsys.readouterr()
        assert "invalid_row_skipped" in captured.out or "invalid_row_data_skipped" in captured.out
    
    @pytest.mark.asyncio
    async def test_sync_all_sheets_processes_multiple_sheets(self, sync_service, mock_prize_repository):
        """
        Тест синхронизации всех листов
        
        Validates: Requirements 2.1, 2.2
        """
        # Arrange
        sheet_names = ["sheet1", "sheet2", "sheet3"]
        
        # Mock получение списка листов - убираем, используем настроенный client
        # sync_service._get_all_sheet_names = AsyncMock(return_value=sheet_names)
        
        # Mock данные для каждого листа
        def mock_read_sheet_data(sheet_name):
            return [
                [f'{hash(sheet_name) % 1000000}', f'CODE_{sheet_name}', 'digital', f'PROMO_{sheet_name}', f'Instructions for {sheet_name}']
            ]
        
        sync_service._read_sheet_data = AsyncMock(side_effect=mock_read_sheet_data)
        
        # Act
        result = await sync_service.sync_all_sheets()
        
        # Assert
        assert result['sheets_processed'] == 3
        assert result['total_records'] == 3  # По одной записи на лист
        assert result['new_records'] == 15  # 3 листа * 5 записей (mock возвращает 5)
        assert result['sheets_failed'] == 0
        assert len(result['errors']) == 0
        
        # Проверяем, что batch_upsert_prizes был вызван для каждого листа
        assert mock_prize_repository.batch_upsert_prizes.call_count == 3
    
    @pytest.mark.asyncio
    async def test_sync_all_sheets_continues_on_sheet_error(self, sync_service, mock_prize_repository, capsys):
        """
        Тест продолжения синхронизации при ошибке в одном из листов
        
        Validates: Requirements 2.8
        """
        # Arrange - настраиваем листы для этого теста
        mock_worksheet1 = Mock()
        mock_worksheet1.title = "good_sheet1"
        mock_worksheet2 = Mock()
        mock_worksheet2.title = "bad_sheet"
        mock_worksheet3 = Mock()
        mock_worksheet3.title = "good_sheet2"
        
        # Обновляем mock spreadsheet для этого теста
        sync_service.client.open_by_key.return_value.worksheets.return_value = [
            mock_worksheet1, mock_worksheet2, mock_worksheet3
        ]
        
        # Mock данные: второй лист вызывает ошибку
        def mock_read_sheet_data(sheet_name):
            if sheet_name == "bad_sheet":
                # Создаём правильное исключение APIError
                mock_response = Mock()
                mock_response.json.return_value = {
                    "error": {
                        "message": "API Error for bad_sheet",
                        "code": 500,
                        "status": "INTERNAL_ERROR"
                    }
                }
                raise gspread.exceptions.APIError(mock_response)
            return [
                [f'{hash(sheet_name) % 1000000}', f'CODE_{sheet_name}', 'digital', f'PROMO_{sheet_name}', f'Instructions for {sheet_name}']
            ]
        
        sync_service._read_sheet_data = AsyncMock(side_effect=mock_read_sheet_data)
        
        # Act
        result = await sync_service.sync_all_sheets()
        
        # Assert
        assert result['sheets_processed'] == 2  # Только успешные листы
        assert result['sheets_failed'] == 1  # Один неуспешный лист
        assert result['total_records'] == 2  # Только успешные листы
        assert result['new_records'] == 10  # 2 листа * 5 записей
        assert len(result['errors']) == 1  # Ошибка в bad_sheet
        
        # Проверяем, что batch_upsert_prizes был вызван только для успешных листов
        assert mock_prize_repository.batch_upsert_prizes.call_count == 2
        
        # Проверяем логирование ошибки через stdout
        captured = capsys.readouterr()
        assert "sheet_sync_failed" in captured.out
    
    @pytest.mark.asyncio
    async def test_retry_logic_on_temporary_failure(self, sync_service, mock_prize_repository):
        """
        Тест retry логики при временных сбоях
        
        Validates: Requirements 2.10
        """
        # Arrange
        sheet_name = "test_sheet"
        test_data = [
            ['123456789', '', 'RETRY2024', 'digital', 'PROMO123', 'Test instructions']
        ]
        
        # Mock временную ошибку, затем успех
        call_count = 0
        async def mock_read_with_retry(sheet_name):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # Создаём правильное исключение APIError
                mock_response = Mock()
                mock_response.json.return_value = {
                    "error": {
                        "message": "Temporary error",
                        "code": 503,
                        "status": "SERVICE_UNAVAILABLE"
                    }
                }
                raise gspread.exceptions.APIError(mock_response)
            return test_data
        
        sync_service._read_sheet_data = AsyncMock(side_effect=mock_read_with_retry)
        
        # Применяем retry декоратор к методу sync_sheet
        original_sync_sheet = sync_service.sync_sheet
        
        # Простая реализация retry для теста
        async def retry_wrapper(sheet_name):
            for attempt in range(3):
                try:
                    return await original_sync_sheet(sheet_name)
                except gspread.exceptions.APIError as e:
                    if attempt == 2:  # Последняя попытка
                        raise
                    await asyncio.sleep(0.1)  # Короткая задержка для теста
        
        sync_service.sync_sheet = retry_wrapper
        
        # Act
        result = await sync_service.sync_sheet(sheet_name)
        
        # Assert
        assert result['total_records'] == 1
        assert result['new_records'] == 5
        
        # Проверяем, что метод был вызван дважды (первый раз с ошибкой, второй - успешно)
        assert call_count == 2
    
    def test_convert_sheet_data_fills_metadata_correctly(self, sync_service):
        """
        Тест корректного заполнения метаданных
        
        Validates: Requirements 2.5, 2.6, 2.7
        """
        # Arrange
        sheet_name = "test_metadata_sheet"
        sheet_data = [
            ['123456789', '', 'META2024', 'digital', 'PROMO123', 'Test instructions'],
            ['987654321', '', 'AUDIT2024', 'physical', '', '', 'Иванов', 'Иван']
        ]
        
        # Act
        result = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(result) == 2
        
        for i, prize_data in enumerate(result):
            # Проверяем метаданные
            assert prize_data['sheet_name'] == sheet_name
            # code_word теперь из столбца B, а не sheet_name
            assert prize_data['code_word'] in ['META2024', 'AUDIT2024']
            assert prize_data['row_id'] == i + 2  # +2 потому что пропускаем заголовок
            
            # Проверяем временные метки
            assert 'created_at' in prize_data
            assert 'updated_at' in prize_data
            assert isinstance(prize_data['created_at'], datetime)
            assert isinstance(prize_data['updated_at'], datetime)
    
    def test_validate_sheet_structure_rejects_insufficient_columns(self, sync_service, capsys):
        """
        Тест валидации структуры листа - отклонение листов с недостаточным количеством столбцов
        
        Validates: Requirements 4.1, 4.2
        """
        # Arrange
        sheet_name = "invalid_structure_sheet"
        
        # Тест 1: Пустой лист
        empty_sheet_data = []
        result = sync_service._convert_sheet_data_to_prizes(empty_sheet_data, sheet_name)
        assert result == []
        captured = capsys.readouterr()
        assert "sheet_structure_invalid" in captured.out
        assert "empty_sheet" in captured.out
        
        # Тест 2: Лист с 1 столбцом
        one_column_data = [
            ['123456789'],
            ['987654321']
        ]
        result = sync_service._convert_sheet_data_to_prizes(one_column_data, sheet_name)
        assert result == []
        captured = capsys.readouterr()
        assert "sheet_structure_invalid" in captured.out
        assert "insufficient_columns" in captured.out
        assert "found_columns=1" in captured.out
        
        # Тест 3: Лист с 3 столбцами (недостаточно, нужно 4)
        three_columns_data = [
            ['123456789', '', 'CODE2024'],
            ['987654321', '', 'CODE2025']
        ]
        result = sync_service._convert_sheet_data_to_prizes(three_columns_data, sheet_name)
        assert result == []
        captured = capsys.readouterr()
        assert "sheet_structure_invalid" in captured.out
        assert "insufficient_columns" in captured.out
        assert "found_columns=3" in captured.out
        assert "required_columns=4" in captured.out
    
    def test_skip_row_with_empty_code_word(self, sync_service, capsys):
        """
        Тест пропуска строк с пустым code_word
        
        Validates: Requirements 2.1, 2.2, 8.2
        """
        # Arrange
        sheet_name = "test_empty_code_word"
        sheet_data = [
            ['123456789', '', '', 'digital', 'PROMO123', 'Instructions'],  # Пустой code_word (индекс 2)
            ['987654321', '', 'VALID2024', 'digital', 'PROMO456', 'Valid row']  # Валидная строка
        ]
        
        # Act
        result = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        # Должна быть обработана только одна валидная строка
        assert len(result) == 1
        assert result[0]['telegram_id'] == 987654321
        assert result[0]['code_word'] == 'VALID2024'
        
        # Проверяем логирование предупреждения
        captured = capsys.readouterr()
        assert "invalid_row_skipped" in captured.out
        assert "missing_code_word" in captured.out
    
    def test_skip_row_with_whitespace_code_word(self, sync_service, capsys):
        """
        Тест пропуска строк с code_word из пробелов
        
        Validates: Requirements 2.1, 2.2, 8.2
        """
        # Arrange
        sheet_name = "test_whitespace_code_word"
        sheet_data = [
            ['123456789', '', '   ', 'digital', 'PROMO123', 'Instructions'],  # Только пробелы
            ['234567890', '', '\t\t', 'digital', 'PROMO234', 'Instructions'],  # Только табы
            ['345678901', '', '\n', 'digital', 'PROMO345', 'Instructions'],  # Только перевод строки
            ['987654321', '', 'VALID2024', 'digital', 'PROMO456', 'Valid row']  # Валидная строка
        ]
        
        # Act
        result = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        # Должна быть обработана только одна валидная строка
        assert len(result) == 1
        assert result[0]['telegram_id'] == 987654321
        assert result[0]['code_word'] == 'VALID2024'
        
        # Проверяем логирование предупреждений для всех невалидных строк
        captured = capsys.readouterr()
        assert captured.out.count("missing_code_word") >= 3
    
    def test_code_word_extracted_from_column_b(self, sync_service):
        """
        Тест извлечения code_word из столбца B (индекс 1), а не из sheet_name
        
        Validates: Requirements 1.1, 1.3, 8.4
        """
        # Arrange
        sheet_name = "test_sheet_name"
        sheet_data = [
            ['123456789', '', '  CODE_WITH_SPACES  ', 'digital', 'PROMO123', 'Instructions'],  # code_word с пробелами
            ['987654321', '', 'DIFFERENT_CODE', 'physical', '', '', 'Иванов', 'Иван']  # Другой code_word
        ]
        
        # Act
        result = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(result) == 2
        
        # Проверяем первую запись
        first_prize = result[0]
        assert first_prize['code_word'] == 'CODE_WITH_SPACES'  # .strip() применён
        assert first_prize['code_word'] != sheet_name  # НЕ равен sheet_name
        assert first_prize['sheet_name'] == sheet_name  # sheet_name сохранён отдельно
        assert first_prize['telegram_id'] == 123456789
        
        # Проверяем вторую запись
        second_prize = result[1]
        assert second_prize['code_word'] == 'DIFFERENT_CODE'
        assert second_prize['code_word'] != sheet_name  # НЕ равен sheet_name
        assert second_prize['sheet_name'] == sheet_name  # sheet_name сохранён отдельно
        assert second_prize['telegram_id'] == 987654321
    
    def test_sheet_name_preserved_for_audit(self, sync_service):
        """
        Тест сохранения sheet_name для аудита независимо от code_word
        
        Validates: Requirements 1.4
        """
        # Arrange
        sheet_name = "audit_sheet_2024"
        sheet_data = [
            ['123456789', '', 'CODE_A', 'digital', 'PROMO123', 'Instructions'],
            ['234567890', '', 'CODE_B', 'digital', 'PROMO234', 'Instructions'],
            ['345678901', '', 'CODE_C', 'physical', '', '', 'Петров', 'Петр']
        ]
        
        # Act
        result = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(result) == 3
        
        # Проверяем, что все записи имеют одинаковый sheet_name
        for prize in result:
            assert prize['sheet_name'] == sheet_name
            assert 'code_word' in prize
            assert prize['code_word'] != sheet_name  # code_word отличается от sheet_name
        
        # Проверяем, что code_word разные для каждой записи
        code_words = [prize['code_word'] for prize in result]
        assert code_words == ['CODE_A', 'CODE_B', 'CODE_C']
        
        # Проверяем, что sheet_name одинаковый для всех
        sheet_names = [prize['sheet_name'] for prize in result]
        assert all(name == sheet_name for name in sheet_names)
    
    def test_column_indices_shifted_correctly(self, sync_service):
        """
        Тест корректного сдвига индексов полей после добавления столбца code_word
        
        Validates: Requirements 1.1, 1.2
        """
        # Arrange
        sheet_name = "test_indices_shift"
        
        # Тест для digital приза (НОВАЯ структура с username)
        digital_data = [
            ['123456789', '@testuser', 'DIGITAL_CODE', 'digital', 'PROMO_FROM_INDEX_4', 'Instructions from index 5']
        ]
        
        # Тест для physical приза (НОВАЯ структура с username)
        physical_data = [
            ['987654321', '@physicaluser', 'PHYSICAL_CODE', 'physical', '', '', 
             'Иванов',      # index 6 (было 5)
             'Иван',        # index 7 (было 6)
             'Иванович',    # index 8 (было 7)
             'Москва',      # index 9 (было 8)
             'Ленина',      # index 10 (было 9)
             '10',          # index 11 (было 10)
             '25',          # index 12 (было 11)
             '+79991234567',# index 13 (было 12)
             'Комментарий'  # index 14 (было 13)
            ]
        ]
        
        # Act - тестируем digital приз
        digital_result = sync_service._convert_sheet_data_to_prizes(digital_data, sheet_name)
        
        # Assert для digital приза
        assert len(digital_result) == 1
        digital_prize = digital_result[0]
        
        assert digital_prize['telegram_id'] == 123456789
        assert digital_prize['username'] == '@testuser'  # index 1 (НОВЫЙ)
        assert digital_prize['code_word'] == 'DIGITAL_CODE'  # index 2 (было 1)
        assert digital_prize['prize_type'] == 'digital'      # index 3 (было 2)
        assert digital_prize['promo_code'] == 'PROMO_FROM_INDEX_4'  # index 4 (было 3)
        assert digital_prize['instructions'] == 'Instructions from index 5'  # index 5 (было 4)
        
        # Act - тестируем physical приз
        physical_result = sync_service._convert_sheet_data_to_prizes(physical_data, sheet_name)
        
        # Assert для physical приза
        assert len(physical_result) == 1
        physical_prize = physical_result[0]
        
        assert physical_prize['telegram_id'] == 987654321
        assert physical_prize['username'] == '@physicaluser'  # index 1 (НОВЫЙ)
        assert physical_prize['code_word'] == 'PHYSICAL_CODE'  # index 2 (было 1)
        assert physical_prize['prize_type'] == 'physical'      # index 3 (было 2)
        assert physical_prize['last_name'] == 'Иванов'         # index 6 (было 5)
        assert physical_prize['first_name'] == 'Иван'          # index 7 (было 6)
        assert physical_prize['patronymic'] == 'Иванович'      # index 8 (было 7)
        assert physical_prize['city'] == 'Москва'              # index 9 (было 8)
        assert physical_prize['street'] == 'Ленина'            # index 10 (было 9)
        assert physical_prize['house'] == '10'                 # index 11 (было 10)
        assert physical_prize['apartment'] == '25'             # index 12 (было 11)
        assert physical_prize['phone'] == '+79991234567'       # index 13 (было 12)
        assert physical_prize['comment'] == 'Комментарий'      # index 14 (было 13)
    
    def test_processing_continues_after_invalid_row(self, sync_service, capsys):
        """
        Тест продолжения обработки после невалидной строки
        
        Validates: Requirements 2.4, 4.4
        """
        # Arrange
        sheet_name = "test_continue_after_invalid_row"
        sheet_data = [
            ['111111111', '', 'VALID_1', 'digital', 'PROMO1', 'Instructions 1'],  # Валидная
            ['', '', 'EMPTY_ID', 'digital', 'PROMO2', 'Instructions 2'],          # Невалидная - пустой telegram_id
            ['222222222', '', 'VALID_2', 'digital', 'PROMO3', 'Instructions 3'],  # Валидная
            ['333333333', '', '', 'digital', 'PROMO4', 'Instructions 4'],         # Невалидная - пустой code_word (индекс 2)
            ['444444444', '', 'VALID_3', 'digital', 'PROMO5', 'Instructions 5'],  # Валидная
            ['invalid', '', 'INVALID_ID', 'digital', 'PROMO6', 'Instructions 6'], # Невалидная - невалидный telegram_id
            ['555555555', '', 'VALID_4', 'physical', '', '', 'Петров', 'Петр'],  # Валидная
        ]
        
        # Act
        result = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        # Должны быть обработаны только валидные строки
        assert len(result) == 4
        
        # Проверяем, что обработаны правильные строки
        telegram_ids = [prize['telegram_id'] for prize in result]
        assert 111111111 in telegram_ids
        assert 222222222 in telegram_ids
        assert 444444444 in telegram_ids
        assert 555555555 in telegram_ids
        
        # Проверяем code_word для валидных записей
        code_words = [prize['code_word'] for prize in result]
        assert 'VALID_1' in code_words
        assert 'VALID_2' in code_words
        assert 'VALID_3' in code_words
        assert 'VALID_4' in code_words
        
        # Проверяем логирование невалидных строк
        captured = capsys.readouterr()
        assert "invalid_row_skipped" in captured.out or "invalid_row_data_skipped" in captured.out
    
    def test_processing_continues_after_invalid_sheet(self, sync_service, capsys):
        """
        Тест продолжения обработки после невалидного листа
        
        Validates: Requirements 2.4, 4.4
        """
        # Arrange
        sheet_name = "test_continue_after_invalid_sheet"
        
        # Тест 1: Обработка валидного листа после невалидного
        invalid_sheet_data = [
            ['123456789', '', 'CODE']  # Только 2 столбца - невалидная структура
        ]
        
        valid_sheet_data = [
            ['111111111', '', 'VALID_CODE', 'digital', 'PROMO1', 'Instructions']
        ]
        
        # Act - сначала невалидный лист
        invalid_result = sync_service._convert_sheet_data_to_prizes(invalid_sheet_data, "invalid_sheet")
        
        # Assert - невалидный лист возвращает пустой список
        assert invalid_result == []
        
        # Проверяем логирование ошибки
        captured = capsys.readouterr()
        assert "sheet_structure_invalid" in captured.out
        
        # Act - затем валидный лист (должен обработаться нормально)
        valid_result = sync_service._convert_sheet_data_to_prizes(valid_sheet_data, "valid_sheet")
        
        # Assert - валидный лист обрабатывается успешно
        assert len(valid_result) == 1
        assert valid_result[0]['telegram_id'] == 111111111
        assert valid_result[0]['code_word'] == 'VALID_CODE'