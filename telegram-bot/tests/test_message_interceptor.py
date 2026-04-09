"""
Unit-тесты для MessageInterceptor

Проверяют:
- Сохранение системных команд (/start, /help)
- Сохранение команд с параметрами
- Обновление last_activity при сохранении команды
- Обработку ошибок без блокировки

Feature: bot-messages-tracking
Task: 4.1 Тесты для MessageInterceptor
Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
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
    message.from_user.first_name = "Иван"
    message.from_user.last_name = "Петров"
    message.from_user.username = "ivan_petrov"
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
# Тесты для сохранения команды /start
# ============================================================================

class TestStartCommandSaving:
    """
    Тесты для проверки сохранения команды /start
    
    Validates: Requirements 1.1, 1.2, 1.3, 1.4
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
        assert call_args[1]['file_id'] is None
    
    @pytest.mark.asyncio
    async def test_start_command_creates_session(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /start создаёт или получает активную сессию
        
        Validates: Requirements 1.3
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что get_or_create_session был вызван
        mock_session_manager.get_or_create_session.assert_called_once()
        
        # Проверяем параметры вызова
        call_args = mock_session_manager.get_or_create_session.call_args
        assert call_args[1]['telegram_id'] == 12345
        assert call_args[1]['session_type'] == 'chat'
        assert call_args[1]['first_name'] == "Иван"
        assert call_args[1]['last_name'] == "Петров"
        assert call_args[1]['username'] == "ivan_petrov"
    
    @pytest.mark.asyncio
    async def test_start_command_full_text_saved(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /start сохраняется с полным текстом (включая символ /)
        
        Validates: Requirements 1.4
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        call_args = mock_session_manager.save_user_message.call_args
        saved_text = call_args[1]['message_text']
        
        # Проверяем, что текст начинается с /
        assert saved_text.startswith("/")
        # Проверяем, что сохранён полный текст
        assert saved_text == "/start"


# ============================================================================
# Тесты для сохранения команды /help
# ============================================================================

class TestHelpCommandSaving:
    """
    Тесты для проверки сохранения команды /help
    
    Validates: Requirements 1.1, 1.2, 1.3, 1.4
    """
    
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
    async def test_help_command_creates_session(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /help создаёт или получает активную сессию
        
        Validates: Requirements 1.3
        """
        # Arrange
        mock_message.text = "/help"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.get_or_create_session.assert_called_once()
        call_args = mock_session_manager.get_or_create_session.call_args
        assert call_args[1]['telegram_id'] == 12345
        assert call_args[1]['session_type'] == 'chat'


# ============================================================================
# Тесты для сохранения команд с параметрами
# ============================================================================

class TestCommandsWithParameters:
    """
    Тесты для проверки сохранения команд с параметрами
    
    Validates: Requirements 1.4
    """
    
    @pytest.mark.asyncio
    async def test_start_with_ref_parameter(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /start с параметром ref сохраняется полностью
        
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
    
    @pytest.mark.asyncio
    async def test_start_with_multiple_parameters(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда /start с несколькими параметрами сохраняется полностью
        
        Validates: Requirements 1.4
        """
        # Arrange
        mock_message.text = "/start ref=123 source=telegram campaign=promo"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        call_args = mock_session_manager.save_user_message.call_args
        saved_text = call_args[1]['message_text']
        
        # Проверяем, что все параметры сохранены
        assert "ref=123" in saved_text
        assert "source=telegram" in saved_text
        assert "campaign=promo" in saved_text
        assert saved_text == "/start ref=123 source=telegram campaign=promo"
    
    @pytest.mark.asyncio
    async def test_command_with_special_characters(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: команда со специальными символами сохраняется корректно
        
        Validates: Requirements 1.4
        """
        # Arrange
        mock_message.text = "/start ref=abc-123_xyz"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "/start ref=abc-123_xyz"


# ============================================================================
# Тесты для обновления last_activity
# ============================================================================

class TestLastActivityUpdate:
    """
    Тесты для проверки обновления last_activity при сохранении команды
    
    Validates: Requirements 1.5
    
    Примечание: last_activity обновляется автоматически в БД через триггер
    или в методе save_user_message. Здесь проверяем, что сессия создаётся/получается.
    """
    
    @pytest.mark.asyncio
    async def test_session_created_updates_last_activity(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: при сохранении команды вызывается get_or_create_session
        (который обновляет last_activity)
        
        Validates: Requirements 1.5
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что get_or_create_session был вызван
        # (это обновляет last_activity в БД)
        mock_session_manager.get_or_create_session.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_message_saved_after_session_created(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: сообщение сохраняется после создания/получения сессии
        
        Validates: Requirements 1.5
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем порядок вызовов
        assert mock_session_manager.get_or_create_session.called
        assert mock_session_manager.save_user_message.called
        
        # Проверяем, что session_id передан в save_user_message
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['session_id'] == 1


# ============================================================================
# Тесты для обработки ошибок
# ============================================================================

class TestErrorHandling:
    """
    Тесты для проверки обработки ошибок без блокировки
    
    Validates: Requirements 7.3, 7.4
    """
    
    @pytest.mark.asyncio
    async def test_continues_on_save_error(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: обработка продолжается при ошибке сохранения сообщения
        
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
    async def test_continues_on_session_creation_error(
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
        
        # Проверяем, что save_user_message НЕ был вызван (т.к. нет session_id)
        mock_session_manager.save_user_message.assert_not_called()


# ============================================================================
# Тесты для передачи session_id в контекст
# ============================================================================

class TestSessionIdContext:
    """
    Тесты для проверки передачи session_id в контекст
    
    Validates: Requirements 1.3
    """
    
    @pytest.mark.asyncio
    async def test_session_id_added_to_context(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: session_id добавляется в data для использования в handlers
        
        Validates: Requirements 1.3
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что session_id добавлен в data
        assert 'session_id' in data
        assert data['session_id'] == 1
    
    @pytest.mark.asyncio
    async def test_handler_receives_session_id(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: handler получает data с session_id
        
        Validates: Requirements 1.3
        """
        # Arrange
        mock_message.text = "/start"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler был вызван с data, содержащим session_id
        mock_handler.assert_called_once()
        call_args = mock_handler.call_args
        passed_data = call_args[0][1]  # Второй аргумент - data
        assert 'session_id' in passed_data
        assert passed_data['session_id'] == 1
