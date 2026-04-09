-- Откат миграции: Удаление поля help_needed из таблицы support_sessions
-- Дата: 2026-04-09
-- Описание: Откатывает изменения миграции 015_add_help_needed_field.sql

-- Удаление индекса
DROP INDEX IF EXISTS idx_support_sessions_help_needed;

-- Удаление поля help_needed
ALTER TABLE support_sessions 
DROP COLUMN IF EXISTS help_needed;

-- Проверка успешности отката
DO $$
BEGIN
    -- Проверяем что поле удалено
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'support_sessions' 
        AND column_name = 'help_needed'
    ) THEN
        RAISE EXCEPTION 'Откат не удался: поле help_needed всё ещё существует';
    END IF;
    
    RAISE NOTICE 'Откат миграции 015_add_help_needed_field выполнен успешно';
END $$;
