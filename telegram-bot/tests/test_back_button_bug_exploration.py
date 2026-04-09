"""
Bug Condition Exploration Tests - Кнопка "Назад" в процессе получения физического приза

**КРИТИЧЕСКИ ВАЖНО**: Этот тест ДОЛЖЕН УПАСТЬ на неисправленном коде.
Падение подтверждает существование бага.

**НЕ ПЫТАТЬСЯ исправить тест или код, когда он упадёт**

**ЦЕЛЬ**: Выявить контрпримеры, демонстрирующие баг с кнопкой "Назад"

Этот тест кодирует ОЖИДАЕМОЕ поведение системы после исправления.
Когда баг будет исправлен, этот тест должен пройти.

Bug Condition:
- Пользователь уже заполнил форму доставки для физического приза
- Пользователь вводит кодовое слово снова
- Система показывает сообщение с кнопками "Назад" и "Изменить данные"
- Пользователь нажимает кнопку "Назад" (callback_data="confirm_delivery:{prize_id}")
- ОЖИДАЕМОЕ ПОВЕДЕНИЕ: Возврат в главное меню без уведомлений
- ТЕКУЩЕЕ ПОВЕДЕНИЕ (БАГ): Отправка уведомлений о подтверждении доставки

Validates: Requirements 1.1, 1.2, 1.3 из bugfix.md
"""
import pytest
from unittest.mock import AsyncMock, Mock
from aiogram.types import CallbackQuery, User, Message, Chat
from aiogram.fsm.context import FSMContext

from handlers.prize_flow_handler import PrizeFlowHandler
from services.notification_service import NotificationService, NotificationResult


@pytest.mark.asyncio
@pytest.mark.pbt
async def test_back_button_should_not_send_delivery_notifications():
    """
    **Property 1: Bug Condition** - Кнопка "Назад" НЕ должна отправлять уведомления о доставке
    
    **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация вызывает notification_service.send_delivery_notifications
    при нажатии кнопки "Назад", что является багом.
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация НЕ будет вызывать send_delivery_notifications
    при нажатии кнопки "Назад", а просто вернёт пользователя в главное меню.
    
    Bug Condition:
    - Пользователь с telegram_id=123456 уже заполнил форму доставки (claimed_at IS NOT NULL)
    - Пользователь нажимает кнопку "Назад" (callback_data="back_to_menu:1")
    - Handler вызывает handle_back_to_menu_callback
    
    Expected Behavior (после исправления):
    - notification_service.send_delivery_notifications НЕ вызывается
    - callback.answer вызывается БЕЗ текста (или с пустой строкой)
    - Inline-клавиатура удалена
    - Главное меню отправлено
    
    Current Behavior (баг):
    - notification_service.send_delivery_notifications ВЫЗЫВАЕТСЯ
    - callback.answer вызывается с текстом "Данные отправлены!"
    - Отправляется сообщение "Отлично, всё готово к отправке!"
    """
    # Arrange: Симулируем пользователя с уже заполненной формой доставки
    telegram_id = 123456
    prize_id = 1
    
    # Создаём mock для NotificationService
    mock_notification_service = Mock(spec=NotificationService)
    mock_notification_service.send_delivery_notifications = AsyncMock(
        return_value=NotificationResult(
            confirmation_sent=True,
            main_menu_sent=True,
            both_sent=True
        )
    )
    
    # Создаём mock для Bot
    mock_bot = AsyncMock()
    
    # Создаём PrizeFlowHandler с mock notification_service
    prize_flow_handler = PrizeFlowHandler(
        prize_service=None,  # Не нужен для этого теста
        notification_service=mock_notification_service,
        session_manager=None,
        webapp_url="https://example.com"
    )
    
    # Создаём mock для CallbackQuery
    mock_user = Mock(spec=User)
    mock_user.id = telegram_id
    mock_user.username = "test_user"
    mock_user.first_name = "Test"
    
    mock_chat = Mock(spec=Chat)
    mock_chat.id = telegram_id
    
    mock_message = Mock(spec=Message)
    mock_message.chat = mock_chat
    mock_message.message_id = 100
    mock_message.edit_reply_markup = AsyncMock()
    mock_message.answer = AsyncMock()
    
    mock_callback = Mock(spec=CallbackQuery)
    mock_callback.data = f"back_to_menu:{prize_id}"
    mock_callback.from_user = mock_user
    mock_callback.message = mock_message
    mock_callback.answer = AsyncMock()
    
    # Создаём mock для FSMContext
    mock_state = Mock(spec=FSMContext)
    mock_state.clear = AsyncMock()
    
    # Act: Вызываем handler для кнопки "Назад"
    await prize_flow_handler.handle_back_to_menu_callback(
        callback=mock_callback,
        state=mock_state,
        prize_id=prize_id,
        session_id=None
    )
    
    # Assert: Проверяем ОЖИДАЕМОЕ поведение (после исправления)
    
    # 1. notification_service.send_delivery_notifications НЕ должен вызываться
    # (это ключевая проверка бага)
    assert mock_notification_service.send_delivery_notifications.call_count == 0, (
        f"БАГ ОБНАРУЖЕН: notification_service.send_delivery_notifications "
        f"был вызван {mock_notification_service.send_delivery_notifications.call_count} раз(а), "
        f"но НЕ должен был вызываться при нажатии кнопки 'Назад'. "
        f"Пользователь нажал 'Назад' для возврата в меню, а не для подтверждения доставки. "
        f"\n\nОжидаемое поведение: кнопка 'Назад' должна просто удалить клавиатуру "
        f"и показать главное меню БЕЗ отправки уведомлений. "
        f"\n\nТекущее поведение: система ошибочно отправляет уведомления о подтверждении доставки."
    )
    
    # 2. callback.answer должен вызываться БЕЗ текста (или с пустой строкой)
    mock_callback.answer.assert_called_once()
    call_args = mock_callback.answer.call_args
    
    # Проверяем, что callback.answer вызван без аргументов или с пустой строкой
    if call_args[0]:  # Позиционные аргументы
        answer_text = call_args[0][0] if call_args[0] else ""
    elif 'text' in call_args[1]:  # Именованные аргументы
        answer_text = call_args[1]['text']
    else:
        answer_text = ""
    
    assert answer_text == "" or answer_text is None, (
        f"БАГ ОБНАРУЖЕН: callback.answer был вызван с текстом '{answer_text}', "
        f"но должен был быть вызван БЕЗ текста (пустая строка или None). "
        f"\n\nОжидаемое поведение: при нажатии 'Назад' не должно быть всплывающего уведомления. "
        f"\n\nТекущее поведение: система показывает всплывающее уведомление 'Данные отправлены!'"
    )
    
    # 3. Inline-клавиатура должна быть удалена
    mock_message.edit_reply_markup.assert_called_once_with(reply_markup=None)
    
    # 4. Главное меню должно быть отправлено
    mock_message.answer.assert_called_once()
    answer_call_args = mock_message.answer.call_args
    
    # Проверяем, что в вызове есть reply_markup (главное меню)
    assert 'reply_markup' in answer_call_args[1], (
        "Главное меню должно быть отправлено при нажатии кнопки 'Назад'"
    )


