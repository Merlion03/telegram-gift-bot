-- Миграция для включения Supabase Realtime на таблицах поддержки
-- Эта миграция должна выполняться в Supabase Dashboard или через Supabase CLI

-- ============================================================================
-- ВАЖНО: Эта миграция предназначена для Supabase
-- ============================================================================
-- Если вы используете обычный PostgreSQL без Supabase, эти команды не нужны.
-- Supabase Realtime работает через расширение и публикации PostgreSQL.

-- Включаем Realtime для таблицы support_messages
-- Это позволит клиентам подписываться на изменения в реальном времени
ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;

-- Включаем Realtime для таблицы support_sessions
-- Это позволит отслеживать изменения статусов сессий
ALTER PUBLICATION supabase_realtime ADD TABLE support_sessions;

-- Создаём индексы для оптимизации real-time запросов
-- Индекс для фильтрации по session_id (используется в подписках)
CREATE INDEX IF NOT EXISTS idx_support_messages_session_id_created 
ON support_messages(session_id, created_at DESC);

-- Индекс для фильтрации по статусу сессий
CREATE INDEX IF NOT EXISTS idx_support_sessions_status_created 
ON support_sessions(status, created_at DESC);

-- Комментарии для документации
COMMENT ON TABLE support_messages IS 'Таблица сообщений поддержки с включённым Supabase Realtime';
COMMENT ON TABLE support_sessions IS 'Таблица сессий поддержки с включённым Supabase Realtime';

-- ============================================================================
-- Инструкции по применению миграции
-- ============================================================================
-- 
-- Вариант 1: Через Supabase Dashboard
-- 1. Откройте ваш проект в Supabase Dashboard
-- 2. Перейдите в раздел "Database" -> "Replication"
-- 3. Включите Realtime для таблиц support_messages и support_sessions
-- 4. Или выполните этот SQL в разделе "SQL Editor"
--
-- Вариант 2: Через Supabase CLI
-- supabase db push
--
-- Вариант 3: Через psql (если используете прямое подключение)
-- psql -h <your-supabase-host> -U postgres -d postgres -f 002_enable_realtime.sql
--
-- ============================================================================
-- Проверка настройки Realtime
-- ============================================================================
--
-- Проверить, что таблицы добавлены в публикацию:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--
-- Ожидаемый результат должен включать:
-- - support_messages
-- - support_sessions
--
-- ============================================================================
-- Откат миграции (если необходимо)
-- ============================================================================
--
-- ALTER PUBLICATION supabase_realtime DROP TABLE support_messages;
-- ALTER PUBLICATION supabase_realtime DROP TABLE support_sessions;
-- DROP INDEX IF EXISTS idx_support_messages_session_id_created;
-- DROP INDEX IF EXISTS idx_support_sessions_status_created;
--
-- ============================================================================
