"""
Сервис безопасного хеширования паролей через Argon2id
"""

from argon2 import PasswordHasher as Argon2PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHash
from typing import Optional


class PasswordHasher:
    """
    Сервис хеширования паролей через Argon2id
    
    Использует параметры, соответствующие рекомендациям OWASP:
    - time_cost: 2 итерации
    - memory_cost: 64 MB (65536 KB)
    - parallelism: 4 потока
    - hash_len: 32 байта
    - salt_len: 16 байт
    
    Validates: Requirements 8.2, 8.5, 9.1, 13.1, 13.2, 13.3, 13.4, 13.5
    """
    
    def __init__(
        self,
        time_cost: int = 2,
        memory_cost: int = 65536,
        parallelism: int = 4,
        hash_len: int = 32,
        salt_len: int = 16
    ):
        """
        Инициализирует hasher с параметрами Argon2id
        
        Args:
            time_cost: Количество итераций (по умолчанию 2)
            memory_cost: Объём памяти в KB (по умолчанию 65536 = 64 MB)
            parallelism: Количество параллельных потоков (по умолчанию 4)
            hash_len: Длина хеша в байтах (по умолчанию 32)
            salt_len: Длина соли в байтах (по умолчанию 16)
        """
        self._hasher = Argon2PasswordHasher(
            time_cost=time_cost,
            memory_cost=memory_cost,
            parallelism=parallelism,
            hash_len=hash_len,
            salt_len=salt_len
        )
    
    def hash_password(self, password: str) -> str:
        """
        Хеширует пароль с автоматической генерацией уникальной соли
        
        Args:
            password: Открытый пароль для хеширования
        
        Returns:
            Строка с хешем пароля в формате Argon2id
            Формат: $argon2id$v=19$m=65536,t=2,p=4$<salt>$<hash>
        
        Raises:
            ValueError: Если пароль пустой или None
        
        Examples:
            >>> hasher = PasswordHasher()
            >>> hash1 = hasher.hash_password("MySecurePassword123")
            >>> hash2 = hasher.hash_password("MySecurePassword123")
            >>> hash1 != hash2  # Разные соли
            True
            >>> hash1.startswith("$argon2id$")
            True
        
        Validates: Requirements 8.2, 13.1, 13.2, 13.3
        """
        if not password:
            raise ValueError("Пароль не может быть пустым")
        
        try:
            password_hash = self._hasher.hash(password)
            return password_hash
        except Exception as e:
            raise ValueError(f"Ошибка хеширования пароля: {str(e)}")
    
    def verify_password(self, password_hash: str, password: str) -> bool:
        """
        Верифицирует пароль против хеша
        
        Args:
            password_hash: Хеш пароля из базы данных
            password: Открытый пароль для проверки
        
        Returns:
            True если пароль совпадает с хешем
            False если пароль не совпадает или произошла ошибка
        
        Examples:
            >>> hasher = PasswordHasher()
            >>> password_hash = hasher.hash_password("MyPassword123")
            >>> hasher.verify_password(password_hash, "MyPassword123")
            True
            >>> hasher.verify_password(password_hash, "WrongPassword")
            False
        
        Validates: Requirements 9.1, 9.2, 9.3, 13.4, 13.5
        """
        if not password_hash or not password:
            return False
        
        try:
            # verify() выбрасывает исключение если пароль не совпадает
            self._hasher.verify(password_hash, password)
            return True
        except VerifyMismatchError:
            # Пароль не совпадает - это нормальная ситуация
            return False
        except (VerificationError, InvalidHash) as e:
            # Невалидный хеш или другая ошибка верификации
            # Логируем ошибку, но возвращаем False для безопасности
            return False
        except Exception as e:
            # Любая другая непредвиденная ошибка
            return False
