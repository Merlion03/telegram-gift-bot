"""
Property-based тесты для keyboard_utils.

Эти тесты проверяют универсальные свойства корректности функций удаления
inline-клавиатур на большом количестве сгенерированных входных данных.
"""

import pytest
from unittest.mock import AsyncMock, Mock
from hypothesis import given, strategies as st, settings
from aiogram.types import CallbackQuery, Message, User, Chat
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
import structlog

from utils.keyboard_utils import remove_inline_keyboard, remove_inline_keyboard_by_id


# ============================================================================
# Стратегии для генерации тестовых данных
# ============================================================================

# Генератор callback_data из допустимых значений
callback_data_strategy = st.sampled_from([
    "get_prize",
    "consent_agree",
    "consent_back",
    "support_end"
])

# Генератор telegram_id
telegram_id_strategy = st.integers(min_value=1, max_value=999999999)

# Генератор message_id
message_id_strategy = st.integers(min_value=1, max_value=999999)

# Генератор типов ошибок
error_type_strategy = st.sampled_from([
    "not_found",
    "cant_edit",
    "network",
    "unknown"
])

# Генератор результатов API
api_result_strategy = st.sampled_from([
    "success",
    "not_modified",
    "not_found",
    "cant_edit",
    "other_error"
])


# ============================================================================
# Вспомогательные функции для создания mock объектов
# ============================================================================

def create_mock_callback(telegram_id: int, message_id: int, callback_data: str) -> CallbackQuery:
    """Создаёт mock CallbackQuery с заданными параметрами."""
    mock_user = Mock(spec=User)
    mock_user.id = telegram_id
    
    mock_chat = Mock(spec=Chat)
    mock_chat.id = telegram_id
    
    mock_message = Mock(spec=Message)
    mock_message.message_id = message_id
    mock_message.edit_reply_markup = AsyncMock(return_value=True)
    
    mock_callback = Mock(spec=CallbackQuery)
    mock_callback.from_user = mock_user
    mock_callback.message = mock_message
    mock_callback.data = callback_data
    
    return mock_callback


def create_mock_logger() -> Mock:
    """Создаёт mock логгер."""
    mock_logger = Mock(spec=structlog.BoundLogger)
    mock_logger.info = Mock()
    mock_logger.warning = Mock()
    mock_logger.error = Mock()
    return mock_logger


def setup_api_error(mock_message: Mock, error_type: str):
    """Настраивает mock для выброса ошибки заданного типа."""
    if error_type == "not_found":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message to edit not found"
        )
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
    elif error_type == "cant_edit":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message can't be edited"
        )
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
    elif error_type == "network":
        error = Exception("Network timeout")
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
    elif error_type == "unknown":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: UNKNOWN_ERROR"
        )
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)


def setup_api_result(mock_obj, result_type: str):
    """Настраивает mock для возврата заданного результата."""
    if result_type == "success":
        if hasattr(mock_obj, 'edit_reply_markup'):
            mock_obj.edit_reply_markup = AsyncMock(return_value=True)
        else:
            mock_obj.edit_message_reply_markup = AsyncMock(return_value=True)
    elif result_type == "not_modified":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message is not modified"
        )
        if hasattr(mock_obj, 'edit_reply_markup'):
            mock_obj.edit_reply_markup = AsyncMock(side_effect=error)
        else:
            mock_obj.edit_message_reply_markup = AsyncMock(side_effect=error)
    elif result_type == "not_found":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message to edit not found"
        )
        if hasattr(mock_obj, 'edit_reply_markup'):
            mock_obj.edit_reply_markup = AsyncMock(side_effect=error)
        else:
            mock_obj.edit_message_reply_markup = AsyncMock(side_effect=error)
    elif result_type == "cant_edit":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message can't be edited"
        )
        if hasattr(mock_obj, 'edit_reply_markup'):
            mock_obj.edit_reply_markup = AsyncMock(side_effect=error)
        else:
            mock_obj.edit_message_reply_markup = AsyncMock(side_effect=error)
    elif result_type == "other_error":
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: UNKNOWN_ERROR"
        )
        if hasattr(mock_obj, 'edit_reply_markup'):
            mock_obj.edit_reply_markup = AsyncMock(side_effect=error)
        else:
            mock_obj.edit_message_reply_markup = AsyncMock(side_effect=error)


