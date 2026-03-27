"""
Unit тесты для PrizeFlowHandler.

Проверяют корректность обработки процесса получения приза,
включая проверку пользователя, GDPR согласие, валидацию кодового слова
и выдачу цифровых и физических призов.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User, Chat, InlineKeyboardMarkup
from aiogram.fsm.context import FSMContext
from datetime import datetime, timezone

from handlers.prize_flow_handler import PrizeFlowHandler
from services.prize_service import PrizeService, PrizeStatus, PrizeResult, MissingPromoCodeError
from database.repositories.prize_repository import DatabaseUnavailableError
from fsm.states import PrizeFlowStates


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id=123456789, username="testuser", first_name="Test", text=None):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.username = username
    message.from_user.first_name = first_name
    message.text = text
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


def create_mock_state():
    """Создаёт mock FSMContext"""
    state = AsyncMock(spec=FSMContext)
    state.set_state = AsyncMock()
    state.clear = AsyncMock()
    state.get_state = AsyncMock(return_value=None)
    return state


def create_mock_prize_service():
    """Создаёт mock PrizeService"""
    service = AsyncMock(spec=PrizeService)
    service.check_user_exists = AsyncMock()
    service.check_gdpr_consent = AsyncMock()
    service.save_gdpr_consent = AsyncMock()
    service.validate_code_word = AsyncMock()
    service.check_prize = AsyncMock()
    return service


def create_mock_session_manager():
    """Создаёт mock SessionManager"""
    manager = AsyncMock()
    manager.save_bot_message = AsyncMock()
    return manager


# ============================================================================
# Unit-тесты для start_prize_flow
# ============================================================================

@pytest.mark.asyncio
async def test_start_prize_flow_user_not_found():
    """
    Тест: start_prize_flow с пользователем не в таблице
    
    Validates: Requirements 2.1, 2.4, 2.5, 2.6
    
    Проверяет, что если пользователь не найден в таблице призов,
    отправляется сообщение об отсутствии в списке победителей
    и отображается главное меню.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.check_user_exists.return_value = False
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message()
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что check_user_exists был вызван
    mock_prize_service.check_user_exists.assert_called_once_with(123456789)
    
    # Проверяем, что отправлено сообщение
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "отсутствует в списке победителей" in sent_message
    
    # Проверяем, что отображено главное меню
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    # Проверяем, что GDPR согласие НЕ проверялось
    mock_prize_service.check_gdpr_consent.assert_not_called()
    
    # Проверяем, что сообщение сохранено через SessionManager
    mock_session_manager.save_bot_message.assert_called_once()


@pytest.mark.asyncio
async def test_start_prize_flow_user_without_gdpr_consent():
    """
    Тест: start_prize_flow с пользователем без GDPR согласия
    
    Validates: Requirements 2.1, 2.3, 3.1, 3.2
    
    Проверяет, что если пользователь найден, но не дал GDPR согласие,
    запрашивается согласие с кнопками "Согласен" и "Назад".
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.check_user_exists.return_value = True
    mock_prize_service.check_gdpr_consent.return_value = False
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message()
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что check_user_exists был вызван
    mock_prize_service.check_user_exists.assert_called_once_with(123456789)
    
    # Проверяем, что check_gdpr_consent был вызван
    mock_prize_service.check_gdpr_consent.assert_called_once_with(123456789)
    
    # Проверяем, что отправлено сообщение с запросом согласия
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "согласие" in sent_message.lower()
    
    # Проверяем, что установлено состояние waiting_for_consent
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_consent)
    
    # Проверяем, что сообщение сохранено
    mock_session_manager.save_bot_message.assert_called_once()


@pytest.mark.asyncio
async def test_start_prize_flow_user_with_gdpr_consent():
    """
    Тест: start_prize_flow с пользователем с GDPR согласием
    
    Validates: Requirements 2.1, 2.3, 3.1, 3.5
    
    Проверяет, что если пользователь найден и уже дал GDPR согласие,
    сразу запрашивается кодовое слово.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.check_user_exists.return_value = True
    mock_prize_service.check_gdpr_consent.return_value = True
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message()
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что check_user_exists был вызван
    mock_prize_service.check_user_exists.assert_called_once_with(123456789)
    
    # Проверяем, что check_gdpr_consent был вызван
    mock_prize_service.check_gdpr_consent.assert_called_once_with(123456789)
    
    # Проверяем, что отправлено сообщение с запросом кодового слова
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "кодовое слово" in sent_message.lower()
    
    # Проверяем, что установлено состояние waiting_for_code_word
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_code_word)
    
    # Проверяем, что сообщение сохранено
    mock_session_manager.save_bot_message.assert_called_once()


