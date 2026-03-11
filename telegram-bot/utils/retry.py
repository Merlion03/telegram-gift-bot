"""
Утилита для повторных попыток выполнения операций с экспоненциальной задержкой

Предоставляет декоратор retry_with_backoff для автоматического повтора
операций при возникновении исключений.
"""
import asyncio
import time
import inspect
from functools import wraps
from typing import Callable, Type, Union, Tuple, Any, Optional

from utils.logging_config import get_logger

logger = get_logger(__name__)


def retry_with_backoff(
    func: Optional[Callable] = None,
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: Union[Type[Exception], Tuple[Type[Exception], ...]] = Exception,
    **kwargs
):
    """
    Декоратор/функция для повторных попыток выполнения с экспоненциальной задержкой
    
    Может использоваться двумя способами:
    1. Как декоратор: @retry_with_backoff(max_retries=3)
    2. Как функция: await retry_with_backoff(my_func, max_retries=3, arg1=val1)
    
    Args:
        func: Функция для выполнения (опционально, для использования как декоратор)
        max_retries: Максимальное количество ПОВТОРНЫХ попыток (по умолчанию 3)
        base_delay: Базовая задержка в секундах (по умолчанию 1.0)
        backoff_factor: Коэффициент увеличения задержки (по умолчанию 2.0)
        exceptions: Исключения, при которых нужно повторять попытки
        **kwargs: Аргументы для передачи в функцию (только при использовании как функция)
    
    Returns:
        Декорированная функция или результат выполнения
    
    Example:
        # Как декоратор
        @retry_with_backoff(max_retries=3, base_delay=1.0)
        async def risky_operation():
            pass
        
        # Как функция
        result = await retry_with_backoff(
            risky_operation,
            max_retries=3,
            base_delay=1.0,
            arg1=value1
        )
    """
    # Если func передан, значит используется как функция, а не декоратор
    if func is not None:
        # Выполняем функцию с retry логикой
        return _execute_with_retry(
            func,
            max_retries=max_retries,
            base_delay=base_delay,
            backoff_factor=backoff_factor,
            exceptions=exceptions,
            func_kwargs=kwargs
        )
    
    # Иначе возвращаем декоратор
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        async def async_wrapper(*args, **kwargs) -> Any:
            """Асинхронная обёртка для повторных попыток"""
            last_exception = None
            total_attempts = max_retries + 1  # Первая попытка + повторные
            
            for attempt in range(total_attempts):
                try:
                    # Логируем попытку (только для повторных)
                    if attempt > 0:
                        logger.info(
                            "retry_attempt",
                            function=f.__name__,
                            attempt=attempt + 1,
                            max_retries=total_attempts
                        )
                    
                    # Выполняем функцию
                    if inspect.iscoroutinefunction(f):
                        result = await f(*args, **kwargs)
                    else:
                        result = f(*args, **kwargs)
                    
                    # Если успешно и это была повторная попытка, логируем успех
                    if attempt > 0:
                        logger.info(
                            "retry_success",
                            function=f.__name__,
                            attempt=attempt + 1,
                            total_attempts=attempt + 1
                        )
                    
                    return result
                    
                except exceptions as e:
                    last_exception = e
                    
                    # Логируем ошибку
                    logger.warning(
                        "retry_failed_attempt",
                        function=f.__name__,
                        attempt=attempt + 1,
                        max_retries=total_attempts,
                        error=str(e),
                        exception_type=type(e).__name__
                    )
                    
                    # Если это последняя попытка, не ждём
                    if attempt >= max_retries:
                        break
                    
                    # Вычисляем задержку с экспоненциальным увеличением
                    delay = base_delay * (backoff_factor ** attempt)
                    
                    logger.info(
                        "retry_waiting",
                        function=f.__name__,
                        delay_seconds=delay,
                        next_attempt=attempt + 2
                    )
                    
                    # Ждём перед следующей попыткой
                    await asyncio.sleep(delay)
            
            # Логируем окончательную неудачу
            logger.error(
                "retry_exhausted",
                function=f.__name__,
                total_attempts=total_attempts,
                final_error=str(last_exception),
                exception_type=type(last_exception).__name__
            )
            
            # Поднимаем последнее исключение
            raise last_exception
        
        @wraps(f)
        def sync_wrapper(*args, **kwargs) -> Any:
            """Синхронная обёртка для повторных попыток"""
            last_exception = None
            total_attempts = max_retries + 1  # Первая попытка + повторные
            
            for attempt in range(total_attempts):
                try:
                    # Логируем попытку (только для повторных)
                    if attempt > 0:
                        logger.info(
                            "retry_attempt",
                            function=f.__name__,
                            attempt=attempt + 1,
                            max_retries=total_attempts
                        )
                    
                    # Выполняем функцию
                    result = f(*args, **kwargs)
                    
                    # Если успешно и это была повторная попытка, логируем успех
                    if attempt > 0:
                        logger.info(
                            "retry_success",
                            function=f.__name__,
                            attempt=attempt + 1,
                            total_attempts=attempt + 1
                        )
                    
                    return result
                    
                except exceptions as e:
                    last_exception = e
                    
                    # Логируем ошибку
                    logger.warning(
                        "retry_failed_attempt",
                        function=f.__name__,
                        attempt=attempt + 1,
                        max_retries=total_attempts,
                        error=str(e),
                        exception_type=type(e).__name__
                    )
                    
                    # Если это последняя попытка, не ждём
                    if attempt >= max_retries:
                        break
                    
                    # Вычисляем задержку с экспоненциальным увеличением
                    delay = base_delay * (backoff_factor ** attempt)
                    
                    logger.info(
                        "retry_waiting",
                        function=f.__name__,
                        delay_seconds=delay,
                        next_attempt=attempt + 2
                    )
                    
                    # Ждём перед следующей попыткой
                    time.sleep(delay)
            
            # Логируем окончательную неудачу
            logger.error(
                "retry_exhausted",
                function=f.__name__,
                total_attempts=total_attempts,
                final_error=str(last_exception),
                exception_type=type(last_exception).__name__
            )
            
            # Поднимаем последнее исключение
            raise last_exception
        
        # Возвращаем соответствующую обёртку в зависимости от типа функции
        if inspect.iscoroutinefunction(f):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


