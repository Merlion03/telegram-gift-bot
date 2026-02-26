# Telegram Bot WebApp System

Комплексная система для проведения розыгрышей через Telegram-бота с интеграцией Google Sheets и Next.js приложением для сбора данных доставки и администрирования службы поддержки.

## 📋 Содержание

- [Обзор системы](#обзор-системы)
- [Архитектура](#архитектура)
- [Требования](#требования)
- [Установка и настройка](#установка-и-настройка)
- [Запуск системы](#запуск-системы)
- [Переменные окружения](#переменные-окружения)
- [Структура проекта](#структура-проекта)
- [Тестирование](#тестирование)
- [Разработка](#разработка)

## 🎯 Обзор системы

Система состоит из трёх основных компонентов:

1. **Telegram Bot (Python + aiogram 3.x)** - обрабатывает команды пользователей, управляет FSM-состояниями, интегрируется с Google Sheets
2. **Next.js Application** - предоставляет WebApp для сбора данных доставки и Admin Panel для службы поддержки
3. **PostgreSQL Database** - хранит сообщения службы поддержки с поддержкой real-time обновлений

### Основные возможности

- ✅ Автоматическая проверка победителей розыгрышей через Google Sheets
- ✅ Выдача цифровых призов (промокоды) и физических призов
- ✅ Безопасный сбор данных доставки через Telegram WebApp с криптографической валидацией
- ✅ Real-time коммуникация между пользователями и службой поддержки
- ✅ Административная панель для управления обращениями в поддержку
- ✅ Защита от XSS-атак и несанкционированного доступа
- ✅ Структурированное логирование и обработка ошибок

## 🏗️ Архитектура

```
┌─────────────────┐
│  Пользователь   │
│    Telegram     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Telegram Bot   │◄────►│  Google Sheets   │
│  (Python)       │      │      API         │
└────────┬────────┘      └──────────────────┘
         │
         │ WebApp
         ▼
┌─────────────────┐      ┌──────────────────┐
│   Next.js App   │◄────►│   PostgreSQL     │
│ WebApp + Admin  │      │    Database      │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐
│ Telegram Bot API│
│  (отправка msg) │
└─────────────────┘
```

### Технологический стек

**Backend (Bot):**
- Python 3.11+
- aiogram 3.x (Telegram Bot Framework)
- SQLAlchemy (ORM для PostgreSQL)
- gspread (Google Sheets API)
- structlog (структурированное логирование)
- pytest + hypothesis (тестирование)

**Frontend (WebApp + Admin):**
- Next.js 16+ (React Framework)
- TypeScript
- Tailwind CSS
- NextAuth.js (аутентификация)
- Supabase (real-time обновления)
- Vitest + fast-check (тестирование)

**Инфраструктура:**
- PostgreSQL 15
- Docker + Docker Compose
- Redis (опционально, для FSM storage)

## 📦 Требования

- Docker и Docker Compose (рекомендуется)
- Python 3.11+ (для локальной разработки бота)
- Node.js 18+ (для локальной разработки Next.js)
- Google Cloud Project с включённым Google Sheets API
- Telegram Bot Token (получить у [@BotFather](https://t.me/BotFather))
- PostgreSQL 15+ (если запуск без Docker)

## 🚀 Установка и настройка

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd telegram-bot-webapp-system
```

### 2. Настройка Google Sheets API

1. Создайте проект в [Google Cloud Console](https://console.cloud.google.com/)
2. Включите Google Sheets API
3. Создайте Service Account и скачайте JSON-файл с credentials
4. Сохраните файл как `credentials/google-credentials.json`
5. Предоставьте Service Account доступ к вашей Google Таблице

### 3. Создание Google Таблицы

Создайте Google Таблицу со следующей структурой:

| Telegram ID | Prize Type | Promo Code | Instructions | Full Name | Address | Phone | Comment |
|-------------|------------|------------|--------------|-----------|---------|-------|---------|
| 123456789   | digital    | PROMO123   | Инструкция   |           |         |       |         |
| 987654321   | physical   |            |              |           |         |       |         |

- **Столбец A**: Telegram ID пользователя
- **Столбец B**: Тип приза (`digital` или `physical`)
- **Столбец C**: Промокод (для цифровых призов)
- **Столбец D**: Инструкция по использованию (для цифровых призов)
- **Столбцы E-H**: Данные доставки (заполняются автоматически для физических призов)

### 4. Настройка переменных окружения

Скопируйте файл `.env.example` в `.env` и заполните все необходимые переменные:

```bash
cp .env.example .env
```

Отредактируйте `.env` файл (см. раздел [Переменные окружения](#переменные-окружения))

### 5. Инициализация базы данных

База данных автоматически инициализируется при первом запуске через Docker Compose.

Для ручной инициализации:

```bash
psql -U botuser -d telegram_bot -f telegram-bot/database/schema.sql
```

## 🎬 Запуск системы

### Запуск через Docker Compose (рекомендуется)

```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка всех сервисов
docker-compose down

# Запуск с Redis для FSM storage
docker-compose --profile redis up -d
```

Сервисы будут доступны:
- **Next.js WebApp**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **PostgreSQL**: localhost:5432

### Локальный запуск для разработки

#### Telegram Bot

```bash
cd telegram-bot

# Создание виртуального окружения
python -m venv venv

# Активация виртуального окружения
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Установка зависимостей
pip install -r requirements.txt

# Запуск бота
python main.py
```

#### Next.js Application

```bash
cd nextjs-app

# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка для продакшена
npm run build
npm start
```

## 🔐 Переменные окружения

### Общие переменные

```env
# Telegram Bot Token (получить у @BotFather)
BOT_TOKEN=your_bot_token_here

# URL Next.js приложения
WEBAPP_URL=http://localhost:3000

# Уровень логирования (DEBUG, INFO, WARNING, ERROR)
LOG_LEVEL=INFO
```

### База данных PostgreSQL

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=telegram_bot
DB_USER=botuser
DB_PASSWORD=your_secure_password
```

### Google Sheets API

```env
# Путь к JSON-файлу с credentials
GOOGLE_CREDENTIALS_PATH=./credentials/google-credentials.json

# ID Google Таблицы (из URL таблицы)
SPREADSHEET_ID=your_spreadsheet_id_here
```

### FSM Storage (опционально)

```env
# Тип хранилища: memory или redis
FSM_STORAGE_TYPE=memory

# URL Redis (если используется)
REDIS_URL=redis://localhost:6379
```

### NextAuth.js (для админки)

```env
# URL для NextAuth
NEXTAUTH_URL=http://localhost:3000

# Секретный ключ для NextAuth (сгенерировать: openssl rand -base64 32)
NEXTAUTH_SECRET=your_nextauth_secret_here

# Учётные данные администратора
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password
```

### Supabase (для real-time обновлений)

```env
# URL Supabase проекта
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url

# Публичный ключ Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Service Role ключ (для серверных операций)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Docker Compose специфичные

```env
# Порт для Next.js приложения
WEBAPP_PORT=3000

# Путь к Google Credentials на хосте
GOOGLE_CREDENTIALS_HOST_PATH=./credentials/google-credentials.json

# Порт Redis (если используется)
REDIS_PORT=6379
```

## 📁 Структура проекта

```
telegram-bot-webapp-system/
├── telegram-bot/              # Python Telegram Bot
│   ├── handlers/              # Обработчики команд и сообщений
│   │   ├── common_handler.py  # /start, /help
│   │   ├── prize_handler.py   # Обработка кодовых слов
│   │   └── support_handler.py # Режим поддержки
│   ├── services/              # Бизнес-логика
│   │   ├── google_sheets_service.py
│   │   ├── prize_service.py
│   │   └── support_service.py
│   ├── database/              # Работа с БД
│   │   ├── models.py          # SQLAlchemy модели
│   │   ├── connection.py      # Подключение к PostgreSQL
│   │   ├── repository.py      # Репозиторий
│   │   └── schema.sql         # SQL схема
│   ├── fsm/                   # FSM состояния
│   │   ├── states.py
│   │   └── storage.py
│   ├── utils/                 # Утилиты
│   │   ├── logger.py
│   │   └── error_handler.py
│   ├── tests/                 # Тесты
│   ├── config.py              # Конфигурация
│   ├── main.py                # Точка входа
│   ├── requirements.txt       # Python зависимости
│   └── Dockerfile
│
├── nextjs-app/                # Next.js Application
│   ├── app/                   # Next.js App Router
│   │   ├── api/               # API Routes
│   │   │   ├── delivery/      # Endpoint для данных доставки
│   │   │   ├── support/       # Endpoints для поддержки
│   │   │   └── auth/          # NextAuth endpoints
│   │   ├── webapp/            # WebApp страница
│   │   ├── admin/             # Admin Panel страница
│   │   └── login/             # Страница входа
│   ├── components/            # React компоненты
│   │   ├── webapp/            # Компоненты WebApp
│   │   ├── admin/             # Компоненты админки
│   │   └── common/            # Общие компоненты
│   ├── lib/                   # Библиотеки и утилиты
│   │   ├── telegram/          # Telegram интеграция
│   │   ├── google/            # Google Sheets клиент
│   │   ├── database/          # Database клиент
│   │   ├── auth/              # NextAuth конфигурация
│   │   └── utils/             # Утилиты
│   ├── types/                 # TypeScript типы
│   ├── __tests__/             # Тесты
│   ├── middleware.ts          # Next.js middleware
│   ├── package.json
│   └── Dockerfile
│
├── credentials/               # Google Sheets credentials (не в git)
│   └── google-credentials.json
├── docker-compose.yml         # Docker Compose конфигурация
├── .env.example               # Пример переменных окружения
├── .gitignore
└── README.md
```

## 🧪 Тестирование

### Telegram Bot (Python)

```bash
cd telegram-bot

# Активация виртуального окружения
source venv/bin/activate  # или venv\Scripts\activate на Windows

# Запуск всех тестов
pytest

# Запуск с покрытием кода
pytest --cov=. --cov-report=html

# Запуск конкретного теста
pytest tests/test_prize_service.py

# Запуск property-based тестов
pytest tests/ -k property
```

### Next.js Application

```bash
cd nextjs-app

# Запуск всех тестов
npm test

# Запуск в watch режиме
npm run test:watch

# Запуск с покрытием
npm test -- --coverage

# Запуск конкретного теста
npm test -- DeliveryForm
```

### Интеграционные тесты

```bash
# Запуск интеграционных тестов бота
cd telegram-bot
pytest tests/test_integration_*.py

# Запуск интеграционных тестов Next.js
cd nextjs-app
npm test -- integration
```

## 💻 Разработка

### Добавление нового handler в бот

1. Создайте файл в `telegram-bot/handlers/`
2. Реализуйте класс handler с необходимыми методами
3. Зарегистрируйте handler в `main.py` в методе `_register_handlers()`

### Добавление нового API endpoint в Next.js

1. Создайте файл `route.ts` в `nextjs-app/app/api/your-endpoint/`
2. Реализуйте функции `GET`, `POST` и т.д.
3. Добавьте валидацию с помощью Zod
4. Добавьте тесты в `__tests__/`

### Работа с базой данных

**Добавление новой таблицы:**

1. Обновите `telegram-bot/database/schema.sql`
2. Создайте модель в `telegram-bot/database/models.py`
3. Добавьте методы в `telegram-bot/database/repository.py`

**Миграции:**

Для применения изменений схемы:

```bash
psql -U botuser -d telegram_bot -f telegram-bot/database/schema.sql
```

### Логирование

Система использует структурированное логирование (structlog для Python, console для Next.js).

**Python:**
```python
import structlog
logger = structlog.get_logger(__name__)

logger.info("event_name", key1="value1", key2="value2")
logger.error("error_event", error=str(e), exc_info=True)
```

**Next.js:**
```typescript
console.log('[INFO]', 'Event description', { key: 'value' });
console.error('[ERROR]', 'Error description', error);
```

### Обработка ошибок

**Python:**
- Все критические ошибки логируются с полным stack trace
- Retry логика для Google Sheets API (до 3 попыток)
- Graceful shutdown при получении сигналов SIGTERM/SIGINT

**Next.js:**
- Error boundaries для React компонентов
- Обработка ошибок API с понятными сообщениями
- Валидация всех входных данных с Zod

## 🔒 Безопасность

### Криптографическая валидация InitData

Все запросы от WebApp проверяются криптографически:

1. Telegram передаёт InitData с hash
2. Next.js API вычисляет ожидаемый hash используя BOT_TOKEN
3. Сравнивает hash - если не совпадают, запрос отклоняется (403)
4. Проверяется timestamp - данные старше 24 часов отклоняются

### Защита от XSS

- Все пользовательские данные экранируются перед отображением
- Content Security Policy (CSP) заголовки
- Серверная валидация всех входных данных
- Валидация URL протоколов

### Аутентификация админки

- NextAuth.js с credentials provider
- Защищённые сессии с автоматическим истечением
- Middleware для проверки доступа к защищённым роутам
- Редирект неавторизованных пользователей на /login

### Управление секретами

- Все секреты в переменных окружения
- Файл `.env` в `.gitignore`
- Секреты не логируются
- Отдельные наборы секретов для dev/prod

## 📝 Лицензия

[Укажите вашу лицензию]

## 🤝 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker-compose logs -f`
2. Убедитесь, что все переменные окружения установлены
3. Проверьте доступ к Google Sheets API
4. Проверьте подключение к базе данных

## 👥 Авторы

[Укажите авторов проекта]
