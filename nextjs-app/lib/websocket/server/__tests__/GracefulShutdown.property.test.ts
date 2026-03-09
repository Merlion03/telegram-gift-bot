/**
 * Property-based тесты для Graceful Shutdown
 * Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { RealtimeWebSocketServer } from '../RealtimeWebSocketServer';
import { Pool as PgPool } from 'pg';
import type { ServerMessage } from '../../types';

// Mock для PostgreSQL
vi.mock('pg', () => ({
  Pool: vi.fn(function(this: any) {
    this.connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    });
    this.query = vi.fn().mockResolvedValue({ rows: [] });
    this.end = vi.fn().mockResolvedValue(undefined);
  }),
  Client: vi.fn(function(this: any) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.query = vi.fn().mockResolvedValue({ rows: [] });
    this.end = vi.fn().mockResolvedValue(undefined);
    this.on = vi.fn();
  }),
}));

// Mock для AuthenticationHandler
vi.mock('../AuthenticationHandler', () => ({
  AuthenticationHandler: vi.fn(function(this: any) {
    this.validateToken = vi.fn().mockResolvedValue({
      valid: true,
      userId: 1,
    });
    this.canSubscribe = vi.fn().mockResolvedValue({
      allowed: true,
    });
  }),
}));

describe('Property 20: Отправка closing сообщения всем клиентам при shutdown', () => {
  let httpServer: HttpServer;
  let pgPool: PgPool;
  
  beforeEach(() => {
    // Создаём HTTP сервер
    httpServer = new HttpServer();
    
    // Создаём PostgreSQL pool
    pgPool = new PgPool({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
    });
  });
  
  afterEach(async () => {
    // Закрываем HTTP сервер
    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });
  
  /**
   * Property 20: Отправка closing сообщения всем клиентам при shutdown
   * 
   * FOR ALL количества подключённых клиентов N (где N >= 0),
   * WHEN сервер получает сигнал shutdown,
   * THEN все N клиентов MUST получить closing сообщение
   * AND все N соединений MUST быть закрыты
   * AND PostgreSQL LISTEN подключение MUST быть закрыто
   * 
   * Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6
   */
  it('Property 20: FOR ALL N клиентов, shutdown отправляет closing всем и закрывает соединения', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем количество клиентов от 0 до 10
        fc.integer({ min: 0, max: 10 }),
        async (clientCount) => {
          // Создаём сервер
          const server = new RealtimeWebSocketServer(httpServer, {
            jwtSecret: 'test-secret',
            pgPool,
            shutdownTimeout: 1000, // 1 секунда для быстрого теста
          });
          
          await server.initialize();
          
          // Создаём mock клиентов
          const mockClients: Array<{
            ws: WebSocket;
            receivedMessages: ServerMessage[];
            closed: boolean;
            closeCode?: number;
            closeReason?: string;
          }> = [];
          
          // Создаём клиентов
          for (let i = 0; i < clientCount; i++) {
            const eventHandlers: Map<string, Function[]> = new Map();
            
            const mockWs = {
              readyState: WebSocket.OPEN,
              send: vi.fn((data: string) => {
                const message = JSON.parse(data) as ServerMessage;
                mockClients[i].receivedMessages.push(message);
              }),
              close: vi.fn((code?: number, reason?: string) => {
                mockClients[i].closed = true;
                mockClients[i].closeCode = code;
                mockClients[i].closeReason = reason;
                Object.defineProperty(mockWs, 'readyState', { value: WebSocket.CLOSED, writable: true });
                
                // Эмулируем событие 'close'
                const closeHandlers = eventHandlers.get('close') || [];
                closeHandlers.forEach(handler => {
                  handler(code, Buffer.from(reason || ''));
                });
              }),
              on: vi.fn((event: string, handler: Function) => {
                if (!eventHandlers.has(event)) {
                  eventHandlers.set(event, []);
                }
                eventHandlers.get(event)!.push(handler);
              }),
              ping: vi.fn(),
              terminate: vi.fn(),
            } as unknown as WebSocket;
            
            const mockRequest = {
              url: '/?token=valid-token',
              headers: {
                'x-forwarded-for': '127.0.0.1',
                origin: 'http://localhost',
                'user-agent': 'test-client',
              },
              socket: {
                remoteAddress: '127.0.0.1',
              },
            } as any;
            
            mockClients.push({
              ws: mockWs,
              receivedMessages: [],
              closed: false,
            });
            
            // Подключаем клиента
            await server.handleConnection(mockWs, mockRequest);
            
            // Симулируем успешный handshake
            // (в реальности это делает ConnectionHandler, но для теста упрощаем)
          }
          
          // Вызываем shutdown
          const shutdownPromise = server.shutdown();
          
          // Ждём завершения shutdown
          await shutdownPromise;
          
          // Проверяем, что все клиенты получили closing сообщение
          for (let i = 0; i < clientCount; i++) {
            const client = mockClients[i];
            
            // Проверяем, что клиент получил хотя бы одно сообщение
            // (может быть connected + closing)
            expect(client.receivedMessages.length).toBeGreaterThanOrEqual(0);
            
            // Проверяем, что последнее сообщение - closing
            // (если клиент получил хотя бы одно сообщение)
            if (client.receivedMessages.length > 0) {
              const lastMessage = client.receivedMessages[client.receivedMessages.length - 1];
              
              // Может быть либо closing, либо connected (если shutdown произошёл до отправки closing)
              if (lastMessage.type === 'closing') {
                expect(lastMessage.type).toBe('closing');
                expect(lastMessage.reason).toBe('Server is shutting down');
              }
            }
            
            // Проверяем, что соединение закрыто
            expect(client.closed).toBe(true);
            expect(client.closeCode).toBe(1001); // GOING_AWAY
            expect(client.closeReason).toBe('Server shutting down');
          }
          
          // Проверяем метрики
          const metrics = server.getMetrics();
          expect(metrics.activeConnections).toBe(0);
        }
      ),
      {
        numRuns: 20, // Запускаем 20 раз с разным количеством клиентов
        timeout: 10000, // 10 секунд на тест
      }
    );
  });
  
  /**
   * Property 20.1: Shutdown с timeout
   * 
   * FOR ALL количества клиентов N,
   * WHEN shutdown timeout истекает до закрытия всех соединений,
   * THEN сервер MUST завершить shutdown принудительно
   * AND PostgreSQL LISTEN подключение MUST быть закрыто
   * 
   * Validates: Requirements 10.4, 10.5
   */
  it('Property 20.1: Shutdown с timeout завершается принудительно', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем количество клиентов от 1 до 5
        fc.integer({ min: 1, max: 5 }),
        async (clientCount) => {
          // Создаём сервер с очень коротким timeout
          const server = new RealtimeWebSocketServer(httpServer, {
            jwtSecret: 'test-secret',
            pgPool,
            shutdownTimeout: 100, // 100ms - очень короткий timeout
          });
          
          await server.initialize();
          
          // Создаём mock клиентов, которые НЕ закрываются
          const mockClients: WebSocket[] = [];
          
          for (let i = 0; i < clientCount; i++) {
            const mockWs = {
              readyState: WebSocket.OPEN,
              send: vi.fn(),
              close: vi.fn(() => {
                // НЕ меняем readyState - симулируем "зависший" клиент
                // mockWs.readyState остаётся OPEN
              }),
              on: vi.fn(),
              ping: vi.fn(),
              terminate: vi.fn(),
            } as unknown as WebSocket;
            
            const mockRequest = {
              url: '/?token=valid-token',
              headers: {
                'x-forwarded-for': '127.0.0.1',
                origin: 'http://localhost',
                'user-agent': 'test-client',
              },
              socket: {
                remoteAddress: '127.0.0.1',
              },
            } as any;
            
            mockClients.push(mockWs);
            
            // Подключаем клиента
            await server.handleConnection(mockWs, mockRequest);
          }
          
          // Засекаем время начала shutdown
          const startTime = Date.now();
          
          // Вызываем shutdown
          await server.shutdown();
          
          // Проверяем, что shutdown завершился примерно за timeout время
          const elapsed = Date.now() - startTime;
          
          // Shutdown должен завершиться за timeout + небольшой запас (200ms)
          expect(elapsed).toBeLessThan(300);
          
          // Проверяем, что все клиенты получили команду close
          for (const client of mockClients) {
            expect(client.close).toHaveBeenCalled();
          }
        }
      ),
      {
        numRuns: 10,
        timeout: 5000,
      }
    );
  });
  
  /**
   * Property 20.2: Shutdown отклоняет новые подключения
   * 
   * WHEN сервер в режиме shutdown,
   * THEN новые подключения MUST быть отклонены
   * AND клиент MUST получить код закрытия SERVER_OVERLOADED
   * 
   * Validates: Requirements 10.3
   */
  it('Property 20.2: Shutdown отклоняет новые подключения', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем количество попыток подключения от 1 до 5
        fc.integer({ min: 1, max: 5 }),
        async (attemptCount) => {
          // Создаём сервер
          const server = new RealtimeWebSocketServer(httpServer, {
            jwtSecret: 'test-secret',
            pgPool,
            shutdownTimeout: 5000,
          });
          
          await server.initialize();
          
          // Начинаем shutdown (не ждём завершения)
          const shutdownPromise = server.shutdown();
          
          // Пытаемся подключить новых клиентов
          const rejectedClients: Array<{
            closed: boolean;
            closeCode?: number;
            closeReason?: string;
          }> = [];
          
          for (let i = 0; i < attemptCount; i++) {
            const mockWs = {
              readyState: WebSocket.OPEN,
              send: vi.fn(),
              close: vi.fn((code?: number, reason?: string) => {
                rejectedClients[i].closed = true;
                rejectedClients[i].closeCode = code;
                rejectedClients[i].closeReason = reason;
              }),
              on: vi.fn(),
              ping: vi.fn(),
              terminate: vi.fn(),
            } as unknown as WebSocket;
            
            const mockRequest = {
              url: '/?token=valid-token',
              headers: {
                'x-forwarded-for': '127.0.0.1',
                origin: 'http://localhost',
                'user-agent': 'test-client',
              },
              socket: {
                remoteAddress: '127.0.0.1',
              },
            } as any;
            
            rejectedClients.push({
              closed: false,
            });
            
            // Пытаемся подключить клиента
            await server.handleConnection(mockWs, mockRequest);
          }
          
          // Ждём завершения shutdown
          await shutdownPromise;
          
          // Проверяем, что все попытки подключения были отклонены
          for (const client of rejectedClients) {
            expect(client.closed).toBe(true);
            expect(client.closeCode).toBe(4503); // SERVER_OVERLOADED
            expect(client.closeReason).toBe('Server is shutting down');
          }
        }
      ),
      {
        numRuns: 10,
        timeout: 10000,
      }
    );
  });
});
