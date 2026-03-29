"""
Конфигурация системы авторизации администраторов

Загружает параметры из переменных окружения для:
- JWT токенов (секретный ключ, алгоритм, время жизни)
- Rate limiting (максимум попыток, временное окно)
- Argon2id хеширования паролей (time cost, memory cost, parallelism)
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class AuthConfig:
    """Конфигурация системы авторизации"""
    
    # JWT Configuration
    jwt_secret: str
    jwt_algorithm: str
    session_lifetime_hours: int
    
    # Rate Limiting Configuration
    rate_limit_max_attempts: int
    rate_limit_window_minutes: int
    
    # Argon2id Configuration
    argon2_time_cost: int
    argon2_memory_cost: int
    argon2_parallelism: int
    
    @classmethod
    def from_env(cls) -> "AuthConfig":
        """
        Загружает конфигурацию из переменных окружения
        
        Обязательные переменные:
        - JWT_SECRET: секретный ключ для подписи JWT токенов
        
        Опциональные переменные (с значениями по умолчанию):
        - JWT_ALGORITHM: алгоритм подписи (по умолчанию HS256)
        - SESSION_LIFETIME_HOURS: время жизни сессии (по умолчанию 24)
        - RATE_LIMIT_MAX_ATTEMPTS: максимум попыток входа (по умолчанию 5)
        - RATE_LIMIT_WINDOW_MINUTES: окно для подсчёта попыток (по умолчанию 15)
        - ARGON2_TIME_COST: количество итераций (по умолчанию 2)
        - ARGON2_MEMORY_COST: объём памяти в KB (по умолчанию 65536)
        - ARGON2_PARALLELISM: количество потоков (по умолчанию 4)
        
        Raises:
            ValueError: если JWT_SECRET не установлен
        
        Returns:
            AuthConfig: конфигурация системы авторизации
        """
        # Обязательные переменные
        jwt_secret = os.getenv("JWT_SECRET")
        if not jwt_secret:
            raise ValueError(
                "JWT_SECRET не установлен в переменных окружения. "
                "Сгенерируйте ключ командой: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
            )
        
        # JWT Configuration
        jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        session_lifetime_hours = int(os.getenv("SESSION_LIFETIME_HOURS", "24"))
        
        # Rate Limiting Configuration
        rate_limit_max_attempts = int(os.getenv("RATE_LIMIT_MAX_ATTEMPTS", "5"))
        rate_limit_window_minutes = int(os.getenv("RATE_LIMIT_WINDOW_MINUTES", "15"))
        
        # Argon2id Configuration
        argon2_time_cost = int(os.getenv("ARGON2_TIME_COST", "2"))
        argon2_memory_cost = int(os.getenv("ARGON2_MEMORY_COST", "65536"))
        argon2_parallelism = int(os.getenv("ARGON2_PARALLELISM", "4"))
        
        return cls(
            jwt_secret=jwt_secret,
            jwt_algorithm=jwt_algorithm,
            session_lifetime_hours=session_lifetime_hours,
            rate_limit_max_attempts=rate_limit_max_attempts,
            rate_limit_window_minutes=rate_limit_window_minutes,
            argon2_time_cost=argon2_time_cost,
            argon2_memory_cost=argon2_memory_cost,
            argon2_parallelism=argon2_parallelism,
        )
    
    def validate(self) -> None:
        """
        Валидирует корректность конфигурации
        
        Проверяет:
        - JWT_SECRET не пустой
        - SESSION_LIFETIME_HOURS > 0
        - RATE_LIMIT_MAX_ATTEMPTS > 0
        - RATE_LIMIT_WINDOW_MINUTES > 0
        - Argon2id параметры в допустимых диапазонах
        
        Raises:
            ValueError: если конфигурация некорректна
        """
        if not self.jwt_secret:
            raise ValueError("JWT_SECRET не может быть пустым")
        
        if self.session_lifetime_hours <= 0:
            raise ValueError(f"SESSION_LIFETIME_HOURS должен быть > 0, получено: {self.session_lifetime_hours}")
        
        if self.rate_limit_max_attempts <= 0:
            raise ValueError(f"RATE_LIMIT_MAX_ATTEMPTS должен быть > 0, получено: {self.rate_limit_max_attempts}")
        
        if self.rate_limit_window_minutes <= 0:
            raise ValueError(f"RATE_LIMIT_WINDOW_MINUTES должен быть > 0, получено: {self.rate_limit_window_minutes}")
        
        if self.argon2_time_cost < 1:
            raise ValueError(f"ARGON2_TIME_COST должен быть >= 1, получено: {self.argon2_time_cost}")
        
        if self.argon2_memory_cost < 8192:
            raise ValueError(f"ARGON2_MEMORY_COST должен быть >= 8192 KB, получено: {self.argon2_memory_cost}")
        
        if self.argon2_parallelism < 1:
            raise ValueError(f"ARGON2_PARALLELISM должен быть >= 1, получено: {self.argon2_parallelism}")
