"""
Модель администратора системы
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Administrator:
    """
    Модель администратора системы
    
    Attributes:
        tg_id: Telegram ID администратора (Primary Key)
        username: Telegram username администратора
        role: Уровень роли (0=Developer, 1=Assistant, 2=Administrator, 3=Operator)
        password_hash: Хеш пароля (Argon2id), NULL для новых администраторов
        created_at: Время создания записи
        updated_at: Время последнего обновления
    """
    tg_id: int
    username: str
    role: int
    password_hash: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    def is_first_login(self) -> bool:
        """
        Проверяет, первый ли это вход администратора
        
        Returns:
            True если password_hash IS NULL (первый вход)
            False если пароль уже установлен
        
        Validates: Requirements 8.1
        """
        return self.password_hash is None
    
    def can_assign_operators(self) -> bool:
        """
        Проверяет право назначения операторов
        
        Returns:
            True если role <= 2 (Developer, Assistant, Administrator)
            False если role > 2 (Operator)
        
        Validates: Requirements 2.3
        """
        return self.role <= 2
    
    def can_modify_config(self) -> bool:
        """
        Проверяет право изменения конфигурации системы
        
        Returns:
            True если role <= 1 (Developer, Assistant)
            False если role > 1 (Administrator, Operator)
        
        Validates: Requirements 11.3
        """
        return self.role <= 1
