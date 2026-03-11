"""
Модуль repositories для работы с данными через паттерн Repository

Содержит репозитории для различных сущностей системы
"""
from database.repositories.prize_repository import PrizeRepository, DatabaseUnavailableError

__all__ = ['PrizeRepository', 'DatabaseUnavailableError']
