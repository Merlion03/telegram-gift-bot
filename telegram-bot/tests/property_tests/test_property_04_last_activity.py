"""
Property 4: Обновление времени активности сессии

Feature: bot-messages-tracking
Validates: Requirements 1.5

Property: For any сохранённой системной команды, поле `last_activity` должно быть обновлено
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager


# ============================================================================
# Стратегии генерации данных
# ============================================================================

@st.composite
def system_command_strategy(draw):
    """Генерирует системные команды"""
    command = draw(st.sampled_from(['/start', '/help']))
    add_params = draw(st.booleans())
    
    if add_params:
        param_value = draw(st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
            min_size=1,
            max_size=20
        ))
        return f"{command} ref={param_value}"
    
    return command


@st.composite
def telegram_user_strategy(draw):
    """Генерирует данные пользователя Telegram"""
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


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(command_text: str, user_data: dict) -> Message:
    """Создаёт мок объекта Message"""
    message = MagicMock(spec=Message)
    message.text = command_text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    
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
# Property 4: Обновление времени активности сессии
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=system_command_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_4_last_activity_updated(command, user_data):
    """
    Feature: bot-messages-tracking, Property 4: Обновление времени активности сессии
    
    **Validates: Requirements 1.5**
    
    Property: For any сохранённой системной команды, get_or_create_session должен быть вызван
    (что обновляет last_activity в БД)
    
    Примечание: last_activity обновляется автоматически в методе get_or_create_session
    или через триггер БД. Здесь проверяем, что метод вызывается.
    """
    # Фильтруем невалидные данные
    assume(len(command.strip()) > 0)
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, user_data)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что get_or_create_session был вызван
    # (это обновляет last_activity в БД)
    assert mock_session_manager.get_or_create_session.called, (
        f"get_or_create_session должен быть вызван для обновления last_activity. "
        f"Команда: '{command}'"
    )
    
    # Assert: Проверяем, что get_or_create_session вызван с правильным telegram_id
    call_args = mock_session_manager.get_or_create_session.call_args
    called_telegram_id = call_args[1]['telegram_id']
    
    assert called_telegram_id == user_data['telegram_id'], (
        f"telegram_id должен совпадать для обновления правильной сессии. "
        f"Ожидалось: {user_data['telegram_id']}, получено: {called_telegram_id}"
    )


# ============================================================================
# Property 4.1: Сессия обновляется перед сохранением сообщения
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=system_command_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_4_1_session_updated_before_message_saved(command, user_data):
    """
    Feature: bot-messages-tracking, Property 4.1: Сессия обновляется перед сохранением сообщения
    
    **Validates: Requirements 1.5**
    
    Property: For any системной команды, get_or_create_session (обновление last_activity)
    должен быть вызван ПЕРЕД save_user_message
    """
    # Фильтруем невалидные данные
    assume(len(command.strip()) > 0)
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange: Отслеживаем порядок вызовов
    call_order = []
    
    async def track_get_or_create_session(*args, **kwargs):
        call_order.append('get_or_create_session')
        return 1
    
    async def track_save_user_message(*args, **kwargs):
        call_order.append('save_user_message')
        return 100
    
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(side_effect=track_get_or_create_session)
    mock_session_manager.save_user_message = AsyncMock(side_effect=track_save_user_message)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, user_data)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем порядок вызовов
    assert len(call_order) >= 1, "Должен быть вызван хотя бы get_or_create_session"
    
    assert call_order[0] == 'get_or_create_session', (
        f"get_or_create_session должен быть вызван первым (для обновления last_activity). "
        f"Порядок вызовов: {call_order}"
    )
    
    if len(call_order) == 2:
        assert call_order[1] == 'save_user_message', (
            f"save_user_message должен быть вызван после get_or_create_session. "
            f"Порядок вызовов: {call_order}"
        )


# ============================================================================
# Property 4.2: Сессия обновляется для всех типов команд
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_4_2_session_updated_for_all_commands(command, user_data):
    """
    Feature: bot-messages-tracking, Property 4.2: Сессия обновляется для всех типов команд
    
    **Validates: Requirements 1.5**
    
    Property: For any типа системной команды (/start или /help), last_activity
    должен быть обновлён через вызов get_or_create_session
    """
    # Фильтруем невалидные данные
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, user_data)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что get_or_create_session был вызван для любой команды
    assert mock_session_manager.get_or_create_session.called, (
        f"get_or_create_session должен быть вызван для команды '{command}' "
        f"для обновления last_activity"
    )