@pytest.mark.asyncio
@pytest.mark.pbt
async def test_back_button_callback_answer_text():
    """
    **Property 1.1: Bug Condition** - callback.answer НЕ должен содержать текст "Данные отправлены!"
    
    **Validates: Requirement 1.1 из bugfix.md**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация вызывает callback.answer("Данные отправлены!")
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация вызовет callback.answer() БЕЗ текста
    
    Этот тест специально проверяет текст всплывающего уведомления,
    который показывается пользователю при нажатии кнопки "Назад".
    """
    # Arrange: Симулируем пользователя с уже заполненной формой доставки
    telegram_id = 789012
    prize_id = 2
    
    # Создаём mock для NotificationService
    mock_notification_service = Mock(spec=NotificationService)
    mock_notification_service.send_delivery_notifications = AsyncMock(
        return_value=NotificationResult(
            confirmation_sent=True,
            main_menu_sent=True,
            both_sent=True
        )
    )
    
    # Создаём PrizeFlowHandler
    prize_flow_handler = PrizeFlowHandler(
        prize_service=None,
        notification_service=mock_notification_service,
        session_manager=None,
        webapp_url="https://example.com"
    )
    
    # Создаём mock для CallbackQuery
    mock_user = Mock(spec=User)
    mock_user.id = telegram_id
    mock_user.username = "test_user_2"
    
    mock_message = Mock(spec=Message)
    mock_message.edit_reply_markup = AsyncMock()
    mock_message.answer = AsyncMock()
    
    mock_callback = Mock(spec=CallbackQuery)
    mock_callback.data = f"back_to_menu:{prize_id}"
    mock_callback.from_user = mock_user
    mock_callback.message = mock_message
    mock_callback.answer = AsyncMock()
    
    mock_state = Mock(spec=FSMContext)
    mock_state.clear = AsyncMock()
    
    # Act: Вызываем handler
    await prize_flow_handler.handle_back_to_menu_callback(
        callback=mock_callback,
        state=mock_state,
        prize_id=prize_id,
        session_id=None
    )
    
    # Assert: Проверяем текст callback.answer
    mock_callback.answer.assert_called_once()
    call_args = mock_callback.answer.call_args
    
    # Извлекаем текст из вызова
    if call_args[0]:  # Позиционные аргументы
        answer_text = call_args[0][0] if call_args[0] else ""
    elif 'text' in call_args[1]:  # Именованные аргументы
        answer_text = call_args[1]['text']
    else:
        answer_text = ""
    
    # Проверяем, что текст НЕ содержит "Данные отправлены!"
    assert "Данные отправлены!" not in str(answer_text), (
        f"БАГ ОБНАРУЖЕН: callback.answer содержит текст 'Данные отправлены!', "
        f"но НЕ должен содержать этот текст при нажатии кнопки 'Назад'. "
        f"\n\nПолучено: '{answer_text}' "
        f"\n\nОжидаемое поведение: callback.answer() должен быть вызван БЕЗ текста "
        f"(пустая строка или None), чтобы не показывать всплывающее уведомление. "
        f"\n\nТекущее поведение: система показывает всплывающее уведомление 'Данные отправлены!', "
        f"что вводит пользователя в заблуждение - он нажал 'Назад', а не подтвердил отправку."
    )
    
    # Дополнительная проверка: текст должен быть пустым или None
    assert answer_text == "" or answer_text is None, (
        f"callback.answer должен быть вызван БЕЗ текста. Получено: '{answer_text}'"
    )


