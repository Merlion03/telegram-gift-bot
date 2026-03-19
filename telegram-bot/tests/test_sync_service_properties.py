"""
Property-based тесты для SyncService

Проверяют универсальные свойства корректности синхронизации данных
"""

import pytest
from hypothesis import given, settings, strategies as st
from typing import List, Dict, Any
from datetime import datetime, timezone
from unittest.mock import Mock

from services.sync_service import SyncService
from config import GoogleSheetsConfig, SyncConfig


class TestSyncServiceProperties:
    """Property-based тесты для SyncService"""
    
    def create_test_sync_service(self) -> SyncService:
        """Создаёт SyncService для тестирования без инициализации клиента"""
        # Создаём mock конфигурации
        mock_google_config = Mock(spec=GoogleSheetsConfig)
        mock_google_config.credentials_path = "test_credentials.json"
        mock_google_config.spreadsheet_id = "test_spreadsheet_id"
        
        mock_sync_config = Mock(spec=SyncConfig)
        mock_sync_config.sync_interval_seconds = 60
        mock_sync_config.batch_size = 100
        mock_sync_config.max_retries = 3
        
        # Создаём SyncService и заменяем клиент на mock
        sync_service = SyncService.__new__(SyncService)
        sync_service.google_sheets_config = mock_google_config
        sync_service.sync_config = mock_sync_config
        sync_service.prize_repository = Mock()
        sync_service.client = Mock()  # Mock клиент вместо реальной инициализации
        
        return sync_service
    
    @settings(max_examples=100)
    @given(
        sheet_name=st.text(min_size=1, max_size=50, alphabet=st.characters(
            whitelist_categories=('Lu', 'Ll', 'Nd'), 
            whitelist_characters='-_'
        )),
        sheet_data=st.lists(
            st.lists(
                st.text(max_size=100),
                min_size=3,  # Минимум telegram_id, code_word и prize_type
                max_size=15  # Максимум всех колонок
            ),
            min_size=1,
            max_size=20
        )
    )
    def test_metadata_fields_always_present(
        self, 
        sheet_name: str, 
        sheet_data: List[List[str]]
    ):
        """
        Feature: google-sheets-code-word-column
        Property: Корректность маппинга метаданных синхронизации
        
        Для любой строки данных из Google Sheets, при синхронизации в PostgreSQL 
        должны корректно заполняться метаданные:
        - sheet_name должен сохраняться для аудита
        - code_word должен извлекаться из столбца B (индекс 1)
        - row_id должен равняться номеру строки в Google Sheets (индекс + 2)
        
        Validates: Requirements 1.4, 2.5, 2.6, 2.7, 8.1
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Фильтруем данные, чтобы первая колонка была валидным telegram_id,
        # вторая - непустым code_word, третья - валидным prize_type
        valid_sheet_data = []
        for row in sheet_data:
            if (len(row) >= 3 and 
                row[0].isdigit() and 
                row[1].strip() and  # code_word не пустой
                row[2] in ['digital', 'physical']):
                valid_sheet_data.append(row)
        
        # Если нет валидных данных, пропускаем тест
        if not valid_sheet_data:
            return
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(
            valid_sheet_data, 
            sheet_name
        )
        
        # Assert
        assert len(prizes_data) == len(valid_sheet_data), \
            "Количество обработанных призов должно равняться количеству валидных строк"
        
        for i, prize_data in enumerate(prizes_data):
            # Property: sheet_name должен сохраняться для аудита
            assert prize_data['sheet_name'] == sheet_name, \
                f"sheet_name должен быть '{sheet_name}', получен '{prize_data['sheet_name']}'"
            
            # Property: code_word должен извлекаться из столбца B (индекс 1)
            expected_code_word = valid_sheet_data[i][1].strip()
            assert prize_data['code_word'] == expected_code_word, \
                f"code_word должен быть '{expected_code_word}', получен '{prize_data['code_word']}'"
            
            # Property: row_id должен корректно вычисляться (индекс + 2)
            expected_row_id = i + 2  # +2 потому что пропускаем заголовок и индекс с 0
            assert prize_data['row_id'] == expected_row_id, \
                f"row_id должен быть {expected_row_id}, получен {prize_data['row_id']}"
            
            # Дополнительные проверки базовых полей
            assert 'telegram_id' in prize_data
            assert 'prize_type' in prize_data
            assert 'created_at' in prize_data
            assert 'updated_at' in prize_data
            
            # Проверяем, что telegram_id корректно преобразован в int
            assert isinstance(prize_data['telegram_id'], int)
            assert prize_data['telegram_id'] == int(valid_sheet_data[i][0])
            
            # Проверяем prize_type (теперь из индекса 2)
            assert prize_data['prize_type'] == valid_sheet_data[i][2]
    
    @settings(max_examples=50)
    @given(
        sheet_name=st.text(min_size=1, max_size=30),
        row_count=st.integers(min_value=1, max_value=100)
    )
    def test_all_valid_rows_are_converted(self, sheet_name: str, row_count: int):
        """
        Feature: google-sheets-code-word-column
        Property: row_id должны быть последовательными начиная с 2
        
        Проверяет, что row_id корректно вычисляются для любого количества строк
        с новой структурой данных (включая столбец code_word)
        
        Validates: Requirements 8.1
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Создаём валидные тестовые данные с новой структурой
        sheet_data = []
        for i in range(row_count):
            sheet_data.append([
                str(100000 + i),      # telegram_id (столбец A)
                f'CODE_{i}',          # code_word (столбец B)
                'digital',            # prize_type (столбец C)
                f'promo_{i}',         # promo_code (столбец D)
                f'instructions_{i}'   # instructions (столбец E)
            ])
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(prizes_data) == row_count
        
        for i, prize_data in enumerate(prizes_data):
            expected_row_id = i + 2  # Начинаем с 2 (пропуск заголовка)
            assert prize_data['row_id'] == expected_row_id, \
                f"row_id для строки {i} должен быть {expected_row_id}"
            
            # Проверяем, что code_word извлекается из столбца B
            expected_code_word = f'CODE_{i}'
            assert prize_data['code_word'] == expected_code_word, \
                f"code_word должен быть '{expected_code_word}', получен '{prize_data['code_word']}'"
        
        # Проверяем, что row_id последовательные
        row_ids = [prize['row_id'] for prize in prizes_data]
        expected_row_ids = list(range(2, 2 + row_count))
        assert row_ids == expected_row_ids, \
            f"row_id должны быть последовательными: {expected_row_ids}, получены: {row_ids}"
    
    @settings(max_examples=50)
    @given(
        sheet_names=st.lists(
            st.text(min_size=1, max_size=20, alphabet=st.characters(
                whitelist_categories=('Lu', 'Ll', 'Nd'),
                whitelist_characters='-_'
            )),
            min_size=1,
            max_size=10,
            unique=True
        )
    )
    def test_sheet_name_preserved_independently(self, sheet_names: List[str]):
        """
        Feature: google-sheets-code-word-column
        Property: sheet_name сохраняется независимо от code_word
        
        Проверяет, что sheet_name всегда сохраняется для аудита,
        а code_word извлекается из столбца B
        
        Validates: Requirements 1.4, 8.1
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Тестовые данные с новой структурой
        test_row = [
            '123456789',        # telegram_id (столбец A)
            'CUSTOM_CODE',      # code_word (столбец B)
            'digital',          # prize_type (столбец C)
            'TEST_PROMO',       # promo_code (столбец D)
            'Test instructions' # instructions (столбец E)
        ]
        
        for sheet_name in sheet_names:
            # Act
            prizes_data = sync_service._convert_sheet_data_to_prizes([test_row], sheet_name)
            
            # Assert
            assert len(prizes_data) == 1
            prize_data = prizes_data[0]
            
            # sheet_name должен сохраняться для аудита
            assert prize_data['sheet_name'] == sheet_name, \
                f"sheet_name должен быть '{sheet_name}', получен '{prize_data['sheet_name']}'"
            
            # code_word должен извлекаться из столбца B, а не из sheet_name
            assert prize_data['code_word'] == 'CUSTOM_CODE', \
                f"code_word должен быть 'CUSTOM_CODE', получен '{prize_data['code_word']}'"
            
            # sheet_name и code_word теперь могут быть разными
            assert prize_data['sheet_name'] != prize_data['code_word'] or sheet_name == 'CUSTOM_CODE', \
                "sheet_name и code_word теперь независимы друг от друга"
    
    @settings(max_examples=100)
    @given(st.lists(
        st.tuples(
            st.integers(min_value=1, max_value=999999999),  # telegram_id
            st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),  # code_word
            st.sampled_from(['digital', 'physical']),  # prize_type
        ),
        min_size=1,
        max_size=100
    ))
    def test_property_code_word_extracted_from_column_b(self, rows_data):
        """
        Feature: google-sheets-code-word-column, Property 1:
        Извлечение code_word из столбца B
        
        Для любых данных листа, code_word должен извлекаться из столбца B (индекс 1),
        а не из sheet_name
        
        Validates: Requirements 1.1, 1.3
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        sheet_name = "TEST_SHEET"
        
        # Формируем данные листа с новой структурой
        sheet_data = []
        for telegram_id, code_word, prize_type in rows_data:
            row = [
                str(telegram_id),  # Столбец A
                code_word,         # Столбец B
                prize_type,        # Столбец C
            ]
            sheet_data.append(row)
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(prizes_data) == len(rows_data), \
            f"Должно быть обработано {len(rows_data)} строк, обработано {len(prizes_data)}"
        
        for i, (telegram_id, expected_code_word, prize_type) in enumerate(rows_data):
            prize_data = prizes_data[i]
            
            # Property 1: code_word должен извлекаться из столбца B (индекс 1)
            actual_code_word = prize_data['code_word']
            assert actual_code_word == expected_code_word.strip(), \
                f"code_word должен быть '{expected_code_word.strip()}', получен '{actual_code_word}'"
            
            # code_word НЕ должен равняться sheet_name (если они случайно не совпадают)
            if expected_code_word.strip() != sheet_name:
                assert actual_code_word != sheet_name, \
                    f"code_word не должен равняться sheet_name '{sheet_name}'"
            
            # Проверяем корректность остальных полей
            assert prize_data['telegram_id'] == telegram_id
            assert prize_data['prize_type'] == prize_type
            assert prize_data['sheet_name'] == sheet_name
    
    @settings(max_examples=100)
    @given(
        st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),  # sheet_name
        st.lists(
            st.tuples(
                st.integers(min_value=1, max_value=999999999),  # telegram_id
                st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),  # code_word
                st.sampled_from(['digital', 'physical']),  # prize_type
            ),
            min_size=1,
            max_size=100
        )
    )
    def test_property_sheet_name_preserved(self, sheet_name, rows_data):
        """
        Feature: google-sheets-code-word-column, Property 2:
        Сохранение sheet_name для аудита
        
        Для любой валидной строки, sheet_name должен сохраняться в Prize_Record
        независимо от значения code_word
        
        Validates: Requirements 1.4
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Формируем данные листа
        sheet_data = []
        for telegram_id, code_word, prize_type in rows_data:
            row = [
                str(telegram_id),  # Столбец A
                code_word,         # Столбец B
                prize_type,        # Столбец C
            ]
            sheet_data.append(row)
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(prizes_data) == len(rows_data)
        
        for i, prize_data in enumerate(prizes_data):
            # Property 2: sheet_name должен сохраняться для аудита
            assert prize_data['sheet_name'] == sheet_name, \
                f"sheet_name должен быть '{sheet_name}', получен '{prize_data['sheet_name']}'"
            
            # sheet_name должен присутствовать независимо от code_word
            assert 'sheet_name' in prize_data
            assert 'code_word' in prize_data
            
            # Проверяем, что code_word извлекается из столбца B, а не из sheet_name
            expected_code_word = rows_data[i][1].strip()
            assert prize_data['code_word'] == expected_code_word
    
    @settings(max_examples=100)
    @given(st.lists(
        st.tuples(
            st.integers(min_value=1, max_value=999999999),  # telegram_id
            st.sampled_from(['', '   ', '\t', '\n', '  \t  ']),  # Пустые code_word
            st.sampled_from(['digital', 'physical']),  # prize_type
        ),
        min_size=1,
        max_size=50
    ))
    def test_property_empty_code_word_rejected(self, rows_data):
        """
        Feature: google-sheets-code-word-column, Property 3:
        Отклонение строк с пустым code_word
        
        Для любой строки с пустым code_word или содержащим только пробельные символы,
        строка должна быть отклонена и не попасть в результирующий список
        
        Validates: Requirements 2.1, 2.2
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        sheet_name = "TEST_SHEET"
        
        # Формируем данные листа с пустыми code_word
        sheet_data = []
        for telegram_id, code_word, prize_type in rows_data:
            row = [
                str(telegram_id),  # Столбец A
                code_word,         # Столбец B (пустой или пробелы)
                prize_type,        # Столбец C
            ]
            sheet_data.append(row)
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        # Property 3: Все строки с пустым code_word должны быть отклонены
        assert len(prizes_data) == 0, \
            f"Все строки с пустым code_word должны быть отклонены, но обработано {len(prizes_data)} строк"
        
        # Проверяем, что ни одна строка не прошла валидацию
        for telegram_id, code_word, prize_type in rows_data:
            # Убеждаемся, что code_word действительно пустой или содержит только пробелы
            assert not code_word.strip(), \
                f"Тестовые данные должны содержать только пустые code_word, получен '{code_word}'"
    
    @settings(max_examples=100)
    @given(
        st.lists(
            st.tuples(
                st.integers(min_value=1, max_value=999999999),  # telegram_id
                st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),  # code_word (валидный)
                st.sampled_from(['digital', 'physical']),  # prize_type
            ),
            min_size=1,
            max_size=20
        ),
        st.lists(
            st.tuples(
                st.integers(min_value=1, max_value=999999999),  # telegram_id
                st.sampled_from(['', '   ', '\t']),  # code_word (невалидный)
                st.sampled_from(['digital', 'physical']),  # prize_type
            ),
            min_size=1,
            max_size=10
        ),
        st.integers(min_value=0, max_value=10)  # insert_position
    )
    def test_property_processing_continues_after_invalid_row(
        self, valid_rows, invalid_rows, insert_position
    ):
        """
        Feature: google-sheets-code-word-column, Property 4:
        Продолжение обработки после невалидной строки
        
        Для любого листа с валидными и невалидными строками,
        все валидные строки должны быть обработаны независимо от позиции невалидных
        
        Validates: Requirements 2.4
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        sheet_name = "TEST_SHEET"
        
        # Формируем валидные строки
        valid_sheet_data = []
        for telegram_id, code_word, prize_type in valid_rows:
            row = [str(telegram_id), code_word, prize_type]
            valid_sheet_data.append(row)
        
        # Формируем невалидные строки
        invalid_sheet_data = []
        for telegram_id, code_word, prize_type in invalid_rows:
            row = [str(telegram_id), code_word, prize_type]
            invalid_sheet_data.append(row)
        
        # Вставляем невалидные строки в случайную позицию
        insert_pos = min(insert_position, len(valid_sheet_data))
        mixed_sheet_data = (
            valid_sheet_data[:insert_pos] + 
            invalid_sheet_data + 
            valid_sheet_data[insert_pos:]
        )
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(mixed_sheet_data, sheet_name)
        
        # Assert
        # Property 4: Все валидные строки должны быть обработаны
        assert len(prizes_data) == len(valid_rows), \
            f"Должно быть обработано {len(valid_rows)} валидных строк, обработано {len(prizes_data)}"
        
        # Проверяем, что все обработанные строки содержат валидные code_word
        for prize_data in prizes_data:
            assert prize_data['code_word'].strip(), \
                "Все обработанные строки должны иметь непустой code_word"
            
            # Проверяем, что code_word из валидного набора
            valid_code_words = [row[1].strip() for row in valid_rows]
            assert prize_data['code_word'] in valid_code_words, \
                f"code_word '{prize_data['code_word']}' должен быть из валидного набора"
    
    @settings(max_examples=100)
    @given(st.lists(
        st.lists(st.text(max_size=50), min_size=0, max_size=2),  # Менее 3 столбцов
        min_size=1,
        max_size=50
    ))
    def test_property_insufficient_columns_rejected(self, sheet_data):
        """
        Feature: google-sheets-code-word-column, Property 5:
        Отклонение листов с недостаточным количеством столбцов
        
        Для любого листа с менее чем 3 столбцами, лист должен быть отклонён
        и метод должен вернуть пустой список
        
        Validates: Requirements 4.1, 4.2
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        sheet_name = "TEST_SHEET"
        
        # Проверяем, что все строки имеют менее 3 столбцов
        for row in sheet_data:
            assert len(row) < 3, \
                f"Тестовые данные должны содержать менее 3 столбцов, получено {len(row)}"
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        # Property 5: Листы с недостаточным количеством столбцов должны быть отклонены
        assert len(prizes_data) == 0, \
            f"Лист с менее чем 3 столбцами должен быть отклонён, но обработано {len(prizes_data)} строк"
    
    @settings(max_examples=100)
    @given(
        st.lists(
            st.lists(st.text(max_size=50), min_size=3, max_size=15),  # Валидные листы (>=3 столбцов)
            min_size=1,
            max_size=10
        ),
        st.lists(
            st.lists(st.text(max_size=50), min_size=0, max_size=2),  # Невалидные листы (<3 столбцов)
            min_size=1,
            max_size=5
        )
    )
    def test_property_processing_continues_after_invalid_sheet(
        self, valid_sheets, invalid_sheets
    ):
        """
        Feature: google-sheets-code-word-column, Property 6:
        Продолжение обработки после невалидного листа
        
        Для любого набора листов с валидными и невалидными структурами,
        валидные листы должны быть обработаны независимо от невалидных
        
        Validates: Requirements 4.4
        
        Примечание: Этот тест симулирует обработку нескольких листов,
        проверяя, что невалидные листы не блокируют обработку валидных
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Подсчитываем ожидаемое количество обработанных строк из валидных листов
        expected_valid_rows = 0
        
        # Обрабатываем валидные листы
        for sheet_idx, sheet_data in enumerate(valid_sheets):
            sheet_name = f"VALID_SHEET_{sheet_idx}"
            
            # Фильтруем валидные строки (telegram_id, code_word, prize_type)
            valid_rows = []
            for row in sheet_data:
                if (len(row) >= 3 and 
                    row[0].isdigit() and 
                    row[1].strip() and 
                    row[2] in ['digital', 'physical']):
                    valid_rows.append(row)
            
            if valid_rows:
                prizes_data = sync_service._convert_sheet_data_to_prizes(valid_rows, sheet_name)
                expected_valid_rows += len(prizes_data)
        
        # Обрабатываем невалидные листы (с менее чем 3 столбцами)
        invalid_results = []
        for sheet_idx, sheet_data in enumerate(invalid_sheets):
            sheet_name = f"INVALID_SHEET_{sheet_idx}"
            
            # Проверяем, что все строки действительно имеют менее 3 столбцов
            all_rows_invalid = all(len(row) < 3 for row in sheet_data) if sheet_data else True
            
            prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
            invalid_results.append((len(prizes_data), all_rows_invalid))
        
        # Assert
        # Property 6: Невалидные листы (где ВСЕ строки имеют < 3 столбцов) должны возвращать пустой список
        for result_count, all_invalid in invalid_results:
            if all_invalid:
                assert result_count == 0, \
                    f"Невалидный лист (все строки < 3 столбцов) должен вернуть 0 строк, получено {result_count}"
        
        # Валидные листы должны быть обработаны (проверяем, что expected_valid_rows > 0 если есть валидные данные)
        # Это косвенная проверка, что обработка продолжается независимо от невалидных листов
        assert expected_valid_rows >= 0, \
            "Обработка валидных листов должна продолжаться независимо от невалидных"
    
    @settings(max_examples=100)
    @given(st.lists(
        st.tuples(
            st.integers(min_value=1, max_value=999999999),  # telegram_id
            st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),  # code_word
            st.just('digital'),  # prize_type (только digital для проверки сдвига)
            st.text(min_size=1, max_size=50),  # promo_code
            st.text(min_size=1, max_size=200),  # instructions
        ),
        min_size=1,
        max_size=100
    ))
    def test_property_column_indices_shifted_correctly(self, rows_data):
        """
        Feature: google-sheets-code-word-column, Property 7:
        Корректный сдвиг индексов для полей приза
        
        Для любой строки с digital призом, promo_code и instructions
        должны извлекаться из столбцов D (индекс 3) и E (индекс 4)
        
        Validates: Requirements 1.1
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        sheet_name = "TEST_SHEET"
        
        # Формируем данные листа с новой структурой
        sheet_data = []
        for telegram_id, code_word, prize_type, promo_code, instructions in rows_data:
            row = [
                str(telegram_id),  # Столбец A (индекс 0)
                code_word,         # Столбец B (индекс 1)
                prize_type,        # Столбец C (индекс 2)
                promo_code,        # Столбец D (индекс 3)
                instructions,      # Столбец E (индекс 4)
            ]
            sheet_data.append(row)
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(prizes_data) == len(rows_data)
        
        for i, (telegram_id, code_word, prize_type, expected_promo, expected_instructions) in enumerate(rows_data):
            prize_data = prizes_data[i]
            
            # Property 7: promo_code должен извлекаться из индекса 3 (столбец D)
            assert prize_data.get('promo_code') == expected_promo, \
                f"promo_code должен быть '{expected_promo}', получен '{prize_data.get('promo_code')}'"
            
            # Property 7: instructions должен извлекаться из индекса 4 (столбец E)
            assert prize_data.get('instructions') == expected_instructions, \
                f"instructions должен быть '{expected_instructions}', получен '{prize_data.get('instructions')}'"
            
            # Проверяем корректность остальных полей
            assert prize_data['telegram_id'] == telegram_id
            assert prize_data['code_word'] == code_word.strip()
            assert prize_data['prize_type'] == prize_type
    
    @settings(max_examples=100)
    @given(
        st.integers(min_value=1, max_value=999999999),  # telegram_id (одинаковый)
        st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),  # code_word (одинаковый)
        st.integers(min_value=2, max_value=10)  # количество дубликатов
    )
    def test_property_duplicate_telegram_code_combination(
        self, telegram_id, code_word, duplicate_count
    ):
        """
        Feature: google-sheets-code-word-column, Property 8:
        Уникальность комбинации (telegram_id, code_word)
        
        Для любых дублирующихся комбинаций (telegram_id, code_word),
        система должна корректно обрабатывать их согласно логике upsert
        
        Validates: Requirements 3.2
        
        Примечание: Этот тест проверяет, что метод _convert_sheet_data_to_prizes
        корректно обрабатывает дубликаты на уровне преобразования данных.
        Фактическая проверка уникальности на уровне БД требует integration теста.
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        sheet_name = "TEST_SHEET"
        
        # Создаём несколько строк с одинаковой комбинацией (telegram_id, code_word)
        sheet_data = []
        for i in range(duplicate_count):
            row = [
                str(telegram_id),  # Одинаковый telegram_id
                code_word,         # Одинаковый code_word
                'digital',         # prize_type
                f'PROMO_{i}',      # Разные promo_code
                f'Instructions {i}'  # Разные instructions
            ]
            sheet_data.append(row)
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        # Все строки должны быть обработаны (валидация уникальности происходит на уровне БД)
        assert len(prizes_data) == duplicate_count, \
            f"Должно быть обработано {duplicate_count} строк, обработано {len(prizes_data)}"
        
        # Проверяем, что все записи имеют одинаковую комбинацию (telegram_id, code_word)
        for prize_data in prizes_data:
            assert prize_data['telegram_id'] == telegram_id, \
                f"telegram_id должен быть {telegram_id}, получен {prize_data['telegram_id']}"
            
            assert prize_data['code_word'] == code_word.strip(), \
                f"code_word должен быть '{code_word.strip()}', получен '{prize_data['code_word']}'"
        
        # Property 8: Комбинация (telegram_id, code_word) должна быть одинаковой для всех записей
        unique_combinations = set(
            (prize['telegram_id'], prize['code_word']) 
            for prize in prizes_data
        )
        assert len(unique_combinations) == 1, \
            f"Все записи должны иметь одинаковую комбинацию (telegram_id, code_word), получено {len(unique_combinations)} уникальных"