"""
Unit тесты для StateResetService

Validates: Requirements 3.2, 3.3, 3.4, 5.2, 5.3, 5.4

Тесты проверяют:
- Сброс FSM состояния (FSMContext.clear() вызывается)
- Вызов обработчика /start с корректными параметрами
- Сохранение команды /start с типом from_user
- Обработку ошибок FSM, handler invocation, database
- Логирование операций
"""
import pytest
import pytest_asyncio
from unittest.mock import Mock, AsyncMock, patch, call, MagicMock
from datetime import datetime, timezone

from services.state_reset_service import StateResetService
from aiogram import Bot
from aiogram.fsm.context import FSMContext
from aiogram.types import Message, User, Chat


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_bot():
    """Создаёт mock Bot"""
    bot = Mock(spec=Bot)
    bot.id = 123456789
    bot.session = AsyncMock()
    return bot


@pytest.fixture
def mock_common_handler():
    """Создаёт mock CommonHandler"""
    handler = Mock()
    handler.handle_start = AsyncMock()
    return handler


@pytest.fixture
def mock_session_manager():
    """Создаёт mock SessionManager"""
    manager = Mock()
    manager.save_user_message = AsyncMock()
    manager.save_bot_message = AsyncMock()
    return manager


@pytest.fixture
def mock_storage():
    """Создаёт mock FSM storage"""
    storage = Mock()
    storage.key_builder = Mock(return_value="test_key")
    return storage


@pytest.fixture
def mock_fsm_context():
    """Создаёт mock FSMContext"""
    context = Mock(spec=FSMContext)
    context.clear = AsyncMock()
    context.get_state = AsyncMock(return_value=None)
    context.get_data = AsyncMock(return_value={})
    return context


@pytest.fixture
def state_reset_service(mock_bot, mock_common_handler, mock_session_manager, mock_storage):
    """Создаёт экземпляр StateResetService с mock зависимостями"""
    return StateResetService(
        bot=mock_bot,
        common_handler=mock_common_handler,
        session_manager=mock_session_manager,
        storage=mock_storage
    )


# ============================================================================
# Тесты успешного сброса состояния
# ============================================================================

@pytest.mark.asyncio
async def test_reset_user_state_success(
    state_reset_service,
    mock_common_handler,
    mock_session_manager
):
    """
    Тест успешного сброса состояния пользователя
    
    Validates: Requirements 3.1, 3.2, 3.3, 3.4
    """
    telegram_id = 123456
    session_id = 1
    admin_id = "admin:789"
    
    with patch.object(state_reset_service, '_clear_fsm_state', new_callable=AsyncMock) as mock_clear, \
         patch.object(state_reset_service, '_save_start_command', new_callable=AsyncMock) as mock_save, \
         patch.object(state_reset_service, '_invoke_start_handler', new_callable=AsyncMock) as mock_invoke:
        
        result = await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Проверяем, что все методы были вызваны
        mock_clear.assert_called_once_with(telegram_id)
        mock_save.assert_called_once_with(telegram_id, session_id)
        mock_invoke.assert_called_once_with(telegram_id, session_id)
        
        # Проверяем результат
        assert result['success'] is True
        assert result['telegram_id'] == telegram_id
        assert result['session_id'] == session_id


@pytest.mark.asyncio
async def test_clear_fsm_state_calls_clear(state_reset_service, mock_fsm_context):
    """
    Тест сброса FSM состояния - FSMContext.clear() вызывается
    
    Validates: Requirements 3.2, 5.2
    """
    telegram_id = 123456
    
    with patch('services.state_reset_service.FSMContext', return_value=mock_fsm_context):
        await state_reset_service._clear_fsm_state(telegram_id)
        
        # Проверяем, что FSMContext.clear() был вызван
        mock_fsm_context.clear.assert_called_once()


@pytest.mark.asyncio
async def test_save_start_command_with_correct_parameters(
    state_reset_service,
    mock_session_manager
):
    """
    Тест сохранения команды /start с корректными параметрами
    
    Validates: Requirements 3.4
    """
    telegram_id = 123456
    session_id = 1
    
    await state_reset_service._save_start_command(telegram_id, session_id)
    
    # Проверяем, что save_user_message был вызван с правильными параметрами
    mock_session_manager.save_user_message.assert_called_once_with(
        session_id=session_id,
        telegram_id=telegram_id,
        message_text="/start",
        file_id=None
    )


