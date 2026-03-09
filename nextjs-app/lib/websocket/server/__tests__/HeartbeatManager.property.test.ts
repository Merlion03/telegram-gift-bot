/**
 * Property-based тесты для HeartbeatManager
 * 
 * Проверяет универсальные свойства корректности heartbeat механизма
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { HeartbeatManager } from '../HeartbeatManager';
import { ConnectionHandler } from '../ConnectionHandler';
import { AuthenticationHandler } from '../AuthenticationHandler';
import { TIMEOUTS, CUSTOM_CLOSE_CODES } from '../../constants';
import type { ClientConnection } from '../../types';

/**
 * Генератор для clientId с уникальностью
 */
const clientIdArbitrary = fc.integer({ min: 1, max: 1000000 }).map(n => `client_${n}`);

/**
 * Генератор для userId
 */
const userIdArbitrary = fc.integer({ min: 1, max: 100000 });

/**
 * Генератор для временных меток (последние 24 часа)
 */
const recentTimestampArbitrary = fc.date({
  min: new Date(Date.now() - 24 * 60 * 60 * 1000),
  max: new Date(),
});

/**
 * Mock WebSocket для тестирования
 */
class MockWebSocket {
  readyState: number = 1; // OPEN
  pingCalled: boolean = false;
  closeCalled: boolean = false;
  closeCode?: number;
  closeReason?: string;
  
  ping(): void {
    this.pingCalled = true;
  }
  
  close(code?: number, reason?: string): void {
    this.closeCalled = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3; // CLOSED
  }
  
  reset(): void {
    this.pingCalled = false;
    this.closeCalled = false;
    this.closeCode = undefined;
    this.closeReason = undefined;
    this.readyState = 1;
  }
}

