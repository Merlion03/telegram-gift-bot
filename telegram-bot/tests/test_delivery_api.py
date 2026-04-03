"""
Unit тесты для API endpoint /api/delivery/update

Validates: Requirements 7.1, 7.2, 7.3, 8.2, 8.3, 8.4
"""
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock

from api_server import app
from database.repositories.prize_repository import (
    PrizeRepository,
    PrizeNotFoundError,
    DatabaseUnavailableError
)


@pytest_asyncio.fixture
async def async_client():
    """Создаёт асинхронный HTTP клиент для тестирования API"""
    from httpx import ASGITransport
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_successful_delivery_update(async_client):
    """
    Тест успешного обновления данных доставки (HTTP 200)
    
    Validates: Requirements 7.1, 8.2
    """
    # Подготовка данных запроса
    request_data = {
        "prize_id": 1,
        "telegram_id": 123456,
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "patronymic": "Иванович",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "apartment": "5",
            "phone": "+79991234567",
            "comment": "Тестовый комментарий"
        }
    }
    
    # Мокируем PrizeRepository
    with patch('database.repositories.prize_repository.PrizeRepository') as MockRepository:
        mock_repo = MockRepository.return_value
        
        # Мокируем validate_prize_ownership - возвращает True
        mock_repo.validate_prize_ownership = AsyncMock(return_value=True)
        
        # Мокируем update_delivery_data_by_prize_id - возвращает обновлённый приз
        mock_prize = MagicMock()
        mock_prize.id = 1
        mock_prize.claimed_at = datetime.now(timezone.utc)
        mock_repo.update_delivery_data_by_prize_id = AsyncMock(return_value=mock_prize)
        
        # Отправляем запрос
        response = await async_client.post("/api/delivery/update", json=request_data)
        
        # Проверяем ответ
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Данные доставки обновлены"
        
        # Проверяем, что методы были вызваны с правильными параметрами
        mock_repo.validate_prize_ownership.assert_called_once_with(
            prize_id=1,
            telegram_id=123456
        )
        mock_repo.update_delivery_data_by_prize_id.assert_called_once_with(
            prize_id=1,
            delivery_data=request_data["delivery_data"]
        )


@pytest.mark.asyncio
async def test_invalid_delivery_data_fields(async_client):
    """
    Тест валидации входных данных - невалидные поля (HTTP 400)
    
    Validates: Requirements 7.2
    """
    # Подготовка данных с невалидными полями
    request_data = {
        "prize_id": 1,
        "telegram_id": 123456,
        "delivery_data": {
            "last_name": "Иванов",
            "invalid_field": "Невалидное поле",  # Невалидное поле
            "another_invalid": "Ещё одно"
        }
    }
    
    # Мокируем PrizeRepository
    with patch('database.repositories.prize_repository.PrizeRepository') as MockRepository:
        mock_repo = MockRepository.return_value
        
        # Мокируем validate_prize_ownership - возвращает True
        mock_repo.validate_prize_ownership = AsyncMock(return_value=True)
        
        # Мокируем update_delivery_data_by_prize_id - выбрасывает ValueError
        mock_repo.update_delivery_data_by_prize_id = AsyncMock(
            side_effect=ValueError("Невалидные поля доставки: invalid_field, another_invalid")
        )
        
        # Отправляем запрос
        response = await async_client.post("/api/delivery/update", json=request_data)
        
        # Проверяем ответ
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["error"] == "Validation error"
        assert "Невалидные поля" in data["detail"]["message"]


@pytest.mark.asyncio
async def test_prize_ownership_validation_failed(async_client):
    """
    Тест валидации владения призом - приз не принадлежит пользователю (HTTP 403)
    
    Validates: Requirements 8.2, 8.3
    """
    # Подготовка данных запроса
    request_data = {
        "prize_id": 1,
        "telegram_id": 123456,
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "phone": "+79991234567"
        }
    }
    
    # Мокируем PrizeRepository
    with patch('database.repositories.prize_repository.PrizeRepository') as MockRepository:
        mock_repo = MockRepository.return_value
        
        # Мокируем validate_prize_ownership - возвращает False
        mock_repo.validate_prize_ownership = AsyncMock(return_value=False)
        
        # Отправляем запрос
        response = await async_client.post("/api/delivery/update", json=request_data)
        
        # Проверяем ответ
        assert response.status_code == 403
        data = response.json()
        assert data["detail"]["error"] == "Access denied"
        assert data["detail"]["message"] == "Доступ запрещён"
        
        # Проверяем, что update_delivery_data_by_prize_id НЕ был вызван
        mock_repo.update_delivery_data_by_prize_id.assert_not_called()


