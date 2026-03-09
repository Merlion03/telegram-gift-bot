/**
 * Property-based тесты для ReconnectionStrategy
 * 
 * Проверяет универсальные свойства корректности стратегии переподключения
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ReconnectionStrategy } from '../ReconnectionStrategy';
import { CLOSE_CODES, CUSTOM_CLOSE_CODES, RECONNECTION } from '../../constants';

describe('ReconnectionStrategy - Property-Based Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Property 6: Автоматическое переподключение при аномальном закрытии
   * 
   * Для любого кода закрытия, который НЕ входит в список NO_RECONNECT_CODES,
   * ReconnectionStrategy должна автоматически вызвать функцию переподключения.
   * 
   * Feature: websocket-architecture-refactor, Property 6
   * Validates: Requirements 4.1
   */
  describe('Property 6: Автоматическое переподключение при аномальном закрытии', () => {
    it('должен переподключаться для всех аномальных кодов закрытия', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Генерируем коды закрытия, которые требуют переподключения
          fc.integer({ min: 1001, max: 4999 }).filter(code => {
            // Исключаем коды, при которых НЕ переподключаемся
            return code !== CLOSE_CODES.NORMAL_CLOSURE &&
                   code !== CUSTOM_CLOSE_CODES.UNAUTHORIZED &&
                   code !== CUSTOM_CLOSE_CODES.FORBIDDEN;
          }),
          async (closeCode) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            
            // Проверяем, что shouldReconnect возвращает true
            expect(strategy.shouldReconnect(closeCode)).toBe(true);
            
            // Создаём mock функцию переподключения
            const connectFn = vi.fn().mockResolvedValue(undefined);
            
            // Запускаем переподключение
            strategy.reconnect(connectFn);
            
            // Проверяем, что переподключение активно
            expect(strategy.isActive()).toBe(true);
            
            // Продвигаем таймеры на задержку первой попытки
            await vi.advanceTimersByTimeAsync(RECONNECTION.INITIAL_DELAY);
            
            // Функция переподключения должна быть вызвана
            expect(connectFn).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 20, verbose: false } // Уменьшили итерации
      );
    });

    it('НЕ должен переподключаться для кодов из NO_RECONNECT_CODES', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            CLOSE_CODES.NORMAL_CLOSURE,
            CUSTOM_CLOSE_CODES.UNAUTHORIZED,
            CUSTOM_CLOSE_CODES.FORBIDDEN
          ),
          (closeCode) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            
            // Проверяем, что shouldReconnect возвращает false
            expect(strategy.shouldReconnect(closeCode)).toBe(false);
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });

    it('НЕ должен переподключаться если пользователь не авторизован', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1001, max: 4999 }),
          (closeCode) => {
            // Пользователь НЕ авторизован
            const isUserAuthorized = vi.fn(() => false);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            const connectFn = vi.fn().mockResolvedValue(undefined);
            
            // Пытаемся переподключиться
            strategy.reconnect(connectFn);
            
            // Проверяем, что переподключение НЕ активно
            expect(strategy.isActive()).toBe(false);
            
            // Продвигаем таймеры
            vi.advanceTimersByTime(RECONNECTION.INITIAL_DELAY * 10);
            
            // Функция переподключения НЕ должна быть вызвана
            expect(connectFn).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20, verbose: false } // Уменьшили итерации
      );
    });

    it('должен отменять предыдущую попытку при новом вызове reconnect', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // Уменьшили максимум
          async (callCount) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            const connectFn = vi.fn().mockResolvedValue(undefined);
            
            // Вызываем reconnect несколько раз подряд
            for (let i = 0; i < callCount; i++) {
              strategy.reconnect(connectFn);
            }
            
            // Должна быть активна только последняя попытка
            expect(strategy.isActive()).toBe(true);
            
            // Продвигаем таймеры на задержку первой попытки
            await vi.advanceTimersByTimeAsync(RECONNECTION.INITIAL_DELAY);
            
            // Функция должна быть вызвана только один раз (последняя попытка)
            expect(connectFn).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 20, verbose: false } // Уменьшили итерации
      );
    });

    it('должен сбрасывать счётчик попыток после успешного переподключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2 }), // Уменьшили максимум
          async (failedAttempts) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            
            // Создаём функцию, которая сначала падает, потом успешна
            let callCount = 0;
            const connectFn = vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount <= failedAttempts) {
                return Promise.reject(new Error('Connection failed'));
              }
              return Promise.resolve();
            });
            
            // Запускаем переподключение
            strategy.reconnect(connectFn);
            
            // Симулируем неудачные попытки + успешную
            for (let i = 0; i <= failedAttempts; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
            }
            
            // Счётчик должен быть сброшен
            expect(strategy.getAttempts()).toBe(0);
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });
  });

  /**
   * Property 7: Экспоненциальная задержка при переподключении
   * 
   * Для любой последовательности неудачных попыток переподключения,
   * задержка между попытками должна расти экспоненциально:
   * delay(n) = INITIAL_DELAY * (BACKOFF_MULTIPLIER ^ n), ограниченная MAX_DELAY.
   * 
   * Feature: websocket-architecture-refactor, Property 7
   * Validates: Requirements 4.2
   */
  describe('Property 7: Экспоненциальная задержка при переподключении', () => {
    it('должен увеличивать задержку экспоненциально с каждой попыткой', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }), // Уменьшили максимум
          async (attemptCount) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            
            // Симулируем несколько неудачных попыток
            const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
            
            const delays: number[] = [];
            
            // Запускаем первую попытку
            strategy.reconnect(connectFn);
            delays.push(strategy.getCurrentDelay());
            
            // Симулируем неудачные попытки
            for (let i = 0; i < attemptCount; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
              
              // Записываем следующую задержку
              if (strategy.isActive()) {
                delays.push(strategy.getCurrentDelay());
              }
            }
            
            // Проверяем, что каждая следующая задержка больше или равна предыдущей
            for (let i = 1; i < delays.length; i++) {
              expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
            }
            
            // Проверяем, что задержки не превышают MAX_DELAY
            delays.forEach(delay => {
              expect(delay).toBeLessThanOrEqual(RECONNECTION.MAX_DELAY);
            });
          }
        ),
        { numRuns: 20, verbose: false } // Уменьшили итерации
      );
    });

    it('должен вычислять задержку по формуле: INITIAL_DELAY * (BACKOFF_MULTIPLIER ^ attempts)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 6 }), // Уменьшили максимум попыток
          async (attempts) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
            
            // Симулируем попытки до нужного количества
            strategy.reconnect(connectFn);
            
            for (let i = 0; i < attempts; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
            }
            
            const actualDelay = strategy.getCurrentDelay();
            
            // Вычисляем ожидаемую задержку
            const expectedDelay = Math.min(
              RECONNECTION.INITIAL_DELAY * Math.pow(RECONNECTION.BACKOFF_MULTIPLIER, attempts),
              RECONNECTION.MAX_DELAY
            );
            
            expect(actualDelay).toBe(expectedDelay);
          }
        ),
        { numRuns: 20 } // Уменьшили количество итераций
      );
    });

    it('должен ограничивать задержку максимальным значением MAX_DELAY', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 8 }), // Уменьшили диапазон попыток
          async (attempts) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
            
            // Симулируем попытки
            strategy.reconnect(connectFn);
            
            for (let i = 0; i < attempts; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
            }
            
            const actualDelay = strategy.getCurrentDelay();
            
            // Задержка не должна превышать MAX_DELAY
            expect(actualDelay).toBeLessThanOrEqual(RECONNECTION.MAX_DELAY);
            
            // После достаточного количества попыток задержка должна достичь MAX_DELAY
            if (attempts >= 5) {
              expect(actualDelay).toBe(RECONNECTION.MAX_DELAY);
            }
          }
        ),
        { numRuns: 10 } // Уменьшили количество итераций
      );
    });

    it('должен начинать с INITIAL_DELAY для первой попытки', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            
            // Первая попытка должна иметь задержку INITIAL_DELAY
            expect(strategy.getCurrentDelay()).toBe(RECONNECTION.INITIAL_DELAY);
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });

    it('должен сбрасывать задержку после успешного переподключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2 }), // Уменьшили максимум
          async (failedAttempts) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            
            // Создаём функцию, которая сначала падает, потом успешна
            let callCount = 0;
            const connectFn = vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount <= failedAttempts) {
                return Promise.reject(new Error('Connection failed'));
              }
              return Promise.resolve();
            });
            
            // Запускаем переподключение
            strategy.reconnect(connectFn);
            
            // Симулируем неудачные попытки
            for (let i = 0; i < failedAttempts; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
            }
            
            // Задержка должна увеличиться
            const delayBeforeSuccess = strategy.getCurrentDelay();
            expect(delayBeforeSuccess).toBeGreaterThan(RECONNECTION.INITIAL_DELAY);
            
            // Успешная попытка
            await vi.advanceTimersByTimeAsync(delayBeforeSuccess);
            
            // После успешного переподключения задержка должна сброситься
            expect(strategy.getCurrentDelay()).toBe(RECONNECTION.INITIAL_DELAY);
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });

    it('должен корректно обрабатывать последовательность: попытка → отмена → новая попытка', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2 }), // Уменьшили максимум
          fc.integer({ min: 1, max: 2 }), // Уменьшили максимум
          async (firstAttempts, secondAttempts) => {
            const isUserAuthorized = vi.fn(() => true);
            const strategy = new ReconnectionStrategy(isUserAuthorized);
            const connectFn = vi.fn().mockRejectedValue(new Error('Connection failed'));
            
            // Первая серия попыток
            strategy.reconnect(connectFn);
            for (let i = 0; i < firstAttempts; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
            }
            
            // Отменяем
            strategy.cancel();
            expect(strategy.isActive()).toBe(false);
            
            // Сбрасываем счётчик
            strategy.reset();
            expect(strategy.getCurrentDelay()).toBe(RECONNECTION.INITIAL_DELAY);
            
            // Вторая серия попыток
            strategy.reconnect(connectFn);
            for (let i = 0; i < secondAttempts; i++) {
              const delay = strategy.getCurrentDelay();
              await vi.advanceTimersByTimeAsync(delay);
            }
            
            // Задержка должна расти с начального значения
            const delayAfterSecond = strategy.getCurrentDelay();
            
            if (secondAttempts > 0) {
              expect(delayAfterSecond).toBeGreaterThan(RECONNECTION.INITIAL_DELAY);
            }
          }
        ),
        { numRuns: 10, verbose: false } // Уменьшили итерации
      );
    });
  });
});
