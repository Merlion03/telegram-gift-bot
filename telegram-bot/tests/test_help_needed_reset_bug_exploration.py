"""
Bug Condition Exploration Tests - Help Needed Reset on Main Menu

**КРИТИЧЕСКИ ВАЖНО**: Этот тест ДОЛЖЕН УПАСТЬ на неисправленном коде.
Падение подтверждает существование бага.

**НЕ ПЫТАТЬСЯ исправить тест или код, когда он упадёт**

**ЦЕЛЬ**: Выявить контрпримеры, демонстрирующие существование бага

Этот тест кодирует ОЖИДАЕМОЕ поведение системы после исправления.
Когда баг будет исправлен, этот тест должен пройти.

**Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from hypothesis import given, strategies as st, settings, Phase, HealthCheck
from sqlalchemy import delete
from unittest.mock import Mock, AsyncMock, MagicMock
from aiogram import Bot
from aiogram.fsm.storage.memory import MemoryStorage

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
async def state_reset_service(mock_bot, mock_common_handler, session_manager):
    """
    Создаёт экземпляр StateResetService для тестов
    """
    storage = MemoryStorage()
    return StateResetService(
        bot=mock_bot,
        common_handler=mock_common_handler,
        session_manager=session_manager,
        storage=storage
    )


# ============================================================================
# Property 1: Bug Condition - Help Needed Flag Not Reset on Main Menu
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
    max_examples=10,  # Ограничиваем для детерминистического бага
    phases=[Phase.generate, Phase.target],  # Scoped PBT подход
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
async def test_help_needed_flag_reset_on_main_menu(
    telegram_id: int,
    admin_id: str,
    state_reset_service: StateResetService,
    session_manager: SessionManager,
    support_repository: SupportRepository,
    test_db_session
):
    """
    **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
    
    Property: Для пользователя с help_needed=True, после вызова reset_user_state(),
    флаг help_needed должен быть сброшен в False
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация StateResetService.reset_user_state() не вызывает
    session.reset_help_needed(), поэтому флаг help_needed остаётся True
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация будет вызывать session.reset_help_needed()
    и сбрасывать флаг в False
    
    Bug Condition:
    - Пользователь имеет активную сессию с help_needed=True
    - Администратор вызывает "Вернуть в главное меню" (reset_user_state)
    - Ожидаемое поведение: флаг help_needed должен быть сброшен в False
    - Фактическое поведение: флаг help_needed остаётся True (БАГ)
    """
    # Фильтруем невалидные входные данные
    from hypothesis import assume
    assume(len(admin_id.strip()) > 0)
    
    # Очищаем таблицы перед каждым примером
    await test_db_session.execute(delete(SupportMessage))
    await test_db_session.execute(delete(SupportSession))
    await test_db_session.commit()
    
    # Arrange: Создаём активную сессию с help_needed=True
    session = SupportSession(
        telegram_id=telegram_id,
        username=f"user_{telegram_id}",
        session_type="chat",
        status="active",
        help_needed=True,  # Пользователь нажал кнопку "Нужна помощь"
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(session)
    
    session_id = session.id
    
    # Проверяем предусловие: help_needed=True
    assert session.help_needed is True, (
        f"Предусловие: у сессии session_id={session_id} должен быть help_needed=True. "
        f"Получено: {session.help_needed}"
    )
    
    # Act: Администратор вызывает "Вернуть в главное меню"
    result = await state_reset_service.reset_user_state(
        telegram_id=telegram_id,
        session_id=session_id,
        admin_id=admin_id
    )
    
    # Обновляем объект сессии из БД
    await test_db_session.refresh(session)
    
    # Assert: Флаг help_needed ДОЛЖЕН быть сброшен в False
    assert session.help_needed is False, (
        f"После вызова reset_user_state() для пользователя с telegram_id={telegram_id} "
        f"и session_id={session_id}, флаг help_needed должен быть сброшен в False. "
        f"Получено: {session.help_needed}. "
        f"Это подтверждает баг: StateResetService.reset_user_state() не сбрасывает флаг help_needed."
    )
    
    # Дополнительная проверка: операция reset-state должна быть успешной
    assert result["success"] is True, (
        f"Операция reset_user_state() должна завершиться успешно. "
        f"Получено: {result}"
    )
