"""
Unit-тесты для ConfigService

Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
"""

import pytest
from unittest.mock import AsyncMock
from services.config_service import ConfigService


@pytest.fixture
def mock_config_repo():
    """Мок репозитория конфигурации"""
    return AsyncMock()


@pytest.fixture
def config_service(mock_config_repo):
    """Фикстура ConfigService с моком"""
    return ConfigService(config_repository=mock_config_repo)


class TestGetSessionLifetime:
    """Тесты получения времени жизни сессий"""
    
    @pytest.mark.asyncio
    async def test_get_default_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест получения времени жизни сессий по умолчанию
        
        Validates: Requirements 11.1, 11.2
        """
        # Arrange: репозиторий возвращает значение по умолчанию
        mock_config_repo.get_session_lifetime_hours.return_value = 24
        
        # Act
        lifetime = await config_service.get_session_lifetime()
        
        # Assert
        assert lifetime == 24
        mock_config_repo.get_session_lifetime_hours.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_custom_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест получения кастомного времени жизни сессий
        
        Validates: Requirements 11.1, 11.2
        """
        # Arrange: репозиторий возвращает кастомное значение
        mock_config_repo.get_session_lifetime_hours.return_value = 48
        
        # Act
        lifetime = await config_service.get_session_lifetime()
        
        # Assert
        assert lifetime == 48


class TestSetSessionLifetime:
    """Тесты установки времени жизни сессий"""
    
    @pytest.mark.asyncio
    async def test_developer_can_set_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест: Developer может устанавливать время жизни сессий
        
        Validates: Requirements 11.3, 11.4
        """
        # Arrange
        mock_config_repo.set_session_lifetime_hours = AsyncMock()
        
        # Act: Developer (role=0) устанавливает 48 часов
        success = await config_service.set_session_lifetime(48, admin_role=0)
        
        # Assert
        assert success is True
        mock_config_repo.set_session_lifetime_hours.assert_called_once_with(48)
    
    @pytest.mark.asyncio
    async def test_assistant_can_set_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест: Assistant может устанавливать время жизни сессий
        
        Validates: Requirements 11.3, 11.4
        """
        # Arrange
        mock_config_repo.set_session_lifetime_hours = AsyncMock()
        
        # Act: Assistant (role=1) устанавливает 72 часа
        success = await config_service.set_session_lifetime(72, admin_role=1)
        
        # Assert
        assert success is True
        mock_config_repo.set_session_lifetime_hours.assert_called_once_with(72)
    
    @pytest.mark.asyncio
    async def test_administrator_cannot_set_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест: Administrator не может устанавливать время жизни сессий
        
        Validates: Requirements 11.3
        """
        # Act: Administrator (role=2) пытается установить 48 часов
        success = await config_service.set_session_lifetime(48, admin_role=2)
        
        # Assert: операция должна быть отклонена
        assert success is False
        
        # Проверяем, что репозиторий не был вызван
        mock_config_repo.set_session_lifetime_hours.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_operator_cannot_set_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест: Operator не может устанавливать время жизни сессий
        
        Validates: Requirements 11.3
        """
        # Act: Operator (role=3) пытается установить 48 часов
        success = await config_service.set_session_lifetime(48, admin_role=3)
        
        # Assert: операция должна быть отклонена
        assert success is False
        
        # Проверяем, что репозиторий не был вызван
        mock_config_repo.set_session_lifetime_hours.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_reject_zero_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест валидации: отказ установки нулевого времени жизни
        
        Validates: Requirements 11.5
        """
        # Act: Developer пытается установить 0 часов
        success = await config_service.set_session_lifetime(0, admin_role=0)
        
        # Assert: операция должна быть отклонена
        assert success is False
        
        # Проверяем, что репозиторий не был вызван
        mock_config_repo.set_session_lifetime_hours.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_reject_negative_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест валидации: отказ установки отрицательного времени жизни
        
        Validates: Requirements 11.5
        """
        # Act: Developer пытается установить -10 часов
        success = await config_service.set_session_lifetime(-10, admin_role=0)
        
        # Assert: операция должна быть отклонена
        assert success is False
        
        # Проверяем, что репозиторий не был вызван
        mock_config_repo.set_session_lifetime_hours.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_accept_positive_session_lifetime(
        self, config_service, mock_config_repo
    ):
        """
        Тест валидации: принятие положительного времени жизни
        
        Validates: Requirements 11.5
        """
        # Arrange
        mock_config_repo.set_session_lifetime_hours = AsyncMock()
        
        # Act: Developer устанавливает 1 час (минимальное валидное значение)
        success = await config_service.set_session_lifetime(1, admin_role=0)
        
        # Assert
        assert success is True
        mock_config_repo.set_session_lifetime_hours.assert_called_once_with(1)
    
    @pytest.mark.asyncio
    async def test_handle_repository_error(
        self, config_service, mock_config_repo
    ):
        """
        Тест обработки ошибки репозитория
        
        Validates: Requirements 11.4
        """
        # Arrange: репозиторий выбрасывает исключение
        mock_config_repo.set_session_lifetime_hours.side_effect = Exception("Database error")
        
        # Act: Developer пытается установить 48 часов
        success = await config_service.set_session_lifetime(48, admin_role=0)
        
        # Assert: операция должна вернуть False при ошибке
        assert success is False
