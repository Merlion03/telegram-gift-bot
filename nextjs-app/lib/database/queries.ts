/**
 * SQL запросы для работы с БД поддержки
 * Централизованное хранение всех SQL запросов для удобства поддержки
 */

/**
 * Запросы для работы с сессиями поддержки
 */
export const SessionQueries = {
  /**
   * Подсчёт общего количества сессий по статусу
   */
  COUNT_BY_STATUS: `
    SELECT COUNT(*) as total
    FROM support_sessions
    WHERE status = $1
  `,

  /**
   * Получение списка сессий с метаданными
   * Включает подсчёт непрочитанных сообщений и последнее сообщение
   */
  GET_WITH_METADATA: `
    SELECT 
      s.id,
      s.telegram_id,
      s.status,
      s.created_at,
      s.closed_at,
      COUNT(CASE WHEN m.message_type = 'from_user' AND m.delivered = false THEN 1 END) as unread_count,
      MAX(m.message_text) as last_message,
      MAX(m.created_at) as last_message_at
    FROM support_sessions s
    LEFT JOIN support_messages m ON s.id = m.session_id
    WHERE s.status = $1
    GROUP BY s.id, s.telegram_id, s.status, s.created_at, s.closed_at
    ORDER BY s.created_at DESC
    LIMIT $2 OFFSET $3
  `,

  /**
   * Получение информации о конкретной сессии
   */
  GET_BY_ID: `
    SELECT 
      id,
      telegram_id,
      status,
      created_at,
      closed_at
    FROM support_sessions
    WHERE id = $1
  `,

  /**
   * Создание новой сессии поддержки
   */
  CREATE: `
    INSERT INTO support_sessions (telegram_id, status)
    VALUES ($1, 'active')
    RETURNING id, telegram_id, status, created_at, closed_at
  `,

  /**
   * Закрытие сессии поддержки
   */
  CLOSE: `
    UPDATE support_sessions
    SET status = 'closed', closed_at = NOW()
    WHERE id = $1
    RETURNING id, telegram_id, status, created_at, closed_at
  `,

  /**
   * Получение активной сессии для пользователя
   */
  GET_ACTIVE_BY_TELEGRAM_ID: `
    SELECT 
      id,
      telegram_id,
      status,
      created_at,
      closed_at
    FROM support_sessions
    WHERE telegram_id = $1 AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `,
} as const;

/**
 * Запросы для работы с сообщениями поддержки
 */
export const MessageQueries = {
  /**
   * Получение всех сообщений сессии
   */
  GET_BY_SESSION: `
    SELECT 
      id,
      session_id,
      telegram_id,
      message_type,
      message_text,
      file_id,
      created_at,
      delivered
    FROM support_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
  `,

  /**
   * Создание нового сообщения
   */
  CREATE: `
    INSERT INTO support_messages (
      session_id,
      telegram_id,
      message_type,
      message_text,
      file_id,
      delivered
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING 
      id,
      session_id,
      telegram_id,
      message_type,
      message_text,
      file_id,
      created_at,
      delivered
  `,

  /**
   * Отметка сообщения как доставленного
   */
  MARK_AS_DELIVERED: `
    UPDATE support_messages
    SET delivered = true
    WHERE id = $1
  `,

  /**
   * Получение непрочитанных сообщений пользователя
   */
  GET_UNREAD_BY_TELEGRAM_ID: `
    SELECT 
      id,
      session_id,
      telegram_id,
      message_type,
      message_text,
      file_id,
      created_at,
      delivered
    FROM support_messages
    WHERE telegram_id = $1 
      AND message_type = 'from_user' 
      AND delivered = false
    ORDER BY created_at ASC
  `,

  /**
   * Подсчёт непрочитанных сообщений для сессии
   */
  COUNT_UNREAD_BY_SESSION: `
    SELECT COUNT(*) as unread_count
    FROM support_messages
    WHERE session_id = $1 
      AND message_type = 'from_user' 
      AND delivered = false
  `,

  /**
   * Получение последнего сообщения сессии
   */
  GET_LAST_BY_SESSION: `
    SELECT 
      id,
      session_id,
      telegram_id,
      message_type,
      message_text,
      file_id,
      created_at,
      delivered
    FROM support_messages
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `,
} as const;

/**
 * Утилитарные запросы
 */
export const UtilityQueries = {
  /**
   * Проверка подключения к БД
   */
  TEST_CONNECTION: 'SELECT NOW()',

  /**
   * Получение версии PostgreSQL
   */
  GET_VERSION: 'SELECT version()',

  /**
   * Проверка существования таблицы
   */
  CHECK_TABLE_EXISTS: `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )
  `,
} as const;
