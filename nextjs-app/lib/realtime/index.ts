/**
 * Realtime module exports
 * Централизованный экспорт для PostgreSQL Realtime WebSocket сервера
 */

export { RealtimeWebSocketServer } from './RealtimeWebSocketServer';
export { authenticateWebSocketClient, extractTokenFromQuery } from './auth';
export type { AuthResult } from './auth';

// Re-export основных типов (только те, что существуют в новой реализации)
export type {
  ClientConnection,
  SubscribeMessage,
  UnsubscribeMessage,
  InitMessage,
  ClientMessage,
  SubscriptionConfirmedMessage,
  ErrorMessage,
  ClosingMessage,
  ConnectedMessage,
  ServerMessage,
} from './types';

// Экспорт типов из PostgresRealtimeClient (только те, что существуют)
export type {
  MessageCallback,
  ErrorCallback,
  SubscriptionType,
  ConnectionState,
} from './PostgresRealtimeClient';
