"""
Утилита для retry логики с экспоненциальной задержкой.
"""

import asyncio
from typing import Callable, TypeVar, Any
import structlog

logger = structlog.get_logger(__name__)

T = TypeVar('T')


async def retry_with_backoff(
    func: Callable[..., Any],
    max_retries: int = 3,
    base_delay: float = 1.0,
    *args,
    **kwargs
) -> T:
    """
    Выполняет функцию с retry логикой и экспоненциальной задержкой
    
    Args:
        func: Функция для выполнения
        max_retries: Максимальное количество попыток (по умолчанию 3)
        base_delay: Базовая задержка в секундах (по умолчанию 1.0)
        *args: Позиционные аргументы для функции
        **kwargs: Именованные аргументы для функции
        
    Returns:
        Результат выполнения функции
        
    Raises:
        Exception: Последнее исключение после исчерпания всех попыток
    """
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            # Выполняем функцию
            result = await func(*args, **kwargs)
            
            # Если успешно и это не первая попытка, логируем успех
            if attempt > 0:
                logger.info(
                    "retry_succeeded",
                    attempt=attempt + 1,
                    function=func.__name__
                )
            
            return result
            
        except Exception as e:
            last_exception = e
            
            # Если это последняя попытка, выбрасываем исключение
            if attempt == max_retries - 1:
                logger.error(
                    "all_retries_exhausted",
                    function=func.__name__,
                    max_retries=max_retries,
                    error=str(e)
                )
                raise
            
            # Вычисляем задержку с экспоненциальным ростом
            delay = base_delay * (2 ** attempt)
            
            logger.warning(
                "retry_attempt_failed",
                function=func.__name__,
                attempt=attempt + 1,
                max_retries=max_retries,
                next_retry_in=delay,
                error=str(e)
            )
            
            # Ждём перед следующей попыткой
            await asyncio.sleep(delay)
    
    # Этот код не должен выполниться, но на всякий случай
    if last_exception:
        raise last_exception
