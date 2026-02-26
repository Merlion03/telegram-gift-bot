# Миграции базы данных

## Обзор

Этот каталог содержит SQL миграции для настройки PostgreSQL базы данных через Supabase.

## Список миграций

### 001_initial_schema.sql
Создание базовой схемы БД:
- Таблица `support_sessions` - сессии поддержки
- Таблица `support_messages` - сообщения поддержки
- Индексы для оптимизации запросов

### 002_enable_realtime.sql
Настройка Supabase Realtime:
- Включение real-time для таблицы `support_messages`
- Включение real-time для таблицы `support_sessions`
- Дополнительные индексы для real-time запросов

## Применение миграций

### Через Supabase Dashboard

1. Откройте ваш проект в [Supabase Dashboard](https://app.supabase.com)
2. Перейдите в раздел **SQL Editor**
3. Скопируйте содержимое миграции и выполните

### Через Supabase CLI

```bash
# Установка Supabase CLI (если не установлен)
npm install -g supabase

# Инициализация проекта
supabase init

# Применение миграций
supabase db push
```

### Через psql (прямое подключение)

```bash
psql -h <your-supabase-host> -U postgres -d postgres -f 001_initial_schema.sql
psql -h <your-supabase-host> -U postgres -d postgres -f 002_enable_realtime.sql
```

## Проверка настройки Realtime

После применения миграции 002, проверьте настройку:

```sql
-- Проверка публикации
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Должны быть видны таблицы:
-- - support_messages
-- - support_sessions
```

## Откат миграций

Каждая миграция содержит секцию с командами отката в комментариях.

## Важные замечания

- Миграции применяются последовательно
- Не изменяйте уже применённые миграции
- Создавайте новые миграции для изменений схемы
- Всегда тестируйте миграции на dev окружении перед production
