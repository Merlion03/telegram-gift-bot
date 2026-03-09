/**
 * Property-based тесты для StateManager
 * 
 * Проверяет универсальные свойства корректности управления состоянием
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { StateManager } from '../StateManager';
import type { ConnectionState } from '../../types';

describe('StateManager - Property-Based Tests', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  /**
   * Property 17: Уведомление при изменении состояния
   * 
   * Для любого изменения connectionState в StateManager,
   * все зарегистрированные обработчики onChange должны быть вызваны с новым состоянием.
   * 
   * Feature: websocket-architecture-refactor, Property 17
   * Validates: Requirements 7.2
   */
  describe('Property 17: Уведомление при изменении состояния', () => {
    it('должен вызывать все зарегистрированные обработчики при изменении состояния', () => {
      fc.assert(
        fc.property(
          // Генерируем последовательность изменений состояния
          fc.array(
            fc.constantFrom<ConnectionState>(
              'disconnected',
              'connecting',
              'connected',
              'reconnecting'
            ),
            { minLength: 1, maxLength: 20 }
          ),
          // Генерируем количество обработчиков (1-10)
          fc.integer({ min: 1, max: 10 }),
          (stateSequence, listenerCount) => {
            const manager = new StateManager();
            
            // Создаём массив для отслеживания вызовов каждого обработчика
            const callTrackers = Array.from({ length: listenerCount }, () => ({
              calls: [] as ConnectionState[],
            }));
            
            // Регистрируем обработчики
            callTrackers.forEach((tracker) => {
              manager.onChange((state) => {
                tracker.calls.push(state);
              });
            });
            
            // Применяем последовательность изменений состояния
            let previousState: ConnectionState = manager.getState(); // Начальное состояние
            const expectedCalls: ConnectionState[] = [];
            
            stateSequence.forEach((newState) => {
              // Пропускаем, если состояние не изменилось
              if (previousState === newState) {
                return;
              }
              
              manager.setState(newState);
              expectedCalls.push(newState);
              previousState = newState;
            });
            
            // Проверяем, что все обработчики получили все изменения
            callTrackers.forEach((tracker) => {
              expect(tracker.calls).toEqual(expectedCalls);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен вызывать обработчики если состояние не изменилось', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<ConnectionState>(
            'disconnected',
            'connecting',
            'connected',
            'reconnecting'
          ),
          fc.integer({ min: 2, max: 10 }),
          (state, repeatCount) => {
            const manager = new StateManager();
            let callCount = 0;
            
            manager.onChange(() => {
              callCount++;
            });
            
            // Устанавливаем состояние первый раз (только если оно отличается от начального)
            const initialState = manager.getState();
            manager.setState(state);
            const expectedFirstCall = state !== initialState ? 1 : 0;
            expect(callCount).toBe(expectedFirstCall);
            
            // Пытаемся установить то же состояние несколько раз
            for (let i = 0; i < repeatCount; i++) {
              manager.setState(state);
            }
            
            // Обработчик должен быть вызван только один раз (если состояние изменилось)
            expect(callCount).toBe(expectedFirstCall);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать отписку обработчиков', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom<ConnectionState>(
              'disconnected',
              'connecting',
              'connected',
              'reconnecting'
            ),
            { minLength: 2, maxLength: 10 }
          ),
          (stateSequence) => {
            const manager = new StateManager();
            let callCount = 0;
            
            // Регистрируем обработчик и получаем функцию отписки
            const unsubscribe = manager.onChange(() => {
              callCount++;
            });
            
            // Устанавливаем первое состояние (только если оно отличается от начального)
            const initialState = manager.getState();
            if (stateSequence[0] !== initialState) {
              manager.setState(stateSequence[0]);
              expect(callCount).toBe(1);
            } else {
              // Если первое состояние совпадает с начальным, пропускаем его
              expect(callCount).toBe(0);
            }
            
            // Отписываемся
            unsubscribe();
            
            const callCountAfterUnsubscribe = callCount;
            
            // Устанавливаем остальные состояния
            for (let i = 1; i < stateSequence.length; i++) {
              if (stateSequence[i] !== stateSequence[i - 1]) {
                manager.setState(stateSequence[i]);
              }
            }
            
            // Обработчик не должен быть вызван после отписки
            expect(callCount).toBe(callCountAfterUnsubscribe);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен изолировать ошибки в обработчиках', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<ConnectionState>(
            'disconnected',
            'connecting',
            'connected',
            'reconnecting'
          ),
          (state) => {
            const manager = new StateManager();
            const workingListenerCalls: ConnectionState[] = [];
            
            // Первый обработчик выбрасывает ошибку
            manager.onChange(() => {
              throw new Error('Test error');
            });
            
            // Второй обработчик работает нормально
            manager.onChange((newState) => {
              workingListenerCalls.push(newState);
            });
            
            // Подавляем вывод ошибок в консоль для теста
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            // Устанавливаем состояние (только если оно отличается от начального)
            const initialState = manager.getState();
            if (state !== initialState) {
              manager.setState(state);
              
              // Второй обработчик должен быть вызван несмотря на ошибку в первом
              expect(workingListenerCalls).toEqual([state]);
            } else {
              // Если состояние не изменилось, обработчики не вызываются
              expect(workingListenerCalls).toEqual([]);
            }
            
            consoleErrorSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 18: Согласованность isConnected() с состояниями
   * 
   * Для любого момента времени, метод isConnected() должен возвращать true
   * ТОЛЬКО когда connectionState === 'connected' И ws.readyState === WebSocket.OPEN.
   * 
   * Feature: websocket-architecture-refactor, Property 18
   * Validates: Requirements 7.5, 7.6
   */
  describe('Property 18: Согласованность isConnected() с состояниями', () => {
    it('должен возвращать true только когда state=connected И ws.readyState=OPEN', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<ConnectionState>(
            'disconnected',
            'connecting',
            'connected',
            'reconnecting'
          ),
          fc.constantFrom(
            WebSocket.CONNECTING,
            WebSocket.OPEN,
            WebSocket.CLOSING,
            WebSocket.CLOSED
          ),
          (state, readyState) => {
            const manager = new StateManager();
            
            // Создаём mock WebSocket с нужным readyState
            const mockWs = {
              readyState,
            } as WebSocket;
            
            manager.setWebSocket(mockWs);
            manager.setState(state);
            
            // isConnected должен возвращать true ТОЛЬКО когда оба условия выполнены
            const expectedResult = state === 'connected' && readyState === WebSocket.OPEN;
            expect(manager.isConnected()).toBe(expectedResult);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен возвращать false если WebSocket не установлен', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<ConnectionState>(
            'disconnected',
            'connecting',
            'connected',
            'reconnecting'
          ),
          (state) => {
            const manager = new StateManager();
            
            // Не устанавливаем WebSocket (или устанавливаем null)
            manager.setWebSocket(null);
            manager.setState(state);
            
            // isConnected всегда должен возвращать false без WebSocket
            expect(manager.isConnected()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен синхронизировать состояние с изменениями WebSocket readyState', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              state: fc.constantFrom<ConnectionState>(
                'disconnected',
                'connecting',
                'connected',
                'reconnecting'
              ),
              readyState: fc.constantFrom(
                WebSocket.CONNECTING,
                WebSocket.OPEN,
                WebSocket.CLOSING,
                WebSocket.CLOSED
              ),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (stateChanges) => {
            const manager = new StateManager();
            
            stateChanges.forEach(({ state, readyState }) => {
              // Создаём новый mock WebSocket для каждого изменения
              const mockWs = {
                readyState,
              } as WebSocket;
              
              manager.setWebSocket(mockWs);
              manager.setState(state);
              
              // Проверяем согласованность
              const expectedResult = state === 'connected' && readyState === WebSocket.OPEN;
              expect(manager.isConnected()).toBe(expectedResult);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать переходы между состояниями', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.constantFrom<ConnectionState>(
              'disconnected',
              'connecting',
              'connected',
              'reconnecting'
            ),
            { minLength: 2, maxLength: 10 }
          ),
          (stateSequence) => {
            const manager = new StateManager();
            
            // Создаём WebSocket с readyState = OPEN
            const mockWs = {
              readyState: WebSocket.OPEN,
            } as WebSocket;
            
            manager.setWebSocket(mockWs);
            
            stateSequence.forEach((state) => {
              manager.setState(state);
              
              // isConnected должен быть true только для состояния 'connected'
              if (state === 'connected') {
                expect(manager.isConnected()).toBe(true);
              } else {
                expect(manager.isConnected()).toBe(false);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
