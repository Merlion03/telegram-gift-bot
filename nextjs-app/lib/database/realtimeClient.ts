/**
 * Realtime Client для WebSocket подключений
 * Использует PostgreSQL LISTEN/NOTIFY для real-time обновлений
 */

import { PostgresRealtimeClient } from '@/lib/websocket/client/PostgresRealtimeClient';
import type { ErrorCallback, MessageCallback } from '@/lib/websocket/types';

/**
 * Получить singleton instance realtime клиента
 * 
 * @returns PostgresRealtimeClient instance
 */
export function getRealtimeClient(): PostgresRealtimeClient {
  return PostgresRealtimeClient.getInstance();
}

// Экспортируем класс для прямого использования
export { PostgresRealtimeClient };

// Экспортируем типы для удобства
export type { ErrorCallback, MessageCallback };
