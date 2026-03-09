/**
 * RealtimeWebSocketServer - Re-export новой модульной реализации
 * 
 * ВАЖНО: Старая монолитная реализация перенесена в модульную архитектуру.
 * Этот файл сохранён для обратной совместимости с существующим кодом.
 * 
 * Новая реализация: nextjs-app/lib/websocket/server/RealtimeWebSocketServer.ts
 * Резервная копия старого кода: nextjs-app/lib/realtime/RealtimeWebSocketServer.ts.backup
 */

// Re-export класса из новой реализации
export { RealtimeWebSocketServer } from '../websocket/server/RealtimeWebSocketServer';
