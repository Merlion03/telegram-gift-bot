/**
 * Unit-тесты для ReconnectionStrategy
 * 
 * Проверяет конкретные примеры и edge cases стратегии переподключения
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReconnectionStrategy } from '../ReconnectionStrategy';
import { CLOSE_CODES, CUSTOM_CLOSE_CODES, RECONNECTION } from '../../constants';

describe('ReconnectionStrategy - Unit Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Unit-тест для кодов закрытия, при которых НЕ переподключаемся
   * 
   * Проверяет конкретные коды: 1000, 4401, 4403
   * 
   * Requirements: 4.5, 4.6
   */
  describe('Коды закрытия без переподключения', () => {
    it('НЕ должен переподключаться при коде 1000 (нормальное закрытие)', () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      
      // Проверяем shouldReconnect для кода 1000
      const shouldReconnect = strategy.shouldReconnect(CLOSE_CODES.NORMAL_CLOSURE);
      
      expect(shouldReconnect).toBe(false);
    });

    it('НЕ должен переподключаться при коде 4401 (ошибка аутентификации)', () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      
      // Проверяем shouldReconnect для кода 4401
      const shouldReconnect = strategy.shouldReconnect(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      
      expect(shouldReconnect).toBe(false);
    });

    it('НЕ должен переподключаться при коде 4403 (нет прав доступа)', () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      
      // Проверяем shouldReconnect для кода 4403
      const shouldReconnect = strategy.shouldReconnect(CUSTOM_CLOSE_CODES.FORBIDDEN);
      
      expect(shouldReconnect).toBe(false);
    });

    it('должен переподключаться при других кодах закрытия', () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      
      // Проверяем различные аномальные коды
      const abnormalCodes = [
        CLOSE_CODES.ABNORMAL_CLOSURE,        // 1006
        CLOSE_CODES.GOING_AWAY,              // 1001
        CLOSE_CODES.PROTOCOL_ERROR,          // 1002
        CLOSE_CODES.INTERNAL_ERROR,          // 1011
        CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT, // 4408
      ];
      
      abnormalCodes.forEach(code => {
        expect(strategy.shouldReconnect(code)).toBe(true);
      });
    });
  });

  /**
   * Edge-case тест для неавторизованного пользователя
   * 
   * Проверяет, что не пытаемся переподключиться если пользователь не авторизован
   * 
   * Requirements: 4.7
   */
  describe('Edge-case: Неавторизованный пользователь', () => {
    it('НЕ должен запускать переподключение если пользователь не авторизован', () => {
      // Пользователь НЕ авторизован
      const isUserAuthorized = vi.fn(() => false);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockResolvedValue(undefined);
      
      // Пытаемся переподключиться
      strategy.reconnect(connectFn);
      
      // Проверяем, что функция проверки авторизации была вызвана
      expect(isUserAuthorized).toHaveBeenCalled();
      
      // Проверяем, что переподключение НЕ активно
      expect(strategy.isActive()).toBe(false);
      
      // Продвигаем таймеры на большое время
      vi.advanceTimersByTime(RECONNECTION.MAX_DELAY * 10);
      
      // Функция переподключения НЕ должна быть вызвана
      expect(connectFn).not.toHaveBeenCalled();
    });

    it('должен проверять авторизацию при каждой попытке reconnect', () => {
      const isUserAuthorized = vi.fn(() => false);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockResolvedValue(undefined);
      
      // Пытаемся переподключиться несколько раз
      strategy.reconnect(connectFn);
      strategy.reconnect(connectFn);
      strategy.reconnect(connectFn);
      
      // Функция проверки авторизации должна быть вызвана 3 раза
      expect(isUserAuthorized).toHaveBeenCalledTimes(3);
      
      // Функция переподключения НЕ должна быть вызвана
      expect(connectFn).not.toHaveBeenCalled();
    });

    it('должен переподключаться если пользователь авторизовался после первой попытки', async () => {
      // Сначала не авторизован, потом авторизован
      let authorized = false;
      const isUserAuthorized = vi.fn(() => authorized);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockResolvedValue(undefined);
      
      // Первая попытка - пользователь не авторизован
      strategy.reconnect(connectFn);
      expect(strategy.isActive()).toBe(false);
      expect(connectFn).not.toHaveBeenCalled();
      
      // Пользователь авторизовался
      authorized = true;
      
      // Вторая попытка - пользователь авторизован
      strategy.reconnect(connectFn);
      expect(strategy.isActive()).toBe(true);
      
      // Продвигаем таймеры
      vi.advanceTimersByTime(RECONNECTION.INITIAL_DELAY);
      
      // Ждём выполнения промисов
      await Promise.resolve();
      
      // Функция переподключения должна быть вызвана
      expect(connectFn).toHaveBeenCalledTimes(1);
    });

    it('должен логировать сообщение при отмене из-за отсутствия авторизации', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const isUserAuthorized = vi.fn(() => false);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockResolvedValue(undefined);
      
      // Пытаемся переподключиться
      strategy.reconnect(connectFn);
      
      // Проверяем, что было залогировано сообщение
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('не авторизован')
      );
      
      consoleLogSpy.mockRestore();
    });
  });

  /**
   * Дополнительные unit-тесты для конкретных сценариев
   */
  describe('Дополнительные сценарии', () => {
    it('должен корректно вычислять задержку для первых 5 попыток', async () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
      
      // Ожидаемые задержки: 1s, 2s, 4s, 8s, 16s
      const expectedDelays = [1000, 2000, 4000, 8000, 16000];
      
      strategy.reconnect(connectFn);
      
      for (let i = 0; i < expectedDelays.length; i++) {
        const actualDelay = strategy.getCurrentDelay();
        expect(actualDelay).toBe(expectedDelays[i]);
        
        // Продвигаем таймеры
        vi.advanceTimersByTime(actualDelay);
        vi.runAllTimers();
        await Promise.resolve();
      }
    });

    it('должен достигать MAX_DELAY после достаточного количества попыток', async () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
      
      strategy.reconnect(connectFn);
      
      // Симулируем много попыток
      for (let i = 0; i < 10; i++) {
        const delay = strategy.getCurrentDelay();
        vi.advanceTimersByTime(delay);
        vi.runAllTimers();
        await Promise.resolve();
      }
      
      // Задержка должна достичь MAX_DELAY (30 секунд)
      expect(strategy.getCurrentDelay()).toBe(RECONNECTION.MAX_DELAY);
    });

    it('должен корректно обрабатывать cancel() во время ожидания', () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockResolvedValue(undefined);
      
      // Запускаем переподключение
      strategy.reconnect(connectFn);
      expect(strategy.isActive()).toBe(true);
      
      // Отменяем до истечения задержки
      strategy.cancel();
      expect(strategy.isActive()).toBe(false);
      
      // Продвигаем таймеры
      vi.advanceTimersByTime(RECONNECTION.INITIAL_DELAY * 10);
      
      // Функция переподключения НЕ должна быть вызвана
      expect(connectFn).not.toHaveBeenCalled();
    });

    it('должен корректно обрабатывать reset() после нескольких попыток', async () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
      
      // Делаем несколько попыток
      strategy.reconnect(connectFn);
      
      for (let i = 0; i < 3; i++) {
        const delay = strategy.getCurrentDelay();
        vi.advanceTimersByTime(delay);
        vi.runAllTimers();
        await Promise.resolve();
      }
      
      // Счётчик попыток должен увеличиться
      expect(strategy.getAttempts()).toBeGreaterThan(0);
      expect(strategy.getCurrentDelay()).toBeGreaterThan(RECONNECTION.INITIAL_DELAY);
      
      // Сбрасываем
      strategy.reset();
      
      // Счётчик и задержка должны вернуться к начальным значениям
      expect(strategy.getAttempts()).toBe(0);
      expect(strategy.getCurrentDelay()).toBe(RECONNECTION.INITIAL_DELAY);
      expect(strategy.isActive()).toBe(false);
    });

    it('должен увеличивать счётчик попыток при каждой неудачной попытке', async () => {
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
      
      strategy.reconnect(connectFn);
      
      // Начальное значение
      expect(strategy.getAttempts()).toBe(0);
      
      // Первая попытка
      vi.advanceTimersByTime(RECONNECTION.INITIAL_DELAY);
      vi.runAllTimers();
      await Promise.resolve();
      expect(strategy.getAttempts()).toBe(1);
      
      // Вторая попытка
      vi.advanceTimersByTime(strategy.getCurrentDelay());
      vi.runAllTimers();
      await Promise.resolve();
      expect(strategy.getAttempts()).toBe(2);
      
      // Третья попытка
      vi.advanceTimersByTime(strategy.getCurrentDelay());
      vi.runAllTimers();
      await Promise.resolve();
      expect(strategy.getAttempts()).toBe(3);
    });

    it('должен логировать информацию о попытках переподключения', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const isUserAuthorized = vi.fn(() => true);
      const strategy = new ReconnectionStrategy(isUserAuthorized);
      const connectFn = vi.fn().mockResolvedValue(undefined);
      
      // Запускаем переподключение
      strategy.reconnect(connectFn);
      
      // Проверяем, что было залогировано сообщение о попытке
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Попытка переподключения')
      );
      
      consoleLogSpy.mockRestore();
    });
  });
});
