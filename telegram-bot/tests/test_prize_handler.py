"""
Property-based и unit тесты для PrizeHandler.
Проверяют корректность обработки кодовых слов и выдачи призов.
"""

import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from unittest.mock import AsyncMock, MagicMock
from aiogram.types import Message, User, Chat, InlineKeyboardMarkup

from handlers.prize_handler import PrizeHandler
from services.prize_service import PrizeService, PrizeStatus, PrizeResult, MissingPromoCodeError


# ============================================================================
# Вспомогательные функции
# ============================================================================

def create_mock_prize_service():
    """Создаёт mock PrizeService"""
    return AsyncMock(spec=PrizeService)


def create_prize_handler(mock_service=None):
    """Создаёт PrizeHandler с mock сервисом"""
    if mock_service is None:
        mock_service = create_mock_prize_service()
    return PrizeHandler(mock_service, webapp_url="https://test-webapp.example.com")


def create_mock_message(telegram_id=123456789):
    """Создаёт mock Message от пользователя"""
    message = AsyncMock(spec=Message)
    message.from_user = MagicMock(spec=User)
    message.from_user.id = telegram_id
    message.chat = MagicMock(spec=Chat)
    message.answer = AsyncMock()
    return message


# ============================================================================
# Property 2: Структура сообщения с цифровым призом
# ============================================================================

@given(
    promo_code=st.text(min_size=5, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Nd'))),
    instructions=st.text(min_size=10, max_size=200)
)
@pytest.mark.asyncio
async def test_property_2_digital_prize_message_structure(promo_code, instructions):
    """
    Property 2: Структура сообщения с цифровым призом
    Feature: telegram-bot-webapp-system, Property 2
    
    Для любого цифрового приза с промокодом, отправляемое пользователю 
    сообщение должно содержать сам промокод и инструкцию по его использованию.
    
    Validates: Requirements 2.2, 2.3
    """
    # Arrange: создаём handler и mock объекты
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message()
    
    # Настраиваем mock для возврата цифрового приза
    prize_result = PrizeResult(
        status=PrizeStatus.DIGITAL,
        promo_code=promo_code,
        instructions=instructions
    )
    mock_service.check_prize.return_value = prize_result
    
    # Act: обрабатываем кодовое слово
    await prize_handler.handle_code_word(mock_message, "test_code")
    
    # Assert: проверяем, что сообщение было отправлено
    assert mock_message.answer.called
    
    # Получаем текст отправленного сообщения
    sent_message = mock_message.answer.call_args[0][0]
    
    # Проверяем, что сообщение содержит промокод
    assert promo_code in sent_message, \
        f"Сообщение должно содержать промокод '{promo_code}'"
    
    # Проверяем, что сообщение содержит инструкцию
    assert instructions in sent_message, \
        f"Сообщение должно содержать инструкцию '{instructions}'"
    
    # Проверяем, что сообщение содержит поздравление
    assert "🎉" in sent_message or "Поздравляем" in sent_message, \
        "Сообщение должно содержать поздравление"


# ============================================================================
# Property 4: Отправка кнопки WebApp для физического приза
# ============================================================================

@given(
    prize_id=st.integers(min_value=1, max_value=100000),
    telegram_id=st.integers(min_value=1, max_value=999999999)
)
@pytest.mark.asyncio
async def test_property_4_physical_prize_webapp_button(prize_id, telegram_id):
    """
    Property 4: Отправка кнопки WebApp для физического приза
    Feature: telegram-bot-webapp-system, Property 4
    
    Для любого физического приза, бот должен отправить Inline-кнопку 
    с параметром web_app, содержащую корректный URL с prize_id.
    
    Validates: Requirements 3.1
    """
    # Arrange: создаём handler и mock объекты
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    
    # Настраиваем mock для возврата физического приза
    prize_result = PrizeResult(
        status=PrizeStatus.PHYSICAL,
        prize_id=prize_id,
        row_id=prize_id
    )
    mock_service.check_prize.return_value = prize_result
    
    # Act: обрабатываем кодовое слово
    await prize_handler.handle_code_word(mock_message, "test_code")
    
    # Assert: проверяем, что сообщение было отправлено с клавиатурой
    assert mock_message.answer.called
    call_kwargs = mock_message.answer.call_args[1]
    
    # Проверяем наличие reply_markup
    assert 'reply_markup' in call_kwargs, \
        "Сообщение должно содержать reply_markup с кнопкой"
    
    keyboard = call_kwargs['reply_markup']
    assert isinstance(keyboard, InlineKeyboardMarkup), \
        "reply_markup должен быть InlineKeyboardMarkup"
    
    # Проверяем наличие кнопок
    assert len(keyboard.inline_keyboard) > 0, \
        "Клавиатура должна содержать хотя бы одну строку кнопок"
    
    assert len(keyboard.inline_keyboard[0]) > 0, \
        "Первая строка должна содержать хотя бы одну кнопку"
    
    button = keyboard.inline_keyboard[0][0]
    
    # Проверяем наличие web_app параметра
    assert button.web_app is not None, \
        "Кнопка должна содержать параметр web_app"
    
    # Проверяем, что URL содержит prize_id
    webapp_url = button.web_app.url
    assert f"prize_id={prize_id}" in webapp_url, \
        f"URL должен содержать prize_id={prize_id}, получен: {webapp_url}"
    
    # Проверяем, что URL начинается с корректного базового адреса
    assert webapp_url.startswith("http://") or webapp_url.startswith("https://"), \
        f"URL должен начинаться с http:// или https://, получен: {webapp_url}"


# ============================================================================
# Дополнительные property-тесты для покрытия edge cases
# ============================================================================

@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=1, max_size=50)
)
@pytest.mark.asyncio
async def test_property_prize_not_found_message(telegram_id, code_word):
    """
    Property: Сообщение при отсутствии приза
    
    Для любого telegram_id и code_word, если приз не найден,
    пользователь должен получить сообщение "Вы ещё не победили в конкурсе".
    """
    # Arrange: создаём handler и mock объекты
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    
    # Настраиваем mock для возврата NOT_FOUND
    prize_result = PrizeResult(status=PrizeStatus.NOT_FOUND)
    mock_service.check_prize.return_value = prize_result
    
    # Act: обрабатываем кодовое слово
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert: проверяем отправленное сообщение
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    assert "Вы ещё не победили в конкурсе" in sent_message, \
        f"Сообщение должно содержать текст о том, что пользователь не победил"


