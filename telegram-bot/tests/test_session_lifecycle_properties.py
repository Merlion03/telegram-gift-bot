"""
Property-based тесты для жизненного цикла сессий

Тесты для автоматического закрытия неактивных сессий,
закрытия администратором и сохранения закрытых сессий.
"""
import pytest
from hypothesis import given, settings, strategies as st, HealthCheck
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

from services.session_manager import SessionManager
from database.models import SupportSession, SupportMessage


# Стратегии генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
message_texts = st.text(min_size=1, max_size=4000)
inactive_hours = st.integers(min_value=1, max_value=168)  # От 1 часа до недели


# Property 13: Автоматическое закрытие неактивных сессий
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    inactive_hours_threshold=st.integers(min_value=12, max_value=48),
    hours_since_activity=st.integers(min_value=1, max_value=100)
)
@pytest.mark.asyncio
async def test_property_13_auto_close_inactive_sessions(
    telegram_id,
    inactive_hours_threshold,
    hours_since_activity,
    support_repository
):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 5.1**
    
    Property 13: Автоматическое закрытие неактивных сессий
    
    For any сессии без активности более указанного времени,
    Session_Manager должен автоматически закрыть её,
    установив status='closed' и closed_at.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Создаём сессию
    session_id = await session_manager.get_or_create_session(telegram_id)
    
    # Добавляем сообщение с определённым временем
    old_time = datetime.now(timezone.utc) - timedelta(hours=hours_since_activity)
    await session_manager.save_user_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_text="Тестовое сообщение"
    )
    
    # Обновляем время создания сообщения вручную (имитация старого сообщения)
    session = await support_repository.get_session_by_id(session_id)
    if session.messages:
        # Обновляем время последнего сообщения
        last_message = session.messages[-1]
        last_message.created_at = old_time
        await support_repository.session.flush()
    
    # Act - закрываем неактивные сессии
    closed_count = await session_manager.close_inactive_sessions(
        inactive_hours=inactive_hours_threshold
    )
    
    # Assert
    session_after = await support_repository.get_session_by_id(session_id)
    
    # Проверяем логику закрытия
    should_be_closed = hours_since_activity > inactive_hours_threshold
    
    if should_be_closed:
        # Сессия должна быть закрыта
        assert closed_count >= 1, "Должна быть закрыта хотя бы одна сессия"
        assert session_after.status == 'closed', "Статус должен быть 'closed'"
        assert session_after.closed_at is not None, "Должна быть временная метка закрытия"
        assert isinstance(session_after.closed_at, datetime), "closed_at должен быть datetime"
    else:
        # Сессия должна остаться активной
        assert session_after.status == 'active', "Статус должен остаться 'active'"
        assert session_after.closed_at is None, "closed_at должен быть None"


# Property 14: Корректное закрытие сессии администратором
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    session_type=st.sampled_from(['chat', 'support'])
)
@pytest.mark.asyncio
async def test_property_14_admin_close_session(
    telegram_id,
    session_type,
    support_repository
):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 5.2**
    
    Property 14: Корректное закрытие сессии администратором
    
    For any активной сессии (Chat_Session или Support_Session),
    при закрытии администратором система должна установить
    status='closed' и временную метку closed_at.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Создаём сессию нужного типа
    session_id = await session_manager.get_or_create_session(
        telegram_id=telegram_id,
        session_type=session_type
    )
    
    # Проверяем, что сессия активна
    session_before = await support_repository.get_session_by_id(session_id)
    assert session_before.status == 'active', "Сессия должна быть активной"
    assert session_before.closed_at is None, "closed_at должен быть None"
    
    # Act - закрываем сессию (имитация действия администратора)
    success = await support_repository.close_session(session_id)
    
    # Assert
    assert success is True, "Закрытие должно быть успешным"
    
    session_after = await support_repository.get_session_by_id(session_id)
    assert session_after is not None, "Сессия должна существовать"
    assert session_after.status == 'closed', "Статус должен быть 'closed'"
    assert session_after.closed_at is not None, "Должна быть временная метка закрытия"
    assert isinstance(session_after.closed_at, datetime), "closed_at должен быть datetime"
    
    # Проверяем, что closed_at установлен в разумное время (не в будущем, не слишком в прошлом)
    now = datetime.now(timezone.utc)
    time_diff = abs((now - session_after.closed_at).total_seconds())
    assert time_diff < 60, "closed_at должен быть установлен в текущее время (±60 сек)"


# Property 16: Сохранение закрытых сессий в БД
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_ids_list=st.lists(
        telegram_ids,
        min_size=2,
        max_size=10,
        unique=True
    ),
    messages_per_session=st.integers(min_value=1, max_value=5)
)
@pytest.mark.asyncio
async def test_property_16_closed_sessions_persisted(
    telegram_ids_list,
    messages_per_session,
    support_repository
):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 5.5**
    
    Property 16: Сохранение закрытых сессий в БД
    
    For any закрытой сессии, она должна оставаться в базе данных
    и быть доступной для запросов с фильтром status='closed'.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Создаём несколько сессий
    session_ids = []
    for telegram_id in telegram_ids_list:
        session_id = await session_manager.get_or_create_session(telegram_id)
        session_ids.append(session_id)
        
        # Добавляем сообщения
        for i in range(messages_per_session):
            await session_manager.save_user_message(
                session_id=session_id,
                telegram_id=telegram_id,
                message_text=f"Сообщение {i+1}"
            )
    
    # Закрываем половину сессий
    closed_session_ids = session_ids[:len(session_ids)//2]
    for session_id in closed_session_ids:
        await support_repository.close_session(session_id)
    
    # Act - получаем закрытые сессии (используем большой лимит для получения всех)
    closed_sessions = await support_repository.get_all_sessions(
        status='closed',
        session_type=None,
        limit=10000  # Большой лимит для получения всех закрытых сессий
    )
    
    # Assert
    assert len(closed_sessions) >= len(closed_session_ids), \
        "Все закрытые сессии должны быть в БД"
    
    # Проверяем, что все закрытые сессии доступны
    closed_ids_from_db = [s.id for s in closed_sessions]
    for closed_id in closed_session_ids:
        assert closed_id in closed_ids_from_db, \
            f"Закрытая сессия {closed_id} должна быть в БД"
    
    # Проверяем, что у всех закрытых сессий правильный статус
    for session in closed_sessions:
        if session.id in closed_session_ids:
            assert session.status == 'closed', "Статус должен быть 'closed'"
            assert session.closed_at is not None, "Должна быть временная метка закрытия"
    
    # Проверяем, что сообщения сохранились
    for session_id in closed_session_ids:
        messages = await support_repository.get_messages(session_id)
        assert len(messages) >= messages_per_session, \
            "Сообщения закрытой сессии должны сохраниться"
    
    # Проверяем, что закрытые сессии можно получить по ID
    for session_id in closed_session_ids:
        session = await support_repository.get_session_by_id(session_id)
        assert session is not None, "Закрытая сессия должна быть доступна по ID"
        assert session.status == 'closed', "Статус должен быть 'closed'"
