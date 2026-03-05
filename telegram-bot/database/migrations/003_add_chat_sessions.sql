-- Миграция 003: Добавление поддержки Chat_Session
-- Расширение схемы для автоматического сохранения всех диалогов с ботом

-- ============================================================================
-- 1. Добавление поля session_type в таблицу support_sessions
-- ============================================================================

-- Добавляем новое поле session_type
ALTER TABLE support_sessions 
ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) NOT NULL DEFAULT 'support';

-- Добавляем constraint для проверки типа сессии
ALTER TABLE support_sessions
ADD CONSTRAINT chk_session_type CHECK (session_type IN ('chat', 'support'));

-- Создаём индекс для оптимизации запросов по типу сессии
CREATE INDEX IF NOT EXISTS idx_sessions_session_type ON support_sessions(session_type);

-- Создаём составной индекс для частых запросов (telegram_id + status + session_type)
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_status_type 
ON support_sessions(telegram_id, status, session_type);

-- Комментарий к новому полю
COMMENT ON COLUMN support_sessions.session_type IS 
'Тип сессии: chat (обычный диалог с ботом) или support (сессия поддержки с администратором)';


-- ============================================================================
-- 2. Расширение constraint для message_type в таблице support_messages
-- ============================================================================

-- Удаляем старый constraint
ALTER TABLE support_messages
DROP CONSTRAINT IF EXISTS chk_message_type;

-- Добавляем новый constraint с поддержкой типа 'from_bot'
ALTER TABLE support_messages
ADD CONSTRAINT chk_message_type CHECK (message_type IN ('from_user', 'from_support', 'from_bot'));

-- Комментарий к обновлённому полю
COMMENT ON COLUMN support_messages.message_type IS 
'Тип сообщения: from_user (от пользователя), from_support (от администратора), from_bot (от бота)';


-- ============================================================================
-- 3. Дополнительные индексы для оптимизации производительности
-- ============================================================================

-- Индекс для поиска активных сессий конкретного пользователя
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_active 
ON support_sessions(telegram_id, status) 
WHERE status = 'active';

-- Индекс для сортировки сессий по времени последнего сообщения (для админ-панели)
-- Этот индекс будет использоваться вместе с JOIN на support_messages
CREATE INDEX IF NOT EXISTS idx_sessions_created_desc 
ON support_sessions(created_at DESC);

-- Индекс для быстрого поиска последнего сообщения в сессии
CREATE INDEX IF NOT EXISTS idx_messages_session_created 
ON support_messages(session_id, created_at DESC);


-- ============================================================================
-- 4. Обновление существующих данных (если есть)
-- ============================================================================

-- Все существующие сессии считаются сессиями поддержки (support)
-- Поле session_type уже имеет DEFAULT 'support', поэтому дополнительных действий не требуется


-- ============================================================================
-- ОТКАТ МИГРАЦИИ (для справки)
-- ============================================================================

/*
-- Удаление индексов
DROP INDEX IF EXISTS idx_messages_session_created;
DROP INDEX IF EXISTS idx_sessions_created_desc;
DROP INDEX IF EXISTS idx_sessions_telegram_active;
DROP INDEX IF EXISTS idx_sessions_telegram_status_type;
DROP INDEX IF EXISTS idx_sessions_session_type;

-- Восстановление старого constraint для message_type
ALTER TABLE support_messages DROP CONSTRAINT IF EXISTS chk_message_type;
ALTER TABLE support_messages 
ADD CONSTRAINT chk_message_type CHECK (message_type IN ('from_user', 'from_support'));

-- Удаление constraint для session_type
ALTER TABLE support_sessions DROP CONSTRAINT IF EXISTS chk_session_type;

-- Удаление поля session_type
ALTER TABLE support_sessions DROP COLUMN IF EXISTS session_type;
*/

