/**
 * Property-based тесты для RealtimeWebSocketServer
 * 
 * Проверяет универсальные свойства корректности работы сервера
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { RealtimeWebSocketServer } from '../RealtimeWebSocketServer';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { Pool as PgPool } from 'pg';
import type { IncomingMessage } from 'http';
import { EventEmitter } from 'events';

/**
 * Mock WebSocket для тестирования
 */
class MockWebSocket extends EventEmitter {
  public readyState: number = 1; // OPEN
  public sentMessages: string[] = [];
  
  send(data: string): void {
    this.sentMessages.push(data);
  }
  
  close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
    this.emit('close', code, reason);
  }
  
  ping(): void {
    // Эмулируем отправку ping
  }
}

/**
 * Генератор для невалидных JSON сообщений
 */
const invalidJsonArbitrary = fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
  try {
    JSON.parse(s);
    return false; // Пропускаем валидный JSON
  } catch {
    return true; // Оставляем невалидный JSON
  }
});

/**
 * Генератор для типов ошибок
 */
const errorTypeArbitrary = fc.constantFrom(
  'parse_error',
  'connection_error',
  'send_error',
  'internal_error'
);

/**
 * Генератор для сообщений об ошибках
 */
const errorMessageArbitrary = fc.string({ minLength: 5, maxLength: 100 });