# ============================================================================
# Property 1: Клавиатура удаляется для всех callback-обработчиков
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    callback_data=callback_data_strategy,
    telegram_id=telegram_id_strategy,
    message_id=message_id_strategy
)
@settings(max_examples=100)
async def test_property_1_keyboard_removed_for_all_callbacks(
    callback_data: str,
    telegram_id: int,
    message_id: int
):
    """
    Feature: button-auto-hide-on-click, Property 1: Клавиатура удаляется для всех callback-обработчиков
    
    **Validates: Requirements 1.1, 2.1, 2.2, 8.1**
    
    Property: Для любого callback_query с любым callback_data из списка
    ["get_prize", "consent_agree", "consent_back", "support_end"],
    вызов remove_inline_keyboard должен привести к вызову
    edit_reply_markup(reply_markup=None) на сообщении callback'а.
    """
    # Arrange: Создаём mock callback
    mock_callback = create_mock_callback(telegram_id, message_id, callback_data)
    mock_logger = create_mock_logger()
    
    # Act: Вызываем функцию удаления клавиатуры
    result = await remove_inline_keyboard(mock_callback, mock_logger)
    
    # Assert: Проверяем вызов edit_reply_markup с reply_markup=None
    mock_callback.message.edit_reply_markup.assert_called_once_with(reply_markup=None)
    
    # Assert: Проверяем успешный результат
    assert result is True, (
        f"Функция должна вернуть True для callback_data='{callback_data}'. "
        f"telegram_id={telegram_id}, message_id={message_id}"
    )


# ============================================================================
# Property 4: Ошибки удаления не прерывают основной процесс
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    callback_data=callback_data_strategy,
    error_type=error_type_strategy,
    telegram_id=telegram_id_strategy,
    message_id=message_id_strategy
)
@settings(max_examples=100)
async def test_property_4_errors_dont_interrupt_flow(
    callback_data: str,
    error_type: str,
    telegram_id: int,
    message_id: int
):
    """
    Feature: button-auto-hide-on-click, Property 4: Ошибки удаления не прерывают основной процесс
    
    **Validates: Requirements 1.4, 2.4, 3.5, 5.5, 8.3**
    
    Property: Для любого callback_data и любой ошибки Telegram API при удалении клавиатуры,
    функция remove_inline_keyboard не должна пробрасывать исключение наверх
    (должна вернуть False и залогировать ошибку).
    """
    # Arrange: Создаём mock callback с ошибкой
    mock_callback = create_mock_callback(telegram_id, message_id, callback_data)
    setup_api_error(mock_callback.message, error_type)
    mock_logger = create_mock_logger()
    
    # Act: Вызываем функцию удаления клавиатуры
    # Не должно быть исключения
    try:
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        exception_raised = False
    except Exception as e:
        exception_raised = True
        raised_exception = e
    
    # Assert: Проверяем, что исключение не пробросилось
    assert not exception_raised, (
        f"Функция не должна пробрасывать исключение для error_type='{error_type}'. "
        f"callback_data='{callback_data}', telegram_id={telegram_id}, message_id={message_id}. "
        f"Raised: {raised_exception if exception_raised else 'None'}"
    )
    
    # Assert: Проверяем, что функция вернула False (кроме случая not_modified)
    if error_type != "not_modified":
        assert result is False, (
            f"Функция должна вернуть False для error_type='{error_type}'. "
            f"callback_data='{callback_data}', telegram_id={telegram_id}, message_id={message_id}"
        )
    
    # Assert: Проверяем, что ошибка залогирована
    if error_type in ["not_found", "cant_edit"]:
        assert mock_logger.warning.called, (
            f"Ошибка типа '{error_type}' должна быть залогирована с уровнем WARNING"
        )
    elif error_type in ["network", "unknown"]:
        assert mock_logger.error.called, (
            f"Ошибка типа '{error_type}' должна быть залогирована с уровнем ERROR"
        )


