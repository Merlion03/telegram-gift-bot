"""
Unit-тесты для модели SupportSession

Проверяет корректность работы методов модели:
- is_chat_session() и is_support_session()
- convert_to_support()
- Базовые методы is_active() и close()
"""

import pytest
from datetime import datetime, timezone
from database.models import SupportSession


class TestSupportSessionModel:
    """Тесты для модели SupportSession"""
    
    def test_default_session_type_is_chat(self):
        """Проверяет, что по умолчанию создаётся chat сессия"""
        # Arrange & Act
        session = SupportSession(
            telegram_id=123456789,
            status='active'
        )
        
        # Assert
        assert session.session_type == 'chat'
        assert session.is_chat_session() is True
        assert session.is_support_session() is False
    
    def test_is_chat_session_returns_true_for_chat_type(self):
        """Проверяет метод is_chat_session() для типа 'chat'"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Act & Assert
        assert session.is_chat_session() is True
        assert session.is_support_session() is False
    
    def test_is_support_session_returns_true_for_support_type(self):
        """Проверяет метод is_support_session() для типа 'support'"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='support'
        )
        
        # Act & Assert
        assert session.is_support_session() is True
        assert session.is_chat_session() is False
    
    def test_convert_to_support_changes_session_type(self):
        """Проверяет, что convert_to_support() меняет тип с 'chat' на 'support'"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Проверяем начальное состояние
        assert session.is_chat_session() is True
        assert session.is_support_session() is False
        
        # Act
        session.convert_to_support()
        
        # Assert
        assert session.session_type == 'support'
        assert session.is_support_session() is True
        assert session.is_chat_session() is False
    
    def test_convert_to_support_is_idempotent(self):
        """Проверяет, что повторный вызов convert_to_support() безопасен"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Act - вызываем дважды
        session.convert_to_support()
        session.convert_to_support()
        
        # Assert - тип остаётся 'support'
        assert session.session_type == 'support'
        assert session.is_support_session() is True
    
    def test_convert_to_support_preserves_other_fields(self):
        """Проверяет, что convert_to_support() не меняет другие поля"""
        # Arrange
        telegram_id = 987654321
        status = 'active'
        created_at = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        
        session = SupportSession(
            telegram_id=telegram_id,
            status=status,
            session_type='chat',
            created_at=created_at
        )
        
        # Act
        session.convert_to_support()
        
        # Assert - все остальные поля не изменились
        assert session.telegram_id == telegram_id
        assert session.status == status
        assert session.created_at == created_at
        assert session.closed_at is None
    
    def test_is_active_returns_true_for_active_session(self):
        """Проверяет метод is_active() для активной сессии"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Act & Assert
        assert session.is_active() is True
    
    def test_is_active_returns_false_for_closed_session(self):
        """Проверяет метод is_active() для закрытой сессии"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='closed',
            session_type='chat'
        )
        
        # Act & Assert
        assert session.is_active() is False
    
    def test_close_changes_status_and_sets_closed_at(self):
        """Проверяет, что close() меняет статус и устанавливает closed_at"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Проверяем начальное состояние
        assert session.is_active() is True
        assert session.closed_at is None
        
        # Act
        before_close = datetime.now(timezone.utc)
        session.close()
        after_close = datetime.now(timezone.utc)
        
        # Assert
        assert session.status == 'closed'
        assert session.is_active() is False
        assert session.closed_at is not None
        assert before_close <= session.closed_at <= after_close
    
    def test_repr_includes_session_type(self):
        """Проверяет, что __repr__ включает session_type"""
        # Arrange
        session = SupportSession(
            telegram_id=123456789,
            status='active',
            session_type='chat'
        )
        
        # Act
        repr_str = repr(session)
        
        # Assert
        assert 'session_type' in repr_str
        assert 'chat' in repr_str
        assert '123456789' in repr_str
    
    def test_session_with_all_fields(self):
        """Проверяет создание сессии со всеми полями"""
        # Arrange
        telegram_id = 111222333
        status = 'closed'
        session_type = 'support'
        created_at = datetime(2024, 1, 10, 12, 0, 0, tzinfo=timezone.utc)
        closed_at = datetime(2024, 1, 11, 15, 30, 0, tzinfo=timezone.utc)
        
        # Act
        session = SupportSession(
            telegram_id=telegram_id,
            status=status,
            session_type=session_type,
            created_at=created_at,
            closed_at=closed_at
        )
        
        # Assert
        assert session.telegram_id == telegram_id
        assert session.status == status
        assert session.session_type == session_type
        assert session.created_at == created_at
        assert session.closed_at == closed_at
        assert session.is_support_session() is True
        assert session.is_active() is False

