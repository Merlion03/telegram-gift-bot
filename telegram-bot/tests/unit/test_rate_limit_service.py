"""
Unit-тесты для RateLimitService

Validates: Requirements 12.4, 12.5
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock
from services.rate_limit_service import RateLimitService, RateLimitResult
from database.repositories.auth_attempts_repository import AuthAttempt


class TestRateLimitService:
    """Тесты для сервиса rate limiting"""
    
    @pytest.fixture
    def mock_auth_attempts_repo(self):
        """Фикстура для мокирования AuthAttemptsRepository"""
        repo = Mock()
        repo.count_recent_attempts = AsyncMock()
        repo.record_attempt = AsyncMock()
        repo.clear_attempts = AsyncMock()
        repo.get_oldest_in_window = AsyncMock()
        return repo
    
    @pytest.fixture
    def service(self, mock_auth_attempts_repo):
        """Фикстура для создания экземпляра RateLimitService"""
        return RateLimitService(mock_auth_attempts_repo)
    
    @pytest.mark.asyncio
    async def test_allow_first_five_attempts(self, service, mock_auth_attempts_repo):
        """
        Тест разрешения первых 5 попыток
        
        Проверяет:
        - Попытки 1-5 разрешены (allowed=True)
        - attempts_count корректно отражает количество
        - blocked_until = None для разрешённых попыток
        
        Validates: Requirements 12.4
        """
        tg_id = 123456789
        
        # Тестируем попытки 1-5
        for attempt_num in range(1, 6):
            # Мокируем количество попыток
            mock_auth_attempts_repo.count_recent_attempts.return_value = attempt_num - 1
            
            # Проверяем rate limit
            result = await service.check_rate_limit(tg_id)
            
            # Проверяем, что попытка разрешена
            assert result.allowed is True
            assert result.attempts_count == attempt_num - 1
            assert result.blocked_until is None
    
    @pytest.mark.asyncio
    async def test_block_sixth_attempt(self, service, mock_auth_attempts_repo):
        """
        Тест блокировки 6-й попытки
        
        Проверяет:
        - 6-я попытка блокируется (allowed=False)
        - attempts_count = 5
        - blocked_until установлен
        
        Validates: Requirements 12.5
        """
        tg_id = 123456789
        
        # Мокируем 5 попыток
        mock_auth_attempts_repo.count_recent_attempts.return_value = 5
        
        # Мокируем самую старую попытку в окне
        oldest_attempt_time = datetime.now(timezone.utc) - timedelta(minutes=10)
        oldest_attempt = AuthAttempt(
            id=1,
            tg_id=tg_id,
            timestamp=oldest_attempt_time,
            ip_address=None,
            success=False
        )
        mock_auth_attempts_repo.get_oldest_in_window.return_value = oldest_attempt
        
        # Проверяем rate limit
        result = await service.check_rate_limit(tg_id)
        
        # Проверяем, что попытка заблокирована
        assert result.allowed is False
        assert result.attempts_count == 5
        assert result.blocked_until is not None
        
        # Проверяем, что blocked_until = oldest_attempt + 15 минут
        expected_blocked_until = oldest_attempt_time + timedelta(minutes=15)
        # Допускаем небольшую погрешность (1 секунда)
        time_diff = abs((result.blocked_until - expected_blocked_until).total_seconds())
        assert time_diff < 1
    
    @pytest.mark.asyncio
    async def test_clear_attempts_after_success(self, service, mock_auth_attempts_repo):
        """
        Тест очистки попыток после успешного входа
        
        Проверяет:
        - clear_attempts вызывает репозиторий
        - Попытки очищаются для конкретного tg_id
        
        Validates: Requirements 12.4
        """
        tg_id = 987654321
        
        # Очищаем попытки
        await service.clear_attempts(tg_id)
        
        # Проверяем, что репозиторий был вызван
        mock_auth_attempts_repo.clear_attempts.assert_called_once_with(tg_id=tg_id)
    
    @pytest.mark.asyncio
    async def test_isolation_between_different_tg_ids(self, service, mock_auth_attempts_repo):
        """
        Тест изоляции между разными tg_id
        
        Проверяет:
        - Попытки одного tg_id не влияют на другого
        - Rate limit применяется независимо для каждого tg_id
        
        Validates: Requirements 12.4, 12.5
        """
        tg_id_1 = 111111111
        tg_id_2 = 222222222
        
        # Мокируем 5 попыток для tg_id_1
        async def count_attempts_side_effect(tg_id, minutes):
            if tg_id == tg_id_1:
                return 5
            elif tg_id == tg_id_2:
                return 0
            return 0
        
        mock_auth_attempts_repo.count_recent_attempts.side_effect = count_attempts_side_effect
        
        # Мокируем oldest attempt для tg_id_1
        oldest_attempt = AuthAttempt(
            id=1,
            tg_id=tg_id_1,
            timestamp=datetime.now(timezone.utc) - timedelta(minutes=10),
            ip_address=None,
            success=False
        )
        mock_auth_attempts_repo.get_oldest_in_window.return_value = oldest_attempt
        
        # Проверяем rate limit для tg_id_1 (должен быть заблокирован)
        result_1 = await service.check_rate_limit(tg_id_1)
        assert result_1.allowed is False
        assert result_1.attempts_count == 5
        
        # Проверяем rate limit для tg_id_2 (должен быть разрешён)
        result_2 = await service.check_rate_limit(tg_id_2)
        assert result_2.allowed is True
        assert result_2.attempts_count == 0
    
    @pytest.mark.asyncio
    async def test_unblock_after_15_minutes(self, service, mock_auth_attempts_repo):
        """
        Тест разблокировки через 15 минут
        
        Проверяет:
        - После 15 минут попытки выходят из окна
        - Rate limit снимается автоматически
        
        Validates: Requirements 12.5
        """
        tg_id = 333444555
        
        # Сценарий 1: 5 попыток в окне (заблокирован)
        mock_auth_attempts_repo.count_recent_attempts.return_value = 5
        oldest_attempt = AuthAttempt(
            id=1,
            tg_id=tg_id,
            timestamp=datetime.now(timezone.utc) - timedelta(minutes=10),
            ip_address=None,
            success=False
        )
        mock_auth_attempts_repo.get_oldest_in_window.return_value = oldest_attempt
        
        result_blocked = await service.check_rate_limit(tg_id)
        assert result_blocked.allowed is False
        
        # Сценарий 2: Попытки вышли из окна (разблокирован)
        # Имитируем, что прошло 15 минут - попытки больше не в окне
        mock_auth_attempts_repo.count_recent_attempts.return_value = 0
        
        result_unblocked = await service.check_rate_limit(tg_id)
        assert result_unblocked.allowed is True
        assert result_unblocked.attempts_count == 0
    
    @pytest.mark.asyncio
    async def test_record_failed_attempt(self, service, mock_auth_attempts_repo):
        """
        Тест записи неудачной попытки
        
        Проверяет:
        - record_failed_attempt вызывает репозиторий
        - IP адрес передаётся корректно
        
        Validates: Requirements 12.4
        """
        tg_id = 666777888
        ip_address = "192.168.1.100"
        
        # Записываем неудачную попытку
        await service.record_failed_attempt(tg_id, ip_address)
        
        # Проверяем, что репозиторий был вызван
        mock_auth_attempts_repo.record_attempt.assert_called_once_with(
            tg_id=tg_id,
            ip_address=ip_address
        )
