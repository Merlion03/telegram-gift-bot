"""
Unit-тесты для AdminStartHandler

Проверяет корректность обработки команды /start для администраторов и обычных пользователей
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User

from handlers.admin_start_handler import AdminStartHandler
from database.repositories.admin_repository import AdminRepository
from services.session_manager import SessionManager


@pytest.fixture
def mock_admin_repository():
    """Создаёт mock AdminRepository"""
    repo = AsyncMock(spec=AdminRepository)
    return repo


@pytest.fixture
def mock_session_manager():
    """Создаёт mock SessionManager"""
    manager = AsyncMock(spec=SessionManager)
    return manager


@pytest.fixture
def admin_start_handler(mock_admin_repository, mock_session_manager):
    """Создаёт экземпляр AdminStartHandler с mock зависимостями"""
    return AdminStartHandler(
        admin_repository=mock_admin_repository,
        session_manager=mock_session_manager,
        webapp_url="https://test.example.com/admin"
    )


@pytest.fixture
def mock_message():
    """Создаёт mock Message"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = 123456789
    message.from_user.username = "test_user"
    message.from_user.first_name = "Test"
    message.answer = AsyncMock()
    return message


@pytest.mark.asyncio
async def test_handle_start_admin_user(admin_start_handler, mock_admin_repository, mock_message):
    """
    Тест: администратор получает Reply Keyboard с WebApp кнопкой
    
    Validates: Requirements 4.1, 4.2, 4.3
    """
    # Arrange
    mock_admin_repository.exists.return_value = True
    
    # Act
    result = await admin_start_handler.handle_start(mock_message)
    
    # Assert
    assert result is True, "Должен вернуть True для администратора"
    mock_admin_repository.exists.assert_called_once_with(123456789)
    mock_message.answer.assert_called_once()
    
    # Проверяем, что отправлена клавиатура с WebApp
    call_kwargs = mock_message.answer.call_args.kwargs
    assert 'reply_markup' in call_kwargs
    keyboard = call_kwargs['reply_markup']
    assert keyboard is not None


@pytest.mark.asyncio
async def test_handle_start_regular_user(admin_start_handler, mock_admin_repository, mock_message):
    """
    Тест: обычный пользователь не получает админ-клавиатуру
    
    Validates: Requirements 3.1, 3.2
    """
    # Arrange
    mock_admin_repository.exists.return_value = False
    
    # Act
    result = await admin_start_handler.handle_start(mock_message)
    
    # Assert
    assert result is False, "Должен вернуть False для обычного пользователя"
    mock_admin_repository.exists.assert_called_once_with(123456789)
    mock_message.answer.assert_not_called()


@pytest.mark.asyncio
async def test_handle_start_database_error_fallback(admin_start_handler, mock_admin_repository, mock_message):
    """
    Тест: при ошибке БД запускается Standard Flow
    
    Validates: Requirements 3.2
    """
    # Arrange
    mock_admin_repository.exists.side_effect = Exception("Database connection error")
    
    # Act
    result = await admin_start_handler.handle_start(mock_message)
    
    # Assert
    assert result is False, "Должен вернуть False при ошибке БД"
    mock_admin_repository.exists.assert_called_once_with(123456789)
    mock_message.answer.assert_not_called()


@pytest.mark.asyncio
async def test_handle_start_saves_bot_message_with_session(
    admin_start_handler,
    mock_admin_repository,
    mock_session_manager,
    mock_message
):
    """
    Тест: сохранение ответа бота при наличии session_id
    """
    # Arrange
    mock_admin_repository.exists.return_value = True
    session_id = 42
    
    # Act
    result = await admin_start_handler.handle_start(mock_message, session_id)
    
    # Assert
    assert result is True
    mock_session_manager.save_bot_message.assert_called_once()
    call_kwargs = mock_session_manager.save_bot_message.call_args.kwargs
    assert call_kwargs['session_id'] == session_id
