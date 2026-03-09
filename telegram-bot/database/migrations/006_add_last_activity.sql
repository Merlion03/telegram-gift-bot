-- Migration 006: Добавление поля last_activity в support_sessions
-- Дата: 2026-03-05
-- Описание: Добавляет поле last_activity для отслеживания времени последней активности сессии
--           Используется для автоматического закрытия неактивных сессий

-- Добавляем поле last_activity
ALTER TABLE support_sessions 
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- Создаём индекс для быстрого поиска неактивных сессий
CREATE INDEX IF NOT EXISTS idx_support_sessions_last_activity 
ON support_sessions(last_activity) 
WHERE status = 'active';

-- Инициализируем last_activity для существующих сессий
-- Используем created_at как начальное значение
UPDATE support_sessions 
SET last_activity = created_at 
WHERE last_activity IS NULL;

-- Комментарии для документации
COMMENT ON COLUMN support_sessions.last_activity IS 'Время последней активности в сессии (обновляется при каждом сообщении)';
