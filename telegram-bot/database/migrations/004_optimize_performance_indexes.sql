-- Миграция 004: Оптимизация производительности - добавление индексов
-- Validates: Requirements 7.2
-- Цель: Оптимизировать частые запросы для админ-панели

-- ============================================================================
-- ИНДЕКСЫ ДЛЯ ОПТИМИЗАЦИИ ЗАПРОСОВ
-- ============================================================================

-- 1. Composite индекс для фильтрации сессий по статусу и типу с сортировкой
-- Используется в запросе getSessions с фильтрами
-- Покрывает запросы типа: WHERE status = ? AND session_type = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_sessions_status_type_created 
ON support_sessions(status, session_type, created_at DESC);

-- 2. Индекс для подсчёта непрочитанных сообщений
-- Используется в getSessions для COUNT(CASE WHEN message_type = 'from_user' AND delivered = false)
CREATE INDEX IF NOT EXISTS idx_messages_unread 
ON support_messages(session_id, message_type, delivered) 
WHERE message_type = 'from_user' AND delivered = false;

-- 3. Индекс для быстрого поиска последнего сообщения в сессии
-- Используется для сортировки сессий по времени последнего сообщения
-- Покрывает: MAX(m.created_at) в GROUP BY запросах
CREATE INDEX IF NOT EXISTS idx_messages_session_last 
ON support_messages(session_id, created_at DESC);

-- 4. Индекс для фильтрации сообщений по типу (для статистики)
-- Используется для аналитики и фильтрации системных команд
CREATE INDEX IF NOT EXISTS idx_messages_type_created 
ON support_messages(message_type, created_at DESC);

-- 5. Covering индекс для запроса активных сессий с типом
-- Покрывает частый запрос: WHERE status = 'active' AND session_type = ?
CREATE INDEX IF NOT EXISTS idx_sessions_active_type 
ON support_sessions(status, session_type, created_at DESC) 
WHERE status = 'active';

-- 6. Индекс для поиска сессий по telegram_id с фильтром по типу
-- Используется для получения истории диалогов конкретного пользователя
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_type_created 
ON support_sessions(telegram_id, session_type, created_at DESC);

-- ============================================================================
-- АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ
-- ============================================================================

-- Обновляем статистику для оптимизатора запросов
ANALYZE support_sessions;
ANALYZE support_messages;

-- ============================================================================
-- КОММЕНТАРИИ К ИНДЕКСАМ
-- ============================================================================

COMMENT ON INDEX idx_sessions_status_type_created IS 
'Composite индекс для фильтрации и сортировки сессий по статусу и типу';

COMMENT ON INDEX idx_messages_unread IS 
'Partial индекс для быстрого подсчёта непрочитанных сообщений от пользователей';

COMMENT ON INDEX idx_messages_session_last IS 
'Индекс для определения времени последнего сообщения в сессии';

COMMENT ON INDEX idx_messages_type_created IS 
'Индекс для фильтрации сообщений по типу с сортировкой по времени';

COMMENT ON INDEX idx_sessions_active_type IS 
'Partial индекс для быстрого поиска активных сессий с фильтром по типу';

COMMENT ON INDEX idx_sessions_telegram_type_created IS 
'Индекс для получения истории диалогов пользователя с фильтром по типу';

-- ============================================================================
-- ОТКАТ МИГРАЦИИ
-- ============================================================================

-- Для отката выполните следующие команды:
-- DROP INDEX IF EXISTS idx_sessions_status_type_created;
-- DROP INDEX IF EXISTS idx_messages_unread;
-- DROP INDEX IF EXISTS idx_messages_session_last;
-- DROP INDEX IF EXISTS idx_messages_type_created;
-- DROP INDEX IF EXISTS idx_sessions_active_type;
-- DROP INDEX IF EXISTS idx_sessions_telegram_type_created;
