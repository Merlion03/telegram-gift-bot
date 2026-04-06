-- Migration 014: Исправление значений по умолчанию для полей
-- Дата: 2026-04-03
-- Описание: Добавление значений по умолчанию для полей created_at, last_activity, delivered, media_type
--           Это исправляет проблему, когда поля были обязательными, но не имели значений по умолчанию

-- ============================================================================
-- Исправление значений по умолчанию для support_sessions
-- ============================================================================

-- Добавляем DEFAULT NOW() для created_at
ALTER TABLE support_sessions 
    ALTER COLUMN created_at SET DEFAULT NOW();

-- Добавляем DEFAULT NOW() для last_activity
ALTER TABLE support_sessions 
    ALTER COLUMN last_activity SET DEFAULT NOW();

-- ============================================================================
-- Исправление значений по умолчанию для support_messages
-- ============================================================================

-- Добавляем DEFAULT NOW() для created_at
ALTER TABLE support_messages 
    ALTER COLUMN created_at SET DEFAULT NOW();

-- Добавляем DEFAULT FALSE для delivered
ALTER TABLE support_messages 
    ALTER COLUMN delivered SET DEFAULT FALSE;

-- Добавляем DEFAULT 'text' для media_type
ALTER TABLE support_messages 
    ALTER COLUMN media_type SET DEFAULT 'text';

-- Комментарии
COMMENT ON COLUMN support_sessions.created_at IS 'Время создания сессии (автоматически устанавливается при создании)';
COMMENT ON COLUMN support_sessions.last_activity IS 'Время последней активности в сессии (автоматически устанавливается при создании и обновляется при каждом сообщении)';
COMMENT ON COLUMN support_messages.created_at IS 'Время создания сообщения (автоматически устанавливается при создании)';
COMMENT ON COLUMN support_messages.delivered IS 'Флаг доставки сообщения пользователю (по умолчанию FALSE)';
COMMENT ON COLUMN support_messages.media_type IS 'Тип медиа-контента (по умолчанию text): text, photo, video, animation, sticker, voice, document';