async def _execute_with_retry(
    func: Callable,
    max_retries: int,
    base_delay: float,
    backoff_factor: float,
    exceptions: Union[Type[Exception], Tuple[Type[Exception], ...]],
    func_kwargs: dict = None
) -> Any:
    """
    Внутренняя функция для выполнения с retry логикой
    
    Args:
        func: Функция для выполнения
        max_retries: Максимальное ОБЩЕЕ количество попыток
        base_delay: Базовая задержка
        backoff_factor: Коэффициент увеличения задержки
        exceptions: Исключения для retry
        func_kwargs: Аргументы для передачи в функцию
    
    Returns:
        Результат выполнения функции
    """
    if func_kwargs is None:
        func_kwargs = {}
    
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            # Логируем попытку (только для повторных)
            if attempt > 0:
                logger.info(
                    "retry_attempt",
                    function=func.__name__,
                    attempt=attempt + 1,
                    max_retries=max_retries
                )
            
            # Выполняем функцию
            if inspect.iscoroutinefunction(func):
                result = await func(**func_kwargs)
            else:
                result = func(**func_kwargs)
            
            # Если успешно и это была повторная попытка, логируем успех
            if attempt > 0:
                logger.info(
                    "retry_success",
                    function=func.__name__,
                    attempt=attempt + 1,
                    total_attempts=attempt + 1
                )
            
            return result
            
        except exceptions as e:
            last_exception = e
            
            # Логируем ошибку
            logger.warning(
                "retry_failed_attempt",
                function=func.__name__,
                attempt=attempt + 1,
                max_retries=max_retries,
                error=str(e),
                exception_type=type(e).__name__
            )
            
            # Если это последняя попытка, не ждём
            if attempt >= max_retries - 1:
                break
            
            # Вычисляем задержку с экспоненциальным увеличением
            delay = base_delay * (backoff_factor ** attempt)
            
            logger.info(
                "retry_waiting",
                function=func.__name__,
                delay_seconds=delay,
                next_attempt=attempt + 2
            )
            
            # Ждём перед следующей попыткой
            if inspect.iscoroutinefunction(func):
                await asyncio.sleep(delay)
            else:
                time.sleep(delay)
    
    # Логируем окончательную неудачу
    logger.error(
        "retry_exhausted",
        function=func.__name__,
        total_attempts=max_retries,
        final_error=str(last_exception),
        exception_type=type(last_exception).__name__
    )
    
    # Поднимаем последнее исключение
    raise last_exception
