-- Схема базы данных для системы поддержки Telegram Bot
-- Создание таблиц support_sessions и support_messages

-- Таблица сессий поддержки
CREATE TABLE IF NOT EXISTS support_sessions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'closed'
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    
    -- Индексы для оптимизации запросов
    CONSTRAINT chk_status CHECK (status IN ('active', 'closed'))
);

-- Индексы для таблицы support_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_id ON support_sessions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON support_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON support_sessions(created_at);

-- Таблица сообщений поддержки
CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    telegram_id BIGINT NOT NULL,
    message_type VARCHAR(20) NOT NULL, -- 'from_user', 'from_support'
    message_text TEXT NOT NULL,
    file_id VARCHAR(255), -- для медиа-контента
    created_at TIMESTAMP DEFAULT NOW(),
    delivered BOOLEAN DEFAULT FALSE,
    
    -- Внешний ключ на таблицу сессий
    CONSTRAINT fk_session
        FOREIGN KEY (session_id)
        REFERENCES support_sessions(id)
        ON DELETE CASCADE,
    
    -- Проверка типа сообщения
    CONSTRAINT chk_message_type CHECK (message_type IN ('from_user', 'from_support'))
);

-- Индексы для таблицы support_messages
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON support_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_telegram_id ON support_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON support_messages(created_at);

-- Комментарии к таблицам
COMMENT ON TABLE support_sessions IS 'Сессии общения пользователей со службой поддержки';
COMMENT ON TABLE support_messages IS 'Сообщения в рамках сессий поддержки';

COMMENT ON COLUMN support_sessions.telegram_id IS 'Telegram ID пользователя';
COMMENT ON COLUMN support_sessions.status IS 'Статус сессии: active (активна) или closed (завершена)';
COMMENT ON COLUMN support_sessions.created_at IS 'Время создания сессии';
COMMENT ON COLUMN support_sessions.closed_at IS 'Время завершения сессии';

COMMENT ON COLUMN support_messages.session_id IS 'ID сессии поддержки';
COMMENT ON COLUMN support_messages.telegram_id IS 'Telegram ID отправителя';
COMMENT ON COLUMN support_messages.message_type IS 'Тип сообщения: from_user (от пользователя) или from_support (от поддержки)';
COMMENT ON COLUMN support_messages.message_text IS 'Текст сообщения';
COMMENT ON COLUMN support_messages.file_id IS 'ID файла для медиа-контента (фото, документы)';
COMMENT ON COLUMN support_messages.created_at IS 'Время создания сообщения';
COMMENT ON COLUMN support_messages.delivered IS 'Флаг доставки сообщения пользователю';
