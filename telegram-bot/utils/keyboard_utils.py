"""
Утилиты для работы с inline-клавиатурами в Telegram боте.

Модуль предоставляет функции для автоматического удаления inline-клавиатур
из сообщений после обработки callback-запросов.
"""

from typing import Optional
from aiogram.types import CallbackQuery
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
import structlog


async def remove_inline_keyboard(
    callback: CallbackQuery,
    logger: Optional[structlog.BoundLogger] = None
) -> bool:
    """
    Удаляет inline-клавиатуру из сообщения callback-запроса.
    
    Функция вызывает Telegram API для удаления клавиатуры из сообщения.
    Обрабатывает различные типы ошибок gracefully, не прерывая основной процесс.
    
    Args:
        callback: CallbackQuery объект от aiogram
        logger: Логгер для записи событий (опционально)
    
    Returns:
        bool: True если клавиатура успешно удалена или уже отсутствует,
              False если произошла ошибка
    
    Validates:
        Requirements 4.1, 4.2, 4.3, 4.4, 4.5
        Requirements 5.1, 5.2, 5.3, 5.4, 5.5
        Requirements 6.1, 6.2, 6.3, 6.4
    """
    # Получаем контекст для логирования
    telegram_id = callback.from_user.id
    message_id = callback.message.message_id if callback.message else None
    callback_data = callback.data
    
    # Создаём базовый контекст для логов
    log_context = {
        "telegram_id": telegram_id,
        "message_id": message_id,
        "callback_data": callback_data,
    }
    
    try:
        # Пытаемся удалить клавиатуру
        await callback.message.edit_reply_markup(reply_markup=None)
        
        # Успешное удаление
        if logger:
            logger.info(
                "inline_keyboard_removed",
                **log_context,
                success=True
            )
        
        return True
        
    except TelegramBadRequest as e:
        error_message = str(e.message).lower()
        
        # "message is not modified" - клавиатура уже удалена, считается успехом
        if "message is not modified" in error_message:
            if logger:
                logger.info(
                    "inline_keyboard_already_removed",
                    **log_context,
                    success=True,
                    error_type="not_modified"
                )
            return True
        
        # "message to edit not found" - пользователь удалил сообщение
        elif "message to edit not found" in error_message:
            if logger:
                logger.warning(
                    "inline_keyboard_removal_failed",
                    **log_context,
                    success=False,
                    error_type="not_found",
                    error=str(e.message)
                )
            return False
        
        # "message can't be edited" - сообщение старше 48 часов
        elif "message can't be edited" in error_message:
            if logger:
                logger.warning(
                    "inline_keyboard_removal_failed",
                    **log_context,
                    success=False,
                    error_type="cant_edit",
                    error=str(e.message)
                )
            return False
        
        # Другие TelegramBadRequest ошибки
        else:
            if logger:
                logger.error(
                    "inline_keyboard_removal_failed",
                    **log_context,
                    success=False,
                    error_type="telegram_bad_request",
                    error=str(e.message),
                    exc_info=e
                )
            return False
    
    except Exception as e:
        # Неожиданные ошибки (сетевые, таймауты и т.д.)
        if logger:
            logger.error(
                "inline_keyboard_removal_failed",
                **log_context,
                success=False,
                error_type="unexpected",
                error=str(e),
                exc_info=e
            )
        return False



async def remove_inline_keyboard_by_id(
    bot: Bot,
    chat_id: int,
    message_id: int,
    logger: Optional[structlog.BoundLogger] = None
) -> bool:
    """
    Удаляет inline-клавиатуру из сообщения по его ID.
    
    Используется для случаев, когда callback недоступен (например, WebApp кнопки).
    Обрабатывает различные типы ошибок gracefully, не прерывая основной процесс.
    
    Args:
        bot: Bot объект от aiogram
        chat_id: ID чата
        message_id: ID сообщения с клавиатурой
        logger: Логгер для записи событий (опционально)
    
    Returns:
        bool: True если клавиатура успешно удалена или уже отсутствует,
              False если произошла ошибка
    
    Validates:
        Requirements 3.1, 3.2, 3.3, 3.4, 3.5
        Requirements 4.1, 4.2, 4.3, 4.4, 4.5
        Requirements 5.1, 5.2, 5.3, 5.4, 5.5
    """
    # Создаём базовый контекст для логов
    log_context = {
        "telegram_id": chat_id,
        "message_id": message_id,
    }
    
    try:
        # Пытаемся удалить клавиатуру
        await bot.edit_message_reply_markup(
            chat_id=chat_id,
            message_id=message_id,
            reply_markup=None
        )
        
        # Успешное удаление
        if logger:
            logger.info(
                "inline_keyboard_removed_by_id",
                **log_context,
                success=True
            )
        
        return True
        
    except TelegramBadRequest as e:
        error_message = str(e.message).lower()
        
        # "message is not modified" - клавиатура уже удалена, считается успехом
        if "message is not modified" in error_message:
            if logger:
                logger.info(
                    "inline_keyboard_already_removed_by_id",
                    **log_context,
                    success=True,
                    error_type="not_modified"
                )
            return True
        
        # "message to edit not found" - пользователь удалил сообщение
        elif "message to edit not found" in error_message:
            if logger:
                logger.warning(
                    "inline_keyboard_removal_by_id_failed",
                    **log_context,
                    success=False,
                    error_type="not_found",
                    error=str(e.message)
                )
            return False
        
        # "message can't be edited" - сообщение старше 48 часов
        elif "message can't be edited" in error_message:
            if logger:
                logger.warning(
                    "inline_keyboard_removal_by_id_failed",
                    **log_context,
                    success=False,
                    error_type="cant_edit",
                    error=str(e.message)
                )
            return False
        
        # Другие TelegramBadRequest ошибки
        else:
            if logger:
                logger.error(
                    "inline_keyboard_removal_by_id_failed",
                    **log_context,
                    success=False,
                    error_type="telegram_bad_request",
                    error=str(e.message),
                    exc_info=e
                )
            return False
    
    except Exception as e:
        # Неожиданные ошибки (сетевые, таймауты и т.д.)
        if logger:
            logger.error(
                "inline_keyboard_removal_by_id_failed",
                **log_context,
                success=False,
                error_type="unexpected",
                error=str(e),
                exc_info=e
            )
        return False
