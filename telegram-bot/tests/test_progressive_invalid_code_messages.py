"""
Тест прогрессивных сообщений при неправильном вводе кодового слова.

Проверяет, что при каждой неправильной попытке ввода кодового слова
отправляется разное сообщение:
- 1-я попытка: INVALID_CODE_WORD_ATTEMPT_1
- 2-я попытка: INVALID_CODE_WORD_ATTEMPT_2
- 3-я и далее: INVALID_CODE_WORD_ATTEMPT_3_PLUS (с кнопкой "Нужна помощь")
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User, Chat
from aiogram.fsm.context import FSMContext

from handlers.prize_flow_handler import PrizeFlowHandler
from constants.messages import (
    INVALID_CODE_WORD_ATTEMPT_1,
    INVALID_CODE_WORD_ATTEMPT_2,
    INVALID_CODE_WORD_ATTEMPT_3_PLUS
)


@pytest.mark.asyncio
async def test_progressive_invalid_code_messages():
    """
    Тест: Проверка прогрессивных сообщений при неправильном вводе кодового слова.
    
    Сценарий:
    1. Пользователь вводит неправильное кодовое слово 1-й раз → получает ATTEMPT_1
    2. Пользователь вводит неправильное кодовое слово 2-й раз → получает ATTEMPT_2
    3. Пользователь вводит неправильное кодовое слово 3-й раз → получает ATTEMPT_3_PLUS с кнопкой
    4. Пользователь вводит неправильное кодовое слово 4-й раз → получает ATTEMPT_3_PLUS (то же сообщение)
    """
    # Arrange: Создаём моки
    prize_service_mock = AsyncMock()
    prize_service_mock.validate_code_word = AsyncMock(return_value=False)  # Всегда неверное слово
    
    session_manager_mock = AsyncMock()
    session_manager_mock.save_bot_message = AsyncMock()
    
    notification_service_mock = AsyncMock()
    
    handler = PrizeFlowHandler(
        prize_service=prize_service_mock,
        session_manager=session_manager_mock,
        notification_service=notification_service_mock,
        webapp_url="https://example.com"
    )
    
    # Создаём мок FSM state
    state_mock = AsyncMock(spec=FSMContext)
    state_data = {}
    
    async def get_data_side_effect():
        return state_data.copy()
    
    async def update_data_side_effect(**kwargs):
        state_data.update(kwargs)
    
    state_mock.get_data = AsyncMock(side_effect=get_data_side_effect)
    state_mock.update_data = AsyncMock(side_effect=update_data_side_effect)
    
    # Создаём мок сообщения
    user_mock = MagicMock(spec=User)
    user_mock.id = 123456789
    user_mock.username = "testuser"
    
    chat_mock = MagicMock(spec=Chat)
    chat_mock.id = 123456789
    
    bot_mock = AsyncMock()
    bot_mock.edit_message_reply_markup = AsyncMock()
    
    # Мок для отправленного сообщения
    sent_message_mock = MagicMock()
    sent_message_mock.message_id = 999
    
    # Список для отслеживания отправленных сообщений
    sent_messages = []
    
    async def answer_side_effect(text, **kwargs):
        sent_messages.append({
            'text': text,
            'reply_markup': kwargs.get('reply_markup')
        })
        return sent_message_mock
    
    # Act & Assert: Попытка 1
    message_mock = MagicMock(spec=Message)
    message_mock.from_user = user_mock
    message_mock.chat = chat_mock
    message_mock.text = "wrong_code_1"
    message_mock.bot = bot_mock
    message_mock.answer = AsyncMock(side_effect=answer_side_effect)
    
    await handler.handle_code_word_input(message_mock, state_mock, session_id=1)
    
    assert len(sent_messages) == 1
    assert sent_messages[0]['text'] == INVALID_CODE_WORD_ATTEMPT_1
    assert state_data['invalid_code_attempts'] == 1
    # Кнопка "Нужна помощь" не должна отображаться
    keyboard = sent_messages[0]['reply_markup']
    assert keyboard is not None
    # Проверяем, что кнопка "Нужна помощь" отсутствует (только "Назад")
    assert len(keyboard.inline_keyboard) == 1  # Только одна строка с кнопкой "Назад"
    
    # Act & Assert: Попытка 2
    message_mock.text = "wrong_code_2"
    await handler.handle_code_word_input(message_mock, state_mock, session_id=1)
    
    assert len(sent_messages) == 2
    assert sent_messages[1]['text'] == INVALID_CODE_WORD_ATTEMPT_2
    assert state_data['invalid_code_attempts'] == 2
    # Кнопка "Нужна помощь" не должна отображаться
    keyboard = sent_messages[1]['reply_markup']
    assert keyboard is not None
    assert len(keyboard.inline_keyboard) == 1  # Только одна строка с кнопкой "Назад"
    
    # Act & Assert: Попытка 3
    message_mock.text = "wrong_code_3"
    await handler.handle_code_word_input(message_mock, state_mock, session_id=1)
    
    assert len(sent_messages) == 3
    assert sent_messages[2]['text'] == INVALID_CODE_WORD_ATTEMPT_3_PLUS
    assert state_data['invalid_code_attempts'] == 3
    # Кнопка "Нужна помощь" ДОЛЖНА отображаться
    keyboard = sent_messages[2]['reply_markup']
    assert keyboard is not None
    assert len(keyboard.inline_keyboard) == 2  # Две строки: "Назад" и "Нужна помощь"
    
    # Act & Assert: Попытка 4 (должно быть то же сообщение, что и на 3-й)
    message_mock.text = "wrong_code_4"
    await handler.handle_code_word_input(message_mock, state_mock, session_id=1)
    
    assert len(sent_messages) == 4
    assert sent_messages[3]['text'] == INVALID_CODE_WORD_ATTEMPT_3_PLUS
    assert state_data['invalid_code_attempts'] == 4
    # Кнопка "Нужна помощь" ДОЛЖНА отображаться
    keyboard = sent_messages[3]['reply_markup']
    assert keyboard is not None
    assert len(keyboard.inline_keyboard) == 2  # Две строки: "Назад" и "Нужна помощь"
    
    print("✅ Тест пройден: прогрессивные сообщения работают корректно")
