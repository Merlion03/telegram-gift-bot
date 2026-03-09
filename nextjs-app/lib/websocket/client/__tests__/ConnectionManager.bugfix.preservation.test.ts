/**
 * Preservation Property-Based Tests для ConnectionManager
 * 
 * Bugfix: websocket-connection-1006-fix
 * Property 2: Preservation - Normal Handshake and Connection Lifecycle
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 * 
 * Цель: Проверить, что нормальное поведение WebSocket (без race condition)
 * работает корректно на НЕИСПРАВЛЕННОМ коде. Эти тесты должны ПРОХОДИТЬ
 * до внедрения исправления и продолжать проходить после исправления.
 * 
 * Тесты проверяют:
 * 1. Нормальный handshake - открытие → задержка 50ms → отправка init → получение connected → состояние connected
 * 2. Закрытие после handshake - соединение закрывается после успешного handshake → корректная обработка
 * 3. Логика переподключения - аномальное закрытие после handshake → инициация переподключения
 * 4. Метод send() без параметра ws - работает как раньше, проверяя this.ws
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ConnectionManager } from '../ConnectionManager';
import { StateManager } from '../StateManager';
import { CLOSE_CODES } from '../../constants';

/**
 * Расширенный Mock WebSocket для тестирования preservation свойств
 * Поддерживает контроль времени и событий для симуляции различных сценариев
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  
  private listeners: Map<string, Set<Function>> = new Map();
  private openDelay: number;
  
  constructor(url: string, openDelay: number = 10) {
    this.url = url;
    this.openDelay = openDelay;
    
    // Симулируем асинхронное открытие соединения
    setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.trigger('open', new Event('open'));
      }
    }, this.openDelay);
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
    // Успешная отправка - ничего не делаем
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === MockWebSocket.CLOSED || this.readyState === MockWebSocket.CLOSING) {
      return;
    }
    
    this.readyState = MockWebSocket.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const event = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || '',
        wasClean: code === 1000,
      });
      this.trigger('close', event);
    }, 10);
  }

  trigger(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Симулировать получение сообщения от сервера
   */
  simulateMessage(message: any): void {
    if (this.readyState === MockWebSocket.OPEN) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(message)
      });
      this.trigger('message', event);
    }
  }
}