describe('HeartbeatManager - Property-Based Tests', () => {
  let heartbeatManager: HeartbeatManager;
  let connectionHandler: ConnectionHandler;
  let authHandler: AuthenticationHandler;

  beforeEach(() => {
    // Очищаем все моки перед каждым тестом
    vi.clearAllMocks();
    vi.restoreAllMocks();
    
    authHandler = new AuthenticationHandler('test-secret-key');
    connectionHandler = new ConnectionHandler(authHandler);
    heartbeatManager = new HeartbeatManager(connectionHandler);
  });

  afterEach(() => {
    // Останавливаем heartbeat после каждого теста
    if (heartbeatManager.isRunning()) {
      heartbeatManager.stop();
    }
    
    // Очищаем все моки после каждого теста
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  /**
   * Property 22: Heartbeat round-trip
   * 
   * Для любого активного соединения с запущенным heartbeat,
   * последовательность ping (от сервера) → pong (от клиента)
   * должна поддерживать соединение активным (не закрывать по таймауту).
   * 
   * Feature: websocket-architecture-refactor, Property 22
   * Validates: Requirements 14.4
   */
  describe('Property 22: Heartbeat round-trip', () => {
    it('должен отправлять ping всем активным соединениям', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (clients) => {
            // Создаём mock соединения
            const mockConnections = new Map<string, ClientConnection>();
            const mockWebSockets = new Map<string, MockWebSocket>();
            
            clients.forEach(({ clientId, userId }) => {
              const mockWs = new MockWebSocket();
              mockWebSockets.set(clientId, mockWs);
              
              mockConnections.set(clientId, {
                id: clientId,
                ws: mockWs as any,
                userId,
                authenticatedAt: new Date(),
                lastPongAt: new Date(),
              });
            });
            
            // Mock метода getAllConnections
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
            
            // Отправляем ping всем
            heartbeatManager.sendPingToAll();
            
            // Проверяем, что ping был отправлен всем соединениям
            mockWebSockets.forEach((mockWs, clientId) => {
              expect(mockWs.pingCalled).toBe(true);
            });
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен вызывать updateLastPong для каждого клиента при получении pong', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (clients) => {
            // Mock метода updateLastPong
            const updateLastPongSpy = vi.spyOn(connectionHandler, 'updateLastPong');
            
            // Обрабатываем pong от каждого клиента
            for (const { clientId } of clients) {
              heartbeatManager.handlePong(clientId);
            }
            
            // Проверяем, что updateLastPong был вызван для каждого клиента
            expect(updateLastPongSpy).toHaveBeenCalledTimes(clients.length);
            
            clients.forEach(({ clientId }) => {
              expect(updateLastPongSpy).toHaveBeenCalledWith(clientId);
            });
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен закрывать соединения, которые отвечают pong вовремя', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
              lastPongDelay: fc.integer({ min: 0, max: 59000 }), // 0-59 секунд (в пределах таймаута)
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (clients) => {
            // Создаём mock соединения с разными lastPongAt
            const mockConnections = new Map<string, ClientConnection>();
            const mockWebSockets = new Map<string, MockWebSocket>();
            
            clients.forEach(({ clientId, userId, lastPongDelay }) => {
              const mockWs = new MockWebSocket();
              mockWebSockets.set(clientId, mockWs);
              
              // lastPongAt в пределах таймаута (60 секунд)
              const lastPongAt = new Date(Date.now() - lastPongDelay);
              
              mockConnections.set(clientId, {
                id: clientId,
                ws: mockWs as any,
                userId,
                authenticatedAt: new Date(),
                lastPongAt,
              });
            });
            
            // Mock методов
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
            const closeConnectionSpy = vi.spyOn(connectionHandler, 'closeConnection');
            
            // Проверяем "мёртвые" соединения
            heartbeatManager.checkDeadConnections();
            
            // Проверяем, что НИ ОДНО соединение НЕ было закрыто
            expect(closeConnectionSpy).not.toHaveBeenCalled();
            
            // Проверяем, что все WebSocket остались открытыми
            mockWebSockets.forEach((mockWs) => {
              expect(mockWs.closeCalled).toBe(false);
            });
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен закрывать соединения, которые НЕ отвечают pong в течение 60 секунд', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
              lastPongDelay: fc.integer({ min: 60001, max: 120000 }), // 60+ секунд (превышение таймаута)
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (clients) => {
            // Очищаем все моки перед каждой итерацией
            vi.clearAllMocks();
            vi.restoreAllMocks();
            
            // Создаём mock соединения с устаревшими lastPongAt
            const mockConnections = new Map<string, ClientConnection>();
            const mockWebSockets = new Map<string, MockWebSocket>();
            
            // Удаляем дубликаты clientId
            const uniqueClients = Array.from(
              new Map(clients.map(c => [c.clientId, c])).values()
            );
            
            uniqueClients.forEach(({ clientId, userId, lastPongDelay }) => {
              const mockWs = new MockWebSocket();
              mockWebSockets.set(clientId, mockWs);
              
              // lastPongAt превышает таймаут (60 секунд)
              const lastPongAt = new Date(Date.now() - lastPongDelay);
              
              mockConnections.set(clientId, {
                id: clientId,
                ws: mockWs as any,
                userId,
                authenticatedAt: new Date(),
                lastPongAt,
              });
            });
            
            // Mock методов
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
            const closeConnectionSpy = vi.spyOn(connectionHandler, 'closeConnection');
            
            // Проверяем "мёртвые" соединения
            heartbeatManager.checkDeadConnections();
            
            // Проверяем, что ВСЕ соединения были закрыты
            expect(closeConnectionSpy).toHaveBeenCalledTimes(uniqueClients.length);
            
            // Проверяем, что каждое соединение закрыто с правильным кодом
            uniqueClients.forEach(({ clientId }) => {
              expect(closeConnectionSpy).toHaveBeenCalledWith(
                clientId,
                CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT,
                'Heartbeat timeout: no pong received'
              );
            });
            
            // Очищаем моки после итерации
            vi.clearAllMocks();
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать смешанные соединения (активные и мёртвые)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
              lastPongDelay: fc.integer({ min: 0, max: 120000 }), // 0-120 секунд
            }),
            { minLength: 2, maxLength: 20 }
          ),
          async (clients) => {
            // Удаляем дубликаты clientId
            const uniqueClients = Array.from(
              new Map(clients.map(c => [c.clientId, c])).values()
            );
            
            // Создаём mock соединения
            const mockConnections = new Map<string, ClientConnection>();
            const mockWebSockets = new Map<string, MockWebSocket>();
            
            // Разделяем на активные и мёртвые
            const activeClients: string[] = [];
            const deadClients: string[] = [];
            
            uniqueClients.forEach(({ clientId, userId, lastPongDelay }) => {
              const mockWs = new MockWebSocket();
              mockWebSockets.set(clientId, mockWs);
              
              const lastPongAt = new Date(Date.now() - lastPongDelay);
              
              mockConnections.set(clientId, {
                id: clientId,
                ws: mockWs as any,
                userId,
                authenticatedAt: new Date(),
                lastPongAt,
              });
              
              // Определяем, мёртвое ли соединение
              if (lastPongDelay > TIMEOUTS.SERVER_PONG_TIMEOUT) {
                deadClients.push(clientId);
              } else {
                activeClients.push(clientId);
              }
            });
            
            // Mock методов
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
            const closeConnectionSpy = vi.spyOn(connectionHandler, 'closeConnection');
            
            // Проверяем "мёртвые" соединения
            heartbeatManager.checkDeadConnections();
            
            // Проверяем, что закрыты ТОЛЬКО мёртвые соединения
            expect(closeConnectionSpy).toHaveBeenCalledTimes(deadClients.length);
            
            deadClients.forEach((clientId) => {
              expect(closeConnectionSpy).toHaveBeenCalledWith(
                clientId,
                CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT,
                'Heartbeat timeout: no pong received'
              );
            });
            
            // Проверяем, что активные соединения НЕ закрыты
            activeClients.forEach((clientId) => {
              expect(closeConnectionSpy).not.toHaveBeenCalledWith(
                clientId,
                expect.any(Number),
                expect.any(String)
              );
            });
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен отправлять ping соединениям, которые не в состоянии OPEN', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
              readyState: fc.constantFrom(0, 2, 3), // CONNECTING, CLOSING, CLOSED (не OPEN)
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (clients) => {
            // Создаём mock соединения с разными readyState
            const mockConnections = new Map<string, ClientConnection>();
            const mockWebSockets = new Map<string, MockWebSocket>();
            
            clients.forEach(({ clientId, userId, readyState }) => {
              const mockWs = new MockWebSocket();
              mockWs.readyState = readyState;
              mockWebSockets.set(clientId, mockWs);
              
              mockConnections.set(clientId, {
                id: clientId,
                ws: mockWs as any,
                userId,
                authenticatedAt: new Date(),
                lastPongAt: new Date(),
              });
            });
            
            // Mock метода getAllConnections
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
            
            // Отправляем ping всем
            heartbeatManager.sendPingToAll();
            
            // Проверяем, что ping НЕ был отправлен ни одному соединению
            mockWebSockets.forEach((mockWs) => {
              expect(mockWs.pingCalled).toBe(false);
            });
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать пустой список соединений', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // Просто для запуска property
          async () => {
            // Mock пустого списка соединений
            const emptyConnections = new Map<string, ClientConnection>();
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(emptyConnections);
            
            // Не должно быть исключений при отправке ping
            expect(() => {
              heartbeatManager.sendPingToAll();
            }).not.toThrow();
            
            // Не должно быть исключений при проверке мёртвых соединений
            expect(() => {
              heartbeatManager.checkDeadConnections();
            }).not.toThrow();
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('должен корректно обрабатывать ошибки при отправке ping', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clientId: clientIdArbitrary,
              userId: userIdArbitrary,
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.integer({ min: 0, max: 19 }),
          async (clients, errorIndex) => {
            const actualErrorIndex = errorIndex % clients.length;
            
            // Создаём mock соединения
            const mockConnections = new Map<string, ClientConnection>();
            
            clients.forEach(({ clientId, userId }, index) => {
              const mockWs = new MockWebSocket();
              
              // Для одного соединения ping выбросит ошибку
              if (index === actualErrorIndex) {
                mockWs.ping = () => {
                  throw new Error('Network error');
                };
              }
              
              mockConnections.set(clientId, {
                id: clientId,
                ws: mockWs as any,
                userId,
                authenticatedAt: new Date(),
                lastPongAt: new Date(),
              });
            });
            
            // Mock метода getAllConnections
            vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
            
            // Не должно быть исключений даже при ошибке отправки ping
            expect(() => {
              heartbeatManager.sendPingToAll();
            }).not.toThrow();
            
            // Очищаем моки
            vi.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
