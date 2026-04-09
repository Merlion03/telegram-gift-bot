"""
Unit-тесты для SessionManager

Проверяют:
- Сохранение ответа бота с telegram_id=0
- Сохранение ответа бота с message_type='from_bot'
- Связь ответа бота с активной сессией

Feature: bot-messages-tracking
Task: 4.2 Тесты для SessionManager
Validates: Requirements 2.1, 2.5, 2.6
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

from services.session_manager import SessionManager
from database.repository import SupportRepository
from database.models import SupportSession


# ============================================================================
# Фикстуры
# ============================================================================

@pytest.fixture
def mock_repository():
    """Создаёт мок SupportRepository"""
    repository = MagicMock(spec=SupportRepository)
    repository.save_message = AsyncMock(return_value=100)
    repository.get_session_by_id = AsyncMock()
    return repository


@pytest.fixture
def session_manager(mock_repository):
    """Создаёт экземпляр SessionManager"""
    return SessionManager(repository=mock_repository)


@pytest.fixture
def mock_session():
    """Создаёт мок объекта SupportSession"""
    session = MagicMock(spec=SupportSession)
    session.id = 1
    session.telegram_id = 12345
    session.status = 'active'
    session.session_type = 'chat'
    session.created_at = datetime.now(timezone.utc)
    session.last_activity = datetime.now(timezone.utc)
    return session


# ============================================================================
# Тесты для сохранения ответа бота с telegram_id=0
# ============================================================================

class TestBotMessageTelegramId:
    """
    Тесты для проверки сохранения ответа бота с telegram_id=0
    
    Validates: Requirements 2.5
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_saved_with_telegram_id_zero(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: ответ бота сохраняется с telegram_id=0 (системный идентификатор)
        
        Validates: Requirements 2.5
        """
        # Arrange
        session_id = 1
        message_text = "Привет! Я бот."
        
        # Настраиваем мок для возврата сессии
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        # Проверяем, что save_message был вызван
        mock_repository.save_message.assert_called_once()
        
        # Проверяем параметры вызова
        call_args = mock_repository.save_message.call_args
        assert call_args[1]['telegram_id'] == 0  # Системный ID для бота
        assert call_args[1]['session_id'] == session_id
        assert call_args[1]['message_text'] == message_text
    
    @pytest.mark.asyncio
    async def test_bot_message_always_uses_zero_telegram_id(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: все ответы бота используют telegram_id=0 независимо от сессии
        
        Validates: Requirements 2.5
        """
        # Arrange
        session_id = 1
        message_text = "Тестовое сообщение"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        
        # Проверяем, что telegram_id всегда 0
        assert call_args[1]['telegram_id'] == 0
        
        # Проверяем, что НЕ используется telegram_id из сессии
        assert call_args[1]['telegram_id'] != mock_session.telegram_id


# ============================================================================
# Тесты для сохранения ответа бота с message_type='from_bot'
# ============================================================================

class TestBotMessageType:
    """
    Тесты для проверки сохранения ответа бота с message_type='from_bot'
    
    Validates: Requirements 2.1
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_saved_with_correct_type(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: ответ бота сохраняется с типом 'from_bot'
        
        Validates: Requirements 2.1
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        assert call_args[1]['message_type'] == 'from_bot'
    
    @pytest.mark.asyncio
    async def test_bot_message_type_not_from_user(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: ответ бота НЕ сохраняется с типом 'from_user'
        
        Validates: Requirements 2.1
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        
        # Проверяем, что тип НЕ 'from_user'
        assert call_args[1]['message_type'] != 'from_user'
        # Проверяем, что тип НЕ 'from_support'
        assert call_args[1]['message_type'] != 'from_support'
        # Проверяем, что тип именно 'from_bot'
        assert call_args[1]['message_type'] == 'from_bot'
    
    @pytest.mark.asyncio
    async def test_bot_message_no_file_id(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: ответ бота сохраняется без file_id (только текст)
        
        Validates: Requirements 2.2
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        assert call_args[1]['file_id'] is None


# ============================================================================
# Тесты для связи ответа бота с активной сессией
# ============================================================================

class TestBotMessageSessionLink:
    """
    Тесты для проверки связи ответа бота с активной сессией
    
    Validates: Requirements 2.6
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_linked_to_session(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: ответ бота связан с активной сессией через session_id
        
        Validates: Requirements 2.6
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        # Проверяем, что get_session_by_id был вызван для проверки существования сессии
        mock_repository.get_session_by_id.assert_called_once_with(session_id)
        
        # Проверяем, что save_message был вызван с правильным session_id
        call_args = mock_repository.save_message.call_args
        assert call_args[1]['session_id'] == session_id
    
    @pytest.mark.asyncio
    async def test_bot_message_fails_if_session_not_found(
        self,
        session_manager,
        mock_repository
    ):
        """
        Тест: сохранение ответа бота завершается ошибкой, если сессия не найдена
        
        Validates: Requirements 2.6
        """
        # Arrange
        session_id = 999  # Несуществующая сессия
        message_text = "Ответ бота"
        
        # Настраиваем мок для возврата None (сессия не найдена)
        mock_repository.get_session_by_id.return_value = None
        
        # Act & Assert
        with pytest.raises(ValueError, match="Session .* not found"):
            await session_manager.save_bot_message(
                session_id=session_id,
                message_text=message_text
            )
        
        # Проверяем, что save_message НЕ был вызван
        mock_repository.save_message.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_bot_message_checks_session_before_save(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: перед сохранением ответа бота проверяется существование сессии
        
        Validates: Requirements 2.6
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        # Проверяем порядок вызовов: сначала проверка сессии, потом сохранение
        assert mock_repository.get_session_by_id.called
        assert mock_repository.save_message.called
        
        # Проверяем, что get_session_by_id был вызван ПЕРЕД save_message
        call_order = [
            call[0] for call in mock_repository.method_calls
        ]
        get_session_index = call_order.index('get_session_by_id')
        save_message_index = call_order.index('save_message')
        assert get_session_index < save_message_index


# ============================================================================
# Тесты для возврата message_id
# ============================================================================

class TestBotMessageReturnValue:
    """
    Тесты для проверки возврата message_id при сохранении
    
    Validates: Requirements 2.1
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_returns_message_id(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: save_bot_message возвращает ID созданного сообщения
        
        Validates: Requirements 2.1
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        expected_message_id = 100
        
        mock_repository.get_session_by_id.return_value = mock_session
        mock_repository.save_message.return_value = expected_message_id
        
        # Act
        result = await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        assert result == expected_message_id
    
    @pytest.mark.asyncio
    async def test_bot_message_id_is_integer(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: save_bot_message возвращает целое число (ID)
        
        Validates: Requirements 2.1
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        mock_repository.save_message.return_value = 100
        
        # Act
        result = await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        assert isinstance(result, int)
        assert result > 0


# ============================================================================
# Тесты для обработки ошибок
# ============================================================================

class TestBotMessageErrorHandling:
    """
    Тесты для проверки обработки ошибок при сохранении ответа бота
    
    Validates: Requirements 7.3, 7.4
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_raises_on_db_error(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: ошибка БД при сохранении ответа бота пробрасывается наверх
        
        Validates: Requirements 7.3, 7.4
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.return_value = mock_session
        mock_repository.save_message.side_effect = Exception("DB error")
        
        # Act & Assert
        with pytest.raises(Exception, match="DB error"):
            await session_manager.save_bot_message(
                session_id=session_id,
                message_text=message_text
            )
    
    @pytest.mark.asyncio
    async def test_bot_message_raises_on_session_check_error(
        self,
        session_manager,
        mock_repository
    ):
        """
        Тест: ошибка при проверке сессии пробрасывается наверх
        
        Validates: Requirements 7.3, 7.4
        """
        # Arrange
        session_id = 1
        message_text = "Ответ бота"
        
        mock_repository.get_session_by_id.side_effect = Exception("DB connection error")
        
        # Act & Assert
        with pytest.raises(Exception, match="DB connection error"):
            await session_manager.save_bot_message(
                session_id=session_id,
                message_text=message_text
            )


# ============================================================================
# Тесты для сохранения текстового содержимого
# ============================================================================

class TestBotMessageTextContent:
    """
    Тесты для проверки сохранения текстового содержимого
    
    Validates: Requirements 2.2
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_saves_text_content(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: текстовое содержимое ответа бота сохраняется корректно
        
        Validates: Requirements 2.2
        """
        # Arrange
        session_id = 1
        message_text = "Привет! Это ответ бота с текстом."
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        assert call_args[1]['message_text'] == message_text
    
    @pytest.mark.asyncio
    async def test_bot_message_saves_multiline_text(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: многострочный текст ответа бота сохраняется корректно
        
        Validates: Requirements 2.2
        """
        # Arrange
        session_id = 1
        message_text = """Привет!
Это многострочное сообщение.
Оно содержит несколько строк."""
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        saved_text = call_args[1]['message_text']
        
        # Проверяем, что сохранён полный текст
        assert saved_text == message_text
        # Проверяем, что переносы строк сохранены
        assert "\n" in saved_text
    
    @pytest.mark.asyncio
    async def test_bot_message_saves_text_with_special_chars(
        self,
        session_manager,
        mock_repository,
        mock_session
    ):
        """
        Тест: текст со специальными символами сохраняется корректно
        
        Validates: Requirements 2.2
        """
        # Arrange
        session_id = 1
        message_text = "Текст с эмодзи 🤖 и спецсимволами: @#$%^&*()"
        
        mock_repository.get_session_by_id.return_value = mock_session
        
        # Act
        await session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        call_args = mock_repository.save_message.call_args
        assert call_args[1]['message_text'] == message_text
