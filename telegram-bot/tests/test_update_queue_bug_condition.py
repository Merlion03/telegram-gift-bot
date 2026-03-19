"""
Exploratory тест для Bug Condition - Correct Sheet Name Usage

КРИТИЧЕСКИ ВАЖНО: Этот тест ДОЛЖЕН УПАСТЬ на нефиксированном коде.
Падение подтверждает существование бага.

Цель: Выявить конкретные примеры (counterexamples), демонстрирующие баг.
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase

from services.update_queue_service import (
    UpdateQueueService,
    UpdateTask,
    UpdateType
)


class TestBugConditionExploration:
    """
    Exploratory тесты для проверки Bug Condition
    
    Property 1: Bug Condition - Correct Sheet Name Usage
    
    Тест кодирует ОЖИДАЕМОЕ поведение:
    - UpdateTask должен содержать поле sheet_name
    - _process_prize_claimed должен использовать task.sheet_name
    - Google Sheets API должен получать корректное название листа
    
    На нефиксированном коде тест УПАДЁТ, подтверждая баг.
    После исправления тест ПРОЙДЁТ, подтверждая корректность.
    """
    
    @pytest.mark.asyncio
    async def test_update_task_missing_sheet_name_field(self):
        """
        Тест 1: UpdateTask для PRIZE_CLAIMED содержит поле sheet_name
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Поле sheet_name присутствует после исправления
        """
        # Создаём UpdateTask для PRIZE_CLAIMED
        task = UpdateTask(
            id="test_claimed_123",
            update_type=UpdateType.PRIZE_CLAIMED,
            telegram_id=123456,
            code_word="RSYA2028",
            sheet_name="Лист1",  # Теперь это обязательное поле
            data={
                "row_id": 2,
                "claimed_at": "16.03.2026 12:00:00"
            },
            created_at=datetime.now(timezone.utc)
        )
        
        # ОЖИДАЕМОЕ ПОВЕДЕНИЕ: task должен иметь поле sheet_name
        assert hasattr(task, 'sheet_name'), \
            "UpdateTask должен содержать поле sheet_name для PRIZE_CLAIMED"
        
        # Проверяем, что sheet_name установлен корректно
        assert task.sheet_name == "Лист1", \
            "sheet_name должен быть 'Лист1', а не code_word"
    
    @pytest.mark.asyncio
    async def test_process_prize_claimed_uses_code_word_instead_of_sheet_name(self):
        """
        Тест 2: _process_prize_claimed использует task.sheet_name корректно
        
        Симулирует ситуацию:
        - code_word="RSYA2028"
        - sheet_name="Лист1"
        - Система должна использовать "Лист1" для обновления
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Успешное обновление с правильным sheet_name
        """
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock()
        
        # Симулируем успешное обновление
        mock_sheets_service.save_delivery_data.return_value = True
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Создаём UpdateTask с sheet_name
        task = UpdateTask(
            id="test_claimed_456",
            update_type=UpdateType.PRIZE_CLAIMED,
            telegram_id=123456,
            code_word="RSYA2028",
            sheet_name="Лист1",  # Правильное имя листа
            data={
                "row_id": 2,
                "claimed_at": "16.03.2026 12:00:00"
            },
            created_at=datetime.now(timezone.utc)
        )
        
        # ОЖИДАЕМОЕ ПОВЕДЕНИЕ: _process_prize_claimed должен использовать sheet_name
        await service._process_prize_claimed(task)
        
        # Проверяем, что система использовала sheet_name, а не code_word
        mock_sheets_service.save_delivery_data.assert_called_once()
        call_args = mock_sheets_service.save_delivery_data.call_args
        
        # После исправления должно быть "Лист1" (sheet_name)
        actual_worksheet = call_args.kwargs['worksheet_name']
        assert actual_worksheet == "Лист1", \
            f"Система должна использовать sheet_name='Лист1', но использовала '{actual_worksheet}'"
    
    @pytest.mark.asyncio
    @given(
        code_word=st.text(min_size=5, max_size=20, alphabet=st.characters(
            whitelist_categories=('Lu', 'Ll', 'Nd')
        )),
        sheet_name=st.sampled_from(["Лист1", "Призы", "Winners", "Розыгрыш 2024"])
    )
    @settings(
        max_examples=10,
        phases=[Phase.generate, Phase.target]
    )
    async def test_property_bug_condition_scoped(self, code_word, sheet_name):
        """
        Property-Based Test: Корректное использование sheet_name
        
        Property: Для любого UpdateTask где:
        - update_type == PRIZE_CLAIMED
        - code_word != sheet_name
        
        Система ДОЛЖНА использовать sheet_name, а НЕ code_word
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест проходит после исправления
        """
        # Пропускаем случаи, где code_word == sheet_name (edge case)
        if code_word == sheet_name:
            pytest.skip("Edge case: code_word совпадает с sheet_name")
        
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Создаём UpdateTask с sheet_name
        task = UpdateTask(
            id=f"test_{code_word}",
            update_type=UpdateType.PRIZE_CLAIMED,
            telegram_id=123456,
            code_word=code_word,
            sheet_name=sheet_name,  # Добавляем sheet_name
            data={
                "row_id": 2,
                "claimed_at": "16.03.2026 12:00:00"
            },
            created_at=datetime.now(timezone.utc)
        )
        
        # ОЖИДАЕМОЕ ПОВЕДЕНИЕ: система должна использовать sheet_name
        await service._process_prize_claimed(task)
        
        # Проверяем, что использовался sheet_name (исправление)
        call_args = mock_sheets_service.save_delivery_data.call_args
        actual_worksheet = call_args.kwargs['worksheet_name']
        assert actual_worksheet == sheet_name, \
            f"Система должна использовать sheet_name={sheet_name}, но использовала {actual_worksheet}"

    @pytest.mark.asyncio
    async def test_integration_flow_prize_claimed_with_wrong_worksheet(self):
        """
        Тест 3: Интеграционный тест полного потока с правильным worksheet_name
        
        Симулирует полный поток:
        1. add_prize_claimed_update создаёт задачу с sheet_name
        2. _process_prize_claimed использует sheet_name
        3. Google Sheets API успешно обновляет данные
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Успешное обновление после исправления
        """
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Добавляем задачу в очередь (с sheet_name)
        await service.add_prize_claimed_update(
            telegram_id=123456,
            code_word="RSYA2028",
            sheet_name="Лист1",  # Теперь передаём sheet_name
            row_id=2,
            claimed_at="16.03.2026 12:00:00"
        )
        
        # Получаем задачу из очереди
        task = await service.queue.get()
        
        # Проверяем, что задача содержит sheet_name
        assert hasattr(task, 'sheet_name'), \
            "После исправления UpdateTask должен содержать поле sheet_name"
        
        assert task.sheet_name == "Лист1", \
            "sheet_name должен быть 'Лист1'"
        
        # Обрабатываем задачу - должно пройти успешно
        await service._process_prize_claimed(task)
        
        # Проверяем, что использовался правильный worksheet_name
        call_args = mock_sheets_service.save_delivery_data.call_args
        actual_worksheet = call_args.kwargs['worksheet_name']
        assert actual_worksheet == "Лист1", \
            f"Должен использоваться sheet_name='Лист1', но использовано '{actual_worksheet}'"

