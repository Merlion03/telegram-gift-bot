/**
 * Константы для WebSocket архитектуры
 * Определяет коды закрытия, таймауты, лимиты и другие константы
 */

// ============================================================================
// WebSocket коды закрытия
// ============================================================================

/**
 * Стандартные коды закрытия WebSocket соединения
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.4.1
 */
export const CLOSE_CODES = {
  /** Нормальное закрытие соединения */
  NORMAL_CLOSURE: 1000,
  
  /** Сервер уходит в shutdown или браузер покидает страницу */
  GOING_AWAY: 1001,
  
  /** Ошибка протокола */
  PROTOCOL_ERROR: 1002,
  
  /** Получен неподдерживаемый тип данных */
  UNSUPPORTED_DATA: 1003,
  
  /** Зарезервировано */
  RESERVED: 1004,
  
  /** Не получен код закрытия (внутренний код) */
  NO_STATUS_RECEIVED: 1005,
  
  /** Аномальное закрытие без Close frame (внутренний код) */
  ABNORMAL_CLOSURE: 1006,
  
  /** Получены некорректные данные (не UTF-8) */
  INVALID_FRAME_PAYLOAD_DATA: 1007,
  
  /** Нарушение политики */
  POLICY_VIOLATION: 1008,
  
  /** Сообщение слишком большое */
  MESSAGE_TOO_BIG: 1009,
  
  /** Клиент ожидал расширение, которое сервер не поддерживает */
  MANDATORY_EXTENSION: 1010,
  
  /** Внутренняя ошибка сервера */
  INTERNAL_ERROR: 1011,
  
  /** Сервер перезагружается */
  SERVICE_RESTART: 1012,
  
  /** Сервер временно недоступен */
  TRY_AGAIN_LATER: 1013,
  
  /** Bad gateway */
  BAD_GATEWAY: 1014,
  
  /** TLS handshake failed (внутренний код) */
  TLS_HANDSHAKE_FAILED: 1015,
} as const;

/**
 * Кастомные коды закрытия для приложения (4000-4999)
 */
export const CUSTOM_CLOSE_CODES = {
  /** Ошибка аутентификации - невалидный токен */
  UNAUTHORIZED: 4401,
  
  /** Доступ запрещён - нет прав */
  FORBIDDEN: 4403,
  
  /** Таймаут heartbeat - нет pong ответа */
  HEARTBEAT_TIMEOUT: 4408,
  
  /** Сервер перегружен */
  SERVER_OVERLOADED: 4503,
} as const;

/**
 * Все коды закрытия
 */
export const ALL_CLOSE_CODES = {
  ...CLOSE_CODES,
  ...CUSTOM_CLOSE_CODES,
} as const;

/**
 * Коды закрытия, при которых НЕ нужно переподключаться
 */
export const NO_RECONNECT_CODES = [
  CLOSE_CODES.NORMAL_CLOSURE,        // Нормальное закрытие
  CUSTOM_CLOSE_CODES.UNAUTHORIZED,   // Ошибка аутентификации
  CUSTOM_CLOSE_CODES.FORBIDDEN,      // Нет прав доступа
] as const;

// ============================================================================
// Таймауты и интервалы
// ============================================================================

/**
 * Таймауты для различных операций (в миллисекундах)
 */
export const TIMEOUTS = {
  /** Задержка после HTTP Upgrade для стабилизации прокси */
  PROXY_STABILIZATION: 50,
  
  /** Интервал отправки ping frames сервером */
  SERVER_PING_INTERVAL: 30_000, // 30 секунд
  
  /** Таймаут ожидания pong от клиента */
  SERVER_PONG_TIMEOUT: 60_000, // 60 секунд
  
  /** Интервал проверки активности соединения клиентом */
  CLIENT_HEARTBEAT_CHECK: 10_000, // 10 секунд
  
  /** Таймаут для определения "мёртвого" соединения клиентом */
  CLIENT_DEAD_CONNECTION: 90_000, // 90 секунд
  
  /** Интервал логирования метрик */
  METRICS_LOG_INTERVAL: 60_000, // 60 секунд
  
  /** Таймаут graceful shutdown */
  GRACEFUL_SHUTDOWN_TIMEOUT: 5_000, // 5 секунд
} as const;

/**
 * Параметры стратегии переподключения
 */
export const RECONNECTION = {
  /** Начальная задержка перед первой попыткой переподключения */
  INITIAL_DELAY: 1_000, // 1 секунда
  
  /** Множитель для экспоненциальной задержки */
  BACKOFF_MULTIPLIER: 2,
  
  /** Максимальная задержка между попытками */
  MAX_DELAY: 30_000, // 30 секунд
  
  /** Максимальное количество попыток (0 = бесконечно) */
  MAX_ATTEMPTS: 0,
} as const;

// ============================================================================
// Лимиты
// ============================================================================

/**
 * Лимиты для различных операций
 */
export const LIMITS = {
  /** Максимальный размер очереди сообщений */
  MESSAGE_QUEUE_SIZE: 100,
  
  /** Максимальный размер сообщения (в байтах) */
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1 MB
  
  /** Максимальное количество подписок на одного клиента */
  MAX_SUBSCRIPTIONS_PER_CLIENT: 100,
  
  /** Максимальное количество одновременных соединений */
  MAX_CONCURRENT_CONNECTIONS: 10_000,
} as const;

// ============================================================================
// Имена каналов PostgreSQL LISTEN
// ============================================================================

/**
 * Префиксы для каналов PostgreSQL LISTEN
 */
export const CHANNEL_PREFIXES = {
  /** Канал для сообщений конкретной сессии */
  SESSION: 'session_',
  
  /** Канал для всех сообщений */
  ALL_MESSAGES: 'all_messages',
  
  /** Канал для изменений статуса */
  STATUS_CHANGES: 'status_changes',
} as const;

// ============================================================================
// Коды ошибок
// ============================================================================

/**
 * Коды ошибок приложения
 */
export const ERROR_CODES = {
  /** Ошибка аутентификации */
  AUTH_FAILED: 'AUTH_FAILED',
  
  /** Невалидный токен */
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  /** Токен истёк */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  /** Нет прав доступа к каналу */
  ACCESS_DENIED: 'ACCESS_DENIED',
  
  /** Невалидное сообщение */
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  
  /** Превышен лимит подписок */
  SUBSCRIPTION_LIMIT_EXCEEDED: 'SUBSCRIPTION_LIMIT_EXCEEDED',
  
  /** Подписка отклонена */
  SUBSCRIPTION_REJECTED: 'SUBSCRIPTION_REJECTED',
  
  /** Канал не найден */
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  
  /** Внутренняя ошибка сервера */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  /** Соединение закрыто */
  CONNECTION_CLOSED: 'CONNECTION_CLOSED',
  
  /** Таймаут операции */
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
} as const;

// ============================================================================
// Типы для TypeScript
// ============================================================================

export type CloseCode = typeof ALL_CLOSE_CODES[keyof typeof ALL_CLOSE_CODES];
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type ChannelPrefix = typeof CHANNEL_PREFIXES[keyof typeof CHANNEL_PREFIXES];
