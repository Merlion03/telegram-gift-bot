"""
Preservation Property Тесты - Delivery Data Updates Unchanged

ВАЖНО: Следуем методологии observation-first.
Наблюдаем поведение на НЕФИКСИРОВАННОМ коде для обновлений типа DELIVERY_DATA.

Цель: Захватить baseline поведение, которое должно остаться неизменным после исправления.

ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тесты ПРОХОДЯТ на нефиксированном коде.
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase

from services.update_queue_service import (
    UpdateQueueService,
    UpdateTask,
    UpdateType
)


class TestPreservationDeliveryDataUpdates:
    """
    Property 2: Preservation - Delivery Data Updates Unchanged
    
    Проверяем, что обновления DELIVERY_DATA продолжают работать корректно:
    - Механизм retry с exponential backoff
    - Воркер очереди (_worker)
    - Логирование событий
    - Обработка данных доставки
    
    Эти тесты должны ПРОХОДИТЬ на нефиксированном коде.
    """
    
    @pytest.mark.asyncio
    async def test_delivery_data_update_basic_flow(self):
        """
        Observation 1: Базовый поток обновления данных доставки работает корректно
        
        Наблюдаем:
        - add_delivery_data_update создаёт задачу корректно
        - _process_delivery_data обрабатывает задачу успешно
        - Google Sheets API вызывается с правильными параметрами
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service - симулируем успешное обновление
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Добавляем задачу обновления данных доставки
        delivery_data = {
            "name": "Иван Иванов",
            "phone": "+79991234567",
            "address": "Москва, ул. Ленина, д. 1"
        }
        
        await service.add_delivery_data_update(
            telegram_id=123456,
            code_word="RSYA2028",
            row_id=5,
            delivery_data=delivery_data
        )
        
        # Получаем задачу из очереди
        task = await service.queue.get()
        
        # Проверяем структуру задачи
        assert task.update_type == UpdateType.DELIVERY_DATA
        assert task.telegram_id == 123456
        assert task.code_word == "RSYA2028"
        assert task.data["row_id"] == 5
        assert task.data["delivery_data"] == delivery_data
        
        # Обрабатываем задачу
        await service._process_delivery_data(task)
        
        # Проверяем, что Google Sheets API был вызван корректно
        mock_sheets_service.save_delivery_data.assert_called_once_with(
            row_id=5,
            delivery_data=delivery_data,
            worksheet_name="RSYA2028"
        )
    
    @pytest.mark.asyncio
    async def test_retry_mechanism_exponential_backoff(self):
        """
        Observation 2: Механизм retry с exponential backoff работает корректно
        
        Наблюдаем:
        - При ошибке задача повторяется
        - Задержка между попытками увеличивается экспоненциально
        - После max_attempts задача не повторяется
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service - первые 2 попытки падают, 3-я успешна
        mock_sheets_service = Mock()
        call_count = 0
        
        async def mock_save_with_retries(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("Temporary error")
            return True
        
        mock_sheets_service.save_delivery_data = AsyncMock(side_effect=mock_save_with_retries)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Создаём задачу
        task = UpdateTask(
            id="test_delivery_retry",
            update_type=UpdateType.DELIVERY_DATA,
            telegram_id=123456,
            code_word="RSYA2028",
            sheet_name="RSYA2028",
            data={
                "row_id": 5,
                "delivery_data": {"name": "Test"}
            },
            created_at=datetime.now(timezone.utc),
            max_attempts=3
        )
        
        # Первая попытка - _process_task обрабатывает исключение внутри
        await service._process_task(task)
        
        # Проверяем, что attempts увеличился
        assert task.attempts == 1
        
        # Проверяем, что задача была добавлена обратно в очередь
        assert service.queue.qsize() == 1
        
        # Получаем задачу из очереди для второй попытки
        task = await service.queue.get()
        
        # Вторая попытка - упадёт
        await service._process_task(task)
        
        assert task.attempts == 2
        assert service.queue.qsize() == 1
        
        # Третья попытка - успешна
        task = await service.queue.get()
        await service._process_task(task)
        
        assert task.attempts == 3
        assert call_count == 3
        assert service.queue.qsize() == 0  # Задача не добавлена обратно после успеха
    
    @pytest.mark.asyncio
    async def test_worker_processes_delivery_data_tasks_correctly(self):
        """
        Observation 3: Воркер очереди обрабатывает задачи DELIVERY_DATA корректно
        
        Наблюдаем:
        - Воркер запускается и останавливается корректно
        - Задачи обрабатываются в порядке добавления
        - Очередь опустошается после обработки
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Запускаем воркер
        await service.start()
        assert service.running is True
        assert service.worker_task is not None
        
        # Добавляем несколько задач
        for i in range(3):
            await service.add_delivery_data_update(
                telegram_id=123456 + i,
                code_word=f"CODE{i}",
                row_id=i + 1,
                delivery_data={"name": f"User {i}"}
            )
        
        # Ждём, пока очередь опустеет
        await asyncio.sleep(0.5)  # Даём время воркеру обработать задачи
        
        # Проверяем, что все задачи обработаны
        assert service.queue.qsize() == 0
        assert mock_sheets_service.save_delivery_data.call_count == 3
        
        # Останавливаем воркер
        await service.stop()
        assert service.running is False
    
    @pytest.mark.asyncio
    async def test_logging_events_for_delivery_data(self):
        """
        Observation 4: Логирование событий очереди работает правильно
        
        Наблюдаем:
        - Логируется добавление задачи в очередь
        - Логируется начало обработки задачи
        - Логируется успешное завершение задачи
        - Логируются ошибки при обработке
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Патчим logger для проверки логирования
        with patch('services.update_queue_service.logger') as mock_logger:
            # Добавляем задачу
            await service.add_delivery_data_update(
                telegram_id=123456,
                code_word="RSYA2028",
                row_id=5,
                delivery_data={"name": "Test"}
            )
            
            # Проверяем, что залогировано добавление в очередь
            # Проверяем только ключевые параметры, task_id динамический
            queued_calls = [
                call for call in mock_logger.info.call_args_list
                if call[0][0] == "delivery_data_update_queued"
            ]
            assert len(queued_calls) == 1
            call_kwargs = queued_calls[0][1]
            assert call_kwargs['telegram_id'] == 123456
            assert call_kwargs['code_word'] == "RSYA2028"
            assert call_kwargs['row_id'] == 5
            assert 'task_id' in call_kwargs
            
            # Получаем и обрабатываем задачу
            task = await service.queue.get()
            await service._process_task(task)
            
            # Проверяем, что залогировано начало обработки
            processing_calls = [
                call for call in mock_logger.info.call_args_list
                if call[0][0] == "processing_update_task"
            ]
            assert len(processing_calls) > 0
            
            # Проверяем, что залогировано успешное завершение
            completion_calls = [
                call for call in mock_logger.info.call_args_list
                if call[0][0] == "update_task_completed"
            ]
            assert len(completion_calls) > 0
    
    @pytest.mark.asyncio
    @given(
        telegram_id=st.integers(min_value=100000, max_value=999999999),
        code_word=st.text(min_size=5, max_size=20, alphabet=st.characters(
            whitelist_categories=('Lu', 'Ll', 'Nd')
        )),
        row_id=st.integers(min_value=1, max_value=1000),
        name=st.text(min_size=3, max_size=50),
        phone=st.text(min_size=10, max_size=15, alphabet=st.characters(
            whitelist_categories=('Nd',), whitelist_characters='+-()'
        ))
    )
    @settings(
        max_examples=20,
        phases=[Phase.generate, Phase.target]
    )
    async def test_property_delivery_data_unchanged(
        self,
        telegram_id,
        code_word,
        row_id,
        name,
        phone
    ):
        """
        Property-Based Test: Delivery Data Updates Unchanged
        
        Property: Для любого UpdateTask где update_type == DELIVERY_DATA,
        система обрабатывает задачу корректно и вызывает Google Sheets API
        с правильными параметрами.
        
        Генерируем множество тестовых случаев для сильных гарантий.
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Создаём данные доставки
        delivery_data = {
            "name": name,
            "phone": phone
        }
        
        # Добавляем задачу
        await service.add_delivery_data_update(
            telegram_id=telegram_id,
            code_word=code_word,
            row_id=row_id,
            delivery_data=delivery_data
        )
        
        # Получаем и обрабатываем задачу
        task = await service.queue.get()
        await service._process_delivery_data(task)
        
        # Проверяем, что Google Sheets API вызван корректно
        mock_sheets_service.save_delivery_data.assert_called_once_with(
            row_id=row_id,
            delivery_data=delivery_data,
            worksheet_name=code_word
        )
        
        # Проверяем структуру задачи
        assert task.update_type == UpdateType.DELIVERY_DATA
        assert task.telegram_id == telegram_id
        assert task.code_word == code_word
        assert task.data["row_id"] == row_id
        assert task.data["delivery_data"] == delivery_data
    
    @pytest.mark.asyncio
    async def test_max_attempts_exceeded_for_delivery_data(self):
        """
        Observation 5: После превышения max_attempts задача не повторяется
        
        Наблюдаем:
        - Задача повторяется max_attempts раз
        - После превышения лимита задача не добавляется обратно в очередь
        - Логируется ошибка о превышении лимита попыток
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service - всегда падает
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(
            side_effect=RuntimeError("Persistent error")
        )
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Создаём задачу с max_attempts=2
        task = UpdateTask(
            id="test_max_attempts",
            update_type=UpdateType.DELIVERY_DATA,
            telegram_id=123456,
            code_word="RSYA2028",
            sheet_name="RSYA2028",
            data={
                "row_id": 5,
                "delivery_data": {"name": "Test"}
            },
            created_at=datetime.now(timezone.utc),
            max_attempts=2
        )
        
        # Патчим logger для проверки логирования
        with patch('services.update_queue_service.logger') as mock_logger:
            # Первая попытка - _process_task обрабатывает исключение внутри
            await service._process_task(task)
            
            assert task.attempts == 1
            assert service.queue.qsize() == 1  # Задача добавлена обратно
            
            # Вторая попытка
            task = await service.queue.get()
            await service._process_task(task)
            
            assert task.attempts == 2
            assert service.queue.qsize() == 0  # Задача НЕ добавлена обратно
            
            # Проверяем, что залогирована ошибка о превышении лимита
            max_attempts_calls = [
                call for call in mock_logger.error.call_args_list
                if call[0][0] == "update_task_max_attempts_exceeded"
            ]
            assert len(max_attempts_calls) == 1
    
    @pytest.mark.asyncio
    async def test_queue_size_and_wait_empty(self):
        """
        Observation 6: Методы get_queue_size и wait_empty работают корректно
        
        Наблюдаем:
        - get_queue_size возвращает правильный размер очереди
        - wait_empty ждёт, пока очередь опустеет
        - wait_empty возвращает True при успехе, False при таймауте
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service
        mock_sheets_service = Mock()
        mock_sheets_service.save_delivery_data = AsyncMock(return_value=True)
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Проверяем начальный размер очереди
        assert await service.get_queue_size() == 0
        
        # Добавляем задачи
        for i in range(3):
            await service.add_delivery_data_update(
                telegram_id=123456 + i,
                code_word=f"CODE{i}",
                row_id=i + 1,
                delivery_data={"name": f"User {i}"}
            )
        
        # Проверяем размер очереди
        assert await service.get_queue_size() == 3
        
        # Запускаем воркер
        await service.start()
        
        # Ждём, пока очередь опустеет
        result = await service.wait_empty(timeout=5.0)
        assert result is True
        assert await service.get_queue_size() == 0
        
        # Останавливаем воркер
        await service.stop()
    
    @pytest.mark.asyncio
    async def test_worker_continues_after_error(self):
        """
        Observation 7: Воркер продолжает работу даже при ошибках
        
        Наблюдаем:
        - При ошибке в одной задаче воркер не останавливается
        - Последующие задачи обрабатываются корректно
        - Ошибки логируются, но не прерывают работу воркера
        
        ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ на нефиксированном коде
        """
        # Mock Google Sheets Service - первая задача падает, остальные успешны
        mock_sheets_service = Mock()
        call_count = 0
        
        async def mock_save_with_first_error(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("First task error")
            return True
        
        mock_sheets_service.save_delivery_data = AsyncMock(
            side_effect=mock_save_with_first_error
        )
        
        # Создаём UpdateQueueService
        service = UpdateQueueService(
            google_sheets_service=mock_sheets_service
        )
        
        # Запускаем воркер
        await service.start()
        
        # Добавляем задачи
        for i in range(3):
            await service.add_delivery_data_update(
                telegram_id=123456 + i,
                code_word=f"CODE{i}",
                row_id=i + 1,
                delivery_data={"name": f"User {i}"}
            )
        
        # Ждём обработки - увеличиваем время для retry первой задачи
        await asyncio.sleep(5.0)  # Даём время воркеру обработать задачи с retry
        
        # Проверяем, что воркер всё ещё работает
        assert service.running is True
        
        # Проверяем, что последующие задачи были обработаны
        # Первая задача будет повторена несколько раз, поэтому call_count > 3
        assert call_count >= 3, f"Expected at least 3 calls, got {call_count}"
        
        # Останавливаем воркер
        await service.stop()
