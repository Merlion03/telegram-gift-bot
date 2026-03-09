/**
 * Property-based тесты для NotificationRouter
 * 
 * Проверяет универсальные свойства корректности маршрутизации уведомлений
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { NotificationRouter } from '../NotificationRouter';
import { SubscriptionRegistry } from '../SubscriptionRegistry';
import { ConnectionHandler } from '../ConnectionHandler';
import { AuthenticationHandler } from '../AuthenticationHandler';
import type {
  ServerMessage,
  SubscriptionConfirmedMessage,
  NewMessageMessage,
  StatusChangeMessage,
  TypeChangeMessage,
} from '../../types';

/**
 * Генератор для sessionId
 */
const sessionIdArbitrary = fc.integer({ min: 1, max: 1000 });

/**
 * Генератор для sender_type
 */
const senderTypeArbitrary = fc.constantFrom<'user' | 'admin'>('user', 'admin');

/**
 * Генератор для текста сообщения
 */
const messageTextArbitrary = fc.string({ minLength: 1, maxLength: 500 });

/**
 * Генератор для статуса сессии
 */
const sessionStatusArbitrary = fc.constantFrom(
  'open',
  'in_progress',
  'resolved',
  'closed'
);

/**
 * Генератор для типа сессии
 */
const sessionTypeArbitrary = fc.constantFrom(
  'question',
  'issue',
  'feedback',
  'other'
);

/**
 * Генератор для payload нового сообщения
 */
const newMessagePayloadArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  session_id: sessionIdArbitrary,
  sender_type: senderTypeArbitrary,
  message_text: messageTextArbitrary,
  created_at: fc.date().map(d => d.toISOString()),
  is_read: fc.boolean(),
});

/**
 * Генератор для payload изменения статуса
 */
const statusChangePayloadArbitrary = fc.record({
  session_id: sessionIdArbitrary,
  old_status: sessionStatusArbitrary,
  new_status: sessionStatusArbitrary,
});

/**
 * Генератор для payload изменения типа
 */
const typeChangePayloadArbitrary = fc.record({
  session_id: sessionIdArbitrary,
  old_type: sessionTypeArbitrary,
  new_type: sessionTypeArbitrary,
});

