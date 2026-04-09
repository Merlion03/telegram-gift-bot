"""
Unit тесты для Bot API endpoint сброса состояния

Validates: Requirements 3.1, 8.4, 8.5
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import status


@pytest.fixture
def mock_state_reset_service():
    """Создаёт mock StateResetService"""
    service = AsyncMock()
    service.reset_user_state = AsyncMock()
    return service


@pytest.fixture
def test_app(mock_state_reset_service):
    """Создаёт тестовое приложение FastAPI с mock StateResetService"""
    from api_server import app
    
    # Сохраняем оригинальный state_reset_service если есть
    original_service = getattr(app.state, 'state_reset_service', None)
    
    # Устанавливаем mock
    app.state.state_reset_service = mock_state_reset_service
    
    yield app
    
    # Восстанавливаем оригинальный сервис
    if original_service:
        app.state.state_reset_service = original_service


@pytest.fixture
def client(test_app):
    """Создаёт тестовый клиент"""
    return TestClient(test_app)


class TestResetStateEndpoint:
    """Тесты для endpoint POST /api/bot/reset-state"""
    
    def test_successful_reset(self, client, mock_state_reset_service):
        """
        Тест успешного сброса состояния (200 OK)
        
        Validates: Requirements 3.1
        """
        # Arrange
        telegram_id = 123456789
        session_id = 1
        admin_id = "admin_123"
        
        mock_state_reset_service.reset_user_state.return_value = {
            "success": True,
            "message": "State reset successfully",
            "telegram_id": telegram_id,
            "session_id": session_id
        }
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "State reset successfully"
        assert data["telegram_id"] == telegram_id
        assert data["session_id"] == session_id
        
        # Проверяем, что сервис был вызван с правильными параметрами
        mock_state_reset_service.reset_user_state.assert_called_once_with(
            telegram_id=telegram_id,
            session_id=session_id,
            admin_id=admin_id
        )
    
    def test_missing_telegram_id(self, client, mock_state_reset_service):
        """
        Тест валидации: отсутствие telegram_id (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        session_id = 1
        admin_id = "admin_123"
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Проверяем, что сервис не был вызван
        mock_state_reset_service.reset_user_state.assert_not_called()
    
    def test_invalid_telegram_id_type(self, client, mock_state_reset_service):
        """
        Тест валидации: невалидный тип telegram_id (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        session_id = 1
        admin_id = "admin_123"
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": "not_a_number",
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Проверяем, что сервис не был вызван
        mock_state_reset_service.reset_user_state.assert_not_called()
    
    def test_negative_telegram_id(self, client, mock_state_reset_service):
        """
        Тест валидации: отрицательный telegram_id (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        telegram_id = -123
        session_id = 1
        admin_id = "admin_123"
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Проверяем, что сервис не был вызван
        mock_state_reset_service.reset_user_state.assert_not_called()
    
    def test_zero_telegram_id(self, client, mock_state_reset_service):
        """
        Тест валидации: telegram_id = 0 (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        telegram_id = 0
        session_id = 1
        admin_id = "admin_123"
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Проверяем, что сервис не был вызван
        mock_state_reset_service.reset_user_state.assert_not_called()
    
    def test_missing_session_id(self, client, mock_state_reset_service):
        """
        Тест валидации: отсутствие session_id (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        telegram_id = 123456789
        admin_id = "admin_123"
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Проверяем, что сервис не был вызван
        mock_state_reset_service.reset_user_state.assert_not_called()
    
    def test_invalid_session_id_type(self, client, mock_state_reset_service):
        """
        Тест валидации: невалидный тип session_id (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        telegram_id = 123456789
        admin_id = "admin_123"
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": "not_a_number",
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Проверяем, что сервис не был вызван
        mock_state_reset_service.reset_user_state.assert_not_called()
    
    def test_fsm_error(self, client, mock_state_reset_service):
        """
        Тест обработки FSM ошибок (500)
        
        Validates: Requirements 8.5
        """
        # Arrange
        telegram_id = 123456789
        session_id = 1
        admin_id = "admin_123"
        
        mock_state_reset_service.reset_user_state.side_effect = RuntimeError(
            "Failed to reset user state: FSM error"
        )
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        
        data = response.json()
        # FastAPI возвращает detail напрямую
        assert "detail" in data
        detail = data["detail"]
        assert detail["error"] == "FSM error"
        assert "Не удалось сбросить состояние пользователя" in detail["message"]
        
        # Проверяем, что сервис был вызван
        mock_state_reset_service.reset_user_state.assert_called_once()
    
    def test_value_error(self, client, mock_state_reset_service):
        """
        Тест обработки ValueError (400)
        
        Validates: Requirements 8.4
        """
        # Arrange
        telegram_id = 123456789
        session_id = 1
        admin_id = "admin_123"
        
        mock_state_reset_service.reset_user_state.side_effect = ValueError(
            "telegram_id must be a valid integer"
        )
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        data = response.json()
        # FastAPI возвращает detail напрямую
        assert "detail" in data
        detail = data["detail"]
        assert detail["error"] == "Invalid request"
        assert "telegram_id must be a valid integer" in detail["message"]
    
    def test_unexpected_error(self, client, mock_state_reset_service):
        """
        Тест обработки неожиданных ошибок (500)
        
        Validates: Requirements 8.5
        """
        # Arrange
        telegram_id = 123456789
        session_id = 1
        admin_id = "admin_123"
        
        mock_state_reset_service.reset_user_state.side_effect = Exception(
            "Unexpected error"
        )
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        
        data = response.json()
        # FastAPI возвращает detail напрямую
        assert "detail" in data
        detail = data["detail"]
        assert detail["error"] == "Internal server error"
        assert "Произошла внутренняя ошибка" in detail["message"]
    
    @patch('api_server.logger')
    def test_logging_success(self, mock_logger, client, mock_state_reset_service):
        """
        Тест логирования успешных запросов
        
        Validates: Requirements 8.5
        """
        # Arrange
        telegram_id = 123456789
        session_id = 1
        admin_id = "admin_123"
        
        mock_state_reset_service.reset_user_state.return_value = {
            "success": True,
            "message": "State reset successfully",
            "telegram_id": telegram_id,
            "session_id": session_id
        }
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        
        # Проверяем, что логирование было вызвано
        assert mock_logger.info.call_count >= 2  # request_received и success
    
    @patch('api_server.logger')
    def test_logging_error(self, mock_logger, client, mock_state_reset_service):
        """
        Тест логирования ошибок с полным stack trace
        
        Validates: Requirements 8.5
        """
        # Arrange
        telegram_id = 123456789
        session_id = 1
        admin_id = "admin_123"
        
        mock_state_reset_service.reset_user_state.side_effect = RuntimeError(
            "FSM error"
        )
        
        # Act
        response = client.post(
            "/api/bot/reset-state",
            json={
                "telegram_id": telegram_id,
                "session_id": session_id,
                "admin_id": admin_id
            }
        )
        
        # Assert
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        
        # Проверяем, что логирование ошибки было вызвано с exc_info=True
        error_calls = [
            call for call in mock_logger.error.call_args_list
            if 'exc_info' in call.kwargs and call.kwargs['exc_info'] is True
        ]
        assert len(error_calls) > 0
