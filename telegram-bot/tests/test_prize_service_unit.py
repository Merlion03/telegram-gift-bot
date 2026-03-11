"""
Unit тесты для Prize Service

Проверяет конкретные сценарии работы с призами через PostgreSQL и Google Sheets,
включая обработку ошибок и переключение между архитектурами.
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timezone

from services.prize_service import (
    PrizeService,
    PrizeStatus,
    PrizeResult,
    MissingPromoCodeError
)
from database.models.prize import Prize
from database.repositories.prize_repository import DatabaseUnavailableError


@pytest.fixture
def mock_sheets_service():
    """Фикстура для мока Google Sheets Service"""
    mock = Mock()
    mock.find_winner = AsyncMock()
    mock.client = Mock()
    return mock


@pytest.fixture
def mock_prize_repository():
    """Фикстура для мока Prize Repository"""
    mock = Mock()
    mock.find_prize = AsyncMock()
    return mock


@pytest.fixture
def mock_config_postgres():
    """Фикстура для конфигурации с PostgreSQL"""
    with patch('services.prize_service.get_config') as mock_config:
        mock_config.return_value.sync.use_postgres = True
        yield mock_config


@pytest.fixture
def mock_config_sheets():
    """Фикстура для конфигурации с Google Sheets"""
    with patch('services.prize_service.get_config') as mock_config:
        mock_config.return_value.sync.use_postgres = False
        yield mock_config


class TestDigitalPrizePostgres:
    """Тесты проверки цифрового приза через PostgreSQL"""
    
    @pytest.mark.asyncio
    async def test_digital_prize_found_returns_promo_code(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: Найден цифровой приз - возвращает промокод и инструкции
        Validates: Requirements 3.1, 3.2, 3.6
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_prize = Mock(spec=Prize)
        mock_prize.id = 1
        mock_prize.prize_type = 'digital'
        mock_prize.promo_code = 'PROMO123'
        mock_prize.instructions = 'Используйте промокод на сайте'
        mock_prize.row_id = 2
        mock_prize.sheet_name = code_word
        mock_prize.is_digital = Mock(return_value=True)
        mock_prize.is_physical = Mock(return_value=False)
        
        mock_prize_repository.find_prize = AsyncMock(return_value=mock_prize)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == 'PROMO123'
        assert result.instructions == 'Используйте промокод на сайте'
        
        # Проверяем, что был вызван поиск в PostgreSQL
        mock_prize_repository.find_prize.assert_called_once_with(
            telegram_id=telegram_id,
            code_word=code_word,
            timeout_ms=500
        )
        
        # Проверяем, что приз отмечен как полученный
        prize_service._mark_prize_claimed.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_digital_prize_without_instructions_uses_default(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: Цифровой приз без инструкций - используется текст по умолчанию
        Validates: Requirements 3.6
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_prize = Mock(spec=Prize)
        mock_prize.id = 1
        mock_prize.prize_type = 'digital'
        mock_prize.promo_code = 'PROMO123'
        mock_prize.instructions = None
        mock_prize.row_id = 2
        mock_prize.sheet_name = code_word
        mock_prize.is_digital = Mock(return_value=True)
        mock_prize.is_physical = Mock(return_value=False)
        
        mock_prize_repository.find_prize = AsyncMock(return_value=mock_prize)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == 'PROMO123'
        assert result.instructions == "Используйте промокод при оформлении заказа"
    
    @pytest.mark.asyncio
    async def test_digital_prize_without_promo_code_raises_error(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: Цифровой приз без промокода - выбрасывает исключение
        Validates: Requirements 3.6
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_prize = Mock(spec=Prize)
        mock_prize.id = 1
        mock_prize.prize_type = 'digital'
        mock_prize.promo_code = None  # Отсутствует промокод
        mock_prize.instructions = 'Инструкции'
        mock_prize.is_digital = Mock(return_value=True)
        mock_prize.is_physical = Mock(return_value=False)
        
        mock_prize_repository.find_prize = AsyncMock(return_value=mock_prize)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Act & Assert
        with pytest.raises(MissingPromoCodeError) as exc_info:
            await prize_service.check_prize(telegram_id, code_word)
        
        assert f"Промокод отсутствует для пользователя {telegram_id}" in str(exc_info.value)


class TestPhysicalPrizePostgres:
    """Тесты проверки физического приза через PostgreSQL"""
    
    @pytest.mark.asyncio
    async def test_physical_prize_found_returns_row_id(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: Найден физический приз - возвращает row_id для сбора данных
        Validates: Requirements 3.1, 3.2, 3.7
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_prize = Mock(spec=Prize)
        mock_prize.id = 1
        mock_prize.prize_type = 'physical'
        mock_prize.row_id = 5
        mock_prize.sheet_name = code_word
        mock_prize.is_digital = Mock(return_value=False)
        mock_prize.is_physical = Mock(return_value=True)
        
        mock_prize_repository.find_prize = AsyncMock(return_value=mock_prize)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.PHYSICAL
        assert result.row_id == 5
        assert result.prize_id == 1
        
        # Проверяем, что был вызван поиск в PostgreSQL
        mock_prize_repository.find_prize.assert_called_once_with(
            telegram_id=telegram_id,
            code_word=code_word,
            timeout_ms=500
        )
        
        # Проверяем, что приз отмечен как полученный
        prize_service._mark_prize_claimed.assert_called_once()


class TestPrizeNotFound:
    """Тесты обработки ненайденного приза"""
    
    @pytest.mark.asyncio
    async def test_prize_not_found_postgres(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: Приз не найден в PostgreSQL - возвращает NOT_FOUND
        Validates: Requirements 3.4
        """
        # Arrange
        telegram_id = 123456789
        code_word = "nonexistent_code"
        
        mock_prize_repository.find_prize = AsyncMock(return_value=None)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.NOT_FOUND
        assert result.promo_code is None
        assert result.instructions is None
        assert result.row_id is None
        assert result.prize_id is None


