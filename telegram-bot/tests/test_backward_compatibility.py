"""
Unit-тесты для обратной совместимости

Проверяют:
- Сохранение обычных текстовых сообщений
- Сохранение медиа-сообщений с file_id
- Работу режима поддержки

Feature: bot-messages-tracking
Task: 4.3 Тесты для обратной совместимости
Validates: Requirements 6.1, 6.2, 6.3
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, PhotoSize

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
    message.from_user.first_name = "Тест"
    message.from_user.last_name = "Пользователь"
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


@pytest.fixture
def mock_support_state():
    """Создаёт мок FSMContext в режиме поддержки"""
    from fsm.states import SupportStates
    
    state = MagicMock()
    state.get_state = AsyncMock(return_value=SupportStates.in_support)
    return state


# ============================================================================
# Тесты для сохранения обычных текстовых сообщений
# ============================================================================

class TestRegularTextMessages:
    """
    Тесты для проверки сохранения обычных текстовых сообщений
    
    Validates: Requirements 6.1
    """
    
    @pytest.mark.asyncio
    async def test_regular_text_message_is_saved(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: обычное текстовое сообщение сохраняется корректно
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Обычное текстовое сообщение"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что save_user_message был вызван
        mock_session_manager.save_user_message.assert_called_once()
        
        # Проверяем параметры вызова
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "Обычное текстовое сообщение"
        assert call_args[1]['telegram_id'] == 12345
        assert call_args[1]['session_id'] == 1
    
    @pytest.mark.asyncio
    async def test_text_message_with_emoji(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: текстовое сообщение с эмодзи сохраняется корректно
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Привет! 👋 Как дела? 😊"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "Привет! 👋 Как дела? 😊"
    
    @pytest.mark.asyncio
    async def test_multiline_text_message(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: многострочное текстовое сообщение сохраняется корректно
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = """Первая строка
Вторая строка
Третья строка"""
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        call_args = mock_session_manager.save_user_message.call_args
        saved_text = call_args[1]['message_text']
        
        # Проверяем, что переносы строк сохранены
        assert "\n" in saved_text
        assert "Первая строка" in saved_text
        assert "Вторая строка" in saved_text
        assert "Третья строка" in saved_text
    
    @pytest.mark.asyncio
    async def test_text_message_with_special_characters(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: текстовое сообщение со специальными символами сохраняется корректно
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Текст с символами: @#$%^&*()_+-=[]{}|;':\",./<>?"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        call_args = mock_session_manager.save_user_message.call_args
        assert call_args[1]['message_text'] == "Текст с символами: @#$%^&*()_+-=[]{}|;':\",./<>?"
    
    @pytest.mark.asyncio
    async def test_session_created_for_text_message(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: сессия создаётся для обычного текстового сообщения
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Обычное сообщение"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.get_or_create_session.assert_called_once()
        call_args = mock_session_manager.get_or_create_session.call_args
        assert call_args[1]['telegram_id'] == 12345


# ============================================================================
# Тесты для сохранения медиа-сообщений
# ============================================================================

class TestMediaMessages:
    """
    Тесты для проверки сохранения медиа-сообщений с file_id
    
    Validates: Requirements 6.2
    
    Примечание: Медиа-сообщения НЕ сохраняются в MessageInterceptor,
    они обрабатываются в MediaHandler. Здесь проверяем, что они пропускаются.
    """
    
    @pytest.mark.asyncio
    async def test_photo_message_not_saved_in_interceptor(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: фото-сообщение НЕ сохраняется в MessageInterceptor
        (будет обработано в MediaHandler)
        
        Validates: Requirements 6.2
        """
        # Arrange
        photo = MagicMock(spec=PhotoSize)
        photo.file_id = "photo_file_id_123"
        mock_message.photo = [photo]
        mock_message.caption = "Подпись к фото"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что save_user_message НЕ был вызван (медиа обрабатывается отдельно)
        mock_session_manager.save_user_message.assert_not_called()
        
        # Проверяем, что сессия всё равно создана
        mock_session_manager.get_or_create_session.assert_called_once()
        
        # Проверяем, что handler был вызван
        mock_handler.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_document_message_not_saved_in_interceptor(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: документ НЕ сохраняется в MessageInterceptor
        (будет обработан в MediaHandler)
        
        Validates: Requirements 6.2
        """
        # Arrange
        document = MagicMock()
        document.file_id = "document_file_id_456"
        mock_message.document = document
        mock_message.caption = "Подпись к документу"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что save_user_message НЕ был вызван
        mock_session_manager.save_user_message.assert_not_called()
        
        # Проверяем, что сессия создана
        mock_session_manager.get_or_create_session.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_video_message_not_saved_in_interceptor(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: видео НЕ сохраняется в MessageInterceptor
        (будет обработано в MediaHandler)
        
        Validates: Requirements 6.2
        """
        # Arrange
        video = MagicMock()
        video.file_id = "video_file_id_789"
        mock_message.video = video
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.save_user_message.assert_not_called()
        mock_session_manager.get_or_create_session.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_session_created_for_media_message(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: сессия создаётся для медиа-сообщения
        
        Validates: Requirements 6.2
        """
        # Arrange
        photo = MagicMock(spec=PhotoSize)
        photo.file_id = "photo_file_id_123"
        mock_message.photo = [photo]
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.get_or_create_session.assert_called_once()
        call_args = mock_session_manager.get_or_create_session.call_args
        assert call_args[1]['telegram_id'] == 12345


# ============================================================================
# Тесты для режима поддержки
# ============================================================================

class TestSupportMode:
    """
    Тесты для проверки работы режима поддержки
    
    Validates: Requirements 6.3
    """
    
    @pytest.mark.asyncio
    async def test_message_not_saved_in_support_mode(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_support_state
    ):
        """
        Тест: сообщение НЕ сохраняется в MessageInterceptor в режиме поддержки
        (будет сохранено в SupportHandler)
        
        Validates: Requirements 6.3
        """
        # Arrange
        mock_message.text = "Сообщение в режиме поддержки"
        data = {'state': mock_support_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что save_user_message НЕ был вызван
        mock_session_manager.save_user_message.assert_not_called()
        
        # Проверяем, что сессия всё равно создана
        mock_session_manager.get_or_create_session.assert_called_once()
        
        # Проверяем, что handler был вызван
        mock_handler.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_session_created_in_support_mode(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_support_state
    ):
        """
        Тест: сессия создаётся в режиме поддержки
        
        Validates: Requirements 6.3
        """
        # Arrange
        mock_message.text = "Сообщение в режиме поддержки"
        data = {'state': mock_support_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_session_manager.get_or_create_session.assert_called_once()
        call_args = mock_session_manager.get_or_create_session.call_args
        assert call_args[1]['telegram_id'] == 12345
        assert call_args[1]['session_type'] == 'chat'
    
    @pytest.mark.asyncio
    async def test_session_id_added_to_context_in_support_mode(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_support_state
    ):
        """
        Тест: session_id добавляется в контекст в режиме поддержки
        
        Validates: Requirements 6.3
        """
        # Arrange
        mock_message.text = "Сообщение в режиме поддержки"
        data = {'state': mock_support_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что session_id добавлен в data
        assert 'session_id' in data
        assert data['session_id'] == 1
    
    @pytest.mark.asyncio
    async def test_handler_continues_in_support_mode(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_support_state
    ):
        """
        Тест: обработка продолжается в режиме поддержки
        
        Validates: Requirements 6.3
        """
        # Arrange
        mock_message.text = "Сообщение в режиме поддержки"
        data = {'state': mock_support_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler был вызван
        mock_handler.assert_called_once_with(mock_message, data)


# ============================================================================
# Тесты для обработки сообщений без пользователя
# ============================================================================

class TestMessagesWithoutUser:
    """
    Тесты для проверки обработки сообщений без пользователя
    
    Validates: Requirements 6.1
    """
    
    @pytest.mark.asyncio
    async def test_message_without_user_skipped(
        self,
        message_interceptor,
        mock_session_manager,
        mock_handler,
        mock_state
    ):
        """
        Тест: сообщение без пользователя пропускается
        
        Validates: Requirements 6.1
        """
        # Arrange
        message = MagicMock(spec=Message)
        message.from_user = None  # Нет пользователя
        message.text = "Сообщение без пользователя"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, message, data)
        
        # Assert
        # Проверяем, что save_user_message НЕ был вызван
        mock_session_manager.save_user_message.assert_not_called()
        
        # Проверяем, что get_or_create_session НЕ был вызван
        mock_session_manager.get_or_create_session.assert_not_called()
        
        # Проверяем, что handler был вызван
        mock_handler.assert_called_once()


# ============================================================================
# Тесты для передачи управления handler
# ============================================================================

class TestHandlerExecution:
    """
    Тесты для проверки передачи управления handler
    
    Validates: Requirements 6.1
    """
    
    @pytest.mark.asyncio
    async def test_handler_always_called(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: handler всегда вызывается после interceptor
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Любое сообщение"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        mock_handler.assert_called_once_with(mock_message, data)
    
    @pytest.mark.asyncio
    async def test_handler_called_even_on_error(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: handler вызывается даже при ошибке сохранения
        
        Validates: Requirements 6.1, 7.3, 7.4
        """
        # Arrange
        mock_message.text = "Сообщение"
        data = {'state': mock_state}
        
        # Симулируем ошибку при сохранении
        mock_session_manager.save_user_message.side_effect = Exception("DB error")
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler был вызван несмотря на ошибку
        mock_handler.assert_called_once_with(mock_message, data)
    
    @pytest.mark.asyncio
    async def test_handler_receives_correct_data(
        self,
        message_interceptor,
        mock_session_manager,
        mock_message,
        mock_handler,
        mock_state
    ):
        """
        Тест: handler получает корректные данные с session_id
        
        Validates: Requirements 6.1
        """
        # Arrange
        mock_message.text = "Сообщение"
        data = {'state': mock_state}
        
        # Act
        await message_interceptor(mock_handler, mock_message, data)
        
        # Assert
        # Проверяем, что handler получил data с session_id
        call_args = mock_handler.call_args
        passed_data = call_args[0][1]
        assert 'session_id' in passed_data
        assert passed_data['session_id'] == 1
        assert 'state' in passed_data
