"""
Unit-тесты для keyboard_utils.

Эти тесты проверяют конкретные примеры использования, граничные случаи
и условия ошибок для функций удаления inline-клавиатур.
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch
from aiogram.types import CallbackQuery, Message, User, Chat
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
import structlog

from utils.keyboard_utils import remove_inline_keyboard, remove_inline_keyboard_by_id


class TestRemoveInlineKeyboard:
    """Тесты для функции remove_inline_keyboard."""
    
    @pytest.mark.asyncio
    async def test_successful_keyboard_removal(self):
        """
        Тест: успешное удаление клавиатуры.
        
        Validates: Requirements 4.3, 4.4, 6.1, 6.3
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 123456789
        
        mock_chat = Mock(spec=Chat)
        mock_chat.id = 123456789
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 42
        mock_message.edit_reply_markup = AsyncMock(return_value=True)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "get_prize"
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.info = Mock()
        
        # Вызываем функцию
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        
        # Проверяем результат
        assert result is True
        
        # Проверяем вызов edit_reply_markup с reply_markup=None
        mock_message.edit_reply_markup.assert_called_once_with(reply_markup=None)
        
        # Проверяем логирование с полным контекстом
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        assert call_args[0][0] == "inline_keyboard_removed"
        assert call_args[1]["telegram_id"] == 123456789
        assert call_args[1]["message_id"] == 42
        assert call_args[1]["callback_data"] == "get_prize"
        assert call_args[1]["success"] is True



    @pytest.mark.asyncio
    async def test_message_is_not_modified_error(self):
        """
        Тест: обработка ошибки "message is not modified" (считается успехом).
        
        Validates: Requirements 5.1, 6.1
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 123456789
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 42
        
        # Mock API возвращает TelegramBadRequest с "message is not modified"
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: message is not modified")
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "consent_agree"
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.info = Mock()
        
        # Вызываем функцию
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        
        # Проверяем результат - должен быть True (считается успехом)
        assert result is True
        
        # Проверяем логирование с уровнем INFO
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        assert call_args[0][0] == "inline_keyboard_already_removed"
        assert call_args[1]["telegram_id"] == 123456789
        assert call_args[1]["message_id"] == 42
        assert call_args[1]["callback_data"] == "consent_agree"
        assert call_args[1]["success"] is True
        assert call_args[1]["error_type"] == "not_modified"



    @pytest.mark.asyncio
    async def test_message_to_edit_not_found_error(self):
        """
        Тест: обработка ошибки "message to edit not found".
        
        Validates: Requirements 5.2, 6.2, 6.4
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 987654321
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 99
        
        # Mock API возвращает TelegramBadRequest с "message to edit not found"
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: message to edit not found")
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "consent_back"
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.warning = Mock()
        
        # Вызываем функцию
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем WARNING и текстом ошибки
        mock_logger.warning.assert_called_once()
        call_args = mock_logger.warning.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_failed"
        assert call_args[1]["telegram_id"] == 987654321
        assert call_args[1]["message_id"] == 99
        assert call_args[1]["callback_data"] == "consent_back"
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "not_found"
        assert "message to edit not found" in call_args[1]["error"]



    @pytest.mark.asyncio
    async def test_message_cant_be_edited_error(self):
        """
        Тест: обработка ошибки "message can't be edited".
        
        Validates: Requirements 5.3, 6.2, 6.4
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 555555555
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 77
        
        # Mock API возвращает TelegramBadRequest с "message can't be edited"
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: message can't be edited")
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "support_end"
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.warning = Mock()
        
        # Вызываем функцию
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем WARNING и текстом ошибки
        mock_logger.warning.assert_called_once()
        call_args = mock_logger.warning.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_failed"
        assert call_args[1]["telegram_id"] == 555555555
        assert call_args[1]["message_id"] == 77
        assert call_args[1]["callback_data"] == "support_end"
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "cant_edit"
        assert "message can't be edited" in call_args[1]["error"]



    @pytest.mark.asyncio
    async def test_unknown_telegram_bad_request_error(self):
        """
        Тест: обработка неизвестной TelegramBadRequest ошибки.
        
        Validates: Requirements 5.4, 6.2, 6.4
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 111222333
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 88
        
        # Mock API возвращает неизвестную TelegramBadRequest
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: BUTTON_URL_INVALID")
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "get_prize"
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.error = Mock()
        
        # Вызываем функцию
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем ERROR и полным контекстом
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_failed"
        assert call_args[1]["telegram_id"] == 111222333
        assert call_args[1]["message_id"] == 88
        assert call_args[1]["callback_data"] == "get_prize"
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "telegram_bad_request"
        assert "BUTTON_URL_INVALID" in call_args[1]["error"]
    
    @pytest.mark.asyncio
    async def test_network_error(self):
        """
        Тест: обработка сетевой ошибки.
        
        Validates: Requirements 5.4, 6.2, 6.4
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 444555666
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 55
        
        # Mock API выбрасывает сетевую ошибку
        error = Exception("Network timeout")
        mock_message.edit_reply_markup = AsyncMock(side_effect=error)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "consent_agree"
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.error = Mock()
        
        # Вызываем функцию
        result = await remove_inline_keyboard(mock_callback, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем ERROR и полным контекстом
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_failed"
        assert call_args[1]["telegram_id"] == 444555666
        assert call_args[1]["message_id"] == 55
        assert call_args[1]["callback_data"] == "consent_agree"
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "unexpected"
        assert "Network timeout" in call_args[1]["error"]
    
    @pytest.mark.asyncio
    async def test_without_logger(self):
        """
        Тест: функция работает без логгера (logger=None).
        
        Validates: Requirements 4.4
        """
        # Создаём mock объекты
        mock_user = Mock(spec=User)
        mock_user.id = 777888999
        
        mock_message = Mock(spec=Message)
        mock_message.message_id = 33
        mock_message.edit_reply_markup = AsyncMock(return_value=True)
        
        mock_callback = Mock(spec=CallbackQuery)
        mock_callback.from_user = mock_user
        mock_callback.message = mock_message
        mock_callback.data = "get_prize"
        
        # Вызываем функцию БЕЗ логгера
        result = await remove_inline_keyboard(mock_callback, logger=None)
        
        # Проверяем результат - должен быть True
        assert result is True
        
        # Проверяем вызов edit_reply_markup
        mock_message.edit_reply_markup.assert_called_once_with(reply_markup=None)





class TestRemoveInlineKeyboardById:
    """Тесты для функции remove_inline_keyboard_by_id."""
    
    @pytest.mark.asyncio
    async def test_successful_keyboard_removal_by_id(self):
        """
        Тест: успешное удаление клавиатуры по ID.
        
        Validates: Requirements 4.3, 4.4, 6.1, 6.3
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        mock_bot.edit_message_reply_markup = AsyncMock(return_value=True)
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.info = Mock()
        
        # Параметры
        chat_id = 123456789
        message_id = 42
        
        # Вызываем функцию
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, mock_logger)
        
        # Проверяем результат
        assert result is True
        
        # Проверяем вызов edit_message_reply_markup с правильными параметрами
        mock_bot.edit_message_reply_markup.assert_called_once_with(
            chat_id=chat_id,
            message_id=message_id,
            reply_markup=None
        )
        
        # Проверяем логирование с полным контекстом
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        assert call_args[0][0] == "inline_keyboard_removed_by_id"
        assert call_args[1]["telegram_id"] == chat_id
        assert call_args[1]["message_id"] == message_id
        assert call_args[1]["success"] is True



    @pytest.mark.asyncio
    async def test_message_is_not_modified_error_by_id(self):
        """
        Тест: обработка ошибки "message is not modified" в remove_inline_keyboard_by_id.
        
        Validates: Requirements 5.1, 6.1
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: message is not modified")
        mock_bot.edit_message_reply_markup = AsyncMock(side_effect=error)
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.info = Mock()
        
        # Параметры
        chat_id = 987654321
        message_id = 99
        
        # Вызываем функцию
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, mock_logger)
        
        # Проверяем результат - должен быть True (считается успехом)
        assert result is True
        
        # Проверяем логирование с уровнем INFO
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        
        assert call_args[0][0] == "inline_keyboard_already_removed_by_id"
        assert call_args[1]["telegram_id"] == chat_id
        assert call_args[1]["message_id"] == message_id
        assert call_args[1]["success"] is True
        assert call_args[1]["error_type"] == "not_modified"
    
    @pytest.mark.asyncio
    async def test_message_to_edit_not_found_error_by_id(self):
        """
        Тест: обработка ошибки "message to edit not found" в remove_inline_keyboard_by_id.
        
        Validates: Requirements 5.2, 6.2, 6.4
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: message to edit not found")
        mock_bot.edit_message_reply_markup = AsyncMock(side_effect=error)
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.warning = Mock()
        
        # Параметры
        chat_id = 555555555
        message_id = 77
        
        # Вызываем функцию
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем WARNING
        mock_logger.warning.assert_called_once()
        call_args = mock_logger.warning.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_by_id_failed"
        assert call_args[1]["telegram_id"] == chat_id
        assert call_args[1]["message_id"] == message_id
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "not_found"
        assert "message to edit not found" in call_args[1]["error"]
    
    @pytest.mark.asyncio
    async def test_message_cant_be_edited_error_by_id(self):
        """
        Тест: обработка ошибки "message can't be edited" в remove_inline_keyboard_by_id.
        
        Validates: Requirements 5.3, 6.2, 6.4
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: message can't be edited")
        mock_bot.edit_message_reply_markup = AsyncMock(side_effect=error)
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.warning = Mock()
        
        # Параметры
        chat_id = 111222333
        message_id = 88
        
        # Вызываем функцию
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем WARNING
        mock_logger.warning.assert_called_once()
        call_args = mock_logger.warning.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_by_id_failed"
        assert call_args[1]["telegram_id"] == chat_id
        assert call_args[1]["message_id"] == message_id
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "cant_edit"
        assert "message can't be edited" in call_args[1]["error"]
    
    @pytest.mark.asyncio
    async def test_unknown_error_by_id(self):
        """
        Тест: обработка неизвестной ошибки в remove_inline_keyboard_by_id.
        
        Validates: Requirements 5.4, 6.2, 6.4
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        error = TelegramBadRequest(method="editMessageReplyMarkup", message="Bad Request: UNKNOWN_ERROR")
        mock_bot.edit_message_reply_markup = AsyncMock(side_effect=error)
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.error = Mock()
        
        # Параметры
        chat_id = 444555666
        message_id = 55
        
        # Вызываем функцию
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем ERROR
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_by_id_failed"
        assert call_args[1]["telegram_id"] == chat_id
        assert call_args[1]["message_id"] == message_id
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "telegram_bad_request"
        assert "UNKNOWN_ERROR" in call_args[1]["error"]
    
    @pytest.mark.asyncio
    async def test_network_error_by_id(self):
        """
        Тест: обработка сетевой ошибки в remove_inline_keyboard_by_id.
        
        Validates: Requirements 5.4, 6.2, 6.4
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        error = Exception("Connection timeout")
        mock_bot.edit_message_reply_markup = AsyncMock(side_effect=error)
        
        # Создаём mock логгер
        mock_logger = Mock(spec=structlog.BoundLogger)
        mock_logger.error = Mock()
        
        # Параметры
        chat_id = 777888999
        message_id = 33
        
        # Вызываем функцию
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, mock_logger)
        
        # Проверяем результат - должен быть False
        assert result is False
        
        # Проверяем логирование с уровнем ERROR
        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        
        assert call_args[0][0] == "inline_keyboard_removal_by_id_failed"
        assert call_args[1]["telegram_id"] == chat_id
        assert call_args[1]["message_id"] == message_id
        assert call_args[1]["success"] is False
        assert call_args[1]["error_type"] == "unexpected"
        assert "Connection timeout" in call_args[1]["error"]
    
    @pytest.mark.asyncio
    async def test_without_logger_by_id(self):
        """
        Тест: функция remove_inline_keyboard_by_id работает без логгера.
        
        Validates: Requirements 4.4
        """
        # Создаём mock bot
        mock_bot = Mock(spec=Bot)
        mock_bot.edit_message_reply_markup = AsyncMock(return_value=True)
        
        # Параметры
        chat_id = 999888777
        message_id = 11
        
        # Вызываем функцию БЕЗ логгера
        result = await remove_inline_keyboard_by_id(mock_bot, chat_id, message_id, logger=None)
        
        # Проверяем результат - должен быть True
        assert result is True
        
        # Проверяем вызов edit_message_reply_markup
        mock_bot.edit_message_reply_markup.assert_called_once_with(
            chat_id=chat_id,
            message_id=message_id,
            reply_markup=None
        )
