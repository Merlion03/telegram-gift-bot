"""
Property-based тесты для PostgreSQL LISTEN/NOTIFY триггеров

Проверяют корректность работы триггеров для real-time уведомлений
с использованием Hypothesis для генерации тестовых данных
"""
import pytest
import json
import asyncio
from datetime import datetime, timezone
from hypothesis import given, settings, strategies as st, HealthCheck
from hypothesis import assume

from database.models import SupportSession, SupportMessage
from database.repository import SupportRepository


# Стратегии генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
message_types = st.sampled_from(['from_user', 'from_support', 'from_bot'])
# Генерируем только валидные UTF-8 строки без нулевых байтов и управляющих символов
message_texts = st.text(
    min_size=1, 
    max_size=4000,
    alphabet=st.characters(
        blacklist_categories=('Cc', 'Cs'),  # Исключаем control и surrogate символы
        blacklist_characters='\x00'  # Исключаем нулевой байт
    )
)
file_ids = st.one_of(
    st.none(), 
    st.text(
        min_size=10, 
        max_size=255,
        alphabet=st.characters(
            blacklist_categories=('Cc', 'Cs'),
            blacklist_characters='\x00'
        )
    )
)
delivered_flags = st.booleans()


@st.composite
def message_data(draw):
    """Генератор данных для создания сообщения"""
    return {
        'telegram_id': draw(telegram_ids),
        'message_type': draw(message_types),
        'message_text': draw(message_texts),
        'file_id': draw(file_ids),
        'delivered': draw(delivered_flags)
    }


@pytest.mark.asyncio
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
    deadline=10000  # Увеличиваем timeout для LISTEN операций
)
@given(
    messages_data=st.lists(
        message_data(),
        min_size=1,
        max_size=5  # Уменьшаем для ускорения тестов
    )
)
async def test_property_1_database_trigger_notification_round_trip(
    messages_data,
    db_session,
    listen_connection
):
    """
    Feature: postgres-realtime-notifications, Property 1: Database trigger notification round-trip
    
    For any INSERT операции на support_messages,
    notification payload, полученный через LISTEN, должен содержать данные,
    совпадающие с вставленной записью.
    
    Validates: Requirements 1.1, 1.4
    """
    # Arrange - создаём сессию для сообщений
    session = SupportSession(
        telegram_id=123456789,
        status='active',
        session_type='chat'
    )
    db_session.add(session)
    await db_session.flush()
    await db_session.commit()
    session_id = session.id
    
    # Act - вставляем сообщения по одному с commit
    inserted_messages = []
    notifications = []
    
    for msg_data in messages_data:
        message = SupportMessage(
            session_id=session_id,
            telegram_id=msg_data['telegram_id'],
            message_type=msg_data['message_type'],
            message_text=msg_data['message_text'],
            file_id=msg_data['file_id'],
            delivered=msg_data['delivered']
        )
        db_session.add(message)
        await db_session.flush()
        await db_session.commit()
        inserted_messages.append(message)
        
        # Ждём уведомление
        notification = await listen_connection.wait_for_notification('new_message', timeout=1.0)
        if notification:
            notifications.append(notification)
    
    # Assert - проверяем, что получили уведомления для всех сообщений
    assert len(notifications) >= len(inserted_messages), \
        f"Ожидалось минимум {len(inserted_messages)} уведомлений, получено {len(notifications)}"
    
    # Проверяем каждое уведомление
    for i, (inserted_msg, notification) in enumerate(zip(inserted_messages, notifications)):
        # Парсим payload
        payload = json.loads(notification.payload)
        
        # Assert - проверяем структуру payload
        assert 'operation' in payload, "Payload должен содержать поле 'operation'"
        assert 'table' in payload, "Payload должен содержать поле 'table'"
        assert 'session_id' in payload, "Payload должен содержать поле 'session_id'"
        assert 'message_id' in payload, "Payload должен содержать поле 'message_id'"
        assert 'data' in payload, "Payload должен содержать поле 'data'"
        
        # Assert - проверяем значения
        assert payload['operation'] == 'INSERT', f"Operation должна быть INSERT, получено {payload['operation']}"
        assert payload['table'] == 'support_messages', f"Table должна быть support_messages, получено {payload['table']}"
        assert payload['session_id'] == session_id, \
            f"Session ID должен быть {session_id}, получено {payload['session_id']}"
        assert payload['message_id'] == inserted_msg.id, \
            f"Message ID должен быть {inserted_msg.id}, получено {payload['message_id']}"
        
        # Assert - проверяем данные сообщения в payload
        data = payload['data']
        assert data['id'] == inserted_msg.id, \
            f"ID в data должен быть {inserted_msg.id}, получено {data['id']}"
        assert data['session_id'] == session_id, \
            f"Session ID в data должен быть {session_id}, получено {data['session_id']}"
        assert data['telegram_id'] == inserted_msg.telegram_id, \
            f"Telegram ID должен быть {inserted_msg.telegram_id}, получено {data['telegram_id']}"
        assert data['message_type'] == inserted_msg.message_type, \
            f"Message type должен быть {inserted_msg.message_type}, получено {data['message_type']}"
        assert data['message_text'] == inserted_msg.message_text, \
            f"Message text должен совпадать"
        assert data['file_id'] == inserted_msg.file_id, \
            f"File ID должен быть {inserted_msg.file_id}, получено {data['file_id']}"
        assert data['delivered'] == inserted_msg.delivered, \
            f"Delivered должен быть {inserted_msg.delivered}, получено {data['delivered']}"
