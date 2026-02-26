"""
Конфигурация pytest для всех тестов.

Настраивает логирование и общие фикстуры.
"""

import pytest
import structlog
import logging
from io import StringIO


@pytest.fixture(scope="session", autouse=True)
def configure_test_logging():
    """
    Настраивает безопасное логирование для тестов.
    
    Использует StringIO вместо sys.stdout, чтобы избежать
    ошибок "I/O operation on closed file" в тестах.
    """
    # Создаём буфер для логов
    log_buffer = StringIO()
    
    # Настройка стандартного logging
    logging.basicConfig(
        format='%(message)s',
        stream=log_buffer,
        level=logging.DEBUG,
        force=True  # Переопределяем существующую конфигурацию
    )
    
    # Процессоры для structlog
    processors = [
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ]
    
    # Конфигурация structlog для тестов
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=log_buffer),
        cache_logger_on_first_use=False,  # Не кешируем в тестах
    )
    
    yield
    
    # Очистка после тестов
    log_buffer.close()


@pytest.fixture(autouse=True)
def reset_structlog_cache():
    """
    Сбрасывает кеш structlog между тестами.
    
    Это предотвращает проблемы с закрытыми файловыми дескрипторами.
    """
    # Очищаем кеш логгеров перед каждым тестом
    structlog.reset_defaults()
    
    yield
    
    # Очищаем кеш после теста
    structlog.reset_defaults()
