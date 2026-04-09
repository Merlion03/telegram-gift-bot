"""
Property-Based тесты для StateResetService

Feature: admin-reset-user-state-button

Использует hypothesis для генерации большого количества входных данных
и проверки универсальных свойств корректности.

Property 5: FSM сбрасывается перед отправкой команды /start
Property 7: Команда /start сохраняется с типом from_user

Validates: Requirements 3.2, 3.4, 5.2
"""
import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import Mock, AsyncMock, patch

from services.state_reset_service import StateResetService
from aiogram import Bot


# ============================================================================
# Стратегии для генерации данных
# ============================================================================

# Генерация валидных telegram_id (положительные целые числа)
telegram_id_strategy = st.integers(min_value=1, max_value=999999999)

# Генерация валидных session_id (положительные целые числа)
session_id_strategy = st.integers(min_value=1, max_value=1000000)

# Генерация admin_id (строка с префиксом admin:)
admin_id_strategy = st.builds(
    lambda x: f"admin:{x}",
    st.integers(min_value=1, max_value=999999999)
)


# ============================================================================
# Вспомогательная функция для создания StateResetService
# ============================================================================

def create_state_reset_service():
    """Создаёт экземпляр StateResetService с mock зависимостями"""
    mock_bot = Mock(spec=Bot)
    mock_bot.id = 123456789
    mock_bot.session = AsyncMock()
    
    mock_common_handler = Mock()
    mock_common_handler.handle_start = AsyncMock()
    
    mock_session_manager = Mock()
    mock_session_manager.save_user_message = AsyncMock()
    mock_session_manager.save_bot_message = AsyncMock()
    
    mock_storage = Mock()
    mock_storage.key_builder = Mock(return_value="test_key")
    
    service = StateResetService(
        bot=mock_bot,
        common_handler=mock_common_handler,
        session_manager=mock_session_manager,
        storage=mock_storage
    )
    
    return service, mock_session_manager


# ============================================================================
# Property 5: FSM сбрасывается перед отправкой команды /start
# ============================================================================

@given(
    telegram_id=telegram_id_strategy,
    session_id=session_id_strategy,
    admin_id=admin_id_strategy
)
@settings(max_examples=100)
@pytest.mark.asyncio
async def test_property_5_fsm_cleared_before_start(
    telegram_id,
    session_id,
    admin_id
):
    """
    Feature: admin-reset-user-state-button, Property 5: FSM сбрасывается перед отправкой команды /start
    
    Validates: Requirements 3.2, 5.2
    
    Проверяет, что для любых валидных входных данных FSMContext.clear()
    вызывается до CommonHandler.handle_start()
    """
    state_reset_service, _ = create_state_reset_service()
    call_order = []
    
    # Отслеживаем порядок вызовов
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
        
        # Проверяем, что clear был вызван до invoke
        assert 'clear' in call_order
        assert 'invoke' in call_order
        clear_index = call_order.index('clear')
        invoke_index = call_order.index('invoke')
        assert clear_index < invoke_index, \
            f"FSM clear должен быть вызван до handle_start, но порядок: {call_order}"


# ============================================================================
# Property 7: Команда /start сохраняется с типом from_user
# ============================================================================

@given(
    telegram_id=telegram_id_strategy,
    session_id=session_id_strategy
)
@settings(max_examples=100)
@pytest.mark.asyncio
async def test_property_7_start_command_saved_as_from_user(
    telegram_id,
    session_id
):
    """
    Feature: admin-reset-user-state-button, Property 7: Команда /start сохраняется с типом from_user
    
    Validates: Requirements 3.4
    
    Проверяет, что для любых валидных входных данных команда /start
    сохраняется через save_user_message с правильными параметрами
    """
    state_reset_service, mock_session_manager = create_state_reset_service()
    admin_id = "admin:test"
    
    with patch.object(state_reset_service, '_clear_fsm_state', new_callable=AsyncMock), \
         patch.object(state_reset_service, '_invoke_start_handler', new_callable=AsyncMock):
        
        await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Проверяем, что save_user_message был вызван
        mock_session_manager.save_user_message.assert_called_once()
        
        # Проверяем параметры вызова
        call_kwargs = mock_session_manager.save_user_message.call_args.kwargs
        
        assert call_kwargs['session_id'] == session_id, \
            f"session_id должен быть {session_id}, но получен {call_kwargs['session_id']}"
        
        assert call_kwargs['telegram_id'] == telegram_id, \
            f"telegram_id должен быть {telegram_id}, но получен {call_kwargs['telegram_id']}"
        
        assert call_kwargs['message_text'] == '/start', \
            f"message_text должен быть '/start', но получен {call_kwargs['message_text']}"
        
        assert call_kwargs['file_id'] is None, \
            f"file_id должен быть None, но получен {call_kwargs['file_id']}"


# ============================================================================
# Дополнительное свойство: Операция всегда возвращает success=True при отсутствии ошибок
# ============================================================================

@given(
    telegram_id=telegram_id_strategy,
    session_id=session_id_strategy,
    admin_id=admin_id_strategy
)
@settings(max_examples=100)
@pytest.mark.asyncio
async def test_property_reset_always_succeeds_without_errors(
    telegram_id,
    session_id,
    admin_id
):
    """
    Feature: admin-reset-user-state-button
    
    Дополнительное свойство: При отсутствии ошибок операция всегда возвращает success=True
    
    Validates: Requirements 3.1
    """
    state_reset_service, _ = create_state_reset_service()
    
    with patch.object(state_reset_service, '_clear_fsm_state', new_callable=AsyncMock), \
         patch.object(state_reset_service, '_save_start_command', new_callable=AsyncMock), \
         patch.object(state_reset_service, '_invoke_start_handler', new_callable=AsyncMock):
        
        result = await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Проверяем структуру результата
        assert result['success'] is True, \
            f"Операция должна вернуть success=True, но получен {result['success']}"
        
        assert result['telegram_id'] == telegram_id, \
            f"Результат должен содержать telegram_id={telegram_id}, но получен {result['telegram_id']}"
        
        assert result['session_id'] == session_id, \
            f"Результат должен содержать session_id={session_id}, но получен {result['session_id']}"
        
        assert 'message' in result, \
            "Результат должен содержать поле 'message'"


# ============================================================================
# Дополнительное свойство: Все три метода всегда вызываются
# ============================================================================

@given(
    telegram_id=telegram_id_strategy,
    session_id=session_id_strategy,
    admin_id=admin_id_strategy
)
@settings(max_examples=100)
@pytest.mark.asyncio
async def test_property_all_methods_called(
    telegram_id,
    session_id,
    admin_id
):
    """
    Feature: admin-reset-user-state-button
    
    Дополнительное свойство: Все три метода (_clear_fsm_state, _save_start_command, _invoke_start_handler)
    всегда вызываются при успешной операции
    
    Validates: Requirements 3.2, 3.3, 3.4
    """
    state_reset_service, _ = create_state_reset_service()
    mock_clear = AsyncMock()
    mock_save = AsyncMock()
    mock_invoke = AsyncMock()
    
    with patch.object(state_reset_service, '_clear_fsm_state', mock_clear), \
         patch.object(state_reset_service, '_save_start_command', mock_save), \
         patch.object(state_reset_service, '_invoke_start_handler', mock_invoke):
        
        await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
        
        # Проверяем, что все методы были вызваны ровно один раз
        mock_clear.assert_called_once_with(telegram_id)
        mock_save.assert_called_once_with(telegram_id, session_id)
        mock_invoke.assert_called_once_with(telegram_id, session_id)
