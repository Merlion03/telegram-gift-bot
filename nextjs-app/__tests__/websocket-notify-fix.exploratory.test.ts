/**
 * Exploratory Property-Based Test для выявления бага с каналом new_message
 * 
 * КРИТИЧЕСКИ ВАЖНО: Этот тест ДОЛЖЕН ПРОВАЛИТЬСЯ на неисправленном коде
 * Провал подтверждает существование бага
 * 
 * Property 1: Fault Condition - Обработка Канала new_message
 * 
 * Цель: Выявить контрпримеры, демонстрирующие баг
 * Подход: Scoped PBT - ограничиваем property конкретными проваливающимися случаями
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { NotificationRouter } from '../lib/websocket/server/NotificationRouter';
import { SubscriptionRegistry } from '../lib/websocket/server/SubscriptionRegistry';
import { ConnectionHandler } from '../lib/websocket/server/ConnectionHandler';
import type { ServerMessage, NewMessageMessage } from '../lib/websocket/types';

describe('Property 1: Fault Condition - Обработка Канала new_message', () => {
  let subscriptionRegistry: SubscriptionRegistry;
  let connectionHandler: ConnectionHandler;
  let notificationRouter: NotificationRouter;
  let sentMessages: Map<string, ServerMessage[]>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Инициализация компонентов
    subscriptionRegistry = new SubscriptionRegistry();
    sentMessages = new Map();

    // Мок ConnectionHandler с отслеживанием отправленных сообщений
    connectionHandler = {
      sendToClient: vi.fn((clientId: string, message: ServerMessage) => {
        if (!sentMessages.has(clientId)) {
          sentMessages.set(clientId, []);
        }
        sentMessages.get(clientId)!.push(message);
        return true;
      }),
    } as any;

    notificationRouter = new NotificationRouter(subscriptionRegistry, connectionHandler);

    // Перехватываем console.warn для проверки логирования
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  /**
   * Тест 1: Проверка, что createMessageFromPayload() возвращает null для канала new_message
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИВАЕТСЯ (метод возвращает null вместо валидного сообщения)
   */
  it('должен обрабатывать канал new_message и создавать NewMessageMessage', () => {
    // Генерируем валидный payload от триггера PostgreSQL
    const triggerPayload = {
      operation: 'INSERT',
      table: 'support_messages',
      session_id: 5,
      message_id: 123,
      data: {
        id: 123,
        session_id: 5,
        telegram_id: 987654321,
        message_type: 'text',
        message_text: 'Привет',
        file_id: null,
        created_at: '2024-01-15T10:30:00Z',
        delivered: false,
      },
    };

    // Вызываем приватный метод через handleNotification
    const channel = 'new_message';
    const payloadStr = JSON.stringify(triggerPayload);

    // Выполняем обработку уведомления
    notificationRouter.handleNotification(channel, payloadStr);

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (после исправления):
    // - createMessageFromPayload() должен вернуть валидное NewMessageMessage
    // - НЕ должно быть предупреждения "Неизвестный канал: new_message"
    
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (на неисправленном коде):
    // - createMessageFromPayload() возвращает null
    // - Логируется предупреждение "Неизвестный канал: new_message"

    // Проверяем, что НЕ было предупреждения о неизвестном канале
    const unknownChannelWarnings = consoleWarnSpy.mock.calls.filter(
      call => call[0]?.includes('Неизвестный канал') && call[0]?.includes('new_message')
    );
    
    expect(unknownChannelWarnings.length).toBe(0);
  });

  /**
   * Тест 2: Проверка маршрутизации к подписчикам session_*
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИВАЕТСЯ (клиент НЕ получает уведомление)
   */
  it('должен маршрутизировать уведомления из new_message к подписчикам session_*', async () => {
    // Подписываем клиента на session_5
    const clientId = 'test-client-1';
    subscriptionRegistry.add({
      clientId,
      subscriptionId: 'sub-1',
      channel: 'session_5',
      sessionId: 5,
    });

    // Генерируем уведомление для session_id: 5
    const triggerPayload = {
      operation: 'INSERT',
      table: 'support_messages',
      session_id: 5,
      message_id: 456,
      data: {
        id: 456,
        session_id: 5,
        telegram_id: 111222333,
        message_type: 'text',
        message_text: 'Тестовое сообщение',
        file_id: null,
        created_at: '2024-01-15T11:00:00Z',
        delivered: false,
      },
    };

    // Отправляем уведомление в канал new_message
    await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (после исправления):
    // - Клиент должен получить уведомление типа 'new_message'
    
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (на неисправленном коде):
    // - Клиент НЕ получает уведомление (sentMessages пустой)

    const clientMessages = sentMessages.get(clientId) || [];
    const newMessageMessages = clientMessages.filter(msg => msg.type === 'new_message');

    expect(newMessageMessages.length).toBeGreaterThan(0);
    
    if (newMessageMessages.length > 0) {
      const message = newMessageMessages[0] as NewMessageMessage;
      expect(message.data.session_id).toBe(5);
      expect(message.data.message_text).toBe('Тестовое сообщение');
    }
  });

  /**
   * Тест 3: Проверка маршрутизации к подписчикам all_messages
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИВАЕТСЯ (клиент НЕ получает уведомление)
   */
  it('должен маршрутизировать уведомления из new_message к подписчикам all_messages', async () => {
    // Подписываем клиента на all_messages
    const clientId = 'test-client-2';
    subscriptionRegistry.add({
      clientId,
      subscriptionId: 'sub-2',
      channel: 'all_messages',
    });

    // Генерируем уведомление для любой сессии
    const triggerPayload = {
      operation: 'INSERT',
      table: 'support_messages',
      session_id: 10,
      message_id: 789,
      data: {
        id: 789,
        session_id: 10,
        telegram_id: 444555666,
        message_type: 'text',
        message_text: 'Сообщение для all_messages',
        file_id: null,
        created_at: '2024-01-15T12:00:00Z',
        delivered: false,
      },
    };

    // Отправляем уведомление в канал new_message
    await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (после исправления):
    // - Клиент должен получить уведомление типа 'new_message'
    
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (на неисправленном коде):
    // - Клиент НЕ получает уведомление

    const clientMessages = sentMessages.get(clientId) || [];
    const newMessageMessages = clientMessages.filter(msg => msg.type === 'new_message');

    expect(newMessageMessages.length).toBeGreaterThan(0);
    
    if (newMessageMessages.length > 0) {
      const message = newMessageMessages[0] as NewMessageMessage;
      expect(message.data.session_id).toBe(10);
      expect(message.data.message_text).toBe('Сообщение для all_messages');
    }
  });

  /**
   * Property-Based Test: Генерация множества случайных уведомлений
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИВАЕТСЯ для всех сгенерированных случаев
   */
  test.prop([
    fc.record({
      session_id: fc.integer({ min: 1, max: 1000 }),
      message_id: fc.integer({ min: 1, max: 100000 }),
      telegram_id: fc.option(fc.integer({ min: 100000000, max: 999999999 }), { nil: null }),
      message_text: fc.string({ minLength: 1, maxLength: 500 }),
      created_at: fc.date().map(d => d.toISOString()),
    }),
  ])('должен обрабатывать любое валидное уведомление в канал new_message', async (testData) => {
    // Подготовка: подписываем клиента на соответствующий канал
    const clientId = `test-client-${testData.session_id}`;
    subscriptionRegistry.add({
      clientId,
      subscriptionId: `sub-${testData.session_id}`,
      channel: `session_${testData.session_id}`,
      sessionId: testData.session_id,
    });

    // Генерируем payload от триггера
    const triggerPayload = {
      operation: 'INSERT',
      table: 'support_messages',
      session_id: testData.session_id,
      message_id: testData.message_id,
      data: {
        id: testData.message_id,
        session_id: testData.session_id,
        telegram_id: testData.telegram_id,
        message_type: 'text',
        message_text: testData.message_text,
        file_id: null,
        created_at: testData.created_at,
        delivered: false,
      },
    };

    // Отправляем уведомление
    await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: клиент получает уведомление
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: клиент НЕ получает уведомление
    const clientMessages = sentMessages.get(clientId) || [];
    const newMessageMessages = clientMessages.filter(msg => msg.type === 'new_message');

    expect(newMessageMessages.length).toBeGreaterThan(0);
  });

  /**
   * Тест 4: Проверка одновременной маршрутизации к session_* и all_messages
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИВАЕТСЯ (оба клиента НЕ получают уведомление)
   */
  it('должен маршрутизировать одно уведомление к нескольким подписчикам', async () => {
    // Подписываем клиента 1 на session_7
    const client1Id = 'test-client-session';
    subscriptionRegistry.add({
      clientId: client1Id,
      subscriptionId: 'sub-session',
      channel: 'session_7',
      sessionId: 7,
    });

    // Подписываем клиента 2 на all_messages
    const client2Id = 'test-client-all';
    subscriptionRegistry.add({
      clientId: client2Id,
      subscriptionId: 'sub-all',
      channel: 'all_messages',
    });

    // Генерируем уведомление для session_id: 7
    const triggerPayload = {
      operation: 'INSERT',
      table: 'support_messages',
      session_id: 7,
      message_id: 999,
      data: {
        id: 999,
        session_id: 7,
        telegram_id: 777888999,
        message_type: 'text',
        message_text: 'Сообщение для двух подписчиков',
        file_id: null,
        created_at: '2024-01-15T13:00:00Z',
        delivered: false,
      },
    };

    // Отправляем уведомление
    await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (после исправления):
    // - Оба клиента должны получить уведомление
    
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (на неисправленном коде):
    // - Оба клиента НЕ получают уведомление

    const client1Messages = sentMessages.get(client1Id) || [];
    const client2Messages = sentMessages.get(client2Id) || [];

    expect(client1Messages.filter(msg => msg.type === 'new_message').length).toBeGreaterThan(0);
    expect(client2Messages.filter(msg => msg.type === 'new_message').length).toBeGreaterThan(0);
  });
});
