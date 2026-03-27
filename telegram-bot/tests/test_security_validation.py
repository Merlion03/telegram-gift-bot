"""
Unit тесты для security проверок

Validates: Security Requirements 1, 2, 3
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from services.prize_service import PrizeService, PrizeStatus, PrizeResult
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError
from database.models.prize import Prize


@pytest.mark.asyncio
async def test_validate_prize_id_with_valid_ownership():
    """
    Тест для validate_prize_id с валидным prize_id (приз принадлежит пользователю)
    
    Validates: Security Requirement 2
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    prize_id = 1
    
    # Мокируем успешную валидацию владения
    mock_repository.validate_prize_ownership.return_value = True
    
    # Act
    is_valid = await prize_service.validate_prize_id(prize_id, telegram_id)
    
    # Assert
    assert is_valid is True
    mock_repository.validate_prize_ownership.assert_called_once_with(
        prize_id=prize_id,
        telegram_id=telegram_id
    )


@pytest.mark.asyncio
async def test_validate_prize_id_with_invalid_ownership():
    """
    Тест для validate_prize_id с невалидным prize_id (приз не принадлежит пользователю)
    
    Validates: Security Requirement 2
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    prize_id = 999  # Чужой приз
    
    # Мокируем неуспешную валидацию владения
    mock_repository.validate_prize_ownership.return_value = False
    
    # Act
    is_valid = await prize_service.validate_prize_id(prize_id, telegram_id)
    
    # Assert
    assert is_valid is False
    mock_repository.validate_prize_ownership.assert_called_once_with(
        prize_id=prize_id,
        telegram_id=telegram_id
    )


@pytest.mark.asyncio
async def test_validate_prize_id_logs_unauthorized_access():
    """
    Тест для проверки логирования попытки доступа к чужому призу
    
    Validates: Security Requirement 2, 3
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    prize_id = 999  # Чужой приз
    
    # Мокируем неуспешную валидацию владения
    mock_repository.validate_prize_ownership.return_value = False
    
    # Act
    with patch('services.prize_service.logger') as mock_logger:
        is_valid = await prize_service.validate_prize_id(prize_id, telegram_id)
        
        # Assert
        assert is_valid is False
        
        # Проверяем, что было залогировано предупреждение о попытке доступа
        mock_logger.warning.assert_called_once()
        call_args = mock_logger.warning.call_args[0]
        assert call_args[0] == "invalid_prize_id_access_attempt"


