"""
Property-based тесты для PrizeFlowHandler.

Проверяет универсальные свойства корректности процесса получения приза
с использованием Hypothesis для генерации случайных данных.
"""

import pytest
from hypothesis import given, settings, strategies as st, assume
from unittest.mock import AsyncMock, MagicMock

from handlers.prize_flow_handler import PrizeFlowHandler
from services.prize_service import PrizeService, PrizeStatus, PrizeResult
from fsm.states import PrizeFlowStates


# ============================================================================
# Стратегии для генерации тестовых данных
# ============================================================================

telegram_ids = st.integers(min_value=1, max_value=999999999)
usernames = st.text(min_size=3, max_size=20, alphabet=st.characters(min_codepoint=97, max_codepoint=122))
code_words = st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00'))


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id, username, text=None):
    """Создаёт mock Message от пользователя"""
    from aiogram.types import Message, User, Chat
    
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.username = username
    message.from_user.first_name = username
    message.text = text
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


def create_mock_state():
    """Создаёт mock FSMContext"""
    from aiogram.fsm.context import FSMContext
    
    state = AsyncMock(spec=FSMContext)
    state.set_state = AsyncMock()
    state.clear = AsyncMock()
    state.get_state = AsyncMock(return_value=None)
    return state


# ============================================================================
# Property 2: User Not Found Response
# ============================================================================

@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    username=usernames
)
async def test_property_2_user_not_found_response(telegram_id, username):
    """
    Property 2: User Not Found Response
    
    Validates: Requirements 2.4, 2.5, 2.6
    
    Для любого telegram_id НЕ в Prize_Table, система должна отправить
    сообщение "Ваш аккаунт отсутствует в списке победителей" и
    отобразить главное меню.
    
    Универсальное свойство: независимо от telegram_id, если пользователь
    не найден, поведение системы должно быть одинаковым.
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.check_user_exists = AsyncMock(return_value=False)
    
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(telegram_id, username)
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что check_user_exists был вызван с правильным telegram_id
    mock_prize_service.check_user_exists.assert_called_once_with(telegram_id)
    
    # Проверяем, что отправлено сообщение
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    # Проверяем содержание сообщения
    assert "отсутствует в списке победителей" in sent_message
    
    # Проверяем, что отображено главное меню
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    # Проверяем, что GDPR согласие НЕ проверялось
    mock_prize_service.check_gdpr_consent.assert_not_called()
    
    # Проверяем, что состояние НЕ установлено
    mock_state.set_state.assert_not_called()


# ============================================================================
# Property 12: Unlimited Code Word Attempts
# ============================================================================

@pytest.mark.asyncio
@settings(max_examples=50)
@given(
    telegram_id=telegram_ids,
    username=usernames,
    attempts=st.integers(min_value=1, max_value=10)
)
async def test_property_12_unlimited_code_word_attempts(telegram_id, username, attempts):
    """
    Property 12: Unlimited Code Word Attempts
    
    Validates: Requirements 5.7
    
    Для любого количества N неверных попыток ввода кодового слова,
    система должна позволить (N+1)-ю попытку без ограничений.
    
    Универсальное свойство: система никогда не блокирует пользователя
    после неверных попыток ввода кодового слова.
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.validate_code_word = AsyncMock(return_value=False)
    
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_state = create_mock_state()
    
    # Act: Выполняем N неверных попыток
    for attempt in range(attempts):
        mock_message = create_mock_message(
            telegram_id, 
            username, 
            text=f"wrong_code_{attempt}"
        )
        
        await handler.handle_code_word_input(mock_message, mock_state, session_id=1)
        
        # Assert для каждой попытки
        # Проверяем, что validate_code_word был вызван
        assert mock_prize_service.validate_code_word.called
        
        # Проверяем, что отправлено сообщение об ошибке
        assert mock_message.answer.called
        sent_message = mock_message.answer.call_args[0][0]
        assert "неверно" in sent_message.lower()
        
        # Проверяем, что состояние НЕ сброшено (остаётся waiting_for_code_word)
        mock_state.clear.assert_not_called()
        
        # Проверяем, что check_prize НЕ вызывался
        mock_prize_service.check_prize.assert_not_called()
    
    # Проверяем, что после N неверных попыток можно сделать (N+1)-ю попытку
    mock_message_next = create_mock_message(
        telegram_id, 
        username, 
        text=f"wrong_code_{attempts}"
    )
    
    # Сбрасываем моки для чистоты проверки
    mock_prize_service.validate_code_word.reset_mock()
    mock_message_next.answer.reset_mock()
    
    # Act: (N+1)-я попытка
    await handler.handle_code_word_input(mock_message_next, mock_state, session_id=1)
    
    # Assert: (N+1)-я попытка обрабатывается так же, как и предыдущие
    mock_prize_service.validate_code_word.assert_called_once()
    assert mock_message_next.answer.called