@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=1, max_size=50)
)
@pytest.mark.asyncio
async def test_property_missing_promo_code_error_handling(telegram_id, code_word):
    """
    Property: Обработка ошибки отсутствующего промокода
    
    Для любого telegram_id и code_word, если возникает ошибка MissingPromoCodeError,
    пользователь должен получить сообщение с предложением обратиться в поддержку.
    """
    # Arrange: создаём handler и mock объекты
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    
    # Настраиваем mock для выброса исключения
    mock_service.check_prize.side_effect = MissingPromoCodeError(
        "Промокод отсутствует"
    )
    
    # Act: обрабатываем кодовое слово
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert: проверяем отправленное сообщение
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    assert "поддержк" in sent_message.lower(), \
        "Сообщение должно содержать упоминание о поддержке"
    
    assert "ошибк" in sent_message.lower(), \
        "Сообщение должно содержать упоминание об ошибке"


@given(
    telegram_id=st.integers(min_value=1, max_value=999999999),
    code_word=st.text(min_size=1, max_size=50)
)
@pytest.mark.asyncio
async def test_property_general_error_handling(telegram_id, code_word):
    """
    Property: Обработка общих ошибок
    
    Для любого telegram_id и code_word, если возникает общая ошибка,
    пользователь должен получить сообщение с предложением попробовать позже.
    """
    # Arrange: создаём handler и mock объекты
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id)
    
    # Настраиваем mock для выброса общего исключения
    mock_service.check_prize.side_effect = Exception("Неожиданная ошибка")
    
    # Act: обрабатываем кодовое слово
    await prize_handler.handle_code_word(mock_message, code_word)
    
    # Assert: проверяем отправленное сообщение
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    assert "ошибк" in sent_message.lower(), \
        "Сообщение должно содержать упоминание об ошибке"
    
    assert "позже" in sent_message.lower() or "попробуйте" in sent_message.lower(), \
        "Сообщение должно предлагать попробовать позже"



