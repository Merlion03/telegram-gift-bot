-- Схема базы данных для системы поддержки Telegram Bot
-- Создание таблиц support_sessions и support_messages

-- Таблица сессий поддержки
CREATE TABLE IF NOT EXISTS support_sessions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'closed'
    session_type VARCHAR(20) NOT NULL DEFAULT 'chat', -- 'chat', 'support'
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    
    -- Constraints для проверки значений
    CONSTRAINT chk_status CHECK (status IN ('active', 'closed')),
    CONSTRAINT chk_session_type CHECK (session_type IN ('chat', 'support'))
);

-- Индексы для таблицы support_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_id ON support_sessions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON support_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_session_type ON support_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON support_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_status_type ON support_sessions(telegram_id, status, session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_active ON support_sessions(telegram_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sessions_created_desc ON support_sessions(created_at DESC);

-- Таблица сообщений поддержки
CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    telegram_id BIGINT NOT NULL,
    message_type VARCHAR(20) NOT NULL, -- 'from_user', 'from_support', 'from_bot'
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
    CONSTRAINT chk_message_type CHECK (message_type IN ('from_user', 'from_support', 'from_bot'))
);

-- Индексы для таблицы support_messages
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON support_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_telegram_id ON support_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON support_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON support_messages(session_id, created_at DESC);

-- Комментарии к таблицам
COMMENT ON TABLE support_sessions IS 'Сессии общения пользователей со службой поддержки';
COMMENT ON TABLE support_messages IS 'Сообщения в рамках сессий поддержки';

COMMENT ON COLUMN support_sessions.telegram_id IS 'Telegram ID пользователя';
COMMENT ON COLUMN support_sessions.status IS 'Статус сессии: active (активна) или closed (завершена)';
COMMENT ON COLUMN support_sessions.session_type IS 'Тип сессии: chat (обычный диалог с ботом) или support (сессия поддержки с администратором)';
COMMENT ON COLUMN support_sessions.created_at IS 'Время создания сессии';
COMMENT ON COLUMN support_sessions.closed_at IS 'Время завершения сессии';

COMMENT ON COLUMN support_messages.session_id IS 'ID сессии поддержки';
COMMENT ON COLUMN support_messages.telegram_id IS 'Telegram ID отправителя';
COMMENT ON COLUMN support_messages.message_type IS 'Тип сообщения: from_user (от пользователя), from_support (от поддержки), from_bot (от бота)';
COMMENT ON COLUMN support_messages.message_text IS 'Текст сообщения';
COMMENT ON COLUMN support_messages.file_id IS 'ID файла для медиа-контента (фото, документы)';
COMMENT ON COLUMN support_messages.created_at IS 'Время создания сообщения';
COMMENT ON COLUMN support_messages.delivered IS 'Флаг доставки сообщения пользователю';