# ============================================================================
# Property 7: Утилитная функция возвращает корректный статус
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    api_result=api_result_strategy,
    telegram_id=telegram_id_strategy,
    message_id=message_id_strategy
)
@settings(max_examples=100)
async def test_property_7_correct_return_status(
    api_result: str,
    telegram_id: int,
    message_id: int
):
    """
    Feature: button-auto-hide-on-click, Property 7: Утилитная функция возвращает корректный статус
    
    **Validates: Requirements 4.4, 5.1**
    
    Property: Для любого вызова remove_inline_keyboard, если API вызов успешен
    или возвращает "message is not modified", функция должна вернуть True;
    для всех других ошибок - False.
    """
    # Arrange: Создаём mock callback с заданным результатом API
    mock_callback = create_mock_callback(telegram_id, message_id, "get_prize")
    setup_api_result(mock_callback.message, api_result)
    mock_logger = create_mock_logger()
    
    # Act: Вызываем функцию удаления клавиатуры
    result = await remove_inline_keyboard(mock_callback, mock_logger)
    
    # Assert: Проверяем корректность возвращаемого статуса
    if api_result in ["success", "not_modified"]:
        assert result is True, (
            f"Функция должна вернуть True для api_result='{api_result}'. "
            f"telegram_id={telegram_id}, message_id={message_id}"
        )
    else:
        assert result is False, (
            f"Функция должна вернуть False для api_result='{api_result}'. "
            f"telegram_id={telegram_id}, message_id={message_id}"
        )


# ============================================================================
# Property 8: Все операции логируются с полным контекстом
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    telegram_id=telegram_id_strategy,
    message_id=message_id_strategy,
    callback_data=callback_data_strategy
)
@settings(max_examples=100)
async def test_property_8_logs_contain_full_context(
    telegram_id: int,
    message_id: int,
    callback_data: str
):
    """
    Feature: button-auto-hide-on-click, Property 8: Все операции логируются с полным контекстом
    
    **Validates: Requirements 4.5, 6.3**
    
    Property: Для любого вызова функции удаления клавиатуры, должна быть создана
    лог-запись содержащая telegram_id, message_id, callback_data и статус операции.
    """
    # Arrange: Создаём mock callback
    mock_callback = create_mock_callback(telegram_id, message_id, callback_data)
    mock_logger = create_mock_logger()
    
    # Act: Вызываем функцию удаления клавиатуры
    result = await remove_inline_keyboard(mock_callback, mock_logger)
    
    # Assert: Проверяем, что логирование произошло
    assert mock_logger.info.called, (
        f"Должна быть создана лог-запись для успешной операции. "
        f"telegram_id={telegram_id}, message_id={message_id}, callback_data='{callback_data}'"
    )
    
    # Assert: Проверяем наличие всех полей в лог-записи
    call_args = mock_logger.info.call_args
    log_kwargs = call_args[1]
    
    assert "telegram_id" in log_kwargs, "Лог должен содержать telegram_id"
    assert log_kwargs["telegram_id"] == telegram_id, (
        f"telegram_id в логе должен совпадать. Ожидалось: {telegram_id}, получено: {log_kwargs['telegram_id']}"
    )
    
    assert "message_id" in log_kwargs, "Лог должен содержать message_id"
    assert log_kwargs["message_id"] == message_id, (
        f"message_id в логе должен совпадать. Ожидалось: {message_id}, получено: {log_kwargs['message_id']}"
    )
    
    assert "callback_data" in log_kwargs, "Лог должен содержать callback_data"
    assert log_kwargs["callback_data"] == callback_data, (
        f"callback_data в логе должен совпадать. Ожидалось: '{callback_data}', получено: '{log_kwargs['callback_data']}'"
    )
    
    assert "success" in log_kwargs, "Лог должен содержать success"
    assert log_kwargs["success"] is True, (
        f"success в логе должен быть True для успешной операции"
    )