@pytest.mark.asyncio
async def test_start_prize_flow_database_unavailable():
    """
    Тест: start_prize_flow при недоступности БД
    
    Validates: Requirements 12.1
    
    Проверяет, что при недоступности БД отправляется сообщение
    "Сервис временно недоступен" и состояние сбрасывается.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.check_user_exists.side_effect = DatabaseUnavailableError("DB unavailable")
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message()
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение об ошибке
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "временно недоступен" in sent_message.lower()
    
    # Проверяем, что состояние сброшено
    mock_state.clear.assert_called_once()
    
    # Проверяем, что отображено главное меню
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs


# ============================================================================
# Unit-тесты для handle_consent_response
# ============================================================================

@pytest.mark.asyncio
async def test_handle_consent_response_agreed():
    """
    Тест: handle_consent_response с кнопкой "Согласен"
    
    Validates: Requirements 3.3, 3.4
    
    Проверяет, что при нажатии "Согласен" сохраняется GDPR согласие
    и запрашивается кодовое слово.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(text="✅ Согласен")
    mock_state = create_mock_state()
    
    # Act
    await handler.handle_consent_response(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что согласие сохранено
    mock_prize_service.save_gdpr_consent.assert_called_once_with(123456789)
    
    # Проверяем, что отправлено сообщение с запросом кодового слова
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "кодовое слово" in sent_message.lower()
    
    # Проверяем, что установлено состояние waiting_for_code_word
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_code_word)
    
    # Проверяем, что сообщение сохранено
    mock_session_manager.save_bot_message.assert_called_once()


