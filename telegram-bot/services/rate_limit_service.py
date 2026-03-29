"""
Сервис защиты от brute-force атак через rate limiting
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class RateLimitResult:
    """
    Результат проверки rate limit
    
    Attributes:
        allowed: Разрешена ли попытка входа
        attempts_count: Количество попыток за окно времени
        blocked_until: Время до которого заблокирован (если заблокирован)
    """
    allowed: bool
    attempts_count: int
    blocked_until: Optional[datetime]


class RateLimitService:
    """
    Сервис rate limiting для защиты от brute-force атак
    
    Использует sliding window алгоритм:
    - Максимум 5 попыток за 15 минут
    - После 5-й неудачной попытки блокировка на 15 минут
    - Блокировка снимается автоматически через 15 минут
    
    Validates: Requirements 12.4, 12.5
    """
    
    def __init__(self, auth_attempts_repository):
        """
        Инициализирует сервис rate limiting
        
        Args:
            auth_attempts_repository: Репозиторий для работы с попытками входа
        """
        self._auth_attempts_repo = auth_attempts_repository
        self._max_attempts = 5
        self._window_minutes = 15
    
    async def check_rate_limit(self, tg_id: int) -> RateLimitResult:
        """
        Проверяет rate limit для администратора
        
        Логика:
        1. Подсчитывает попытки за последние 15 минут
        2. Если >= 5 попыток - блокирует
        3. Возвращает результат с информацией о блокировке
        
        Args:
            tg_id: Telegram ID администратора
        
        Returns:
            RateLimitResult с информацией о разрешении/блокировке
        
        Examples:
            >>> # После 4 попыток - разрешено
            >>> result = await service.check_rate_limit(123456789)
            >>> result.allowed
            True
            >>> result.attempts_count
            4
            
            >>> # После 5 попыток - заблокировано
            >>> result = await service.check_rate_limit(123456789)
            >>> result.allowed
            False
            >>> result.attempts_count
            5
            >>> result.blocked_until is not None
            True
        
        Validates: Requirements 12.4, 12.5
        """
        # Подсчитываем попытки за последние 15 минут
        attempts_count = await self._auth_attempts_repo.count_recent_attempts(
            tg_id=tg_id,
            minutes=self._window_minutes
        )
        
        # Проверяем превышение лимита
        if attempts_count >= self._max_attempts:
            # Получаем самую старую попытку в окне для расчёта времени разблокировки
            # ИСПРАВЛЕНИЕ: Используем datetime.now(timezone.utc) вместо utcnow()
            window_start = datetime.now(timezone.utc) - timedelta(minutes=self._window_minutes)
            oldest_attempt = await self._auth_attempts_repo.get_oldest_in_window(
                tg_id=tg_id,
                window_start=window_start
            )
            
            # Рассчитываем время разблокировки
            if oldest_attempt:
                blocked_until = oldest_attempt.timestamp + timedelta(minutes=self._window_minutes)
            else:
                # Если не нашли старую попытку, блокируем на 15 минут от текущего времени
                blocked_until = datetime.now(timezone.utc) + timedelta(minutes=self._window_minutes)
            
            logger.warning(
                "rate_limit_exceeded",
                extra={
                    "tg_id": tg_id,
                    "attempts_count": attempts_count,
                    "blocked_until": blocked_until.isoformat(),
                    "window_minutes": self._window_minutes
                }
            )
            
            return RateLimitResult(
                allowed=False,
                attempts_count=attempts_count,
                blocked_until=blocked_until
            )
        
        # Лимит не превышен - разрешаем
        return RateLimitResult(
            allowed=True,
            attempts_count=attempts_count,
            blocked_until=None
        )
    
    async def record_failed_attempt(self, tg_id: int, ip_address: Optional[str] = None) -> None:
        """
        Записывает неудачную попытку входа
        
        Args:
            tg_id: Telegram ID администратора
            ip_address: IP адрес (опционально)
        
        Examples:
            >>> await service.record_failed_attempt(123456789)
            >>> await service.record_failed_attempt(123456789, "192.168.1.1")
        
        Validates: Requirements 12.4, 12.5
        """
        await self._auth_attempts_repo.record_attempt(
            tg_id=tg_id,
            ip_address=ip_address
        )
        
        logger.info(
            "failed_attempt_recorded",
            extra={"tg_id": tg_id, "ip_address": ip_address}
        )
    
    async def clear_attempts(self, tg_id: int) -> None:
        """
        Очищает все попытки входа для администратора
        
        Вызывается после успешной аутентификации для сброса счётчика.
        
        Args:
            tg_id: Telegram ID администратора
        
        Examples:
            >>> # После успешного входа очищаем попытки
            >>> await service.clear_attempts(123456789)
        
        Validates: Requirements 12.4, 12.5
        """
        await self._auth_attempts_repo.clear_attempts(tg_id=tg_id)
