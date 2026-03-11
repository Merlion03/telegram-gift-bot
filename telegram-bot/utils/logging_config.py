"""
Конфигурация структурированного логирования с использованием structlog

Этот модуль настраивает structlog для всего приложения с:
- Временными метками в ISO формате
- Уровнями логирования: INFO, WARNING, ERROR
- Структурированным выводом в JSON формате для production
- Читаемым форматом для development
"""

import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict, Processor


def add_app_context(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Добавляет контекст приложения к каждому лог-событию
    
    Args:
        logger: Logger instance
        method_name: Имя метода логирования
        event_dict: Словарь события
    
    Returns:
        Обновленный словарь события
    """
    event_dict["app"] = "telegram-bot"
    return event_dict


def configure_logging(log_level: str = "INFO", json_logs: bool = False) -> None:
    """
    Настраивает structlog для приложения
    
    Args:
        log_level: Уровень логирования (INFO, WARNING, ERROR)
        json_logs: Использовать JSON формат (True для production)
    """
    # Настройка стандартного logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )
    
    # Процессоры для structlog
    processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        add_app_context,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]
    
    # Выбор финального процессора в зависимости от режима
    if json_logs:
        # JSON формат для production
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Читаемый формат для development
        processors.append(structlog.dev.ConsoleRenderer())
    
    # Конфигурация structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """
    Получает настроенный logger для модуля
    
    Args:
        name: Имя модуля (обычно __name__)
    
    Returns:
        Настроенный structlog logger
    """
    return structlog.get_logger(name)
