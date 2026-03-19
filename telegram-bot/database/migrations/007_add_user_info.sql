-- Migration 007: Добавление информации о пользователях в support_sessions
-- Дата: 2026-03-16
-- Описание: Добавляет поля first_name, last_name, username для хранения информации о пользователях
--           Это позволит отображать имена пользователей в админ-панели вместо ID

-- Добавляем поля для информации о пользователе
ALTER TABLE support_sessions 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- Создаём индекс для поиска по имени пользователя
CREATE INDEX IF NOT EXISTS idx_support_sessions_user_info 
ON support_sessions(first_name, last_name, username);

-- Комментарии для документации
COMMENT ON COLUMN support_sessions.first_name IS 'Имя пользователя из Telegram';
COMMENT ON COLUMN support_sessions.last_name IS 'Фамилия пользователя из Telegram';
COMMENT ON COLUMN support_sessions.username IS 'Username пользователя в Telegram (без @)';