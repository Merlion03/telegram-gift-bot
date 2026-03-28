"""
Unit-тесты для NotificationService

Проверяют конкретные примеры, граничные случаи и обработку ошибок.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from aiogram import Bot
from aiogram.exceptions import TelegramAPIError

from services.notification_service import NotificationService, NotificationResult
from services.session_manager import SessionManager
from constants.messages import DELIVERY_CONFIRMATION_MESSAGE, DELIVERY_MAIN_MENU_MESSAGE


@pytest.mark.asyncio
async def test_send_delivery_notifications_success():
    """
    Тест успешной отправки обоих уведомлений
    
    Validates: Requirements 2.1, 3.1
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    session_id = 1
    
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
    
    # Assert
    assert isinstance(result, NotificationResult), "Результат должен быть NotificationResult"
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"
    assert result.at_least_one_sent is True, "Хотя бы одно сообщение отправлено"
    
    # Проверяем вызовы send_message
    assert mock_bot.send_message.call_count == 2, "Должно быть 2 вызова send_message"
    
    # Проверяем вызовы save_bot_message
    assert mock_session_manager.save_bot_message.call_count == 2, "Должно быть 2 вызова save_bot_message"


@pytest.mark.asyncio
async def test_send_delivery_notifications_first_message_fails():
    """
    Тест ошибки отправки первого сообщения
    
    Validates: Requirements 2.5, 6.1
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    session_id = 1
    
    async def mock_send_message(**kwargs):
        text = kwargs['text']
        if text == DELIVERY_CONFIRMATION_MESSAGE:
            raise TelegramAPIError("Network error")
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
    
    # Assert - graceful degradation
    assert result.confirmation_sent is False, "Подтверждающее сообщение не должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    assert result.both_sent is False, "Оба сообщения не отправлены"
    assert result.at_least_one_sent is True, "Хотя бы одно сообщение отправлено"
    
    # Проверяем, что оба метода были вызваны
    assert mock_bot.send_message.call_count == 2, "Должно быть 2 попытки отправки"


@pytest.mark.asyncio
async def test_send_delivery_notifications_second_message_fails():
    """
    Тест ошибки отправки второго сообщения
    
    Validates: Requirements 6.2
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    session_id = 1
    
    async def mock_send_message(**kwargs):
        text = kwargs['text']
        if text == DELIVERY_MAIN_MENU_MESSAGE:
            raise TelegramAPIError("Network error")
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
    
    # Assert
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    assert result.main_menu_sent is False, "Сообщение с главным меню не должно быть отправлено"
    assert result.both_sent is False, "Оба сообщения не отправлены"
    assert result.at_least_one_sent is True, "Хотя бы одно сообщение отправлено"


@pytest.mark.asyncio
async def test_send_delivery_notifications_without_session_manager():
    """
    Тест работы без session_manager
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    session_id = 1
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    # Без session_manager
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=None
    )
    
    # Act
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # Assert - оба сообщения должны быть отправлены
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"
    
    # Проверяем, что send_message был вызван дважды
    assert mock_bot.send_message.call_count == 2, "Должно быть 2 вызова send_message"


@pytest.mark.asyncio
async def test_send_delivery_notifications_without_session_id():
    """
    Тест работы без session_id
    
    Validates: Requirements 8.4
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=mock_session_manager
    )
    
    # Act - без session_id
    result = await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=None
    )
    
    # Assert - оба сообщения должны быть отправлены
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"
    
    # Проверяем, что save_bot_message НЕ был вызван (нет session_id)
    assert mock_session_manager.save_bot_message.call_count == 0, "save_bot_message не должен вызываться без session_id"