@pytest.mark.asyncio
@pytest.mark.pbt
async def test_back_button_should_not_trigger_delivery_confirmation_message():
    """
    **Property 1.2: Bug Condition** - НЕ должно отправляться сообщение о готовности к отправке
    
    **Validates: Requirement 1.2 из bugfix.md**
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ**: УПАДЁТ
    Текущая реализация отправляет сообщение "Отлично, всё готово к отправке!"
    через notification_service.send_delivery_notifications
    
    **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ ПОСЛЕ ИСПРАВЛЕНИЯ**: ПРОЙДЁТ
    Исправленная реализация НЕ будет отправлять это сообщение
    
    Этот тест проверяет, что при нажатии кнопки "Назад" не отправляется
    сообщение о готовности к отправке, которое должно отправляться только
    при реальном подтверждении доставки.
    """
    # Arrange: Симулируем пользователя с уже заполненной формой доставки
    telegram_id = 345678
    prize_id = 3
    
    # Создаём mock для NotificationService с отслеживанием вызовов
    mock_notification_service = Mock(spec=NotificationService)
    mock_notification_service.send_delivery_notifications = AsyncMock(
        return_value=NotificationResult(
            confirmation_sent=True,
            main_menu_sent=True,
            both_sent=True
        )
    )
    
    # Создаём PrizeFlowHandler
    prize_flow_handler = PrizeFlowHandler(
        prize_service=None,
        notification_service=mock_notification_service,
        session_manager=None,
        webapp_url="https://example.com"
    )
    
    # Создаём mock для CallbackQuery
    mock_user = Mock(spec=User)
    mock_user.id = telegram_id
    
    mock_message = Mock(spec=Message)
    mock_message.edit_reply_markup = AsyncMock()
    mock_message.answer = AsyncMock()
    
    mock_callback = Mock(spec=CallbackQuery)
    mock_callback.data = f"back_to_menu:{prize_id}"
    mock_callback.from_user = mock_user
    mock_callback.message = mock_message
    mock_callback.answer = AsyncMock()
    
    mock_state = Mock(spec=FSMContext)
    mock_state.clear = AsyncMock()
    
    # Act: Вызываем handler
    await prize_flow_handler.handle_back_to_menu_callback(
        callback=mock_callback,
        state=mock_state,
        prize_id=prize_id,
        session_id=None
    )
    
    # Assert: Проверяем, что send_delivery_notifications НЕ был вызван
    # (это означает, что сообщение о готовности к отправке не было отправлено)
    assert mock_notification_service.send_delivery_notifications.call_count == 0, (
        f"БАГ ОБНАРУЖЕН: notification_service.send_delivery_notifications "
        f"был вызван {mock_notification_service.send_delivery_notifications.call_count} раз(а). "
        f"\n\nЭтот метод отправляет сообщение: "
        f"'Отлично, всё готово к отправке! В среднем доставка занимает 2-3 недели. "
        f"Если в процессе доставки возникнут вопросы, то их можно задать в этом чате.' "
        f"\n\nОжидаемое поведение: при нажатии кнопки 'Назад' это сообщение НЕ должно отправляться, "
        f"так как пользователь не подтверждал доставку, а просто хотел вернуться в меню. "
        f"\n\nТекущее поведение: система ошибочно отправляет это сообщение, "
        f"создавая путаницу для пользователя."
    )