@pytest.mark.asyncio
async def test_handle_consent_response_back():
    """
    Тест: handle_consent_response с кнопкой "Назад"
    
    Validates: Requirements 8.2, 8.3, 8.4
    
    Проверяет, что при нажатии "Назад" отображается главное меню,
    состояние сбрасывается и согласие НЕ сохраняется.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(text="◀️ Назад")
    mock_state = create_mock_state()
    
    # Act
    await handler.handle_consent_response(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что согласие НЕ сохранено
    mock_prize_service.save_gdpr_consent.assert_not_called()
    
    # Проверяем, что отправлено сообщение
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "главное меню" in sent_message.lower()
    
    # Проверяем, что состояние сброшено
    mock_state.clear.assert_called_once()
    
    # Проверяем, что отображено главное меню
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs


@pytest.mark.asyncio
async def test_handle_consent_response_invalid():
    """
    Тест: handle_consent_response с некорректным ответом
    
    Validates: Requirements 12.4
    
    Проверяет, что при некорректном ответе отправляется подсказка
    использовать кнопки.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(text="Да, согласен")
    mock_state = create_mock_state()
    
    # Act
    await handler.handle_consent_response(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что отправлена подсказка
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "используйте кнопки" in sent_message.lower()
    
    # Проверяем, что согласие НЕ сохранено
    mock_prize_service.save_gdpr_consent.assert_not_called()
    
    # Проверяем, что состояние НЕ изменено
    mock_state.set_state.assert_not_called()
    mock_state.clear.assert_not_called()


# ============================================================================
# Unit-тесты для handle_code_word_input
# ============================================================================

@pytest.mark.asyncio
async def test_handle_code_word_input_invalid():
    """
    Тест: handle_code_word_input с неверным кодовым словом
    
    Validates: Requirements 5.5, 5.6, 5.7
    
    Проверяет, что при неверном кодовом слове отправляется сообщение
    об ошибке и состояние waiting_for_code_word сохраняется.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.validate_code_word.return_value = False
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(text="wrong_code")
    mock_state = create_mock_state()
    
    # Act
    await handler.handle_code_word_input(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что validate_code_word был вызван
    mock_prize_service.validate_code_word.assert_called_once_with(123456789, "wrong_code")
    
    # Проверяем, что отправлено сообщение об ошибке
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "неверно" in sent_message.lower()
    
    # Проверяем, что состояние НЕ изменено (остаётся waiting_for_code_word)
    mock_state.set_state.assert_not_called()
    mock_state.clear.assert_not_called()
    
    # Проверяем, что check_prize НЕ вызывался
    mock_prize_service.check_prize.assert_not_called()


@pytest.mark.asyncio
async def test_handle_code_word_input_digital_prize():
    """
    Тест: handle_code_word_input с верным кодовым словом (digital)
    
    Validates: Requirements 5.3, 5.4, 6.1
    
    Проверяет, что при верном кодовом слове для цифрового приза
    выдаётся промокод.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.validate_code_word.return_value = True
    mock_prize_service.check_prize.return_value = PrizeResult(
        status=PrizeStatus.DIGITAL,
        promo_code="PROMO123",
        instructions="Используйте промокод при оформлении заказа"
    )
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(text="correct_code")
    mock_state = create_mock_state()
    
    # Act
    await handler.handle_code_word_input(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что validate_code_word был вызван
    mock_prize_service.validate_code_word.assert_called_once_with(123456789, "correct_code")
    
    # Проверяем, что check_prize был вызван
    mock_prize_service.check_prize.assert_called_once_with(123456789, "correct_code")
    
    # Проверяем, что отправлено поздравление с промокодом
    assert mock_message.answer.called
    # Должно быть минимум 3 вызова: поздравление, инструкция, главное меню
    assert mock_message.answer.call_count >= 3
    
    # Проверяем первое сообщение (поздравление)
    first_call = mock_message.answer.call_args_list[0]
    congratulations_text = first_call[0][0]
    assert "PROMO123" in congratulations_text
    
    # Проверяем, что состояние сброшено
    mock_state.clear.assert_called_once()


@pytest.mark.asyncio
async def test_handle_code_word_input_physical_prize():
    """
    Тест: handle_code_word_input с верным кодовым словом (physical)
    
    Validates: Requirements 5.3, 5.4, 7.1
    
    Проверяет, что при верном кодовом слове для физического приза
    отправляется WebApp кнопка.
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_prize_service.validate_code_word.return_value = True
    mock_prize_service.check_prize.return_value = PrizeResult(
        status=PrizeStatus.PHYSICAL,
        prize_id=42,
        row_id=10
    )
    
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager,
        webapp_url="https://example.com/webapp"
    )
    
    mock_message = create_mock_message(text="correct_code")
    mock_state = create_mock_state()
    
    # Act
    await handler.handle_code_word_input(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что validate_code_word был вызван
    mock_prize_service.validate_code_word.assert_called_once_with(123456789, "correct_code")
    
    # Проверяем, что check_prize был вызван
    mock_prize_service.check_prize.assert_called_once_with(123456789, "correct_code")
    
    # Проверяем, что отправлено сообщение с WebApp кнопкой
    assert mock_message.answer.called
    # Должно быть минимум 2 вызова: инструкция и кнопка
    assert mock_message.answer.call_count >= 2
    
    # Проверяем, что установлено состояние waiting_for_delivery_data
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_delivery_data)


# ============================================================================
# Unit-тесты для _send_digital_prize
# ============================================================================

@pytest.mark.asyncio
async def test_send_digital_prize_all_steps():
    """
    Тест: _send_digital_prize с проверкой всех шагов
    
    Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
    
    Проверяет, что при выдаче цифрового приза:
    1. Отправляется поздравление с промокодом
    2. Отправляется инструкция
    3. Отображается главное меню
    4. Сбрасывается FSM состояние
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    prize_result = PrizeResult(
        status=PrizeStatus.DIGITAL,
        promo_code="TESTPROMO",
        instructions="Инструкция по использованию"
    )
    
    mock_message = create_mock_message()
    mock_state = create_mock_state()
    
    # Act
    await handler._send_digital_prize(mock_message, prize_result, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено 3 сообщения
    assert mock_message.answer.call_count == 3
    
    # Проверяем первое сообщение (поздравление)
    first_call = mock_message.answer.call_args_list[0]
    congratulations_text = first_call[0][0]
    assert "TESTPROMO" in congratulations_text
    assert "Поздравляем" in congratulations_text
    
    # Проверяем второе сообщение (инструкция)
    second_call = mock_message.answer.call_args_list[1]
    instructions_text = second_call[0][0]
    assert "Инструкция по использованию" in instructions_text
    
    # Проверяем третье сообщение (главное меню)
    third_call = mock_message.answer.call_args_list[2]
    assert 'reply_markup' in third_call[1]
    
    # Проверяем, что состояние сброшено
    mock_state.clear.assert_called_once()
    
    # Проверяем, что все сообщения сохранены
    assert mock_session_manager.save_bot_message.call_count == 3


# ============================================================================
# Unit-тесты для _send_physical_prize_form
# ============================================================================

@pytest.mark.asyncio
async def test_send_physical_prize_form_webapp_button():
    """
    Тест: _send_physical_prize_form с проверкой WebApp кнопки
    
    Validates: Requirements 7.1, 7.2, 7.3
    
    Проверяет, что при выдаче физического приза:
    1. Отправляется инструкция
    2. Отправляется WebApp кнопка с prize_id
    3. Устанавливается состояние waiting_for_delivery_data
    """
    # Arrange
    mock_prize_service = create_mock_prize_service()
    mock_session_manager = create_mock_session_manager()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager,
        webapp_url="https://example.com/webapp"
    )
    
    prize_result = PrizeResult(
        status=PrizeStatus.PHYSICAL,
        prize_id=99,
        row_id=20
    )
    
    mock_message = create_mock_message()
    mock_state = create_mock_state()
    
    # Act
    await handler._send_physical_prize_form(mock_message, prize_result, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено 2 сообщения
    assert mock_message.answer.call_count == 2
    
    # Проверяем первое сообщение (инструкция)
    first_call = mock_message.answer.call_args_list[0]
    instruction_text = first_call[0][0]
    assert "физический приз" in instruction_text.lower()
    
    # Проверяем второе сообщение (WebApp кнопка)
    second_call = mock_message.answer.call_args_list[1]
    assert 'reply_markup' in second_call[1]
    keyboard = second_call[1]['reply_markup']
    assert isinstance(keyboard, InlineKeyboardMarkup)
    
    # Проверяем, что установлено состояние waiting_for_delivery_data
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_delivery_data)
    
    # Проверяем, что сообщения сохранены
    assert mock_session_manager.save_bot_message.call_count == 2
