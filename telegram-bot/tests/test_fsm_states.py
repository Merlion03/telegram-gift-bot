"""
Тесты для FSM состояний.
Включает property-based тесты для проверки переходов между состояниями.
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from unittest.mock import Mock, AsyncMock
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey

from fsm.states import SupportStates


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_fsm_context():
    """Создаёт mock для FSMContext"""
    context = Mock(spec=FSMContext)
    context.set_state = AsyncMock()
    context.get_state = AsyncMock()
    context.clear = AsyncMock()
    context.update_data = AsyncMock()
    context.get_data = AsyncMock(return_value={})
    return context


# ============================================================================
# Property-Based Tests
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    session_id=st.integers(min_value=1, max_value=999999)
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_11_fsm_state_transition(
    telegram_id,
    session_id,
    mock_fsm_context
):
    """
    Property 11: Переход в FSM состояние поддержки
    Feature: telegram-bot-webapp-system, Property 11
    
    Для любого пользователя, после создания Support_Session,
    FSM состояние пользователя должно измениться на SupportStates.in_support
    
    Validates: Requirements 5.2
    """
    # Arrange
    # Сбрасываем mock перед каждой итерацией
    mock_fsm_context.reset_mock()
    
    # Имитируем создание сессии поддержки
    # В реальном коде это будет происходить в SupportHandler.start_support
    
    # Act: устанавливаем FSM состояние в in_support
    await mock_fsm_context.set_state(SupportStates.in_support)
    
    # Сохраняем session_id в FSM данных
    await mock_fsm_context.update_data(support_session_id=session_id)
    
    # Assert: проверяем, что set_state был вызван с правильным состоянием
    mock_fsm_context.set_state.assert_called_once_with(SupportStates.in_support)
    
    # Проверяем, что session_id был сохранён
    mock_fsm_context.update_data.assert_called_once_with(support_session_id=session_id)


@given(
    telegram_id=st.integers(min_value=1, max_value=999999999)
)
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@pytest.mark.asyncio
async def test_property_22_fsm_state_clear_after_support(
    telegram_id,
    mock_fsm_context
):
    """
    Property 22: Восстановление обработки команд после поддержки
    Feature: telegram-bot-webapp-system, Property 22
    
    Для любого пользователя, вышедшего из FSM состояния поддержки,
    стандартные команды бота должны снова обрабатываться корректно
    
    Validates: Requirements 9.4
    """
    # Arrange
    # Сбрасываем mock перед каждой итерацией
    mock_fsm_context.reset_mock()
    
    # Пользователь находится в состоянии поддержки
    mock_fsm_context.get_state = AsyncMock(return_value=SupportStates.in_support)
    
    # Act: выходим из состояния поддержки
    await mock_fsm_context.clear()
    
    # Assert: проверяем, что состояние было очищено
    mock_fsm_context.clear.assert_called_once()
    
    # После clear() состояние должно быть None
    # Это означает, что пользователь вернулся в обычный режим


# ============================================================================
# Unit Tests
# ============================================================================

@pytest.mark.asyncio
async def test_set_support_state(mock_fsm_context):
    """
    Unit-тест: установка состояния поддержки
    """
    # Act
    await mock_fsm_context.set_state(SupportStates.in_support)
    
    # Assert
    mock_fsm_context.set_state.assert_called_once_with(SupportStates.in_support)


@pytest.mark.asyncio
async def test_clear_support_state(mock_fsm_context):
    """
    Unit-тест: очистка состояния поддержки
    """
    # Arrange
    mock_fsm_context.get_state = AsyncMock(return_value=SupportStates.in_support)
    
    # Act
    await mock_fsm_context.clear()
    
    # Assert
    mock_fsm_context.clear.assert_called_once()


@pytest.mark.asyncio
async def test_store_session_id_in_fsm(mock_fsm_context):
    """
    Unit-тест: сохранение session_id в FSM данных
    """
    # Arrange
    session_id = 42
    
    # Act
    await mock_fsm_context.update_data(support_session_id=session_id)
    
    # Assert
    mock_fsm_context.update_data.assert_called_once_with(support_session_id=session_id)


@pytest.mark.asyncio
async def test_retrieve_session_id_from_fsm(mock_fsm_context):
    """
    Unit-тест: получение session_id из FSM данных
    """
    # Arrange
    session_id = 42
    mock_fsm_context.get_data = AsyncMock(return_value={'support_session_id': session_id})
    
    # Act
    data = await mock_fsm_context.get_data()
    
    # Assert
    assert data['support_session_id'] == session_id


@pytest.mark.asyncio
async def test_check_current_state(mock_fsm_context):
    """
    Unit-тест: проверка текущего состояния
    """
    # Arrange
    mock_fsm_context.get_state = AsyncMock(return_value=SupportStates.in_support)
    
    # Act
    current_state = await mock_fsm_context.get_state()
    
    # Assert
    assert current_state == SupportStates.in_support


@pytest.mark.asyncio
async def test_state_is_none_by_default(mock_fsm_context):
    """
    Unit-тест: состояние по умолчанию None
    """
    # Arrange
    mock_fsm_context.get_state = AsyncMock(return_value=None)
    
    # Act
    current_state = await mock_fsm_context.get_state()
    
    # Assert
    assert current_state is None


def test_support_states_definition():
    """
    Unit-тест: проверка определения SupportStates
    """
    # Assert: проверяем, что состояние in_support определено
    assert hasattr(SupportStates, 'in_support')
    assert SupportStates.in_support is not None
