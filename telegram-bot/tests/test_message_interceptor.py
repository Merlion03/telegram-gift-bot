"""
Unit-тесты для MessageInterceptor

Проверяют конкретные сценарии работы middleware для перехвата сообщений
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, PhotoSize, Document, Video, Audio, Voice

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager
from database.repository import SupportRepository


def create_mock_user(telegram_id: int) -> User:
    """Создаёт mock объект User"""
    user = MagicMock(spec=User)
    user.id = telegram_id
    return user


def create_text_message(telegram_id: int, text: str) -> Message:
    """Создаёт mock текстового сообщения"""
    message = MagicMock(spec=Message)
    message.from_user = create_mock_user(telegram_id)
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    return message


def create_photo_message(telegram_id: int, file_id: str, caption: str = None) -> Message:
    """Создаёт mock сообщения с фото"""
    message = MagicMock(spec=Message)
    message.from_user = create_mock_user(telegram_id)
    message.text = None
    message.caption = caption
    
    # Создаём mock для фото (список разных размеров)
    photo1 = MagicMock(spec=PhotoSize)
    photo1.file_id = file_id + "_small"
    photo2 = MagicMock(spec=PhotoSize)
    photo2.file_id = file_id  # Самое большое разрешение
    message.photo = [photo1, photo2]
    
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    return message


def create_document_message(telegram_id: int, file_id: str, caption: str = None) -> Message:
    """Создаёт mock сообщения с документом"""
    message = MagicMock(spec=Message)
    message.from_user = create_mock_user(telegram_id)
    message.text = None
    message.caption = caption
    message.photo = None
    
    document = MagicMock(spec=Document)
    document.file_id = file_id
    message.document = document
    
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    return message


@pytest.mark.asyncio
async def test_intercept_text_message():
    """
    Тестирует перехват текстового сообщения
    
    Validates: Requirements 1.1, 2.1
    """
    # Arrange
    telegram_id = 123456789
    message_text = "Привет, бот!"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    expected_session_id = 42
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    session_manager.save_user_message = AsyncMock(return_value=100)
    
    interceptor = MessageInterceptor(session_manager)
    message = create_text_message(telegram_id, message_text)
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    session_manager.get_or_create_session.assert_called_once_with(
        telegram_id=telegram_id,
        session_type='chat'
    )
    session_manager.save_user_message.assert_called_once_with(
        session_id=expected_session_id,
        telegram_id=telegram_id,
        message_text=message_text,
        file_id=None
    )
    assert data['session_id'] == expected_session_id
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_create_session_on_first_message():
    """
    Тестирует создание сессии при первом сообщении пользователя
    
    Validates: Requirements 1.1
    """
    # Arrange
    telegram_id = 987654321
    message_text = "Первое сообщение"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    # Имитируем создание новой сессии
    new_session_id = 1
    session_manager.get_or_create_session = AsyncMock(return_value=new_session_id)
    session_manager.save_user_message = AsyncMock(return_value=1)
    
    interceptor = MessageInterceptor(session_manager)
    message = create_text_message(telegram_id, message_text)
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    # Проверяем, что была попытка получить/создать сессию
    session_manager.get_or_create_session.assert_called_once()
    # Проверяем, что session_id добавлен в контекст
    assert 'session_id' in data
    assert data['session_id'] == new_session_id


@pytest.mark.asyncio
async def test_save_photo_message():
    """
    Тестирует сохранение сообщения с фото
    
    Validates: Requirements 2.2
    """
    # Arrange
    telegram_id = 111222333
    file_id = "AgACAgIAAxkBAAIBY2Z"
    caption = "Смотри какое фото!"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    expected_session_id = 10
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    session_manager.save_user_message = AsyncMock(return_value=50)
    
    interceptor = MessageInterceptor(session_manager)
    message = create_photo_message(telegram_id, file_id, caption)
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    session_manager.save_user_message.assert_called_once_with(
        session_id=expected_session_id,
        telegram_id=telegram_id,
        message_text=caption,  # Caption используется как текст
        file_id=file_id  # Берётся последний (самый большой) file_id
    )


@pytest.mark.asyncio
async def test_save_photo_without_caption():
    """
    Тестирует сохранение фото без caption
    
    Validates: Requirements 2.2
    """
    # Arrange
    telegram_id = 444555666
    file_id = "AgACAgIAAxkBAAIBY2Z"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    expected_session_id = 20
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    session_manager.save_user_message = AsyncMock(return_value=60)
    
    interceptor = MessageInterceptor(session_manager)
    message = create_photo_message(telegram_id, file_id, caption=None)
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    session_manager.save_user_message.assert_called_once()
    call_args = session_manager.save_user_message.call_args
    
    # Для фото без caption должен быть текст "[Фото]"
    assert call_args.kwargs['message_text'] == "[Фото]"
    assert call_args.kwargs['file_id'] == file_id


@pytest.mark.asyncio
async def test_save_document_message():
    """
    Тестирует сохранение сообщения с документом
    
    Validates: Requirements 2.2
    """
    # Arrange
    telegram_id = 777888999
    file_id = "BQACAgIAAxkBAAIBY2Z"
    caption = "Важный документ"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    expected_session_id = 30
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    session_manager.save_user_message = AsyncMock(return_value=70)
    
    interceptor = MessageInterceptor(session_manager)
    message = create_document_message(telegram_id, file_id, caption)
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    session_manager.save_user_message.assert_called_once_with(
        session_id=expected_session_id,
        telegram_id=telegram_id,
        message_text=caption,
        file_id=file_id
    )


@pytest.mark.asyncio
async def test_filter_system_command_start():
    """
    Тестирует фильтрацию системной команды /start
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 123456789
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    session_manager.get_or_create_session = AsyncMock()
    session_manager.save_user_message = AsyncMock()
    
    interceptor = MessageInterceptor(session_manager)
    message = create_text_message(telegram_id, "/start")
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    # Системная команда не должна создавать сессию или сохранять сообщение
    session_manager.get_or_create_session.assert_not_called()
    session_manager.save_user_message.assert_not_called()
    # Handler должен быть вызван
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_filter_system_command_help():
    """
    Тестирует фильтрацию системной команды /help
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 987654321
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    session_manager.get_or_create_session = AsyncMock()
    session_manager.save_user_message = AsyncMock()
    
    interceptor = MessageInterceptor(session_manager)
    message = create_text_message(telegram_id, "/help")
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    session_manager.get_or_create_session.assert_not_called()
    session_manager.save_user_message.assert_not_called()
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_error_handling_session_creation():
    """
    Тестирует обработку ошибки при создании сессии без блокировки бота
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 111222333
    message_text = "Тестовое сообщение"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    # Имитируем ошибку при создании сессии
    session_manager.get_or_create_session = AsyncMock(
        side_effect=Exception("Database connection error")
    )
    
    interceptor = MessageInterceptor(session_manager)
    message = create_text_message(telegram_id, message_text)
    handler = AsyncMock(return_value="handler_result")
    data = {}
    
    # Act
    result = await interceptor(handler, message, data)
    
    # Assert
    # Несмотря на ошибку, handler должен быть вызван
    handler.assert_called_once()
    assert result == "handler_result"
    # session_id не должен быть в контексте
    assert 'session_id' not in data


