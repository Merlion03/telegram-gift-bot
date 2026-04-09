"""
E2E интеграционные тесты для функциональности отслеживания сообщений бота.

Проверяют полный flow от команды пользователя до сохранения в БД:
- Команда /start → сохранение команды → сохранение ответа бота
- Команда /help → сохранение команды → сохранение ответа бота
- Режим поддержки (обратная совместимость)

Feature: bot-messages-tracking
Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.3, 6.4, 6.5, 6.6
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from aiogram.types import Message, User, Chat

from middleware.message_interceptor import MessageInterceptor
from handlers.common_handler import CommonHandler
from services.session_manager import SessionManager
from database.repository import SupportRepository


# ============================================================================
# Фикстуры для E2E тестов
# ============================================================================

@pytest.fixture
async def repository(test_db_session):
    """Создаёт экземпляр SupportRepository с тестовой БД"""
    return SupportRepository(session=test_db_session)


@pytest.fixture
async def session_manager(repository):
    """Создаёт экземпляр SessionManager с реальным репозиторием"""
    return SessionManager(repository=repository)


@pytest.fixture
async def message_interceptor(session_manager):
    """Создаёт экземпляр MessageInterceptor с реальным SessionManager"""
    return MessageInterceptor(session_manager=session_manager)


@pytest.fixture
async def common_handler(session_manager):
    """Создаёт экземпляр CommonHandler с реальным SessionManager"""
    return CommonHandler(session_manager=session_manager)


@pytest.fixture
def mock_telegram_message():
    """Создаёт мок Telegram сообщения"""
    def _create_message(text: str, telegram_id: int = 12345, username: str = "test_user"):
        message = MagicMock(spec=Message)
        message.text = text
        message.from_user = MagicMock(spec=User)
        message.from_user.id = telegram_id
        message.from_user.username = username
        message.from_user.first_name = "Test"
        message.from_user.last_name = "User"
        message.chat = MagicMock(spec=Chat)
        message.chat.id = telegram_id
        message.answer = AsyncMock()
        # Добавляем атрибуты для проверки медиа
        message.photo = None
        message.video = None
        message.document = None
        message.audio = None
        message.voice = None
        message.sticker = None
        message.animation = None
        return message
    
    return _create_message


# ============================================================================
# E2E тест 9.1: команда /start → сохранение → отображение
# ============================================================================

class TestStartCommandE2E:
    """
    E2E тест: команда /start → сохранение → отображение
    
    Validates: Requirements 1.1, 2.1, 3.1, 4.1
    """
    
    @pytest.mark.asyncio
    async def test_start_command_full_flow(
        self,
        message_interceptor,
        common_handler,
        repository,
        mock_telegram_message
    ):
        """
        Тест полного flow команды /start:
        1. Пользователь отправляет /start
        2. MessageInterceptor сохраняет команду в БД
        3. CommonHandler обрабатывает команду
        4. CommonHandler сохраняет ответ бота в БД
        5. Проверяем, что оба сообщения сохранены корректно
        
        Validates: Requirements 1.1, 2.1, 3.1, 4.1
        """
        # Arrange
        telegram_id = 12345
        command_text = "/start"
        message = mock_telegram_message(text=command_text, telegram_id=telegram_id)
        
        # Мокаем handler для MessageInterceptor
        async def mock_handler(event, data):
            # Вызываем CommonHandler.handle_start
            session_id = data.get('session_id')
            await common_handler.handle_start(event, session_id=session_id)
            return None
        
        # Act
        # Шаг 1: MessageInterceptor перехватывает сообщение и сохраняет команду
        await message_interceptor(mock_handler, message, {})
        
        # Assert
        # Проверяем, что команда /start сохранена в БД
        # Сначала получаем сессию пользователя
        session = await repository.get_user_active_session(telegram_id)
        assert session is not None, "Session should be created"
        
        # Получаем сообщения по session_id
        messages = await repository.get_messages(session.id)
        
        # Должно быть 2 сообщения: команда от пользователя и ответ бота
        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"
        
        # Проверяем первое сообщение (команда от пользователя)
        user_message = messages[0]
        assert user_message.message_type == 'from_user', "First message should be from_user"
        assert user_message.message_text == command_text, f"Expected '{command_text}', got '{user_message.message_text}'"
        assert user_message.telegram_id == telegram_id, f"Expected telegram_id {telegram_id}, got {user_message.telegram_id}"
        
        # Проверяем второе сообщение (ответ бота)
        bot_message = messages[1]
        assert bot_message.message_type == 'from_bot', "Second message should be from_bot"
        assert bot_message.telegram_id == 0, "Bot message should have telegram_id=0"
        assert len(bot_message.message_text) > 0, "Bot message should have non-empty text"
        
        # Проверяем, что оба сообщения связаны с одной сессией
        assert user_message.session_id == bot_message.session_id, "Messages should belong to the same session"
        
        # Проверяем, что сессия создана и активна
        assert session.telegram_id == telegram_id, f"Session telegram_id should be {telegram_id}"
        assert session.status == 'active', "Session should be active"
        assert session.session_type == 'chat', "Session type should be 'chat'"
    
    @pytest.mark.asyncio
    async def test_start_command_updates_last_activity(
        self,
        message_interceptor,
        common_handler,
        repository,
        mock_telegram_message
    ):
        """
        Тест: команда /start обновляет last_activity сессии
        
        Validates: Requirements 1.5
        """
        # Arrange
        telegram_id = 12346
        command_text = "/start"
        message = mock_telegram_message(text=command_text, telegram_id=telegram_id)
        
        async def mock_handler(event, data):
            session_id = data.get('session_id')
            await common_handler.handle_start(event, session_id=session_id)
            return None
        
        # Act
        await message_interceptor(mock_handler, message, {})
        
        # Assert
        # Получаем сессию и сообщения
        session = await repository.get_user_active_session(telegram_id)
        messages = await repository.get_messages(session.id)
        session_data = await repository.get_session_by_id(messages[0].session_id)
        
        # Проверяем, что last_activity обновлено (должно быть близко к текущему времени)
        now = datetime.now(timezone.utc)
        time_diff = (now - session_data.last_activity).total_seconds()
        assert time_diff < 5, f"last_activity should be updated (diff: {time_diff}s)"


# ============================================================================
# E2E тест 9.2: команда /help → сохранение → отображение
# ============================================================================

class TestHelpCommandE2E:
    """
    E2E тест: команда /help → сохранение → отображение
    
    Validates: Requirements 1.1, 2.1, 3.1, 4.1
    """
    
    @pytest.mark.asyncio
    async def test_help_command_full_flow(
        self,
        message_interceptor,
        common_handler,
        repository,
        mock_telegram_message
    ):
        """
        Тест полного flow команды /help:
        1. Пользователь отправляет /help
        2. MessageInterceptor сохраняет команду в БД
        3. CommonHandler обрабатывает команду
        4. CommonHandler сохраняет ответ бота в БД
        5. Проверяем, что оба сообщения сохранены корректно
        
        Validates: Requirements 1.1, 2.1, 3.1, 4.1
        """
        # Arrange
        telegram_id = 12347
        command_text = "/help"
        message = mock_telegram_message(text=command_text, telegram_id=telegram_id)
        
        async def mock_handler(event, data):
            session_id = data.get('session_id')
            await common_handler.handle_help(event, session_id=session_id)
            return None
        
        # Act
        await message_interceptor(mock_handler, message, {})
        
        # Assert
        messages = await repository.get_messages_by_telegram_id(telegram_id)
        
        # Должно быть 2 сообщения: команда от пользователя и ответ бота
        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"
        
        # Проверяем первое сообщение (команда от пользователя)
        user_message = messages[0]
        assert user_message.message_type == 'from_user'
        assert user_message.message_text == command_text
        assert user_message.telegram_id == telegram_id
        
        # Проверяем второе сообщение (ответ бота)
        bot_message = messages[1]
        assert bot_message.message_type == 'from_bot'
        assert bot_message.telegram_id == 0
        assert len(bot_message.message_text) > 0
        
        # Проверяем, что оба сообщения связаны с одной сессией
        assert user_message.session_id == bot_message.session_id
    
    @pytest.mark.asyncio
    async def test_help_command_with_parameters(
        self,
        message_interceptor,
        common_handler,
        repository,
        mock_telegram_message
    ):
        """
        Тест: команда /help с параметрами сохраняется полностью
        
        Validates: Requirements 1.4
        """
        # Arrange
        telegram_id = 12348
        command_text = "/help support"
        message = mock_telegram_message(text=command_text, telegram_id=telegram_id)
        
        async def mock_handler(event, data):
            session_id = data.get('session_id')
            await common_handler.handle_help(event, session_id=session_id)
            return None
        
        # Act
        await message_interceptor(mock_handler, message, {})
        
        # Assert
        messages = await repository.get_messages_by_telegram_id(telegram_id)
        user_message = messages[0]
        
        # Проверяем, что сохранён полный текст команды с параметрами
        assert user_message.message_text == command_text, \
            f"Expected full command '{command_text}', got '{user_message.message_text}'"


# ============================================================================
# E2E тест 9.4: режим поддержки (обратная совместимость)
# ============================================================================

class TestSupportModeE2E:
    """
    E2E тест: режим поддержки (обратная совместимость)
    
    Validates: Requirements 6.3, 6.4, 6.5, 6.6
    """
    
    @pytest.mark.asyncio
    async def test_support_mode_message_flow(
        self,
        session_manager,
        repository,
        mock_telegram_message
    ):
        """
        Тест режима поддержки:
        1. Создаём сессию в режиме поддержки
        2. Пользователь отправляет сообщение
        3. Администратор отправляет ответ
        4. Проверяем корректность сохранения и типов сообщений
        
        Validates: Requirements 6.3, 6.4, 6.5, 6.6
        """
        # Arrange
        telegram_id = 12349
        user_message_text = "Помогите, пожалуйста!"
        admin_message_text = "Здравствуйте! Чем могу помочь?"
        
        # Act
        # Шаг 1: Создаём сессию в режиме поддержки
        session_id = await session_manager.get_or_create_session(
            telegram_id=telegram_id,
            session_type='support'
        )
        
        # Шаг 2: Сохраняем сообщение от пользователя
        user_msg_id = await session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text=user_message_text
        )
        
        # Шаг 3: Сохраняем ответ от администратора (через репозиторий)
        admin_msg_id = await repository.save_message(
            session_id=session_id,
            telegram_id=99999,  # ID администратора
            message_type='from_support',
            message_text=admin_message_text
        )
        
        # Assert
        messages = await repository.get_messages_by_session_id(session_id)
        
        # Должно быть 2 сообщения
        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"
        
        # Проверяем сообщение от пользователя
        user_msg = messages[0]
        assert user_msg.message_type == 'from_user'
        assert user_msg.message_text == user_message_text
        assert user_msg.telegram_id == telegram_id
        
        # Проверяем сообщение от администратора
        admin_msg = messages[1]
        assert admin_msg.message_type == 'from_support'
        assert admin_msg.message_text == admin_message_text
        assert admin_msg.telegram_id == 99999
        
        # Проверяем, что сессия в режиме поддержки
        session = await repository.get_session_by_id(session_id)
        assert session.session_type == 'support'
        assert session.status == 'active'
    
    @pytest.mark.asyncio
    async def test_support_mode_preserves_media_messages(
        self,
        session_manager,
        repository
    ):
        """
        Тест: режим поддержки корректно сохраняет медиа-сообщения
        
        Validates: Requirements 6.2
        """
        # Arrange
        telegram_id = 12350
        message_text = "Вот скриншот проблемы"
        file_id = "AgACAgIAAxkBAAIBY2..."
        
        # Act
        session_id = await session_manager.get_or_create_session(
            telegram_id=telegram_id,
            session_type='support'
        )
        
        await session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text=message_text,
            file_id=file_id
        )
        
        # Assert
        messages = await repository.get_messages_by_session_id(session_id)
        message = messages[0]
        
        assert message.message_text == message_text
        assert message.file_id == file_id, "Media file_id should be preserved"
        assert message.message_type == 'from_user'


# ============================================================================
# E2E тест: множественные команды от одного пользователя
# ============================================================================

class TestMultipleCommandsE2E:
    """
    E2E тест: множественные команды от одного пользователя
    
    Validates: Requirements 1.1, 2.1, 3.1, 4.1
    """
    
    @pytest.mark.asyncio
    async def test_multiple_commands_same_session(
        self,
        message_interceptor,
        common_handler,
        repository,
        mock_telegram_message
    ):
        """
        Тест: несколько команд от одного пользователя сохраняются в одну сессию
        
        Validates: Requirements 1.1, 1.3, 2.1
        """
        # Arrange
        telegram_id = 12351
        
        async def mock_handler_start(event, data):
            session_id = data.get('session_id')
            await common_handler.handle_start(event, session_id=session_id)
            return None
        
        async def mock_handler_help(event, data):
            session_id = data.get('session_id')
            await common_handler.handle_help(event, session_id=session_id)
            return None
        
        # Act
        # Отправляем /start
        start_message = mock_telegram_message(text="/start", telegram_id=telegram_id)
        await message_interceptor(mock_handler_start, start_message, {})
        
        # Отправляем /help
        help_message = mock_telegram_message(text="/help", telegram_id=telegram_id)
        await message_interceptor(mock_handler_help, help_message, {})
        
        # Assert
        messages = await repository.get_messages_by_telegram_id(telegram_id)
        
        # Должно быть 4 сообщения: 2 команды + 2 ответа бота
        assert len(messages) == 4, f"Expected 4 messages, got {len(messages)}"
        
        # Проверяем типы сообщений
        assert messages[0].message_type == 'from_user'  # /start
        assert messages[0].message_text == '/start'
        
        assert messages[1].message_type == 'from_bot'   # ответ на /start
        assert messages[1].telegram_id == 0
        
        assert messages[2].message_type == 'from_user'  # /help
        assert messages[2].message_text == '/help'
        
        assert messages[3].message_type == 'from_bot'   # ответ на /help
        assert messages[3].telegram_id == 0
        
        # Проверяем, что все сообщения в одной сессии
        session_ids = {msg.session_id for msg in messages}
        assert len(session_ids) == 1, "All messages should belong to the same session"
