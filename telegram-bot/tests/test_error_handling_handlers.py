"""
Unit тесты для обработки ошибок в handlers.

Validates: Requirements 12.1, 12.2, 12.4
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from handlers.prize_flow_handler import PrizeFlowHandler
from handlers.delivery_handler import DeliveryHandler
from services.prize_service import PrizeService, PrizeStatus, PrizeResult, MissingPromoCodeError
from database.repositories.prize_repository import DatabaseUnavailableError
from fsm.states import PrizeFlowStates


def create_mock_message(telegram_id: int = 123456, text: str = None, username: str = "testuser"):
    """Создаёт mock объект Message"""
    message = MagicMock()
    message.from_user.id = telegram_id
    message.from_user.username = username
    message.from_user.first_name = "Test"
    message.text = text
    message.answer = AsyncMock()
    message.web_app_data = None
    return message


def create_mock_state():
    """Создаёт mock объект FSMContext"""
    state = AsyncMock()
    state.set_state = AsyncMock()
    state.clear = AsyncMock()
    state.get_state = AsyncMock(return_value=None)
    return state


@pytest.mark.asyncio
async def test_start_prize_flow_database_unavailable():
    """
    Тест для DatabaseUnavailableError в start_prize_flow.
    
    Validates: Requirements 12.1, 12.5
    
    Проверяет, что при недоступности БД:
    - Отправляется сообщение "Сервис временно недоступен"
    - Отображается главное меню
    - FSM состояние сбрасывается
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.check_user_exists.side_effect = DatabaseUnavailableError(
        "БД недоступна"
    )
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456)
    state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(message, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение об ошибке
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "Сервис временно недоступен" in call_args
    
    # Проверяем, что отображено главное меню
    assert message.answer.call_args[1]['reply_markup'] is not None
    
    # Проверяем, что состояние сброшено
    state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_handle_consent_response_database_unavailable():
    """
    Тест для DatabaseUnavailableError в handle_consent_response.
    
    Validates: Requirements 12.1, 12.5
    
    Проверяет, что при недоступности БД при сохранении согласия:
    - Отправляется сообщение "Сервис временно недоступен"
    - Отображается главное меню
    - FSM состояние сбрасывается
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.save_gdpr_consent.side_effect = DatabaseUnavailableError(
        "БД недоступна"
    )
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456, text="✅ Согласен")
    state = create_mock_state()
    
    # Act
    await handler.handle_consent_response(message, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение об ошибке
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "Сервис временно недоступен" in call_args
    
    # Проверяем, что отображено главное меню
    assert message.answer.call_args[1]['reply_markup'] is not None
    
    # Проверяем, что состояние сброшено
    state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_handle_code_word_input_database_unavailable():
    """
    Тест для DatabaseUnavailableError в handle_code_word_input.
    
    Validates: Requirements 12.1, 12.5
    
    Проверяет, что при недоступности БД при проверке кодового слова:
    - Отправляется сообщение "Сервис временно недоступен"
    - Отображается главное меню
    - FSM состояние сбрасывается
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.validate_code_word.side_effect = DatabaseUnavailableError(
        "БД недоступна"
    )
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456, text="test_code")
    state = create_mock_state()
    
    # Act
    await handler.handle_code_word_input(message, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение об ошибке
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "Сервис временно недоступен" in call_args
    
    # Проверяем, что отображено главное меню
    assert message.answer.call_args[1]['reply_markup'] is not None
    
    # Проверяем, что состояние сброшено
    state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_handle_code_word_input_missing_promo_code():
    """
    Тест для MissingPromoCodeError в handle_code_word_input.
    
    Validates: Requirements 12.2, 12.5
    
    Проверяет, что при отсутствии промокода:
    - Отправляется сообщение "Произошла ошибка. Обратитесь в поддержку"
    - Отображается главное меню
    - FSM состояние сбрасывается
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.validate_code_word.return_value = True
    mock_prize_service.check_prize.side_effect = MissingPromoCodeError(
        "Промокод отсутствует"
    )
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456, text="test_code")
    state = create_mock_state()
    
    # Act
    await handler.handle_code_word_input(message, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение об ошибке
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "Произошла ошибка" in call_args
    assert "Обратитесь в поддержку" in call_args
    
    # Проверяем, что отображено главное меню
    assert message.answer.call_args[1]['reply_markup'] is not None
    
    # Проверяем, что состояние сброшено
    state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_send_digital_prize_missing_promo_code():
    """
    Тест для отсутствия промокода в _send_digital_prize.
    
    Validates: Requirements 12.2, 12.5
    
    Проверяет, что при отсутствии промокода в prize_result:
    - Отправляется сообщение "Произошла ошибка. Обратитесь в поддержку"
    - Отображается главное меню
    - FSM состояние сбрасывается
    - Промокод не отправляется пользователю
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456)
    state = create_mock_state()
    
    # Prize result без промокода
    prize_result = PrizeResult(
        status=PrizeStatus.DIGITAL,
        promo_code=None,  # Промокод отсутствует
        instructions="Используйте промокод"
    )
    
    # Act
    await handler._send_digital_prize(message, prize_result, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение об ошибке
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "Произошла ошибка" in call_args
    assert "Обратитесь в поддержку" in call_args
    
    # Проверяем, что отображено главное меню
    assert message.answer.call_args[1]['reply_markup'] is not None
    
    # Проверяем, что состояние сброшено
    state.clear.assert_called_once()
    
    # Проверяем, что промокод НЕ был отправлен
    for call in message.answer.call_args_list:
        call_text = call[0][0]
        assert "Поздравляем" not in call_text or "Произошла ошибка" in call_text


@pytest.mark.asyncio
async def test_handle_consent_response_invalid_button():
    """
    Тест для валидации входных данных в waiting_for_consent.
    
    Validates: Requirements 12.4
    
    Проверяет, что при некорректном ответе (не кнопка):
    - Отправляется подсказка "Пожалуйста, используйте кнопки ниже"
    - Клавиатура с кнопками отображается снова
    - FSM состояние НЕ сбрасывается
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456, text="Какой-то текст")
    state = create_mock_state()
    
    # Act
    await handler.handle_consent_response(message, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлена подсказка
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "используйте кнопки" in call_args
    
    # Проверяем, что клавиатура отображена
    assert message.answer.call_args[1]['reply_markup'] is not None
    
    # Проверяем, что состояние НЕ сброшено
    state.clear.assert_not_called()
    
    # Проверяем, что согласие НЕ сохранено
    mock_prize_service.save_gdpr_consent.assert_not_called()


@pytest.mark.asyncio
async def test_handle_code_word_input_empty_text():
    """
    Тест для валидации входных данных в waiting_for_code_word.
    
    Validates: Requirements 12.4
    
    Проверяет, что при пустом кодовом слове:
    - Отправляется подсказка "Пожалуйста, введите кодовое слово текстом"
    - FSM состояние НЕ сбрасывается
    - Валидация кодового слова НЕ вызывается
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=None
    )
    
    message = create_mock_message(telegram_id=123456, text="   ")  # Пустая строка
    state = create_mock_state()
    
    # Act
    await handler.handle_code_word_input(message, state, session_id=1)
    
    # Assert
    # Проверяем, что отправлена подсказка
    assert message.answer.called
    call_args = message.answer.call_args[0][0]
    assert "введите кодовое слово" in call_args
    
    # Проверяем, что состояние НЕ сброшено
    state.clear.assert_not_called()
    
    # Проверяем, что валидация НЕ вызвана
    mock_prize_service.validate_code_word.assert_not_called()