# ============================================================================
# Property: GDPR Consent Request Consistency
# ============================================================================

@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    username=usernames
)
async def test_property_gdpr_consent_request_consistency(telegram_id, username):
    """
    Property: GDPR Consent Request Consistency
    
    Validates: Requirements 3.1, 3.2
    
    Для любого пользователя в Prize_Table без GDPR согласия,
    система должна запросить согласие с кнопками "Согласен" и "Назад"
    и установить состояние waiting_for_consent.
    
    Универсальное свойство: запрос согласия всегда одинаков для всех
    пользователей без согласия.
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.check_user_exists = AsyncMock(return_value=True)
    mock_prize_service.check_gdpr_consent = AsyncMock(return_value=False)
    
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(telegram_id, username)
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что check_gdpr_consent был вызван
    mock_prize_service.check_gdpr_consent.assert_called_once_with(telegram_id)
    
    # Проверяем, что отправлено сообщение с запросом согласия
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "согласие" in sent_message.lower()
    
    # Проверяем, что установлено состояние waiting_for_consent
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_consent)
    
    # Проверяем, что отображена клавиатура с кнопками
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs


# ============================================================================
# Property: Code Word Request After Consent
# ============================================================================

@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    username=usernames
)
async def test_property_code_word_request_after_consent(telegram_id, username):
    """
    Property: Code Word Request After Consent
    
    Validates: Requirements 3.5, 5.1
    
    Для любого пользователя в Prize_Table с GDPR согласием,
    система должна сразу запросить кодовое слово и установить
    состояние waiting_for_code_word.
    
    Универсальное свойство: пользователи с согласием пропускают
    этап запроса согласия.
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.check_user_exists = AsyncMock(return_value=True)
    mock_prize_service.check_gdpr_consent = AsyncMock(return_value=True)
    
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(telegram_id, username)
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что check_gdpr_consent был вызван
    mock_prize_service.check_gdpr_consent.assert_called_once_with(telegram_id)
    
    # Проверяем, что отправлено сообщение с запросом кодового слова
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "кодовое слово" in sent_message.lower()
    
    # Проверяем, что установлено состояние waiting_for_code_word
    mock_state.set_state.assert_called_once_with(PrizeFlowStates.waiting_for_code_word)
    
    # Проверяем, что save_gdpr_consent НЕ вызывался
    mock_prize_service.save_gdpr_consent.assert_not_called()


# ============================================================================
# Property: Main Menu Display on User Not Found
# ============================================================================

@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    username=usernames
)
async def test_property_main_menu_display_on_user_not_found(telegram_id, username):
    """
    Property: Main Menu Display on User Not Found
    
    Validates: Requirements 2.6
    
    Для любого пользователя НЕ в Prize_Table, после отправки сообщения
    об отсутствии в списке победителей, система должна отобразить
    главное меню.
    
    Универсальное свойство: главное меню всегда отображается при
    завершении флоу (успешном или неуспешном).
    """
    # Arrange
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.check_user_exists = AsyncMock(return_value=False)
    
    mock_session_manager = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=mock_prize_service,
        session_manager=mock_session_manager
    )
    
    mock_message = create_mock_message(telegram_id, username)
    mock_state = create_mock_state()
    
    # Act
    await handler.start_prize_flow(mock_message, mock_state, session_id=1)
    
    # Assert
    # Проверяем, что отправлено сообщение
    assert mock_message.answer.called
    
    # Проверяем, что отображено главное меню
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    # Проверяем, что клавиатура содержит кнопку "Получить приз"
    keyboard = call_kwargs['reply_markup']
    button_texts = [btn.text for row in keyboard.inline_keyboard for btn in row]
    assert "🎁 Получить приз" in button_texts