@pytest.mark.asyncio
async def test_invoke_start_handler_with_correct_parameters(
    state_reset_service,
    mock_common_handler
):
    """
    Тест вызова обработчика /start с корректными параметрами
    
    Validates: Requirements 3.3, 5.4
    """
    telegram_id = 123456
    session_id = 1
    
    await state_reset_service._invoke_start_handler(telegram_id, session_id)
    
    # Проверяем, что handle_start был вызван
    mock_common_handler.handle_start.assert_called_once()
    
    # Проверяем параметры вызова
    call_args = mock_common_handler.handle_start.call_args
    message_arg = call_args[0][0]
    session_id_arg = call_args[0][1]
    
    assert isinstance(message_arg, Message)
    assert message_arg.from_user.id == telegram_id
    assert message_arg.text == "/start"
    assert session_id_arg == session_id


@pytest.mark.asyncio
async def test_operations_order_clear_before_invoke(state_reset_service):
    """
    Тест порядка операций: FSM сбрасывается перед вызовом обработчика
    
    Validates: Requirements 3.2, 5.2
    """
    telegram_id = 123456
    session_id = 1
    admin_id = "admin:789"
    
    call_order = []
    
    async def mock_clear(*args, **kwargs):
        call_order.append('clear')
    
    async def mock_save(*args, **kwargs):
        call_order.append('save')
    
    async def mock_invoke(*args, **kwargs):
        call_order.append('invoke')
    
    with patch.object(state_reset_service, '_clear_fsm_state', side_effect=mock_clear), \
         patch.object(state_reset_service, '_save_start_command', side_effect=mock_save), \
         patch.object(state_reset_service, '_invoke_start_handler', side_effect=mock_invoke):
        
        await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Проверяем порядок: clear → save → invoke
        assert call_order == ['clear', 'save', 'invoke']


# ============================================================================
# Тесты обработки ошибок
# ============================================================================

@pytest.mark.asyncio
async def test_reset_user_state_invalid_telegram_id(state_reset_service):
    """
    Тест валидации telegram_id
    
    Validates: Requirements 8.4
    """
    with pytest.raises(ValueError, match="telegram_id must be a valid integer"):
        await state_reset_service.reset_user_state(
            telegram_id=None,
            session_id=1,
            admin_id="admin:789"
        )


@pytest.mark.asyncio
async def test_reset_user_state_invalid_session_id(state_reset_service):
    """
    Тест валидации session_id
    
    Validates: Requirements 8.4
    """
    with pytest.raises(ValueError, match="session_id must be a valid integer"):
        await state_reset_service.reset_user_state(
            telegram_id=123456,
            session_id=None,
            admin_id="admin:789"
        )


@pytest.mark.asyncio
async def test_clear_fsm_state_error_handling(state_reset_service, mock_fsm_context):
    """
    Тест обработки ошибок при сбросе FSM
    
    Validates: Requirements 8.4, 8.5
    """
    telegram_id = 123456
    
    # Настраиваем mock для выброса ошибки
    mock_fsm_context.clear.side_effect = Exception("FSM error")
    
    with patch('services.state_reset_service.FSMContext', return_value=mock_fsm_context):
        with pytest.raises(RuntimeError, match="Failed to clear FSM state"):
            await state_reset_service._clear_fsm_state(telegram_id)


@pytest.mark.asyncio
async def test_invoke_start_handler_error_handling(
    state_reset_service,
    mock_common_handler
):
    """
    Тест обработки ошибок при вызове обработчика
    
    Validates: Requirements 8.4, 8.5
    """
    telegram_id = 123456
    session_id = 1
    
    # Настраиваем mock для выброса ошибки
    mock_common_handler.handle_start.side_effect = Exception("Handler error")
    
    with pytest.raises(RuntimeError, match="Failed to invoke start handler"):
        await state_reset_service._invoke_start_handler(telegram_id, session_id)


@pytest.mark.asyncio
async def test_save_start_command_error_does_not_stop_operation(
    state_reset_service,
    mock_session_manager
):
    """
    Тест graceful degradation: ошибка сохранения команды не прерывает операцию
    
    Validates: Requirements 8.4
    """
    telegram_id = 123456
    session_id = 1
    
    # Настраиваем mock для выброса ошибки
    mock_session_manager.save_user_message.side_effect = Exception("Database error")
    
    # Операция не должна выбросить исключение
    await state_reset_service._save_start_command(telegram_id, session_id)


