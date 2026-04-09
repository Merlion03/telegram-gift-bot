"""
Property 1: Сохранение системных команд

Feature: bot-messages-tracking
Validates: Requirements 1.1, 1.2

Property: For any системной команды и любого пользователя, система должна сохранить её
в БД как сообщение типа `from_user` без фильтрации
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
    """
    Генерирует системные команды с опциональными параметрами
    
    Примеры:
    - /start
    - /help
    - /start ref=123
    - /start ref=abc-123_xyz source=telegram
    """
    # Выбираем команду
    command = draw(st.sampled_from(['/start', '/help']))
    
    # С вероятностью 50% добавляем параметры
    add_params = draw(st.booleans())
    
    if add_params:
        # Генерируем 1-3 параметра
        num_params = draw(st.integers(min_value=1, max_value=3))
        params = []
        
        for _ in range(num_params):
            # Генерируем имя параметра
            param_name = draw(st.text(
                alphabet=st.characters(whitelist_categories=("Ll",)),
                min_size=3,
                max_size=10
            ))
            
            # Генерируем значение параметра
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
    """
    Генерирует данные пользователя Telegram
    
    Returns:
        dict с полями: telegram_id, first_name, last_name, username
    """
    telegram_id = draw(st.integers(min_value=1, max_value=999999999))
    
    first_name = draw(st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
        min_size=2,
        max_size=20
    ))
    
    # С вероятностью 70% добавляем фамилию
    has_last_name = draw(st.booleans())
    last_name = None
    if has_last_name:
        last_name = draw(st.text(
            alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
            min_size=2,
            max_size=20
        ))
    
    # С вероятностью 60% добавляем username
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
    """
    Создаёт мок объекта Message с системной командой
    
    Args:
        command_text: Текст команды (например, "/start ref=123")
        user_data: Данные пользователя (telegram_id, first_name, и т.д.)
        
    Returns:
        Мок объекта Message
    """
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
    
    # Создаём мок пользователя
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
# Property 1: Сохранение системных команд
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=system_command_strategy(),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_1_system_commands_saved(command, user_data):
    """
    Feature: bot-messages-tracking, Property 1: Сохранение системных команд
    
    **Validates: Requirements 1.1, 1.2**
    
    Property: For any системной команды и любого пользователя, система должна
    сохранить её в БД как сообщение типа `from_user` без фильтрации
    """
    # Фильтруем невалидные данные
    assume(len(command.strip()) > 0)
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    
    # Arrange: Создаём моки
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, user_data)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act: Вызываем interceptor
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что save_user_message был вызван
    assert mock_session_manager.save_user_message.called, (
        f"save_user_message должен быть вызван для команды '{command}'"
    )
    
    # Assert: Проверяем параметры вызова
    call_args = mock_session_manager.save_user_message.call_args
    assert call_args is not None, "save_user_message должен быть вызван с параметрами"
    
    saved_telegram_id = call_args[1]['telegram_id']
    saved_message_text = call_args[1]['message_text']
    saved_session_id = call_args[1]['session_id']
    
    # Assert: Проверяем, что сохранён правильный telegram_id
    assert saved_telegram_id == user_data['telegram_id'], (
        f"telegram_id должен совпадать. "
        f"Ожидалось: {user_data['telegram_id']}, получено: {saved_telegram_id}"
    )
    
    # Assert: Проверяем, что сохранён полный текст команды
    assert saved_message_text == command, (
        f"Текст команды должен быть сохранён полностью. "
        f"Ожидалось: '{command}', получено: '{saved_message_text}'"
    )
    
    # Assert: Проверяем, что сохранён правильный session_id
    assert saved_session_id == 1, (
        f"session_id должен совпадать с возвращённым из get_or_create_session. "
        f"Ожидалось: 1, получено: {saved_session_id}"
    )
    
    # Assert: Проверяем, что file_id = None (команды не содержат медиа)
    saved_file_id = call_args[1]['file_id']
    assert saved_file_id is None, (
        f"file_id должен быть None для текстовых команд. "
        f"Получено: {saved_file_id}"
    )


# ============================================================================
# Property 1.1: Команды не фильтруются
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_1_1_commands_not_filtered(command, user_data):
    """
    Feature: bot-messages-tracking, Property 1.1: Команды не фильтруются
    
    **Validates: Requirements 1.1, 1.2**
    
    Property: For any системной команды (/start или /help), MessageInterceptor
    НЕ должен фильтровать её и должен сохранить в БД
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
    
    # Assert: Команда НЕ должна быть отфильтрована
    assert mock_session_manager.save_user_message.called, (
        f"Команда '{command}' НЕ должна быть отфильтрована. "
        f"save_user_message должен быть вызван."
    )
    
    # Assert: Проверяем, что сохранён именно текст команды
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    
    assert saved_text == command, (
        f"Текст команды должен быть сохранён без изменений. "
        f"Ожидалось: '{command}', получено: '{saved_text}'"
    )


# ============================================================================
# Property 1.2: Команды с параметрами сохраняются полностью
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
        max_size=3
    ),
    user_data=telegram_user_strategy()
)
@settings(max_examples=100)
async def test_property_1_2_commands_with_params_saved_fully(base_command, params, user_data):
    """
    Feature: bot-messages-tracking, Property 1.2: Команды с параметрами сохраняются полностью
    
    **Validates: Requirements 1.4**
    
    Property: For any системной команды с параметрами, сохранённое сообщение
    должно содержать полный текст команды (включая символ / и все параметры)
    """
    # Фильтруем невалидные данные
    assume(user_data['telegram_id'] > 0)
    assume(len(user_data['first_name'].strip()) > 0)
    assume(len(params) > 0)
    
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
    
    # Assert: Проверяем, что сохранён полный текст команды
    call_args = mock_session_manager.save_user_message.call_args
    saved_text = call_args[1]['message_text']
    
    assert saved_text == command, (
        f"Команда с параметрами должна быть сохранена полностью. "
        f"Ожидалось: '{command}', получено: '{saved_text}'"
    )
    
    # Assert: Проверяем, что все параметры присутствуют в сохранённом тексте
    for param_name, param_value in params:
        if param_name.strip() and param_value.strip():
            param_string = f"{param_name}={param_value}"
            assert param_string in saved_text, (
                f"Параметр '{param_string}' должен присутствовать в сохранённом тексте. "
                f"Сохранённый текст: '{saved_text}'"
            )
