"""
Property-based тесты для SupportRepository

Проверяют универсальные свойства корректности методов репозитория
с использованием Hypothesis для генерации тестовых данных
"""
import pytest
from datetime import datetime, timezone, timedelta
from hypothesis import given, settings, strategies as st, HealthCheck
from hypothesis import assume

from database.models import SupportSession, SupportMessage
from database.repository import SupportRepository


# Стратегии генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
statuses = st.sampled_from(['active', 'closed'])
session_types = st.sampled_from(['chat', 'support'])
message_texts = st.text(min_size=1, max_size=4000)


@st.composite
def session_data(draw):
    """Генератор данных для создания сессии"""
    return {
        'telegram_id': draw(telegram_ids),
        'status': draw(statuses),
        'session_type': draw(session_types)
    }


@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    sessions_data=st.lists(
        session_data(),
        min_size=5,
        max_size=20
    ),
    filter_status=st.one_of(st.none(), statuses)
)
async def test_property_15_filter_sessions_by_status(
    sessions_data,
    filter_status,
    db_session
):
    """
    Feature: admin-chat-persistence, Property 15: Фильтрация сессий по статусу
    
    For any запроса списка сессий с фильтром по статусу (active/closed),
    API должен возвращать только сессии с указанным статусом.
    
    Validates: Requirements 5.3
    """
    # Arrange
    repository = SupportRepository(db_session)
    
    # Создаём сессии с разными статусами
    created_sessions = []
    for data in sessions_data:
        session = SupportSession(
            telegram_id=data['telegram_id'],
            status=data['status'],
            session_type=data['session_type']
        )
        db_session.add(session)
        created_sessions.append(session)
    
    await db_session.flush()
    
    # Act
    # Используем большой лимит для получения всех сессий (не дефолтный 50)
    filtered_sessions = await repository.get_all_sessions(
        status=filter_status,
        session_type=None,
        limit=10000,  # Достаточно большой лимит для получения всех сессий
        offset=0
    )
    
    # Assert
    if filter_status is None:
        # Если фильтр не указан, должны вернуться все сессии
        assert len(filtered_sessions) == len(created_sessions)
    else:
        # Если фильтр указан, все возвращённые сессии должны иметь указанный статус
        assert all(s.status == filter_status for s in filtered_sessions)
        
        # Количество должно совпадать с ожидаемым
        expected_count = sum(1 for s in created_sessions if s.status == filter_status)
        assert len(filtered_sessions) == expected_count


@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    sessions_data=st.lists(
        session_data(),
        min_size=5,
        max_size=20
    ),
    filter_session_type=st.one_of(st.none(), session_types)
)
async def test_property_15_filter_sessions_by_type(
    sessions_data,
    filter_session_type,
    db_session
):
    """
    Feature: admin-chat-persistence, Property 15: Фильтрация сессий по типу
    
    For any запроса списка сессий с фильтром по типу (chat/support),
    API должен возвращать только сессии с указанным типом.
    
    Validates: Requirements 5.3
    """
    # Arrange
    repository = SupportRepository(db_session)
    
    # Создаём сессии с разными типами
    created_sessions = []
    for data in sessions_data:
        session = SupportSession(
            telegram_id=data['telegram_id'],
            status=data['status'],
            session_type=data['session_type']
        )
        db_session.add(session)
        created_sessions.append(session)
    
    await db_session.flush()
    
    # Act
    # Используем большой лимит для получения всех сессий (не дефолтный 50)
    filtered_sessions = await repository.get_all_sessions(
        status=None,
        session_type=filter_session_type,
        limit=10000,  # Достаточно большой лимит для получения всех сессий
        offset=0
    )
    
    # Assert
    if filter_session_type is None:
        # Если фильтр не указан, должны вернуться все сессии
        assert len(filtered_sessions) == len(created_sessions)
    else:
        # Если фильтр указан, все возвращённые сессии должны иметь указанный тип
        assert all(s.session_type == filter_session_type for s in filtered_sessions)
        
        # Количество должно совпадать с ожидаемым
        expected_count = sum(
            1 for s in created_sessions 
            if s.session_type == filter_session_type
        )
        assert len(filtered_sessions) == expected_count


@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    sessions_data=st.lists(
        session_data(),
        min_size=5,
        max_size=20
    ),
    filter_status=st.one_of(st.none(), statuses),
    filter_session_type=st.one_of(st.none(), session_types)
)
async def test_property_15_filter_sessions_combined(
    sessions_data,
    filter_status,
    filter_session_type,
    db_session
):
    """
    Feature: admin-chat-persistence, Property 15: Комбинированная фильтрация сессий
    
    For any запроса списка сессий с фильтрами по статусу И типу,
    API должен возвращать только сессии, соответствующие обоим фильтрам.
    
    Validates: Requirements 5.3
    """
    # Arrange
    repository = SupportRepository(db_session)
    
    # Создаём сессии с разными комбинациями статусов и типов
    created_sessions = []
    for data in sessions_data:
        session = SupportSession(
            telegram_id=data['telegram_id'],
            status=data['status'],
            session_type=data['session_type']
        )
        db_session.add(session)
        created_sessions.append(session)
    
    await db_session.flush()
    
    # Act
    # Используем большой лимит для получения всех сессий (не дефолтный 50)
    filtered_sessions = await repository.get_all_sessions(
        status=filter_status,
        session_type=filter_session_type,
        limit=10000,  # Достаточно большой лимит для получения всех сессий
        offset=0
    )
    
    # Assert
    if filter_status is None and filter_session_type is None:
        # Если оба фильтра не указаны, должны вернуться все сессии
        assert len(filtered_sessions) == len(created_sessions)
    else:
        # Проверяем, что все возвращённые сессии соответствуют фильтрам
        for session in filtered_sessions:
            if filter_status is not None:
                assert session.status == filter_status
            if filter_session_type is not None:
                assert session.session_type == filter_session_type
        
        # Количество должно совпадать с ожидаемым
        expected_count = sum(
            1 for s in created_sessions
            if (filter_status is None or s.status == filter_status)
            and (filter_session_type is None or s.session_type == filter_session_type)
        )
        assert len(filtered_sessions) == expected_count



