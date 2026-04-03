"""
Модели SQLAlchemy для базы данных

Экспортирует все модели для удобного импорта
"""
from database.models.base import Base
from database.models.support import SupportSession, SupportMessage
from database.models.prize import Prize
from database.models.gdpr_consent import GdprConsent

__all__ = [
    'Base',
    'SupportSession',
    'SupportMessage',
    'Prize',
    'GdprConsent',
]
