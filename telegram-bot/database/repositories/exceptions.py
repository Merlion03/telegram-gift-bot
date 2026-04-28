"""
Общие исключения для репозиториев базы данных.
"""


class DatabaseUnavailableError(Exception):
    """Исключение при недоступности базы данных"""
    pass


class PrizeNotFoundError(Exception):
    """Исключение при отсутствии приза в базе данных"""
    pass
