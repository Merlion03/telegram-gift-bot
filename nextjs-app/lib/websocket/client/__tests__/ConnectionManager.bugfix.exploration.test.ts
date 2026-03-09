/**
 * Bug Condition Exploration Test для ConnectionManager
 * 
 * Bugfix: websocket-connection-1006-fix
 * Property 1: Fault Condition - Race Condition During Proxy Delay
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4**
 * 
 * **КРИТИЧЕСКИ ВАЖНО**: Этот тест кодирует ОЖИДАЕМОЕ поведение.
 * - На НЕИСПРАВЛЕННОМ коде: тест ДОЛЖЕН ПРОВАЛИТЬСЯ (подтверждает существование бага)
 * - На ИСПРАВЛЕННОМ коде: тест ДОЛЖЕН ПРОЙТИ (подтверждает, что баг исправлен)
 * 
 * **НЕ ПЫТАТЬСЯ исправить тест или код, когда он провалится на неисправленном коде**
 * 
 * Цель: Выявить контрпримеры, демонстрирующие race condition между handleOpen и handleClose
 * во время задержки 50ms для стабилизации прокси.
 * 
 * Bug Condition:
 * - WebSocket открывается → начинается задержка 50ms
 * - Во время задержки происходит событие close
 * - handleClose устанавливает this.ws = null
 * - handleOpen пытается отправить init через this.ws
 * - Отправка не происходит из-за this.ws === null
 * 
 * Expected Behavior (после исправления):
 * - Init сообщение отправляется через захваченную локальную ссылку wsInstance
 * - Проверяется wsInstance.readyState === OPEN
 * - Отправка происходит независимо от изменений this.ws обработчиком handleClose
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ConnectionManager } from '../ConnectionManager';
import { StateManager } from '../StateManager';
import { CLOSE_CODES } from '../../constants';

/**
 * Контролируемый Mock WebSocket для симуляции race condition
 * Позволяет точно контролировать время событий open и close
 */
class ControlledMockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  private _readyState: number = ControlledMockWebSocket.CONNECTING;
  url: string;
  
  private listeners: Map<string, Set<Function>> = new Map();
  private openTimeoutId: any = null;
  
  constructor(url: string) {
    this.url = url;
  }

  get readyState(): number {
    return this._readyState;
  }

  set readyState(value: number) {
    this._readyState = value;
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
    if (this._readyState !== ControlledMockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Успешная отправка
  }

  close(code?: number, reason?: string): void {
    if (this._readyState === ControlledMockWebSocket.CLOSED || this._readyState === ControlledMockWebSocket.CLOSING) {
      return;
    }
    
    this._readyState = ControlledMockWebSocket.CLOSING;
    
    setTimeout(() => {
      this._readyState = ControlledMockWebSocket.CLOSED;
      const event = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || '',
        wasClean: code === 1000,
      });
      Object.defineProperty(event, 'target', { value: this, writable: false });
      this.trigger('close', event);
    }, 5);
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
   * Симулировать открытие WebSocket с контролируемой задержкой
   */
  simulateOpen(delay: number = 10): void {
    this.openTimeoutId = setTimeout(() => {
      if (this._readyState === ControlledMockWebSocket.CONNECTING) {
        this._readyState = ControlledMockWebSocket.OPEN;
        this.trigger('open', new Event('open'));
      }
    }, delay);
  }

  /**
   * Симулировать закрытие во время задержки handleOpen
   * @param delayAfterOpen - задержка после события open (в пределах 0-50ms)
   */
  simulateCloseDuringProxyDelay(delayAfterOpen: number): void {
    setTimeout(() => {
      if (this._readyState === ControlledMockWebSocket.OPEN) {
        this._readyState = ControlledMockWebSocket.CLOSED;
        const event = new CloseEvent('close', {
          code: CLOSE_CODES.ABNORMAL_CLOSURE,
          reason: 'Connection closed during proxy delay',
          wasClean: false,
        });
        Object.defineProperty(event, 'target', { value: this, writable: false });
        this.trigger('close', event);
      }
    }, delayAfterOpen);
  }
}

