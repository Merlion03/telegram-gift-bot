"""
Unit тесты для SyncWorker

Проверяет:
- Корректное завершение работы worker (graceful shutdown)
- Ожидание завершения текущей синхронизации
- Закрытие подключений к БД
"""
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import pytest

from sync_worker import SyncWorker


class TestSyncWorkerGracefulShutdown:
    """Тесты graceful shutdown для SyncWorker"""
    
    @pytest.mark.asyncio
    async def test_stop_without_running_sync(self):
        """
        Тест корректного завершения работы worker без активной синхронизации
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        worker.running = True
        
        # Mock scheduler
        mock_scheduler = Mock()
        mock_scheduler.running = True
        mock_scheduler.shutdown = Mock()
        worker.scheduler = mock_scheduler
        
        # Mock database
        mock_db = AsyncMock()
        mock_db.close = AsyncMock()
        
        with patch('sync_worker.get_database', return_value=mock_db):
            # Act
            await worker.stop()
            
            # Assert
            assert worker.running is False
            mock_scheduler.shutdown.assert_called_once_with(wait=False)
            mock_db.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_stop_waits_for_current_sync(self):
        """
        Тест ожидания завершения текущей синхронизации перед остановкой
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        worker.running = True
        
        # Mock scheduler
        mock_scheduler = Mock()
        mock_scheduler.running = True
        mock_scheduler.shutdown = Mock()
        worker.scheduler = mock_scheduler
        
        # Создаем задачу синхронизации, которая завершится через 0.1 секунды
        async def slow_sync():
            await asyncio.sleep(0.1)
            return "completed"
        
        worker.current_sync_task = asyncio.create_task(slow_sync())
        
        # Mock database
        mock_db = AsyncMock()
        mock_db.close = AsyncMock()
        
        with patch('sync_worker.get_database', return_value=mock_db):
            # Act
            start_time = asyncio.get_event_loop().time()
            await worker.stop()
            elapsed_time = asyncio.get_event_loop().time() - start_time
            
            # Assert
            assert worker.running is False
            assert worker.current_sync_task.done()
            assert elapsed_time >= 0.1  # Убедились, что дождались завершения
            mock_scheduler.shutdown.assert_called_once_with(wait=False)
            mock_db.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_stop_cancels_sync_on_timeout(self):
        """
        Тест отмены синхронизации при превышении таймаута
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        worker.running = True
        
        # Mock scheduler
        mock_scheduler = Mock()
        mock_scheduler.running = True
        mock_scheduler.shutdown = Mock()
        worker.scheduler = mock_scheduler
        
        # Создаем задачу синхронизации, которая будет работать очень долго
        async def very_slow_sync():
            try:
                await asyncio.sleep(100)  # Очень долгая операция
            except asyncio.CancelledError:
                # Задача была отменена
                raise
        
        worker.current_sync_task = asyncio.create_task(very_slow_sync())
        
        # Mock database
        mock_db = AsyncMock()
        mock_db.close = AsyncMock()
        
        with patch('sync_worker.get_database', return_value=mock_db):
            # Патчим asyncio.wait_for чтобы сразу вызвать TimeoutError
            original_wait_for = asyncio.wait_for
            
            async def mock_wait_for(task, timeout):
                # Сразу вызываем TimeoutError
                raise asyncio.TimeoutError()
            
            with patch('asyncio.wait_for', side_effect=mock_wait_for):
                # Act
                await worker.stop()
                
                # Assert
                assert worker.running is False
                assert worker.current_sync_task.cancelled()
                mock_scheduler.shutdown.assert_called_once_with(wait=False)
                mock_db.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_stop_closes_database_connections(self):
        """
        Тест закрытия подключений к БД при остановке
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        worker.running = True
        
        # Mock scheduler
        mock_scheduler = Mock()
        mock_scheduler.running = True
        mock_scheduler.shutdown = Mock()
        worker.scheduler = mock_scheduler
        
        # Mock database с отслеживанием вызова close
        mock_db = AsyncMock()
        mock_db.close = AsyncMock()
        
        with patch('sync_worker.get_database', return_value=mock_db):
            # Act
            await worker.stop()
            
            # Assert
            mock_db.close.assert_called_once()
            assert worker.running is False
    
    @pytest.mark.asyncio
    async def test_stop_handles_scheduler_not_running(self):
        """
        Тест обработки случая, когда scheduler уже остановлен
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        worker.running = True
        
        # Mock scheduler который уже не запущен
        mock_scheduler = Mock()
        mock_scheduler.running = False
        mock_scheduler.shutdown = Mock()
        worker.scheduler = mock_scheduler
        
        # Mock database
        mock_db = AsyncMock()
        mock_db.close = AsyncMock()
        
        with patch('sync_worker.get_database', return_value=mock_db):
            # Act
            await worker.stop()
            
            # Assert
            assert worker.running is False
            # shutdown не должен вызываться, если scheduler не запущен
            mock_scheduler.shutdown.assert_not_called()
            mock_db.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_stop_handles_no_scheduler(self):
        """
        Тест обработки случая, когда scheduler не инициализирован
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        worker.running = True
        worker.scheduler = None  # Scheduler не инициализирован
        
        # Mock database
        mock_db = AsyncMock()
        mock_db.close = AsyncMock()
        
        with patch('sync_worker.get_database', return_value=mock_db):
            # Act
            await worker.stop()
            
            # Assert
            assert worker.running is False
            mock_db.close.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_sync_job_skips_if_previous_running(self):
        """
        Тест пропуска синхронизации, если предыдущая еще выполняется
        
        Validates: Requirements 8.5
        """
        # Arrange
        worker = SyncWorker()
        
        # Создаем долгую задачу синхронизации
        async def long_sync():
            await asyncio.sleep(1)
        
        worker.current_sync_task = asyncio.create_task(long_sync())
        
        # Mock sync_service
        mock_sync_service = AsyncMock()
        worker.sync_service = mock_sync_service
        
        # Act
        await worker.sync_job()
        
        # Assert
        # sync_service не должен вызываться, т.к. предыдущая синхронизация еще идет
        mock_sync_service.sync_all_sheets.assert_not_called()
        
        # Cleanup
        worker.current_sync_task.cancel()
        try:
            await worker.current_sync_task
        except asyncio.CancelledError:
            pass
    
    @pytest.mark.asyncio
    async def test_sync_job_runs_if_no_previous_task(self):
        """
        Тест выполнения синхронизации, если нет предыдущей задачи
        
        Validates: Requirements 2.1
        """
        # Arrange
        worker = SyncWorker()
        worker.current_sync_task = None
        
        # Mock sync_service
        mock_sync_service = AsyncMock()
        mock_sync_service.sync_all_sheets = AsyncMock(return_value={
            'sheets_processed': 2,
            'sheets_failed': 0,
            'total_records': 10,
            'new_records': 5,
            'updated_records': 5,
            'errors': [],
            'elapsed_seconds': 1.5
        })
        worker.sync_service = mock_sync_service
        
        # Act
        await worker.sync_job()
        
        # Assert
        mock_sync_service.sync_all_sheets.assert_called_once()
        assert worker.current_sync_task is not None
        assert worker.current_sync_task.done()
    
    @pytest.mark.asyncio
    async def test_sync_job_handles_sync_error(self):
        """
        Тест обработки ошибки во время синхронизации
        
        Validates: Requirements 8.1
        """
        # Arrange
        worker = SyncWorker()
        worker.current_sync_task = None
        
        # Mock sync_service который выбрасывает ошибку
        mock_sync_service = AsyncMock()
        mock_sync_service.sync_all_sheets = AsyncMock(
            side_effect=Exception("Test sync error")
        )
        worker.sync_service = mock_sync_service
        
        # Act - не должно выбросить исключение
        await worker.sync_job()
        
        # Assert
        mock_sync_service.sync_all_sheets.assert_called_once()
        assert worker.current_sync_task is not None
        assert worker.current_sync_task.done()


