"""
Database модуль для работы с PostgreSQL
Содержит модели, подключение и repository слой
"""
from database.models import Base, SupportSession, SupportMessage
from database.connection import (
    DatabaseConnection,
    init_database,
    get_database
)
from database.repository import SupportRepository


__all__ = [
    # Модели
    'Base',
    'SupportSession',
    'SupportMessage',
    
    # Подключение
    'DatabaseConnection',
    'init_database',
    'get_database',
    
    # Repository
    'SupportRepository',
]