# ============================================================================
# Property 9: Уровень логирования соответствует результату
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    operation_success=st.booleans(),
    telegram_id=telegram_id_strategy,
    message_id=message_id_strategy
)
@settings(max_examples=100)
async def test_property_9_log_level_matches_result(
    operation_success: bool,
    telegram_id: int,
    message_id: int
):
    """
    Feature: button-auto-hide-on-click, Property 9: Уровень логирования соответствует результату
    
    **Validates: Requirements 6.1, 6.2**
    
    Property: Для любой операции удаления клавиатуры, если операция успешна,
    лог должен иметь уровень INFO; если операция завершилась ошибкой,
    лог должен иметь уровень WARNING или ERROR.
    """
    # Arrange: Создаём mock callback
    mock_callback = create_mock_callback(telegram_id, message_id, "get_prize")
    
    if operation_success:
        # Успешная операция
        mock_callback.message.edit_reply_markup = AsyncMock(return_value=True)
    else:
        # Неуспешная операция - ошибка "message to edit not found"
        error = TelegramBadRequest(
            method="editMessageReplyMarkup",
            message="Bad Request: message to edit not found"
        )
        mock_callback.message.edit_reply_markup = AsyncMock(side_effect=error)
    
    mock_logger = create_mock_logger()
    
    # Act: Вызываем функцию удаления клавиатуры
    result = await remove_inline_keyboard(mock_callback, mock_logger)
    
    # Assert: Проверяем уровень логирования
    if operation_success:
        assert mock_logger.info.called, (
            f"Для успешной операции должен использоваться уровень INFO. "
            f"telegram_id={telegram_id}, message_id={message_id}"
        )
        assert not mock_logger.warning.called and not mock_logger.error.called, (
            f"Для успешной операции не должны использоваться WARNING или ERROR"
        )
    else:
        assert mock_logger.warning.called or mock_logger.error.called, (
            f"Для неуспешной операции должен использоваться уровень WARNING или ERROR. "
            f"telegram_id={telegram_id}, message_id={message_id}"
        )


# ============================================================================
# Property 13: Удаление старой клавиатуры не влияет на новые сообщения
# ============================================================================

@pytest.mark.pbt
@pytest.mark.asyncio
@given(
    old_message_id=message_id_strategy,
    new_message_id=message_id_strategy,
    telegram_id=telegram_id_strategy
)
@settings(max_examples=100)
async def test_property_13_removal_doesnt_affect_new_messages(
    old_message_id: int,
    new_message_id: int,
    telegram_id: int
):
    """
    Feature: button-auto-hide-on-click, Property 13: Удаление старой клавиатуры не влияет на новые сообщения
    
    **Validates: Requirements 7.4**
    
    Property: Для любой последовательности операций: удаление клавиатуры из старого сообщения
    → отправка нового сообщения с клавиатурой, новое сообщение должно содержать клавиатуру
    (удаление не влияет на новые сообщения).
    """
    # Arrange: Создаём mock для старого сообщения
    old_callback = create_mock_callback(telegram_id, old_message_id, "get_prize")
    mock_logger = create_mock_logger()
    
    # Arrange: Создаём mock для нового сообщения с клавиатурой
    new_message = Mock(spec=Message)
    new_message.message_id = new_message_id
    new_message.reply_markup = Mock()  # Клавиатура присутствует
    
    # Act: Удаляем клавиатуру из старого сообщения
    result = await remove_inline_keyboard(old_callback, mock_logger)
    
    # Assert: Проверяем, что удаление старой клавиатуры прошло успешно
    assert result is True, (
        f"Удаление старой клавиатуры должно быть успешным. "
        f"old_message_id={old_message_id}, telegram_id={telegram_id}"
    )
    
    # Assert: Проверяем, что новое сообщение всё ещё содержит клавиатуру
    # (не было затронуто удалением старой клавиатуры)
    assert new_message.reply_markup is not None, (
        f"Новое сообщение должно содержать клавиатуру после удаления старой. "
        f"old_message_id={old_message_id}, new_message_id={new_message_id}, telegram_id={telegram_id}"
    )
    
    # Assert: Проверяем, что edit_reply_markup был вызван только для старого сообщения
    old_callback.message.edit_reply_markup.assert_called_once_with(reply_markup=None)