@pytest.mark.asyncio
async def test_validate_prize_id_handles_database_error():
    """
    Тест для обработки ошибки БД при валидации prize_id
    
    Validates: Security Requirement 2
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    prize_id = 1
    
    # Мокируем ошибку БД
    mock_repository.validate_prize_ownership.side_effect = DatabaseUnavailableError("DB error")
    
    # Act & Assert
    with pytest.raises(DatabaseUnavailableError):
        await prize_service.validate_prize_id(prize_id, telegram_id)


@pytest.mark.asyncio
async def test_user_sees_only_own_promo_code():
    """
    Тест для проверки, что пользователь видит только свой промокод
    
    Validates: Security Requirement 1
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    code_word = "test_code"
    
    # Создаём мок приза с промокодом
    mock_prize = Prize(
        id=1,
        telegram_id=telegram_id,
        code_word=code_word,
        prize_type="digital",
        promo_code="PROMO123",
        instructions="Test instructions",
        row_id=1,
        sheet_name="test_sheet",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    
    mock_repository.find_prize.return_value = mock_prize
    
    # Мокируем метод _mark_prize_claimed_async
    with patch.object(prize_service, '_mark_prize_claimed_async', new_callable=AsyncMock):
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == "PROMO123"
        
        # Проверяем, что find_prize был вызван с правильным telegram_id
        mock_repository.find_prize.assert_called_once_with(
            telegram_id=telegram_id,
            code_word=code_word,
            timeout_ms=500
        )


@pytest.mark.asyncio
async def test_user_cannot_access_other_user_promo_code():
    """
    Тест для проверки, что пользователь не может получить чужой промокод
    
    Validates: Security Requirement 1
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    other_telegram_id = 987654321
    code_word = "test_code"
    
    # Мокируем, что приз не найден для данного пользователя
    # (так как в БД запрос идёт с telegram_id в WHERE условии)
    mock_repository.find_prize.return_value = None
    
    # Act
    result = await prize_service.check_prize(telegram_id, code_word)
    
    # Assert
    assert result.status == PrizeStatus.NOT_FOUND
    assert result.promo_code is None
    
    # Проверяем, что find_prize был вызван с правильным telegram_id
    mock_repository.find_prize.assert_called_once_with(
        telegram_id=telegram_id,
        code_word=code_word,
        timeout_ms=500
    )


@pytest.mark.asyncio
async def test_promo_code_access_is_logged():
    """
    Тест для проверки логирования доступа к промокоду
    
    Validates: Security Requirement 3
    """
    # Arrange
    mock_repository = AsyncMock(spec=PrizeRepository)
    mock_sheets_service = MagicMock()
    
    prize_service = PrizeService(
        sheets_service=mock_sheets_service,
        prize_repository=mock_repository
    )
    
    telegram_id = 123456789
    code_word = "test_code"
    
    # Создаём мок приза с промокодом
    mock_prize = Prize(
        id=1,
        telegram_id=telegram_id,
        code_word=code_word,
        prize_type="digital",
        promo_code="PROMO123",
        instructions="Test instructions",
        row_id=1,
        sheet_name="test_sheet",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    
    mock_repository.find_prize.return_value = mock_prize
    
    # Мокируем метод _mark_prize_claimed_async
    with patch.object(prize_service, '_mark_prize_claimed_async', new_callable=AsyncMock):
        # Act
        with patch('services.prize_service.logger') as mock_logger:
            result = await prize_service.check_prize(telegram_id, code_word)
            
            # Assert
            assert result.status == PrizeStatus.DIGITAL
            assert result.promo_code == "PROMO123"
            
            # Проверяем, что был залогирован доступ к промокоду
            # Ищем вызов с "promo_code_retrieved_from_db"
            info_calls = [call for call in mock_logger.info.call_args_list 
                         if call[0][0] == "promo_code_retrieved_from_db"]
            
            assert len(info_calls) > 0, "Должен быть залогирован доступ к промокоду"


@pytest.mark.asyncio
async def test_repository_validate_prize_ownership_with_valid_prize():
    """
    Тест для validate_prize_ownership в PrizeRepository с валидным призом
    
    Validates: Security Requirement 2
    """
    # Arrange
    from sqlalchemy.ext.asyncio import AsyncSession
    from unittest.mock import MagicMock
    
    mock_session = AsyncMock(spec=AsyncSession)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = 1  # Prize ID найден
    mock_session.execute.return_value = mock_result
    
    repository = PrizeRepository()
    
    telegram_id = 123456789
    prize_id = 1
    
    # Мокируем контекст менеджер сессии
    with patch.object(repository, '_get_session_context') as mock_context:
        mock_context.return_value.__aenter__.return_value = mock_session
        mock_context.return_value.__aexit__.return_value = None
        
        # Act
        is_owner = await repository.validate_prize_ownership(prize_id, telegram_id)
        
        # Assert
        assert is_owner is True
        mock_session.execute.assert_called_once()


@pytest.mark.asyncio
async def test_repository_validate_prize_ownership_with_invalid_prize():
    """
    Тест для validate_prize_ownership в PrizeRepository с невалидным призом
    
    Validates: Security Requirement 2
    """
    # Arrange
    from sqlalchemy.ext.asyncio import AsyncSession
    from unittest.mock import MagicMock
    
    mock_session = AsyncMock(spec=AsyncSession)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # Prize не найден
    mock_session.execute.return_value = mock_result
    
    repository = PrizeRepository()
    
    telegram_id = 123456789
    prize_id = 999  # Чужой приз
    
    # Мокируем контекст менеджер сессии
    with patch.object(repository, '_get_session_context') as mock_context:
        mock_context.return_value.__aenter__.return_value = mock_session
        mock_context.return_value.__aexit__.return_value = None
        
        # Act
        is_owner = await repository.validate_prize_ownership(prize_id, telegram_id)
        
        # Assert
        assert is_owner is False
        mock_session.execute.assert_called_once()


@pytest.mark.asyncio
async def test_repository_validate_prize_ownership_logs_unauthorized_attempt():
    """
    Тест для проверки логирования попытки доступа к чужому призу в Repository
    
    Validates: Security Requirement 2, 3
    """
    # Arrange
    from sqlalchemy.ext.asyncio import AsyncSession
    from unittest.mock import MagicMock
    
    mock_session = AsyncMock(spec=AsyncSession)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # Prize не найден
    mock_session.execute.return_value = mock_result
    
    repository = PrizeRepository()
    
    telegram_id = 123456789
    prize_id = 999  # Чужой приз
    
    # Мокируем контекст менеджер сессии
    with patch.object(repository, '_get_session_context') as mock_context:
        mock_context.return_value.__aenter__.return_value = mock_session
        mock_context.return_value.__aexit__.return_value = None
        
        # Act
        with patch('database.repositories.prize_repository.logger') as mock_logger:
            is_owner = await repository.validate_prize_ownership(prize_id, telegram_id)
            
            # Assert
            assert is_owner is False
            
            # Проверяем, что было залогировано предупреждение
            warning_calls = [call for call in mock_logger.warning.call_args_list 
                           if call[0][0] == "unauthorized_prize_access_attempt"]
            
            assert len(warning_calls) > 0, "Должна быть залогирована попытка несанкционированного доступа"
