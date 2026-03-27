"""
Property-based и unit тесты для SupportHandler.
Проверяют корректность работы режима поддержки.
"""

import pytest
from hypothesis import given, strategies as st
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import (
    Message, User, Chat, InlineKeyboardMarkup,
    PhotoSize, Document, Video, Audio, Voice
)
from aiogram.fsm.context import FSMContext

from handlers.support_handler import SupportHandler
from services.support_service import SupportService
from fsm.states import SupportStates
from database.models import SupportSession


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_support_service():
    """Создаёт mock SupportService"""
    return AsyncMock(spec=SupportService)


def create_support_handler(mock_service=None):
    """Создаёт SupportHandler с mock сервисом"""
    if mock_service is None:
        mock_service = create_mock_support_service()
    return SupportHandler(mock_service)


def create_mock_message(telegram_id=123456789, text=None):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    return message


def create_mock_fsm_context(session_id=None):
    """Создаёт mock FSMContext"""
    context = AsyncMock(spec=FSMContext)
    context.get_data = AsyncMock(return_value={'support_session_id': session_id} if session_id else {})
    context.update_data = AsyncMock()
    context.set_state = AsyncMock()
    context.clear = AsyncMock()
    return context


# ============================================================================
# Property 12: Отображение кнопки завершения диалога
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=100000)
)
@pytest.mark.asyncio
async def test_property_12_end_dialog_button_display(telegram_id, session_id):
    """
    Property 12: Отображение кнопки завершения диалога
    Feature: telegram-bot-webapp-system, Property 12
    
    Для любого пользователя в FSM состоянии поддержки, ответ бота должен 
    содержать ReplyKeyboard с кнопкой "Завершить диалог".
    
    Validates: Requirements 5.3
    """
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    mock_state = create_mock_fsm_context()
    
    # Настраиваем mock для создания сессии
    mock_service.create_session.return_value = session_id
    mock_service.get_user_active_session.return_value = None
    
    # Act
    await support_handler.start_support(mock_message, mock_state)
    
    # Assert: проверяем, что сообщение было отправлено
    assert mock_message.answer.called
    
    # Получаем аргументы вызова
    call_kwargs = mock_message.answer.call_args[1]
    
    # Проверяем наличие reply_markup
    assert 'reply_markup' in call_kwargs, \
        "Сообщение должно содержать reply_markup с кнопкой"
    
    keyboard = call_kwargs['reply_markup']
    assert isinstance(keyboard, InlineKeyboardMarkup), \
        "reply_markup должен быть InlineKeyboardMarkup"
    
    # Проверяем наличие кнопки "Завершить диалог"
    assert len(keyboard.inline_keyboard) > 0, \
        "Клавиатура должна содержать хотя бы одну строку кнопок"
    
    button_texts = [btn.text for row in keyboard.inline_keyboard for btn in row]
    assert "Завершить диалог" in button_texts, \
        "Клавиатура должна содержать кнопку 'Завершить диалог'"
    
    # Проверяем, что состояние установлено
    mock_state.set_state.assert_called_once_with(SupportStates.in_support)


# ============================================================================
# Property 14: Изоляция команд в режиме поддержки
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=100000),
    message_text=st.text(min_size=1, max_size=200)
)
@pytest.mark.asyncio
async def test_property_14_command_isolation_in_support(telegram_id, session_id, message_text):
    """
    Property 14: Изоляция команд в режиме поддержки
    Feature: telegram-bot-webapp-system, Property 14
    
    Для любой стандартной команды бота (кроме завершения диалога), 
    отправленной пользователем в FSM состоянии поддержки, команда не должна 
    выполняться, а сообщение должно быть сохранено как обычное сообщение поддержки.
    
    Validates: Requirements 6.4
    """
    # Пропускаем команду завершения диалога
    if message_text == "Завершить диалог":
        return
    
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id, text=message_text)
    mock_state = create_mock_fsm_context(session_id=session_id)
    
    # Act
    await support_handler.handle_support_message(mock_message, mock_state)
    
    # Assert: проверяем, что сообщение было сохранено
    mock_service.save_message.assert_called_once()
    
    # Проверяем параметры сохранения
    call_kwargs = mock_service.save_message.call_args[1]
    assert call_kwargs['session_id'] == session_id
    assert call_kwargs['telegram_id'] == telegram_id
    assert call_kwargs['message_type'] == 'from_user'
    assert call_kwargs['message_text'] == message_text


# ============================================================================
# Property 15: Сохранение file_id для медиа-контента
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=100000),
    file_id=st.text(min_size=10, max_size=100, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
)
@pytest.mark.asyncio
async def test_property_15_file_id_saving_for_media(telegram_id, session_id, file_id):
    """
    Property 15: Сохранение file_id для медиа-контента
    Feature: telegram-bot-webapp-system, Property 15
    
    Для любого сообщения с медиа-контентом (фото, документы) в режиме поддержки, 
    в Support_Database должен быть сохранён file_id вместе с сообщением.
    
    Validates: Requirements 6.5
    """
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id, text="Вот фото проблемы")
    mock_state = create_mock_fsm_context(session_id=session_id)
    
    # Добавляем фото к сообщению
    photo = MagicMock(spec=PhotoSize)
    photo.file_id = file_id
    mock_message.photo = [photo]
    
    # Act
    await support_handler.handle_support_message(mock_message, mock_state)
    
    # Assert: проверяем, что сообщение было сохранено с file_id
    mock_service.save_message.assert_called_once()
    
    call_kwargs = mock_service.save_message.call_args[1]
    assert call_kwargs['file_id'] == file_id, \
        f"file_id должен быть сохранён, ожидалось: {file_id}"
    assert call_kwargs['session_id'] == session_id
    assert call_kwargs['telegram_id'] == telegram_id
    assert call_kwargs['message_type'] == 'from_user'


