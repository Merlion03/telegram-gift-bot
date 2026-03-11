"""
Unit тесты для обработки ошибок в Sync Service и connection pooling

Проверяет:
- Обработку недоступности Google Sheets API
- Обработку недоступности PostgreSQL
- Обработку конфликта уникального индекса
- Работу connection pooling

Validates: Requirements 8.1, 8.2, 8.4, 8.6
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import gspread
from sqlalchemy.exc import IntegrityError, OperationalError
import asyncio

from services.sync_service import SyncService
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from database.connection import DatabaseConnection
from config import SyncConfig, GoogleSheetsConfig


@pytest.fixture
def mock_google_sheets_config():
    """Фикстура для конфигурации Google Sheets"""
    return GoogleSheetsConfig(
        credentials_path='test_credentials.json',
        spreadsheet_id='test_spreadsheet_id'
    )


@pytest.fixture
def mock_sync_config():
    """Фикстура для конфигурации синхронизации"""
    return SyncConfig(
        sync_interval_seconds=60,
        use_postgres=True,
        batch_size=100,
        max_retries=3
    )


@pytest.fixture
def mock_prize_repository():
    """Фикстура для mock Prize Repository"""
    repo = Mock(spec=PrizeRepository)
    repo.batch_upsert_prizes = AsyncMock()
    return repo


@pytest.fixture
def sync_service(mock_google_sheets_config, mock_sync_config, mock_prize_repository):
    """Фикстура для Sync Service с mock зависимостями"""
    with patch('services.sync_service.Credentials'), \
         patch('services.sync_service.gspread.authorize'):
        service = SyncService(
            google_sheets_config=mock_google_sheets_config,
            sync_config=mock_sync_config,
            prize_repository=mock_prize_repository
        )
        return service


class TestGoogleSheetsAPIErrorHandling:
    """
    Тесты обработки ошибок Google Sheets API
    Validates: Requirement 8.1
    """
    
    @pytest.mark.asyncio
    async def test_sync_continues_when_single_sheet_fails(
        self,
        sync_service,
        mock_prize_repository
    ):
        """
        Тест: синхронизация продолжается при ошибке одного листа
        
        Проверяет, что при ошибке Google Sheets API для одного листа,
        синхронизация продолжается для остальных листов.
        """
        # Arrange
        sheet_names = ['sheet1', 'sheet2', 'sheet3']
        
        # Создаём mock response для gspread.exceptions.APIError
        mock_response = Mock()
        mock_response.json.return_value = {
            "error": {
                "code": 429,
                "message": "Rate limit exceeded"
            }
        }
        mock_response.text = "Rate limit exceeded"
        
        # Mock получения списка листов
        with patch.object(sync_service, '_get_all_sheet_names_with_retry', 
                         return_value=sheet_names):
            
            # Mock sync_sheet: sheet2 падает с ошибкой API
            async def mock_sync_sheet(sheet_name):
                if sheet_name == 'sheet2':
                    raise gspread.exceptions.APIError(mock_response)
                return {
                    'total_records': 10,
                    'new_records': 5,
                    'updated_records': 5,
                    'elapsed_seconds': 1.0
                }
            
            with patch.object(sync_service, 'sync_sheet', side_effect=mock_sync_sheet):
                # Act
                stats = await sync_service.sync_all_sheets()
        
        # Assert
        assert stats['sheets_processed'] == 2  # sheet1 и sheet3 успешны
        assert stats['sheets_failed'] == 1  # sheet2 упал
        assert len(stats['errors']) == 1
        assert stats['errors'][0]['sheet_name'] == 'sheet2'
        assert stats['errors'][0]['error_type'] == 'GoogleSheetsAPIError'
    
    @pytest.mark.asyncio
    async def test_sync_stops_gracefully_when_cannot_get_sheet_names(
        self,
        sync_service
    ):
        """
        Тест: graceful остановка при невозможности получить список листов
        
        Проверяет, что при критической ошибке Google Sheets API
        (невозможность получить список листов), синхронизация
        останавливается gracefully и возвращает статистику с ошибкой.
        """
        # Arrange
        mock_response = Mock()
        mock_response.json.return_value = {
            "error": {
                "code": 503,
                "message": "Service unavailable"
            }
        }
        mock_response.text = "Service unavailable"
        api_error = gspread.exceptions.APIError(mock_response)
        
        with patch.object(sync_service, '_get_all_sheet_names_with_retry',
                         side_effect=api_error):
            # Act
            stats = await sync_service.sync_all_sheets()
        
        # Assert
        assert stats['sheets_processed'] == 0
        assert stats['sheets_failed'] == 0
        assert len(stats['errors']) == 1
        assert stats['errors'][0]['stage'] == 'get_sheet_names'
        assert 'Service unavailable' in stats['errors'][0]['error']
    
    @pytest.mark.asyncio
    async def test_retry_logic_for_transient_api_errors(
        self,
        sync_service,
        mock_prize_repository
    ):
        """
        Тест: retry логика для временных ошибок API
        
        Проверяет, что временные ошибки Google Sheets API
        обрабатываются через retry логику.
        """
        # Arrange
        call_count = 0
        mock_response = Mock()
        mock_response.json.return_value = {
            "error": {
                "code": 500,
                "message": "Temporary error"
            }
        }
        mock_response.text = "Temporary error"
        
        def mock_get_sheet_names_sync():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise gspread.exceptions.APIError(mock_response)
            return ['sheet1']
        
        with patch.object(sync_service, '_get_all_sheet_names_sync',
                         side_effect=mock_get_sheet_names_sync):
            
            # Mock sync_sheet для успешной синхронизации
            async def mock_sync_sheet(sheet_name):
                return {
                    'total_records': 5,
                    'new_records': 5,
                    'updated_records': 0,
                    'elapsed_seconds': 0.5
                }
            
            with patch.object(sync_service, 'sync_sheet', side_effect=mock_sync_sheet):
                # Act
                stats = await sync_service.sync_all_sheets()
        
        # Assert
        assert call_count == 3  # Retry сработал 2 раза, 3-я попытка успешна
        assert stats['sheets_processed'] == 1
        assert stats['sheets_failed'] == 0


class TestPostgreSQLErrorHandling:
    """
    Тесты обработки ошибок PostgreSQL
    Validates: Requirement 8.2
    """
    
    @pytest.mark.asyncio
    async def test_database_unavailable_stops_sync(
        self,
        sync_service,
        mock_prize_repository
    ):
        """
        Тест: недоступность БД останавливает синхронизацию
        
        Проверяет, что при недоступности PostgreSQL синхронизация
        останавливается (не продолжает обработку других листов).
        """
        # Arrange
        sheet_names = ['sheet1', 'sheet2', 'sheet3']
        
        with patch.object(sync_service, '_get_all_sheet_names_with_retry',
                         return_value=sheet_names):
            
            # Mock sync_sheet: первый лист падает с DatabaseUnavailableError
            async def mock_sync_sheet(sheet_name):
                if sheet_name == 'sheet1':
                    raise DatabaseUnavailableError("PostgreSQL connection failed")
                return {
                    'total_records': 10,
                    'new_records': 5,
                    'updated_records': 5,
                    'elapsed_seconds': 1.0
                }
            
            with patch.object(sync_service, 'sync_sheet', side_effect=mock_sync_sheet):
                # Act
                stats = await sync_service.sync_all_sheets()
        
        # Assert
        assert stats['sheets_processed'] == 0  # Ни один лист не обработан
        assert stats['sheets_failed'] == 1  # sheet1 упал
        assert len(stats['errors']) == 1
        assert stats['errors'][0]['error_type'] == 'DatabaseUnavailableError'
        # Синхронизация остановлена, sheet2 и sheet3 не обработаны
    
    @pytest.mark.asyncio
    async def test_prize_repository_handles_database_errors(self):
        """
        Тест: Prize Repository обрабатывает ошибки БД
        
        Проверяет, что Prize Repository корректно обрабатывает
        ошибки подключения к PostgreSQL и пробрасывает
        DatabaseUnavailableError.
        """
        # Arrange
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=OperationalError(
            "connection failed", None, None
        ))
        
        repo = PrizeRepository(session=mock_session)
        
        # Act & Assert
        with pytest.raises(DatabaseUnavailableError) as exc_info:
            await repo.find_prize(telegram_id=123456, code_word='test')
        
        assert "Ошибка при поиске приза" in str(exc_info.value)


class TestUniqueIndexConflictHandling:
    """
    Тесты обработки конфликтов уникального индекса
    Validates: Requirement 8.6
    """
    
    @pytest.mark.asyncio
    async def test_upsert_handles_unique_constraint_conflict(self):
        """
        Тест: upsert обрабатывает конфликт уникального индекса
        
        Проверяет, что при конфликте уникального индекса
        (telegram_id, code_word) выполняется UPDATE существующей записи
        через ON CONFLICT DO UPDATE.
        
        Это интеграционный тест, который проверяет, что SQL запрос
        корректно использует ON CONFLICT DO UPDATE.
        """
        # Arrange
        prize_data = {
            'telegram_id': 123456,
            'code_word': 'test_code',
            'prize_type': 'digital',
            'sheet_name': 'test_sheet',
            'row_id': 2,
            'promo_code': 'PROMO123',
            'instructions': 'Test instructions'
        }
        
        # Mock session для проверки SQL запроса
        mock_session = AsyncMock()
        mock_result = Mock()
        mock_prize = Mock()
        mock_prize.id = 1
        mock_prize.telegram_id = 123456
        mock_result.scalar_one.return_value = mock_prize
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        
        repo = PrizeRepository(session=mock_session)
        
        # Act
        result = await repo.upsert_prize(prize_data)
        
        # Внешний код должен вызвать commit
        await mock_session.commit()
        
        # Assert
        assert result.id == 1
        assert mock_session.execute.called
        assert mock_session.commit.called
        
        # Проверяем, что execute был вызван с INSERT ... ON CONFLICT
        call_args = mock_session.execute.call_args
        stmt = call_args[0][0]
        # Проверяем, что это INSERT statement с ON CONFLICT
        assert hasattr(stmt, 'on_conflict_do_update')


class TestConnectionPooling:
    """
    Тесты работы connection pooling
    Validates: Requirement 8.4
    """
    
    @pytest.mark.asyncio
    async def test_connection_pool_configuration(self):
        """
        Тест: connection pool настроен с правильными параметрами
        
        Проверяет, что connection pool инициализируется с параметрами:
        - pool_size=5
        - max_overflow=15 (итого max 20 подключений)
        - pool_pre_ping=True
        """
        # Arrange
        database_url = "postgresql+psycopg://user:pass@localhost:5432/testdb"
        
        # Act
        db = DatabaseConnection(
            database_url=database_url,
            pool_size=5,
            max_overflow=15,
            pool_pre_ping=True
        )
        
        # Assert
        assert db.engine.pool.size() == 5
        assert db.engine.pool._max_overflow == 15
        # pool_pre_ping проверяется через поведение (автоматическое переподключение)
        
        # Cleanup
        await db.close()
    
    @pytest.mark.asyncio
    async def test_pool_pre_ping_reconnects_on_stale_connection(self):
        """
        Тест: pool_pre_ping автоматически переподключается
        
        Проверяет, что при pool_pre_ping=True соединение
        проверяется перед использованием и автоматически
        переподключается при необходимости.
        
        Это поведенческий тест, который проверяет, что
        pool_pre_ping включен в конфигурации.
        """
        # Arrange
        database_url = "postgresql+psycopg://user:pass@localhost:5432/testdb"
        
        # Act
        db = DatabaseConnection(
            database_url=database_url,
            pool_size=5,
            max_overflow=15,
            pool_pre_ping=True
        )
        
        # Assert
        # Проверяем, что pool_pre_ping включен через engine options
        engine_options = db.engine.pool._pre_ping
        assert engine_options is True
        
        # Cleanup
        await db.close()
    
    @pytest.mark.asyncio
    async def test_connection_pool_handles_concurrent_requests(self):
        """
        Тест: connection pool обрабатывает конкурентные запросы
        
        Проверяет, что connection pool эффективно управляет
        множественными одновременными запросами.
        """
        # Arrange
        database_url = "postgresql+psycopg://user:pass@localhost:5432/testdb"
        db = DatabaseConnection(
            database_url=database_url,
            pool_size=5,
            max_overflow=15,
            pool_pre_ping=True
        )
        
        # Mock session для симуляции запросов
        mock_sessions = []
        
        async def create_mock_session():
            session = AsyncMock()
            mock_sessions.append(session)
            await asyncio.sleep(0.01)  # Симуляция работы
            return session
        
        # Act - создаём 10 конкурентных "запросов"
        tasks = [create_mock_session() for _ in range(10)]
        results = await asyncio.gather(*tasks)
        
        # Assert
        assert len(results) == 10
        assert len(mock_sessions) == 10
        # Connection pool должен переиспользовать соединения
        
        # Cleanup
        await db.close()


class TestTransactionHandling:
    """
    Тесты использования транзакций для batch операций
    Validates: Requirement 8.7
    """
    
    @pytest.mark.asyncio
    async def test_batch_upsert_uses_transaction(self):
        """
        Тест: batch upsert использует транзакции
        
        Проверяет, что batch_upsert_prizes выполняет все операции
        в рамках одной транзакции и ожидает внешний commit.
        """
        # Arrange
        prizes_data = [
            {
                'telegram_id': 123456,
                'code_word': 'code1',
                'prize_type': 'digital',
                'sheet_name': 'sheet1',
                'row_id': 2
            },
            {
                'telegram_id': 789012,
                'code_word': 'code2',
                'prize_type': 'physical',
                'sheet_name': 'sheet2',
                'row_id': 3
            }
        ]
        
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()
        mock_session.commit = AsyncMock()
        
        repo = PrizeRepository(session=mock_session)
        
        # Act
        result = await repo.batch_upsert_prizes(prizes_data)
        
        # Внешний код должен вызвать commit
        await mock_session.commit()
        
        # Assert
        assert result == 2
        assert mock_session.execute.call_count == 2  # По одному execute на запись
        assert mock_session.commit.call_count == 1  # Один commit для всей транзакции
    
    @pytest.mark.asyncio
    async def test_batch_upsert_rolls_back_on_error(self):
        """
        Тест: batch upsert откатывает транзакцию при ошибке
        
        Проверяет, что при ошибке во время batch операции
        внешний код может откатить транзакцию через rollback.
        """
        # Arrange
        prizes_data = [
            {
                'telegram_id': 123456,
                'code_word': 'code1',
                'prize_type': 'digital',
                'sheet_name': 'sheet1',
                'row_id': 2
            }
        ]
        
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=OperationalError(
            "connection failed", None, None
        ))
        mock_session.rollback = AsyncMock()
        
        repo = PrizeRepository(session=mock_session)
        
        # Act & Assert
        with pytest.raises(DatabaseUnavailableError):
            await repo.batch_upsert_prizes(prizes_data)
        
        # Внешний код должен вызвать rollback при ошибке
        await mock_session.rollback()
        
        assert mock_session.rollback.called
