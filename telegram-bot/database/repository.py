"""
DEPRECATED: Используйте `database.repositories.support_repository` напрямую.

Этот модуль сохранён для обратной совместимости и реэкспортирует
имена из нового места.
"""
from database.repositories.support_repository import (
    SupportRepository,
    sanitize_text,
)

__all__ = ['SupportRepository', 'sanitize_text']