@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    total_sessions=st.integers(min_value=10, max_value=50),
    page_size=st.integers(min_value=5, max_value=20)
)
async def test_property_17_pagination_of_sessions(
    total_sessions,
    page_size,
    db_session
):
    """
    Feature: admin-chat-persistence, Property 17: Пагинация списка сессий
    
    For any запроса списка сессий без указания limit,
    API должен возвращать не более 50 сессий на странице.
    
    For any запроса с указанием limit,
    API должен возвращать не более указанного количества сессий.
    
    Validates: Requirements 7.1
    """
    # Arrange
    repository = SupportRepository(db_session)
    
    # Создаём указанное количество сессий
    created_sessions = []
    for i in range(total_sessions):
        session = SupportSession(
            telegram_id=100000 + i,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        created_sessions.append(session)
    
    await db_session.flush()
    
    # Act - запрос без limit (должен вернуть максимум 50)
    sessions_no_limit = await repository.get_all_sessions(
        status=None,
        session_type=None,
        limit=None,
        offset=0
    )
    
    # Act - запрос с указанным limit
    sessions_with_limit = await repository.get_all_sessions(
        status=None,
        session_type=None,
        limit=page_size,
        offset=0
    )
    
    # Assert - без limit должно вернуться не более 50 сессий (дефолтный лимит)
    assert len(sessions_no_limit) <= 50, f"Без limit должно вернуться максимум 50 сессий, получено {len(sessions_no_limit)}"
    
    # Assert - с limit должно вернуться не более указанного количества
    assert len(sessions_with_limit) <= page_size, f"С limit={page_size} должно вернуться максимум {page_size} сессий, получено {len(sessions_with_limit)}"


@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    total_sessions=st.integers(min_value=20, max_value=100),
    page_size=st.integers(min_value=5, max_value=15),
    page_number=st.integers(min_value=0, max_value=5)
)
async def test_property_17_pagination_with_offset(
    total_sessions,
    page_size,
    page_number,
    db_session
):
    """
    Feature: admin-chat-persistence, Property 17: Пагинация с offset
    
    For any запроса с указанием limit и offset,
    API должен возвращать правильную страницу результатов.
    
    Validates: Requirements 7.1
    """
    # Arrange
    repository = SupportRepository(db_session)
    
    # Создаём сессии с уникальными telegram_id для отслеживания
    created_sessions = []
    for i in range(total_sessions):
        session = SupportSession(
            telegram_id=200000 + i,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
        created_sessions.append(session)
    
    await db_session.flush()
    
    # Act - запрос с пагинацией
    offset = page_number * page_size
    
    # Пропускаем тест, если offset выходит за пределы
    assume(offset < total_sessions)
    
    sessions_page = await repository.get_all_sessions(
        status=None,
        session_type=None,
        limit=page_size,
        offset=offset
    )
    
    # Assert - количество должно быть не больше page_size
    assert len(sessions_page) <= page_size, \
        f"Страница должна содержать максимум {page_size} сессий, получено {len(sessions_page)}"
    
    # Assert - не должно быть дубликатов с предыдущей страницей
    if page_number > 0:
        prev_offset = (page_number - 1) * page_size
        prev_page = await repository.get_all_sessions(
            status=None,
            session_type=None,
            limit=page_size,
            offset=prev_offset
        )
        
        # Проверяем, что сессии на разных страницах не пересекаются
        current_ids = {s.id for s in sessions_page}
        prev_ids = {s.id for s in prev_page}
        assert len(current_ids & prev_ids) == 0, "Страницы не должны пересекаться"


@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    total_sessions=st.integers(min_value=10, max_value=30)
)
async def test_property_17_default_limit_is_50(
    total_sessions,
    db_session
):
    """
    Feature: admin-chat-persistence, Property 17: Дефолтный лимит 50
    
    For any запроса списка сессий без указания limit,
    API должен использовать дефолтный лимит 50 сессий.
    
    Validates: Requirements 7.1
    """
    # Arrange
    repository = SupportRepository(db_session)
    
    # Создаём сессии
    for i in range(total_sessions):
        session = SupportSession(
            telegram_id=300000 + i,
            status='active',
            session_type='chat'
        )
        db_session.add(session)
    
    await db_session.flush()
    
    # Act - запрос без limit
    sessions = await repository.get_all_sessions(
        status=None,
        session_type=None,
        limit=None,
        offset=0
    )
    
    # Assert - должно вернуться не более 50 сессий
    assert len(sessions) <= 50
    
    # Assert - если сессий меньше 50, должны вернуться все
    if total_sessions <= 50:
        assert len(sessions) == total_sessions
