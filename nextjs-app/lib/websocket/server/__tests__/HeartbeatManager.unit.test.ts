/**
 * Unit-тесты для HeartbeatManager
 * 
 * Проверяет конкретные примеры и edge cases для heartbeat механизма
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeartbeatManager } from '../HeartbeatManager';
import { ConnectionHandler } from '../ConnectionHandler';
import { AuthenticationHandler } from '../AuthenticationHandler';
import { TIMEOUTS, CUSTOM_CLOSE_CODES } from '../../constants';
import type { ClientConnection } from '../../types';

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

describe('HeartbeatManager - Unit Tests', () => {
  let heartbeatManager: HeartbeatManager;
  let connectionHandler: ConnectionHandler;
  let authHandler: AuthenticationHandler;

  beforeEach(() => {
    authHandler = new AuthenticationHandler('test-secret-key');
    connectionHandler = new ConnectionHandler(authHandler);
    heartbeatManager = new HeartbeatManager(connectionHandler);
  });

  afterEach(() => {
    // Останавливаем heartbeat после каждого теста
    if (heartbeatManager.isRunning()) {
      heartbeatManager.stop();
    }
  });

  /**
   * Unit-тест для отправки ping каждые 30 секунд
   * Validates: Requirements 3.2
   */
  describe('Отправка ping каждые 30 секунд', () => {
    it('должен отправлять ping frames с интервалом 30 секунд', async () => {
      // Создаём mock соединения
      const mockConnections = new Map<string, ClientConnection>();
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();
      
      mockConnections.set('client-1', {
        id: 'client-1',
        ws: mockWs1 as any,
        userId: 1,
        authenticatedAt: new Date(),
        lastPongAt: new Date(),
      });
      
      mockConnections.set('client-2', {
        id: 'client-2',
        ws: mockWs2 as any,
        userId: 2,
        authenticatedAt: new Date(),
        lastPongAt: new Date(),
      });
      
      // Mock метода getAllConnections
      vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
      
      // Используем fake timers для контроля времени
      vi.useFakeTimers();
      
      // Запускаем heartbeat
      heartbeatManager.start();
      
      // Проверяем, что ping НЕ отправлен сразу после запуска
      expect(mockWs1.pingCalled).toBe(false);
      expect(mockWs2.pingCalled).toBe(false);
      
      // Продвигаем время на 30 секунд
      vi.advanceTimersByTime(TIMEOUTS.SERVER_PING_INTERVAL);
      
      // Проверяем, что ping был отправлен обоим клиентам
      expect(mockWs1.pingCalled).toBe(true);
      expect(mockWs2.pingCalled).toBe(true);
      
      // Сбрасываем флаги
      mockWs1.reset();
      mockWs2.reset();
      
      // Продвигаем время ещё на 30 секунд
      vi.advanceTimersByTime(TIMEOUTS.SERVER_PING_INTERVAL);
      
      // Проверяем, что ping был отправлен снова
      expect(mockWs1.pingCalled).toBe(true);
      expect(mockWs2.pingCalled).toBe(true);
      
      // Останавливаем heartbeat
      heartbeatManager.stop();
      
      // Сбрасываем флаги
      mockWs1.reset();
      mockWs2.reset();
      
      // Продвигаем время ещё на 30 секунд
      vi.advanceTimersByTime(TIMEOUTS.SERVER_PING_INTERVAL);
      
      // Проверяем, что ping НЕ был отправлен после остановки
      expect(mockWs1.pingCalled).toBe(false);
      expect(mockWs2.pingCalled).toBe(false);
      
      // Восстанавливаем реальные таймеры
      vi.useRealTimers();
      
      // Очищаем моки
      vi.restoreAllMocks();
    });

    it('должен использовать правильный интервал (30000ms)', () => {
      // Проверяем, что константа имеет правильное значение
      expect(TIMEOUTS.SERVER_PING_INTERVAL).toBe(30000);
    });

    it('должен запускать два интервала: ping и проверка мёртвых соединений', () => {
      // Используем fake timers
      vi.useFakeTimers();
      
      // Spy на setInterval
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      // Запускаем heartbeat
      heartbeatManager.start();
      
      // Проверяем, что setInterval был вызван дважды с интервалом 30000ms
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      expect(setIntervalSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 30000);
      expect(setIntervalSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 30000);
      
      // Останавливаем heartbeat
      heartbeatManager.stop();
      
      // Восстанавливаем реальные таймеры
      vi.useRealTimers();
      
      // Очищаем моки
      vi.restoreAllMocks();
    });

    it('НЕ должен запускать heartbeat повторно если уже запущен', () => {
      // Используем fake timers
      vi.useFakeTimers();
      
      // Spy на setInterval
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      // Запускаем heartbeat первый раз
      heartbeatManager.start();
      
      // Проверяем, что setInterval был вызван дважды
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      
      // Пытаемся запустить heartbeat второй раз
      heartbeatManager.start();
      
      // Проверяем, что setInterval НЕ был вызван снова
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      
      // Останавливаем heartbeat
      heartbeatManager.stop();
      
      // Восстанавливаем реальные таймеры
      vi.useRealTimers();
      
      // Очищаем моки
      vi.restoreAllMocks();
    });
  });

  /**
   * Unit-тест для таймаута 60 секунд
   * Validates: Requirements 3.4
   */
  describe('Таймаут 60 секунд', () => {
    it('должен закрывать соединения без pong в течение 60 секунд с кодом 4408', () => {
      // Создаём mock соединение с устаревшим lastPongAt
      const mockConnections = new Map<string, ClientConnection>();
      const mockWs = new MockWebSocket();
      
      // lastPongAt = 61 секунда назад (превышает таймаут 60 секунд)
      const lastPongAt = new Date(Date.now() - 61000);
      
      mockConnections.set('client-dead', {
        id: 'client-dead',
        ws: mockWs as any,
        userId: 1,
        authenticatedAt: new Date(),
        lastPongAt,
      });
      
      // Mock методов
      vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
      const closeConnectionSpy = vi.spyOn(connectionHandler, 'closeConnection');
      
      // Проверяем "мёртвые" соединения
      heartbeatManager.checkDeadConnections();
      
      // Проверяем, что соединение было закрыто с правильным кодом
      expect(closeConnectionSpy).toHaveBeenCalledTimes(1);
      expect(closeConnectionSpy).toHaveBeenCalledWith(
        'client-dead',
        CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT,
        'Heartbeat timeout: no pong received'
      );
      
      // Очищаем моки
      vi.restoreAllMocks();
    });

    it('должен использовать правильный таймаут (60000ms)', () => {
      // Проверяем, что константа имеет правильное значение
      expect(TIMEOUTS.SERVER_PONG_TIMEOUT).toBe(60000);
    });

    it('должен использовать правильный код закрытия (4408)', () => {
      // Проверяем, что константа имеет правильное значение
      expect(CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT).toBe(4408);
    });

    it('НЕ должен закрывать соединения с pong ровно 60 секунд назад (граничный случай)', () => {
      // Создаём mock соединение с lastPongAt ровно 60 секунд назад
      const mockConnections = new Map<string, ClientConnection>();
      const mockWs = new MockWebSocket();
      
      // lastPongAt = ровно 60 секунд назад (НЕ превышает таймаут)
      const lastPongAt = new Date(Date.now() - 60000);
      
      mockConnections.set('client-boundary', {
        id: 'client-boundary',
        ws: mockWs as any,
        userId: 1,
        authenticatedAt: new Date(),
        lastPongAt,
      });
      
      // Mock методов
      vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
      const closeConnectionSpy = vi.spyOn(connectionHandler, 'closeConnection');
      
      // Проверяем "мёртвые" соединения
      heartbeatManager.checkDeadConnections();
      
      // Проверяем, что соединение НЕ было закрыто (60000ms не превышает таймаут)
      expect(closeConnectionSpy).not.toHaveBeenCalled();
      
      // Очищаем моки
      vi.restoreAllMocks();
    });

    it('должен закрывать соединения с pong 60.001 секунд назад (граничный случай)', () => {
      // Создаём mock соединение с lastPongAt чуть больше 60 секунд назад
      const mockConnections = new Map<string, ClientConnection>();
      const mockWs = new MockWebSocket();
      
      // lastPongAt = 60.001 секунд назад (превышает таймаут)
      const lastPongAt = new Date(Date.now() - 60001);
      
      mockConnections.set('client-just-over', {
        id: 'client-just-over',
        ws: mockWs as any,
        userId: 1,
        authenticatedAt: new Date(),
        lastPongAt,
      });
      
      // Mock методов
      vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
      const closeConnectionSpy = vi.spyOn(connectionHandler, 'closeConnection');
      
      // Проверяем "мёртвые" соединения
      heartbeatManager.checkDeadConnections();
      
      // Проверяем, что соединение было закрыто
      expect(closeConnectionSpy).toHaveBeenCalledTimes(1);
      expect(closeConnectionSpy).toHaveBeenCalledWith(
        'client-just-over',
        CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT,
        'Heartbeat timeout: no pong received'
      );
      
      // Очищаем моки
      vi.restoreAllMocks();
    });

    it('должен проверять мёртвые соединения каждые 30 секунд', () => {
      // Используем fake timers
      vi.useFakeTimers();
      
      // Создаём mock соединение
      const mockConnections = new Map<string, ClientConnection>();
      const mockWs = new MockWebSocket();
      
      mockConnections.set('client-1', {
        id: 'client-1',
        ws: mockWs as any,
        userId: 1,
        authenticatedAt: new Date(),
        lastPongAt: new Date(),
      });
      
      // Mock методов
      vi.spyOn(connectionHandler, 'getAllConnections').mockReturnValue(mockConnections);
      const checkDeadConnectionsSpy = vi.spyOn(heartbeatManager, 'checkDeadConnections');
      
      // Запускаем heartbeat
      heartbeatManager.start();
      
      // Проверяем, что checkDeadConnections НЕ вызван сразу
      expect(checkDeadConnectionsSpy).toHaveBeenCalledTimes(0);
      
      // Продвигаем время на 30 секунд
      vi.advanceTimersByTime(TIMEOUTS.SERVER_PING_INTERVAL);
      
      // Проверяем, что checkDeadConnections был вызван
      expect(checkDeadConnectionsSpy).toHaveBeenCalledTimes(1);
      
      // Продвигаем время ещё на 30 секунд
      vi.advanceTimersByTime(TIMEOUTS.SERVER_PING_INTERVAL);
      
      // Проверяем, что checkDeadConnections был вызван снова
      expect(checkDeadConnectionsSpy).toHaveBeenCalledTimes(2);
      
      // Останавливаем heartbeat
      heartbeatManager.stop();
      
      // Восстанавливаем реальные таймеры
      vi.useRealTimers();
      
      // Очищаем моки
      vi.restoreAllMocks();
    });
  });

  /**
   * Дополнительные unit-тесты
   */
  describe('Дополнительные тесты', () => {
    it('должен корректно обрабатывать handlePong', () => {
      // Mock метода updateLastPong
      const updateLastPongSpy = vi.spyOn(connectionHandler, 'updateLastPong');
      
      // Обрабатываем pong от клиента
      heartbeatManager.handlePong('client-123');
      
      // Проверяем, что updateLastPong был вызван с правильным clientId
      expect(updateLastPongSpy).toHaveBeenCalledTimes(1);
      expect(updateLastPongSpy).toHaveBeenCalledWith('client-123');
      
      // Очищаем моки
      vi.restoreAllMocks();
    });

    it('должен возвращать правильный статус isRunning', () => {
      // Проверяем, что heartbeat не запущен
      expect(heartbeatManager.isRunning()).toBe(false);
      
      // Запускаем heartbeat
      heartbeatManager.start();
      
      // Проверяем, что heartbeat запущен
      expect(heartbeatManager.isRunning()).toBe(true);
      
      // Останавливаем heartbeat
      heartbeatManager.stop();
      
      // Проверяем, что heartbeat остановлен
      expect(heartbeatManager.isRunning()).toBe(false);
    });

    it('НЕ должен останавливать heartbeat повторно если уже остановлен', () => {
      // Используем fake timers
      vi.useFakeTimers();
      
      // Spy на clearInterval
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      // Запускаем heartbeat
      heartbeatManager.start();
      
      // Останавливаем heartbeat первый раз
      heartbeatManager.stop();
      
      // Проверяем, что clearInterval был вызван дважды (для двух интервалов)
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
      
      // Пытаемся остановить heartbeat второй раз
      heartbeatManager.stop();
      
      // Проверяем, что clearInterval НЕ был вызван снова
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
      
      // Восстанавливаем реальные таймеры
      vi.useRealTimers();
      
      // Очищаем моки
      vi.restoreAllMocks();
    });
  });
});
