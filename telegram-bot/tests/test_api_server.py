"""
Unit тесты для Backend API endpoint GET /api/prize/{prize_id}

Тестирует:
- Успешное получение информации о призе (HTTP 200)
- Обработку несуществующего prize_id (HTTP 404)
- Валидацию prize_id: отрицательное число (HTTP 400)
- Валидацию prize_id: нецелое число (HTTP 400)
- Обработку ошибок базы данных (HTTP 500)
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from api_server import app


@pytest.fixture
def mock_repository():
    """Фикстура для мокирования PrizeInfoRepository"""
    with patch('api_server.PrizeInfoRepository') as mock_repo_class:
        mock_instance = AsyncMock()
        mock_repo_class.return_value = mock_instance
        yield mock_instance


@pytest.mark.asyncio
async def test_get_prize_success(mock_repository):
    """
    Тест успешного получения информации о призе (HTTP 200)
    
    Validates: Requirements 1.1, 1.5
    """
    # Arrange: настраиваем мок для возврата данных о призе
    prize_id = 42
    expected_data = {
        'sheet_name': 'Лист1',
        'row_id': 42,
        'code_word': 'SECRET123'
    }
    mock_repository.get_prize_info.return_value = expected_data
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем успешный ответ
    assert response.status_code == 200
    
    response_data = response.json()
    assert response_data['sheet_name'] == expected_data['sheet_name']
    assert response_data['row_id'] == expected_data['row_id']
    assert response_data['code_word'] == expected_data['code_word']
    
    # Проверяем, что repository был вызван с правильным prize_id
    mock_repository.get_prize_info.assert_called_once_with(prize_id)


@pytest.mark.asyncio
async def test_get_prize_not_found(mock_repository):
    """
    Тест обработки несуществующего prize_id (HTTP 404)
    
    Validates: Requirements 1.2
    """
    # Arrange: настраиваем мок для возврата None (приз не найден)
    prize_id = 999
    mock_repository.get_prize_info.return_value = None
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем HTTP 404
    assert response.status_code == 404
    
    response_data = response.json()
    assert 'detail' in response_data
    assert response_data['detail']['error'] == 'Prize not found'
    assert str(prize_id) in response_data['detail']['message']


@pytest.mark.asyncio
async def test_get_prize_negative_id(mock_repository):
    """
    Тест валидации prize_id: отрицательное число (HTTP 400)
    
    Validates: Requirements 1.4
    """
    # Arrange: отрицательный prize_id
    prize_id = -5
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем HTTP 400
    assert response.status_code == 400
    
    response_data = response.json()
    assert 'detail' in response_data
    assert response_data['detail']['error'] == 'Invalid prize_id'
    assert 'положительным' in response_data['detail']['message']
    
    # Проверяем, что repository НЕ был вызван
    mock_repository.get_prize_info.assert_not_called()


@pytest.mark.asyncio
async def test_get_prize_zero_id(mock_repository):
    """
    Тест валидации prize_id: ноль (HTTP 400)
    
    Validates: Requirements 1.4
    """
    # Arrange: prize_id = 0
    prize_id = 0
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем HTTP 400
    assert response.status_code == 400
    
    response_data = response.json()
    assert 'detail' in response_data
    assert response_data['detail']['error'] == 'Invalid prize_id'
    
    # Проверяем, что repository НЕ был вызван
    mock_repository.get_prize_info.assert_not_called()


@pytest.mark.asyncio
async def test_get_prize_invalid_type():
    """
    Тест валидации prize_id: нецелое число (HTTP 422)
    
    FastAPI автоматически валидирует типы параметров пути.
    Если prize_id не является целым числом, возвращается HTTP 422.
    
    Validates: Requirements 1.4
    """
    # Arrange: нецелое значение prize_id
    prize_id = "abc"
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем HTTP 422 (Unprocessable Entity)
    # FastAPI возвращает 422 для ошибок валидации типов
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_prize_database_error(mock_repository):
    """
    Тест обработки ошибок базы данных (HTTP 500)
    
    Validates: Requirements 1.1, 1.5
    """
    # Arrange: настраиваем мок для выброса исключения
    prize_id = 42
    mock_repository.get_prize_info.side_effect = Exception("Database connection failed")
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем HTTP 500
    assert response.status_code == 500
    
    response_data = response.json()
    assert 'detail' in response_data
    assert response_data['detail']['error'] == 'Internal server error'
    assert 'Ошибка' in response_data['detail']['message']


@pytest.mark.asyncio
async def test_get_prize_with_special_characters(mock_repository):
    """
    Тест получения приза с специальными символами в sheet_name
    
    Проверяет, что API корректно обрабатывает данные с кириллицей
    и специальными символами.
    """
    # Arrange: данные с кириллицей и специальными символами
    prize_id = 15
    expected_data = {
        'sheet_name': 'Лист №2 (Москва)',
        'row_id': 15,
        'code_word': 'ПРИЗ-2024'
    }
    mock_repository.get_prize_info.return_value = expected_data
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем успешный ответ
    assert response.status_code == 200
    
    response_data = response.json()
    assert response_data['sheet_name'] == expected_data['sheet_name']
    assert response_data['row_id'] == expected_data['row_id']
    assert response_data['code_word'] == expected_data['code_word']


@pytest.mark.asyncio
async def test_health_check():
    """
    Тест health check endpoint
    
    Проверяет, что endpoint /health возвращает статус "ok"
    """
    # Act: выполняем запрос к health check
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    
    # Assert: проверяем успешный ответ
    assert response.status_code == 200
    
    response_data = response.json()
    assert response_data['status'] == 'ok'
    assert response_data['service'] == 'prize-backend-api'


@pytest.mark.asyncio
async def test_get_prize_large_id(mock_repository):
    """
    Тест получения приза с большим prize_id
    
    Проверяет, что API корректно обрабатывает большие числа
    """
    # Arrange: большой prize_id
    prize_id = 999999999
    expected_data = {
        'sheet_name': 'Лист1',
        'row_id': 999999999,
        'code_word': 'LARGE_ID'
    }
    mock_repository.get_prize_info.return_value = expected_data
    
    # Act: выполняем запрос к API
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/prize/{prize_id}")
    
    # Assert: проверяем успешный ответ
    assert response.status_code == 200
    
    response_data = response.json()
    assert response_data['row_id'] == expected_data['row_id']
