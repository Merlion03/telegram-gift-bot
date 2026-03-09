/**
 * Unit-тесты для ConnectionManager
 * 
 * Проверяет конкретные примеры и edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionManager } from '../ConnectionManager';
import { StateManager } from '../StateManager';
import { CLOSE_CODES } from '../../constants';

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

describe('ConnectionManager - Unit Tests', () => {
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
   * Unit-тест для нормального закрытия с кодом 1000
   * 
   * Проверяет, что при вызове disconnect() используется код 1000 (normal closure)
   * 
   * Requirements: 1.4 - Использование кода 1000 при нормальном закрытии
   */
  describe('Нормальное закрытие с кодом 1000', () => {
    it('должен использовать код 1000 при вызове disconnect() без параметров', async () => {
      let capturedCode: number | null = null;
      let capturedReason: string | null = null;
      
      connectionManager.on('onClose', (code: number, reason: string) => {
        capturedCode = code;
        capturedReason = reason;
      });
      
      // Подключаемся
      await connectionManager.connect('ws://localhost:3000', 'test-token');
      
      // Ждём открытия соединения
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Закрываем без параметров (должен использоваться код 1000 по умолчанию)
      connectionManager.disconnect();
      
      // Ждём закрытия
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Проверяем, что использован код 1000
      expect(capturedCode).toBe(CLOSE_CODES.NORMAL_CLOSURE);
      expect(capturedReason).toBe('Normal closure');
    });

    it('должен использовать код 1000 при явном указании', async () => {
      let capturedCode: number | null = null;
      let capturedReason: string | null = null;
      
      connectionManager.on('onClose', (code: number, reason: string) => {
        capturedCode = code;
        capturedReason = reason;
      });
      
      await connectionManager.connect('ws://localhost:3000', 'test-token');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Явно указываем код 1000
      connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'User initiated disconnect');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(capturedCode).toBe(CLOSE_CODES.NORMAL_CLOSURE);
      expect(capturedReason).toBe('User initiated disconnect');
    });

    it('должен обновить состояние на disconnected после закрытия', async () => {
      await connectionManager.connect('ws://localhost:3000', 'test-token');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Проверяем, что состояние connecting
      expect(stateManager.getState()).toBe('connecting');
      
      connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Test');
      
      // Состояние должно сразу измениться на disconnected
      expect(stateManager.getState()).toBe('disconnected');
      
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('должен очистить WebSocket instance после закрытия', async () => {
      await connectionManager.connect('ws://localhost:3000', 'test-token');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Проверяем, что WebSocket существует
      expect(connectionManager.getWebSocket()).not.toBeNull();
      
      connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Test');
      
      // WebSocket должен быть очищен
      expect(connectionManager.getWebSocket()).toBeNull();
      
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('должен корректно обрабатывать повторный вызов disconnect()', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await connectionManager.connect('ws://localhost:3000', 'test-token');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Первый вызов disconnect
      connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'First');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Второй вызов disconnect (соединение уже закрыто)
      connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Second');
      
      // Должно быть предупреждение
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ConnectionManager] Попытка закрыть несуществующее соединение'
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('должен корректно работать с методом clear()', async () => {
      await connectionManager.connect('ws://localhost:3000', 'test-token');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Проверяем, что соединение существует
      expect(connectionManager.getWebSocket()).not.toBeNull();
      
      // Вызываем clear (должен закрыть соединение с кодом 1000)
      connectionManager.clear();
      
      // Соединение должно быть сразу очищено
      expect(connectionManager.getWebSocket()).toBeNull();
      
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });
});
