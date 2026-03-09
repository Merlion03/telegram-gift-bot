/**
 * Property-based тесты для HeartbeatMonitor
 * 
 * Проверяет универсальные свойства корректности мониторинга heartbeat
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { HeartbeatMonitor } from '../HeartbeatMonitor';
import { TIMEOUTS } from '../../constants';

describe('HeartbeatMonitor - Property-Based Tests', () => {
  let monitor: HeartbeatMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new HeartbeatMonitor();
  });

  afterEach(() => {
    monitor.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Property 5: Heartbeat останавливается при закрытии
   * 
   * Для любого HeartbeatMonitor, после вызова stop() все таймеры должны быть очищены,
   * и проверки активности больше не должны выполняться.
   * 
   * Feature: websocket-architecture-refactor, Property 5
   * Validates: Requirements 3.6
   */
  describe('Property 5: Heartbeat останавливается при закрытии', () => {
    it('должен очищать все таймеры после вызова stop()', () => {
      fc.assert(
        fc.property(
          // Генерируем количество циклов работы перед остановкой (0-10)
          fc.integer({ min: 0, max: 10 }),
          (cyclesBeforeStop) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            const deadCallback = vi.fn();
            
            heartbeatMonitor.onDead(deadCallback);
            heartbeatMonitor.start();
            
            // Проверяем, что мониторинг запущен
            expect(heartbeatMonitor.getIsRunning()).toBe(true);
            
            // Симулируем несколько циклов проверки
            for (let i = 0; i < cyclesBeforeStop; i++) {
              vi.advanceTimersByTime(TIMEOUTS.CLIENT_HEARTBEAT_CHECK);
            }
            
            // Останавливаем мониторинг
            heartbeatMonitor.stop();
            
            // Проверяем, что мониторинг остановлен
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
            
            // Сбрасываем счётчик вызовов callback
            deadCallback.mockClear();
            
            // Продвигаем время далеко вперёд (больше CLIENT_DEAD_CONNECTION)
            vi.advanceTimersByTime(TIMEOUTS.CLIENT_DEAD_CONNECTION * 2);
            
            // Callback НЕ должен быть вызван после остановки
            expect(deadCallback).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать множественные вызовы stop()', () => {
      fc.assert(
        fc.property(
          // Генерируем количество вызовов stop() (1-10)
          fc.integer({ min: 1, max: 10 }),
          (stopCallCount) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            
            heartbeatMonitor.start();
            expect(heartbeatMonitor.getIsRunning()).toBe(true);
            
            // Вызываем stop() несколько раз
            for (let i = 0; i < stopCallCount; i++) {
              heartbeatMonitor.stop();
              expect(heartbeatMonitor.getIsRunning()).toBe(false);
            }
            
            // Мониторинг должен оставаться остановленным
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сбрасывать lastMessageAt при остановке', () => {
      fc.assert(
        fc.property(
          // Генерируем количество обновлений времени перед остановкой (1-20)
          fc.integer({ min: 1, max: 20 }),
          (updateCount) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            
            heartbeatMonitor.start();
            
            // Обновляем время последнего сообщения несколько раз
            for (let i = 0; i < updateCount; i++) {
              vi.advanceTimersByTime(1000); // Продвигаем время на 1 секунду
              heartbeatMonitor.updateLastMessageTime();
            }
            
            // Проверяем, что lastMessageAt установлен
            expect(heartbeatMonitor.getLastMessageTime()).not.toBeNull();
            
            // Останавливаем мониторинг
            heartbeatMonitor.stop();
            
            // lastMessageAt должен быть сброшен
            expect(heartbeatMonitor.getLastMessageTime()).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен останавливать проверки активности после stop()', () => {
      fc.assert(
        fc.property(
          // Генерируем время работы перед остановкой (0-50 секунд)
          fc.integer({ min: 0, max: 50_000 }),
          // Генерируем время после остановки (0-100 секунд)
          fc.integer({ min: 0, max: 100_000 }),
          (timeBeforeStop, timeAfterStop) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            const deadCallback = vi.fn();
            
            heartbeatMonitor.onDead(deadCallback);
            heartbeatMonitor.start();
            
            // Работаем некоторое время
            vi.advanceTimersByTime(timeBeforeStop);
            
            // Останавливаем
            heartbeatMonitor.stop();
            
            // Сбрасываем счётчик вызовов
            deadCallback.mockClear();
            
            // Продвигаем время после остановки
            vi.advanceTimersByTime(timeAfterStop);
            
            // Callback НЕ должен быть вызван после остановки
            expect(deadCallback).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен позволять перезапуск после остановки', () => {
      fc.assert(
        fc.property(
          // Генерируем количество циклов start/stop (1-10)
          fc.integer({ min: 1, max: 10 }),
          (cycleCount) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            
            for (let i = 0; i < cycleCount; i++) {
              // Запускаем
              heartbeatMonitor.start();
              expect(heartbeatMonitor.getIsRunning()).toBe(true);
              
              // Работаем некоторое время
              vi.advanceTimersByTime(TIMEOUTS.CLIENT_HEARTBEAT_CHECK);
              
              // Останавливаем
              heartbeatMonitor.stop();
              expect(heartbeatMonitor.getIsRunning()).toBe(false);
            }
            
            // После всех циклов мониторинг должен быть остановлен
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен игнорировать повторные вызовы start() без stop()', () => {
      fc.assert(
        fc.property(
          // Генерируем количество вызовов start() (2-10)
          fc.integer({ min: 2, max: 10 }),
          (startCallCount) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            const deadCallback = vi.fn();
            
            heartbeatMonitor.onDead(deadCallback);
            
            // Вызываем start() несколько раз
            for (let i = 0; i < startCallCount; i++) {
              heartbeatMonitor.start();
            }
            
            // Мониторинг должен быть запущен
            expect(heartbeatMonitor.getIsRunning()).toBe(true);
            
            // Продвигаем время до мёртвого соединения
            vi.advanceTimersByTime(TIMEOUTS.CLIENT_DEAD_CONNECTION + 1000);
            
            // Callback должен быть вызван только один раз (не несколько раз из-за множественных start())
            expect(deadCallback).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать stop() без предварительного start()', () => {
      fc.assert(
        fc.property(
          // Генерируем количество вызовов stop() без start() (1-5)
          fc.integer({ min: 1, max: 5 }),
          (stopCallCount) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            
            // Вызываем stop() без start()
            for (let i = 0; i < stopCallCount; i++) {
              expect(() => heartbeatMonitor.stop()).not.toThrow();
              expect(heartbeatMonitor.getIsRunning()).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен останавливать проверки независимо от состояния isAlive', () => {
      fc.assert(
        fc.property(
          // Генерируем, будет ли соединение живым при остановке
          fc.boolean(),
          (shouldBeAlive) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            const deadCallback = vi.fn();
            
            heartbeatMonitor.onDead(deadCallback);
            heartbeatMonitor.start();
            
            if (shouldBeAlive) {
              // Обновляем время, чтобы соединение было живым
              heartbeatMonitor.updateLastMessageTime();
            } else {
              // Не обновляем время, чтобы соединение стало мёртвым
              vi.advanceTimersByTime(TIMEOUTS.CLIENT_DEAD_CONNECTION + 1000);
            }
            
            // Останавливаем мониторинг
            heartbeatMonitor.stop();
            
            // Сбрасываем счётчик
            deadCallback.mockClear();
            
            // Продвигаем время далеко вперёд
            vi.advanceTimersByTime(TIMEOUTS.CLIENT_DEAD_CONNECTION * 2);
            
            // Callback НЕ должен быть вызван после остановки
            expect(deadCallback).not.toHaveBeenCalled();
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Дополнительные property-based тесты для проверки корректности работы
   */
  describe('Дополнительные свойства HeartbeatMonitor', () => {
    it('должен вызывать deadCallback только когда соединение действительно мёртвое', () => {
      fc.assert(
        fc.property(
          // Генерируем интервалы обновления времени (в миллисекундах)
          fc.array(
            fc.integer({ min: 1000, max: 30_000 }),
            { minLength: 1, maxLength: 10 }
          ),
          (updateIntervals) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            const deadCallback = vi.fn();
            
            heartbeatMonitor.onDead(deadCallback);
            heartbeatMonitor.start();
            
            let totalTime = 0;
            
            updateIntervals.forEach((interval) => {
              // Продвигаем время
              vi.advanceTimersByTime(interval);
              totalTime += interval;
              
              // Обновляем время последнего сообщения
              heartbeatMonitor.updateLastMessageTime();
              
              // Если общее время меньше CLIENT_DEAD_CONNECTION, callback не должен вызываться
              if (totalTime < TIMEOUTS.CLIENT_DEAD_CONNECTION) {
                expect(deadCallback).not.toHaveBeenCalled();
              }
              
              // Сбрасываем общее время после обновления
              totalTime = 0;
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно определять isAlive() в зависимости от времени', () => {
      fc.assert(
        fc.property(
          // Генерируем время с последнего сообщения (0-120 секунд)
          fc.integer({ min: 0, max: 120_000 }),
          (timeSinceLastMessage) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            
            heartbeatMonitor.start();
            heartbeatMonitor.updateLastMessageTime();
            
            // Продвигаем время
            vi.advanceTimersByTime(timeSinceLastMessage);
            
            // isAlive должен возвращать true только если время < CLIENT_DEAD_CONNECTION
            const expectedAlive = timeSinceLastMessage < TIMEOUTS.CLIENT_DEAD_CONNECTION;
            expect(heartbeatMonitor.isAlive()).toBe(expectedAlive);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен обновлять lastMessageTime при каждом вызове updateLastMessageTime()', () => {
      fc.assert(
        fc.property(
          // Генерируем количество обновлений (1-20)
          fc.integer({ min: 1, max: 20 }),
          (updateCount) => {
            const heartbeatMonitor = new HeartbeatMonitor();
            
            heartbeatMonitor.start();
            
            let previousTime: Date | null = null;
            
            for (let i = 0; i < updateCount; i++) {
              // Продвигаем время на 1 секунду
              vi.advanceTimersByTime(1000);
              
              // Обновляем время
              heartbeatMonitor.updateLastMessageTime();
              
              const currentTime = heartbeatMonitor.getLastMessageTime();
              
              // Время должно быть обновлено
              expect(currentTime).not.toBeNull();
              
              // Время должно быть больше или равно предыдущему
              if (previousTime) {
                expect(currentTime!.getTime()).toBeGreaterThanOrEqual(previousTime.getTime());
              }
              
              previousTime = currentTime;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
