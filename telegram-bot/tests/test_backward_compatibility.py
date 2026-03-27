"""
Интеграционные тесты для обратной совместимости.
Проверяют, что новая функциональность не ломает существующую работу с кнопкой "Позвать человека".
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from aiogram.types import Message, User, Chat
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage

from handlers.support_handler import SupportHandler
from services.support_service import SupportService
from services.session_manager import SessionManager
from middleware.message_interceptor import MessageInterceptor
from fsm.states import SupportStates
from database.models import SupportSession, SupportMessage


# ============================================================================
# Mock Repository для тестов
# ============================================================================

class MockRepository:
    """Mock репозиторий для тестирования"""
    
    def __init__(self):
        self.sessions = {}
        self.messages = {}
        self.next_session_id = 1
        self.next_message_id = 1
    
    async def create_session(
        self, 
        telegram_id: int, 
        session_type: str = 'chat',
        first_name: str = None,
        last_name: str = None,
        username: str = None
    ) -> int:
        """Создаёт новую сессию"""
        session_id = self.next_session_id
        self.next_session_id += 1
        
        session = SupportSession(
            id=session_id,
            telegram_id=telegram_id,
            status='active',
            session_type=session_type,
            created_at=datetime.now(),
            closed_at=None
        )
        
        self.sessions[session_id] = session
        self.messages[session_id] = []
        
        return session_id
    
    async def get_user_active_session(self, telegram_id: int):
        """Получает активную сессию пользователя"""
        for session in self.sessions.values():
            if session.telegram_id == telegram_id and session.status == 'active':
                return session
        return None
    
    async def get_session_by_id(self, session_id: int):
        """Получает сессию по ID"""
        return self.sessions.get(session_id)
    
    async def update_session_type(self, session_id: int, session_type: str) -> bool:
        """Обновляет тип сессии"""
        if session_id in self.sessions:
            self.sessions[session_id].session_type = session_type
            return True
        return False
    
    async def close_session(self, session_id: int) -> bool:
        """Закрывает сессию"""
        if session_id in self.sessions:
            self.sessions[session_id].status = 'closed'
            self.sessions[session_id].closed_at = datetime.now()
            return True
        return False
    
    async def save_message(
        self,
        session_id: int,
        telegram_id: int,
        message_type: str,
        message_text: str,
        file_id: str = None
    ) -> int:
        """Сохраняет сообщение"""
        message_id = self.next_message_id
        self.next_message_id += 1
        
        message = SupportMessage(
            id=message_id,
            session_id=session_id,
            telegram_id=telegram_id,
            message_type=message_type,
            message_text=message_text,
            file_id=file_id,
            created_at=datetime.now(),
            delivered=False
        )
        
        if session_id not in self.messages:
            self.messages[session_id] = []
        
        self.messages[session_id].append(message)
        
        return message_id
    
    async def get_messages(self, session_id: int, limit: int = None):
        """Получает сообщения сессии"""
        messages = self.messages.get(session_id, [])
        if limit:
            return messages[:limit]
        return messages
    
    async def mark_message_delivered(self, message_id: int) -> bool:
        """Отмечает сообщение как доставленное"""
        for messages in self.messages.values():
            for message in messages:
                if message.id == message_id:
                    message.delivered = True
                    return True
        return False


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id: int, text: str = None):
    """Создаёт mock Message"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    return message


async def create_mock_fsm_context(telegram_id: int):
    """Создаёт реальный FSMContext с MemoryStorage"""
    storage = MemoryStorage()
    
    from aiogram.fsm.storage.base import StorageKey
    key = StorageKey(
        bot_id=123456,
        chat_id=telegram_id,
        user_id=telegram_id
    )
    
    context = FSMContext(
        storage=storage,
        key=key
    )
    
    return context


