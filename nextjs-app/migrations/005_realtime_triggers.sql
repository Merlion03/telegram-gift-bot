-- Миграция 005: PostgreSQL LISTEN/NOTIFY триггеры для real-time уведомлений
-- Создание функций и триггеров для автоматической отправки уведомлений при изменениях в БД

-- ============================================================================
-- 1. Триггер для новых сообщений (support_messages)
-- ============================================================================

-- Функция для отправки уведомлений о новых сообщениях
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    -- Формируем JSON payload с данными о новом сообщении
    payload = json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'session_id', NEW.session_id,
        'message_id', NEW.id,
        'data', json_build_object(
            'id', NEW.id,
            'session_id', NEW.session_id,
            'telegram_id', NEW.telegram_id,
            'message_type', NEW.message_type,
            'message_text', NEW.message_text,
            'file_id', NEW.file_id,
            'media_type', NEW.media_type,
            'file_path', NEW.file_path,
            'caption', NEW.caption,
            'file_size', NEW.file_size,
            'created_at', NEW.created_at,
            'delivered', NEW.delivered
        )
    );
    
    -- Отправляем уведомление в канал 'new_message'
    PERFORM pg_notify('new_message', payload::text);
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Логируем ошибку, но не блокируем INSERT операцию
        RAISE WARNING 'Failed to send notification for new message: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаём триггер на INSERT в таблицу support_messages
DROP TRIGGER IF EXISTS trigger_notify_new_message ON support_messages;
CREATE TRIGGER trigger_notify_new_message
    AFTER INSERT ON support_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_message();

COMMENT ON FUNCTION notify_new_message() IS 'Функция для отправки уведомлений о новых сообщениях через PostgreSQL NOTIFY';
COMMENT ON TRIGGER trigger_notify_new_message ON support_messages IS 'Триггер для автоматической отправки уведомлений при добавлении новых сообщений';


-- ============================================================================
-- 2. Триггер для изменения статуса сессии (support_sessions)
-- ============================================================================

-- Функция для отправки уведомлений об изменении статуса сессии
CREATE OR REPLACE FUNCTION notify_session_status_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    -- Отправляем уведомление только если статус действительно изменился
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Формируем JSON payload с данными об изменении статуса
        payload = json_build_object(
            'operation', TG_OP,
            'table', TG_TABLE_NAME,
            'session_id', NEW.id,
            'old_status', OLD.status,
            'new_status', NEW.status,
            'data', json_build_object(
                'id', NEW.id,
                'telegram_id', NEW.telegram_id,
                'status', NEW.status,
                'session_type', NEW.session_type,
                'created_at', NEW.created_at,
                'closed_at', NEW.closed_at
            )
        );
        
        -- Отправляем уведомление в канал 'session_status_change'
        PERFORM pg_notify('session_status_change', payload::text);
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Логируем ошибку, но не блокируем UPDATE операцию
        RAISE WARNING 'Failed to send notification for session status change: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаём триггер на UPDATE в таблицу support_sessions
DROP TRIGGER IF EXISTS trigger_notify_session_status_change ON support_sessions;
CREATE TRIGGER trigger_notify_session_status_change
    AFTER UPDATE ON support_sessions
    FOR EACH ROW
    EXECUTE FUNCTION notify_session_status_change();

COMMENT ON FUNCTION notify_session_status_change() IS 'Функция для отправки уведомлений об изменении статуса сессии через PostgreSQL NOTIFY';
COMMENT ON TRIGGER trigger_notify_session_status_change ON support_sessions IS 'Триггер для автоматической отправки уведомлений при изменении статуса сессии';


-- ============================================================================
-- 3. Триггер для изменения типа сессии (support_sessions)
-- ============================================================================

-- Функция для отправки уведомлений об изменении типа сессии
CREATE OR REPLACE FUNCTION notify_session_type_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    -- Отправляем уведомление только если тип сессии действительно изменился
    IF OLD.session_type IS DISTINCT FROM NEW.session_type THEN
        -- Формируем JSON payload с данными об изменении типа сессии
        payload = json_build_object(
            'operation', TG_OP,
            'table', TG_TABLE_NAME,
            'session_id', NEW.id,
            'old_type', OLD.session_type,
            'new_type', NEW.session_type,
            'data', json_build_object(
                'id', NEW.id,
                'telegram_id', NEW.telegram_id,
                'status', NEW.status,
                'session_type', NEW.session_type,
                'created_at', NEW.created_at,
                'closed_at', NEW.closed_at
            )
        );
        
        -- Отправляем уведомление в канал 'session_type_change'
        PERFORM pg_notify('session_type_change', payload::text);
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Логируем ошибку, но не блокируем UPDATE операцию
        RAISE WARNING 'Failed to send notification for session type change: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаём триггер на UPDATE в таблицу support_sessions
DROP TRIGGER IF EXISTS trigger_notify_session_type_change ON support_sessions;
CREATE TRIGGER trigger_notify_session_type_change
    AFTER UPDATE ON support_sessions
    FOR EACH ROW
    EXECUTE FUNCTION notify_session_type_change();

COMMENT ON FUNCTION notify_session_type_change() IS 'Функция для отправки уведомлений об изменении типа сессии через PostgreSQL NOTIFY';
COMMENT ON TRIGGER trigger_notify_session_type_change ON support_sessions IS 'Триггер для автоматической отправки уведомлений при изменении типа сессии';


-- ============================================================================
-- ROLLBACK СЕКЦИЯ
-- ============================================================================
-- Для отката миграции выполните следующие команды:
--
-- DROP TRIGGER IF EXISTS trigger_notify_new_message ON support_messages;
-- DROP TRIGGER IF EXISTS trigger_notify_session_status_change ON support_sessions;
-- DROP TRIGGER IF EXISTS trigger_notify_session_type_change ON support_sessions;
-- DROP FUNCTION IF EXISTS notify_new_message();
-- DROP FUNCTION IF EXISTS notify_session_status_change();
-- DROP FUNCTION IF EXISTS notify_session_type_change();
