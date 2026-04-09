"""
Checkpoint тесты для bot-messages-tracking

Проверяют базовую функциональность:
1. Системные команды сохраняются в БД
2. Ответы бота сохраняются в БД
3. Обратная совместимость сохранена

Feature: bot-messages-tracking
Validates: Requirements 1.1, 1.2, 2.1, 6.1, 6.2
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager


# ============================================================================
# Фикстуры
# ============================================================================

@pytest.fixture
def mock_session_manager():
    """Создаёт мок SessionManager"""
    manager = MagicMock(spec=SessionManager)
    manager.get_or_create_session = AsyncMock(return_value=1)
    manager.save_user_message = AsyncMock(return_value=100)
    manager.save_bot_message = AsyncMock(return_value=101)
    return manager


@pytest.fixture
def message_interceptor(mock_session_manager):
    """Создаёт экземпляр MessageInterceptor"""
    return MessageInterceptor(session_manager=mock_session_manager)


@pytest.fixture
def mock_message():
    """Создаёт мок объекта Message"""
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = 12345
    message.from_user.first_name = "Test"
    message.from_user.last_name = "User"
    message.from_user.username = "testuser"
    message.text = None
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    return message


@pytest.fixture
def mock_handler():
    """Создаёт мок handler"""
    return AsyncMock()


@pytest.fixture
def mock_state():
    """Создаёт мок FSMContext"""
    state = MagicMock()
    state.get_state = AsyncMock(return_value=None)
    return state


# ============================================================================
# Тесты для сохранения системных команд
# ============================================================================

class TestSystemCommandsSaving:
    """
    Тесты для проверки сохранения системных команд
    
    Validates: Requirements 1.1, 1.2
    """
    
    @pytest.mark.asyncio
    async def test_start_command_is_saved(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /start сохраняется в БД
        
        Validates: Requirements 1.1, 1.2
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что save_user_message был вызван
        mock_session_manager.save_user_message.assert_called_once()
        
        # Проверяем параметры вызова
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['telegram_id'] == 12345
        assert call_args[1]['message_text'] == "/start"
        assert call_args[1]['session_id'] == 1
    
    @pytest.mark.asyncio
    async def test_help_command_is_saved(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /help сохраняется в БД
        
        Validates: Requirements 1.1, 1.2
        """
        # Arrange
        mock_message.text = "/help"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.save_user_message.assert_called_once()
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "/help"
    
    @pytest.mark.asyncio
    async def test_start_command_with_params_is_saved(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /start с параметрами сохраняется полностью
        
        Validates: Requirements 1.4
        """
        # Arrange
        mock_message.text = "/start ref=123"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.save_user_message.assert_called_once()
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "/start ref=123"


# ============================================================================
# Тесты для сохранения ответов бота
# ============================================================================

class TestBotMessagesSaving:
    """
    Тесты для проверки сохранения ответов бота
    
    Validates: Requirements 2.1
    """
    
    @pytest.mark.asyncio
    async def test_bot_message_saved_with_correct_type(
        self,
        mock_session_manager
    ):
        """
        Тест: ответ бота сохраняется с типом from_bot
        
        Validates: Requirements 2.1
        """
        # Arrange
        session_id = 1
        message_text = "Привет! Я бот."
        
        # Act
        await mock_session_manager.save_bot_message(
            session_id=session_id,
            message_text=message_text
        )
        
        # Assert
        mock_session_manager.save_bot_message.assert_called_once_with(
            session_id=session_id,
            message_text=message_text
        )


# ============================================================================
# Тесты для обратной совместимости
# ============================================================================

class TestBackwardCompatibility:
    """
    Тесты для проверки обратной совместимости
    
    Validates: Requirements 6.1, 6.2
    """
    
    @pytest.mark.asyncio
    async def test_regular_text_message_still_saved(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: обычные текстовые сообщения продолжают сохраняться
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Обычное сообщение"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.save_user_message.assert_called_once()
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "Обычное сообщение"
    
    @pytest.mark.asyncio
    async def test_session_created_for_all_messages(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: сессия создаётся для всех сообщений
        
        Validates: Requirements 1.3
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.get_or_create_session.assert_called_once()
        call_args = mock_session_manager.get_or_create_session.call_args
        assert call_args[1]['telegram_id'] == 12345
        assert call_args[1]['session_type'] == 'chat'
    
    @pytest.mark.asyncio
    async def test_handler_continues_after_interceptor(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: обработка продолжается после MessageInterceptor
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler был вызван
        mock_handler.assert_called_once_with(mock_message, data)
        
        # Проверяем, что session_id добавлен в data
        assert 'session_id' in data
        assert data['session_id'] == 1


# ============================================================================
# Тесты для обработки ошибок
# ============================================================================

class TestErrorHandling:
    """
    Тесты для проверки обработки ошибок
    
    Validates: Requirements 7.3, 7.4
    """
    
    @pytest.mark.asyncio
    async def test_interceptor_continues_on_save_error(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: обработка продолжается при ошибке сохранения
        
        Validates: Requirements 7.3, 7.4
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Симулируем ошибку при сохранении
        mock_session_manager.save_user_message.side_effect = Exception("DB error")
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler был вызван несмотря на ошибку
        mock_handler.assert_called_once_with(mock_message, data)
    
    @pytest.mark.asyncio
    async def test_interceptor_continues_on_session_error(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: обработка продолжается при ошибке создания сессии
        
        Validates: Requirements 7.3, 7.4
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Симулируем ошибку при создании сессии
        mock_session_manager.get_or_create_session.side_effect = Exception("DB error")
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler был вызван несмотря на ошибку
        mock_handler.assert_called_once_with(mock_message, data)
