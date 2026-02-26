# 🚀 Быстрый старт

## ✅ Что уже сделано

- [x] Создан файл `.env` (нужно заполнить)
- [x] Создана папка `credentials/` (нужно добавить файл)

## 📝 Что нужно сделать (5 шагов)

### Шаг 1: Заполните `.env` файл

Откройте файл `.env` в редакторе и заполните следующие значения:

```env
BOT_TOKEN=ЗАПОЛНИТЕ_ЗДЕСЬ          # Получите у @BotFather
SPREADSHEET_ID=ЗАПОЛНИТЕ_ЗДЕСЬ     # ID вашей Google Таблицы
NEXT_PUBLIC_SUPABASE_URL=ЗАПОЛНИТЕ_ЗДЕСЬ
NEXT_PUBLIC_SUPABASE_ANON_KEY=ЗАПОЛНИТЕ_ЗДЕСЬ
SUPABASE_SERVICE_ROLE_KEY=ЗАПОЛНИТЕ_ЗДЕСЬ
NEXTAUTH_SECRET=ЗАПОЛНИТЕ_ЗДЕСЬ    # Минимум 32 символа
ADMIN_PASSWORD=ЗАПОЛНИТЕ_ЗДЕСЬ     # Ваш пароль для админки
```

**Подсказки:**
- `BOT_TOKEN`: Telegram -> @BotFather -> /newbot
- `SPREADSHEET_ID`: Из URL таблицы (между `/d/` и `/edit`)
- Supabase ключи: https://supabase.com -> Settings -> API
- `NEXTAUTH_SECRET`: Выполните `openssl rand -base64 32` или придумайте строку 32+ символов

### Шаг 2: Добавьте Google Credentials

1. Получите файл `google-credentials.json` (инструкция в `credentials/README.txt`)
2. Поместите его в папку `credentials/`
3. Путь должен быть: `credentials/google-credentials.json`

### Шаг 3: Настройте Supabase

Выполните в SQL Editor вашего Supabase проекта:

```sql
-- Создание таблиц
CREATE TABLE support_sessions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    unread_count INTEGER DEFAULT 0
);

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

-- Индексы
CREATE INDEX idx_support_sessions_telegram_id ON support_sessions(telegram_id);
CREATE INDEX idx_support_sessions_status ON support_sessions(status);
CREATE INDEX idx_support_messages_session_id ON support_messages(session_id);

-- Включите RLS
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Service role full access sessions"
ON support_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access messages"
ON support_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon read sessions"
ON support_sessions FOR SELECT TO anon USING (true);

CREATE POLICY "Anon read messages"
ON support_messages FOR SELECT TO anon USING (true);
```

**Включите Realtime:**
- Database -> Replication
- Включите для `support_sessions` и `support_messages`

### Шаг 4: Настройте Google Таблицу

1. Откройте вашу Google Таблицу
2. Создайте лист с названием кодового слова (например, `testcode`)
3. Добавьте заголовки в первую строку:
   - A: Telegram ID
   - B: Prize Type
   - C: Promo Code
   - D: Instructions
   - E: Full Name
   - F: Address
   - G: Phone
   - H: Comment
   - I: Claimed At

4. Добавьте тестовую строку:
   - A: ваш Telegram ID (узнайте у @userinfobot)
   - B: `digital`
   - C: `PROMO123`
   - D: `Используйте промокод на сайте`

5. Дайте доступ Service Account:
   - Share -> добавьте email из `google-credentials.json` (поле `client_email`)
   - Права: Editor

### Шаг 5: Запустите систему

```powershell
# Убедитесь, что Docker Desktop запущен

# Запустите все сервисы
docker compose up -d

# Проверьте статус (все должны быть "Up")
docker compose ps

# Смотрите логи
docker compose logs -f
```

## 🎯 Проверка работы

### 1. Проверьте веб-интерфейс

Откройте в браузере:
- http://localhost:3000 - главная страница
- http://localhost:3000/api/health - health check
- http://localhost:3000/login - страница входа

### 2. Проверьте бота

1. Найдите вашего бота в Telegram
2. Отправьте `/start`
3. Бот должен ответить приветствием

### 3. Проверьте кодовое слово

1. Отправьте боту: `testcode`
2. Должны получить сообщение с промокодом

### 4. Проверьте админку

1. Откройте http://localhost:3000/login
2. Войдите (admin / ваш пароль)
3. Должна открыться админка

## 🐛 Если что-то не работает

### Смотрите логи:

```powershell
# Логи бота
docker compose logs bot

# Логи Next.js
docker compose logs nextjs

# Логи PostgreSQL
docker compose logs postgres
```

### Перезапуск:

```powershell
# Остановить
docker compose down

# Запустить заново
docker compose up -d
```

### Полная перезагрузка:

```powershell
# Остановить и удалить всё (включая БД!)
docker compose down -v

# Пересобрать и запустить
docker compose up -d --build
```

## 📚 Дополнительная документация

- `INSTALLATION.md` - полное руководство по установке
- `LOCAL_TESTING_GUIDE.md` - подробное руководство по тестированию
- `README.md` - описание проекта

## 🆘 Нужна помощь?

Проверьте:
1. Docker Desktop запущен
2. Все переменные в `.env` заполнены
3. Файл `credentials/google-credentials.json` на месте
4. Таблицы созданы в Supabase
5. Service Account имеет доступ к Google Таблице

Если проблема не решается - смотрите логи и `INSTALLATION.md` раздел "Решение проблем"
