"""
Модуль repositories для работы с данными через паттерн Repository.

Содержит репозитории для различных сущностей системы.
"""
from database.repositories.exceptions import (
    DatabaseUnavailableError,
    PrizeNotFoundError,
)
from database.repositories.prize_repository import PrizeRepository
from database.repositories.support_repository import (
    SupportRepository,
    sanitize_text,
)

__all__ = [
    'DatabaseUnavailableError',
    'PrizeNotFoundError',
    'PrizeRepository',
    'SupportRepository',
    'sanitize_text',
]
