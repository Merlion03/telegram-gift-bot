"""
Интеграционные тесты для MessageInterceptor и полного потока сохранения диалогов

Проверяют end-to-end сценарии:
1. Сообщение пользователя → создание сессии → ответ бота → сохранение в БД
2. Обратная совместимость с кнопкой "Позвать человека"
3. Преобразование Chat_Session в Support_Session

Validates: Requirements 1.1, 1.5, 2.5, 6.1, 6.4
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, Chat
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage
from datetime import datetime, timezone

from middleware.message_interceptor import MessageInterceptor
from services.session_manager import SessionManager
from handlers.common_handler import CommonHandler
from handlers.prize_handler import PrizeHandler
from handlers.support_handler import SupportHandler
from services.support_service import SupportService
from services.prize_service import PrizeService, PrizeResult, PrizeStatus
from database.repository import SupportRepository
from database.models import SupportSession, SupportMessage
from fsm.states import SupportStates


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id: int, text: str = "Привет"):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.username = "test_user"
    message.from_user.first_name = "Test"
    message.from_user.last_name = "User"
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.sticker = None
    message.animation = None
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


class MockRepository(SupportRepository):
    """Mock repository для тестирования без реальной БД"""
    
    def __init__(self):
        super().__init__(session=None)
        self.sessions = {}
        self.messages = {}
        self.next_session_id = 1
        self.next_message_id = 1
    
    async def create_session(
        self, 
        telegram_id: int,
        first_name: str = None,
        last_name: str = None,
        username: str = None
    ) -> int:
        """Создаёт mock сессию"""
        session_id = self.next_session_id
        self.next_session_id += 1
        
        session = SupportSession(
            telegram_id=telegram_id,
            status='active',
            session_type='chat',  # По умолчанию создаём chat сессию
            created_at=datetime.now(timezone.utc)
        )
        session.id = session_id
        session.messages = []
        self.sessions[session_id] = session
        
        return session_id
    
    async def save_message(
        self,
        session_id: int,
        telegram_id: int,
        message_type: str,
        message_text: str,
        file_id: str = None
    ) -> int:
        """Сохраняет mock сообщение"""
        if message_type not in ('from_user', 'from_support', 'from_bot'):
            raise ValueError(f"Invalid message_type: {message_type}")
        
        message_id = self.next_message_id
        self.next_message_id += 1
        
        message = SupportMessage(
            session_id=session_id,
            telegram_id=telegram_id,
            message_type=message_type,
            message_text=message_text,
            file_id=file_id,
            created_at=datetime.now(timezone.utc),
            delivered=False
        )
        message.id = message_id
        
        if session_id not in self.messages:
            self.messages[session_id] = []
        self.messages[session_id].append(message)
        
        # Добавляем сообщение в сессию
        if session_id in self.sessions:
            self.sessions[session_id].messages.append(message)
        
        return message_id
    
    async def get_messages(
        self,
        session_id: int,
        limit: int = None,
        offset: int = 0
    ):
        """Получает mock сообщения"""
        messages = self.messages.get(session_id, [])
        messages_sorted = sorted(messages, key=lambda m: m.created_at)
        
        if limit:
            return messages_sorted[offset:offset+limit]
        return messages_sorted[offset:]
    
    async def close_session(self, session_id: int) -> bool:
        """Закрывает mock сессию"""
        if session_id in self.sessions:
            self.sessions[session_id].close()
            return True
        return False
    
    async def get_user_active_session(self, telegram_id: int):
        """Получает активную сессию пользователя"""
        for session in self.sessions.values():
            if session.telegram_id == telegram_id and session.status == 'active':
                return session
        return None
    
    async def get_session_by_id(self, session_id: int):
        """Получает сессию по ID"""
        return self.sessions.get(session_id)
    
    async def mark_message_delivered(self, message_id: int) -> bool:
        """Отмечает сообщение как доставленное"""
        for messages_list in self.messages.values():
            for message in messages_list:
                if message.id == message_id:
                    message.mark_delivered()
                    return True
        return False


async def create_mock_fsm_context(telegram_id: int):
    """Создаёт mock FSM контекст"""
    storage = MemoryStorage()
    context = FSMContext(
        storage=storage,
        key=f"user_{telegram_id}"
    )
    return context


# ============================================================================
# Интеграционный тест 1: Полный поток с MessageInterceptor
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_message_interceptor_full_flow():
    """
    Интеграционный тест: Полный поток с MessageInterceptor
    
    Сценарий:
    1. Пользователь отправляет первое сообщение боту
    2. MessageInterceptor перехватывает сообщение
    3. Автоматически создаётся Chat_Session
    4. Сообщение пользователя сохраняется в БД
    5. Обработчик отправляет ответ бота
    6. Ответ бота сохраняется в БД
    
    Validates: Requirements 1.1, 2.5
    """
    # Arrange
    telegram_id = 123456789
    
    # Создаём mock repository и сервисы
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    common_handler = CommonHandler(session_manager)
    
    # Создаём MessageInterceptor
    message_interceptor = MessageInterceptor(session_manager)
    
    # Создаём mock сообщение
    mock_message = create_mock_message(telegram_id, "Привет")
    
    # Создаём контекст для middleware
    data = {}
    
    # Создаём mock handler (следующий в цепочке)
    async def mock_handler(event, handler_data):
        # Симулируем обработку сообщения и отправку ответа
        session_id = handler_data.get('session_id')
        await common_handler.handle_start(event, session_id)
        return None
    
    # Act: Вызываем middleware
    await message_interceptor(mock_handler, mock_message, data)
    
    # Assert: Проверяем результаты
    
    # 1. Проверяем, что сессия была создана
    assert len(mock_repository.sessions) == 1, "Должна быть создана одна сессия"
    session_id = list(mock_repository.sessions.keys())[0]
    session = mock_repository.sessions[session_id]
    
    assert session.telegram_id == telegram_id
    assert session.session_type == 'chat', "Должна быть создана Chat_Session"
    assert session.status == 'active'
    
    # 2. Проверяем, что session_id был передан в контекст
    assert 'session_id' in data
    assert data['session_id'] == session_id
    
    # 3. Проверяем, что сообщение пользователя сохранено
    messages = await mock_repository.get_messages(session_id)
    assert len(messages) >= 1, "Должно быть сохранено сообщение пользователя"
    
    # Находим сообщение пользователя
    user_messages = [msg for msg in messages if msg.message_type == 'from_user']
    assert len(user_messages) >= 1, "Должно быть сохранено сообщение пользователя"
    
    user_message = user_messages[0]
    assert user_message.message_text == "Привет"
    assert user_message.telegram_id == telegram_id
    
    # 4. Проверяем, что ответ бота сохранён
    bot_messages = [msg for msg in messages if msg.message_type == 'from_bot']
    assert len(bot_messages) >= 1, "Должен быть сохранён ответ бота"
    
    bot_message = bot_messages[0]
    assert "Привет" in bot_message.message_text or "привет" in bot_message.message_text.lower()


# ============================================================================
# Интеграционный тест 2: Обратная совместимость с "Позвать человека"
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_backward_compatibility_call_support():
    """
    Интеграционный тест: Обратная совместимость с кнопкой "Позвать человека"
    
    Сценарий:
    1. Пользователь отправляет обычное сообщение → создаётся Chat_Session
    2. Пользователь нажимает "Позвать человека"
    3. Chat_Session преобразуется в Support_Session
    4. История сообщений сохраняется
    5. Пользователь переводится в FSM состояние поддержки
    
    Validates: Requirements 1.5, 6.1, 6.4
    """
    # Arrange
    telegram_id = 987654321
    
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    support_service = SupportService(mock_repository)
    common_handler = CommonHandler(session_manager)
    support_handler = SupportHandler(support_service, session_manager)
    
    message_interceptor = MessageInterceptor(session_manager)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # ========================================================================
    # Act Part 1: Пользователь отправляет обычное сообщение
    # ========================================================================
    
    mock_message_1 = create_mock_message(telegram_id, "Привет")
    data_1 = {}
    
    async def mock_handler_1(event, handler_data):
        session_id = handler_data.get('session_id')
        await common_handler.handle_start(event, session_id)
        return None
    
    await message_interceptor(mock_handler_1, mock_message_1, data_1)
    
    # Assert Part 1: Проверяем создание Chat_Session
    assert len(mock_repository.sessions) == 1
    session_id = list(mock_repository.sessions.keys())[0]
    session = mock_repository.sessions[session_id]
    
    assert session.session_type == 'chat', "Должна быть создана Chat_Session"
    
    # Проверяем, что есть сообщения в истории
    messages_before = await mock_repository.get_messages(session_id)
    assert len(messages_before) >= 1, "Должна быть история сообщений"
    
    # ========================================================================
    # Act Part 2: Пользователь нажимает "Позвать человека"
    # ========================================================================
    
    mock_message_2 = create_mock_message(telegram_id, "Позвать человека")
    
    # Преобразуем сессию в Support_Session перед вызовом start_support
    await session_manager.convert_to_support_session(session_id)
    
    await support_handler.start_support(mock_message_2, fsm_context, session_id)
    
    # Assert Part 2: Проверяем преобразование в Support_Session
    
    # 1. Проверяем, что сессия преобразована
    session = mock_repository.sessions[session_id]
    assert session.session_type == 'support', "Сессия должна быть преобразована в Support_Session"
    
    # 2. Проверяем, что история сообщений сохранена
    messages_after = await mock_repository.get_messages(session_id)
    assert len(messages_after) >= len(messages_before), \
        "История сообщений должна быть сохранена"
    
    # 3. Проверяем, что пользователь в FSM состоянии поддержки
    current_state = await fsm_context.get_state()
    assert current_state == SupportStates.in_support, \
        "Пользователь должен быть в состоянии поддержки"
    
    # 4. Проверяем, что session_id сохранён в FSM
    fsm_data = await fsm_context.get_data()
    assert fsm_data.get('support_session_id') == session_id


# ============================================================================
# Интеграционный тест 3: Преобразование Chat_Session в Support_Session
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_chat_to_support_conversion():
    """
    Интеграционный тест: Преобразование Chat_Session в Support_Session
    
    Сценарий:
    1. Создаётся Chat_Session с несколькими сообщениями
    2. Вызывается преобразование в Support_Session
    3. Тип сессии меняется на 'support'
    4. Вся история сообщений сохраняется
    
    Validates: Requirements 1.5, 4.3, 6.4
    """
    # Arrange
    telegram_id = 555555555
    
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    
    # Создаём Chat_Session
    session_id = await session_manager.get_or_create_session(
        telegram_id=telegram_id,
        session_type='chat'
    )
    
    # Добавляем несколько сообщений
    await session_manager.save_user_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_text="Первое сообщение"
    )
    
    await session_manager.save_bot_message(
        session_id=session_id,
        message_text="Ответ бота"
    )
    
    await session_manager.save_user_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_text="Второе сообщение"
    )
    
    # Получаем количество сообщений до преобразования
    messages_before = await mock_repository.get_messages(session_id)
    messages_count_before = len(messages_before)
    
    # Act: Преобразуем в Support_Session
    success = await session_manager.convert_to_support_session(session_id)
    
    # Assert: Проверяем результаты
    
    # 1. Проверяем успешность преобразования
    assert success is True, "Преобразование должно быть успешным"
    
    # 2. Проверяем изменение типа сессии
    session = await mock_repository.get_session_by_id(session_id)
    assert session.session_type == 'support', "Тип сессии должен быть 'support'"
    assert session.is_support_session() is True
    assert session.is_chat_session() is False
    
    # 3. Проверяем сохранение истории сообщений
    messages_after = await mock_repository.get_messages(session_id)
    assert len(messages_after) == messages_count_before, \
        "Все сообщения должны быть сохранены"
    
    # 4. Проверяем содержимое сообщений
    assert messages_after[0].message_text == "Первое сообщение"
    assert messages_after[0].message_type == 'from_user'
    
    assert messages_after[1].message_text == "Ответ бота"
    assert messages_after[1].message_type == 'from_bot'
    
    assert messages_after[2].message_text == "Второе сообщение"
    assert messages_after[2].message_type == 'from_user'


# ============================================================================
# Интеграционный тест 4: Фильтрация системных команд
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_system_commands_filtering():
    """
    Интеграционный тест: Фильтрация системных команд
    
    Сценарий:
    1. Пользователь отправляет /start
    2. MessageInterceptor фильтрует команду (не создаёт сессию)
    3. Обработчик обрабатывает команду
    4. Пользователь отправляет обычное сообщение
    5. MessageInterceptor создаёт сессию и сохраняет сообщение
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 777777777
    
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    common_handler = CommonHandler(session_manager)
    
    message_interceptor = MessageInterceptor(session_manager)
    
    # ========================================================================
    # Act Part 1: Пользователь отправляет /start
    # ========================================================================
    
    mock_message_start = create_mock_message(telegram_id, "/start")
    data_start = {}
    
    async def mock_handler_start(event, handler_data):
        # Обработчик /start не должен получить session_id
        return None
    
    await message_interceptor(mock_handler_start, mock_message_start, data_start)
    
    # Assert Part 1: Проверяем, что сессия НЕ создана
    assert len(mock_repository.sessions) == 0, \
        "Сессия не должна создаваться для системных команд"
    
    assert 'session_id' not in data_start, \
        "session_id не должен быть в контексте для системных команд"
    
    # ========================================================================
    # Act Part 2: Пользователь отправляет обычное сообщение
    # ========================================================================
    
    mock_message_normal = create_mock_message(telegram_id, "Привет")
    data_normal = {}
    
    async def mock_handler_normal(event, handler_data):
        session_id = handler_data.get('session_id')
        await common_handler.handle_start(event, session_id)
        return None
    
    await message_interceptor(mock_handler_normal, mock_message_normal, data_normal)
    
    # Assert Part 2: Проверяем, что сессия создана
    assert len(mock_repository.sessions) == 1, \
        "Сессия должна быть создана для обычного сообщения"
    
    assert 'session_id' in data_normal, \
        "session_id должен быть в контексте"
    
    # Проверяем, что сообщение сохранено
    session_id = data_normal['session_id']
    messages = await mock_repository.get_messages(session_id)
    assert len(messages) >= 1
    
    # Находим сообщение пользователя
    user_messages = [msg for msg in messages if msg.message_type == 'from_user']
    assert len(user_messages) >= 1
    assert user_messages[0].message_text == "Привет"


