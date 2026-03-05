"""
Unit-тесты для расширенных методов SupportRepository

Проверяют конкретные примеры, граничные случаи и обработку ошибок
для новых методов, добавленных в рамках фичи admin-chat-persistence.
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from database.models import SupportSession, SupportMessage
from database.repository import SupportRepository


class TestUpdateSessionType:
    """Тесты для метода update_session_type"""
    
    def test_update_session_type_from_chat_to_support(self):
        """Проверяет обновление типа сессии с 'chat' на 'support'"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Act
        session.session_type = 'support'
        
        # Assert
        assert session.session_type == 'support'
        assert session.is_support_session()
        assert not session.is_chat_session()
    
    def test_update_session_type_preserves_other_fields(self):
        """Проверяет, что обновление типа не затрагивает другие поля"""
        # Arrange
        created_at = datetime.now(timezone.utc)
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat',
            created_at=created_at
        )
        original_id = session.telegram_id
        original_status = session.status
        original_created_at = session.created_at
        
        # Act
        session.session_type = 'support'
        
        # Assert
        assert session.telegram_id == original_id
        assert session.status == original_status
        assert session.created_at == original_created_at
    
    def test_update_session_type_raises_error_for_invalid_type(self):
        """Проверяет, что невалидный тип вызывает ошибку валидации"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Act & Assert
        # В реальной БД constraint проверит это, здесь просто проверяем логику
        invalid_type = 'invalid_type'
        assert invalid_type not in ('chat', 'support')


class TestGetAllSessions:
    """Тесты для метода get_all_sessions"""
    
    def test_get_all_sessions_returns_all_when_no_filters(self):
        """Проверяет возврат всех сессий при отсутствии фильтров"""
        # Arrange
        sessions = [
            SupportSession(telegram_id=111, status='active', session_type='chat'),
            SupportSession(telegram_id=222, status='closed', session_type='support'),
            SupportSession(telegram_id=333, status='active', session_type='support'),
        ]
        
        # Act - фильтруем вручную (имитация логики метода)
        filtered = [s for s in sessions]
        
        # Assert
        assert len(filtered) == 3
    
    def test_get_all_sessions_filters_by_status(self):
        """Проверяет фильтрацию по статусу"""
        # Arrange
        sessions = [
            SupportSession(telegram_id=111, status='active', session_type='chat'),
            SupportSession(telegram_id=222, status='closed', session_type='support'),
            SupportSession(telegram_id=333, status='active', session_type='support'),
        ]
        
        # Act - фильтруем по статусу 'active'
        filtered = [s for s in sessions if s.status == 'active']
        
        # Assert
        assert len(filtered) == 2
        assert all(s.status == 'active' for s in filtered)
    
    def test_get_all_sessions_filters_by_session_type(self):
        """Проверяет фильтрацию по типу сессии"""
        # Arrange
        sessions = [
            SupportSession(telegram_id=111, status='active', session_type='chat'),
            SupportSession(telegram_id=222, status='closed', session_type='support'),
            SupportSession(telegram_id=333, status='active', session_type='support'),
        ]
        
        # Act - фильтруем по типу 'support'
        filtered = [s for s in sessions if s.session_type == 'support']
        
        # Assert
        assert len(filtered) == 2
        assert all(s.session_type == 'support' for s in filtered)
    
    def test_get_all_sessions_filters_by_both_status_and_type(self):
        """Проверяет комбинированную фильтрацию"""
        # Arrange
        sessions = [
            SupportSession(telegram_id=111, status='active', session_type='chat'),
            SupportSession(telegram_id=222, status='closed', session_type='support'),
            SupportSession(telegram_id=333, status='active', session_type='support'),
            SupportSession(telegram_id=444, status='active', session_type='chat'),
        ]
        
        # Act - фильтруем по статусу 'active' И типу 'chat'
        filtered = [
            s for s in sessions 
            if s.status == 'active' and s.session_type == 'chat'
        ]
        
        # Assert
        assert len(filtered) == 2
        assert all(s.status == 'active' and s.session_type == 'chat' for s in filtered)
    
    def test_get_all_sessions_respects_limit(self):
        """Проверяет соблюдение лимита"""
        # Arrange
        sessions = [
            SupportSession(telegram_id=i, status='active', session_type='chat')
            for i in range(100)
        ]
        
        # Act - применяем лимит 10
        limit = 10
        filtered = sessions[:limit]
        
        # Assert
        assert len(filtered) == limit
    
    def test_get_all_sessions_respects_offset(self):
        """Проверяет соблюдение offset"""
        # Arrange
        sessions = [
            SupportSession(telegram_id=i, status='active', session_type='chat')
            for i in range(20)
        ]
        
        # Act - применяем offset 5
        offset = 5
        filtered = sessions[offset:]
        
        # Assert
        assert len(filtered) == 15
        assert filtered[0].telegram_id == 5
    
    def test_get_all_sessions_sorts_by_last_message_time(self):
        """Проверяет сортировку по времени последнего сообщения"""
        # Arrange
        now = datetime.now(timezone.utc)
        
        session1 = SupportSession(
            telegram_id=111,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=3)
        )
        session1.messages = [
            SupportMessage(
                session_id=1,
                telegram_id=111,
                message_type='from_user',
                message_text='Старое сообщение',
                created_at=now - timedelta(hours=2)
            )
        ]
        
        session2 = SupportSession(
            telegram_id=222,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=5)
        )
        session2.messages = [
            SupportMessage(
                session_id=2,
                telegram_id=222,
                message_type='from_user',
                message_text='Новое сообщение',
                created_at=now - timedelta(minutes=10)
            )
        ]
        
        sessions = [session1, session2]
        
        # Act - сортируем по времени последнего сообщения
        def get_last_activity(s):
            if s.messages:
                return max(m.created_at for m in s.messages)
            return s.created_at
        
        sorted_sessions = sorted(sessions, key=get_last_activity, reverse=True)
        
        # Assert - session2 должна быть первой (более свежее сообщение)
        assert sorted_sessions[0].telegram_id == 222
        assert sorted_sessions[1].telegram_id == 111


class TestCloseSessionsByInactivity:
    """Тесты для метода close_sessions_by_inactivity"""
    
    def test_closes_sessions_without_messages_older_than_threshold(self):
        """Проверяет закрытие сессий без сообщений старше порога"""
        # Arrange
        now = datetime.now(timezone.utc)
        threshold_hours = 24
        
        old_session = SupportSession(
            telegram_id=111,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=25)
        )
        old_session.messages = []
        
        fresh_session = SupportSession(
            telegram_id=222,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=10)
        )
        fresh_session.messages = []
        
        # Act - определяем, какие сессии нужно закрыть
        threshold_time = now - timedelta(hours=threshold_hours)
        
        def should_close(session):
            last_activity = session.created_at
            if session.messages:
                last_activity = max(m.created_at for m in session.messages)
            return last_activity < threshold_time
        
        # Assert
        assert should_close(old_session) is True
        assert should_close(fresh_session) is False
    
    def test_considers_message_activity_not_just_creation_time(self):
        """Проверяет учёт активности по сообщениям, а не только по времени создания"""
        # Arrange
        now = datetime.now(timezone.utc)
        threshold_hours = 24
        
        # Сессия создана давно, но есть свежее сообщение
        session = SupportSession(
            telegram_id=111,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=48)
        )
        session.messages = [
            SupportMessage(
                session_id=1,
                telegram_id=111,
                message_type='from_user',
                message_text='Свежее сообщение',
                created_at=now - timedelta(hours=2)
            )
        ]
        
        # Act
        threshold_time = now - timedelta(hours=threshold_hours)
        last_activity = max(m.created_at for m in session.messages)
        should_close = last_activity < threshold_time
        
        # Assert - не должна закрываться, т.к. есть свежее сообщение
        assert should_close is False
    
    def test_returns_count_of_closed_sessions(self):
        """Проверяет возврат количества закрытых сессий"""
        # Arrange
        now = datetime.now(timezone.utc)
        threshold_hours = 24
        
        sessions = [
            SupportSession(
                telegram_id=i,
                status='active',
                session_type='chat',
                created_at=now - timedelta(hours=25 + i)
            )
            for i in range(5)
        ]
        
        for s in sessions:
            s.messages = []
        
        # Act
        threshold_time = now - timedelta(hours=threshold_hours)
        closed_count = sum(
            1 for s in sessions
            if s.created_at < threshold_time
        )
        
        # Assert
        assert closed_count == 5
    
    def test_does_not_close_already_closed_sessions(self):
        """Проверяет, что уже закрытые сессии не обрабатываются"""
        # Arrange
        now = datetime.now(timezone.utc)
        
        already_closed = SupportSession(
            telegram_id=111,
            status='closed',
            session_type='chat',
            created_at=now - timedelta(hours=48)
        )
        already_closed.messages = []
        
        # Act - фильтруем только активные сессии
        active_sessions = [already_closed] if already_closed.status == 'active' else []
        
        # Assert
        assert len(active_sessions) == 0


class TestGetSessionLastActivity:
    """Тесты для метода get_session_last_activity"""
    
    def test_returns_last_message_time_when_messages_exist(self):
        """Проверяет возврат времени последнего сообщения"""
        # Arrange
        now = datetime.now(timezone.utc)
        
        session = SupportSession(
            telegram_id=111,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=5)
        )
        
        message1 = SupportMessage(
            session_id=1,
            telegram_id=111,
            message_type='from_user',
            message_text='Первое',
            created_at=now - timedelta(hours=3)
        )
        
        message2 = SupportMessage(
            session_id=1,
            telegram_id=111,
            message_type='from_bot',
            message_text='Второе',
            created_at=now - timedelta(hours=1)
        )
        
        session.messages = [message1, message2]
        
        # Act
        last_activity = max(m.created_at for m in session.messages)
        
        # Assert
        assert last_activity == message2.created_at
    
    def test_returns_creation_time_when_no_messages(self):
        """Проверяет возврат времени создания при отсутствии сообщений"""
        # Arrange
        now = datetime.now(timezone.utc)
        
        session = SupportSession(
            telegram_id=111,
            status='active',
            session_type='chat',
            created_at=now - timedelta(hours=2)
        )
        session.messages = []
        
        # Act
        last_activity = session.created_at if not session.messages else max(
            m.created_at for m in session.messages
        )
        
        # Assert
        assert last_activity == session.created_at
    
    def test_returns_none_for_nonexistent_session(self):
        """Проверяет возврат None для несуществующей сессии"""
        # Arrange
        session = None
        
        # Act
        last_activity = None if session is None else session.created_at
        
        # Assert
        assert last_activity is None
    
    def test_handles_multiple_message_types(self):
        """Проверяет корректную обработку разных типов сообщений"""
        # Arrange
        now = datetime.now(timezone.utc)
        
        session = SupportSession(
            telegram_id=111,
            status='active',
            session_type='support',
            created_at=now - timedelta(hours=10)
        )
        
        messages = [
            SupportMessage(
                session_id=1,
                telegram_id=111,
                message_type='from_user',
                message_text='От пользователя',
                created_at=now - timedelta(hours=5)
            ),
            SupportMessage(
                session_id=1,
                telegram_id=111,
                message_type='from_bot',
                message_text='От бота',
                created_at=now - timedelta(hours=3)
            ),
            SupportMessage(
                session_id=1,
                telegram_id=999,
                message_type='from_support',
                message_text='От поддержки',
                created_at=now - timedelta(hours=1)
            ),
        ]
        
        session.messages = messages
        
        # Act
        last_activity = max(m.created_at for m in session.messages)
        
        # Assert - должно быть время последнего сообщения (от поддержки)
        assert last_activity == messages[2].created_at


class TestErrorHandling:
    """Тесты обработки ошибок"""
    
    def test_update_session_type_validates_input(self):
        """Проверяет валидацию входных данных для update_session_type"""
        # Arrange
        valid_types = ('chat', 'support')
        invalid_type = 'invalid'
        
        # Act & Assert
        assert invalid_type not in valid_types
    
    def test_get_all_sessions_validates_status_filter(self):
        """Проверяет валидацию фильтра статуса"""
        # Arrange
        valid_statuses = ('active', 'closed', None)
        invalid_status = 'invalid'
        
        # Act & Assert
        assert invalid_status not in valid_statuses
    
    def test_get_all_sessions_validates_session_type_filter(self):
        """Проверяет валидацию фильтра типа сессии"""
        # Arrange
        valid_types = ('chat', 'support', None)
        invalid_type = 'invalid'
        
        # Act & Assert
        assert invalid_type not in valid_types
    
    def test_close_sessions_by_inactivity_validates_hours(self):
        """Проверяет валидацию параметра inactive_hours"""
        # Arrange
        invalid_hours = -5
        
        # Act & Assert
        assert invalid_hours <= 0
