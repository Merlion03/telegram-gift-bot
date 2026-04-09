/**
 * Общие типы для WebSocket архитектуры
 * Определяет интерфейсы сообщений клиента и сервера, а также базовые типы
 */

// ============================================================================
// Типы состояний соединения
// ============================================================================

/**
 * Состояния жизненного цикла WebSocket соединения
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ============================================================================
// Типы сообщений клиента
// ============================================================================

/**
 * Инициализация соединения (первое сообщение от клиента)
 */
export interface InitMessage {
  type: 'init';
}

/**
 * Подписка на канал уведомлений
 */
export interface SubscribeMessage {
  type: 'subscribe';
  channel: 'session' | 'all' | 'status';
  sessionId?: number;
  subscriptionId: string;
}

/**
 * Отписка от канала
 */
export interface UnsubscribeMessage {
  type: 'unsubscribe';
  subscriptionId: string;
}

/**
 * Все возможные типы сообщений от клиента
 */
export type ClientMessage = InitMessage | SubscribeMessage | UnsubscribeMessage;

// ============================================================================
// Типы сообщений сервера
// ============================================================================

/**
 * Подтверждение успешного подключения
 */
export interface ConnectedMessage {
  type: 'connected';
  clientId: string;
}

/**
 * Подтверждение подписки на канал
 */
export interface SubscriptionConfirmedMessage {
  type: 'subscription_confirmed';
  subscriptionId: string;
  channel: string;
}

/**
 * Новое сообщение в сессии поддержки
 */
export interface NewMessageMessage {
  type: 'new_message';
  data: {
    id: number;
    session_id: number;
    sender_type: 'user' | 'admin' | 'bot';
    message_text: string;
    created_at: string;
    is_read: boolean;
    media_type?: string;
    file_path?: string;
    caption?: string;
    file_size?: number;
  };
}

/**
 * Изменение статуса сессии
 */
export interface StatusChangeMessage {
  type: 'status_change';
  sessionId: number;
  oldStatus: string;
  newStatus: string;
}

/**
 * Изменение типа сессии
 */
export interface TypeChangeMessage {
  type: 'type_change';
  sessionId: number;
  oldType: string;
  newType: string;
}

/**
 * Сообщение об ошибке
 */
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  subscriptionId?: string;
}

/**
 * Уведомление о закрытии сервера (graceful shutdown)
 */
export interface ClosingMessage {
  type: 'closing';
  reason: string;
}

/**
 * Все возможные типы сообщений от сервера
 */
export type ServerMessage =
  | ConnectedMessage
  | SubscriptionConfirmedMessage
  | NewMessageMessage
  | StatusChangeMessage
  | TypeChangeMessage
  | ErrorMessage
  | ClosingMessage;

// ============================================================================
// Интерфейсы подписок
// ============================================================================

/**
 * Тип канала подписки
 */
export type SubscriptionType = 'session' | 'all' | 'status';

/**
 * Подписка клиента на канал
 */
export interface Subscription {
  id: string;
  channel: SubscriptionType;
  sessionId?: number;
  onMessage: (message: ServerMessage) => void;
  onError?: (error: Error) => void;
}

/**
 * Подписка в реестре сервера
 */
export interface ChannelSubscription {
  clientId: string;
  subscriptionId: string;
  channel: string;
  sessionId?: number;
}

// ============================================================================
// Интерфейсы соединений
// ============================================================================

/**
 * Информация о клиентском соединении на сервере
 */
export interface ClientConnection {
  id: string;
  ws: any; // WebSocket instance (any для совместимости с ws и браузерным WebSocket)
  userId: number;
  authenticatedAt: Date;
  lastPongAt: Date;
}

/**
 * Состояние клиента
 */
export interface ClientState {
  ws: WebSocket | null;
  connectionState: ConnectionState;
  clientId: string | null;
  subscriptions: Map<string, Subscription>;
  messageQueue: any[];
  lastMessageAt: Date | null;
  heartbeatInterval: NodeJS.Timeout | null;
  reconnectAttempts: number;
  reconnectTimeout: NodeJS.Timeout | null;
}

// ============================================================================
// Интерфейсы метрик
// ============================================================================

/**
 * Метрики работы WebSocket сервера
 */
export interface Metrics {
  totalConnections: number;
  activeConnections: number;
  totalNotifications: number;
  totalErrors: number;
  totalPongsReceived: number;
  lastNotificationAt: Date | null;
}

// ============================================================================
// Callback типы
// ============================================================================

/**
 * Callback для обработки ошибок
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Callback для обработки изменения состояния
 */
export type StateChangeCallback = (state: ConnectionState) => void;

/**
 * Callback для обработки сообщений
 */
export type MessageCallback = (message: ServerMessage) => void;

/**
 * Callback для обработки "мёртвого" соединения
 */
export type DeadConnectionCallback = () => void;
