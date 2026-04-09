"""
Properties 17-18: Обратная совместимость

Feature: bot-messages-tracking
Validates: Requirements 6.1, 6.2

Property 17: For any обычного текстового сообщения, система должна корректно сохранять его
Property 18: For any медиа-сообщения, система должна корректно сохранять его с `file_id`
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, PhotoSize

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager


@st.composite
def regular_text_message_strategy(draw):
    """Генерирует обычные текстовые сообщения (не команды)"""
    # Обычный текст без символа /
    return draw(st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs", "Po")),
        min_size=5,
        max_size=200
    ).filter(lambda t: not t.strip().startswith('/')))


@st.composite
def telegram_user_strategy(draw):
    """Генерирует данные пользователя"""
    return {
        'telegram_id': draw(st.integers(min_value=1, max_value=999999999)),
        'first_name': draw(st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
            min_size=2,
            max_size=20
        )),
        'last_name': None,
        'username': None
    }


def create_mock_message(text: str, user_data: dict, file_id: str = None) -> Message:
    """Создаёт мок объекта Message"""
    message = MagicMock(spec=Message)
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    
    # Если есть file_id, создаём медиа-сообщение
    if file_id:
        photo = MagicMock(spec=PhotoSize)
        photo.file_id = file_id
        message.photo = [photo]
        message.text = None
        message.caption = text if text else None
    
    user = MagicMock(spec=User)
    user.id = user_data['telegram_id']
    user.first_name = user_data['first_name']
    user.last_name = user_data['last_name']
    user.username = user_data['username']
    
    message.from_user = user
    return message


def create_mock_state():
    """Создаёт мок FSMContext"""
    state = MagicMock()
    state.get_state = AsyncMock(return_value=None)
    return state


# ============================================================================
# Property 17: Обратная совместимость текстовых сообщений
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=regular_text_message_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_17_backward_compatibility_text_messages(message_text, user_data):
    """
    Feature: bot-messages-tracking, Property 17: Обратная совместимость текстовых сообщений
    
    **Validates: Requirements 6.1**
    
    Property: For any обычного текстового сообщения (не команды), после изменений
    в MessageInterceptor, система должна продолжать корректно сохранять его в БД
    """
    assume(len(message_text.strip()) > 0)
    assume(not message_text.strip().startswith('/'))
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(message_text, user_data)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что обычное сообщение сохраняется
    assert mock_session_manager.save_user_message.called, (
        f"Обычное текстовое сообщение должно быть сохранено. "
        f"Текст: '{message_text}'"
    )
    
    # Assert: Проверяем параметры сохранения
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    saved_telegram_id = call_args[1]['telegram_id']
    
    assert saved_text == message_text, (
        f"Текст должен быть сохранён без изменений. "
        f"Ожидалось: '{message_text}', получено: '{saved_text}'"
    )
    
    assert saved_telegram_id == user_data['telegram_id'], (
        f"telegram_id должен совпадать. "
        f"Ожидалось: {user_data['telegram_id']}, получено: {saved_telegram_id}"
    )


# ============================================================================
# Property 18: Обратная совместимость медиа-сообщений
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    caption=st.one_of(
        st.none(),
        st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
            min_size=0,
            max_size=100
        )
    ),
    file_id=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd"), whitelist_characters="-_"),
        min_size=10,
        max_size=50
    ),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_18_backward_compatibility_media_messages(caption, file_id, user_data):
    """
    Feature: bot-messages-tracking, Property 18: Обратная совместимость медиа-сообщений
    
    **Validates: Requirements 6.2**
    
    Property: For any медиа-сообщения, после изменений в MessageInterceptor,
    система должна продолжать корректно сохранять его с file_id
    
    Примечание: Медиа-сообщения НЕ сохраняются в MessageInterceptor (has_media=True),
    они обрабатываются в MediaHandler. Здесь проверяем, что они пропускаются.
    """
    assume(len(file_id.strip()) > 0)
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(caption, user_data, file_id=file_id)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что сессия создана
    assert mock_session_manager.get_or_create_session.called, (
        "Сессия должна быть создана для медиа-сообщения"
    )
    
    # Assert: Проверяем, что медиа-сообщение НЕ сохраняется в interceptor
    # (оно будет сохранено в MediaHandler)
    assert not mock_session_manager.save_user_message.called, (
        "Медиа-сообщение НЕ должно быть сохранено в MessageInterceptor. "
        "Оно обрабатывается в MediaHandler."
    )
    
    # Assert: Проверяем, что handler был вызван (обработка продолжается)
    assert mock_handler.called, (
        "Handler должен быть вызван для дальнейшей обработки медиа-сообщения"
    )
