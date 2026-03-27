"""
Интеграционные тесты для полного цикла поддержки.

Проверяют end-to-end сценарии:
1. Пользователь начинает диалог → отправляет сообщения → поддержка отвечает → пользователь завершает диалог

Validates: Requirements 5.1, 6.1, 6.2, 8.1, 8.3, 9.1
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram.types import Message, User, Chat, InlineKeyboardMarkup
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage
from datetime import datetime, timezone

from handlers.support_handler import SupportHandler
from services.support_service import SupportService
from database.repository import SupportRepository
from database.models import SupportSession, SupportMessage
from fsm.states import SupportStates


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_message(telegram_id: int, text: str = "Помогите!"):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.from_user.first_name = "Test"
    message.from_user.last_name = "User"
    message.from_user.username = "test_user"
    message.text = text
    message.caption = None
    message.photo = None
    message.document = None
    message.video = None
    message.audio = None
    message.voice = None
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


def create_mock_message_with_photo(telegram_id: int, caption: str = "Вот скриншот"):
    """Создаёт mock Message с фото"""
    message = create_mock_message(telegram_id, "")
    message.text = None
    message.caption = caption
    
    # Mock для фото (список с разными разрешениями)
    photo1 = MagicMock()
    photo1.file_id = "photo_small_123"
    photo2 = MagicMock()
    photo2.file_id = "photo_large_456"
    message.photo = [photo1, photo2]
    
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
            created_at=datetime.now(timezone.utc)
        )
        session.id = session_id
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
        if message_type not in ('from_user', 'from_support'):
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
# Интеграционный тест 1: Полный цикл поддержки
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_full_support_cycle():
    """
    Интеграционный тест: Полный цикл работы службы поддержки
    
    Сценарий:
    1. Пользователь нажимает кнопку "Позвать человека"
    2. Создаётся сессия поддержки, пользователь переводится в FSM состояние
    3. Пользователь отправляет несколько сообщений
    4. Все сообщения сохраняются в БД с типом 'from_user'
    5. Поддержка отвечает (симулируется)
    6. Ответ сохраняется в БД с типом 'from_support'
    7. Пользователь нажимает "Завершить диалог"
    8. Сессия закрывается, пользователь выходит из FSM состояния
    
    Validates: Requirements 5.1, 6.1, 6.2, 8.1, 8.3, 9.1
    """
    # Arrange: настройка тестовых данных
    telegram_id = 123456789
    
    # Создаём mock repository и сервисы
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    # Создаём FSM контекст
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # ========================================================================
    # Act Part 1: Пользователь начинает диалог с поддержкой
    # ========================================================================
    
    mock_message_start = create_mock_message(telegram_id, "Позвать человека")
    
    await support_handler.start_support(mock_message_start, fsm_context)
    
    # Assert Part 1: Проверяем создание сессии
    
    # 1. Проверяем, что сессия была создана
    assert len(mock_repository.sessions) == 1, "Должна быть создана одна сессия"
    session_id = list(mock_repository.sessions.keys())[0]
    session = mock_repository.sessions[session_id]
    
    assert session.telegram_id == telegram_id, "Сессия должна быть привязана к пользователю"
    assert session.status == 'active', "Сессия должна быть активной"
    
    # 2. Проверяем, что пользователь переведён в FSM состояние
    current_state = await fsm_context.get_state()
    assert current_state == SupportStates.in_support, \
        "Пользователь должен быть в состоянии поддержки"
    
    # 3. Проверяем, что session_id сохранён в FSM
    fsm_data = await fsm_context.get_data()
    assert 'support_session_id' in fsm_data, "session_id должен быть в FSM данных"
    assert fsm_data['support_session_id'] == session_id
    
    # 4. Проверяем, что пользователю отправлено подтверждение с кнопкой
    assert mock_message_start.answer.called, "Должно быть отправлено подтверждение"
    call_kwargs = mock_message_start.answer.call_args[1]
    
    assert 'reply_markup' in call_kwargs, "Должна быть клавиатура"
    keyboard = call_kwargs['reply_markup']
    assert isinstance(keyboard, InlineKeyboardMarkup), \
        "Клавиатура должна быть InlineKeyboardMarkup"
    
    sent_text = mock_message_start.answer.call_args[0][0]
    assert "поддержк" in sent_text.lower(), "Сообщение должно упоминать поддержку"
    
    # ========================================================================
    # Act Part 2: Пользователь отправляет сообщения
    # ========================================================================
    
    # Сообщение 1: текстовое
    mock_message_1 = create_mock_message(telegram_id, "У меня проблема с заказом")
    await support_handler.handle_support_message(mock_message_1, fsm_context)
    
    # Сообщение 2: текстовое
    mock_message_2 = create_mock_message(telegram_id, "Заказ #12345 не пришёл")
    await support_handler.handle_support_message(mock_message_2, fsm_context)
    
    # Сообщение 3: с фото
    mock_message_3 = create_mock_message_with_photo(telegram_id, "Вот скриншот")
    await support_handler.handle_support_message(mock_message_3, fsm_context)
    
    # Assert Part 2: Проверяем сохранение сообщений от пользователя
    
    # 5. Проверяем, что все сообщения сохранены
    messages = await mock_repository.get_messages(session_id)
    assert len(messages) == 3, "Должно быть сохранено 3 сообщения"
    
    # 6. Проверяем первое сообщение
    msg1 = messages[0]
    assert msg1.telegram_id == telegram_id
    assert msg1.message_type == 'from_user'
    assert msg1.message_text == "У меня проблема с заказом"
    assert msg1.file_id is None
    
    # 7. Проверяем второе сообщение
    msg2 = messages[1]
    assert msg2.message_type == 'from_user'
    assert msg2.message_text == "Заказ #12345 не пришёл"
    
    # 8. Проверяем третье сообщение (с фото)
    msg3 = messages[2]
    assert msg3.message_type == 'from_user'
    assert msg3.message_text == "Вот скриншот"
    assert msg3.file_id == "photo_large_456", "Должен быть сохранён file_id фото"
    
    # ========================================================================
    # Act Part 3: Поддержка отвечает пользователю
    # ========================================================================
    
    # Симулируем ответ от поддержки
    support_response = "Здравствуйте! Проверяем ваш заказ #12345"
    
    message_id = await support_service.save_message(
        session_id=session_id,
        telegram_id=telegram_id,
        message_type='from_support',
        message_text=support_response,
        file_id=None
    )
    
    # Отмечаем сообщение как доставленное
    await support_service.mark_message_delivered(message_id)
    
    # Assert Part 3: Проверяем сохранение ответа поддержки
    
    # 9. Проверяем, что ответ поддержки сохранён
    messages = await mock_repository.get_messages(session_id)
    assert len(messages) == 4, "Должно быть 4 сообщения (3 от пользователя + 1 от поддержки)"
    
    # 10. Проверяем сообщение от поддержки
    support_msg = messages[3]
    assert support_msg.message_type == 'from_support'
    assert support_msg.message_text == support_response
    assert support_msg.delivered is True, "Сообщение должно быть отмечено как доставленное"
    
    # ========================================================================
    # Act Part 4: Пользователь завершает диалог
    # ========================================================================
    
    mock_message_end = create_mock_message(telegram_id, "Завершить диалог")
    await support_handler.end_support(mock_message_end, fsm_context)
    
    # Assert Part 4: Проверяем завершение сессии
    
    # 11. Проверяем, что сессия закрыта
    session = mock_repository.sessions[session_id]
    assert session.status == 'closed', "Сессия должна быть закрыта"
    assert session.closed_at is not None, "Должно быть установлено время закрытия"
    
    # 12. Проверяем, что пользователь вышел из FSM состояния
    current_state = await fsm_context.get_state()
    assert current_state is None, "Пользователь должен выйти из FSM состояния"
    
    # 13. Проверяем, что FSM данные очищены
    fsm_data = await fsm_context.get_data()
    assert 'support_session_id' not in fsm_data, "session_id должен быть удалён из FSM"
    
    # 14. Проверяем, что пользователю отправлено подтверждение
    assert mock_message_end.answer.called
    sent_text = mock_message_end.answer.call_args[0][0]
    assert "завершён" in sent_text.lower(), "Сообщение должно подтверждать завершение"
    
    # 15. Проверяем, что сообщение о завершении отправлено (inline клавиатуры не требуют удаления)
    assert mock_message_end.answer.called
    call_args = mock_message_end.answer.call_args[0]
    assert "Диалог завершён" in call_args[0]
        "Клавиатура должна быть удалена"


# ============================================================================
# Интеграционный тест 2: Повторное использование активной сессии
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_reuse_active_session():
    """
    Интеграционный тест: Повторное использование активной сессии
    
    Сценарий:
    1. Пользователь начинает диалог с поддержкой
    2. Пользователь случайно нажимает "Позвать человека" снова
    3. Система не создаёт новую сессию, а использует существующую
    
    Validates: Requirements 5.1
    """
    # Arrange
    telegram_id = 987654321
    
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # Act Part 1: Первый запуск поддержки
    mock_message_1 = create_mock_message(telegram_id, "Позвать человека")
    await support_handler.start_support(mock_message_1, fsm_context)
    
    first_session_id = (await fsm_context.get_data())['support_session_id']
    
    # Act Part 2: Повторный запуск поддержки
    mock_message_2 = create_mock_message(telegram_id, "Позвать человека")
    await support_handler.start_support(mock_message_2, fsm_context)
    
    second_session_id = (await fsm_context.get_data())['support_session_id']
    
    # Assert: Проверяем, что используется та же сессия
    assert first_session_id == second_session_id, \
        "Должна использоваться существующая активная сессия"
    
    assert len(mock_repository.sessions) == 1, \
        "Должна быть только одна сессия"


# ============================================================================
# Интеграционный тест 3: Изоляция команд в режиме поддержки
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_command_isolation_in_support_mode():
    """
    Интеграционный тест: Изоляция команд в режиме поддержки
    
    Сценарий:
    1. Пользователь начинает диалог с поддержкой
    2. Пользователь отправляет обычные сообщения (не команды)
    3. Все сообщения перехватываются и сохраняются
    4. Только команда "Завершить диалог" обрабатывается особым образом
    
    Validates: Requirements 6.4
    """
    # Arrange
    telegram_id = 555555555
    
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # Act: Начинаем поддержку
    mock_message_start = create_mock_message(telegram_id, "Позвать человека")
    await support_handler.start_support(mock_message_start, fsm_context)
    
    session_id = (await fsm_context.get_data())['support_session_id']
    
    # Отправляем различные сообщения
    messages_to_send = [
        "/start",  # Команда, но должна быть перехвачена
        "/help",   # Команда, но должна быть перехвачена
        "Обычное сообщение",
        "Ещё одно сообщение"
    ]
    
    for text in messages_to_send:
        mock_msg = create_mock_message(telegram_id, text)
        await support_handler.handle_support_message(mock_msg, fsm_context)
    
    # Assert: Проверяем, что все сообщения сохранены
    messages = await mock_repository.get_messages(session_id)
    assert len(messages) == 4, "Все сообщения должны быть перехвачены и сохранены"
    
    # Проверяем, что команды сохранены как обычные сообщения
    assert messages[0].message_text == "/start"
    assert messages[1].message_text == "/help"
    assert all(msg.message_type == 'from_user' for msg in messages)


# ============================================================================
# Интеграционный тест 4: Обработка медиа-контента
# ============================================================================

@pytest.mark.integration
@pytest.mark.asyncio
async def test_integration_media_content_handling():
    """
    Интеграционный тест: Обработка медиа-контента
    
    Сценарий:
    1. Пользователь начинает диалог с поддержкой
    2. Пользователь отправляет фото с подписью
    3. file_id фото сохраняется в БД
    4. Подпись сохраняется как текст сообщения
    
    Validates: Requirements 6.5
    """
    # Arrange
    telegram_id = 777777777
    
    mock_repository = MockRepository()
    support_service = SupportService(mock_repository)
    support_handler = SupportHandler(support_service)
    
    fsm_context = await create_mock_fsm_context(telegram_id)
    
    # Act: Начинаем поддержку
    mock_message_start = create_mock_message(telegram_id, "Позвать человека")
    await support_handler.start_support(mock_message_start, fsm_context)
    
    session_id = (await fsm_context.get_data())['support_session_id']
    
    # Отправляем фото с подписью
    mock_message_photo = create_mock_message_with_photo(telegram_id, "Вот проблема на скриншоте")
    await support_handler.handle_support_message(mock_message_photo, fsm_context)
    
    # Assert: Проверяем сохранение медиа
    messages = await mock_repository.get_messages(session_id)
    assert len(messages) == 1
    
    msg = messages[0]
    assert msg.message_text == "Вот проблема на скриншоте", "Подпись должна быть сохранена"
    assert msg.file_id == "photo_large_456", "file_id фото должен быть сохранён"
    assert msg.message_type == 'from_user'
