"""
Тесты для PrizeService.
Включает property-based тесты и unit-тесты.
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone

from services.prize_service import (
    PrizeService,
    PrizeStatus,
    PrizeResult,
    MissingPromoCodeError
)
from services.google_sheets_service import GoogleSheetsService


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_sheets_service():
    """Создаёт mock для GoogleSheetsService"""
    service = Mock(spec=GoogleSheetsService)
    service.client = Mock()
    service.spreadsheet_id = "test_spreadsheet_id"
    return service


@pytest.fixture
def prize_service(mock_sheets_service):
    """Создаёт экземпляр PrizeService с mock зависимостями"""
    return PrizeService(sheets_service=mock_sheets_service)


# ============================================================================
# Property-Based Tests
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=3, max_size=20, alphabet=st.characters(blacklist_characters='\n\r\t')),
    prize_type=st.sampled_from(['digital', 'physical'])
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_3_prize_claimed_marking(
    telegram_id,
    code_word,
    prize_type,
    mock_sheets_service
):
    """
    Property 3: Отметка о получении приза
    Feature: telegram-bot-webapp-system, Property 3
    
    Для любого выданного приза (цифрового или физического),
    в Prize_Database должна появиться отметка о времени получения (claimed_at)
    
    Validates: Requirements 2.4
    """
    # Arrange: создаём PrizeService
    prize_service = PrizeService(sheets_service=mock_sheets_service)
    
    # Подготавливаем данные приза
    row_id = 42
    prize_data = {
        'row_id': row_id,
        'telegram_id': telegram_id,
        'prize_type': prize_type,
    }
    
    if prize_type == 'digital':
        prize_data['promo_code'] = 'TEST123'
        prize_data['instructions'] = 'Use at checkout'
    
    # Настраиваем mock для find_winner
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    # Mock для _mark_prize_claimed_sync
    with patch.object(
        prize_service,
        '_mark_prize_claimed_sync',
        return_value=None
    ) as mock_mark:
        # Act: проверяем приз
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert: проверяем, что приз найден
        assert result.status in [PrizeStatus.DIGITAL, PrizeStatus.PHYSICAL]
        
        # Проверяем, что была вызвана отметка о получении приза
        mock_mark.assert_called_once()
        
        # Проверяем параметры вызова
        call_args = mock_mark.call_args
        assert call_args[0][0] == row_id  # row_id
        assert call_args[0][1] == code_word  # worksheet_name
        
        # Проверяем, что claimed_at содержит валидную дату в формате ДД.ММ.ГГГГ ЧЧ:ММ:СС
        claimed_at = call_args[0][2]
        assert isinstance(claimed_at, str)
        # Проверяем, что это валидная дата в формате ДД.ММ.ГГГГ ЧЧ:ММ:СС
        datetime.strptime(claimed_at, '%d.%m.%Y %H:%M:%S')


# ============================================================================
# Unit Tests
# ============================================================================

@pytest.mark.asyncio
async def test_check_prize_not_found(prize_service, mock_sheets_service):
    """
    Unit-тест: приз не найден в таблице
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    mock_sheets_service.find_winner = AsyncMock(return_value=None)
    
    # Act
    result = await prize_service.check_prize(telegram_id, code_word)
    
    # Assert
    assert result.status == PrizeStatus.NOT_FOUND
    assert result.promo_code is None
    assert result.instructions is None
    assert result.row_id is None