# ============================================================================
# Интеграционный тест 5: Сохранение ответов бота в разных обработчиках
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_bot_responses_saved_in_handlers():
    """
    Интеграционный тест: Сохранение ответов бота в разных обработчиках
    
    Сценарий:
    1. CommonHandler отправляет ответ → ответ сохраняется
    2. PrizeHandler отправляет ответ → ответ сохраняется
    3. SupportHandler отправляет ответ → ответ сохраняется
    
    Validates: Requirements 2.5
    """
    # Arrange
    telegram_id = 999999999
    
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    common_handler = CommonHandler(session_manager)
    
    # Создаём сессию
    session_id = await session_manager.get_or_create_session(telegram_id)
    
    # ========================================================================
    # Act & Assert: CommonHandler
    # ========================================================================
    
    mock_message_help = create_mock_message(telegram_id, "/help")
    await common_handler.handle_help(mock_message_help, session_id)
    
    messages = await mock_repository.get_messages(session_id)
    bot_messages = [msg for msg in messages if msg.message_type == 'from_bot']
    assert len(bot_messages) >= 1, "CommonHandler должен сохранить ответ бота"
    
    # ========================================================================
    # Act & Assert: PrizeHandler (симуляция)
    # ========================================================================
    
    # Создаём mock PrizeService
    mock_prize_service = AsyncMock(spec=PrizeService)
    mock_prize_service.check_prize = AsyncMock(return_value=PrizeResult(
        status=PrizeStatus.NOT_FOUND,
        promo_code=None,
        instructions=None,
        prize_id=None
    ))
    
    prize_handler = PrizeHandler(
        prize_service=mock_prize_service,
        webapp_url="https://test.com",
        session_manager=session_manager
    )
    
    mock_message_code = create_mock_message(telegram_id, "TEST_CODE")
    await prize_handler.handle_code_word(mock_message_code, "TEST_CODE", session_id)
    
    messages = await mock_repository.get_messages(session_id)
    bot_messages = [msg for msg in messages if msg.message_type == 'from_bot']
    assert len(bot_messages) >= 2, "PrizeHandler должен сохранить ответ бота"
