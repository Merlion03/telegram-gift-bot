# Применение миграции 015_add_help_needed_field

## Проблема
Поле `help_needed` отсутствует в production базе данных, что вызывает ошибки:
```
column support_sessions.help_needed does not exist
```

## Решение

### Вариант 1: Пересоздание контейнера PostgreSQL (рекомендуется для dev)

**ВНИМАНИЕ**: Это удалит все данные в БД!

```bash
# Остановить и удалить контейнер PostgreSQL
docker-compose down postgres

# Удалить volume с данными
docker volume rm telegram_system_postgres_data

# Запустить контейнер заново (миграция применится автоматически)
docker-compose up -d postgres
```

### Вариант 2: Применение миграции к существующей БД (для production)

**Рекомендуется для production**, так как сохраняет все данные.

#### Шаг 1: Подключиться к контейнеру PostgreSQL

```bash
docker exec -it telegram-system-postgres psql -U botuser -d telegram_bot
```

#### Шаг 2: Выполнить SQL миграцию

Скопируйте и выполните следующий SQL:

```sql
-- Добавление поля help_needed в таблицу support_sessions
ALTER TABLE support_sessions 
ADD COLUMN IF NOT EXISTS help_needed BOOLEAN NOT NULL DEFAULT FALSE;

-- Комментарий к полю
COMMENT ON COLUMN support_sessions.help_needed IS 'Флаг запроса помощи пользователем через кнопку "Нужна помощь"';

-- Создание индекса для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_support_sessions_help_needed ON support_sessions(help_needed);

-- Проверка успешности
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'support_sessions' AND column_name = 'help_needed';
```

#### Шаг 3: Проверить результат

Вы должны увидеть:
```
 column_name  | data_type | is_nullable | column_default 
--------------+-----------+-------------+----------------
 help_needed  | boolean   | NO          | false
```

#### Шаг 4: Выйти из psql

```sql
\q
```

#### Шаг 5: Перезапустить сервисы

```bash
docker-compose restart bot webapp api-server
```

### Вариант 3: Применение через файл миграции

```bash
# Скопировать миграцию в контейнер
docker cp telegram-bot/database/migrations/015_add_help_needed_field.sql telegram-system-postgres:/tmp/

# Применить миграцию
docker exec -it telegram-system-postgres psql -U botuser -d telegram_bot -f /tmp/015_add_help_needed_field.sql
```

## Проверка

После применения миграции проверьте, что ошибки исчезли:

1. Откройте админ-панель: http://localhost:3000/admin
2. Проверьте, что список сессий загружается без ошибок
3. Проверьте логи контейнеров:
   ```bash
   docker-compose logs -f webapp bot
   ```

## Автоматическое применение при следующем запуске

Миграция уже добавлена в `docker-compose.yml`, поэтому при следующем создании контейнера PostgreSQL она применится автоматически.

## Откат (если нужно)

Если нужно откатить миграцию:

```sql
-- Удаление индекса
DROP INDEX IF EXISTS idx_support_sessions_help_needed;

-- Удаление поля
ALTER TABLE support_sessions DROP COLUMN IF EXISTS help_needed;
```
