"""
Интеграционный тест для AdminStartHandler с CommonHandler

Проверяет корректность интеграции проверки администраторов в существующий /start handler
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User

from handlers.common_handler import CommonHandler
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
    """Создаёт AdminStartHandler"""
    return AdminStartHandler(
        admin_repository=mock_admin_repository,
        session_manager=mock_session_manager,
        webapp_url="https://test.example.com/admin"
    )


@pytest.fixture
def common_handler(mock_session_manager, admin_start_handler):
    """Создаёт CommonHandler с AdminStartHandler"""
    return CommonHandler(
        session_manager=mock_session_manager,
        admin_start_handler=admin_start_handler
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
async def test_common_handler_admin_flow(
    common_handler,
    mock_admin_repository,
    mock_message
):
    """
    Тест: CommonHandler корректно обрабатывает администратора
    
    Validates: Requirements 4.1, 4.2
    """
    # Arrange
    mock_admin_repository.exists.return_value = True
    
    # Act
    await common_handler.handle_start(mock_message)
    
    # Assert
    mock_admin_repository.exists.assert_called_once_with(123456789)
    # Должна быть отправлена админ-клавиатура
    assert mock_message.answer.call_count == 1


@pytest.mark.asyncio
async def test_common_handler_regular_user_flow(
    common_handler,
    mock_admin_repository,
    mock_message
):
    """
    Тест: CommonHandler корректно обрабатывает обычного пользователя
    
    Validates: Requirements 3.1, 3.2
    """
    # Arrange
    mock_admin_repository.exists.return_value = False
    
    # Act
    await common_handler.handle_start(mock_message)
    
    # Assert
    mock_admin_repository.exists.assert_called_once_with(123456789)
    # Для обычного пользователя должна быть отправлена обычная клавиатура
    assert mock_message.answer.call_count == 1


@pytest.mark.asyncio
async def test_common_handler_database_error_fallback(
    common_handler,
    mock_admin_repository,
    mock_message
):
    """
    Тест: при ошибке БД запускается Standard Flow
    
    Validates: Requirements 3.2
    """
    # Arrange
    mock_admin_repository.exists.side_effect = Exception("Database error")
    
    # Act
    await common_handler.handle_start(mock_message)
    
    # Assert
    # При ошибке должен запуститься Standard Flow
    assert mock_message.answer.call_count == 1


@pytest.mark.asyncio
async def test_common_handler_without_admin_handler(mock_session_manager, mock_message):
    """
    Тест: CommonHandler работает без AdminStartHandler (обратная совместимость)
    """
    # Arrange
    common_handler = CommonHandler(session_manager=mock_session_manager)
    
    # Act
    await common_handler.handle_start(mock_message)
    
    # Assert
    # Должен запуститься Standard Flow
    assert mock_message.answer.call_count == 1