# ============================================================================
# Unit-тесты для edge cases
# ============================================================================

@pytest.mark.asyncio
async def test_edge_case_id_not_found_in_table():
    """
    Edge case: ID не найден в таблице
    
    Когда telegram_id не найден в Prize_Database,
    пользователь должен получить сообщение "Вы ещё не победили в конкурсе".
    
    Validates: Requirements 1.3
    """
    # Arrange
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id=999999999)
    
    # Настраиваем mock для возврата NOT_FOUND
    prize_result = PrizeResult(status=PrizeStatus.NOT_FOUND)
    mock_service.check_prize.return_value = prize_result
    
    # Act
    await prize_handler.handle_code_word(mock_message, "TESTCODE")
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "Вы ещё не победили в конкурсе" in sent_message


@pytest.mark.asyncio
async def test_edge_case_missing_promo_code():
    """
    Edge case: Отсутствующий промокод
    
    Когда для цифрового приза отсутствует промокод,
    пользователь должен получить сообщение с предложением обратиться в поддержку.
    
    Validates: Requirements 2.5
    """
    # Arrange
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id=123456)
    
    # Настраиваем mock для выброса MissingPromoCodeError
    mock_service.check_prize.side_effect = MissingPromoCodeError(
        "Промокод отсутствует для пользователя 123456"
    )
    
    # Act
    await prize_handler.handle_code_word(mock_message, "TESTCODE")
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    # Проверяем, что сообщение содержит упоминание об ошибке и поддержке
    assert "ошибк" in sent_message.lower()
    assert "поддержк" in sent_message.lower()


@pytest.mark.asyncio
async def test_edge_case_empty_promo_code():
    """
    Edge case: Пустой промокод
    
    Когда промокод является пустой строкой,
    должна быть выброшена ошибка MissingPromoCodeError.
    """
    # Arrange
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id=123456)
    
    # Настраиваем mock для выброса ошибки при пустом промокоде
    mock_service.check_prize.side_effect = MissingPromoCodeError(
        "Промокод пустой"
    )
    
    # Act
    await prize_handler.handle_code_word(mock_message, "TESTCODE")
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "ошибк" in sent_message.lower()


@pytest.mark.asyncio
async def test_edge_case_invalid_prize_type():
    """
    Edge case: Неизвестный тип приза
    
    Когда тип приза не 'digital' и не 'physical',
    система должна обработать это как NOT_FOUND.
    """
    # Arrange
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id=123456)
    
    # Настраиваем mock для возврата NOT_FOUND (неизвестный тип)
    prize_result = PrizeResult(status=PrizeStatus.NOT_FOUND)
    mock_service.check_prize.return_value = prize_result
    
    # Act
    await prize_handler.handle_code_word(mock_message, "TESTCODE")
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    assert "Вы ещё не победили в конкурсе" in sent_message


@pytest.mark.asyncio
async def test_edge_case_service_exception():
    """
    Edge case: Исключение в сервисе
    
    Когда PrizeService выбрасывает общее исключение,
    пользователь должен получить понятное сообщение об ошибке.
    """
    # Arrange
    mock_service = create_mock_prize_service()
    prize_handler = create_prize_handler(mock_service)
    mock_message = create_mock_message(telegram_id=123456)
    
    # Настраиваем mock для выброса общего исключения
    mock_service.check_prize.side_effect = Exception("Database connection failed")
    
    # Act
    await prize_handler.handle_code_word(mock_message, "TESTCODE")
    
    # Assert
    assert mock_message.answer.called
    sent_message = mock_message.answer.call_args[0][0]
    
    # Проверяем, что сообщение понятное для пользователя
    assert "ошибк" in sent_message.lower()
    assert "позже" in sent_message.lower() or "попробуйте" in sent_message.lower()
    
    # Проверяем, что технические детали не раскрываются
    assert "Database" not in sent_message
    assert "connection" not in sent_message
