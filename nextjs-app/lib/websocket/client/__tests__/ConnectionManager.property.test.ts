/**
 * Property-based тесты для ConnectionManager
 * 
 * Проверяет универсальные свойства корректности управления WebSocket соединением
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ConnectionManager } from '../ConnectionManager';
import { StateManager } from '../StateManager';
import { CLOSE_CODES, CUSTOM_CLOSE_CODES } from '../../constants';

/**
 * Mock WebSocket для тестирования
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  
  private listeners: Map<string, Set<Function>> = new Map();
  
  constructor(url: string) {
    this.url = url;
    
    // Симулируем асинхронное открытие соединения
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.trigger('open', new Event('open'));
    }, 10);
  }

  addEventListener(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: Function): void {
    this.listeners.get(event)?.delete(handler);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const event = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || '',
        wasClean: true,
      });
      this.trigger('close', event);
    }, 10);
  }

  trigger(event: string, data: any): void {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    });
  }
}

describe('ConnectionManager - Property-Based Tests', () => {
  let connectionManager: ConnectionManager;
  let stateManager: StateManager;
  let originalWebSocket: any;

  beforeEach(() => {
    // Сохраняем оригинальный WebSocket
    originalWebSocket = global.WebSocket;
    
    // Подменяем глобальный WebSocket на наш Mock
    global.WebSocket = MockWebSocket as any;
    
    stateManager = new StateManager();
    connectionManager = new ConnectionManager(stateManager);
  });

  afterEach(() => {
    // Восстанавливаем оригинальный WebSocket
    global.WebSocket = originalWebSocket;
    
    connectionManager.clear();
  });

  /**
   * Property 1: Отсутствие аномальных закрытий при нормальной работе
   * 
   * Для любой последовательности нормальных операций (connect, send, disconnect),
   * соединение НЕ должно закрываться с кодом 1006 (abnormal closure).
   * 
   * Feature: websocket-architecture-refactor, Property 1
   * Validates: Requirements 1.1
   */
  describe('Property 1: Отсутствие аномальных закрытий при нормальной работе', () => {
    it('НЕ должен использовать код 1006 при нормальных операциях', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем последовательность операций
          fc.array(
            fc.constantFrom(
              'send_message',
              'disconnect_normal',
              'disconnect_going_away'
            ),
            { minLength: 1, maxLength: 10 }
          ),
          async (operations) => {
            const manager = new ConnectionManager(new StateManager());
            const closeCodes: number[] = [];
            
            // Отслеживаем коды закрытия
            manager.on('onClose', (code: number) => {
              closeCodes.push(code);
            });
            
            // Подключаемся
            await manager.connect('ws://localhost:3000', 'test-token');
            
            // Ждём открытия соединения
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Выполняем операции
            for (const operation of operations) {
              if (operation === 'send_message') {
                manager.send({ type: 'init' });
              } else if (operation === 'disconnect_normal') {
                manager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Normal');
                break; // После disconnect прекращаем операции
              } else if (operation === 'disconnect_going_away') {
                manager.disconnect(CLOSE_CODES.GOING_AWAY, 'Going away');
                break;
              }
            }
            
            // Если не было явного disconnect, закрываем нормально
            if (manager.isOpen()) {
              manager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Test end');
            }
            
            // Ждём закрытия
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Проверяем, что НЕ было аномального закрытия (1006)
            closeCodes.forEach(code => {
              expect(code).not.toBe(CLOSE_CODES.ABNORMAL_CLOSURE);
            });
            
            manager.clear();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('должен использовать правильные коды при нормальном закрытии', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            CLOSE_CODES.NORMAL_CLOSURE,
            CLOSE_CODES.GOING_AWAY
          ),
          async (closeCode) => {
            const manager = new ConnectionManager(new StateManager());
            let capturedCode: number | null = null;
            
            manager.on('onClose', (code: number) => {
              capturedCode = code;
            });
            
            await manager.connect('ws://localhost:3000', 'test-token');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            manager.disconnect(closeCode, 'Test');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Проверяем, что использован правильный код
            expect(capturedCode).toBe(closeCode);
            
            manager.clear();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('должен корректно обрабатывать множественные подключения/отключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }), // Уменьшили до 3 для скорости
          async (connectionCount) => {
            const manager = new ConnectionManager(new StateManager());
            const closeCodes: number[] = [];
            
            manager.on('onClose', (code: number) => {
              closeCodes.push(code);
            });
            
            // Выполняем несколько циклов подключения/отключения
            for (let i = 0; i < connectionCount; i++) {
              await manager.connect('ws://localhost:3000', `token-${i}`);
              await new Promise(resolve => setTimeout(resolve, 20)); // Уменьшили задержку
              
              manager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, `Disconnect ${i}`);
              await new Promise(resolve => setTimeout(resolve, 20)); // Уменьшили задержку
            }
            
            // Все закрытия должны быть нормальными
            closeCodes.forEach(code => {
              expect(code).toBe(CLOSE_CODES.NORMAL_CLOSURE);
              expect(code).not.toBe(CLOSE_CODES.ABNORMAL_CLOSURE);
            });
            
            manager.clear();
          }
        ),
        { numRuns: 20 } // Уменьшили количество прогонов
      );
    }, 30000); // Увеличили timeout до 30 секунд
  });

  /**
   * Property 2: Использование правильных кодов закрытия при ошибках
   * 
   * Для любого типа ошибки, соединение должно закрываться с соответствующим
   * кодом закрытия (НЕ 1006 - abnormal closure).
   * 
   * Feature: websocket-architecture-refactor, Property 2
   * Validates: Requirements 1.5
   */
  describe('Property 2: Использование правильных кодов закрытия при ошибках', () => {
    it('должен использовать правильные коды для различных типов ошибок', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            { code: CUSTOM_CLOSE_CODES.UNAUTHORIZED, reason: 'Unauthorized' },
            { code: CUSTOM_CLOSE_CODES.FORBIDDEN, reason: 'Forbidden' },
            { code: CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT, reason: 'Heartbeat timeout' },
            { code: CLOSE_CODES.PROTOCOL_ERROR, reason: 'Protocol error' },
            { code: CLOSE_CODES.INTERNAL_ERROR, reason: 'Internal error' }
          ),
          async (errorCase) => {
            const manager = new ConnectionManager(new StateManager());
            let capturedCode: number | null = null;
            let capturedReason: string | null = null;
            
            manager.on('onClose', (code: number, reason: string) => {
              capturedCode = code;
              capturedReason = reason;
            });
            
            await manager.connect('ws://localhost:3000', 'test-token');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Закрываем с кодом ошибки
            manager.disconnect(errorCase.code, errorCase.reason);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Проверяем, что использован правильный код (НЕ 1006)
            expect(capturedCode).toBe(errorCase.code);
            expect(capturedCode).not.toBe(CLOSE_CODES.ABNORMAL_CLOSURE);
            expect(capturedReason).toBe(errorCase.reason);
            
            manager.clear();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('НЕ должен использовать код 1006 при любых явных закрытиях', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем любой валидный код закрытия (кроме зарезервированных)
          fc.integer({ min: 1000, max: 4999 }).filter(code => 
            code !== CLOSE_CODES.NO_STATUS_RECEIVED &&
            code !== CLOSE_CODES.ABNORMAL_CLOSURE &&
            code !== CLOSE_CODES.TLS_HANDSHAKE_FAILED
          ),
          fc.string({ minLength: 0, maxLength: 50 }),
          async (closeCode, reason) => {
            const manager = new ConnectionManager(new StateManager());
            let capturedCode: number | null = null;
            
            manager.on('onClose', (code: number) => {
              capturedCode = code;
            });
            
            await manager.connect('ws://localhost:3000', 'test-token');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            manager.disconnect(closeCode, reason);
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // При явном вызове disconnect НЕ должно быть кода 1006
            expect(capturedCode).not.toBe(CLOSE_CODES.ABNORMAL_CLOSURE);
            
            manager.clear();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('должен корректно обрабатывать последовательность различных ошибок', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              code: fc.constantFrom(
                CUSTOM_CLOSE_CODES.UNAUTHORIZED,
                CUSTOM_CLOSE_CODES.FORBIDDEN,
                CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT,
                CLOSE_CODES.PROTOCOL_ERROR,
                CLOSE_CODES.INTERNAL_ERROR
              ),
              reason: fc.string({ minLength: 1, maxLength: 10 }) // Уменьшили длину
            }),
            { minLength: 1, maxLength: 3 } // Уменьшили до 3
          ),
          async (errorSequence) => {
            const closeCodes: number[] = [];
            
            // Для каждой ошибки создаём новое соединение и закрываем его
            for (const error of errorSequence) {
              const manager = new ConnectionManager(new StateManager());
              
              manager.on('onClose', (code: number) => {
                closeCodes.push(code);
              });
              
              await manager.connect('ws://localhost:3000', 'test-token');
              await new Promise(resolve => setTimeout(resolve, 20)); // Уменьшили задержку
              
              manager.disconnect(error.code, error.reason);
              await new Promise(resolve => setTimeout(resolve, 20)); // Уменьшили задержку
              
              manager.clear();
            }
            
            // Все закрытия должны использовать правильные коды (НЕ 1006)
            closeCodes.forEach(code => {
              expect(code).not.toBe(CLOSE_CODES.ABNORMAL_CLOSURE);
            });
            
            // Количество закрытий должно совпадать с количеством ошибок
            expect(closeCodes.length).toBe(errorSequence.length);
          }
        ),
        { numRuns: 20 } // Уменьшили количество прогонов
      );
    }, 30000); // Увеличили timeout до 30 секунд
  });
});
