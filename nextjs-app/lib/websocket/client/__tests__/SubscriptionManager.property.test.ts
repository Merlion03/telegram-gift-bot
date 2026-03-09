/**
 * Property-based тесты для SubscriptionManager
 * 
 * Проверяет универсальные свойства корректности управления подписками
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { SubscriptionManager } from '../SubscriptionManager';
import type {
  SubscriptionType,
  ServerMessage,
  SubscribeMessage,
  SubscriptionConfirmedMessage,
  NewMessageMessage,
  StatusChangeMessage,
  ErrorMessage,
} from '../../types';

/**
 * Генератор для типов подписок
 */
const subscriptionTypeArbitrary = fc.constantFrom<SubscriptionType>(
  'session',
  'all',
  'status'
);

/**
 * Генератор для sessionId (опциональный)
 */
const sessionIdArbitrary = fc.option(
  fc.integer({ min: 1, max: 1000 }),
  { nil: undefined }
);

/**
 * Генератор для параметров подписки
 */
const subscriptionParamsArbitrary = fc.record({
  channel: subscriptionTypeArbitrary,
  sessionId: sessionIdArbitrary,
});

describe('SubscriptionManager - Property-Based Tests', () => {
  let subscriptionManager: SubscriptionManager;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
  });

  /**
   * Property 10: Уникальность ID подписок
   * 
   * Для любого количества подписок, все ID должны быть уникальными.
   * Даже если параметры подписок идентичны, каждая подписка получает уникальный ID.
   * 
   * Feature: websocket-architecture-refactor, Property 10
   * Validates: Requirements 5.2
   */
  describe('Property 10: Уникальность ID подписок', () => {
    it('должен генерировать уникальные ID для всех подписок', () => {
      fc.assert(
        fc.property(
          // Генерируем массив параметров подписок (1-100 подписок)
          fc.array(subscriptionParamsArbitrary, { minLength: 1, maxLength: 100 }),
          (subscriptionsParams) => {
            const manager = new SubscriptionManager();
            const subscriptionIds: string[] = [];
            
            // Создаём подписки
            subscriptionsParams.forEach((params) => {
              const id = manager.subscribe({
                channel: params.channel,
                sessionId: params.sessionId,
                onMessage: vi.fn(),
              });
              
              subscriptionIds.push(id);
            });
            
            // Проверяем уникальность всех ID
            const uniqueIds = new Set(subscriptionIds);
            expect(uniqueIds.size).toBe(subscriptionIds.length);
            
            // Проверяем, что все ID не пустые строки
            subscriptionIds.forEach(id => {
              expect(id).toBeTruthy();
              expect(typeof id).toBe('string');
              expect(id.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен генерировать уникальные ID даже для идентичных параметров', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          fc.integer({ min: 2, max: 50 }),
          (params, count) => {
            const manager = new SubscriptionManager();
            const subscriptionIds: string[] = [];
            
            // Создаём несколько подписок с одинаковыми параметрами
            for (let i = 0; i < count; i++) {
              const id = manager.subscribe({
                channel: params.channel,
                sessionId: params.sessionId,
                onMessage: vi.fn(),
              });
              
              subscriptionIds.push(id);
            }
            
            // Все ID должны быть уникальными
            const uniqueIds = new Set(subscriptionIds);
            expect(uniqueIds.size).toBe(count);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять уникальность ID при последовательных операциях subscribe/unsubscribe', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              action: fc.constantFrom<'subscribe' | 'unsubscribe'>('subscribe', 'unsubscribe'),
              params: subscriptionParamsArbitrary,
            }),
            { minLength: 10, maxLength: 50 }
          ),
          (operations) => {
            const manager = new SubscriptionManager();
            const allGeneratedIds: string[] = [];
            const activeIds: string[] = [];
            
            operations.forEach((op) => {
              if (op.action === 'subscribe') {
                const id = manager.subscribe({
                  channel: op.params.channel,
                  sessionId: op.params.sessionId,
                  onMessage: vi.fn(),
                });
                
                allGeneratedIds.push(id);
                activeIds.push(id);
              } else if (op.action === 'unsubscribe' && activeIds.length > 0) {
                // Удаляем случайную активную подписку
                const randomIndex = Math.floor(Math.random() * activeIds.length);
                const idToRemove = activeIds[randomIndex];
                manager.unsubscribe(idToRemove);
                activeIds.splice(randomIndex, 1);
              }
            });
            
            // Все когда-либо сгенерированные ID должны быть уникальными
            const uniqueIds = new Set(allGeneratedIds);
            expect(uniqueIds.size).toBe(allGeneratedIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно возвращать подписку по уникальному ID', () => {
      fc.assert(
        fc.property(
          fc.array(subscriptionParamsArbitrary, { minLength: 1, maxLength: 50 }),
          (subscriptionsParams) => {
            const manager = new SubscriptionManager();
            const subscriptions = new Map<string, typeof subscriptionsParams[0]>();
            
            // Создаём подписки и сохраняем их параметры
            subscriptionsParams.forEach((params) => {
              const id = manager.subscribe({
                channel: params.channel,
                sessionId: params.sessionId,
                onMessage: vi.fn(),
              });
              
              subscriptions.set(id, params);
            });
            
            // Проверяем, что каждая подписка доступна по своему ID
            subscriptions.forEach((params, id) => {
              const subscription = manager.get(id);
              
              expect(subscription).toBeDefined();
              expect(subscription?.id).toBe(id);
              expect(subscription?.channel).toBe(params.channel);
              expect(subscription?.sessionId).toBe(params.sessionId);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 11: Subscribe/Unsubscribe round-trip
   * 
   * Для любой подписки, последовательность subscribe → unsubscribe
   * должна вернуть систему в исходное состояние (подписка удалена).
   * 
   * Feature: websocket-architecture-refactor, Property 11
   * Validates: Requirements 5.4
   */
  describe('Property 11: Subscribe/Unsubscribe round-trip', () => {
    it('должен корректно удалять подписку после unsubscribe', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          (params) => {
            const manager = new SubscriptionManager();
            
            // Начальное состояние - нет подписок
            expect(manager.size()).toBe(0);
            
            // Создаём подписку
            const id = manager.subscribe({
              channel: params.channel,
              sessionId: params.sessionId,
              onMessage: vi.fn(),
            });
            
            // Подписка должна существовать
            expect(manager.size()).toBe(1);
            expect(manager.get(id)).toBeDefined();
            
            // Удаляем подписку
            const removed = manager.unsubscribe(id);
            
            // Подписка должна быть удалена
            expect(removed).toBe(true);
            expect(manager.size()).toBe(0);
            expect(manager.get(id)).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать множественные round-trip операции', () => {
      fc.assert(
        fc.property(
          fc.array(subscriptionParamsArbitrary, { minLength: 1, maxLength: 20 }),
          (subscriptionsParams) => {
            const manager = new SubscriptionManager();
            
            subscriptionsParams.forEach((params) => {
              const initialSize = manager.size();
              
              // Subscribe
              const id = manager.subscribe({
                channel: params.channel,
                sessionId: params.sessionId,
                onMessage: vi.fn(),
              });
              
              expect(manager.size()).toBe(initialSize + 1);
              expect(manager.get(id)).toBeDefined();
              
              // Unsubscribe
              const removed = manager.unsubscribe(id);
              
              expect(removed).toBe(true);
              expect(manager.size()).toBe(initialSize);
              expect(manager.get(id)).toBeUndefined();
            });
            
            // В конце не должно быть подписок
            expect(manager.size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен возвращать false при попытке удалить несуществующую подписку', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (fakeId) => {
            const manager = new SubscriptionManager();
            
            // Попытка удалить несуществующую подписку
            const removed = manager.unsubscribe(fakeId);
            
            expect(removed).toBe(false);
            expect(manager.size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать повторное удаление одной подписки', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          (params) => {
            const manager = new SubscriptionManager();
            
            const id = manager.subscribe({
              channel: params.channel,
              sessionId: params.sessionId,
              onMessage: vi.fn(),
            });
            
            // Первое удаление должно быть успешным
            const firstRemove = manager.unsubscribe(id);
            expect(firstRemove).toBe(true);
            expect(manager.size()).toBe(0);
            
            // Второе удаление должно вернуть false
            const secondRemove = manager.unsubscribe(id);
            expect(secondRemove).toBe(false);
            expect(manager.size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять другие подписки при удалении одной', () => {
      fc.assert(
        fc.property(
          fc.array(subscriptionParamsArbitrary, { minLength: 2, maxLength: 20 }),
          fc.integer({ min: 0, max: 19 }),
          (subscriptionsParams, indexToRemove) => {
            // Ограничиваем индекс размером массива
            const actualIndex = indexToRemove % subscriptionsParams.length;
            
            const manager = new SubscriptionManager();
            const ids: string[] = [];
            
            // Создаём все подписки
            subscriptionsParams.forEach((params) => {
              const id = manager.subscribe({
                channel: params.channel,
                sessionId: params.sessionId,
                onMessage: vi.fn(),
              });
              ids.push(id);
            });
            
            const initialSize = manager.size();
            
            // Удаляем одну подписку
            const removed = manager.unsubscribe(ids[actualIndex]);
            
            expect(removed).toBe(true);
            expect(manager.size()).toBe(initialSize - 1);
            
            // Проверяем, что остальные подписки остались
            ids.forEach((id, index) => {
              if (index === actualIndex) {
                expect(manager.get(id)).toBeUndefined();
              } else {
                expect(manager.get(id)).toBeDefined();
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 12: Вызов callback при подтверждении подписки
   * 
   * Для любой подписки с onConfirmed callback, при получении
   * subscription_confirmed сообщения callback должен быть вызван ровно один раз.
   * 
   * Feature: websocket-architecture-refactor, Property 12
   * Validates: Requirements 5.6, 14.2
   */
  describe('Property 12: Вызов callback при подтверждении подписки', () => {
    it('должен вызывать onConfirmed callback при получении subscription_confirmed', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          (params) => {
            const manager = new SubscriptionManager();
            const onConfirmedMock = vi.fn();
            
            // Создаём подписку с onConfirmed callback
            const id = manager.subscribe({
              channel: params.channel,
              sessionId: params.sessionId,
              onMessage: vi.fn(),
              onConfirmed: onConfirmedMock,
            });
            
            // Callback не должен быть вызван до подтверждения
            expect(onConfirmedMock).not.toHaveBeenCalled();
            
            // Отправляем подтверждение подписки
            const confirmMessage: SubscriptionConfirmedMessage = {
              type: 'subscription_confirmed',
              subscriptionId: id,
              channel: params.channel,
            };
            
            manager.handleMessage(confirmMessage);
            
            // Callback должен быть вызван ровно один раз
            expect(onConfirmedMock).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен вызывать onConfirmed для всех подписок с этим callback', () => {
      fc.assert(
        fc.property(
          fc.array(subscriptionParamsArbitrary, { minLength: 1, maxLength: 20 }),
          (subscriptionsParams) => {
            const manager = new SubscriptionManager();
            const callbacks = new Map<string, ReturnType<typeof vi.fn>>();
            
            // Создаём подписки с onConfirmed callbacks
            subscriptionsParams.forEach((params) => {
              const onConfirmedMock = vi.fn();
              const id = manager.subscribe({
                channel: params.channel,
                sessionId: params.sessionId,
                onMessage: vi.fn(),
                onConfirmed: onConfirmedMock,
              });
              
              callbacks.set(id, onConfirmedMock);
            });
            
            // Отправляем подтверждения для всех подписок
            callbacks.forEach((callback, id) => {
              const confirmMessage: SubscriptionConfirmedMessage = {
                type: 'subscription_confirmed',
                subscriptionId: id,
                channel: 'session', // Канал не важен для этого теста
              };
              
              manager.handleMessage(confirmMessage);
            });
            
            // Все callbacks должны быть вызваны ровно один раз
            callbacks.forEach((callback) => {
              expect(callback).toHaveBeenCalledTimes(1);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен вызывать onConfirmed при повторном подтверждении', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          fc.integer({ min: 2, max: 5 }),
          (params, repeatCount) => {
            const manager = new SubscriptionManager();
            const onConfirmedMock = vi.fn();
            
            const id = manager.subscribe({
              channel: params.channel,
              sessionId: params.sessionId,
              onMessage: vi.fn(),
              onConfirmed: onConfirmedMock,
            });
            
            const confirmMessage: SubscriptionConfirmedMessage = {
              type: 'subscription_confirmed',
              subscriptionId: id,
              channel: params.channel,
            };
            
            // Отправляем подтверждение несколько раз
            for (let i = 0; i < repeatCount; i++) {
              manager.handleMessage(confirmMessage);
            }
            
            // Callback должен быть вызван только один раз (при первом подтверждении)
            expect(onConfirmedMock).toHaveBeenCalledTimes(repeatCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен вызывать onConfirmed для подписок без этого callback', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          (params) => {
            const manager = new SubscriptionManager();
            
            // Создаём подписку БЕЗ onConfirmed callback
            const id = manager.subscribe({
              channel: params.channel,
              sessionId: params.sessionId,
              onMessage: vi.fn(),
              // onConfirmed отсутствует
            });
            
            const confirmMessage: SubscriptionConfirmedMessage = {
              type: 'subscription_confirmed',
              subscriptionId: id,
              channel: params.channel,
            };
            
            // Не должно быть ошибок при обработке подтверждения
            expect(() => {
              manager.handleMessage(confirmMessage);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен вызывать onMessage callback для соответствующих сообщений', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (sessionId) => {
            const manager = new SubscriptionManager();
            const onMessageMock = vi.fn();
            
            // Создаём подписку на конкретную сессию
            manager.subscribe({
              channel: 'session',
              sessionId: sessionId,
              onMessage: onMessageMock,
            });
            
            // Отправляем сообщение для этой сессии
            const newMessage: NewMessageMessage = {
              type: 'new_message',
              data: {
                id: 1,
                session_id: sessionId,
                sender_type: 'user',
                message_text: 'Test message',
                created_at: new Date().toISOString(),
                is_read: false,
              },
            };
            
            manager.handleMessage(newMessage);
            
            // Callback должен быть вызван с этим сообщением
            expect(onMessageMock).toHaveBeenCalledTimes(1);
            expect(onMessageMock).toHaveBeenCalledWith(newMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен вызывать onError callback при получении error сообщения', () => {
      fc.assert(
        fc.property(
          subscriptionParamsArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (params, errorCode, errorMessage) => {
            const manager = new SubscriptionManager();
            const onErrorMock = vi.fn();
            
            const id = manager.subscribe({
              channel: params.channel,
              sessionId: params.sessionId,
              onMessage: vi.fn(),
              onError: onErrorMock,
            });
            
            // Отправляем ошибку для этой подписки
            const error: ErrorMessage = {
              type: 'error',
              code: errorCode,
              message: errorMessage,
              subscriptionId: id,
            };
            
            manager.handleMessage(error);
            
            // onError callback должен быть вызван
            expect(onErrorMock).toHaveBeenCalledTimes(1);
            
            // Проверяем, что передан объект Error с правильными данными
            const calledError = onErrorMock.mock.calls[0][0];
            expect(calledError).toBeInstanceOf(Error);
            expect(calledError.message).toBe(errorMessage);
            expect(calledError.name).toBe(errorCode);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