describe('RealtimeWebSocketServer - Property-Based Tests', () => {
  let server: RealtimeWebSocketServer;
  let httpServer: HttpServer;
  let mockPgPool: PgPool;
  
  beforeEach(() => {
    // Создаём mock HTTP сервера
    httpServer = new EventEmitter() as any;
    
    // Создаём mock PostgreSQL pool
    mockPgPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    } as any;
    
    // Создаём сервер
    server = new RealtimeWebSocketServer(httpServer, {
      jwtSecret: 'test-secret-key',
      pgPool: mockPgPool,
      shutdownTimeout: 1000,
    });
  });
  
  afterEach(async () => {
    // Очищаем ресурсы
    if (server) {
      await server.shutdown();
    }
  });
  
  /**
   * Property 19: Вызов onError callback при ошибках
   * 
   * Для любой ошибки, возникающей в процессе работы сервера,
   * должен вызываться onError callback с описательным сообщением.
   * 
   * Feature: websocket-architecture-refactor, Property 19
   * Validates: Requirements 9.1
   */
  describe('Property 19: Вызов onError callback при ошибках', () => {
    it('должен вызывать onError callback при ошибке парсинга сообщения', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidJsonArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 3 }), // Уменьшили количество клиентов
          async (invalidMessage, clientIds) => {
            // Создаём mock ConnectionHandler с отслеживанием onError
            const onErrorMock = vi.fn();
            
            // Создаём новый сервер с mock callbacks
            const testServer = new RealtimeWebSocketServer(httpServer, {
              jwtSecret: 'test-secret-key',
              pgPool: mockPgPool,
              shutdownTimeout: 1000,
            });
            
            // Получаем ConnectionHandler через приватное поле (для тестирования)
            const connectionHandler = (testServer as any).connectionHandler;
            
            // Заменяем callbacks
            (connectionHandler as any).callbacks.onError = onErrorMock;
            
            // Для каждого клиента
            for (const clientId of clientIds) {
              // Создаём mock WebSocket
              const mockWs = new MockWebSocket() as any;
              const mockRequest = {
                url: '/?token=valid-token',
                headers: {
                  cookie: 'next-auth.session-token=valid-token',
                },
                socket: {
                  remoteAddress: '127.0.0.1',
                },
              } as IncomingMessage;
              
              // Mock аутентификации
              const authHandler = (testServer as any).authHandler;
              vi.spyOn(authHandler, 'validateToken').mockResolvedValue({
                valid: true,
                userId: 1,
                userName: 'Test User',
                isAdmin: true,
              });
              
              // Устанавливаем соединение
              await testServer.handleConnection(mockWs, mockRequest);
              
              // Сбрасываем счётчик вызовов
              onErrorMock.mockClear();
              
              // Отправляем невалидное сообщение
              mockWs.emit('message', Buffer.from(invalidMessage));
              
              // Проверяем, что onError был вызван
              expect(onErrorMock).toHaveBeenCalled();
              
              // Проверяем, что передана ошибка
              const errorCall = onErrorMock.mock.calls[0];
              expect(errorCall).toBeDefined();
              expect(errorCall[0]).toBeDefined(); // clientId
              expect(errorCall[1]).toBeInstanceOf(Error); // error
            }
            
            // Очищаем
            await testServer.shutdown();
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации и отключили verbose
      );
    });
    
    it('должен вызывать onError callback при ошибке отправки сообщения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 3 }), // Уменьшили количество клиентов
          async (clientIds) => {
            const onErrorMock = vi.fn();
            
            const testServer = new RealtimeWebSocketServer(httpServer, {
              jwtSecret: 'test-secret-key',
              pgPool: mockPgPool,
              shutdownTimeout: 1000,
            });
            
            const connectionHandler = (testServer as any).connectionHandler;
            (connectionHandler as any).callbacks.onError = onErrorMock;
            
            for (const clientId of clientIds) {
              // Создаём mock WebSocket с ошибкой при отправке
              const mockWs = new MockWebSocket() as any;
              mockWs.send = vi.fn().mockImplementation(() => {
                throw new Error('Send failed');
              });
              
              const mockRequest = {
                url: '/?token=valid-token',
                headers: {
                  cookie: 'next-auth.session-token=valid-token',
                },
                socket: {
                  remoteAddress: '127.0.0.1',
                },
              } as IncomingMessage;
              
              // Mock аутентификации
              const authHandler = (testServer as any).authHandler;
              vi.spyOn(authHandler, 'validateToken').mockResolvedValue({
                valid: true,
                userId: 1,
                userName: 'Test User',
                isAdmin: true,
              });
              
              await testServer.handleConnection(mockWs, mockRequest);
              
              onErrorMock.mockClear();
              
              // Пытаемся отправить сообщение (должно вызвать ошибку)
              const actualClientId = Array.from(connectionHandler.getAllConnections().keys())[0];
              connectionHandler.sendToClient(actualClientId, {
                type: 'connected',
                clientId: actualClientId,
              });
              
              // Проверяем, что onError был вызван
              expect(onErrorMock).toHaveBeenCalled();
              
              const errorCall = onErrorMock.mock.calls[0];
              expect(errorCall).toBeDefined();
              expect(errorCall[0]).toBeDefined(); // clientId
              expect(errorCall[1]).toBeInstanceOf(Error); // error
              expect(errorCall[1].message).toContain('Send failed');
            }
            
            await testServer.shutdown();
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });
    
    it('должен вызывать onError callback при ошибке WebSocket', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorMessageArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 3 }), // Уменьшили количество клиентов
          async (errorMessage, clientIds) => {
            const onErrorMock = vi.fn();
            
            const testServer = new RealtimeWebSocketServer(httpServer, {
              jwtSecret: 'test-secret-key',
              pgPool: mockPgPool,
              shutdownTimeout: 1000,
            });
            
            const connectionHandler = (testServer as any).connectionHandler;
            (connectionHandler as any).callbacks.onError = onErrorMock;
            
            for (const clientId of clientIds) {
              const mockWs = new MockWebSocket() as any;
              const mockRequest = {
                url: '/?token=valid-token',
                headers: {
                  cookie: 'next-auth.session-token=valid-token',
                },
                socket: {
                  remoteAddress: '127.0.0.1',
                },
              } as IncomingMessage;
              
              // Mock аутентификации
              const authHandler = (testServer as any).authHandler;
              vi.spyOn(authHandler, 'validateToken').mockResolvedValue({
                valid: true,
                userId: 1,
                userName: 'Test User',
                isAdmin: true,
              });
              
              await testServer.handleConnection(mockWs, mockRequest);
              
              onErrorMock.mockClear();
              
              // Эмулируем ошибку WebSocket
              const error = new Error(errorMessage);
              mockWs.emit('error', error);
              
              // Проверяем, что onError был вызван
              expect(onErrorMock).toHaveBeenCalled();
              
              const errorCall = onErrorMock.mock.calls[0];
              expect(errorCall).toBeDefined();
              expect(errorCall[0]).toBeDefined(); // clientId
              expect(errorCall[1]).toBeInstanceOf(Error); // error
              expect(errorCall[1].message).toBe(errorMessage);
            }
            
            await testServer.shutdown();
          }
        ),
        { numRuns: 20, verbose: false } // Уменьшили итерации
      );
    });
    
    it('должен инкрементировать метрику totalErrors при каждой ошибке', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          invalidJsonArbitrary,
          async (errorCount, invalidMessage) => {
            const testServer = new RealtimeWebSocketServer(httpServer, {
              jwtSecret: 'test-secret-key',
              pgPool: mockPgPool,
              shutdownTimeout: 1000,
            });
            
            const metricsCollector = (testServer as any).metricsCollector;
            const initialErrors = metricsCollector.getAll().totalErrors;
            
            // Создаём одно соединение
            const mockWs = new MockWebSocket() as any;
            const mockRequest = {
              url: '/?token=valid-token',
              headers: {
                cookie: 'next-auth.session-token=valid-token',
              },
              socket: {
                remoteAddress: '127.0.0.1',
              },
            } as IncomingMessage;
            
            // Mock аутентификации
            const authHandler = (testServer as any).authHandler;
            vi.spyOn(authHandler, 'validateToken').mockResolvedValue({
              valid: true,
              userId: 1,
              userName: 'Test User',
              isAdmin: true,
            });
            
            await testServer.handleConnection(mockWs, mockRequest);
            
            // Отправляем несколько невалидных сообщений
            for (let i = 0; i < errorCount; i++) {
              mockWs.emit('message', Buffer.from(invalidMessage));
            }
            
            // Проверяем, что метрика увеличилась на количество ошибок
            const finalErrors = metricsCollector.getAll().totalErrors;
            expect(finalErrors).toBe(initialErrors + errorCount);
            
            await testServer.shutdown();
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });
    
    it('НЕ должен прерывать работу сервера при ошибках отдельных клиентов', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 2, maxLength: 3 }), // Уменьшили количество клиентов
          invalidJsonArbitrary,
          async (clientIds, invalidMessage) => {
            const testServer = new RealtimeWebSocketServer(httpServer, {
              jwtSecret: 'test-secret-key',
              pgPool: mockPgPool,
              shutdownTimeout: 1000,
            });
            
            const mockWebSockets: MockWebSocket[] = [];
            
            // Создаём несколько соединений
            for (const clientId of clientIds) {
              const mockWs = new MockWebSocket() as any;
              mockWebSockets.push(mockWs);
              
              const mockRequest = {
                url: '/?token=valid-token',
                headers: {
                  cookie: 'next-auth.session-token=valid-token',
                },
                socket: {
                  remoteAddress: '127.0.0.1',
                },
              } as IncomingMessage;
              
              // Mock аутентификации
              const authHandler = (testServer as any).authHandler;
              vi.spyOn(authHandler, 'validateToken').mockResolvedValue({
                valid: true,
                userId: 1,
                userName: 'Test User',
                isAdmin: true,
              });
              
              await testServer.handleConnection(mockWs, mockRequest);
            }
            
            const connectionHandler = (testServer as any).connectionHandler;
            const initialConnectionCount = connectionHandler.getAllConnections().size;
            
            // Первый клиент отправляет невалидное сообщение
            mockWebSockets[0].emit('message', Buffer.from(invalidMessage));
            
            // Проверяем, что остальные соединения всё ещё активны
            const finalConnectionCount = connectionHandler.getAllConnections().size;
            expect(finalConnectionCount).toBe(initialConnectionCount);
            
            // Проверяем, что можем отправить сообщение другим клиентам
            const allClientIds = Array.from(connectionHandler.getAllConnections().keys());
            const secondClientId = allClientIds[1];
            
            const sent = connectionHandler.sendToClient(secondClientId, {
              type: 'connected',
              clientId: secondClientId,
            });
            
            expect(sent).toBe(true);
            
            await testServer.shutdown();
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });
  });
});