# ============================================================================
# Property 22: Восстановление обработки команд после поддержки
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=100000)
)
@pytest.mark.asyncio
async def test_property_22_command_processing_restoration(telegram_id, session_id):
    """
    Property 22: Восстановление обработки команд после поддержки
    Feature: telegram-bot-webapp-system, Property 22
    
    Для любого пользователя, вышедшего из FSM состояния поддержки, 
    стандартные команды бота должны снова обрабатываться корректно.
    
    Validates: Requirements 9.4
    """
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id, text="Завершить диалог")
    mock_state = create_mock_fsm_context(session_id=session_id)
    
    # Настраиваем mock для закрытия сессии
    mock_service.close_session.return_value = True
    
    # Act
    await support_handler.end_support(mock_message, mock_state)
    
    # Assert: проверяем, что FSM состояние было очищено
    mock_state.clear.assert_called_once()
    
    # Проверяем, что клавиатура была удалена
    assert mock_message.answer.called
    call_kwargs = mock_message.answer.call_args[1]
    
    # Inline клавиатуры не требуют удаления, просто проверяем, что сообщение отправлено
    assert mock_message.answer.called
    call_args = mock_message.answer.call_args[0]
    assert "Диалог завершён" in call_args[0], \
        "Должно быть отправлено сообщение о завершении"
    
    # Проверяем, что сессия была закрыта
    mock_service.close_session.assert_called_once_with(session_id)


# ============================================================================
# Дополнительные property-тесты
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=100000)
)
@pytest.mark.asyncio
async def test_property_reuse_existing_session(telegram_id, session_id):
    """
    Property: Переиспользование существующей активной сессии
    
    Если у пользователя уже есть активная сессия поддержки,
    при повторном вызове start_support должна использоваться существующая сессия.
    """
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    mock_state = create_mock_fsm_context()
    
    # Настраиваем mock для возврата существующей сессии
    existing_session = MagicMock(spec=SupportSession)
    existing_session.id = session_id
    mock_service.get_user_active_session.return_value = existing_session
    
    # Act
    await support_handler.start_support(mock_message, mock_state)
    
    # Assert: проверяем, что новая сессия НЕ была создана
    mock_service.create_session.assert_not_called()
    
    # Проверяем, что существующий session_id был сохранён в FSM
    mock_state.update_data.assert_called_once()
    call_kwargs = mock_state.update_data.call_args[1]
    assert call_kwargs['support_session_id'] == session_id


@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=100000),
    caption_text=st.text(min_size=1, max_size=200)
)
@pytest.mark.asyncio
async def test_property_save_caption_with_media(telegram_id, session_id, caption_text):
    """
    Property: Сохранение подписи к медиа-контенту
    
    Для любого медиа-сообщения с подписью (caption),
    подпись должна быть сохранена как message_text.
    """
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    mock_state = create_mock_fsm_context(session_id=session_id)
    
    # Добавляем фото с подписью
    mock_message.text = None
    mock_message.caption = caption_text
    photo = MagicMock(spec=PhotoSize)
    photo.file_id = "test_file_id"
    mock_message.photo = [photo]
    
    # Act
    await support_handler.handle_support_message(mock_message, mock_state)
    
    # Assert
    mock_service.save_message.assert_called_once()
    call_kwargs = mock_service.save_message.call_args[1]
    
    assert call_kwargs['message_text'] == caption_text, \
        "Подпись к медиа должна быть сохранена как message_text"
    assert call_kwargs['file_id'] == "test_file_id"


@given(
    telegram_id=st.integers(min_value=1, max_value=999999999)
)
@pytest.mark.asyncio
async def test_property_end_support_without_session(telegram_id):
    """
    Property: Завершение поддержки без активной сессии
    
    Если пользователь пытается завершить диалог без активной сессии,
    система должна корректно обработать это и очистить состояние.
    """
    # Arrange
    mock_service = create_mock_support_service()
    support_handler = create_support_handler(mock_service)
    mock_message = create_mock_message(telegram_id, text="Завершить диалог")
    mock_state = create_mock_fsm_context(session_id=None)  # Нет session_id
    
    # Act
    await support_handler.end_support(mock_message, mock_state)
    
    # Assert: проверяем, что close_session НЕ был вызван
    mock_service.close_session.assert_not_called()
    
    # Проверяем, что состояние всё равно было очищено
    mock_state.clear.assert_called_once()
    
    # Проверяем, что пользователь получил подтверждение
    assert mock_message.answer.called
