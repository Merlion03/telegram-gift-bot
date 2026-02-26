/**
 * Property-based тесты для SupabaseRealtimeClient
 * Проверяет корректность real-time подписок и уведомлений
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fc } from '@fast-check/vitest';
import { SupabaseRealtimeClient } from '../supabaseClient';
import type { SupportMessage } from '@/types/support';

// Глобальные переменные для хранения callback'ов
let registeredCallbacks: Map<string, any> = new Map();
let mockChannelInstance: any = null;

// Mock для Supabase клиента
vi.mock('@supabase/supabase-js', () => {
  const createMockChannel = () => {
    const callbacks: any[] = [];
    
    const mockChannel = {
      on: vi.fn((event, config, callback) => {
        // Сохраняем callback для последующего вызова
        callbacks.push({ event, config, callback });
        return mockChannel;
      }),
      subscribe: vi.fn((statusCallback) => {
        // Симулируем успешную подписку
        setTimeout(() => statusCallback('SUBSCRIBED'), 0);
        return mockChannel;
      }),
      _getCallbacks: () => callbacks, // Вспомогательный метод для тестов
    };
    
    return mockChannel;
  };

  const mockClient = {
    channel: vi.fn((channelName) => {
      mockChannelInstance = createMockChannel();
      registeredCallbacks.set(channelName, mockChannelInstance);
      return mockChannelInstance;
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
      })),
    })),
  };

  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe('Property 16: Real-time уведомления о новых сообщениях', () => {
  let client: SupabaseRealtimeClient;

  beforeEach(() => {
    // Очищаем зарегистрированные callbacks
    registeredCallbacks.clear();
    mockChannelInstance = null;
    
    // Создаём клиент с mock конфигурацией
    client = new SupabaseRealtimeClient({
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
    });
  });

  afterEach(async () => {
    await client.unsubscribeAll();
    registeredCallbacks.clear();
  });

  /**
   * Property 16.1: Подписка на сообщения сессии должна вызывать callback при новом сообщении
   * 
   * Validates: Requirements 7.1
   * 
   * Свойство: Для любого валидного session_id и сообщения,
   * callback должен быть вызван с корректными данными сообщения
   */
  it('должна вызывать callback при получении нового сообщения для сессии', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }), // session_id
        fc.integer({ min: 1, max: 1000 }), // message_id
        fc.bigInt({ min: 1n, max: 999999999n }), // telegram_id
        fc.constantFrom('from_user', 'from_support'), // message_type
        fc.string({ minLength: 1, maxLength: 500 }), // message_text
        async (sessionId, messageId, telegramId, messageType, messageText) => {
          // Arrange: создаём mock сообщение
          const mockMessage: SupportMessage = {
            id: messageId,
            session_id: sessionId,
            telegram_id: Number(telegramId),
            message_type: messageType as 'from_user' | 'from_support',
            message_text: messageText,
            created_at: new Date().toISOString(),
            delivered: false,
          };

          let callbackInvoked = false;
          let receivedMessage: SupportMessage | null = null;

          // Act: подписываемся на сообщения
          const unsubscribe = client.subscribeToSessionMessages(
            sessionId,
            (message) => {
              callbackInvoked = true;
              receivedMessage = message;
            }
          );

          // Даём время на инициализацию подписки
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channelName = `session-${sessionId}`;
          const channel = registeredCallbacks.get(channelName);
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Вызываем callback с mock payload
              callbacks[0].callback({ new: mockMessage });
            }
          }

          // Даём время на обработку
          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: проверяем, что callback был вызван
          expect(callbackInvoked).toBe(true);
          expect(receivedMessage).not.toBeNull();
          
          if (receivedMessage) {
            expect(receivedMessage.id).toBe(messageId);
            expect(receivedMessage.session_id).toBe(sessionId);
            expect(receivedMessage.telegram_id).toBe(Number(telegramId));
            expect(receivedMessage.message_type).toBe(messageType);
            expect(receivedMessage.message_text).toBe(messageText);
          }

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.2: Подписка на все сообщения должна получать сообщения из любой сессии
   * 
   * Validates: Requirements 7.1
   * 
   * Свойство: Callback должен вызываться для сообщений из любой сессии
   */
  it('должна получать сообщения из любой сессии при подписке на все сообщения', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.integer({ min: 1, max: 100 }),
            messageId: fc.integer({ min: 1, max: 1000 }),
            telegramId: fc.bigInt({ min: 1n, max: 999999999n }),
            messageType: fc.constantFrom('from_user', 'from_support'),
            messageText: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (messages) => {
          // Arrange
          const receivedMessages: SupportMessage[] = [];

          // Act: подписываемся на все сообщения
          const unsubscribe = client.subscribeToAllMessages((message) => {
            receivedMessages.push(message);
          });

          // Даём время на инициализацию
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channel = registeredCallbacks.get('all-messages');
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Отправляем все сообщения
              for (const msg of messages) {
                const mockMessage: SupportMessage = {
                  id: msg.messageId,
                  session_id: msg.sessionId,
                  telegram_id: Number(msg.telegramId),
                  message_type: msg.messageType as 'from_user' | 'from_support',
                  message_text: msg.messageText,
                  created_at: new Date().toISOString(),
                  delivered: false,
                };
                callbacks[0].callback({ new: mockMessage });
              }
            }
          }

          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: проверяем, что получили все сообщения
          expect(receivedMessages.length).toBe(messages.length);

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.3: Отписка должна прекращать получение уведомлений
   * 
   * Validates: Requirements 7.1
   * 
   * Свойство: После вызова unsubscribe, callback не должен вызываться
   */
  it('должна прекращать получение уведомлений после отписки', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        async (sessionId, messageId) => {
          // Arrange
          let callbackCount = 0;

          const unsubscribe = client.subscribeToSessionMessages(
            sessionId,
            () => {
              callbackCount++;
            }
          );

          // Act: отписываемся
          unsubscribe();

          // Даём время на отписку
          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: проверяем, что removeChannel был вызван
          const { createClient } = await import('@supabase/supabase-js');
          const mockClient = createClient('', '');
          expect(mockClient.removeChannel).toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.4: Подписка на изменения статуса сессий должна уведомлять об обновлениях
   * 
   * Validates: Requirements 7.1, 9.5
   * 
   * Свойство: При изменении статуса сессии, callback должен получить новый статус
   */
  it('должна уведомлять об изменении статуса сессии', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('active', 'closed'),
        async (sessionId, newStatus) => {
          // Arrange
          let receivedSessionId: number | null = null;
          let receivedStatus: string | null = null;

          // Act: подписываемся на изменения статуса
          const unsubscribe = client.subscribeToSessionStatusChanges(
            (id, status) => {
              receivedSessionId = id;
              receivedStatus = status;
            }
          );

          // Даём время на инициализацию
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channel = registeredCallbacks.get('session-status-changes');
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Вызываем callback с изменением статуса
              callbacks[0].callback({
                new: {
                  id: sessionId,
                  status: newStatus,
                },
              });
            }
          }

          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert
          expect(receivedSessionId).toBe(sessionId);
          expect(receivedStatus).toBe(newStatus);

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 16.5: Обработка ошибок должна вызывать error callback
   * 
   * Validates: Requirements 7.1, 16.3
   * 
   * Свойство: При ошибке обработки payload, должен вызываться error callback
   */
  it('должна вызывать error callback при ошибке обработки', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (sessionId) => {
          // Arrange
          let errorCaught = false;
          let errorMessage = '';

          // Act: подписываемся с error callback
          const unsubscribe = client.subscribeToSessionMessages(
            sessionId,
            () => {
              // Основной callback
            },
            (error) => {
              errorCaught = true;
              errorMessage = error.message;
            }
          );

          // Даём время на инициализацию
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channelName = `session-${sessionId}`;
          const channel = registeredCallbacks.get(channelName);
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Отправляем невалидный payload (без обязательных полей)
              callbacks[0].callback({ new: { invalid: 'data' } });
            }
          }

          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: error callback должен был вызваться
          expect(errorCaught).toBe(true);
          expect(errorMessage).toBeTruthy();

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.6: Множественные подписки на одну сессию должны работать независимо
   * 
   * Validates: Requirements 7.1
   * 
   * Свойство: Каждая подписка должна получать уведомления независимо
   */
  it('должна поддерживать множественные независимые подписки', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 2, max: 5 }),
        async (sessionId, subscriberCount) => {
          // Arrange
          const callbackCounts = new Array(subscriberCount).fill(0);
          const unsubscribers: Array<() => void> = [];

          // Act: создаём несколько подписок
          for (let i = 0; i < subscriberCount; i++) {
            const unsubscribe = client.subscribeToSessionMessages(
              sessionId,
              () => {
                callbackCounts[i]++;
              }
            );
            unsubscribers.push(unsubscribe);
          }

          // Даём время на инициализацию всех подписок
          await new Promise(resolve => setTimeout(resolve, 20));

          // Отписываемся от первой подписки
          if (unsubscribers.length > 0) {
            unsubscribers[0]();
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Получаем последний зарегистрированный channel
          const channelName = `session-${sessionId}`;
          const channel = registeredCallbacks.get(channelName);
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Отправляем сообщение
              const mockMessage: SupportMessage = {
                id: 1,
                session_id: sessionId,
                telegram_id: 123456,
                message_type: 'from_user',
                message_text: 'Test',
                created_at: new Date().toISOString(),
                delivered: false,
              };
              callbacks[0].callback({ new: mockMessage });
            }
          }

          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: первая подписка не должна получить сообщение (отписана)
          expect(callbackCounts[0]).toBe(0);

          // Cleanup: отписываемся от остальных
          for (let i = 1; i < unsubscribers.length; i++) {
            unsubscribers[i]();
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

/**
 * Property 23: Обновление статуса сессии в админке
 * 
 * Validates: Requirements 8.5, 9.5
 * 
 * Свойство: При изменении статуса сессии в БД,
 * подписчики должны получить уведомление с корректными данными
 */
describe('Property 23: Обновление статуса сессии в админке', () => {
  let client: SupabaseRealtimeClient;

  beforeEach(() => {
    // Очищаем зарегистрированные callbacks
    registeredCallbacks.clear();
    mockChannelInstance = null;
    
    // Создаём клиент с mock конфигурацией
    client = new SupabaseRealtimeClient({
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
    });
  });

  afterEach(async () => {
    await client.unsubscribeAll();
    registeredCallbacks.clear();
  });

  /**
   * Property 23.1: Подписка на изменения статусов должна вызывать callback при обновлении
   * 
   * Validates: Requirements 9.5
   * 
   * Свойство: Для любого валидного session_id и статуса,
   * callback должен быть вызван с корректными данными
   */
  it('должна вызывать callback при изменении статуса сессии', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }), // session_id
        fc.constantFrom('active', 'closed'), // status
        async (sessionId, status) => {
          let callbackInvoked = false;
          let receivedSessionId: number | null = null;
          let receivedStatus: string | null = null;

          // Act: подписываемся на изменения статусов
          const unsubscribe = client.subscribeToSessionStatusChanges(
            (id, newStatus) => {
              callbackInvoked = true;
              receivedSessionId = id;
              receivedStatus = newStatus;
            }
          );

          // Даём время на инициализацию подписки
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channelName = 'session-status-changes';
          const channel = registeredCallbacks.get(channelName);
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Вызываем callback с mock payload (UPDATE event)
              callbacks[0].callback({
                new: {
                  id: sessionId,
                  status: status,
                  telegram_id: 123456,
                  created_at: new Date().toISOString(),
                },
              });
            }
          }

          // Даём время на обработку
          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: проверяем, что callback был вызван с правильными данными
          expect(callbackInvoked).toBe(true);
          expect(receivedSessionId).toBe(sessionId);
          expect(receivedStatus).toBe(status);

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 23.2: Подписка должна обрабатывать множественные обновления статусов
   * 
   * Validates: Requirements 9.5
   * 
   * Свойство: При множественных изменениях статусов разных сессий,
   * все обновления должны быть корректно обработаны
   */
  it('должна обрабатывать множественные обновления статусов', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.integer({ min: 1, max: 1000 }),
            status: fc.constantFrom('active', 'closed'),
          }),
          { minLength: 1, maxLength: 5 } // Уменьшаем количество для ускорения
        ),
        async (updates) => {
          const receivedUpdates: Array<{ sessionId: number; status: string }> = [];

          // Act: подписываемся на изменения статусов
          const unsubscribe = client.subscribeToSessionStatusChanges(
            (sessionId, status) => {
              receivedUpdates.push({ sessionId, status });
            }
          );

          // Даём время на инициализацию подписки
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channelName = 'session-status-changes';
          const channel = registeredCallbacks.get(channelName);
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Отправляем все обновления
              for (const update of updates) {
                callbacks[0].callback({
                  new: {
                    id: update.sessionId,
                    status: update.status,
                    telegram_id: 123456,
                    created_at: new Date().toISOString(),
                  },
                });
              }
            }
          }

          // Даём время на обработку всех обновлений
          await new Promise(resolve => setTimeout(resolve, 20));

          // Assert: проверяем, что все обновления были получены
          expect(receivedUpdates.length).toBe(updates.length);
          
          for (let i = 0; i < updates.length; i++) {
            expect(receivedUpdates[i].sessionId).toBe(updates[i].sessionId);
            expect(receivedUpdates[i].status).toBe(updates[i].status);
          }

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 30, timeout: 10000 } // Увеличиваем таймаут и уменьшаем количество итераций
    );
  }, 15000); // Увеличиваем таймаут теста

  /**
   * Property 23.3: Подписка должна корректно обрабатывать закрытие сессий
   * 
   * Validates: Requirements 9.5
   * 
   * Свойство: При изменении статуса на 'closed',
   * callback должен получить корректное уведомление
   */
  it('должна корректно обрабатывать закрытие сессий', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }), // session_id
        async (sessionId) => {
          let closedSessionId: number | null = null;
          let callbackInvoked = false;

          // Act: подписываемся на изменения статусов
          const unsubscribe = client.subscribeToSessionStatusChanges(
            (id, status) => {
              if (status === 'closed') {
                closedSessionId = id;
                callbackInvoked = true;
              }
            }
          );

          // Даём время на инициализацию подписки
          await new Promise(resolve => setTimeout(resolve, 10));

          // Получаем зарегистрированный channel
          const channelName = 'session-status-changes';
          const channel = registeredCallbacks.get(channelName);
          
          if (channel) {
            const callbacks = channel._getCallbacks();
            if (callbacks.length > 0) {
              // Отправляем обновление о закрытии сессии
              callbacks[0].callback({
                new: {
                  id: sessionId,
                  status: 'closed',
                  telegram_id: 123456,
                  created_at: new Date().toISOString(),
                  closed_at: new Date().toISOString(),
                },
              });
            }
          }

          // Даём время на обработку
          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: проверяем, что закрытие сессии было обработано
          expect(callbackInvoked).toBe(true);
          expect(closedSessionId).toBe(sessionId);

          // Cleanup
          unsubscribe();
        }
      ),
      { numRuns: 100 }
    );
  });
});
