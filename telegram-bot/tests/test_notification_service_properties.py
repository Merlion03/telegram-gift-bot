"""
Property-based тесты для NotificationService

Используется Hypothesis для проверки универсальных свойств системы
на большом количестве сгенерированных входных данных.
"""
import pytest
from hypothesis import given, settings, strategies as st, HealthCheck
from unittest.mock import AsyncMock, MagicMock, patch, call
from aiogram import Bot
from aiogram.exceptions import TelegramAPIError

from services.notification_service import NotificationService, NotificationResult
from services.session_manager import SessionManager
from constants.messages import DELIVERY_CONFIRMATION_MESSAGE, DELIVERY_MAIN_MENU_MESSAGE


# Стратегии генерации данных
telegram_ids = st.integers(min_value=1, max_value=999999999)
prize_ids = st.integers(min_value=1, max_value=999999)
session_ids = st.one_of(st.none(), st.integers(min_value=1, max_value=999999))


# Feature: request-tracking-and-chat-notifications, Property 4: Отправка подтверждающего сообщения
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_4_confirmation_message_sent(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 4: Отправка подтверждающего сообщения
    
    **Validates: Requirements 2.1, 2.2**
    
    For any успешного сохранения данных доставки, система должна отправить
    Confirmation_Message с текстом "Данные получили, скоро отправим приз" в чат пользователя.
    """
    # Arrange
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - подтверждающее сообщение должно быть отправлено
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    
    # Проверяем вызов send_message с правильными параметрами
    confirmation_calls = [
        c for c in mock_bot.send_message.call_args_list
        if c[1].get('text') == DELIVERY_CONFIRMATION_MESSAGE
    ]
    assert len(confirmation_calls) == 1, "Должен быть ровно один вызов для подтверждающего сообщения"
    
    confirmation_call = confirmation_calls[0]
    assert confirmation_call[1]['chat_id'] == telegram_id, "chat_id должен совпадать с telegram_id"
    assert confirmation_call[1]['text'] == DELIVERY_CONFIRMATION_MESSAGE, "Текст должен быть корректным"


# Feature: request-tracking-and-chat-notifications, Property 5: Порядок отправки сообщений
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_5_message_order(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 5: Порядок отправки сообщений
    
    **Validates: Requirements 2.3, 4.1, 4.2**
    
    For any процесса отправки уведомлений, Confirmation_Message должно быть
    отправлено строго перед Main_Menu_Message.
    """
    # Arrange
    call_order = []
    
    async def track_send_message(**kwargs):
        call_order.append(kwargs['text'])
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock(side_effect=track_send_message)
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - порядок отправки должен быть правильным
    assert len(call_order) == 2, "Должно быть отправлено ровно 2 сообщения"
    assert call_order[0] == DELIVERY_CONFIRMATION_MESSAGE, "Первым должно быть подтверждающее сообщение"
    assert call_order[1] == DELIVERY_MAIN_MENU_MESSAGE, "Вторым должно быть сообщение с главным меню"
    
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"


# Feature: request-tracking-and-chat-notifications, Property 7: Graceful degradation при ошибке первого сообщения
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_7_graceful_degradation_first_message(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 7: Graceful degradation при ошибке первого сообщения
    
    **Validates: Requirements 2.5, 6.1**
    
    For any ошибки отправки Confirmation_Message, система должна залогировать ошибку
    и продолжить отправку Main_Menu_Message.
    """
    # Arrange
    call_count = {'confirmation': 0, 'main_menu': 0}
    
    async def mock_send_message(**kwargs):
        text = kwargs['text']
        if text == DELIVERY_CONFIRMATION_MESSAGE:
            call_count['confirmation'] += 1
            raise TelegramAPIError("Network error")
        elif text == DELIVERY_MAIN_MENU_MESSAGE:
            call_count['main_menu'] += 1
            return MagicMock()
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock(side_effect=mock_send_message)
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - первое сообщение не отправлено, второе отправлено
    assert result.confirmation_sent is False, "Подтверждающее сообщение не должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    assert result.both_sent is False, "Оба сообщения не отправлены"
    assert result.at_least_one_sent is True, "Хотя бы одно сообщение отправлено"
    
    # Проверяем, что оба метода были вызваны
    assert call_count['confirmation'] == 1, "Попытка отправки подтверждающего сообщения должна быть"
    assert call_count['main_menu'] == 1, "Попытка отправки главного меню должна быть"


# Feature: request-tracking-and-chat-notifications, Property 8: Отправка сообщения с главным меню
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_8_main_menu_message(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 8: Отправка сообщения с главным меню
    
    **Validates: Requirements 3.1, 3.2, 3.3**
    
    For any успешной отправки Confirmation_Message (или после ошибки его отправки),
    система должна отправить Main_Menu_Message с клавиатурой, содержащей кнопку "🎁 Получить приз".
    """
    # Arrange
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - сообщение с главным меню должно быть отправлено
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    
    # Проверяем вызов send_message с клавиатурой
    main_menu_calls = [
        c for c in mock_bot.send_message.call_args_list
        if c[1].get('text') == DELIVERY_MAIN_MENU_MESSAGE
    ]
    assert len(main_menu_calls) == 1, "Должен быть ровно один вызов для главного меню"
    
    main_menu_call = main_menu_calls[0]
    assert main_menu_call[1]['chat_id'] == telegram_id, "chat_id должен совпадать"
    assert main_menu_call[1]['text'] == DELIVERY_MAIN_MENU_MESSAGE, "Текст должен быть корректным"
    assert 'reply_markup' in main_menu_call[1], "Должна быть клавиатура"
    
    # Проверяем наличие кнопки "🎁 Получить приз"
    keyboard = main_menu_call[1]['reply_markup']
    assert keyboard is not None, "Клавиатура не должна быть None"
    assert hasattr(keyboard, 'inline_keyboard'), "Должна быть inline клавиатура"
    
    # Проверяем наличие кнопки с текстом "🎁 Получить приз"
    buttons = keyboard.inline_keyboard
    button_texts = [btn.text for row in buttons for btn in row]
    assert "🎁 Получить приз" in button_texts, "Должна быть кнопка '🎁 Получить приз'"



# Feature: request-tracking-and-chat-notifications, Property 11, 12, 13: Логирование
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_11_12_13_logging(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 11: Логирование отправленных сообщений
    Property 12: Логирование ошибок отправки
    Property 13: Структурированное логирование
    
    **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
    
    For any успешно отправленного сообщения, система должна залогировать соответствующее
    событие с telegram_id. For any ошибки отправки, система должна залогировать событие
    с уровнем "error" и деталями ошибки. Все логи должны содержать структурированные поля.
    """
    # Arrange
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    with patch('services.notification_service.logger') as mock_logger:
        result = await notification_service.send_delivery_notifications(
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        # Assert - проверяем логирование успешных отправок
        assert result.both_sent is True, "Оба сообщения должны быть отправлены"
        
        # Проверяем логирование confirmation_message_sent
        confirmation_log_calls = [
            c for c in mock_logger.info.call_args_list
            if c[0][0] == "confirmation_message_sent"
        ]
        assert len(confirmation_log_calls) == 1, "Должен быть лог confirmation_message_sent"
        assert confirmation_log_calls[0][1]['telegram_id'] == telegram_id, "telegram_id должен быть в логе"
        
        # Проверяем логирование main_menu_message_sent
        main_menu_log_calls = [
            c for c in mock_logger.info.call_args_list
            if c[0][0] == "main_menu_message_sent"
        ]
        assert len(main_menu_log_calls) == 1, "Должен быть лог main_menu_message_sent"
        assert main_menu_log_calls[0][1]['telegram_id'] == telegram_id, "telegram_id должен быть в логе"
        
        # Проверяем логирование delivery_notifications_sent
        delivery_log_calls = [
            c for c in mock_logger.info.call_args_list
            if c[0][0] == "delivery_notifications_sent"
        ]
        assert len(delivery_log_calls) == 1, "Должен быть лог delivery_notifications_sent"
        delivery_log = delivery_log_calls[0]
        assert delivery_log[1]['telegram_id'] == telegram_id, "telegram_id должен быть в логе"
        assert delivery_log[1]['prize_id'] == prize_id, "prize_id должен быть в логе"
        assert delivery_log[1]['confirmation_sent'] is True, "confirmation_sent должен быть в логе"
        assert delivery_log[1]['main_menu_sent'] is True, "main_menu_sent должен быть в логе"


@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_12_error_logging(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 12: Логирование ошибок отправки
    
    **Validates: Requirements 5.4**
    
    For any ошибки отправки сообщения, система должна залогировать событие
    с уровнем "error" и деталями ошибки.
    """
    # Arrange
    async def mock_send_message(**kwargs):
        raise TelegramAPIError("Test error")
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock(side_effect=mock_send_message)
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    with patch('services.notification_service.logger') as mock_logger:
        result = await notification_service.send_delivery_notifications(
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        # Assert - проверяем логирование ошибок
        assert result.both_sent is False, "Оба сообщения не должны быть отправлены"
        
        # Проверяем логирование confirmation_message_failed
        confirmation_error_calls = [
            c for c in mock_logger.error.call_args_list
            if c[0][0] == "confirmation_message_failed"
        ]
        assert len(confirmation_error_calls) == 1, "Должен быть лог ошибки подтверждающего сообщения"
        error_log = confirmation_error_calls[0]
        assert error_log[1]['telegram_id'] == telegram_id, "telegram_id должен быть в логе"
        assert 'error' in error_log[1], "Детали ошибки должны быть в логе"
        
        # Проверяем логирование main_menu_message_failed
        main_menu_error_calls = [
            c for c in mock_logger.error.call_args_list
            if c[0][0] == "main_menu_message_failed"
        ]
        assert len(main_menu_error_calls) == 1, "Должен быть лог ошибки главного меню"
        error_log = main_menu_error_calls[0]
        assert error_log[1]['telegram_id'] == telegram_id, "telegram_id должен быть в логе"
        assert 'error' in error_log[1], "Детали ошибки должны быть в логе"


# Feature: request-tracking-and-chat-notifications, Property 16: Сохранение сообщений в session_manager
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=st.integers(min_value=1, max_value=999999)  # Только валидные session_id
)
@pytest.mark.asyncio
async def test_property_16_session_manager_save(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 16: Сохранение сообщений в session_manager
    
    **Validates: Requirements 8.1, 8.2, 8.3**
    
    For any успешно отправленного сообщения при наличии session_manager и session_id,
    система должна сохранить текст сообщения через session_manager.save_bot_message().
    """
    # Arrange
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - проверяем сохранение обоих сообщений
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"
    
    # Проверяем вызовы save_bot_message
    assert mock_session_manager.save_bot_message.call_count == 2, "Должно быть 2 вызова save_bot_message"
    
    # Проверяем сохранение подтверждающего сообщения
    confirmation_save_calls = [
        c for c in mock_session_manager.save_bot_message.call_args_list
        if c[1]['message_text'] == DELIVERY_CONFIRMATION_MESSAGE
    ]
    assert len(confirmation_save_calls) == 1, "Подтверждающее сообщение должно быть сохранено"
    assert confirmation_save_calls[0][1]['session_id'] == session_id, "session_id должен совпадать"
    
    # Проверяем сохранение сообщения с главным меню
    main_menu_save_calls = [
        c for c in mock_session_manager.save_bot_message.call_args_list
        if c[1]['message_text'] == DELIVERY_MAIN_MENU_MESSAGE
    ]
    assert len(main_menu_save_calls) == 1, "Сообщение с главным меню должно быть сохранено"
    assert main_menu_save_calls[0][1]['session_id'] == session_id, "session_id должен совпадать"


# Feature: request-tracking-and-chat-notifications, Property 17: Работа без session_manager
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=session_ids
)
@pytest.mark.asyncio
async def test_property_17_work_without_session_manager(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 17: Работа без session_manager
    
    **Validates: Requirements 8.4**
    
    For any процесса отправки уведомлений при отсутствии session_manager или session_id,
    система должна успешно отправить оба сообщения без попыток сохранения в историю.
    """
    # Arrange - без session_manager
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=None  # Без session_manager
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - оба сообщения должны быть отправлены
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    
    # Проверяем, что send_message был вызван дважды
    assert mock_bot.send_message.call_count == 2, "Должно быть 2 вызова send_message"


# Feature: request-tracking-and-chat-notifications, Property 18: Обработка ошибок session_manager
@settings(
    max_examples=100,
    suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    telegram_id=telegram_ids,
    prize_id=prize_ids,
    session_id=st.integers(min_value=1, max_value=999999)
)
@pytest.mark.asyncio
async def test_property_18_session_manager_error_handling(telegram_id, prize_id, session_id):
    """
    Feature: request-tracking-and-chat-notifications
    Property 18: Обработка ошибок session_manager
    
    **Validates: Requirements 8.5**
    
    For any ошибки сохранения в session_manager, система должна залогировать ошибку
    и продолжить выполнение без прерывания отправки сообщений.
    """
    # Arrange
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock(side_effect=Exception("Database error"))
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act
    with patch('services.notification_service.logger') as mock_logger:
        result = await notification_service.send_delivery_notifications(
            telegram_id=telegram_id,
            prize_id=prize_id,
            session_id=session_id
        )
        
        # Assert - оба сообщения должны быть отправлены несмотря на ошибки сохранения
        assert result.both_sent is True, "Оба сообщения должны быть отправлены"
        assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
        assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
        
        # Проверяем логирование ошибок session_manager
        session_error_calls = [
            c for c in mock_logger.error.call_args_list
            if c[0][0] == "session_manager_save_failed"
        ]
        assert len(session_error_calls) == 2, "Должно быть 2 лога ошибок session_manager"
        
        # Проверяем, что в логах есть session_id и error
        for error_call in session_error_calls:
            assert error_call[1]['session_id'] == session_id, "session_id должен быть в логе"
            assert 'error' in error_call[1], "Детали ошибки должны быть в логе"
