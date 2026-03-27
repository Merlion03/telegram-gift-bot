"""
Property-based тесты для MessageInterceptor

Проверяют универсальные свойства корректности middleware для перехвата сообщений
"""
import pytest
from hypothesis import given, settings, strategies as st
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager
from database.repository import SupportRepository


# Стратегии генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
message_texts = st.text(min_size=1, max_size=4000)
file_ids = st.text(min_size=10, max_size=100).filter(lambda x: x.isalnum())


def create_mock_message(telegram_id: int, text: str = None, file_id: str = None) -> Message:
    """
    Создаёт mock объект Message для тестирования
    
    Args:
        telegram_id: Telegram ID пользователя
        text: Текст сообщения (опционально)
        file_id: ID файла для медиа (опционально)
        
    Returns:
        Mock объект Message
    """
    message = MagicMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.first_name = "TestUser"
    message.from_user.last_name = "TestLastName"
    message.from_user.username = "test_username"
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    
    # Если есть file_id, создаём mock для фото
    if file_id:
        photo_mock = MagicMock()
        photo_mock.file_id = file_id
        message.photo = [photo_mock]
        message.text = None
    
    return message


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    message_text=message_texts
)
async def test_property_5_save_text_messages(telegram_id, message_text):
    """
    Feature: admin-chat-persistence, Property 5: Сохранение текстовых сообщений пользователя
    
    For any текстового сообщения от пользователя, система должна сохранить его
    в базу данных с правильным session_id, telegram_id и типом 'from_user'.
    
    Validates: Requirements 2.1
    """
    # Arrange
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    # Mock для get_or_create_session
    expected_session_id = 42
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    
    # Mock для save_user_message
    expected_message_id = 100
    session_manager.save_user_message = AsyncMock(return_value=expected_message_id)
    
    # Создаём interceptor
    interceptor = MessageInterceptor(session_manager)
    
    # Создаём mock сообщение
    message = create_mock_message(telegram_id=telegram_id, text=message_text)
    
    # Mock handler
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    # Проверяем, что сессия была создана/получена
    session_manager.get_or_create_session.assert_called_once_with(
        telegram_id=telegram_id,
        session_type='chat'
    )
    
    # Проверяем, что сообщение было сохранено
    session_manager.save_user_message.assert_called_once_with(
        session_id=expected_session_id,
        telegram_id=telegram_id,
        message_text=message_text,
        file_id=None
    )
    
    # Проверяем, что session_id добавлен в контекст
    assert data['session_id'] == expected_session_id
    
    # Проверяем, что handler был вызван
    handler.assert_called_once_with(message, data)


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    file_id=file_ids
)
async def test_property_6_save_media_content(telegram_id, file_id):
    """
    Feature: admin-chat-persistence, Property 6: Сохранение медиа-контента
    
    For any медиа-сообщения (фото, документ, видео, аудио, голосовое) от пользователя,
    система должна сохранить file_id и caption (если есть) в базу данных.
    
    Validates: Requirements 2.2
    """
    # Arrange
    mock_repository = AsyncMock(spec=SupportRepository)
    session_manager = SessionManager(mock_repository)
    
    # Mock для get_or_create_session
    expected_session_id = 42
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    
    # Mock для save_user_message
    expected_message_id = 100
    session_manager.save_user_message = AsyncMock(return_value=expected_message_id)
    
    # Создаём interceptor
    interceptor = MessageInterceptor(session_manager)
    
    # Создаём mock сообщение с медиа
    message = create_mock_message(telegram_id=telegram_id, file_id=file_id)
    
    # Mock handler
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    # Проверяем, что сообщение было сохранено с file_id
    session_manager.save_user_message.assert_called_once()
    call_args = session_manager.save_user_message.call_args
    
    assert call_args.kwargs['session_id'] == expected_session_id
    assert call_args.kwargs['telegram_id'] == telegram_id
    assert call_args.kwargs['file_id'] == file_id
    # Для медиа без caption должен быть текст "[Фото]"
    assert call_args.kwargs['message_text'] == "[Фото]"