class TestSyncWorkerLifecycle:
    """Тесты жизненного цикла SyncWorker"""
    
    @pytest.mark.asyncio
    async def test_worker_initialization(self):
        """
        Тест инициализации worker
        
        Validates: Requirements 2.1
        """
        # Act
        worker = SyncWorker()
        
        # Assert
        assert worker.scheduler is None
        assert worker.sync_service is None
        assert worker.running is False
        assert worker.current_sync_task is None
    
    @pytest.mark.asyncio
    async def test_start_initializes_components(self):
        """
        Тест инициализации всех компонентов при запуске
        
        Validates: Requirements 2.1, 6.3
        """
        # Arrange
        worker = SyncWorker()
        
        # Mock конфигурацию
        mock_config = Mock()
        mock_config.sync.sync_interval_seconds = 60
        mock_config.sync.use_postgres = True
        mock_config.sync.batch_size = 100
        mock_config.sync.max_retries = 3
        mock_config.database.connection_url = "postgresql+psycopg://test:test@localhost:5432/test"
        mock_config.google_sheets = Mock()
        
        # Mock database
        mock_db = AsyncMock()
        mock_db.health_check = AsyncMock(return_value=True)
        
        # Mock SyncService
        mock_sync_service_class = Mock()
        mock_sync_service_instance = AsyncMock()
        mock_sync_service_instance.sync_all_sheets = AsyncMock(return_value={
            'sheets_processed': 0,
            'sheets_failed': 0,
            'total_records': 0,
            'new_records': 0,
            'updated_records': 0,
            'errors': [],
            'elapsed_seconds': 0.1
        })
        mock_sync_service_class.return_value = mock_sync_service_instance
        
        with patch('sync_worker.get_config', return_value=mock_config), \
             patch('sync_worker.init_database', return_value=mock_db), \
             patch('sync_worker.get_database', return_value=mock_db), \
             patch('sync_worker.SyncService', mock_sync_service_class):
            
            # Запускаем start в отдельной задаче и сразу останавливаем
            start_task = asyncio.create_task(worker.start())
            
            # Даем время на инициализацию
            await asyncio.sleep(0.2)
            
            # Останавливаем worker
            await worker.stop()
            
            # Ждем завершения start
            try:
                await asyncio.wait_for(start_task, timeout=1.0)
            except asyncio.TimeoutError:
                start_task.cancel()
            
            # Assert
            assert worker.sync_service is not None
            assert worker.scheduler is not None
            mock_db.health_check.assert_called_once()
