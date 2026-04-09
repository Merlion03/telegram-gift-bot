-- Миграция: Добавление DEFAULT значений для support_messages
-- Дата: 2026-04-09
-- Описание: Исправление ошибки "null value in column created_at violates not-null constraint"
--            и добавление DEFAULT значений для других обязательных полей

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
COMMENT ON COLUMN support_messages.created_at IS 'Время создания сообщения (автоматически устанавливается при вставке)';
COMMENT ON COLUMN support_messages.delivered IS 'Флаг доставки сообщения (по умолчанию false)';
COMMENT ON COLUMN support_messages.media_type IS 'Тип медиа-контента (по умолчанию text)';
