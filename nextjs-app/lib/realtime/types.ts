/**
 * Types - Re-export типов из новой модульной реализации
 * 
 * ВАЖНО: Типы перенесены в модульную архитектуру.
 * Этот файл сохранён для обратной совместимости с существующим кодом.
 * 
 * Новая реализация: nextjs-app/lib/websocket/types.ts
 * 
 * ПРИМЕЧАНИЕ: Некоторые типы из старой реализации больше не экспортируются,
 * так как они являются внутренними деталями новой модульной архитектуры.
 */

// Re-export основных типов из новой реализации
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
} from '../websocket/types';