@pytest.mark.asyncio
async def test_confirmation_message_content():
    """
    Тест содержимого подтверждающего сообщения
    
    Validates: Requirements 2.2
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=None
    )
    
    # Act
    await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=None
    )
    
    # Assert - проверяем содержимое подтверждающего сообщения
    confirmation_calls = [
        c for c in mock_bot.send_message.call_args_list
        if c[1].get('text') == DELIVERY_CONFIRMATION_MESSAGE
    ]
    
    assert len(confirmation_calls) == 1, "Должен быть один вызов для подтверждающего сообщения"
    
    confirmation_call = confirmation_calls[0]
    assert confirmation_call[1]['chat_id'] == telegram_id, "chat_id должен совпадать"
    assert confirmation_call[1]['text'] == "Данные получили, скоро отправим приз", "Текст должен быть корректным"


@pytest.mark.asyncio
async def test_main_menu_keyboard_button():
    """
    Тест наличия кнопки "🎁 Получить приз" в главном меню
    
    Validates: Requirements 3.2
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    notification_service = NotificationService(
        bot=mock_bot,
        session_manager=None
    )
    
    # Act
    await notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=None
    )
    
    # Assert - проверяем наличие кнопки в главном меню
    main_menu_calls = [
        c for c in mock_bot.send_message.call_args_list
        if c[1].get('text') == DELIVERY_MAIN_MENU_MESSAGE
    ]
    
    assert len(main_menu_calls) == 1, "Должен быть один вызов для главного меню"
    
    main_menu_call = main_menu_calls[0]
    assert 'reply_markup' in main_menu_call[1], "Должна быть клавиатура"
    
    keyboard = main_menu_call[1]['reply_markup']
    assert keyboard is not None, "Клавиатура не должна быть None"
    assert hasattr(keyboard, 'inline_keyboard'), "Должна быть inline клавиатура"
    
    # Проверяем наличие кнопки "🎁 Получить приз"
    buttons = keyboard.inline_keyboard
    button_texts = [btn.text for row in buttons for btn in row]
    assert "🎁 Получить приз" in button_texts, "Должна быть кнопка '🎁 Получить приз'"


@pytest.mark.asyncio
async def test_notification_result_at_least_one_sent_property():
    """
    Тест property at_least_one_sent в NotificationResult
    
    Validates: Requirements 4.3
    """
    # Test case 1: Оба отправлены
    result1 = NotificationResult(
        confirmation_sent=True,
        main_menu_sent=True,
        both_sent=True
    )
    assert result1.at_least_one_sent is True, "at_least_one_sent должен быть True когда оба отправлены"
    
    # Test case 2: Только первое отправлено
    result2 = NotificationResult(
        confirmation_sent=True,
        main_menu_sent=False,
        both_sent=False
    )
    assert result2.at_least_one_sent is True, "at_least_one_sent должен быть True когда первое отправлено"
    
    # Test case 3: Только второе отправлено
    result3 = NotificationResult(
        confirmation_sent=False,
        main_menu_sent=True,
        both_sent=False
    )
    assert result3.at_least_one_sent is True, "at_least_one_sent должен быть True когда второе отправлено"
    
    # Test case 4: Ничего не отправлено
    result4 = NotificationResult(
        confirmation_sent=False,
        main_menu_sent=False,
        both_sent=False
    )
    assert result4.at_least_one_sent is False, "at_least_one_sent должен быть False когда ничего не отправлено"


@pytest.mark.asyncio
async def test_session_manager_error_does_not_block_sending():
    """
    Тест что ошибка session_manager не блокирует отправку сообщений
    
    Validates: Requirements 8.5
    """
    # Arrange
    telegram_id = 123456
    prize_id = 789
    session_id = 1
    
    mock_bot = AsyncMock(spec=Bot)
    mock_bot.send_message = AsyncMock()
    
    mock_session_manager = AsyncMock(spec=SessionManager)
    mock_session_manager.save_bot_message = AsyncMock(side_effect=Exception("Database error"))
    
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
    
    # Assert - оба сообщения должны быть отправлены несмотря на ошибки сохранения
    assert result.confirmation_sent is True, "Подтверждающее сообщение должно быть отправлено"
    assert result.main_menu_sent is True, "Сообщение с главным меню должно быть отправлено"
    assert result.both_sent is True, "Оба сообщения должны быть отправлены"
    
    # Проверяем, что send_message был вызван дважды
    assert mock_bot.send_message.call_count == 2, "Должно быть 2 вызова send_message"
    
    # Проверяем, что save_bot_message был вызван дважды (попытки сохранения были)
    assert mock_session_manager.save_bot_message.call_count == 2, "Должно быть 2 попытки сохранения"