class TestDatabaseErrorHandling:
    """Тесты обработки ошибок подключения к БД"""
    
    @pytest.mark.asyncio
    async def test_database_unavailable_raises_error(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: БД недоступна - выбрасывает DatabaseUnavailableError
        Validates: Requirements 8.3
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_prize_repository.find_prize = AsyncMock(
            side_effect=DatabaseUnavailableError("База данных недоступна")
        )
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Act & Assert
        with pytest.raises(DatabaseUnavailableError) as exc_info:
            await prize_service.check_prize(telegram_id, code_word)
        
        assert "База данных недоступна" in str(exc_info.value)


class TestFeatureFlag:
    """Тесты работы feature flag для переключения между архитектурами"""
    
    @pytest.mark.asyncio
    async def test_use_postgres_true_uses_repository(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_postgres
    ):
        """
        Тест: use_postgres=True - использует PrizeRepository
        Validates: Requirements 10.6, 10.7, 10.8
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_prize_repository.find_prize = AsyncMock(return_value=None)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Act
        await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        mock_prize_repository.find_prize.assert_called_once()
        mock_sheets_service.find_winner.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_use_postgres_false_uses_sheets(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_sheets
    ):
        """
        Тест: use_postgres=False - использует GoogleSheetsService
        Validates: Requirements 10.6, 10.7, 10.8
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        mock_sheets_service.find_winner = AsyncMock(return_value=None)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Act
        await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        mock_sheets_service.find_winner.assert_called_once_with(telegram_id, code_word)
        mock_prize_repository.find_prize.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_sheets_mode_digital_prize(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_sheets
    ):
        """
        Тест: Режим Google Sheets - корректно обрабатывает цифровой приз
        Validates: Requirements 10.6, 10.7
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        prize_data = {
            'prize_type': 'digital',
            'promo_code': 'SHEETS123',
            'instructions': 'Инструкции из Sheets',
            'row_id': 3
        }
        
        mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == 'SHEETS123'
        assert result.instructions == 'Инструкции из Sheets'
        
        # Проверяем, что использовался Google Sheets
        mock_sheets_service.find_winner.assert_called_once()
        mock_prize_repository.find_prize.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_sheets_mode_physical_prize(
        self,
        mock_sheets_service,
        mock_prize_repository,
        mock_config_sheets
    ):
        """
        Тест: Режим Google Sheets - корректно обрабатывает физический приз
        Validates: Requirements 10.6, 10.7
        """
        # Arrange
        telegram_id = 123456789
        code_word = "test_code"
        
        prize_data = {
            'prize_type': 'physical',
            'row_id': 7
        }
        
        mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.PHYSICAL
        assert result.row_id == 7
        assert result.prize_id == 7
        
        # Проверяем, что использовался Google Sheets
        mock_sheets_service.find_winner.assert_called_once()
        mock_prize_repository.find_prize.assert_not_called()
