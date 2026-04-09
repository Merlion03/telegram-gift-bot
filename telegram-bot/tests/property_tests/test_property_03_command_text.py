"""
Property 3: Полнота текста системной команды

Feature: bot-messages-tracking
Validates: Requirements 1.4

Property: For any системной команды с параметрами, сохранённое сообщение должно содержать
полный текст команды
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
def command_with_params_strategy(draw):
    """
    Генерирует системные команды с обязательными параметрами
    
    Примеры:
    - /start ref=123
    - /help topic=prizes
    - /start ref=abc-123_xyz source=telegram campaign=promo
    """
    command = draw(st.sampled_from(['/start', '/help']))
    
    # Генерируем 1-5 параметров
    num_params = draw(st.integers(min_value=1, max_value=5))
    params = []
    
    for _ in range(num_params):
        param_name = draw(st.text(
            alphabet=st.characters(whitelist_categories=("Ll",)),
            min_size=3,
            max_size=15
        ))
        
        param_value = draw(st.text(
            alphabet=st.characters(
                whitelist_categories=("Lu", "Ll", "Nd"),
                whitelist_characters="-_"
            ),
            min_size=1,
            max_size=30
        ))
        
        if param_name.strip() and param_value.strip():
            params.append(f"{param_name}={param_value}")
    
    assume(len(params) > 0)
    return f"{command} {' '.join(params)}"


@st.composite
def telegram_user_strategy(draw):
    """Генерирует данные пользователя Telegram"""
    telegram_id = draw(st.integers(min_value=1, max_value=999999999))
    first_name = draw(st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=2,
        max_size=20
    ))
    
    return {
        'telegram_id': telegram_id,
        'first_name': first_name,
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
# Property 3: Полнота текста системной команды
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=command_with_params_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_3_command_text_completeness(command, user_data):
    """
    Feature: bot-messages-tracking, Property 3: Полнота текста системной команды
    
    **Validates: Requirements 1.4**
    
    Property: For any системной команды с параметрами, сохранённое сообщение
    должно содержать полный текст команды (включая символ / и все параметры)
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
    
    # Assert: Проверяем, что save_user_message был вызван
    assert mock_session_manager.save_user_message.called
    
    # Assert: Проверяем, что сохранён полный текст команды
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    
    assert saved_text == command, (
        f"Сохранённый текст должен полностью совпадать с исходной командой. "
        f"Ожидалось: '{command}', получено: '{saved_text}'"
    )
    
    # Assert: Проверяем, что текст начинается с /
    assert saved_text.startswith('/'), (
        f"Сохранённый текст должен начинаться с символа /. "
        f"Получено: '{saved_text}'"
    )


# ============================================================================
# Property 3.1: Параметры команды сохраняются без потерь
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    base_command=st.sampled_from(['/start', '/help']),
    params=st.lists(
        st.tuples(
            st.text(alphabet=st.characters(whitelist_categories=("Ll",)), min_size=3, max_size=10),
            st.text(alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd"), whitelist_characters="-_"), min_size=1, max_size=20)
        ),
        min_size=1,
        max_size=5
    ),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_3_1_command_params_preserved(base_command, params, user_data):
    """
    Feature: bot-messages-tracking, Property 3.1: Параметры команды сохраняются без потерь
    
    **Validates: Requirements 1.4**
    
    Property: For any системной команды с N параметрами, все N параметров
    должны присутствовать в сохранённом тексте
    """
    # Фильтруем невалидные данные
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Формируем команду с параметрами
    param_strings = [f"{name}={value}" for name, value in params if name.strip() and value.strip()]
    assume(len(param_strings) > 0)
    
    command = f"{base_command} {' '.join(param_strings)}"
    
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
    
    # Assert: Проверяем, что все параметры присутствуют в сохранённом тексте
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    
    for param_name, param_value in params:
        if param_name.strip() and param_value.strip():
            param_string = f"{param_name}={param_value}"
            assert param_string in saved_text, (
                f"Параметр '{param_string}' должен присутствовать в сохранённом тексте. "
                f"Сохранённый текст: '{saved_text}'"
            )


# ============================================================================
# Property 3.2: Специальные символы в параметрах сохраняются
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    base_command=st.sampled_from(['/start', '/help']),
    param_value=st.text(
        alphabet=st.characters(
            whitelist_categories=("Lu", "Ll", "Nd"),
            whitelist_characters="-_."
        ),
        min_size=1,
        max_size=30
    ),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_3_2_special_chars_in_params_preserved(base_command, param_value, user_data):
    """
    Feature: bot-messages-tracking, Property 3.2: Специальные символы в параметрах сохраняются
    
    **Validates: Requirements 1.4**
    
    Property: For any системной команды с параметрами, содержащими специальные символы
    (-, _, .), эти символы должны быть сохранены без изменений
    """
    # Фильтруем невалидные данные
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    assume(len(param_value.strip()) > 0)
    
    command = f"{base_command} ref={param_value}"
    
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
    
    # Assert: Проверяем, что параметр с специальными символами сохранён
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    
    assert f"ref={param_value}" in saved_text, (
        f"Параметр 'ref={param_value}' должен быть сохранён со всеми специальными символами. "
        f"Сохранённый текст: '{saved_text}'"
    )


# ============================================================================
# Property 3.3: Длинные команды сохраняются полностью
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    base_command=st.sampled_from(['/start', '/help']),
    long_param_value=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
        min_size=50,
        max_size=200
    ),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_3_3_long_commands_preserved(base_command, long_param_value, user_data):
    """
    Feature: bot-messages-tracking, Property 3.3: Длинные команды сохраняются полностью
    
    **Validates: Requirements 1.4**
    
    Property: For any системной команды с длинными параметрами (50-200 символов),
    полный текст команды должен быть сохранён без обрезания
    """
    # Фильтруем невалидные данные
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    assume(len(long_param_value.strip()) >= 50)
    
    command = f"{base_command} data={long_param_value}"
    
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
    
    # Assert: Проверяем, что длинная команда сохранена полностью
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    
    assert saved_text == command, (
        f"Длинная команда должна быть сохранена полностью без обрезания. "
        f"Длина исходной команды: {len(command)}, длина сохранённой: {len(saved_text)}"
    )
    
    # Assert: Проверяем, что длинный параметр присутствует полностью
    assert long_param_value in saved_text, (
        f"Длинный параметр должен присутствовать в сохранённом тексте полностью. "
        f"Длина параметра: {len(long_param_value)}"
    )
