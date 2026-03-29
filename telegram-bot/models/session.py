"""
Модель сессии администратора
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Any


@dataclass
class Session:
    """
    Модель сессии администратора для JWT токенов
    
    Attributes:
        tg_id: Telegram ID администратора
        role: Уровень роли администратора
        issued_at: Время создания сессии (Unix timestamp)
        expires_at: Время истечения сессии (Unix timestamp)
    
    Validates: Requirements 10.1, 10.2, 10.4
    """
    tg_id: int
    role: int
    issued_at: int
    expires_at: int
    
    def is_expired(self) -> bool:
        """
        Проверяет истечение срока действия сессии
        
        Returns:
            True если текущее время больше expires_at
            False если сессия ещё действительна
        
        Validates: Requirements 10.4
        """
        # ИСПРАВЛЕНИЕ: Используем datetime.now(timezone.utc) вместо utcnow()
        current_timestamp = int(datetime.now(timezone.utc).timestamp())
        return current_timestamp > self.expires_at
    
    def to_jwt_claims(self) -> Dict[str, Any]:
        """
        Конвертирует сессию в JWT claims
        
        Returns:
            Словарь с полями для JWT payload:
            - tg_id: Telegram ID
            - role: Уровень роли
            - iat: Issued At (время создания)
            - exp: Expiration Time (время истечения)
        
        Validates: Requirements 10.1, 10.2
        """
        return {
            'tg_id': self.tg_id,
            'role': self.role,
            'iat': self.issued_at,
            'exp': self.expires_at
        }