describe('ConnectionManager - Bug Condition Exploration Test', () => {
  let originalWebSocket: any;

  beforeEach(() => {
    originalWebSocket = global.WebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  /**
   * Property 1: Fault Condition - Race Condition During Proxy Delay
   * 
   * **КРИТИЧЕСКИ ВАЖНО**: Этот тест кодирует ОЖИДАЕМОЕ поведение
   * 
   * На НЕИСПРАВЛЕННОМ коде: ПРОВАЛИТСЯ (подтверждает баг)
   * На ИСПРАВЛЕННОМ коде: ПРОЙДЁТ (подтверждает исправление)
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   * 
   * Тест проверяет, что init сообщение отправляется через захваченную
   * локальную ссылку wsInstance, даже если this.ws был изменён handleClose
   * во время задержки 50ms для стабилизации прокси.
   */
  describe('Property 1: Race Condition During Proxy Delay - Expected Behavior', () => {
    it('должен отправить init сообщение через захваченную ссылку, даже если WebSocket закрылся во время задержки', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем различные тайминги закрытия во время задержки 50ms
          fc.integer({ min: 5, max: 45 }),
          async (closeTimingMs) => {
            // Создаём контролируемый mock
            let wsInstance: ControlledMockWebSocket | null = null;
            
            global.WebSocket = class extends ControlledMockWebSocket {
              constructor(url: string) {
                super(url);
                wsInstance = this;
                // Открываем соединение сразу
                this.simulateOpen(5);
              }
            } as any;
            
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            let sendCalled = false;
            let sendCalledWithWsInstance = false;
            let wsInstanceAtSendTime: WebSocket | undefined = undefined;
            
            // Перехватываем метод send для отслеживания отправки init
            const originalSend = manager.send.bind(manager);
            manager.send = vi.fn((message: any, ws?: WebSocket) => {
              sendCalled = true;
              wsInstanceAtSendTime = ws;
              // Сравниваем через приведение типов
              sendCalledWithWsInstance = ws === (wsInstance as unknown as WebSocket);
              
              const result = originalSend(message, ws);
              return result;
            });
            
            // Начинаем подключение
            const connectPromise = manager.connect('ws://localhost:3000', 'test-token');
            
            // Ждём открытия WebSocket
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Симулируем закрытие во время задержки 50ms
            if (wsInstance) {
              (wsInstance as ControlledMockWebSocket).simulateCloseDuringProxyDelay(closeTimingMs);
            }
            
            // Ждём завершения connect (включая задержку 50ms)
            await connectPromise;
            await new Promise(resolve => setTimeout(resolve, 60));
            
            // **ОЖИДАЕМОЕ ПОВЕДЕНИЕ** (после исправления):
            // Если wsInstance всё ещё OPEN к моменту отправки (closeTimingMs > 50),
            // то send ДОЛЖЕН быть вызван с захваченной ссылкой wsInstance
            
            // Если wsInstance уже закрыт к моменту отправки (closeTimingMs < 50),
            // то send может не вызваться (правильное поведение - проверка readyState)
            
            // Важно: если send был вызван, он ДОЛЖЕН быть вызван с wsInstance
            if (sendCalled) {
              expect(sendCalledWithWsInstance).toBe(true);
              expect(wsInstanceAtSendTime).toBe(wsInstance);
            }
            
            manager.clear();
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        ),
        { numRuns: 30 }
      );
    });

    it('должен проверять wsInstance.readyState перед отправкой init', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 45 }),
          async (closeTimingMs) => {
            let wsInstance: ControlledMockWebSocket | null = null;
            let readyStateAccessCount = 0;
            
            global.WebSocket = class extends ControlledMockWebSocket {
              constructor(url: string) {
                super(url);
                const instance = this;
                wsInstance = instance;
                this.simulateOpen(5);
              }
              
              // Перехватываем доступ к readyState через метод
              get readyState() {
                readyStateAccessCount++;
                return super.readyState;
              }
            } as any;
            
            const stateManager = new StateManager();
            const manager = new ConnectionManager(stateManager);
            
            const connectPromise = manager.connect('ws://localhost:3000', 'test-token');
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            if (wsInstance) {
              (wsInstance as ControlledMockWebSocket).simulateCloseDuringProxyDelay(closeTimingMs);
            }
            
            await connectPromise;
            await new Promise(resolve => setTimeout(resolve, 60));
            
            // **ОЖИДАЕМОЕ ПОВЕДЕНИЕ**: readyState захваченного wsInstance должен быть проверен
            // Проверка происходит в handleOpen перед отправкой init
            expect(readyStateAccessCount).toBeGreaterThan(0);
            
            manager.clear();
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        ),
        { numRuns: 30 }
      );
    });

    it('должен корректно обработать сравнение экземпляров в handleClose', async () => {
      let wsInstance: ControlledMockWebSocket | null = null;
      let closeHandlerCalled = false;
      let thisWsClearedIncorrectly = false;
      
      global.WebSocket = class extends ControlledMockWebSocket {
        constructor(url: string) {
          super(url);
          wsInstance = this;
          this.simulateOpen(5);
        }
      } as any;
      
      const stateManager = new StateManager();
      const manager = new ConnectionManager(stateManager);
      
      manager.on('onClose', () => {
        closeHandlerCalled = true;
        // Проверяем, что this.ws был очищен только если закрывается текущий активный сокет
        if (manager.getWebSocket() === null && wsInstance && wsInstance.readyState !== ControlledMockWebSocket.CLOSED) {
          thisWsClearedIncorrectly = true;
        }
      });
      
      const connectPromise = manager.connect('ws://localhost:3000', 'test-token');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Закрываем во время задержки
      if (wsInstance) {
        (wsInstance as ControlledMockWebSocket).simulateCloseDuringProxyDelay(25);
      }
      
      await connectPromise;
      await new Promise(resolve => setTimeout(resolve, 80));
      
      // **ОЖИДАЕМОЕ ПОВЕДЕНИЕ**: handleClose должен корректно обработать закрытие
      expect(closeHandlerCalled).toBe(true);
      
      // this.ws должен быть очищен только если закрывается текущий активный сокет
      expect(thisWsClearedIncorrectly).toBe(false);
      
      manager.clear();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  });

  /**
   * Scoped PBT: Детерминистичные тестовые случаи для воспроизводимости
   * 
   * Для детерминистичного бага ограничиваем property конкретными
   * проваливающимися случаями для воспроизводимости.
   */
  describe('Scoped PBT: Конкретные проваливающиеся случаи', () => {
    const testCases = [
      { name: 'Закрытие в начале задержки (10ms)', closeAt: 10 },
      { name: 'Закрытие в середине задержки (25ms)', closeAt: 25 },
      { name: 'Закрытие в конце задержки (45ms)', closeAt: 45 },
    ];

    testCases.forEach(({ name, closeAt }) => {
      it(`${name}: должен использовать захваченную ссылку при попытке отправки init`, async () => {
        let wsInstance: ControlledMockWebSocket | null = null;
        
        global.WebSocket = class extends ControlledMockWebSocket {
          constructor(url: string) {
            super(url);
            wsInstance = this;
            this.simulateOpen(5);
          }
        } as any;
        
        const stateManager = new StateManager();
        const manager = new ConnectionManager(stateManager);
        
        let sendCalled = false;
        let sendCalledWithWsInstance = false;
        
        const originalSend = manager.send.bind(manager);
        manager.send = vi.fn((message: any, ws?: WebSocket) => {
          sendCalled = true;
          // Сравниваем через приведение типов
          sendCalledWithWsInstance = ws === (wsInstance as unknown as WebSocket);
          
          const result = originalSend(message, ws);
          return result;
        });
        
        const connectPromise = manager.connect('ws://localhost:3000', 'test-token');
        
        await new Promise(resolve => setTimeout(resolve, 10));
        
        if (wsInstance) {
          (wsInstance as ControlledMockWebSocket).simulateCloseDuringProxyDelay(closeAt);
        }
        
        await connectPromise;
        await new Promise(resolve => setTimeout(resolve, 60));
        
        // **ОЖИДАЕМОЕ ПОВЕДЕНИЕ**: если send был вызван, он должен быть вызван с захваченной ссылкой
        if (sendCalled) {
          expect(sendCalledWithWsInstance).toBe(true);
        }
        
        manager.clear();
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    });
  });
});
