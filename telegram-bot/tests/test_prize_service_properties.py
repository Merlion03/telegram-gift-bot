"""
Property-based тесты для Prize Service

Проверяет универсальные свойства корректности обработки призов
с использованием Hypothesis для генерации случайных данных.
"""

import pytest
from hypothesis import given, settings, strategies as st
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timezone

from services.prize_service import PrizeService, PrizeStatus, PrizeResult
from database.models.prize import Prize
from database.repositories.prize_repository import DatabaseUnavailableError


# Стратегии для генерации тестовых данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
code_words = st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00'))
prize_types = st.sampled_from(['digital', 'physical'])
promo_codes = st.text(min_size=5, max_size=20, alphabet=st.characters(min_codepoint=33, max_codepoint=126))
instructions_text = st.text(min_size=10, max_size=200)


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    code_word=code_words
)
async def test_property_3_prize_search_uses_postgres(telegram_id, code_word):
    """
    Feature: telegram-bot-postgres-sync
    Property 3: Поиск приза в PostgreSQL
    
    Для любого telegram_id и code_word, при отправке кодового слова
    пользователем бот должен выполнять поиск в PostgreSQL по составному
    ключу (telegram_id, code_word) и НЕ должен выполнять запросы к Google Sheets API.
    
    Validates: Requirements 3.1, 3.2
    """
    # Arrange
    mock_sheets_service = Mock()
    mock_sheets_service.find_winner = AsyncMock()
    
    mock_prize_repository = Mock()
    mock_prize_repository.find_prize = AsyncMock(return_value=None)
    
    # Мокаем конфигурацию для использования PostgreSQL
    with patch('services.prize_service.get_config') as mock_config:
        mock_config.return_value.sync.use_postgres = True
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        # Проверяем, что был вызван метод поиска в PostgreSQL
        mock_prize_repository.find_prize.assert_called_once_with(
            telegram_id=telegram_id,
            code_word=code_word,
            timeout_ms=500
        )
        
        # Проверяем, что НЕ был вызван метод поиска в Google Sheets
        mock_sheets_service.find_winner.assert_not_called()
        
        # Проверяем результат
        assert result.status == PrizeStatus.NOT_FOUND


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    code_word=code_words
)
async def test_property_4_not_found_prize_handling(telegram_id, code_word):
    """
    Feature: telegram-bot-postgres-sync
    Property 4: Обработка ненайденного приза
    
    Для любого telegram_id и code_word, если приз не найден в PostgreSQL,
    бот должен вернуть PrizeResult со статусом NOT_FOUND.
    
    Validates: Requirements 3.4
    """
    # Arrange
    mock_sheets_service = Mock()
    mock_prize_repository = Mock()
    mock_prize_repository.find_prize = AsyncMock(return_value=None)
    
    with patch('services.prize_service.get_config') as mock_config:
        mock_config.return_value.sync.use_postgres = True
        
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


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    code_word=code_words,
    promo_code=promo_codes,
    instructions=instructions_text
)
async def test_property_5_digital_prize_handling(
    telegram_id,
    code_word,
    promo_code,
    instructions
):
    """
    Feature: telegram-bot-postgres-sync
    Property 5: Обработка цифрового приза
    
    Для любого найденного приза с prize_type='digital', бот должен
    отправить promo_code и instructions из записи Prize.
    
    Validates: Requirements 3.6
    """
    # Arrange
    mock_sheets_service = Mock()
    mock_sheets_service.client = Mock()
    
    # Создаем мок приза
    mock_prize = Mock(spec=Prize)
    mock_prize.id = 1
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.prize_type = 'digital'
    mock_prize.promo_code = promo_code
    mock_prize.instructions = instructions
    mock_prize.row_id = 2
    mock_prize.sheet_name = code_word
    mock_prize.is_digital = Mock(return_value=True)
    mock_prize.is_physical = Mock(return_value=False)
    
    mock_prize_repository = Mock()
    mock_prize_repository.find_prize = AsyncMock(return_value=mock_prize)
    
    with patch('services.prize_service.get_config') as mock_config:
        mock_config.return_value.sync.use_postgres = True
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Мокаем метод отметки приза
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.DIGITAL
        assert result.promo_code == promo_code
        assert result.instructions == instructions
        
        # Проверяем, что приз был отмечен как полученный
        prize_service._mark_prize_claimed.assert_called_once_with(
            mock_prize.row_id,
            mock_prize.sheet_name
        )


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    code_word=code_words
)
async def test_property_6_physical_prize_handling(telegram_id, code_word):
    """
    Feature: telegram-bot-postgres-sync
    Property 6: Обработка физического приза
    
    Для любого найденного приза с prize_type='physical', бот должен
    вернуть PrizeResult со статусом PHYSICAL и row_id для сбора данных доставки.
    
    Validates: Requirements 3.7
    """
    # Arrange
    mock_sheets_service = Mock()
    mock_sheets_service.client = Mock()
    
    # Создаем мок приза
    mock_prize = Mock(spec=Prize)
    mock_prize.id = 1
    mock_prize.telegram_id = telegram_id
    mock_prize.code_word = code_word
    mock_prize.prize_type = 'physical'
    mock_prize.row_id = 2
    mock_prize.sheet_name = code_word
    mock_prize.is_digital = Mock(return_value=False)
    mock_prize.is_physical = Mock(return_value=True)
    
    mock_prize_repository = Mock()
    mock_prize_repository.find_prize = AsyncMock(return_value=mock_prize)
    
    with patch('services.prize_service.get_config') as mock_config:
        mock_config.return_value.sync.use_postgres = True
        
        prize_service = PrizeService(
            sheets_service=mock_sheets_service,
            prize_repository=mock_prize_repository
        )
        
        # Мокаем метод отметки приза
        prize_service._mark_prize_claimed = AsyncMock()
        
        # Act
        result = await prize_service.check_prize(telegram_id, code_word)
        
        # Assert
        assert result.status == PrizeStatus.PHYSICAL
        assert result.row_id == mock_prize.row_id
        assert result.prize_id == mock_prize.id
        
        # Проверяем, что приз был отмечен как полученный
        prize_service._mark_prize_claimed.assert_called_once_with(
            mock_prize.row_id,
            mock_prize.sheet_name
        )