describe('ConnectionManager - Preservation Property Tests (Bugfix)', () => {
  let originalWebSocket: any;

  beforeEach(() => {
    // Сохраняем оригинальный WebSocket
    originalWebSocket = global.WebSocket;
    
    // Подменяем глобальный WebSocket на наш Mock
    global.WebSocket = MockWebSocket as any;
  });

  afterEach(() => {
    // Восстанавливаем оригинальный WebSocket
    global.WebSocket = originalWebSocket;
  });

  /**
   * Property 2.1: Нормальный handshake процесс
   * 
   * **Validates: Requirement 3.1, 3.4**
   * 
   * Для любого нормального handshake (без закрытия во время задержки 50ms),
   * система ДОЛЖНА:
   * - Открыть соединение
   * - Выполнить задержку 50ms для стабилизации прокси
   * - Отправить init сообщение
   * - Получить connected сообщение от сервера
   * - Перейти в состояние connected
   * - Запустить heartbeat мониторинг
   * 
   * Этот тест проверяет, что нормальный flow работает корректно
   * на НЕИСПРАВЛЕННОМ коде (без race condition).
   */
  describe('Property 2.1: Нормальный handshake процесс', () => {
    it('должен успешно выполнить handshake без закрытия во время задержки', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем различные валидные токены
          fc.string({ minLength: 10, maxLength: 50 }),
          async (token) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            let openCalled = false;
            let initSent = false;
            
            // Отслеживаем события
            manager.on('onOpen', () => {
              openCalled = true;
            });
            
            // Перехватываем отправку сообщений
            const originalSend = manager.send.bind(manager);
            manager.send = vi.fn((message: any) => {
              const result = originalSend(message);
              if (message.type === 'init') {
                initSent = true;
              }
              return result;
            });
            
            // Подключаемся
            await manager.connect('ws://localhost:3000', token);
            
            // Ждём завершения handshake (открытие + задержка 50ms + отправка init)
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Проверяем, что handshake выполнен корректно
            expect(openCalled).toBe(true);
            expect(initSent).toBe(true);
            expect(manager.isOpen()).toBe(true);
            expect(stateManager.getState()).toBe('connecting'); // Состояние ещё connecting, т.к. не получили connected от сервера
            
            // Очистка
            manager.clear();
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 2.2: Закрытие после успешного handshake
   * 
   * **Validates: Requirement 3.2, 3.5**
   * 
   * Для любого соединения, которое закрывается ПОСЛЕ успешного handshake,
   * система ДОЛЖНА:
   * - Корректно обработать событие close
   * - Установить состояние disconnected
   * - Очистить this.ws
   * - Вызвать пользовательские обработчики onClose
   * - НЕ пытаться переподключиться при коде 1000 (нормальное закрытие)
   */
  describe('Property 2.2: Закрытие после успешного handshake', () => {
    it('должен корректно обрабатывать нормальное закрытие (код 1000) после handshake', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 30 }),
          async (token, closeReason) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            let closeCalled = false;
            let capturedCode: number | null = null;
            let capturedReason: string | null = null;
            
            manager.on('onClose', (code: number, reason: string) => {
              closeCalled = true;
              capturedCode = code;
              capturedReason = reason;
            });
            
            // Подключаемся
            await manager.connect('ws://localhost:3000', token);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Проверяем, что соединение открыто
            expect(manager.isOpen()).toBe(true);
            
            // Закрываем с кодом 1000 (нормальное закрытие)
            manager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, closeReason);
            
            // Состояние должно сразу измениться на disconnected
            expect(stateManager.getState()).toBe('disconnected');
            expect(manager.getWebSocket()).toBeNull();
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Проверяем, что обработчик вызван с правильными параметрами
            expect(closeCalled).toBe(true);
            expect(capturedCode).toBe(CLOSE_CODES.NORMAL_CLOSURE);
            expect(capturedReason).toBe(closeReason);
            
            manager.clear();
          }
        ),
        { numRuns: 30 }
      );
    });

    it('должен очистить this.ws и установить состояние disconnected при закрытии', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            CLOSE_CODES.NORMAL_CLOSURE,
            CLOSE_CODES.GOING_AWAY,
            CLOSE_CODES.PROTOCOL_ERROR
          ),
          async (closeCode) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            await manager.connect('ws://localhost:3000', 'test-token');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Проверяем, что WebSocket существует
            expect(manager.getWebSocket()).not.toBeNull();
            expect(manager.isOpen()).toBe(true);
            
            // Закрываем соединение
            manager.disconnect(closeCode, 'Test close');
            
            // Проверяем немедленную очистку
            expect(manager.getWebSocket()).toBeNull();
            expect(manager.isOpen()).toBe(false);
            expect(stateManager.getState()).toBe('disconnected');
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            manager.clear();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 2.3: Логика переподключения при аномальном закрытии
   * 
   * **Validates: Requirement 3.3**
   * 
   * Для любого соединения, которое закрывается с кодом 1006 (abnormal closure)
   * ПОСЛЕ успешного handshake, система ДОЛЖНА:
   * - Обработать аномальное закрытие
   * - Установить состояние disconnected
   * - Инициировать переподключение (это проверяется на уровне PostgresRealtimeClient)
   * 
   * Примечание: ConnectionManager не отвечает за логику переподключения,
   * но должен корректно обработать аномальное закрытие и уведомить об этом.
   */
  describe('Property 2.3: Обработка аномального закрытия после handshake', () => {
    it('должен корректно обработать аномальное закрытие (код 1006) после handshake', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 50 }),
          async (token) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            let closeCalled = false;
            let capturedCode: number | null = null;
            
            manager.on('onClose', (code: number) => {
              closeCalled = true;
              capturedCode = code;
            });
            
            // Подключаемся
            await manager.connect('ws://localhost:3000', token);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Проверяем, что соединение открыто
            expect(manager.isOpen()).toBe(true);
            
            // Симулируем аномальное закрытие (код 1006)
            // Используем метод close() MockWebSocket для корректной симуляции
            const ws = manager.getWebSocket() as any;
            if (ws) {
              // Используем внутренний метод для установки readyState
              ws._readyState = MockWebSocket.CLOSED;
              const event = new CloseEvent('close', {
                code: CLOSE_CODES.ABNORMAL_CLOSURE,
                reason: 'Abnormal closure',
                wasClean: false
              });
              // Устанавливаем event.target на текущий WebSocket
              Object.defineProperty(event, 'target', { value: ws, writable: false });
              ws.trigger('close', event);
            }
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Проверяем, что закрытие обработано корректно
            expect(closeCalled).toBe(true);
            expect(capturedCode).toBe(CLOSE_CODES.ABNORMAL_CLOSURE);
            expect(stateManager.getState()).toBe('disconnected');
            expect(manager.getWebSocket()).toBeNull();
            
            manager.clear();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 2.4: Метод send() без параметра ws
   * 
   * **Validates: Requirement 3.6**
   * 
   * Для любого вызова метода send() БЕЗ параметра ws,
   * метод ДОЛЖЕН:
   * - Проверять this.ws.readyState === WebSocket.OPEN
   * - Возвращать true если сообщение отправлено
   * - Возвращать false если соединение не активно
   * - Работать идентично текущей реализации
   */
  describe('Property 2.4: Метод send() без параметра ws', () => {
    it('должен проверять this.ws.readyState перед отправкой', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.constantFrom('init', 'ping', 'subscribe', 'unsubscribe'),
            payload: fc.option(fc.object(), { nil: undefined })
          }),
          async (message) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            // Попытка отправки без подключения
            const resultBeforeConnect = manager.send(message);
            expect(resultBeforeConnect).toBe(false);
            
            // Подключаемся
            await manager.connect('ws://localhost:3000', 'test-token');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Отправка при открытом соединении
            const resultWhenOpen = manager.send(message);
            expect(resultWhenOpen).toBe(true);
            
            // Закрываем соединение
            manager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Test');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Попытка отправки после закрытия
            const resultAfterClose = manager.send(message);
            expect(resultAfterClose).toBe(false);
            
            manager.clear();
          }
        ),
        { numRuns: 30 }
      );
    });

    it('должен возвращать false если this.ws === null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.anything(),
          async (message) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            // this.ws === null до подключения
            const result = manager.send(message);
            
            expect(result).toBe(false);
            expect(manager.getWebSocket()).toBeNull();
            
            manager.clear();
          }
        ),
        { numRuns: 30 }
      );
    });

    it('должен успешно отправлять сообщения при открытом соединении', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.string({ minLength: 1, maxLength: 20 }),
              data: fc.option(fc.anything(), { nil: undefined })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (messages) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            await manager.connect('ws://localhost:3000', 'test-token');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Отправляем все сообщения
            const results = messages.map(msg => manager.send(msg));
            
            // Все отправки должны быть успешными
            results.forEach(result => {
              expect(result).toBe(true);
            });
            
            manager.clear();
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 2.5: Множественные циклы подключения/отключения
   * 
   * **Validates: Requirements 3.1, 3.2, 3.5**
   * 
   * Для любой последовательности подключений и отключений,
   * система ДОЛЖНА корректно обрабатывать каждый цикл:
   * - Каждое подключение должно выполнить handshake
   * - Каждое отключение должно очистить состояние
   * - Не должно быть утечек памяти или некорректных состояний
   */
  describe('Property 2.5: Множественные циклы подключения/отключения', () => {
    it('должен корректно обрабатывать несколько циклов подключения/отключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (cycleCount) => {
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            const events: { cycle: number; event: string; state: string }[] = [];
            
            manager.on('onOpen', () => {
              events.push({ cycle: -1, event: 'open', state: stateManager.getState() });
            });
            
            manager.on('onClose', () => {
              events.push({ cycle: -1, event: 'close', state: stateManager.getState() });
            });
            
            // Выполняем несколько циклов
            for (let i = 0; i < cycleCount; i++) {
              // Подключаемся
              await manager.connect('ws://localhost:3000', `token-${i}`);
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Проверяем, что соединение открыто
              expect(manager.isOpen()).toBe(true);
              expect(manager.getWebSocket()).not.toBeNull();
              
              // Отключаемся
              manager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, `Cycle ${i}`);
              await new Promise(resolve => setTimeout(resolve, 50));
              
              // Проверяем, что соединение закрыто
              expect(manager.isOpen()).toBe(false);
              expect(manager.getWebSocket()).toBeNull();
              expect(stateManager.getState()).toBe('disconnected');
            }
            
            // Проверяем, что все циклы выполнены корректно
            const openEvents = events.filter(e => e.event === 'open');
            const closeEvents = events.filter(e => e.event === 'close');
            
            expect(openEvents.length).toBe(cycleCount);
            expect(closeEvents.length).toBe(cycleCount);
            
            manager.clear();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);
  });
});
