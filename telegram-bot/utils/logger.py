"""
Модуль настройки структурированного логирования с фильтрацией секретных данных.

Этот модуль настраивает structlog для JSON-форматированного логирования
с автоматической фильтрацией секретных данных (токенов, паролей, API ключей).
"""

import logging
import sys
from typing import Any, Dict
import structlog
from structlog.types import EventDict, WrappedLogger


# Список ключей, которые содержат секретные данные
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


def filter_secrets(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Процессор для фильтрации секретных данных из логов.
    
    Заменяет значения секретных полей на '***FILTERED***'.
    Проверяет как ключи верхнего уровня, так и вложенные словари.
    
    Args:
        logger: Логгер structlog
        method_name: Имя метода логирования
        event_dict: Словарь с данными события
        
    Returns:
        Отфильтрованный словарь события
    """
    def _filter_dict(data: Dict[str, Any]) -> Dict[str, Any]:
        """Рекурсивно фильтрует секреты из словаря"""
        filtered = {}
        for key, value in data.items():
            # Проверяем, является ли ключ секретным (case-insensitive)
            if any(secret_key in key.lower() for secret_key in SECRET_KEYS):
                filtered[key] = '***FILTERED***'
            elif isinstance(value, dict):
                # Рекурсивно обрабатываем вложенные словари
                filtered[key] = _filter_dict(value)
            elif isinstance(value, str) and len(value) > 20:
                # Проверяем длинные строки на наличие токенов (эвристика)
                # Токены обычно длинные и содержат буквы/цифры
                if _looks_like_token(value):
                    filtered[key] = '***FILTERED***'
                else:
                    filtered[key] = value
            else:
                filtered[key] = value
        return filtered
    
    # Фильтруем event_dict
    return _filter_dict(event_dict)


def _looks_like_token(value: str) -> bool:
    """
    Эвристическая проверка, похожа ли строка на токен.
    
    Токены обычно:
    - Длинные (> 20 символов)
    - Содержат буквы и цифры (или только буквы/цифры без пробелов)
    - Могут содержать дефисы, подчёркивания
    - Не содержат пробелов
    
    Args:
        value: Строка для проверки
        
    Returns:
        True если строка похожа на токен
    """
    if ' ' in value:
        return False
    
    # Проверяем наличие букв и цифр
    has_letters = any(c.isalpha() for c in value)
    has_digits = any(c.isdigit() for c in value)
    
    # Токен должен содержать хотя бы буквы И цифры, или только буквы/цифры
    # Строка из одних цифр или одних букв длиной > 20 тоже подозрительна
    if has_letters and has_digits:
        return True
    
    # Длинная строка только из букв или только из цифр тоже может быть токеном
    if len(value) > 25:  # Увеличиваем порог для строк без смешанного содержимого
        return has_letters or has_digits
    
    return False


def add_log_level(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Добавляет уровень логирования в event_dict.
    
    Args:
        logger: Логгер structlog
        method_name: Имя метода логирования
        event_dict: Словарь с данными события
        
    Returns:
        Словарь события с добавленным уровнем
    """
    if method_name == 'warn':
        # structlog использует 'warn', но стандарт - 'warning'
        event_dict['level'] = 'warning'
    else:
        event_dict['level'] = method_name
    return event_dict


def configure_logging(log_level: str = 'INFO', json_format: bool = True) -> None:
    """
    Настраивает структурированное логирование для приложения.
    
    Args:
        log_level: Уровень логирования (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: Использовать ли JSON формат (True) или консольный (False)
    """
    # Настройка стандартного logging
    logging.basicConfig(
        format='%(message)s',
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )
    
    # Процессоры для structlog
    processors = [
        # Добавляем timestamp
        structlog.processors.TimeStamper(fmt='iso'),
        # Добавляем уровень логирования
        add_log_level,
        # Фильтруем секретные данные
        filter_secrets,
        # Добавляем информацию о стеке для исключений
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    
    if json_format:
        # JSON формат для продакшена
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Консольный формат для разработки
        processors.extend([
            structlog.dev.ConsoleRenderer(colors=True)
        ])
    
    # Конфигурация structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = None) -> structlog.BoundLogger:
    """
    Получает настроенный логгер.
    
    Args:
        name: Имя логгера (обычно __name__ модуля)
        
    Returns:
        Настроенный structlog логгер
    """
    if name:
        return structlog.get_logger(name)
    return structlog.get_logger()