# ============================================================================
# Интеграционный тест 1: Полный поток с кнопкой "Позвать человека"
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_call_support_flow():
    """
    Интеграционный тест: Полный поток с кнопкой "Позвать человека"
    
    Сценарий:
    1. Пользователь отправляет обычное сообщение
    2. Создаётся Chat_Session
    3. Пользователь нажимает "Позвать человека"
    4. Chat_Session преобразуется в Support_Session
    5. Пользователь переводится в FSM состояние поддержки
    6. Отображается кнопка "Завершить диалог"
    7. Пользователь отправляет сообщение в режиме поддержки
    8. Пользователь нажимает "Завершить диалог"
    9. Сессия закрывается, FSM очищается
    
    Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
    """
    # Arrange
    telegram_id = 111222333
    
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service, session_manager)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # ========================================================================
    # Шаг 1: Пользователь отправляет обычное сообщение
    # ========================================================================
    
    session_id = await session_manager.get_or_create_session(
        telegram_id=telegram_id,
        session_type='chat'
    )
    
    await session_manager.save_user_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_text="Привет, у меня вопрос"
    )
    
    # Assert: Chat_Session создана
    session = await mock_repository.get_session_by_id(session_id)
    assert session is not None
    assert session.session_type == 'chat'
    assert session.status == 'active'
    
    # ========================================================================
    # Шаг 2: Пользователь нажимает "Позвать человека"
    # ========================================================================
    
    # Преобразуем сессию в Support_Session
    await session_manager.convert_to_support_session(session_id)
    
    # Вызываем start_support
    mock_message = create_mock_message(telegram_id, "Позвать человека")
    await support_handler.start_support(mock_message, fsm_context, session_id)
    
    # Assert: Сессия преобразована в Support_Session
    session = await mock_repository.get_session_by_id(session_id)
    assert session.session_type == 'support'
    
    # Assert: FSM состояние установлено
    current_state = await fsm_context.get_state()
    assert current_state == SupportStates.in_support
    
    # Assert: session_id сохранён в FSM
    fsm_data = await fsm_context.get_data()
    assert fsm_data.get('support_session_id') == session_id
    
    # Assert: Отправлено сообщение с кнопкой
    assert mock_message.answer.called
    call_kwargs = mock_message.answer.call_args[1]
    assert 'reply_markup' in call_kwargs
    
    # ========================================================================
    # Шаг 3: Пользователь отправляет сообщение в режиме поддержки
    # ========================================================================
    
    mock_message_2 = create_mock_message(telegram_id, "Мне нужна помощь с призом")
    await support_handler.handle_support_message(mock_message_2, fsm_context)
    
    # Assert: Сообщение сохранено
    messages = await mock_repository.get_messages(session_id)
    support_messages = [m for m in messages if m.message_text == "Мне нужна помощь с призом"]
    assert len(support_messages) == 1
    assert support_messages[0].message_type == 'from_user'
    
    # ========================================================================
    # Шаг 4: Пользователь нажимает "Завершить диалог"
    # ========================================================================
    
    mock_message_3 = create_mock_message(telegram_id, "Завершить диалог")
    await support_handler.end_support(mock_message_3, fsm_context)
    
    # Assert: Сессия закрыта
    session = await mock_repository.get_session_by_id(session_id)
    assert session.status == 'closed'
    assert session.closed_at is not None
    
    # Assert: FSM состояние очищено
    current_state = await fsm_context.get_state()
    assert current_state is None


# ============================================================================
# Интеграционный тест 2: FSM состояния в режиме поддержки
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_fsm_states_in_support_mode():
    """
    Интеграционный тест: FSM состояния в режиме поддержки
    
    Сценарий:
    1. Пользователь начинает сессию поддержки
    2. Проверяем, что FSM состояние установлено в SupportStates.in_support
    3. Проверяем, что session_id сохранён в FSM данных
    4. Пользователь завершает сессию
    5. Проверяем, что FSM состояние очищено
    
    Validates: Requirements 6.2, 6.3
    """
    # Arrange
    telegram_id = 444555666
    
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # ========================================================================
    # Шаг 1: Начало сессии поддержки
    # ========================================================================
    
    mock_message = create_mock_message(telegram_id)
    await support_handler.start_support(mock_message, fsm_context)
    
    # Assert: FSM состояние установлено
    current_state = await fsm_context.get_state()
    assert current_state == SupportStates.in_support, \
        "FSM состояние должно быть SupportStates.in_support"
    
    # Assert: session_id сохранён в FSM
    fsm_data = await fsm_context.get_data()
    assert 'support_session_id' in fsm_data, \
        "session_id должен быть сохранён в FSM данных"
    
    session_id = fsm_data['support_session_id']
    assert session_id is not None
    
    # ========================================================================
    # Шаг 2: Завершение сессии
    # ========================================================================
    
    mock_message_2 = create_mock_message(telegram_id, "Завершить диалог")
    await support_handler.end_support(mock_message_2, fsm_context)
    
    # Assert: FSM состояние очищено
    current_state = await fsm_context.get_state()
    assert current_state is None, \
        "FSM состояние должно быть очищено после завершения"
    
    # Assert: FSM данные очищены
    fsm_data = await fsm_context.get_data()
    assert fsm_data.get('support_session_id') is None, \
        "session_id должен быть удалён из FSM данных"


# ============================================================================
# Интеграционный тест 3: Клавиатура "Завершить диалог"
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_end_dialog_keyboard():
    """
    Интеграционный тест: Клавиатура "Завершить диалог"
    
    Сценарий:
    1. Пользователь начинает сессию поддержки
    2. Проверяем, что отображается клавиатура с кнопкой "Завершить диалог"
    3. Пользователь нажимает кнопку
    4. Проверяем, что клавиатура удаляется
    
    Validates: Requirements 6.3
    """
    # Arrange
    telegram_id = 777888999
    
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # ========================================================================
    # Шаг 1: Начало сессии поддержки
    # ========================================================================
    
    mock_message = create_mock_message(telegram_id)
    await support_handler.start_support(mock_message, fsm_context)
    
    # Assert: Клавиатура отправлена
    assert mock_message.answer.called
    call_kwargs = mock_message.answer.call_args[1]
    
    assert 'reply_markup' in call_kwargs, \
        "Должна быть отправлена клавиатура"
    
    keyboard = call_kwargs['reply_markup']
    from aiogram.types import InlineKeyboardMarkup
    assert isinstance(keyboard, InlineKeyboardMarkup), \
        "reply_markup должен быть InlineKeyboardMarkup"
    
    # Проверяем наличие кнопки "Завершить диалог"
    button_texts = [btn.text for row in keyboard.inline_keyboard for btn in row]
    assert "Завершить диалог" in button_texts, \
        "Клавиатура должна содержать кнопку 'Завершить диалог'"
    
    # ========================================================================
    # Шаг 2: Завершение диалога
    # ========================================================================
    
    mock_message_2 = create_mock_message(telegram_id, "Завершить диалог")
    await support_handler.end_support(mock_message_2, fsm_context)
    
    # Assert: Сообщение о завершении отправлено (inline клавиатуры не требуют удаления)
    assert mock_message_2.answer.called
    call_args = mock_message_2.answer.call_args[0]
    assert "Диалог завершён" in call_args[0], \
        "Должно быть отправлено сообщение о завершении диалога"


