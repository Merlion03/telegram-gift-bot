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
                min_size=2,  # Минимум telegram_id и prize_type
                max_size=15  # Максимум всех колонок
            ),
            min_size=1,
            max_size=20
        )
    )
    def test_metadata_mapping_correctness(
        self, 
        sheet_name: str, 
        sheet_data: List[List[str]]
    ):
        """
        Feature: telegram-bot-postgres-sync
        Property 2: Корректность маппинга метаданных синхронизации
        
        Для любой строки данных из Google Sheets, при синхронизации в PostgreSQL 
        должны корректно заполняться метаданные:
        - sheet_name и code_word должны равняться названию текущего листа
        - row_id должен равняться номеру строки в Google Sheets (индекс + 2)
        
        Validates: Requirements 2.5, 2.6, 2.7
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Фильтруем данные, чтобы первая колонка была валидным telegram_id
        valid_sheet_data = []
        for row in sheet_data:
            if len(row) >= 2 and row[0].isdigit() and row[1] in ['digital', 'physical']:
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
            # Property 2.1: sheet_name должен равняться названию листа
            assert prize_data['sheet_name'] == sheet_name, \
                f"sheet_name должен быть '{sheet_name}', получен '{prize_data['sheet_name']}'"
            
            # Property 2.2: code_word должен равняться названию листа
            assert prize_data['code_word'] == sheet_name, \
                f"code_word должен быть '{sheet_name}', получен '{prize_data['code_word']}'"
            
            # Property 2.3: row_id должен корректно вычисляться (индекс + 2)
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
            
            # Проверяем prize_type
            assert prize_data['prize_type'] == valid_sheet_data[i][1]
    
    @settings(max_examples=50)
    @given(
        sheet_name=st.text(min_size=1, max_size=30),
        row_count=st.integers(min_value=1, max_value=100)
    )
    def test_row_id_sequential_property(self, sheet_name: str, row_count: int):
        """
        Property: row_id должны быть последовательными начиная с 2
        
        Проверяет, что row_id корректно вычисляются для любого количества строк
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Создаём валидные тестовые данные
        sheet_data = []
        for i in range(row_count):
            sheet_data.append([
                str(100000 + i),  # telegram_id
                'digital',        # prize_type
                f'promo_{i}',     # promo_code
                f'instructions_{i}'  # instructions
            ])
        
        # Act
        prizes_data = sync_service._convert_sheet_data_to_prizes(sheet_data, sheet_name)
        
        # Assert
        assert len(prizes_data) == row_count
        
        for i, prize_data in enumerate(prizes_data):
            expected_row_id = i + 2  # Начинаем с 2 (пропуск заголовка)
            assert prize_data['row_id'] == expected_row_id, \
                f"row_id для строки {i} должен быть {expected_row_id}"
        
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
    def test_sheet_name_code_word_consistency(self, sheet_names: List[str]):
        """
        Property: sheet_name и code_word всегда должны быть одинаковыми
        
        Проверяет консистентность маппинга для разных названий листов
        """
        # Arrange
        sync_service = self.create_test_sync_service()
        
        # Тестовые данные
        test_row = ['123456789', 'digital', 'TEST_PROMO', 'Test instructions']
        
        for sheet_name in sheet_names:
            # Act
            prizes_data = sync_service._convert_sheet_data_to_prizes([test_row], sheet_name)
            
            # Assert
            assert len(prizes_data) == 1
            prize_data = prizes_data[0]
            
            assert prize_data['sheet_name'] == sheet_name
            assert prize_data['code_word'] == sheet_name
            assert prize_data['sheet_name'] == prize_data['code_word'], \
                f"sheet_name и code_word должны быть одинаковыми для листа '{sheet_name}'"