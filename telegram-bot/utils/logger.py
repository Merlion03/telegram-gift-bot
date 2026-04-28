"""
DEPRECATED: Используйте `utils.logging_config` напрямую.

Этот модуль сохранён для обратной совместимости и реэкспортирует
имена из `utils.logging_config`.
"""
from utils.logging_config import (
    SECRET_KEYS,
    add_app_context,
    configure_logging,
    filter_secrets,
    get_logger,
)

__all__ = [
    'SECRET_KEYS',
    'add_app_context',
    'configure_logging',
    'filter_secrets',
    'get_logger',
]