# ============================================================================
# Интеграционный тест 4: Переход из Chat_Session в Support_Session
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_to_support_transition():
    """
    Интеграционный тест: Переход из Chat_Session в Support_Session
    
    Сценарий:
    1. Создаётся Chat_Session с историей сообщений
    2. Пользователь нажимает "Позвать человека"
    3. Chat_Session преобразуется в Support_Session
    4. Вся история сообщений сохраняется
    5. Тип сессии меняется на 'support'
    
    Validates: Requirements 6.4
    """
    # Arrange
    telegram_id = 123123123
    
    mock_repository = MockRepository()
    session_manager = SessionManager(mock_repository)
    
    # ========================================================================
    # Шаг 1: Создание Chat_Session с историей
    # ========================================================================
    
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
        message_text="Ответ бота на первое"
    )
    
    await session_manager.save_user_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_text="Второе сообщение"
    )
    
    await session_manager.save_bot_message(
        session_id=session_id,
        message_text="Ответ бота на второе"
    )
    
    # Получаем количество сообщений до преобразования
    messages_before = await mock_repository.get_messages(session_id)
    messages_count_before = len(messages_before)
    
    assert messages_count_before == 4, "Должно быть 4 сообщения"
    
    # ========================================================================
    # Шаг 2: Преобразование в Support_Session
    # ========================================================================
    
    success = await session_manager.convert_to_support_session(session_id)
    
    # Assert: Преобразование успешно
    assert success is True
    
    # Assert: Тип сессии изменён
    session = await mock_repository.get_session_by_id(session_id)
    assert session.session_type == 'support', \
        "Тип сессии должен быть изменён на 'support'"
    
    # Assert: История сообщений сохранена
    messages_after = await mock_repository.get_messages(session_id)
    messages_count_after = len(messages_after)
    
    assert messages_count_after == messages_count_before, \
        "Количество сообщений должно остаться прежним"
    
    # Проверяем содержимое сообщений
    message_texts = [m.message_text for m in messages_after]
    assert "Первое сообщение" in message_texts
    assert "Ответ бота на первое" in message_texts
    assert "Второе сообщение" in message_texts
    assert "Ответ бота на второе" in message_texts


# ============================================================================
# Интеграционный тест 5: Сохранение медиа в режиме поддержки
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_media_handling_in_support():
    """
    Интеграционный тест: Сохранение медиа-контента в режиме поддержки
    
    Сценарий:
    1. Пользователь в режиме поддержки
    2. Пользователь отправляет фото с подписью
    3. Проверяем, что file_id и caption сохранены
    
    Validates: Requirements 6.5
    """
    # Arrange
    telegram_id = 456456456
    
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # Начинаем сессию поддержки
    mock_message = create_mock_message(telegram_id)
    await support_handler.start_support(mock_message, fsm_context)
    
    # Получаем session_id
    fsm_data = await fsm_context.get_data()
    session_id = fsm_data['support_session_id']
    
    # ========================================================================
    # Шаг 1: Отправка фото с подписью
    # ========================================================================
    
    mock_message_photo = create_mock_message(telegram_id)
    mock_message_photo.text = None
    mock_message_photo.caption = "Вот скриншот проблемы"
    
    from aiogram.types import PhotoSize
    photo = MagicMock(spec=PhotoSize)
    photo.file_id = "AgACAgIAAxkBAAIBCGZxY..."
    mock_message_photo.photo = [photo]
    
    await support_handler.handle_support_message(mock_message_photo, fsm_context)
    
    # Assert: Сообщение с медиа сохранено
    messages = await mock_repository.get_messages(session_id)
    media_messages = [m for m in messages if m.file_id is not None]
    
    assert len(media_messages) >= 1, "Должно быть сохранено медиа-сообщение"
    
    media_message = media_messages[-1]  # Последнее медиа-сообщение
    assert media_message.file_id == "AgACAgIAAxkBAAIBCGZxY...", \
        "file_id должен быть сохранён"
    assert media_message.message_text == "Вот скриншот проблемы", \
        "Подпись должна быть сохранена как message_text"
    assert media_message.message_type == 'from_user'
