# Backend API Server

REST API сервер для взаимодействия Frontend приложения с базой данных призов.

## Описание

API сервер предоставляет endpoint для получения информации о призах по `prize_id`. Используется Frontend приложением (Next.js) для получения `sheet_name`, `row_id` и `code_word` перед сохранением данных доставки в Google Sheets.

## Endpoints

### GET /api/prize/{prize_id}

Получает информацию о призе по ID.

**Параметры:**
- `prize_id` (int) - ID приза (должен быть положительным целым числом)

**Ответы:**

- **200 OK** - Успешное получение данных
  ```json
  {
    "sheet_name": "Лист1",
    "row_id": 42,
    "code_word": "SECRET123"
  }
  ```

- **400 Bad Request** - Невалидный prize_id
  ```json
  {
    "detail": {
      "error": "Invalid prize_id",
      "message": "prize_id должен быть положительным целым числом"
    }
  }
  ```

- **404 Not Found** - Приз не найден
  ```json
  {
    "detail": {
      "error": "Prize not found",
      "message": "Приз с ID 999 не найден"
    }
  }
  ```

- **500 Internal Server Error** - Ошибка сервера
  ```json
  {
    "detail": {
      "error": "Internal server error",
      "message": "Ошибка при получении информации о призе"
    }
  }
  ```

### GET /health

Health check endpoint для мониторинга.

**Ответ:**
```json
{
  "status": "ok",
  "service": "prize-backend-api"
}
```

## Установка зависимостей

```bash
# Активация виртуального окружения
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Установка зависимостей
pip install -r requirements.txt
```

## Запуск сервера

### Вариант 1: Через скрипт

```bash
# Активация виртуального окружения
venv\Scripts\activate

# Запуск сервера
python start_api_server.py
```

### Вариант 2: Напрямую через uvicorn

```bash
# Активация виртуального окружения
venv\Scripts\activate

# Запуск сервера
uvicorn api_server:app --host 0.0.0.0 --port 5000 --reload
```

Сервер будет доступен по адресу: `http://localhost:5000`

## Документация API

После запуска сервера автоматически доступна интерактивная документация:

- **Swagger UI**: http://localhost:5000/docs
- **ReDoc**: http://localhost:5000/redoc

## Тестирование

```bash
# Активация виртуального окружения
venv\Scripts\activate

# Запуск всех тестов API
pytest tests/test_api_server.py -v

# Запуск конкретного теста
pytest tests/test_api_server.py::test_get_prize_success -v
```

## Конфигурация

API сервер использует те же настройки базы данных, что и Telegram bot. Конфигурация загружается из `config.py`.

Необходимые переменные окружения в `.env`:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost/dbname
```

## Архитектура

```
api_server.py                          # FastAPI приложение
├── PrizeInfoRepository                # Работа с БД
│   └── get_prize_info(prize_id)      # Получение данных о призе
└── Endpoints
    ├── GET /api/prize/{prize_id}     # Основной endpoint
    └── GET /health                    # Health check
```

## Логирование

Все запросы и ошибки логируются через `utils.logging_config`. Логи включают:
- Входящие запросы с prize_id
- Результаты запросов к БД
- Ошибки с полным stack trace
- Время выполнения операций

## Интеграция с Frontend

Frontend приложение (Next.js) должно настроить переменную окружения:

```
BACKEND_API_URL=http://localhost:5000
```

Пример использования в Frontend:
```typescript
const response = await fetch(`${BACKEND_API_URL}/api/prize/${prizeId}`);
const data = await response.json();
// data.sheet_name, data.row_id, data.code_word
```
