# Руководство по установке и запуску Telegram Bot WebApp System

## Содержание

1. [Требования к системе](#требования-к-системе)
2. [Предварительная настройка](#предварительная-настройка)
3. [Установка зависимостей](#установка-зависимостей)
4. [Настройка переменных окружения](#настройка-переменных-окружения)
5. [Настройка базы данных](#настройка-базы-данных)
6. [Настройка Google Sheets API](#настройка-google-sheets-api)
7. [Настройка Telegram Bot](#настройка-telegram-bot)
8. [Настройка Supabase](#настройка-supabase)
9. [Запуск через Docker](#запуск-через-docker)
10. [Запуск для разработки](#запуск-для-разработки)
11. [Проверка работоспособности](#проверка-работоспособности)
12. [Решение проблем](#решение-проблем)

---

## Требования к системе

### Минимальные требования

- **Docker**: версия 20.10 или выше
- **Docker Compose**: версия 2.0 или выше
- **Python**: версия 3.10 или выше (для локальной разработки)
- **Node.js**: версия 18 или выше (для локальной разработки)
- **PostgreSQL**: версия 14 или выше (предоставляется через Docker)

### Рекомендуемые требования

- **RAM**: минимум 4 GB
- **Disk Space**: минимум 2 GB свободного места
- **OS**: Windows 10/11, macOS 10.15+, или Linux (Ubuntu 20.04+)

---

## Предварительная настройка

### 1. Установка Docker

#### Windows
1. Скачайте [Docker Desktop для Windows](https://www.docker.com/products/docker-desktop)
2. Запустите установщик и следуйте инструкциям
3. Перезагрузите компьютер после установки
4. Запустите Docker Desktop

#### macOS
1. Скачайте [Docker Desktop для macOS](https://www.docker.com/products/docker-desktop)
2. Перетащите Docker.app в папку Applications
3. Запустите Docker из Applications

#### Linux (Ubuntu/Debian)
```bash
# Обновите пакеты
sudo apt-get update

# Установите зависимости
sudo apt-get install ca-certificates curl gnupg lsb-release

# Добавьте официальный GPG ключ Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Добавьте репозиторий Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установите Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Добавьте пользователя в группу docker
sudo usermod -aG docker $USER

# Перезайдите в систему для применения изменений
```

### 2. Проверка установки Docker

```bash
# Проверьте версию Docker
docker --version

# Проверьте версию Docker Compose
docker compose version

# Проверьте работу Docker
docker run hello-world
```

---

## Установка зависимостей

### Клонирование репозитория

```bash
# Клонируйте репозиторий (если еще не клонирован)
git clone <your-repository-url>
cd <repository-name>
```

### Для локальной разработки (опционально)

#### Python бот

```bash
cd telegram-bot

# Создайте виртуальное окружение
python -m venv venv

# Активируйте виртуальное окружение
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Установите зависимости
pip install -r requirements.txt

cd ..
```

#### Next.js приложение

```bash
cd nextjs-app

# Установите зависимости
npm install

cd ..
```

---

## Настройка переменных окружения

### 1. Создайте файл .env в корне проекта

```bash
cp .env.example .env
```

### 2. Заполните переменные окружения

Откройте файл `.env` и заполните следующие переменные:

```env
# ============================================
# TELEGRAM BOT CONFIGURATION
# ============================================
BOT_TOKEN=your_telegram_bot_token_here
WEBAPP_URL=http://localhost:3000

# ============================================
# GOOGLE SHEETS CONFIGURATION
# ============================================
GOOGLE_CREDENTIALS_PATH=/app/credentials/google-credentials.json
SPREADSHEET_ID=your_google_spreadsheet_id_here

# ============================================
# DATABASE CONFIGURATION (PostgreSQL)
# ============================================
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/telegram_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=telegram_bot

# ============================================
# SUPABASE CONFIGURATION
# ============================================
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ============================================
# NEXTAUTH CONFIGURATION
# ============================================
NEXTAUTH_SECRET=your_nextauth_secret_here_min_32_chars
NEXTAUTH_URL=http://localhost:3000

# ============================================
# ADMIN CREDENTIALS
# ============================================
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_admin_password_here
```

---

## Настройка базы данных

### Автоматическая настройка (через Docker)

База данных PostgreSQL автоматически создается и настраивается при запуске через Docker Compose.

### Ручная настройка (для локальной разработки)

Если вы хотите использовать локальную PostgreSQL:

```bash
# Подключитесь к PostgreSQL
psql -U postgres

# Создайте базу данных
CREATE DATABASE telegram_bot;

# Подключитесь к базе данных
\c telegram_bot

# Выполните миграции
\i telegram-bot/database/migrations/001_create_tables.sql
```

---

## Настройка Google Sheets API

### 1. Создайте проект в Google Cloud Console

1. Перейдите на [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Перейдите в "APIs & Services" > "Library"
4. Найдите и включите "Google Sheets API"

### 2. Создайте Service Account

1. Перейдите в "APIs & Services" > "Credentials"
2. Нажмите "Create Credentials" > "Service Account"
3. Заполните информацию о Service Account
4. Нажмите "Create and Continue"
5. Пропустите опциональные шаги и нажмите "Done"

### 3. Создайте ключ для Service Account

1. Найдите созданный Service Account в списке
2. Нажмите на него
3. Перейдите на вкладку "Keys"
4. Нажмите "Add Key" > "Create new key"
5. Выберите формат JSON
6. Сохраните файл как `google-credentials.json`

### 4. Разместите credentials файл

```bash
# Создайте папку для credentials
mkdir -p credentials

# Скопируйте файл credentials
cp /path/to/downloaded/google-credentials.json credentials/google-credentials.json
```

### 5. Настройте Google Sheets

1. Создайте новую Google Таблицу или откройте существующую
2. Скопируйте ID таблицы из URL (часть между `/d/` и `/edit`)
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```
3. Добавьте ID в `.env` файл в переменную `SPREADSHEET_ID`
4. Предоставьте доступ к таблице для Service Account:
   - Откройте таблицу
   - Нажмите "Share"
   - Добавьте email Service Account (из `google-credentials.json`, поле `client_email`)
   - Дайте права "Editor"

### 6. Структура Google Таблицы

Создайте листы (worksheets) с названиями кодовых слов. Каждый лист должен иметь следующую структуру:

| A: Telegram ID | B: Prize Type | C: Promo Code | D: Instructions | E: Full Name | F: Address | G: Phone | H: Comment | I: Claimed At |
|----------------|---------------|---------------|-----------------|--------------|------------|----------|------------|---------------|
| 123456789      | digital       | PROMO123      | Use at...       |              |            |          |            |               |
| 987654321      | physical      |               |                 |              |            |          |            |               |

---

## Настройка Telegram Bot

### 1. Создайте бота через BotFather

1. Откройте Telegram и найдите [@BotFather](https://t.me/botfather)
2. Отправьте команду `/newbot`
3. Следуйте инструкциям:
   - Введите имя бота (например, "My Contest Bot")
   - Введите username бота (должен заканчиваться на "bot", например, "my_contest_bot")
4. Сохраните полученный токен

### 2. Настройте команды бота

Отправьте BotFather команду `/setcommands` и выберите вашего бота. Затем отправьте:

```
start - Начать работу с ботом
help - Показать справку
support - Связаться с поддержкой
```

### 3. Настройте WebApp

1. Отправьте BotFather команду `/newapp`
2. Выберите вашего бота
3. Введите название WebApp (например, "Delivery Form")
4. Введите описание
5. Загрузите иконку (512x512 px)
6. Загрузите GIF или фото для демонстрации
7. Введите URL WebApp: `https://your-domain.com/webapp`

### 4. Добавьте токен в .env

```env
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

## Настройка Supabase

### 1. Создайте проект в Supabase

1. Перейдите на [Supabase](https://supabase.com/)
2. Создайте аккаунт или войдите
3. Нажмите "New Project"
4. Заполните информацию:
   - Project name
   - Database password (сохраните его!)
   - Region (выберите ближайший)
5. Дождитесь создания проекта

### 2. Получите API ключи

1. Перейдите в "Settings" > "API"
2. Скопируйте:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Создайте таблицы

1. Перейдите в "SQL Editor"
2. Выполните следующий SQL:

```sql
-- Создание таблицы сессий поддержки
CREATE TABLE support_sessions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    unread_count INTEGER DEFAULT 0
);

-- Создание индексов
CREATE INDEX idx_support_sessions_telegram_id ON support_sessions(telegram_id);
CREATE INDEX idx_support_sessions_status ON support_sessions(status);
CREATE INDEX idx_support_sessions_created_at ON support_sessions(created_at);

-- Создание таблицы сообщений
CREATE TABLE support_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES support_sessions(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    message_type VARCHAR(20) NOT NULL,
    message_text TEXT NOT NULL,
    file_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    delivered BOOLEAN DEFAULT FALSE
);

-- Создание индексов
CREATE INDEX idx_support_messages_session_id ON support_messages(session_id);
CREATE INDEX idx_support_messages_created_at ON support_messages(created_at);
CREATE INDEX idx_support_messages_telegram_id ON support_messages(telegram_id);
```

### 4. Включите Realtime

1. Перейдите в "Database" > "Replication"
2. Найдите таблицы `support_sessions` и `support_messages`
3. Включите Realtime для обеих таблиц

### 5. Настройте Row Level Security (RLS)

```sql
-- Включите RLS для таблиц
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Создайте политики для service_role (полный доступ)
CREATE POLICY "Service role has full access to sessions"
ON support_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role has full access to messages"
ON support_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Создайте политики для anon (только чтение для админки)
CREATE POLICY "Anon can read all sessions"
ON support_sessions
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anon can read all messages"
ON support_messages
FOR SELECT
TO anon
USING (true);
```

---

## Запуск через Docker

### 1. Подготовка

Убедитесь, что:
- Файл `.env` заполнен
- Файл `credentials/google-credentials.json` на месте
- Docker Desktop запущен

### 2. Сборка и запуск

```bash
# Соберите и запустите все сервисы
docker compose up -d

# Проверьте статус контейнеров
docker compose ps

# Просмотрите логи
docker compose logs -f

# Просмотрите логи конкретного сервиса
docker compose logs -f bot
docker compose logs -f nextjs
docker compose logs -f postgres
```

### 3. Остановка

```bash
# Остановите все сервисы
docker compose down

# Остановите и удалите volumes (БД будет очищена!)
docker compose down -v
```

### 4. Перезапуск после изменений

```bash
# Пересоберите и перезапустите
docker compose up -d --build

# Перезапустите конкретный сервис
docker compose restart bot
docker compose restart nextjs
```

---

## Запуск для разработки

### Python бот (локально)

```bash
cd telegram-bot

# Активируйте виртуальное окружение
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Запустите бота
python main.py
```

### Next.js приложение (локально)

```bash
cd nextjs-app

# Запустите dev сервер
npm run dev

# Приложение будет доступно на http://localhost:3000
```

### PostgreSQL (через Docker)

```bash
# Запустите только PostgreSQL
docker compose up -d postgres

# Подключитесь к БД
docker compose exec postgres psql -U postgres -d telegram_bot
```

---

## Проверка работоспособности

### 1. Проверка Docker контейнеров

```bash
# Все контейнеры должны быть в статусе "Up"
docker compose ps
```

Ожидаемый вывод:
```
NAME                COMMAND                  SERVICE    STATUS
bot                 "python main.py"         bot        Up
nextjs              "docker-entrypoint.s…"   nextjs     Up
postgres            "docker-entrypoint.s…"   postgres   Up
```

### 2. Проверка логов

```bash
# Проверьте логи бота
docker compose logs bot | tail -20

# Должны увидеть:
# "Bot started successfully"
# "Polling started"
```

```bash
# Проверьте логи Next.js
docker compose logs nextjs | tail -20

# Должны увидеть:
# "Ready on http://0.0.0.0:3000"
```

### 3. Проверка веб-интерфейса

Откройте браузер и перейдите:

- **Главная страница**: http://localhost:3000
- **Админка**: http://localhost:3000/admin
- **WebApp**: http://localhost:3000/webapp
- **Health check**: http://localhost:3000/api/health

### 4. Проверка Telegram бота

1. Найдите вашего бота в Telegram
2. Отправьте команду `/start`
3. Бот должен ответить приветственным сообщением

### 5. Проверка базы данных

```bash
# Подключитесь к PostgreSQL
docker compose exec postgres psql -U postgres -d telegram_bot

# Проверьте таблицы
\dt

# Должны увидеть:
# support_sessions
# support_messages

# Выйдите
\q
```

---

## Решение проблем

### Проблема: Docker контейнер не запускается

**Решение:**
```bash
# Проверьте логи
docker compose logs <service-name>

# Пересоберите контейнер
docker compose up -d --build <service-name>

# Проверьте, не заняты ли порты
# Windows:
netstat -ano | findstr :3000
netstat -ano | findstr :5432

# Linux/macOS:
lsof -i :3000
lsof -i :5432
```

### Проблема: Бот не отвечает

**Возможные причины:**
1. Неверный BOT_TOKEN
2. Бот не запущен
3. Проблемы с сетью

**Решение:**
```bash
# Проверьте логи бота
docker compose logs bot

# Проверьте переменные окружения
docker compose exec bot env | grep BOT_TOKEN

# Перезапустите бота
docker compose restart bot
```

### Проблема: Ошибка подключения к базе данных

**Решение:**
```bash
# Проверьте, запущен ли PostgreSQL
docker compose ps postgres

# Проверьте логи PostgreSQL
docker compose logs postgres

# Проверьте подключение
docker compose exec postgres pg_isready -U postgres

# Пересоздайте контейнер БД
docker compose down postgres
docker compose up -d postgres
```

### Проблема: Google Sheets API не работает

**Возможные причины:**
1. Неверный путь к credentials
2. API не включен
3. Нет доступа к таблице

**Решение:**
```bash
# Проверьте наличие файла credentials
ls -la credentials/google-credentials.json

# Проверьте права доступа
# Убедитесь, что Service Account email добавлен в Google Sheets

# Проверьте логи
docker compose logs bot | grep -i "google\|sheets"
```

### Проблема: Next.js не собирается

**Решение:**
```bash
# Очистите кэш и пересоберите
cd nextjs-app
rm -rf .next node_modules
npm install
npm run build

# Или через Docker
docker compose down nextjs
docker compose build --no-cache nextjs
docker compose up -d nextjs
```

### Проблема: Supabase Realtime не работает

**Решение:**
1. Проверьте, что Realtime включен для таблиц в Supabase Dashboard
2. Проверьте правильность API ключей в `.env`
3. Проверьте RLS политики
4. Проверьте логи браузера (F12 → Console)

### Проблема: Ошибка "Port already in use"

**Решение:**
```bash
# Найдите процесс, использующий порт
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/macOS:
lsof -ti:3000 | xargs kill -9

# Или измените порт в docker-compose.yml
```

### Проблема: Недостаточно памяти

**Решение:**
```bash
# Увеличьте лимиты памяти в Docker Desktop
# Settings → Resources → Memory

# Или добавьте лимиты в docker-compose.yml:
services:
  bot:
    mem_limit: 512m
  nextjs:
    mem_limit: 1g
```

---

## Дополнительные команды

### Управление Docker

```bash
# Просмотр всех контейнеров
docker ps -a

# Просмотр использования ресурсов
docker stats

# Очистка неиспользуемых ресурсов
docker system prune -a

# Просмотр логов с фильтром
docker compose logs bot | grep ERROR

# Выполнение команды в контейнере
docker compose exec bot bash
docker compose exec nextjs sh
```

### Резервное копирование БД

```bash
# Создание бэкапа
docker compose exec postgres pg_dump -U postgres telegram_bot > backup.sql

# Восстановление из бэкапа
docker compose exec -T postgres psql -U postgres telegram_bot < backup.sql
```

### Тестирование

```bash
# Запуск тестов Python бота
cd telegram-bot
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/macOS
pytest tests/ -v

# Запуск тестов Next.js
cd nextjs-app
npm test
```

---

## Полезные ссылки

- [Docker Documentation](https://docs.docker.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [aiogram Documentation](https://docs.aiogram.dev/)

---

## Поддержка

Если у вас возникли проблемы, которые не описаны в этом руководстве:

1. Проверьте логи всех сервисов
2. Убедитесь, что все переменные окружения заполнены правильно
3. Проверьте, что все внешние сервисы (Telegram, Google Sheets, Supabase) настроены корректно
4. Создайте issue в репозитории с подробным описанием проблемы и логами

---

**Версия документа**: 1.0  
**Последнее обновление**: 2026-02-26