@pytest.mark.asyncio
async def test_error_handling_message_save():
    """
    Тестирует обработку ошибки при сохранении сообщения без блокировки бота
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 444555666
    message_text = "Тестовое сообщение"
    
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    expected_session_id = 42
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    
    # Имитируем ошибку при сохранении сообщения
    session_manager.save_user_message = AsyncMock(
        side_effect=Exception("Failed to save message")
    )
    
    interceptor = MessageInterceptor(session_manager)
    message = create_text_message(telegram_id, message_text)
    handler = AsyncMock(return_value="handler_result")
    data = {}
    
    # Act
    result = await interceptor(handler, message, data)
    
    # Assert
    # Несмотря на ошибку сохранения, handler должен быть вызван
    handler.assert_called_once()
    assert result == "handler_result"
    # session_id должен быть в контексте (сессия создана успешно)
    assert data['session_id'] == expected_session_id


@pytest.mark.asyncio
async def test_message_without_user():
    """
    Тестирует обработку сообщения без пользователя (edge case)
    """
    # Arrange
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    session_manager.get_or_create_session = AsyncMock()
    session_manager.save_user_message = AsyncMock()
    
    interceptor = MessageInterceptor(session_manager)
    
    # Создаём сообщение без пользователя
    message = MagicMock(spec=Message)
    message.from_user = None
    
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    # Сообщение без пользователя должно быть пропущено
    session_manager.get_or_create_session.assert_not_called()
    session_manager.save_user_message.assert_not_called()
    handler.assert_called_once()
