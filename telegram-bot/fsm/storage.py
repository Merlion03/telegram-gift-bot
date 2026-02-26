"""
Модуль для инициализации FSM storage.
Поддерживает Memory и Redis storage в зависимости от конфигурации.
"""

from aiogram.fsm.storage.base import BaseStorage
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.storage.redis import RedisStorage
from redis.asyncio import Redis

from config import FSMConfig


def create_fsm_storage(config: FSMConfig) -> BaseStorage:
    """
    Создаёт FSM storage на основе конфигурации.
    
    Args:
        config: Конфигурация FSM storage
        
    Returns:
        Экземпляр BaseStorage (MemoryStorage или RedisStorage)
        
    Raises:
        ValueError: Если указан неподдерживаемый тип storage
    """
    if config.storage_type == 'memory':
        return MemoryStorage()
    elif config.storage_type == 'redis':
        if not config.redis_url:
            raise ValueError('REDIS_URL должен быть установлен для Redis storage')
        redis = Redis.from_url(config.redis_url)
        return RedisStorage(redis=redis)
    else:
        raise ValueError(f'Неподдерживаемый тип storage: {config.storage_type}')
