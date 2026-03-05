"""
Property-based тесты для SessionManager

Используется Hypothesis для проверки универсальных свойств системы
на большом количестве сгенерированных входных данных.
"""
import pytest
from hypothesis import given, settings, strategies as st, HealthCheck
from datetime import datetime, timezone

from services.session_manager import SessionManager
from database.models import SupportSession, SupportMessage


# Стратегии генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
message_texts = st.text(min_size=0, max_size=4000)
file_ids = st.text(min_size=10, max_size=100).filter(lambda x: x.isalnum())
session_types = st.sampled_from(['chat', 'support'])


# Property 1: Автоматическое создание сессии при первом сообщении
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(telegram_id=telegram_ids)
@pytest.mark.asyncio
async def test_property_1_auto_create_session(telegram_id, support_repository):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 1.1**
    
    Property 1: Автоматическое создание сессии при первом сообщении
    
    For any пользователя, который отправляет первое сообщение боту,
    система должна автоматически создать новую Chat_Session с типом 'chat'
    и корректным telegram_id.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Act
    session_id = await session_manager.get_or_create_session(telegram_id)
    
    # Assert
    created_session = await support_repository.get_session_by_id(session_id)
    assert created_session is not None, "Сессия должна быть создана"
    assert created_session.telegram_id == telegram_id, "telegram_id должен совпадать"
    assert created_session.session_type == 'chat', "Тип сессии должен быть 'chat'"
    assert created_session.status == 'active', "Статус должен быть 'active'"
    assert created_session.created_at is not None, "Должна быть временная метка создания"


# Property 2: Отсутствие дублирующих активных сессий
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    call_count=st.integers(min_value=2, max_value=10)
)
@pytest.mark.asyncio
async def test_property_2_no_duplicate_sessions(telegram_id, call_count, support_repository):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 1.2**
    
    Property 2: Отсутствие дублирующих активных сессий
    
    For any пользователя с активной Chat_Session, отправка нового сообщения
    не должна создавать новую сессию, а должна использовать существующую.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Act - вызываем get_or_create_session несколько раз
    session_ids = []
    for _ in range(call_count):
        session_id = await session_manager.get_or_create_session(telegram_id)
        session_ids.append(session_id)
    
    # Assert - все вызовы должны вернуть один и тот же session_id
    assert len(set(session_ids)) == 1, "Должна быть только одна уникальная сессия"
    assert all(sid == session_ids[0] for sid in session_ids), "Все ID должны совпадать"
    
    # Проверяем, что в БД действительно только одна активная сессия
    active_session = await support_repository.get_user_active_session(telegram_id)
    assert active_session is not None, "Активная сессия должна существовать"
    assert active_session.id == session_ids[0], "ID должен совпадать с возвращённым"


# Property 3: Полнота структуры Chat_Session
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(telegram_id=telegram_ids)
@pytest.mark.asyncio
async def test_property_3_chat_session_structure_completeness(telegram_id, support_repository):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 1.3**
    
    Property 3: Полнота структуры Chat_Session
    
    For any созданной Chat_Session, она должна содержать все обязательные поля:
    telegram_id, created_at, status, session_type.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Act
    session_id = await session_manager.get_or_create_session(telegram_id)
    created_session = await support_repository.get_session_by_id(session_id)
    
    # Assert - проверяем наличие всех обязательных полей
    assert created_session is not None, "Сессия должна существовать"
    
    # Проверка telegram_id
    assert hasattr(created_session, 'telegram_id'), "Должно быть поле telegram_id"
    assert created_session.telegram_id is not None, "telegram_id не должен быть None"
    assert created_session.telegram_id == telegram_id, "telegram_id должен совпадать"
    
    # Проверка created_at
    assert hasattr(created_session, 'created_at'), "Должно быть поле created_at"
    assert created_session.created_at is not None, "created_at не должен быть None"
    assert isinstance(created_session.created_at, datetime), "created_at должен быть datetime"
    
    # Проверка status
    assert hasattr(created_session, 'status'), "Должно быть поле status"
    assert created_session.status is not None, "status не должен быть None"
    assert created_session.status in ('active', 'closed'), "status должен быть валидным"
    
    # Проверка session_type
    assert hasattr(created_session, 'session_type'), "Должно быть поле session_type"
    assert created_session.session_type is not None, "session_type не должен быть None"
    assert created_session.session_type in ('chat', 'support'), "session_type должен быть валидным"


# Property 4: Преобразование Chat_Session в Support_Session с сохранением истории
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    messages=st.lists(
        st.tuples(message_texts, st.one_of(st.none(), file_ids)),
        min_size=1,
        max_size=10
    )
)
@pytest.mark.asyncio
async def test_property_4_convert_session_preserves_history(telegram_id, messages, support_repository):
    """
    Feature: admin-chat-persistence
    **Validates: Requirements 1.5, 4.3, 6.4**
    
    Property 4: Преобразование Chat_Session в Support_Session с сохранением истории
    
    For any Chat_Session с историей сообщений, при преобразовании в Support_Session
    (через кнопку "Позвать человека" или первое сообщение админа), тип сессии должен
    измениться на 'support', а все сообщения должны сохраниться.
    """
    # Arrange
    session_manager = SessionManager(repository=support_repository)
    
    # Создаём Chat_Session
    session_id = await session_manager.get_or_create_session(telegram_id)
    
    # Добавляем сообщения
    message_ids = []
    for msg_text, file_id in messages:
        msg_id = await session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text=msg_text,
            file_id=file_id
        )
        message_ids.append(msg_id)
    
    # Получаем исходное состояние
    original_messages = await support_repository.get_messages(session_id)
    original_message_count = len(original_messages)
    
    # Act - преобразуем в Support_Session
    success = await session_manager.convert_to_support_session(session_id)
    
    # Assert
    assert success is True, "Преобразование должно быть успешным"
    
    # Проверяем изменение типа сессии
    converted_session = await support_repository.get_session_by_id(session_id)
    assert converted_session is not None, "Сессия должна существовать"
    assert converted_session.session_type == 'support', "Тип должен быть 'support'"
    
    # Проверяем сохранение истории сообщений
    messages_after = await support_repository.get_messages(session_id)
    assert len(messages_after) == original_message_count, "Количество сообщений должно сохраниться"
    
    # Проверяем, что все исходные сообщения на месте
    after_ids = [msg.id for msg in messages_after]
    for original_msg in original_messages:
        assert original_msg.id in after_ids, f"Сообщение {original_msg.id} должно сохраниться"
    
    # Проверяем содержимое сообщений
    for i, original_msg in enumerate(original_messages):
        after_msg = messages_after[i]
        assert after_msg.message_text == original_msg.message_text, "Текст должен сохраниться"
        assert after_msg.telegram_id == original_msg.telegram_id, "telegram_id должен сохраниться"
        assert after_msg.message_type == original_msg.message_type, "Тип сообщения должен сохраниться"

