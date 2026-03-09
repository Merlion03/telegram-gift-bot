/**
 * PostgresRealtimeClient - Re-export новой модульной реализации
 * 
 * ВАЖНО: Старая монолитная реализация перенесена в модульную архитектуру.
 * Этот файл сохранён для обратной совместимости с существующим кодом.
 * 
 * Новая реализация: nextjs-app/lib/websocket/client/PostgresRealtimeClient.ts
 * Резервная копия старого кода: nextjs-app/lib/realtime/PostgresRealtimeClient.ts.backup
 */

// Re-export класса из новой реализации
export { PostgresRealtimeClient } from '../websocket/client/PostgresRealtimeClient';

// Re-export типов из общего файла types
export type {
  MessageCallback,
  ErrorCallback,
  SubscriptionType,
  ConnectionState,
} from '../websocket/types';
