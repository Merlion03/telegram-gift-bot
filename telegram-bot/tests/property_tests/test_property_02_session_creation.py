"""
Property 2: Создание сессии при системной команде

Feature: bot-messages-tracking
Validates: Requirements 1.3

Property: For any системной команды, система должна создать или получить активную сессию
для пользователя
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager


# ============================================================================
# Стратегии генерации данных (переиспользуем из test_property_01)
# ============================================================================

@st.composite
def system_command_strategy(draw):
    """Генерирует системные команды с опциональными параметрами"""
    command = draw(st.sampled_from(['/start', '/help']))
    add_params = draw(st.booleans())
    
    if add_params:
        num_params = draw(st.integers(min_value=1, max_value=3))
        params = []
        
        for _ in range(num_params):
            param_name = draw(st.text(
                alphabet=st.characters(whitelist_categories=("Ll",)),
                min_size=3,
                max_size=10
            ))
            param_value = draw(st.text(
                alphabet=st.characters(
                    whitelist_categories=("Lu", "Ll", "Nd"),
                    whitelist_characters="-_"
                ),
                min_size=1,
                max_size=20
            ))
            params.append(f"{param_name}={param_value}")
        
        return f"{command} {' '.join(params)}"
    
    return command


@st.composite
def telegram_user_strategy(draw):
    """Генерирует данные пользователя Telegram"""
    telegram_id = draw(st.integers(min_value=1, max_value=999999999))
    
    first_name = draw(st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=2,
        max_size=20
    ))
    
    has_last_name = draw(st.booleans())
    last_name = None
    if has_last_name:
        last_name = draw(st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
            min_size=2,
            max_size=20
        ))
    
    has_username = draw(st.booleans())
    username = None
    if has_username:
        username = draw(st.text(
            alphabet=st.characters(
                whitelist_categories=("Ll", "Nd"),
                whitelist_characters="_"
            ),
            min_size=5,
            max_size=32
        ))
    
    return {
        'telegram_id': telegram_id,
        'first_name': first_name,
        'last_name': last_name,
        'username': username
    }


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(command_text: str, user_data: dict) -> Message:
    """Создаёт мок объекта Message с системной командой"""
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
# Property 2: Создание сессии при системной команде
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=system_command_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_2_session_created_for_command(command, user_data):
    """
    Feature: bot-messages-tracking, Property 2: Создание сессии при системной команде
    
    **Validates: Requirements 1.3**
    
    Property: For any системной команды, система должна создать или получить
    активную сессию для пользователя
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
    assert mock_session_manager.get_or_create_session.called, (
        f"get_or_create_session должен быть вызван для команды '{command}'"
    )
    
    # Assert: Проверяем параметры вызова
    call_args = mock_session_manager.get_or_create_session.call_args
    assert call_args is not None, "get_or_create_session должен быть вызван с параметрами"
    
    called_telegram_id = call_args[1]['telegram_id']
    called_session_type = call_args[1]['session_type']
    called_first_name = call_args[1]['first_name']
    called_last_name = call_args[1]['last_name']
    called_username = call_args[1]['username']
    
    # Assert: Проверяем, что передан правильный telegram_id
    assert called_telegram_id == user_data['telegram_id'], (
        f"telegram_id должен совпадать. "
        f"Ожидалось: {user_data['telegram_id']}, получено: {called_telegram_id}"
    )
    
    # Assert: Проверяем, что session_type = 'chat'
    assert called_session_type == 'chat', (
        f"session_type должен быть 'chat'. "
        f"Получено: '{called_session_type}'"
    )
    
    # Assert: Проверяем, что переданы данные пользователя
    assert called_first_name == user_data['first_name'], (
        f"first_name должен совпадать. "
        f"Ожидалось: '{user_data['first_name']}', получено: '{called_first_name}'"
    )
    
    assert called_last_name == user_data['last_name'], (
        f"last_name должен совпадать. "
        f"Ожидалось: '{user_data['last_name']}', получено: '{called_last_name}'"
    )
    
    assert called_username == user_data['username'], (
        f"username должен совпадать. "
        f"Ожидалось: '{user_data['username']}', получено: '{called_username}'"
    )


# ============================================================================
# Property 2.1: session_id добавляется в контекст
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=system_command_strategy(),
    user_data=telegram_user_strategy(),
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_2_1_session_id_added_to_context(command, user_data, session_id):
    """
    Feature: bot-messages-tracking, Property 2.1: session_id добавляется в контекст
    
    **Validates: Requirements 1.3**
    
    Property: For any системной команды, после создания/получения сессии,
    session_id должен быть добавлен в data для использования в handlers
    """
    # Фильтруем невалидные данные
    assume(len(command.strip()) > 0)
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    assume(session_id > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=session_id)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, user_data)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что session_id добавлен в data
    assert 'session_id' in data, (
        "session_id должен быть добавлен в data"
    )
    
    assert data['session_id'] == session_id, (
        f"session_id в data должен совпадать с возвращённым из get_or_create_session. "
        f"Ожидалось: {session_id}, получено: {data['session_id']}"
    )


# ============================================================================
# Property 2.2: Сессия создаётся перед сохранением сообщения
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=system_command_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_2_2_session_created_before_message_saved(command, user_data):
    """
    Feature: bot-messages-tracking, Property 2.2: Сессия создаётся перед сохранением сообщения
    
    **Validates: Requirements 1.3**
    
    Property: For any системной команды, get_or_create_session должен быть вызван
    ПЕРЕД save_user_message (правильный порядок операций)
    """
    # Фильтруем невалидные данные
    assume(len(command.strip()) > 0)
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange
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
    assert len(call_order) == 2, (
        f"Должно быть 2 вызова. Получено: {len(call_order)}"
    )
    
    assert call_order[0] == 'get_or_create_session', (
        f"Первым должен быть вызван get_or_create_session. "
        f"Порядок вызовов: {call_order}"
    )
    
    assert call_order[1] == 'save_user_message', (
        f"Вторым должен быть вызван save_user_message. "
        f"Порядок вызовов: {call_order}"
    )


# ============================================================================
# Property 2.3: Сессия создаётся для всех типов команд
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_2_3_session_created_for_all_command_types(command, user_data):
    """
    Feature: bot-messages-tracking, Property 2.3: Сессия создаётся для всех типов команд
    
    **Validates: Requirements 1.3**
    
    Property: For any типа системной команды (/start или /help), система должна
    создать или получить активную сессию
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
        f"get_or_create_session должен быть вызван для команды '{command}'"
    )
    
    # Assert: Проверяем, что session_type всегда 'chat'
    call_args = mock_session_manager.get_or_create_session.call_args
    session_type = call_args[1]['session_type']
    
    assert session_type == 'chat', (
        f"session_type должен быть 'chat' для команды '{command}'. "
        f"Получено: '{session_type}'"
    )
