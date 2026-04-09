"""
Properties 27-30: Логирование и отладка

Feature: bot-messages-tracking
Validates: Requirements 8.1, 8.2, 8.3, 8.4

Property 27: For any системной команды, система должна залогировать событие с уровнем `debug`
Property 28: For any ответа бота, система должна залогировать событие с уровнем `debug`
Property 29: For any ошибки при сохранении, система должна залогировать ошибку с полным stack trace
Property 30: For any операции с сессией, система должна залогировать событие

Примечание: Эти тесты проверяют, что логирование вызывается. Детальная проверка логов
требует интеграции с structlog.testing.CapturingLogger и выходит за рамки property-based тестов.
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, MagicMock, patch
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
# Property 27: Логирование сохранения команд
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    telegram_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_27_logging_save_commands(command, telegram_id):
    """
    Feature: bot-messages-tracking, Property 27: Логирование сохранения команд
    
    **Validates: Requirements 8.1**
    
    Property: For any системной команды, MessageInterceptor должен залогировать
    событие с уровнем `debug`, включая telegram_id, session_id, command_text
    
    Примечание: Проверяем, что логирование происходит (через mock logger)
    """
    assume(telegram_id > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    with patch('middleware.message_interceptor.logger') as mock_logger:
        interceptor = MessageInterceptor(session_manager=mock_session_manager)
        
        mock_message = create_mock_message(command, telegram_id)
        mock_handler = AsyncMock()
        mock_state = create_mock_state()
        data = {'state': mock_state}
        
        # Act
        await interceptor(mock_handler, mock_message, data)
        
        # Assert: Проверяем, что logger.debug был вызван
        assert mock_logger.debug.called, (
            f"logger.debug должен быть вызван для команды '{command}'"
        )
        
        # Assert: Проверяем, что логируется событие сохранения сообщения
        debug_calls = [call for call in mock_logger.debug.call_args_list]
        
        # Ищем вызов с событием "user_message_intercepted_and_saved"
        save_event_found = any(
            'user_message_intercepted_and_saved' in str(call)
            for call in debug_calls
        )
        
        assert save_event_found, (
            f"Должно быть залогировано событие 'user_message_intercepted_and_saved'. "
            f"Вызовы logger.debug: {debug_calls}"
        )


# ============================================================================
# Property 28: Логирование сохранения ответов бота
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    message_text=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Zs")),
        min_size=5,
        max_size=100
    ),
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_28_logging_save_bot_messages(message_text, session_id):
    """
    Feature: bot-messages-tracking, Property 28: Логирование сохранения ответов бота
    
    **Validates: Requirements 8.2**
    
    Property: For any ответа бота, SessionManager должен залогировать событие
    с уровнем `debug`, включая session_id, message_id
    
    Примечание: Проверяем, что логирование происходит (через mock logger)
    """
    assume(len(message_text.strip()) > 0)
    assume(session_id > 0)
    
    # Arrange
    mock_repository = MagicMock(spec=SupportRepository)
    mock_repository.save_message = AsyncMock(return_value=100)
    
    mock_session = MagicMock(spec=SupportSession)
    mock_session.id = session_id
    mock_repository.get_session_by_id = AsyncMock(return_value=mock_session)
    
    with patch('services.session_manager.logger') as mock_logger:
        session_manager = SessionManager(repository=mock_repository)
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert: Проверяем, что logger.debug был вызван
        assert mock_logger.debug.called, (
            "logger.debug должен быть вызван для ответа бота"
        )


# ============================================================================
# Property 29: Логирование ошибок с stack trace
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    telegram_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_29_logging_errors_with_stack_trace(command, telegram_id):
    """
    Feature: bot-messages-tracking, Property 29: Логирование ошибок с stack trace
    
    **Validates: Requirements 8.3**
    
    Property: For any ошибки при сохранении, MessageInterceptor должен залогировать
    ошибку с уровнем `error`, включая полный stack trace (exc_info=True)
    """
    assume(telegram_id > 0)
    
    # Arrange: Симулируем ошибку при сохранении
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(side_effect=Exception("DB error"))
    
    with patch('middleware.message_interceptor.logger') as mock_logger:
        interceptor = MessageInterceptor(session_manager=mock_session_manager)
        
        mock_message = create_mock_message(command, telegram_id)
        mock_handler = AsyncMock()
        mock_state = create_mock_state()
        data = {'state': mock_state}
        
        # Act
        await interceptor(mock_handler, mock_message, data)
        
        # Assert: Проверяем, что logger.error был вызван
        assert mock_logger.error.called, (
            "logger.error должен быть вызван при ошибке сохранения"
        )
        
        # Assert: Проверяем, что логируется событие ошибки
        error_calls = [call for call in mock_logger.error.call_args_list]
        
        # Ищем вызов с событием "failed_to_save_user_message"
        error_event_found = any(
            'failed_to_save_user_message' in str(call)
            for call in error_calls
        )
        
        assert error_event_found, (
            f"Должно быть залогировано событие 'failed_to_save_user_message'. "
            f"Вызовы logger.error: {error_calls}"
        )
        
        # Assert: Проверяем, что передан exc_info=True (для stack trace)
        # Ищем вызов с exc_info=True в kwargs
        exc_info_found = any(
            call.kwargs.get('exc_info') is True
            for call in mock_logger.error.call_args_list
        )
        
        assert exc_info_found, (
            "logger.error должен быть вызван с exc_info=True для stack trace"
        )


# ============================================================================
# Property 30: Логирование операций с сессиями
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    command=st.sampled_from(['/start', '/help']),
    telegram_id=st.integers(min_value=1, max_value=999999)
)
@settings(max_examples=100)
async def test_property_30_logging_session_operations(command, telegram_id):
    """
    Feature: bot-messages-tracking, Property 30: Логирование операций с сессиями
    
    **Validates: Requirements 8.4**
    
    Property: For any операции с сессией (создание, обновление), система должна
    залогировать событие
    
    Примечание: Проверяем, что логирование происходит при работе с сессиями
    """
    assume(telegram_id > 0)
    
    # Arrange
    mock_session_manager = MagicMock(spec=SessionManager)
    mock_session_manager.get_or_create_session = AsyncMock(return_value=1)
    mock_session_manager.save_user_message = AsyncMock(return_value=100)
    
    with patch('middleware.message_interceptor.logger') as mock_logger:
        interceptor = MessageInterceptor(session_manager=mock_session_manager)
        
        mock_message = create_mock_message(command, telegram_id)
        mock_handler = AsyncMock()
        mock_state = create_mock_state()
        data = {'state': mock_state}
        
        # Act
        await interceptor(mock_handler, mock_message, data)
        
        # Assert: Проверяем, что get_or_create_session был вызван (операция с сессией)
        assert mock_session_manager.get_or_create_session.called, (
            "get_or_create_session должен быть вызван (операция с сессией)"
        )
        
        # Assert: Проверяем, что logger.debug был вызван (логирование операции)
        assert mock_logger.debug.called, (
            "logger.debug должен быть вызван для логирования операции с сессией"
        )
