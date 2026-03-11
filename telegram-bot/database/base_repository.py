"""
Базовый класс репозитория с правильным управлением сессиями БД
"""
from typing import Optional
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_database


class BaseRepository:
    """
    Базовый класс для всех репозиториев
    
    Обеспечивает правильное управление сессиями БД:
    - Использует контекст менеджеры для автоматического закрытия соединений
    - Поддерживает как внешние сессии, так и создание новых
    - Автоматически выполняет commit/rollback
    """
    
    def __init__(self, session: Optional[AsyncSession] = None):
        """
        Инициализирует базовый репозиторий
        
        Args:
            session: Опциональная внешняя сессия БД. Если не указана,
                    будет использоваться глобальное подключение
        """
        self._session = session
    
    def _get_session_context(self):
        """
        Получает контекст сессии БД
        
        Returns:
            AsyncContextManager: Контекст менеджер для сессии
        """
        if self._session:
            # Если у нас есть внешняя сессия, создаем фиктивный контекст
            # БЕЗ автоматического commit - управление транзакцией остается внешним
            @asynccontextmanager
            async def session_context():
                yield self._session
            
            return session_context()
        else:
            # Используем контекст менеджер из глобального подключения
            # С автоматическим commit/rollback
            return get_database().session()