describe('NotificationRouter - Property-Based Tests', () => {
  let notificationRouter: NotificationRouter;
  let subscriptionRegistry: SubscriptionRegistry;
  let connectionHandler: ConnectionHandler;
  let authHandler: AuthenticationHandler;

  beforeEach(() => {
    subscriptionRegistry = new SubscriptionRegistry();
    authHandler = new AuthenticationHandler('test-secret-key');
    connectionHandler = new ConnectionHandler(authHandler);
    notificationRouter = new NotificationRouter(
      subscriptionRegistry,
      connectionHandler
    );
  });

  /**
   * Property 21: Subscription round-trip с уведомлениями
   * 
   * Для любой валидной подписки, последовательность:
   * subscribe → subscription_confirmed → получение уведомления (при наличии событий)
   * должна работать корректно.
   * 
   * Feature: websocket-architecture-refactor, Property 21
   * Validates: Requirements 14.2
   */
  describe('Property 21: Subscription round-trip с уведомлениями', () => {
    it('должен корректно маршрутизировать уведомления подписчикам session канала', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdArbitrary,
          newMessagePayloadArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          async (sessionId, messagePayload, rawClientIds) => {
            // Делаем clientIds уникальными, добавляя индекс
            const clientIds = rawClientIds.map((id, index) => `${id}_${index}`);
            
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            // Создаём mock ConnectionHandler с отслеживанием вызовов
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Шаг 1: Подписываем клиентов на канал session_*
            const channel = `session_${sessionId}`;
            const subscriptionIds: string[] = [];
            
            clientIds.forEach((clientId) => {
              const subscriptionId = `sub_${clientId}_${Date.now()}_${Math.random()}`;
              subscriptionIds.push(subscriptionId);
              
              registry.add({
                clientId,
                subscriptionId,
                channel,
                sessionId,
              });
            });
            
            // Проверяем, что все клиенты подписаны
            const subscribers = registry.getSubscribers(channel);
            expect(subscribers.size).toBe(clientIds.length);
            
            // Шаг 2: Отправляем уведомление через NotificationRouter
            const payload = JSON.stringify({
              ...messagePayload,
              session_id: sessionId, // Убеждаемся, что sessionId совпадает
            });
            
            await router.handleNotification(channel, payload);
            
            // Шаг 3: Проверяем, что уведомление отправлено всем подписчикам
            expect(sendToClientMock).toHaveBeenCalledTimes(clientIds.length);
            
            // Проверяем, что каждый клиент получил правильное сообщение
            clientIds.forEach((clientId) => {
              expect(sendToClientMock).toHaveBeenCalledWith(
                clientId,
                expect.objectContaining({
                  type: 'new_message',
                  data: expect.objectContaining({
                    session_id: sessionId,
                    sender_type: messagePayload.sender_type,
                    message_text: messagePayload.message_text,
                  }),
                })
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно маршрутизировать уведомления подписчикам all_messages канала', async () => {
      await fc.assert(
        fc.asyncProperty(
          newMessagePayloadArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          async (messagePayload, clientIds) => {
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Подписываем клиентов на канал all_messages
            const channel = 'all_messages';
            
            clientIds.forEach((clientId) => {
              const subscriptionId = `sub_${clientId}_${Date.now()}_${Math.random()}`;
              
              registry.add({
                clientId,
                subscriptionId,
                channel,
              });
            });
            
            // Отправляем уведомление
            const payload = JSON.stringify(messagePayload);
            await router.handleNotification(channel, payload);
            
            // Проверяем, что уведомление отправлено всем подписчикам
            expect(sendToClientMock).toHaveBeenCalledTimes(clientIds.length);
            
            clientIds.forEach((clientId) => {
              expect(sendToClientMock).toHaveBeenCalledWith(
                clientId,
                expect.objectContaining({
                  type: 'new_message',
                  data: expect.objectContaining({
                    id: messagePayload.id,
                    session_id: messagePayload.session_id,
                  }),
                })
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно маршрутизировать status_change уведомления', async () => {
      await fc.assert(
        fc.asyncProperty(
          statusChangePayloadArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          async (statusPayload, clientIds) => {
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Подписываем клиентов на канал status_changes
            const channel = 'status_changes';
            
            clientIds.forEach((clientId) => {
              const subscriptionId = `sub_${clientId}_${Date.now()}_${Math.random()}`;
              
              registry.add({
                clientId,
                subscriptionId,
                channel,
              });
            });
            
            // Отправляем уведомление об изменении статуса
            const payload = JSON.stringify(statusPayload);
            await router.handleNotification(channel, payload);
            
            // Проверяем, что уведомление отправлено всем подписчикам
            expect(sendToClientMock).toHaveBeenCalledTimes(clientIds.length);
            
            clientIds.forEach((clientId) => {
              expect(sendToClientMock).toHaveBeenCalledWith(
                clientId,
                expect.objectContaining({
                  type: 'status_change',
                  sessionId: statusPayload.session_id,
                  oldStatus: statusPayload.old_status,
                  newStatus: statusPayload.new_status,
                })
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно маршрутизировать type_change уведомления', async () => {
      await fc.assert(
        fc.asyncProperty(
          typeChangePayloadArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          async (typePayload, clientIds) => {
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Подписываем клиентов на канал type_changes
            const channel = 'type_changes';
            
            clientIds.forEach((clientId) => {
              const subscriptionId = `sub_${clientId}_${Date.now()}_${Math.random()}`;
              
              registry.add({
                clientId,
                subscriptionId,
                channel,
              });
            });
            
            // Отправляем уведомление об изменении типа
            const payload = JSON.stringify(typePayload);
            await router.handleNotification(channel, payload);
            
            // Проверяем, что уведомление отправлено всем подписчикам
            expect(sendToClientMock).toHaveBeenCalledTimes(clientIds.length);
            
            clientIds.forEach((clientId) => {
              expect(sendToClientMock).toHaveBeenCalledWith(
                clientId,
                expect.objectContaining({
                  type: 'type_change',
                  sessionId: typePayload.session_id,
                  oldType: typePayload.old_type,
                  newType: typePayload.new_type,
                })
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен отправлять уведомления клиентам, не подписанным на канал', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdArbitrary,
          newMessagePayloadArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
          async (sessionId, messagePayload, clientIds) => {
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Подписываем только первого клиента
            const subscribedClientId = clientIds[0];
            const channel = `session_${sessionId}`;
            
            registry.add({
              clientId: subscribedClientId,
              subscriptionId: `sub_${subscribedClientId}`,
              channel,
              sessionId,
            });
            
            // Отправляем уведомление
            const payload = JSON.stringify({
              ...messagePayload,
              session_id: sessionId,
            });
            
            await router.handleNotification(channel, payload);
            
            // Проверяем, что уведомление отправлено только подписанному клиенту
            expect(sendToClientMock).toHaveBeenCalledTimes(1);
            expect(sendToClientMock).toHaveBeenCalledWith(
              subscribedClientId,
              expect.any(Object)
            );
            
            // Проверяем, что другие клиенты НЕ получили уведомление
            clientIds.slice(1).forEach((clientId) => {
              expect(sendToClientMock).not.toHaveBeenCalledWith(
                clientId,
                expect.any(Object)
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать невалидный JSON payload', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
            try {
              JSON.parse(s);
              return false; // Пропускаем валидный JSON
            } catch {
              return true; // Оставляем невалидный JSON
            }
          }),
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          async (invalidPayload, clientIds) => {
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Подписываем клиентов
            const channel = 'all_messages';
            clientIds.forEach((clientId) => {
              registry.add({
                clientId,
                subscriptionId: `sub_${clientId}`,
                channel,
              });
            });
            
            // Отправляем невалидный payload
            // Не должно быть исключений, router должен обработать ошибку
            await expect(
              router.handleNotification(channel, invalidPayload)
            ).resolves.not.toThrow();
            
            // Уведомления НЕ должны быть отправлены
            expect(sendToClientMock).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 } // Меньше итераций для генерации невалидного JSON
      );
    });

    it('должен корректно обрабатывать отправку уведомлений при ошибках ConnectionHandler', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdArbitrary,
          newMessagePayloadArbitrary,
          fc.array(fc.string({ minLength: 10, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 0, max: 9 }),
          async (sessionId, messagePayload, clientIds, failingIndex) => {
            const actualFailingIndex = failingIndex % clientIds.length;
            
            const registry = new SubscriptionRegistry();
            
            // Mock ConnectionHandler с ошибкой для одного клиента
            const sendToClientMock = vi.fn().mockImplementation((clientId: string) => {
              const index = clientIds.indexOf(clientId);
              return index !== actualFailingIndex; // false для одного клиента
            });
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // Подписываем всех клиентов
            const channel = `session_${sessionId}`;
            clientIds.forEach((clientId) => {
              registry.add({
                clientId,
                subscriptionId: `sub_${clientId}`,
                channel,
                sessionId,
              });
            });
            
            // Отправляем уведомление
            const payload = JSON.stringify({
              ...messagePayload,
              session_id: sessionId,
            });
            
            // Не должно быть исключений даже при ошибке отправки
            await expect(
              router.handleNotification(channel, payload)
            ).resolves.not.toThrow();
            
            // Проверяем, что попытка отправки была для всех клиентов
            expect(sendToClientMock).toHaveBeenCalledTimes(clientIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать пустой список подписчиков', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdArbitrary,
          newMessagePayloadArbitrary,
          async (sessionId, messagePayload) => {
            const registry = new SubscriptionRegistry();
            const sendToClientMock = vi.fn().mockReturnValue(true);
            
            const mockConnectionHandler = {
              sendToClient: sendToClientMock,
            } as any;
            
            const router = new NotificationRouter(registry, mockConnectionHandler);
            
            // НЕ подписываем никого
            const channel = `session_${sessionId}`;
            
            // Отправляем уведомление
            const payload = JSON.stringify({
              ...messagePayload,
              session_id: sessionId,
            });
            
            // Не должно быть исключений
            await expect(
              router.handleNotification(channel, payload)
            ).resolves.not.toThrow();
            
            // Уведомления НЕ должны быть отправлены
            expect(sendToClientMock).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