@pytest.mark.asyncio
@settings(max_examples=100)
@given(
    telegram_id=telegram_ids,
    message_text=message_texts
)
async def test_property_7_message_structure_completeness(telegram_id, message_text):
    """
    Feature: admin-chat-persistence, Property 7: Полнота структуры сообщения
    
    For any сохранённого сообщения, оно должно содержать все обязательные поля:
    session_id, telegram_id, message_type, message_text, created_at, и message_type
    должен быть одним из ('from_user', 'from_bot', 'from_support').
    
    Validates: Requirements 2.3, 2.4
    """
    # Arrange
    mock_repository = AsyncMock(spec=SupportRepository)
    
    # Mock для save_message - проверяем, что все поля переданы
    saved_messages = []
    
    async def mock_save_message(session_id, telegram_id, message_type, message_text, file_id):
        # Проверяем полноту структуры
        assert session_id is not None, "session_id обязателен"
        assert telegram_id is not None, "telegram_id обязателен"
        assert message_type is not None, "message_type обязателен"
        assert message_text is not None, "message_text обязателен"
        assert message_type in ('from_user', 'from_bot', 'from_support'), \
            f"message_type должен быть одним из допустимых значений, получен: {message_type}"
        
        saved_messages.append({
            'session_id': session_id,
            'telegram_id': telegram_id,
            'message_type': message_type,
            'message_text': message_text,
            'file_id': file_id
        })
        return len(saved_messages)
    
    mock_repository.save_message = mock_save_message
    
    session_manager = SessionManager(mock_repository)
    
    # Mock для get_or_create_session
    expected_session_id = 42
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    
    # Создаём interceptor
    interceptor = MessageInterceptor(session_manager)
    
    # Создаём mock сообщение
    message = create_mock_message(telegram_id=telegram_id, text=message_text)
    
    # Mock handler
    handler = AsyncMock(return_value=None)
    data = {}
    
    # Act
    await interceptor(handler, message, data)
    
    # Assert
    assert len(saved_messages) == 1, "Должно быть сохранено ровно одно сообщение"
    
    saved_msg = saved_messages[0]
    assert saved_msg['session_id'] == expected_session_id
    assert saved_msg['telegram_id'] == telegram_id
    assert saved_msg['message_type'] == 'from_user'
    assert saved_msg['message_text'] == message_text


@pytest.mark.asyncio
@settings(max_examples=50)
@given(
    telegram_id=telegram_ids,
    user_message=message_texts,
    bot_response=message_texts
)
async def test_property_8_save_bot_responses(telegram_id, user_message, bot_response):
    """
    Feature: admin-chat-persistence, Property 8: Сохранение ответов бота
    
    For any ответного сообщения от бота пользователю, система должна сохранить его
    в базу данных с типом 'from_bot'.
    
    Validates: Requirements 2.5
    
    Примечание: Этот тест проверяет, что SessionManager.save_bot_message корректно
    сохраняет сообщения с типом 'from_bot'. Фактическое сохранение ответов бота
    будет реализовано в handlers на следующих этапах.
    """
    # Arrange
    mock_repository = AsyncMock(spec=SupportRepository)
    
    # Mock для save_message - отслеживаем все сохранённые сообщения
    saved_messages = []
    
    async def mock_save_message(session_id, telegram_id, message_type, message_text, file_id):
        saved_messages.append({
            'session_id': session_id,
            'telegram_id': telegram_id,
            'message_type': message_type,
            'message_text': message_text,
            'file_id': file_id
        })
        return len(saved_messages)
    
    mock_repository.save_message = mock_save_message
    
    session_manager = SessionManager(mock_repository)
    
    # Mock для get_or_create_session
    expected_session_id = 42
    session_manager.get_or_create_session = AsyncMock(return_value=expected_session_id)
    
    # Act - сохраняем сообщение пользователя
    await session_manager.save_user_message(
        session_id=expected_session_id,
        telegram_id=telegram_id,
        message_text=user_message
    )
    
    # Act - сохраняем ответ бота
    await session_manager.save_bot_message(
        session_id=expected_session_id,
        message_text=bot_response
    )
    
    # Assert
    assert len(saved_messages) == 2, "Должно быть сохранено 2 сообщения"
    
    # Проверяем сообщение пользователя
    user_msg = saved_messages[0]
    assert user_msg['message_type'] == 'from_user'
    assert user_msg['telegram_id'] == telegram_id
    assert user_msg['message_text'] == user_message
    
    # Проверяем ответ бота
    bot_msg = saved_messages[1]
    assert bot_msg['message_type'] == 'from_bot'
    assert bot_msg['telegram_id'] == 0  # Системный ID для бота
    assert bot_msg['message_text'] == bot_response
    assert bot_msg['session_id'] == expected_session_id
