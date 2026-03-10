/**
 * Preservation Property-Based Tests для проверки сохранения существующего поведения
 * 
 * ВАЖНО: Следуем методологии observation-first
 * 1. Наблюдаем поведение на НЕИСПРАВЛЕННОМ коде для небагованных входных данных
 * 2. Пишем property-based тесты, фиксирующие наблюдаемые паттерны поведения
 * 
 * Property 2: Preservation - Обработка Существующих Каналов
 * 
 * Цель: Проверить, что для всех входных данных, где условие бага НЕ выполняется,
 * исправленная функция производит идентичный результат оригинальной функции
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тесты ПРОХОДЯТ на неисправленном коде
 * (подтверждают базовое поведение для сохранения)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { NotificationRouter } from '../lib/websocket/server/NotificationRouter';
import { SubscriptionRegistry } from '../lib/websocket/server/SubscriptionRegistry';
import { ConnectionHandler } from '../lib/websocket/server/ConnectionHandler';
import type { ServerMessage, StatusChangeMessage, TypeChangeMessage, NewMessageMessage } from '../lib/websocket/types';

describe('Property 2: Preservation - Обработка Существующих Каналов', () => {
  let subscriptionRegistry: SubscriptionRegistry;
  let connectionHandler: ConnectionHandler;
  let notificationRouter: NotificationRouter;
  let sentMessages: Map<string, ServerMessage[]>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Очищаем sentMessages перед каждым тестом
    sentMessages = new Map();
    
    // Инициализация компонентов
    subscriptionRegistry = new SubscriptionRegistry();

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

    // Перехватываем console для проверки логирования
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Восстанавливаем console
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ============================================================================
  // Preservation Requirement 3.1: Обработка канала session_status_change
  // ============================================================================

  describe('Preservation 3.1: Канал session_status_change', () => {
    /**
     * Наблюдение: уведомления в канал session_status_change корректно обрабатываются
     * Тест: для всех уведомлений в session_status_change результат идентичен текущему поведению
     */
    it('должен корректно обрабатывать уведомления в канал status_changes', async () => {
      // Подписываем клиента на status_changes
      const clientId = 'test-client-status';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-status',
        channel: 'status_changes',
      });

      // Генерируем валидный payload для изменения статуса
      const statusPayload = {
        session_id: 5,
        old_status: 'active',
        new_status: 'closed',
      };

      // Отправляем уведомление в канал status_changes
      await notificationRouter.handleNotification('status_changes', JSON.stringify(statusPayload));

      // Проверяем, что клиент получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      const statusMessages = clientMessages.filter(msg => msg.type === 'status_change');

      expect(statusMessages.length).toBe(1);
      
      const message = statusMessages[0] as StatusChangeMessage;
      expect(message.sessionId).toBe(5);
      expect(message.oldStatus).toBe('active');
      expect(message.newStatus).toBe('closed');
    });

    /**
     * Property-Based Test: генерация множества случайных уведомлений об изменении статуса
     */
    test.prop([
      fc.record({
        session_id: fc.integer({ min: 1, max: 1000 }),
        old_status: fc.constantFrom('active', 'pending', 'closed', 'archived'),
        new_status: fc.constantFrom('active', 'pending', 'closed', 'archived'),
      }),
    ])('должен обрабатывать любое валидное уведомление об изменении статуса', async (statusData) => {
      // Создаём уникальный clientId для каждой итерации
      const uniqueId = Math.random().toString(36).substring(7);
      const clientId = `client-status-${uniqueId}`;
      
      subscriptionRegistry.add({
        clientId,
        subscriptionId: `sub-status-${uniqueId}`,
        channel: 'status_changes',
      });

      // Отправляем уведомление
      await notificationRouter.handleNotification('status_changes', JSON.stringify(statusData));

      // Проверяем результат
      const clientMessages = sentMessages.get(clientId) || [];
      const statusMessages = clientMessages.filter(msg => msg.type === 'status_change');

      expect(statusMessages.length).toBe(1);
      
      const message = statusMessages[0] as StatusChangeMessage;
      expect(message.sessionId).toBe(statusData.session_id);
      expect(message.oldStatus).toBe(statusData.old_status);
      expect(message.newStatus).toBe(statusData.new_status);
    });

    /**
     * Тест обработки невалидного payload для status_changes
     */
    it('должен корректно обрабатывать невалидный payload для status_changes', async () => {
      const clientId = 'test-client-invalid-status';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-invalid-status',
        channel: 'status_changes',
      });

      // Невалидный payload (отсутствует session_id)
      const invalidPayload = {
        old_status: 'active',
        new_status: 'closed',
      };

      await notificationRouter.handleNotification('status_changes', JSON.stringify(invalidPayload));

      // Проверяем, что клиент НЕ получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      expect(clientMessages.length).toBe(0);

      // Проверяем, что была залогирована ошибка
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Preservation Requirement 3.2: Обработка канала session_type_change
  // ============================================================================

  describe('Preservation 3.2: Канал session_type_change', () => {
    /**
     * Наблюдение: уведомления в канал session_type_change корректно обрабатываются
     * Тест: для всех уведомлений в session_type_change результат идентичен текущему поведению
     */
    it('должен корректно обрабатывать уведомления в канал type_changes', async () => {
      // Подписываем клиента на type_changes
      const clientId = 'test-client-type';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-type',
        channel: 'type_changes',
      });

      // Генерируем валидный payload для изменения типа
      const typePayload = {
        session_id: 10,
        old_type: 'support',
        new_type: 'complaint',
      };

      // Отправляем уведомление в канал type_changes
      await notificationRouter.handleNotification('type_changes', JSON.stringify(typePayload));

      // Проверяем, что клиент получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      const typeMessages = clientMessages.filter(msg => msg.type === 'type_change');

      expect(typeMessages.length).toBe(1);
      
      const message = typeMessages[0] as TypeChangeMessage;
      expect(message.sessionId).toBe(10);
      expect(message.oldType).toBe('support');
      expect(message.newType).toBe('complaint');
    });

    /**
     * Property-Based Test: генерация множества случайных уведомлений об изменении типа
     */
    test.prop([
      fc.record({
        session_id: fc.integer({ min: 1, max: 1000 }),
        old_type: fc.constantFrom('support', 'complaint', 'question', 'feedback'),
        new_type: fc.constantFrom('support', 'complaint', 'question', 'feedback'),
      }),
    ])('должен обрабатывать любое валидное уведомление об изменении типа', async (typeData) => {
      // Создаём уникальный clientId для каждой итерации
      const uniqueId = Math.random().toString(36).substring(7);
      const clientId = `client-type-${uniqueId}`;
      
      subscriptionRegistry.add({
        clientId,
        subscriptionId: `sub-type-${uniqueId}`,
        channel: 'type_changes',
      });

      // Отправляем уведомление
      await notificationRouter.handleNotification('type_changes', JSON.stringify(typeData));

      // Проверяем результат
      const clientMessages = sentMessages.get(clientId) || [];
      const typeMessages = clientMessages.filter(msg => msg.type === 'type_change');

      expect(typeMessages.length).toBe(1);
      
      const message = typeMessages[0] as TypeChangeMessage;
      expect(message.sessionId).toBe(typeData.session_id);
      expect(message.oldType).toBe(typeData.old_type);
      expect(message.newType).toBe(typeData.new_type);
    });

    /**
     * Тест обработки невалидного payload для type_changes
     */
    it('должен корректно обрабатывать невалидный payload для type_changes', async () => {
      const clientId = 'test-client-invalid-type';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-invalid-type',
        channel: 'type_changes',
      });

      // Невалидный payload (отсутствует new_type)
      const invalidPayload = {
        session_id: 15,
        old_type: 'support',
      };

      await notificationRouter.handleNotification('type_changes', JSON.stringify(invalidPayload));

      // Проверяем, что клиент НЕ получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      expect(clientMessages.length).toBe(0);

      // Проверяем, что была залогирована ошибка
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Preservation Requirement 3.3, 3.4: Прямые уведомления в all_messages и session_*
  // ============================================================================

  describe('Preservation 3.3, 3.4: Прямые уведомления в all_messages и session_*', () => {
    /**
     * Наблюдение: прямые уведомления в канал all_messages корректно обрабатываются
     * (если они когда-либо используются напрямую, не через new_message)
     */
    it('должен корректно обрабатывать прямые уведомления в канал all_messages', async () => {
      // Подписываем клиента на all_messages
      const clientId = 'test-client-all-direct';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-all-direct',
        channel: 'all_messages',
      });

      // Генерируем валидный payload для нового сообщения (прямая отправка в all_messages)
      const messagePayload = {
        id: 100,
        session_id: 20,
        sender_type: 'user',
        message_text: 'Прямое сообщение в all_messages',
        created_at: '2024-01-15T14:00:00Z',
        is_read: false,
      };

      // Отправляем уведомление напрямую в канал all_messages
      await notificationRouter.handleNotification('all_messages', JSON.stringify(messagePayload));

      // Проверяем, что клиент получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      const newMessages = clientMessages.filter(msg => msg.type === 'new_message');

      expect(newMessages.length).toBe(1);
      
      const message = newMessages[0] as NewMessageMessage;
      expect(message.data.id).toBe(100);
      expect(message.data.session_id).toBe(20);
      expect(message.data.message_text).toBe('Прямое сообщение в all_messages');
    });

    /**
     * Наблюдение: прямые уведомления в каналы session_* корректно обрабатываются
     */
    it('должен корректно обрабатывать прямые уведомления в канал session_*', async () => {
      // Подписываем клиента на session_25
      const clientId = 'test-client-session-direct';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-session-direct',
        channel: 'session_25',
        sessionId: 25,
      });

      // Генерируем валидный payload для нового сообщения (прямая отправка в session_25)
      const messagePayload = {
        id: 200,
        session_id: 25,
        sender_type: 'admin',
        message_text: 'Прямое сообщение в session_25',
        created_at: '2024-01-15T15:00:00Z',
        is_read: false,
      };

      // Отправляем уведомление напрямую в канал session_25
      await notificationRouter.handleNotification('session_25', JSON.stringify(messagePayload));

      // Проверяем, что клиент получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      const newMessages = clientMessages.filter(msg => msg.type === 'new_message');

      expect(newMessages.length).toBe(1);
      
      const message = newMessages[0] as NewMessageMessage;
      expect(message.data.id).toBe(200);
      expect(message.data.session_id).toBe(25);
      expect(message.data.message_text).toBe('Прямое сообщение в session_25');
    });

    /**
     * Property-Based Test: генерация множества прямых уведомлений в session_*
     */
    test.prop([
      fc.record({
        session_id: fc.integer({ min: 1, max: 1000 }),
        message_id: fc.integer({ min: 1, max: 100000 }),
        sender_type: fc.constantFrom('user', 'admin'),
        message_text: fc.string({ minLength: 1, maxLength: 500 }),
        created_at: fc.date().map(d => d.toISOString()),
      }),
    ])('должен обрабатывать любое прямое уведомление в session_*', async (messageData) => {
      // Создаём уникальный clientId для каждой итерации
      const uniqueId = Math.random().toString(36).substring(7);
      const clientId = `client-session-direct-${uniqueId}`;
      const channel = `session_${messageData.session_id}`;
      
      subscriptionRegistry.add({
        clientId,
        subscriptionId: `sub-session-direct-${uniqueId}`,
        channel,
        sessionId: messageData.session_id,
      });

      // Генерируем payload
      const payload = {
        id: messageData.message_id,
        session_id: messageData.session_id,
        sender_type: messageData.sender_type,
        message_text: messageData.message_text,
        created_at: messageData.created_at,
        is_read: false,
      };

      // Отправляем уведомление напрямую в канал session_*
      await notificationRouter.handleNotification(channel, JSON.stringify(payload));

      // Проверяем результат
      const clientMessages = sentMessages.get(clientId) || [];
      const newMessages = clientMessages.filter(msg => msg.type === 'new_message');

      expect(newMessages.length).toBe(1);
      
      const message = newMessages[0] as NewMessageMessage;
      expect(message.data.session_id).toBe(messageData.session_id);
      expect(message.data.message_text).toBe(messageData.message_text);
    });
  });

  // ============================================================================
  // Preservation Requirement 3.5: Обработка отсутствия подписчиков
  // ============================================================================

  describe('Preservation 3.5: Обработка отсутствия подписчиков', () => {
    /**
     * Наблюдение: когда нет подписчиков, система логирует информационное сообщение
     */
    it('должен логировать информационное сообщение при отсутствии подписчиков', async () => {
      // НЕ подписываем никого на канал
      const statusPayload = {
        session_id: 99,
        old_status: 'active',
        new_status: 'closed',
      };

      // Отправляем уведомление в канал без подписчиков
      await notificationRouter.handleNotification('status_changes', JSON.stringify(statusPayload));

      // Проверяем, что было залогировано информационное сообщение
      const infoLogs = consoleLogSpy.mock.calls.filter(
        (call: any[]) => call[0]?.includes('Нет подписчиков для канала')
      );

      expect(infoLogs.length).toBeGreaterThan(0);
    });

    /**
     * Property-Based Test: проверка логирования для различных каналов без подписчиков
     */
    test.prop([
      fc.constantFrom('status_changes', 'type_changes', 'all_messages'),
    ])('должен логировать отсутствие подписчиков для любого канала', async (channel) => {
      // Генерируем минимальный валидный payload
      let payload: any;
      
      if (channel === 'status_changes') {
        payload = { session_id: 1, old_status: 'active', new_status: 'closed' };
      } else if (channel === 'type_changes') {
        payload = { session_id: 1, old_type: 'support', new_type: 'complaint' };
      } else {
        payload = { id: 1, session_id: 1, sender_type: 'user', message_text: 'test', created_at: new Date().toISOString(), is_read: false };
      }

      // Отправляем уведомление
      await notificationRouter.handleNotification(channel, JSON.stringify(payload));

      // Проверяем логирование
      const infoLogs = consoleLogSpy.mock.calls.filter(
        (call: any[]) => call[0]?.includes('Нет подписчиков для канала')
      );

      expect(infoLogs.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Preservation Requirement 3.7: Обработка невалидных payload и ошибок
  // ============================================================================

  describe('Preservation 3.7: Обработка невалидных payload и ошибок', () => {
    /**
     * Наблюдение: невалидные payload обрабатываются с логированием ошибок
     */
    it('должен логировать ошибку при невалидном JSON payload', async () => {
      const clientId = 'test-client-invalid-json';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-invalid-json',
        channel: 'status_changes',
      });

      // Невалидный JSON
      const invalidJson = '{ invalid json }';

      await notificationRouter.handleNotification('status_changes', invalidJson);

      // Проверяем, что была залогирована ошибка
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Проверяем, что клиент НЕ получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      expect(clientMessages.length).toBe(0);
    });

    /**
     * Тест обработки payload с отсутствующими обязательными полями
     */
    it('должен логировать ошибку при отсутствии обязательных полей', async () => {
      const clientId = 'test-client-missing-fields';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-missing-fields',
        channel: 'all_messages',
      });

      // Payload с отсутствующими полями
      const incompletePayload = {
        id: 300,
        // session_id отсутствует
        sender_type: 'user',
        message_text: 'Неполное сообщение',
      };

      await notificationRouter.handleNotification('all_messages', JSON.stringify(incompletePayload));

      // Проверяем, что была залогирована ошибка
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Проверяем, что клиент НЕ получил уведомление
      const clientMessages = sentMessages.get(clientId) || [];
      expect(clientMessages.length).toBe(0);
    });

    /**
     * Property-Based Test: генерация невалидных payload для проверки устойчивости
     */
    test.prop([
      fc.record({
        // Генерируем payload с случайными отсутствующими полями
        id: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
        session_id: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
        sender_type: fc.option(fc.constantFrom('user', 'admin'), { nil: undefined }),
        message_text: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        created_at: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
      }),
    ])('должен устойчиво обрабатывать невалидные payload', async (invalidData) => {
      const clientId = 'client-invalid-data';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub-invalid-data',
        channel: 'all_messages',
      });

      // Отправляем невалидный payload
      await notificationRouter.handleNotification('all_messages', JSON.stringify(invalidData));

      // Система не должна упасть - проверяем, что обработка завершилась
      // Если payload невалидный, клиент не должен получить сообщение
      const clientMessages = sentMessages.get(clientId) || [];
      
      // Проверяем, что если сообщение было отправлено, то оно валидное
      if (clientMessages.length > 0) {
        const message = clientMessages[0] as NewMessageMessage;
        expect(message.type).toBe('new_message');
        expect(message.data.id).toBeDefined();
        expect(message.data.session_id).toBeDefined();
        expect(message.data.message_text).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Комплексный Preservation Test: Множественные одновременные уведомления
  // ============================================================================

  describe('Комплексный Preservation Test', () => {
    /**
     * Тест одновременной обработки различных типов уведомлений
     * Проверяет, что все существующие каналы работают корректно одновременно
     */
    it('должен корректно обрабатывать множественные одновременные уведомления', async () => {
      // Подписываем клиентов на разные каналы
      const statusClientId = 'client-status-multi';
      const typeClientId = 'client-type-multi';
      const allClientId = 'client-all-multi';
      const sessionClientId = 'client-session-multi';

      subscriptionRegistry.add({
        clientId: statusClientId,
        subscriptionId: 'sub-status-multi',
        channel: 'status_changes',
      });

      subscriptionRegistry.add({
        clientId: typeClientId,
        subscriptionId: 'sub-type-multi',
        channel: 'type_changes',
      });

      subscriptionRegistry.add({
        clientId: allClientId,
        subscriptionId: 'sub-all-multi',
        channel: 'all_messages',
      });

      subscriptionRegistry.add({
        clientId: sessionClientId,
        subscriptionId: 'sub-session-multi',
        channel: 'session_50',
        sessionId: 50,
      });

      // Отправляем уведомления одновременно
      const statusPayload = { session_id: 50, old_status: 'active', new_status: 'closed' };
      const typePayload = { session_id: 50, old_type: 'support', new_type: 'complaint' };
      const messagePayload = {
        id: 400,
        session_id: 50,
        sender_type: 'user',
        message_text: 'Множественное уведомление',
        created_at: '2024-01-15T16:00:00Z',
        is_read: false,
      };

      await Promise.all([
        notificationRouter.handleNotification('status_changes', JSON.stringify(statusPayload)),
        notificationRouter.handleNotification('type_changes', JSON.stringify(typePayload)),
        notificationRouter.handleNotification('all_messages', JSON.stringify(messagePayload)),
        notificationRouter.handleNotification('session_50', JSON.stringify(messagePayload)),
      ]);

      // Проверяем, что все клиенты получили свои уведомления
      const statusMessages = sentMessages.get(statusClientId) || [];
      const typeMessages = sentMessages.get(typeClientId) || [];
      const allMessages = sentMessages.get(allClientId) || [];
      const sessionMessages = sentMessages.get(sessionClientId) || [];

      expect(statusMessages.filter(msg => msg.type === 'status_change').length).toBe(1);
      expect(typeMessages.filter(msg => msg.type === 'type_change').length).toBe(1);
      expect(allMessages.filter(msg => msg.type === 'new_message').length).toBe(1);
      expect(sessionMessages.filter(msg => msg.type === 'new_message').length).toBe(1);
    });
  });
});
