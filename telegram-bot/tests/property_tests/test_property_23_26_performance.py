"""
Properties 23-26: Производительность и масштабируемость

Feature: bot-messages-tracking
Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5

Property 23: For any системной команды, операция сохранения должна выполняться за время не более 100ms
Property 24: For any ответа бота, операция сохранения должна выполняться за время не более 100ms
Property 25: For any ошибки при сохранении, система должна залогировать ошибку и продолжить обработку
Property 26: For any набора команд, обрабатываемых одновременно, система должна сохранить все сообщения
"""
import pytest
import asyncio
import time
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager
from database.repository import SupportRepository
from database.models import SupportSession


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(text: str, telegram_id: int) -> Message:
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
    
    user = MagicMock(spec=User)
    user.id = telegram_id
    user.first_name = "Test"
    user.last_name = None
    user.username = None
    
    message.from_user = user
    return message


def create_mock_state():
    """Создаёт мок FSMContext"""
    state = MagicMock()
    state.get_state = AsyncMock(return_value=None)
    return state


# ============================================================================
# Property 23: Производительность сохранения команд
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    telegram_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=50)  # Меньше примеров для производительности
async def test_property_23_performance_save_commands(command, telegram_id):
    """
    Feature: bot-messages-tracking, Property 23: Производительность сохранения команд
    
    **Validates: Requirements 7.1**
    
    Property: For any системной команды, MessageInterceptor должен выполнить
    операцию сохранения за время не более 100ms
    """
    assume(telegram_id > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, telegram_id)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act: Измеряем время выполнения
    start_time = time.perf_counter()
    await interceptor(mock_handler, mock_message, data)
    end_time = time.perf_counter()
    
    execution_time_ms = (end_time - start_time) * 1000
    
    # Assert: Проверяем, что время выполнения < 100ms
    assert execution_time_ms < 100, (
        f"Операция сохранения команды должна выполняться за время < 100ms. "
        f"Фактическое время: {execution_time_ms:.2f}ms"
    )


# ============================================================================
# Property 24: Производительность сохранения ответов бота
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
        min_size=5,
        max_size=200
    ),
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=50)
async def test_property_24_performance_save_bot_messages(message_text, session_id):
    """
    Feature: bot-messages-tracking, Property 24: Производительность сохранения ответов бота
    
    **Validates: Requirements 7.2**
    
    Property: For any ответа бота, SessionManager должен выполнить операцию
    сохранения за время не более 100ms
    """
    assume(len(message_text.strip()) > 0)
    assume(session_id > 0)
    
    # Arrange
    mock_repository = MagicMock(spec=SupportRepository)
    mock_repository.save_message = AsyncMock(return_value=100)
    
    mock_session = MagicMock(spec=SupportSession)
    mock_session.id = session_id
    mock_repository.get_session_by_id = AsyncMock(return_value=mock_session)
    
    session_manager = SessionManager(repository=mock_repository)
    
    # Act: Измеряем время выполнения
    start_time = time.perf_counter()
    await session_manager.save_bot_message(
        session_id=session_id,
        message_text=message_text
    )
    end_time = time.perf_counter()
    
    execution_time_ms = (end_time - start_time) * 1000
    
    # Assert: Проверяем, что время выполнения < 100ms
    assert execution_time_ms < 100, (
        f"Операция сохранения ответа бота должна выполняться за время < 100ms. "
        f"Фактическое время: {execution_time_ms:.2f}ms"
    )


# ============================================================================
# Property 25: Обработка ошибок без блокировки
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    telegram_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_25_error_handling_no_blocking(command, telegram_id):
    """
    Feature: bot-messages-tracking, Property 25: Обработка ошибок без блокировки
    
    **Validates: Requirements 7.3, 7.4**
    
    Property: For any ошибки при сохранении, MessageInterceptor должен залогировать
    ошибку и продолжить обработку (вызвать handler)
    """
    assume(telegram_id > 0)
    
    # Arrange: Симулируем ошибку при сохранении
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(side_effect=Exception("DB error"))
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    mock_message = create_mock_message(command, telegram_id)
    mock_handler = AsyncMock()
    mock_state = create_mock_state()
    data = {'state': mock_state}
    
    # Act: Вызываем interceptor (не должно выбросить исключение)
    await interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем, что handler был вызван несмотря на ошибку
    assert mock_handler.called, (
        "Handler должен быть вызван даже при ошибке сохранения сообщения"
    )
    
    # Assert: Проверяем, что обработка не была заблокирована
    assert mock_handler.call_count == 1, (
        "Handler должен быть вызван ровно один раз"
    )


# ============================================================================
# Property 26: Сохранение при параллельной обработке
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    num_commands=st.integers(min_value=5, max_value=20)
)
@settings(max_examples=20)
async def test_property_26_parallel_processing(num_commands):
    """
    Feature: bot-messages-tracking, Property 26: Сохранение при параллельной обработке
    
    **Validates: Requirements 7.5**
    
    Property: For any набора команд, обрабатываемых одновременно, система должна
    сохранить все сообщения без потерь
    """
    assume(num_commands >= 5)
    
    # Arrange
    save_calls = []
    
    async def track_save_user_message(*args, **kwargs):
        save_calls.append(kwargs)
        return len(save_calls)
    
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(side_effect=track_save_user_message)
    
    interceptor = MessageInterceptor(session_manager=mock_session_manager)
    
    # Создаём несколько команд для параллельной обработки
    tasks = []
    for i in range(num_commands):
        command = '/start' if i % 2 == 0 else '/help'
        telegram_id = 1000 + i
        
        mock_message = create_mock_message(command, telegram_id)
        mock_handler = AsyncMock()
        mock_state = create_mock_state()
        data = {'state': mock_state}
        
        task = interceptor(mock_handler, mock_message, data)
        tasks.append(task)
    
    # Act: Выполняем все команды параллельно
    await asyncio.gather(*tasks)
    
    # Assert: Проверяем, что все сообщения были сохранены
    assert len(save_calls) == num_commands, (
        f"Все {num_commands} сообщений должны быть сохранены при параллельной обработке. "
        f"Сохранено: {len(save_calls)}"
    )
    
    # Assert: Проверяем, что все telegram_id уникальны (нет потерь)
    saved_telegram_ids = [call['telegram_id'] for call in save_calls]
    assert len(set(saved_telegram_ids)) == num_commands, (
        f"Все telegram_id должны быть уникальны (нет дубликатов или потерь). "
        f"Ожидалось: {num_commands}, получено: {len(set(saved_telegram_ids))}"
    )
