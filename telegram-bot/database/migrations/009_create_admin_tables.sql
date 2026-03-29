-- Migration 009: Create admin authorization system tables
-- Description: Создание таблиц для системы авторизации администраторов с ролевой моделью
-- Date: 2026-03-28
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.4, 11.1, 11.2

-- ============================================================================
-- Таблица administrators: Администраторы системы с ролевой моделью
-- ============================================================================

CREATE TABLE IF NOT EXISTS administrators (
    tg_id BIGINT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    role INTEGER NOT NULL DEFAULT 3,
    password_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Проверка валидности роли (0-3)
    CONSTRAINT chk_role CHECK (role >= 0 AND role <= 3)
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_administrators_role ON administrators(role);
CREATE INDEX IF NOT EXISTS idx_administrators_username ON administrators(username);

-- Комментарии к таблице и полям
COMMENT ON TABLE administrators IS 'Администраторы системы с ролевой моделью';
COMMENT ON COLUMN administrators.tg_id IS 'Telegram ID администратора (Primary Key)';
COMMENT ON COLUMN administrators.username IS 'Telegram username администратора';
COMMENT ON COLUMN administrators.role IS 'Уровень роли: 0=Developer, 1=Assistant, 2=Administrator, 3=Operator';
COMMENT ON COLUMN administrators.password_hash IS 'Хеш пароля (Argon2id), NULL для новых администраторов';
COMMENT ON COLUMN administrators.created_at IS 'Время создания записи';
COMMENT ON COLUMN administrators.updated_at IS 'Время последнего обновления';

-- ============================================================================
-- Таблица auth_attempts: Попытки входа для rate limiting
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
    id SERIAL PRIMARY KEY,
    tg_id BIGINT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    success BOOLEAN DEFAULT FALSE
    
    -- ПРИМЕЧАНИЕ: Намеренно НЕ используем foreign key constraint
    -- Мы хотим записывать попытки входа для ЛЮБЫХ tg_id,
    -- включая несуществующих (защита от перебора tg_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_auth_attempts_tg_id_timestamp 
    ON auth_attempts(tg_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_timestamp 
    ON auth_attempts(timestamp);

-- Комментарии к таблице и полям
COMMENT ON TABLE auth_attempts IS 'Попытки входа для rate limiting и аудита';
COMMENT ON COLUMN auth_attempts.tg_id IS 'Telegram ID администратора';
COMMENT ON COLUMN auth_attempts.timestamp IS 'Время попытки входа';
COMMENT ON COLUMN auth_attempts.ip_address IS 'IP адрес (если доступен)';
COMMENT ON COLUMN auth_attempts.success IS 'Успешность попытки входа';

-- ============================================================================
-- Таблица system_config: Конфигурация системы
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by BIGINT,
    
    -- Внешний ключ на администратора, который обновил
    CONSTRAINT fk_updated_by
        FOREIGN KEY (updated_by)
        REFERENCES administrators(tg_id)
        ON DELETE SET NULL
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_system_config_updated_at ON system_config(updated_at DESC);

-- Комментарии к таблице и полям
COMMENT ON TABLE system_config IS 'Конфигурация системы (key-value store)';
COMMENT ON COLUMN system_config.key IS 'Ключ конфигурации (например: session_lifetime_hours)';
COMMENT ON COLUMN system_config.value IS 'Значение конфигурации';
COMMENT ON COLUMN system_config.updated_at IS 'Время последнего обновления';
COMMENT ON COLUMN system_config.updated_by IS 'tg_id администратора, который обновил';

-- ============================================================================
-- Триггер notify_new_admin: Автоматические уведомления о новых администраторах
-- ============================================================================

-- Функция триггера для отправки уведомлений
CREATE OR REPLACE FUNCTION notify_new_admin()
RETURNS TRIGGER AS $$
BEGIN
    -- Отправляем уведомление через PostgreSQL NOTIFY
    PERFORM pg_notify(
        'new_admin_notification',
        json_build_object(
            'tg_id', NEW.tg_id,
            'username', NEW.username,
            'role', NEW.role
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера на INSERT в таблицу administrators
DROP TRIGGER IF EXISTS trigger_notify_new_admin ON administrators;
CREATE TRIGGER trigger_notify_new_admin
    AFTER INSERT ON administrators
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_admin();

-- Комментарии к триггеру
COMMENT ON FUNCTION notify_new_admin() IS 'Функция триггера для отправки уведомлений о новых администраторах через NOTIFY';
COMMENT ON TRIGGER trigger_notify_new_admin ON administrators IS 'Триггер для автоматической отправки уведомлений при создании нового администратора';

-- ============================================================================
-- Начальные данные: Конфигурация времени жизни сессий
-- ============================================================================

-- Вставка начального значения session_lifetime_hours = 24
INSERT INTO system_config (key, value, updated_at, updated_by)
VALUES ('session_lifetime_hours', '24', NOW(), NULL)
ON CONFLICT (key) DO NOTHING;

-- Комментарий к начальному значению
COMMENT ON TABLE system_config IS 'Конфигурация системы. Начальное значение session_lifetime_hours = 24 часа';
