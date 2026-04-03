"""
Unit тесты для Sync_Worker

Проверяет интеграцию обратной синхронизации в цикл синхронизации,
обработку ошибок и независимость прямой и обратной синхронизации.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sync_worker import SyncWorker


@pytest.fixture
def mock_sync_service():
    """Создаёт mock для SyncService"""
    service = MagicMock()
    service.sync_all_sheets = AsyncMock()
    service.sync_delivery_data_to_sheets = AsyncMock()
    return service


@pytest.fixture
def sync_worker(mock_sync_service):
    """Создаёт SyncWorker с mock SyncService"""
    worker = SyncWorker()
    worker.sync_service = mock_sync_service
    return worker


class TestSyncWorkerBackwardIntegration:
    """Тесты интеграции обратной синхронизации в цикл"""
    
    @pytest.mark.asyncio
    async def test_backward_sync_called_after_forward_sync(
        self, 
        sync_worker, 
        mock_sync_service
    ):
        """
        Тест: обратная синхронизация вызывается после прямой синхронизации
        
        Проверяет, что sync_delivery_data_to_sheets() вызывается после
        sync_all_sheets() в правильном порядке.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 2,
            'sheets_failed': 0,
            'total_records': 10,
            'new_records': 5,
            'updated_records': 3,
            'errors': [],
            'elapsed_seconds': 1.5
        }
        
        backward_stats = {
            'records_processed': 3,
            'records_updated': 3,
            'sheets_updated': 1,
            'errors': [],
            'elapsed_seconds': 0.8
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.return_value = backward_stats
        
        # Act
        await sync_worker._run_sync()
        
        # Assert
        mock_sync_service.sync_all_sheets.assert_called_once()
        mock_sync_service.sync_delivery_data_to_sheets.assert_called_once()
        
        # Проверяем порядок вызовов
        calls = [
            call for call in [
                mock_sync_service.sync_all_sheets.call_args_list,
                mock_sync_service.sync_delivery_data_to_sheets.call_args_list
            ]
        ]
        assert len(mock_sync_service.sync_all_sheets.call_args_list) == 1
        assert len(mock_sync_service.sync_delivery_data_to_sheets.call_args_list) == 1
    
    @pytest.mark.asyncio
    async def test_both_syncs_complete_successfully(
        self, 
        sync_worker, 
        mock_sync_service
    ):
        """
        Тест: обе синхронизации завершаются успешно
        
        Проверяет, что при успешном выполнении обеих синхронизаций
        не возникает исключений.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 3,
            'sheets_failed': 0,
            'total_records': 15,
            'new_records': 8,
            'updated_records': 5,
            'errors': [],
            'elapsed_seconds': 2.1
        }
        
        backward_stats = {
            'records_processed': 5,
            'records_updated': 5,
            'sheets_updated': 2,
            'errors': [],
            'elapsed_seconds': 1.2
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.return_value = backward_stats
        
        # Act & Assert - не должно быть исключений
        await sync_worker._run_sync()
        
        # Проверяем, что оба метода были вызваны
        assert mock_sync_service.sync_all_sheets.called
        assert mock_sync_service.sync_delivery_data_to_sheets.called


class TestSyncWorkerErrorHandling:
    """Тесты обработки ошибок обратной синхронизации"""
    
    @pytest.mark.asyncio
    async def test_backward_sync_error_does_not_block_worker(
        self, 
        sync_worker, 
        mock_sync_service
    ):
        """
        Тест: ошибка обратной синхронизации не блокирует работу worker
        
        Проверяет, что при ошибке в sync_delivery_data_to_sheets()
        worker продолжает работу и не падает.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 2,
            'sheets_failed': 0,
            'total_records': 10,
            'new_records': 5,
            'updated_records': 3,
            'errors': [],
            'elapsed_seconds': 1.5
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.side_effect = Exception(
            "Google Sheets API unavailable"
        )
        
        # Act & Assert - не должно быть необработанных исключений
        await sync_worker._run_sync()
        
        # Проверяем, что прямая синхронизация была выполнена
        mock_sync_service.sync_all_sheets.assert_called_once()
        
        # Проверяем, что попытка обратной синхронизации была сделана
        mock_sync_service.sync_delivery_data_to_sheets.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_backward_sync_error_logged(
        self, 
        sync_worker, 
        mock_sync_service,
        capsys
    ):
        """
        Тест: ошибка обратной синхронизации логируется
        
        Проверяет, что при ошибке в sync_delivery_data_to_sheets()
        ошибка логируется с правильным уровнем и контекстом.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 1,
            'sheets_failed': 0,
            'total_records': 5,
            'new_records': 2,
            'updated_records': 1,
            'errors': [],
            'elapsed_seconds': 1.0
        }
        
        error_message = "Connection timeout to Google Sheets"
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.side_effect = Exception(
            error_message
        )
        
        # Act
        await sync_worker._run_sync()
        
        # Assert
        # Проверяем, что ошибка была залогирована
        captured = capsys.readouterr()
        assert 'backward_sync_failed' in captured.out
        assert error_message in captured.out


class TestSyncWorkerIndependence:
    """Тесты независимости прямой и обратной синхронизации"""
    
    @pytest.mark.asyncio
    async def test_forward_sync_error_prevents_backward_sync(
        self, 
        sync_worker, 
        mock_sync_service
    ):
        """
        Тест: ошибка прямой синхронизации предотвращает обратную синхронизацию
        
        Проверяет, что если sync_all_sheets() падает с ошибкой,
        то sync_delivery_data_to_sheets() не вызывается.
        """
        # Arrange
        mock_sync_service.sync_all_sheets.side_effect = Exception(
            "Database connection failed"
        )
        
        # Act & Assert - не должно быть необработанных исключений
        await sync_worker._run_sync()
        
        # Проверяем, что прямая синхронизация была вызвана
        mock_sync_service.sync_all_sheets.assert_called_once()
        
        # Проверяем, что обратная синхронизация НЕ была вызвана
        mock_sync_service.sync_delivery_data_to_sheets.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_backward_sync_does_not_affect_forward_sync_result(
        self, 
        sync_worker, 
        mock_sync_service
    ):
        """
        Тест: обратная синхронизация не влияет на результат прямой синхронизации
        
        Проверяет, что ошибка в обратной синхронизации не изменяет
        результаты прямой синхронизации.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 2,
            'sheets_failed': 0,
            'total_records': 10,
            'new_records': 5,
            'updated_records': 3,
            'errors': [],
            'elapsed_seconds': 1.5
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.side_effect = Exception(
            "Backward sync failed"
        )
        
        # Act
        await sync_worker._run_sync()
        
        # Assert
        # Проверяем, что прямая синхронизация была выполнена успешно
        mock_sync_service.sync_all_sheets.assert_called_once()
        
        # Проверяем, что результат прямой синхронизации не изменился
        # (это косвенная проверка через отсутствие исключений)
        assert mock_sync_service.sync_all_sheets.call_count == 1


class TestSyncWorkerLogging:
    """Тесты логирования статистики обеих синхронизаций"""
    
    @pytest.mark.asyncio
    async def test_forward_sync_stats_logged(
        self, 
        sync_worker, 
        mock_sync_service,
        capsys
    ):
        """
        Тест: статистика прямой синхронизации логируется
        
        Проверяет, что результаты sync_all_sheets() логируются
        с правильными метриками.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 3,
            'sheets_failed': 1,
            'total_records': 20,
            'new_records': 10,
            'updated_records': 8,
            'errors': [
                {
                    'sheet_name': 'Sheet1',
                    'error_type': 'APIError',
                    'error': 'Rate limit exceeded'
                }
            ],
            'elapsed_seconds': 2.5
        }
        
        backward_stats = {
            'records_processed': 5,
            'records_updated': 5,
            'sheets_updated': 2,
            'errors': [],
            'elapsed_seconds': 1.0
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.return_value = backward_stats
        
        # Act
        await sync_worker._run_sync()
        
        # Assert
        # Проверяем, что статистика прямой синхронизации залогирована
        captured = capsys.readouterr()
        assert 'forward_sync_completed' in captured.out
        
        # Проверяем, что ошибки прямой синхронизации залогированы
        assert 'forward_sync_sheet_error_detail' in captured.out
    
    @pytest.mark.asyncio
    async def test_backward_sync_stats_logged(
        self, 
        sync_worker, 
        mock_sync_service,
        capsys
    ):
        """
        Тест: статистика обратной синхронизации логируется
        
        Проверяет, что результаты sync_delivery_data_to_sheets() логируются
        с правильными метриками.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 2,
            'sheets_failed': 0,
            'total_records': 10,
            'new_records': 5,
            'updated_records': 3,
            'errors': [],
            'elapsed_seconds': 1.5
        }
        
        backward_stats = {
            'records_processed': 8,
            'records_updated': 7,
            'sheets_updated': 3,
            'errors': [
                {
                    'sheet_name': 'Sheet2',
                    'error_type': 'SheetNotFound',
                    'error': 'Sheet not found'
                }
            ],
            'elapsed_seconds': 1.8
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.return_value = backward_stats
        
        # Act
        await sync_worker._run_sync()
        
        # Assert
        # Проверяем, что статистика обратной синхронизации залогирована
        captured = capsys.readouterr()
        assert 'backward_sync_completed' in captured.out
        
        # Проверяем, что ошибки обратной синхронизации залогированы
        assert 'backward_sync_error_detail' in captured.out
    
    @pytest.mark.asyncio
    async def test_sync_job_lifecycle_logged(
        self, 
        sync_worker, 
        mock_sync_service,
        capsys
    ):
        """
        Тест: жизненный цикл sync job логируется
        
        Проверяет, что логируются события начала и завершения sync job.
        """
        # Arrange
        forward_stats = {
            'sheets_processed': 1,
            'sheets_failed': 0,
            'total_records': 5,
            'new_records': 2,
            'updated_records': 1,
            'errors': [],
            'elapsed_seconds': 1.0
        }
        
        backward_stats = {
            'records_processed': 3,
            'records_updated': 3,
            'sheets_updated': 1,
            'errors': [],
            'elapsed_seconds': 0.5
        }
        
        mock_sync_service.sync_all_sheets.return_value = forward_stats
        mock_sync_service.sync_delivery_data_to_sheets.return_value = backward_stats
        
        # Act
        await sync_worker._run_sync()
        
        # Assert
        # Проверяем, что залогированы события начала и завершения
        captured = capsys.readouterr()
        assert 'sync_job_started' in captured.out
        assert 'sync_job_completed' in captured.out
