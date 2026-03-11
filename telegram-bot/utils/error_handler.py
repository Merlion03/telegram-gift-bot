"""
Глобальный обработчик ошибок для Telegram бота.

Обеспечивает централизованную обработку всех исключений с логированием
и отправкой понятных сообщений пользователям.
"""

from typing import Any
from aiogram import Router
from aiogram.types import Update, ErrorEvent
from aiogram.filters import ExceptionTypeFilter

from utils.logging_config import get_logger

logger = get_logger(__name__)

# Создаём router для обработчиков ошибок
error_router = Router()


@error_router.error()
async def global_error_handler(event: ErrorEvent) -> Any:
    """
    Глобальный обработчик всех необработанных ошибок в боте.
    
    Логирует ошибку с полным контекстом и отправляет пользователю
    понятное сообщение об ошибке.
    
    Args:
        event: Событие ошибки от aiogram
        
    Returns:
        True чтобы пометить ошибку как обработанную
    """
    update = event.update
    exception = event.exception
    
    # Извлекаем контекст из update
    context = _extract_context(update)
    
    # Логируем ошибку с полным контекстом
    logger.error(
        "unhandled_bot_error",
        error_type=type(exception).__name__,
        error_message=str(exception),
        user_id=context.get('user_id'),
        chat_id=context.get('chat_id'),
        update_type=context.get('update_type'),
        message_text=context.get('message_text'),
        exc_info=exception
    )
    
    # Отправляем пользователю понятное сообщение
    await _send_error_message_to_user(update)
    
    return True


def _extract_context(update: Update) -> dict:
    """
    Извлекает контекст из update для логирования.
    
    Args:
        update: Update объект от Telegram
        
    Returns:
        Словарь с контекстной информацией
    """
    context = {
        'update_type': None,
        'user_id': None,
        'chat_id': None,
        'message_text': None,
    }
    
    try:
        # Определяем тип update
        if update.message:
            context['update_type'] = 'message'
            context['user_id'] = update.message.from_user.id if update.message.from_user else None
            context['chat_id'] = update.message.chat.id
            context['message_text'] = update.message.text
        elif update.callback_query:
            context['update_type'] = 'callback_query'
            context['user_id'] = update.callback_query.from_user.id
            context['chat_id'] = update.callback_query.message.chat.id if update.callback_query.message else None
        elif update.inline_query:
            context['update_type'] = 'inline_query'
            context['user_id'] = update.inline_query.from_user.id
        
    except Exception as e:
        logger.warning(
            "failed_to_extract_context",
            error=str(e)
        )
    
    return context


async def _send_error_message_to_user(update: Update) -> None:
    """
    Отправляет пользователю понятное сообщение об ошибке.
    
    Args:
        update: Update объект от Telegram
    """
    error_message = (
        "Произошла ошибка при обработке вашего запроса. "
        "Мы уже работаем над её исправлением. "
        "Пожалуйста, попробуйте позже."
    )
    
    try:
        if update.message:
            await update.message.answer(error_message)
        elif update.callback_query:
            await update.callback_query.answer(
                error_message,
                show_alert=True
            )
    except Exception as e:
        logger.error(
            "failed_to_send_error_message",
            error=str(e)
        )


@error_router.error(ExceptionTypeFilter(ConnectionError, TimeoutError))
async def network_error_handler(event: ErrorEvent) -> Any:
    """
    Специализированный обработчик сетевых ошибок.
    
    Args:
        event: Событие ошибки
        
    Returns:
        True чтобы пометить ошибку как обработанную
    """
    update = event.update
    exception = event.exception
    context = _extract_context(update)
    
    logger.warning(
        "network_error",
        error_type=type(exception).__name__,
        error_message=str(exception),
        user_id=context.get('user_id'),
        chat_id=context.get('chat_id')
    )
    
    # Отправляем специфичное сообщение о сетевой ошибке
    error_message = (
        "Временные проблемы с подключением. "
        "Пожалуйста, попробуйте ещё раз через несколько секунд."
    )
    
    try:
        if update.message:
            await update.message.answer(error_message)
        elif update.callback_query:
            await update.callback_query.answer(error_message, show_alert=True)
    except Exception as e:
        logger.error("failed_to_send_network_error_message", error=str(e))
    
    return True


def setup_error_handlers(dp) -> None:
    """
    Регистрирует обработчики ошибок в диспетчере.
    
    Args:
        dp: Dispatcher aiogram
    """
    dp.include_router(error_router)
    
    logger.info("error_handlers_registered")