@pytest.mark.asyncio
async def test_check_prize_digital_success(prize_service, mock_sheets_service):
    """
    Unit-тест: успешная проверка цифрового приза
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    prize_data = {
        'row_id': 10,
        'telegram_id': telegram_id,
        'prize_type': 'digital',
        'promo_code': 'PROMO123',
        'instructions': 'Use this code at checkout'
    }
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    with patch.object(prize_service, '_mark_prize_claimed_sync'):
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == 'PROMO123'
        assert result.instructions == 'Use this code at checkout'


@pytest.mark.asyncio
async def test_check_prize_digital_missing_promo_code(prize_service, mock_sheets_service):
    """
    Edge case: цифровой приз без промокода
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    prize_data = {
        'row_id': 10,
        'telegram_id': telegram_id,
        'prize_type': 'digital',
        'promo_code': None,  # Промокод отсутствует
        'instructions': 'Some instructions'
    }
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    # Act & Assert
    with pytest.raises(MissingPromoCodeError):
        await prize_service.check_prize(telegram_id, code_word)


@pytest.mark.asyncio
async def test_check_prize_physical_success(prize_service, mock_sheets_service):
    """
    Unit-тест: успешная проверка физического приза
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    prize_data = {
        'row_id': 15,
        'telegram_id': telegram_id,
        'prize_type': 'physical'
    }
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    with patch.object(prize_service, '_mark_prize_claimed_sync'):
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.PHYSICAL
        assert result.row_id == 15
        assert result.prize_id == 15


@pytest.mark.asyncio
async def test_check_prize_unknown_type(prize_service, mock_sheets_service):
    """
    Edge case: неизвестный тип приза
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    prize_data = {
        'row_id': 20,
        'telegram_id': telegram_id,
        'prize_type': 'unknown_type'
    }
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    # Act
    result = await prize_service.check_prize(telegram_id, code_word)
    
    # Assert
    assert result.status == PrizeStatus.NOT_FOUND


@pytest.mark.asyncio
async def test_mark_prize_claimed_sync(prize_service, mock_sheets_service):
    """
    Unit-тест: синхронная отметка приза как полученного
    """
    # Arrange
    row_id = 10
    worksheet_name = "test_worksheet"
    claimed_at = datetime.now(timezone.utc).isoformat()
    
    # Mock для worksheet
    mock_worksheet = Mock()
    mock_sheet = Mock()
    mock_sheet.worksheet.return_value = mock_worksheet
    mock_sheets_service.client.open_by_key.return_value = mock_sheet
    
    # Act
    prize_service._mark_prize_claimed_sync(row_id, worksheet_name, claimed_at)
    
    # Assert
    mock_sheets_service.client.open_by_key.assert_called_once_with(
        mock_sheets_service.spreadsheet_id
    )
    mock_sheet.worksheet.assert_called_once_with(worksheet_name)
    mock_worksheet.update_cell.assert_called_once_with(row_id, 14, claimed_at)


@pytest.mark.asyncio
async def test_mark_prize_claimed_error_handling(prize_service, mock_sheets_service):
    """
    Unit-тест: обработка ошибок при отметке приза
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    prize_data = {
        'row_id': 10,
        'telegram_id': telegram_id,
        'prize_type': 'digital',
        'promo_code': 'TEST123',
        'instructions': 'Test'
    }
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    # Mock для _mark_prize_claimed_sync, который выбрасывает ошибку
    with patch.object(
        prize_service,
        '_mark_prize_claimed_sync',
        side_effect=Exception("Google Sheets API error")
    ):
        # Act - не должно выбросить исключение, так как ошибка логируется
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert - приз всё равно должен быть возвращён
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == 'TEST123'


@pytest.mark.asyncio
async def test_digital_prize_default_instructions(prize_service, mock_sheets_service):
    """
    Unit-тест: дефолтная инструкция для цифрового приза
    """
    # Arrange
    telegram_id = 12345
    code_word = "test_code"
    prize_data = {
        'row_id': 10,
        'telegram_id': telegram_id,
        'prize_type': 'digital',
        'promo_code': 'PROMO123',
        'instructions': None  # Инструкция отсутствует
    }
    mock_sheets_service.find_winner = AsyncMock(return_value=prize_data)
    
    with patch.object(prize_service, '_mark_prize_claimed_sync'):
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.instructions == "Используйте промокод при оформлении заказа"
