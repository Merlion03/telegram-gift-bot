-- Миграция: Добавление поля help_needed в таблицу support_sessions
-- Дата: 2026-04-09
-- Описание: Добавляет флаг запроса помощи пользователем через кнопку "Нужна помощь"
-- Связано с багфиксом: unread-counter-and-help-indicator-fix

-- Добавление поля help_needed в таблицу support_sessions
ALTER TABLE support_sessions 
ADD COLUMN help_needed BOOLEAN NOT NULL DEFAULT FALSE;

-- Комментарий к полю
COMMENT ON COLUMN support_sessions.help_needed IS 'Флаг запроса помощи пользователем через кнопку "Нужна помощь"';

-- Создание индекса для оптимизации запросов с фильтрацией по help_needed
CREATE INDEX idx_support_sessions_help_needed ON support_sessions(help_needed);

-- Проверка успешности миграции
DO $$
BEGIN
    -- Проверяем что поле добавлено
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'support_sessions' 
        AND column_name = 'help_needed'
    ) THEN
        RAISE EXCEPTION 'Миграция не удалась: поле help_needed не добавлено';
    END IF;
    
    -- Проверяем что индекс создан
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'support_sessions' 
        AND indexname = 'idx_support_sessions_help_needed'
    ) THEN
        RAISE EXCEPTION 'Миграция не удалась: индекс idx_support_sessions_help_needed не создан';
    END IF;
    
    RAISE NOTICE 'Миграция 015_add_help_needed_field выполнена успешно';
END $$;
