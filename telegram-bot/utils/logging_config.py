"""
Конфигурация структурированного логирования с использованием structlog.

Этот модуль настраивает structlog для всего приложения с:
- Временными метками в ISO формате
- Уровнями логирования: INFO, WARNING, ERROR
- Структурированным выводом в JSON формате для production
- Читаемым форматом для development
- Автоматической фильтрацией секретных данных (токенов, паролей, API ключей)
"""

import logging
import sys
from typing import Any, Dict, Optional

import structlog
from structlog.types import EventDict, Processor, WrappedLogger


SECRET_KEYS = {
    'token',
    'bot_token',
    'api_key',
    'api_secret',
    'password',
    'password_hash',
    'secret',
    'credentials',
    'auth',
    'authorization',
    'bearer',
    'private_key',
    'access_token',
    'refresh_token',
    'session_key',
    'jwt',
    'session_token',
}


def _looks_like_token(value: str) -> bool:
    """
    Эвристическая проверка, похожа ли строка на токен.

    Токен обычно длинный, без пробелов и без подчёркиваний/тире,
    смешивает буквы и цифры (как base64/JWT/hex).

    Намеренно не считаем токенами строки с подчёркиваниями или дефисами
    (часто это event-имена или slug-и) и строки только из букв.
    """
    if ' ' in value or '_' in value or '-' in value:
        return False

    has_letters = any(c.isalpha() for c in value)
    has_digits = any(c.isdigit() for c in value)

    return has_letters and has_digits


def filter_secrets(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Процессор для фильтрации секретных данных из логов.

    Заменяет значения секретных полей на '***FILTERED***'.
    Проверяет как ключи верхнего уровня, так и вложенные словари.
    """
    def _filter_dict(data: Dict[str, Any]) -> Dict[str, Any]:
        filtered = {}
        for key, value in data.items():
            if any(secret_key in key.lower() for secret_key in SECRET_KEYS):
                filtered[key] = '***FILTERED***'
            elif isinstance(value, dict):
                filtered[key] = _filter_dict(value)
            elif isinstance(value, str) and len(value) > 20 and _looks_like_token(value):
                filtered[key] = '***FILTERED***'
            else:
                filtered[key] = value
        return filtered

    return _filter_dict(event_dict)


def add_app_context(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """Добавляет контекст приложения к каждому лог-событию."""
    event_dict["app"] = "telegram-bot"
    return event_dict


def configure_logging(
    log_level: str = "INFO",
    json_logs: bool = False,
    json_format: Optional[bool] = None,
) -> None:
    """
    Настраивает structlog для приложения.

    Args:
        log_level: Уровень логирования (INFO, WARNING, ERROR)
        json_logs: Использовать JSON формат (True для production)
        json_format: Алиас для json_logs (для обратной совместимости).
            Если задан, имеет приоритет над json_logs.
    """
    if json_format is not None:
        json_logs = json_format

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )

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
        filter_secrets,
    ]

    if json_logs:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: Optional[str] = None) -> structlog.stdlib.BoundLogger:
    """
    Получает настроенный logger для модуля.

    Args:
        name: Имя модуля (обычно __name__)
    """
    if name:
        return structlog.get_logger(name)
    return structlog.get_logger()
