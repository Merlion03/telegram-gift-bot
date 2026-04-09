"""
Preservation Property Tests - Help Needed Reset on Main Menu

**ВАЖНО**: Эти тесты проверяют сохранение существующего поведения для не-bug случаев.
Следуем методологии observation-first: наблюдаем поведение на НЕИСПРАВЛЕННОМ коде,
затем фиксируем его в property-based тестах.

**ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: Тесты ПРОХОДЯТ
Это подтверждает baseline поведение, которое должно сохраниться после исправления.

**ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: Тесты ПРОХОДЯТ
Это подтверждает отсутствие регрессий.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase, HealthCheck
from sqlalchemy import delete, select
from unittest.mock import Mock, AsyncMock, patch
from aiogram import Bot
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey

from database.models.support import SupportSession, SupportMessage
from database.repository import SupportRepository
from services.session_manager import SessionManager
from services.state_reset_service import StateResetService
from handlers.common_handler import CommonHandler


@pytest_asyncio.fixture
async def support_repository(test_db_session):
    """
    Создаёт экземпляр SupportRepository для тестов
    """
    return SupportRepository(session=test_db_session)


@pytest_asyncio.fixture
async def session_manager(support_repository):
    """
    Создаёт экземпляр SessionManager для тестов
    """
    return SessionManager(repository=support_repository)


@pytest_asyncio.fixture
async def mock_bot():
    """
    Создаёт mock объект Bot для тестов
    """
    bot = Mock(spec=Bot)
    bot.id = 123456789
    bot.send_message = AsyncMock()
    return bot


@pytest_asyncio.fixture
async def mock_common_handler():
    """
    Создаёт mock объект CommonHandler для тестов
    """
    handler = Mock(spec=CommonHandler)
    handler.handle_start = AsyncMock()
    return handler


@pytest_asyncio.fixture
async def memory_storage():
    """
    Создаёт MemoryStorage для тестов FSM
    """
    return MemoryStorage()


@pytest_asyncio.fixture
async def state_reset_service(mock_bot, mock_common_handler, session_manager, memory_storage):
    """
    Создаёт экземпляр StateResetService для тестов
    """
    return StateResetService(
        bot=mock_bot,
        common_handler=mock_common_handler,
        session_manager=session_manager,
        storage=memory_storage
    )


# ============================================================================
# Property 1: Preservation - FSM состояние очищается через FSMContext.clear()
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    admin_id=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
        min_size=5,
        max_size=20
    )
)
@settings(
    max_examples=15,  # Preservation тесты
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_fsm_state_cleared(
    telegram_id: int,
    admin_id: str,
    state_reset_service: StateResetService,
    session_manager: SessionManager,
    memory_storage: MemoryStorage,
    test_db_session
):
    """
    **Validates: Requirement 3.2**
    
    Property: FSM состояние очищается через FSMContext.clear() для всех пользователей
    
    **Observation**: reset_user_state() вызывает FSMContext.clear() для очистки FSM состояния
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    Это baseline поведение, которое должно сохраниться после исправления
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(admin_id.strip()) > 0)
    
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём активную сессию с help_needed=False (не-bug случай)
    session = SupportSession(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        session_type="chat",
        status="active",
        help_needed=False,  # Не-bug случай: help_needed=False
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    session_id = session.id
    
    # Устанавливаем FSM состояние для пользователя
    storage_key = StorageKey(
        bot_id=state_reset_service.bot.id,
        user_id=telegram_id,
        chat_id=telegram_id
    )
    fsm_context = FSMContext(storage=memory_storage, key=storage_key)
    await fsm_context.set_state("some_state")
    await fsm_context.set_data({"key": "value"})
    
    # Проверяем предусловие: FSM состояние установлено
    state_before = await fsm_context.get_state()
    data_before = await fsm_context.get_data()
    assert state_before == "some_state", f"Предусловие: FSM состояние должно быть установлено"
    assert data_before == {"key": "value"}, f"Предусловие: FSM данные должны быть установлены"
    
    # Act: Вызываем reset_user_state
    result = await state_reset_service.reset_user_state(
        telegram_id=telegram_id,
        session_id=session_id,
        admin_id=admin_id
    )
    
    # Assert: FSM состояние должно быть очищено
    state_after = await fsm_context.get_state()
    data_after = await fsm_context.get_data()
    
    assert state_after is None, (
        f"После вызова reset_user_state() FSM состояние должно быть очищено (None). "
        f"Получено: {state_after}. "
        f"Это baseline поведение для очистки FSM состояния (Requirement 3.2)."
    )
    
    assert data_after == {}, (
        f"После вызова reset_user_state() FSM данные должны быть очищены (пустой dict). "
        f"Получено: {data_after}. "
        f"Это baseline поведение для очистки FSM данных (Requirement 3.2)."
    )
    
    # Дополнительная проверка: операция должна быть успешной
    assert result["success"] is True, f"Операция reset_user_state() должна завершиться успешно"


# ============================================================================
# Property 2: Preservation - Команда /start сохраняется в историю сообщений
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    admin_id=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
        min_size=5,
        max_size=20
    )
)
@settings(
    max_examples=15,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_start_command_saved(
    telegram_id: int,
    admin_id: str,
    state_reset_service: StateResetService,
    session_manager: SessionManager,
    test_db_session
):
    """
    **Validates: Requirement 3.3**
    
    Property: Команда /start сохраняется в историю сообщений с типом from_user
    
    **Observation**: reset_user_state() вызывает save_user_message() для сохранения команды /start
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(admin_id.strip()) > 0)
    
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём активную сессию с help_needed=False (не-bug случай)
    session = SupportSession(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        session_type="chat",
        status="active",
        help_needed=False,
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    session_id = session.id
    
    # Act: Вызываем reset_user_state
    result = await state_reset_service.reset_user_state(
        telegram_id=telegram_id,
        session_id=session_id,
        admin_id=admin_id
    )
    
    # Assert: Команда /start должна быть сохранена в БД
    query = select(SupportMessage).where(
        SupportMessage.session_id == session_id,
        SupportMessage.message_text == "/start",
        SupportMessage.message_type == "from_user"
    )
    result_query = await test_db_session.execute(query)
    start_messages = result_query.scalars().all()
    
    assert len(start_messages) > 0, (
        f"После вызова reset_user_state() команда /start должна быть сохранена в БД. "
        f"session_id={session_id}, telegram_id={telegram_id}. "
        f"Найдено сообщений: {len(start_messages)}. "
        f"Это baseline поведение для сохранения команды /start (Requirement 3.3)."
    )
    
    # Проверяем, что сообщение имеет правильный тип
    start_message = start_messages[0]
    assert start_message.message_type == "from_user", (
        f"Сообщение /start должно иметь тип 'from_user'. "
        f"Получено: {start_message.message_type}"
    )
    
    assert start_message.telegram_id == telegram_id, (
        f"Сообщение /start должно принадлежать пользователю {telegram_id}. "
        f"Получено: {start_message.telegram_id}"
    )


# ============================================================================
# Property 3: Preservation - Обработчик CommonHandler.handle_start() вызывается
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    admin_id=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
        min_size=5,
        max_size=20
    )
)
@settings(
    max_examples=15,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_start_handler_invoked(
    telegram_id: int,
    admin_id: str,
    session_manager: SessionManager,
    memory_storage: MemoryStorage,
    test_db_session
):
    """
    **Validates: Requirement 3.4**
    
    Property: Обработчик CommonHandler.handle_start() вызывается программно
    
    **Observation**: reset_user_state() вызывает handle_start() для отправки главного меню
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(admin_id.strip()) > 0)
    
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём активную сессию с help_needed=False (не-bug случай)
    session = SupportSession(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        session_type="chat",
        status="active",
        help_needed=False,
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    session_id = session.id
    
    # Создаём свежие mock объекты для каждого теста
    mock_bot = Mock(spec=Bot)
    mock_bot.id = 123456789
    mock_bot.send_message = AsyncMock()
    
    mock_common_handler = Mock(spec=CommonHandler)
    mock_common_handler.handle_start = AsyncMock()
    
    # Создаём StateResetService с mock обработчиком
    state_reset_service = StateResetService(
        bot=mock_bot,
        common_handler=mock_common_handler,
        session_manager=session_manager,
        storage=memory_storage
    )
    
    # Act: Вызываем reset_user_state
    result = await state_reset_service.reset_user_state(
        telegram_id=telegram_id,
        session_id=session_id,
        admin_id=admin_id
    )
    
    # Assert: handle_start должен быть вызван
    mock_common_handler.handle_start.assert_called_once()
    
    # Проверяем параметры вызова
    call_args = mock_common_handler.handle_start.call_args
    message_arg = call_args[0][0]
    session_id_arg = call_args[0][1]
    
    assert message_arg.from_user.id == telegram_id, (
        f"handle_start должен быть вызван с Message для пользователя {telegram_id}. "
        f"Получено: {message_arg.from_user.id}. "
        f"Это baseline поведение для вызова обработчика /start (Requirement 3.4)."
    )
    
    assert message_arg.text == "/start", (
        f"handle_start должен быть вызван с Message.text='/start'. "
        f"Получено: {message_arg.text}"
    )
    
    assert session_id_arg == session_id, (
        f"handle_start должен быть вызван с session_id={session_id}. "
        f"Получено: {session_id_arg}"
    )


# ============================================================================
# Property 4: Preservation - Для пользователей с help_needed=False флаг остаётся False
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    admin_id=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
        min_size=5,
        max_size=20
    )
)
@settings(
    max_examples=15,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_help_needed_false_unchanged(
    telegram_id: int,
    admin_id: str,
    state_reset_service: StateResetService,
    session_manager: SessionManager,
    test_db_session
):
    """
    **Validates: Requirement 3.1**
    
    Property: Для пользователей с help_needed=False флаг остаётся False
    
    **Observation**: reset_user_state() не изменяет флаг help_needed для пользователей с False
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(admin_id.strip()) > 0)
    
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём активную сессию с help_needed=False
    session = SupportSession(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        session_type="chat",
        status="active",
        help_needed=False,  # Не-bug случай
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    session_id = session.id
    
    # Проверяем предусловие: help_needed=False
    assert session.help_needed is False, (
        f"Предусловие: у сессии session_id={session_id} должен быть help_needed=False. "
        f"Получено: {session.help_needed}"
    )
    
    # Act: Вызываем reset_user_state
    result = await state_reset_service.reset_user_state(
        telegram_id=telegram_id,
        session_id=session_id,
        admin_id=admin_id
    )
    
    # Обновляем объект сессии из БД
    await test_db_session.refresh(session)
    
    # Assert: Флаг help_needed должен остаться False
    assert session.help_needed is False, (
        f"После вызова reset_user_state() для пользователя с help_needed=False, "
        f"флаг должен остаться False. telegram_id={telegram_id}, session_id={session_id}. "
        f"Получено: {session.help_needed}. "
        f"Это baseline поведение для сохранения флага help_needed=False (Requirement 3.1)."
    )


# ============================================================================
# Property 5: Preservation - Порядок выполнения операций сохраняется
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.pbt
@given(
    telegram_id=st.integers(min_value=100000, max_value=999999999),
    admin_id=st.text(
        alphabet=st.characters(whitelist_categories=("Lu", "Ll", "Nd")),
        min_size=5,
        max_size=20
    )
)
@settings(
    max_examples=10,
    phases=[Phase.generate, Phase.target],
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_preservation_operations_order(
    telegram_id: int,
    admin_id: str,
    session_manager: SessionManager,
    memory_storage: MemoryStorage,
    test_db_session
):
    """
    **Validates: Requirements 3.2, 3.3, 3.4**
    
    Property: Порядок выполнения операций сохраняется:
    1. FSM clear
    2. save /start
    3. invoke handler
    4. log
    
    **Observation**: reset_user_state() выполняет операции в строго определённом порядке
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ на неисправленном коде
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(admin_id.strip()) > 0)
    
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём активную сессию
    session = SupportSession(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        session_type="chat",
        status="active",
        help_needed=False,
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    session_id = session.id
    
    # Создаём свежие mock объекты для каждого теста
    mock_bot = Mock(spec=Bot)
    mock_bot.id = 123456789
    mock_bot.send_message = AsyncMock()
    
    mock_common_handler = Mock(spec=CommonHandler)
    mock_common_handler.handle_start = AsyncMock()
    
    # Создаём StateResetService
    state_reset_service = StateResetService(
        bot=mock_bot,
        common_handler=mock_common_handler,
        session_manager=session_manager,
        storage=memory_storage
    )
    
    # Отслеживаем порядок вызовов
    call_order = []
    
    # Патчим методы для отслеживания порядка
    original_clear = state_reset_service._clear_fsm_state
    original_save = state_reset_service._save_start_command
    original_invoke = state_reset_service._invoke_start_handler
    
    async def tracked_clear(*args, **kwargs):
        call_order.append('clear')
        return await original_clear(*args, **kwargs)
    
    async def tracked_save(*args, **kwargs):
        call_order.append('save')
        return await original_save(*args, **kwargs)
    
    async def tracked_invoke(*args, **kwargs):
        call_order.append('invoke')
        return await original_invoke(*args, **kwargs)
    
    # Act: Вызываем reset_user_state с патченными методами
    with patch.object(state_reset_service, '_clear_fsm_state', side_effect=tracked_clear), \
         patch.object(state_reset_service, '_save_start_command', side_effect=tracked_save), \
         patch.object(state_reset_service, '_invoke_start_handler', side_effect=tracked_invoke):
        
        result = await state_reset_service.reset_user_state(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
    
    # Assert: Порядок операций должен быть: clear → save → invoke
    expected_order = ['clear', 'save', 'invoke']
    assert call_order == expected_order, (
        f"Порядок выполнения операций должен быть: {expected_order}. "
        f"Получено: {call_order}. "
        f"Это baseline поведение для порядка операций reset_user_state() "
        f"(Requirements 3.2, 3.3, 3.4)."
    )