@pytest.mark.asyncio
async def test_prize_not_found(async_client):
    """
    Тест обработки несуществующего prize_id (HTTP 404)
    
    Validates: Requirements 7.2
    """
    # Подготовка данных запроса
    request_data = {
        "prize_id": 999,  # Несуществующий prize_id
        "telegram_id": 123456,
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "phone": "+79991234567"
        }
    }
    
    # Мокируем PrizeRepository
    with patch('database.repositories.prize_repository.PrizeRepository') as MockRepository:
        mock_repo = MockRepository.return_value
        
        # Мокируем validate_prize_ownership - возвращает True
        mock_repo.validate_prize_ownership = AsyncMock(return_value=True)
        
        # Мокируем update_delivery_data_by_prize_id - выбрасывает PrizeNotFoundError
        mock_repo.update_delivery_data_by_prize_id = AsyncMock(
            side_effect=PrizeNotFoundError("Приз с ID 999 не найден")
        )
        
        # Отправляем запрос
        response = await async_client.post("/api/delivery/update", json=request_data)
        
        # Проверяем ответ
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["error"] == "Prize not found"
        assert data["detail"]["message"] == "Приз не найден"


@pytest.mark.asyncio
async def test_database_unavailable(async_client):
    """
    Тест обработки недоступности БД (HTTP 503)
    
    Validates: Requirements 7.3
    """
    # Подготовка данных запроса
    request_data = {
        "prize_id": 1,
        "telegram_id": 123456,
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "phone": "+79991234567"
        }
    }
    
    # Мокируем PrizeRepository
    with patch('database.repositories.prize_repository.PrizeRepository') as MockRepository:
        mock_repo = MockRepository.return_value
        
        # Мокируем validate_prize_ownership - возвращает True
        mock_repo.validate_prize_ownership = AsyncMock(return_value=True)
        
        # Мокируем update_delivery_data_by_prize_id - выбрасывает DatabaseUnavailableError
        mock_repo.update_delivery_data_by_prize_id = AsyncMock(
            side_effect=DatabaseUnavailableError("Ошибка подключения к БД")
        )
        
        # Отправляем запрос
        response = await async_client.post("/api/delivery/update", json=request_data)
        
        # Проверяем ответ
        assert response.status_code == 503
        data = response.json()
        assert data["detail"]["error"] == "Database unavailable"
        assert data["detail"]["message"] == "База данных временно недоступна"


@pytest.mark.asyncio
async def test_unauthorized_access_logging(async_client, caplog):
    """
    Тест логирования попыток несанкционированного доступа
    
    Validates: Requirements 8.4
    """
    import logging
    
    # Подготовка данных запроса
    request_data = {
        "prize_id": 1,
        "telegram_id": 999999,  # Чужой telegram_id
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "phone": "+79991234567"
        }
    }
    
    # Мокируем PrizeRepository
    with patch('database.repositories.prize_repository.PrizeRepository') as MockRepository:
        mock_repo = MockRepository.return_value
        
        # Мокируем validate_prize_ownership - возвращает False
        mock_repo.validate_prize_ownership = AsyncMock(return_value=False)
        
        # Включаем логирование для теста
        with caplog.at_level(logging.WARNING):
            # Отправляем запрос
            response = await async_client.post("/api/delivery/update", json=request_data)
            
            # Проверяем ответ
            assert response.status_code == 403
            
            # Проверяем, что попытка несанкционированного доступа залогирована
            # Логирование происходит в validate_prize_ownership и в endpoint
            assert any(
                "unauthorized" in record.message.lower()
                for record in caplog.records
            )


@pytest.mark.asyncio
async def test_invalid_prize_id_negative(async_client):
    """
    Тест валидации prize_id - отрицательное значение (HTTP 422)
    
    Validates: Requirements 7.2
    """
    # Подготовка данных с невалидным prize_id
    request_data = {
        "prize_id": -1,  # Отрицательное значение
        "telegram_id": 123456,
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "phone": "+79991234567"
        }
    }
    
    # Отправляем запрос
    response = await async_client.post("/api/delivery/update", json=request_data)
    
    # Проверяем ответ - Pydantic валидация должна вернуть 422
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_invalid_telegram_id_negative(async_client):
    """
    Тест валидации telegram_id - отрицательное значение (HTTP 422)
    
    Validates: Requirements 7.2
    """
    # Подготовка данных с невалидным telegram_id
    request_data = {
        "prize_id": 1,
        "telegram_id": -123456,  # Отрицательное значение
        "delivery_data": {
            "last_name": "Иванов",
            "first_name": "Иван",
            "country": "Россия",
            "postal_code": "123456",
            "city": "Москва",
            "street": "Ленина",
            "house": "10",
            "phone": "+79991234567"
        }
    }
    
    # Отправляем запрос
    response = await async_client.post("/api/delivery/update", json=request_data)
    
    # Проверяем ответ - Pydantic валидация должна вернуть 422
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_missing_required_fields(async_client):
    """
    Тест валидации - отсутствие обязательных полей (HTTP 422)
    
    Validates: Requirements 7.2
    """
    # Подготовка данных без обязательных полей
    request_data = {
        "prize_id": 1
        # Отсутствуют telegram_id и delivery_data
    }
    
    # Отправляем запрос
    response = await async_client.post("/api/delivery/update", json=request_data)
    
    # Проверяем ответ - Pydantic валидация должна вернуть 422
    assert response.status_code == 422