@pytest.mark.asyncio
async def test_delivery_handler_database_unavailable():
    """
    Тест для DatabaseUnavailableError в DeliveryHandler.
    
    Validates: Requirements 12.1, 12.5
    
    Проверяет, что при недоступности БД при поиске приза:
    - Отправляется сообщение "Сервис временно недоступен"
    - Отображается главное меню
    - FSM состояние сбрасывается
    """
    # Arrange
    from services.google_sheets_service import GoogleSheetsService
    from database.repositories.prize_repository import PrizeRepository
    
    mock_sheets_service = MagicMock(spec=GoogleSheetsService)
    mock_prize_repository = AsyncMock(spec=PrizeRepository)
    
    handler = DeliveryHandler(
        sheets_service=mock_sheets_service,
        prize_repository=mock_prize_repository,
        prize_service=AsyncMock(spec=PrizeService),
        session_manager=None
    )
    
    # Mock для _find_prize_by_id, который выбрасывает DatabaseUnavailableError
    with patch.object(handler, '_find_prize_by_id', side_effect=DatabaseUnavailableError("БД недоступна")):
        message = create_mock_message(telegram_id=123456)
        message.web_app_data = MagicMock()
        message.web_app_data.data = '{"prize_id": 123}'
        
        state = create_mock_state()
        
        # Act
        await handler.handle_delivery_data(message, state, session_id=1)
        
        # Assert
        # Проверяем, что отправлено сообщение об ошибке
        assert message.answer.called
        call_args = message.answer.call_args[0][0]
        assert "Сервис временно недоступен" in call_args
        
        # Проверяем, что отображено главное меню
        assert message.answer.call_args[1]['reply_markup'] is not None
        
        # Проверяем, что состояние сброшено
        state.clear.assert_called_once()