@pytest.mark.asyncio
async def test_reset_user_state_propagates_critical_errors(state_reset_service):
    """
    Тест распространения критических ошибок
    
    Validates: Requirements 8.4, 8.5
    """
    telegram_id = 123456
    session_id = 1
    admin_id = "admin:789"
    
    with patch.object(
        state_reset_service,
        '_clear_fsm_state',
        side_effect=Exception("Critical FSM error")
    ):
        with pytest.raises(RuntimeError, match="Failed to reset user state"):
            await state_reset_service.reset_user_state(
                telegram_id=telegram_id,
                session_id=session_id,
                admin_id=admin_id
            )


# ============================================================================
# Тесты логирования
# ============================================================================

@pytest.mark.asyncio
async def test_log_reset_operation_success(state_reset_service):
    """
    Тест логирования успешной операции
    
    Validates: Requirements 9.1, 9.2, 9.3
    """
    telegram_id = 123456
    session_id = 1
    admin_id = "admin:789"
    
    with patch('services.state_reset_service.logger') as mock_logger:
        state_reset_service._log_reset_operation(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id,
            success=True
        )
        
        # Проверяем, что info был вызван
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        # Проверяем параметры лога
        assert call_args[0][0] == "state_reset_completed"
        assert call_args[1]['telegram_id'] == telegram_id
        assert call_args[1]['session_id'] == session_id
        assert call_args[1]['admin_id'] == admin_id
        assert call_args[1]['success'] is True


@pytest.mark.asyncio
async def test_log_reset_operation_failure(state_reset_service):
    """
    Тест логирования неудачной операции
    
    Validates: Requirements 9.1, 9.2, 9.3
    """
    telegram_id = 123456
    session_id = 1
    admin_id = "admin:789"
    error_message = "Test error"
    
    with patch('services.state_reset_service.logger') as mock_logger:
        state_reset_service._log_reset_operation(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id,
            success=False,
            error=error_message
        )
        
        # Проверяем, что error был вызван
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        
        # Проверяем параметры лога
        assert call_args[0][0] == "state_reset_failed"
        assert call_args[1]['telegram_id'] == telegram_id
        assert call_args[1]['session_id'] == session_id
        assert call_args[1]['admin_id'] == admin_id
        assert call_args[1]['success'] is False
        assert call_args[1]['error'] == error_message


@pytest.mark.asyncio
async def test_reset_user_state_logs_all_operations(state_reset_service):
    """
    Тест логирования всех этапов операции
    
    Validates: Requirements 9.1, 9.2, 9.3
    """
    telegram_id = 123456
    session_id = 1
    admin_id = "admin:789"
    
    with patch('services.state_reset_service.logger') as mock_logger, \
         patch.object(state_reset_service, '_clear_fsm_state', new_callable=AsyncMock), \
         patch.object(state_reset_service, '_save_start_command', new_callable=AsyncMock), \
         patch.object(state_reset_service, '_invoke_start_handler', new_callable=AsyncMock):
        
        await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Проверяем, что логирование было выполнено
        # Должны быть вызовы: state_reset_started, state_reset_completed
        log_calls = [call[0][0] for call in mock_logger.info.call_args_list]
        assert "state_reset_started" in log_calls
        assert "state_reset_completed" in log_calls


# ============================================================================
# Тесты создания фейкового Message объекта
# ============================================================================

def test_create_fake_message(state_reset_service, mock_bot):
    """
    Тест создания фейкового Message объекта
    
    Validates: Requirements 3.3
    """
    telegram_id = 123456
    
    fake_message = state_reset_service._create_fake_message(telegram_id)
    
    # Проверяем структуру Message
    assert isinstance(fake_message, Message)
    assert fake_message.from_user.id == telegram_id
    assert fake_message.from_user.is_bot is False
    assert fake_message.chat.id == telegram_id
    assert fake_message.chat.type == "private"
    assert fake_message.text == "/start"
    # Примечание: bot не сохраняется в Message после создания (особенность aiogram),
    # но передаётся в конструктор для корректной работы
