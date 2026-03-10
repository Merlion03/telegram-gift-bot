/**
 * Unit-тесты для новой функциональности обработки канала new_message
 * 
 * Тестируемые методы:
 * - createNewMessageFromTrigger() - обработка payload от триггера PostgreSQL
 * - determineSenderType() - определение типа отправителя
 * - getTargetChannels() - определение целевых каналов для маршрутизации
 * - handleNotification() - маршрутизация к нескольким каналам
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotificationRouter } from '../lib/websocket/server/NotificationRouter';
import { SubscriptionRegistry } from '../lib/websocket/server/SubscriptionRegistry';
import { ConnectionHandler } from '../lib/websocket/server/ConnectionHandler';
import type { ServerMessage, NewMessageMessage, ChannelSubscription } from '../lib/websocket/types';

describe('Unit-тесты для обработки канала new_message', () => {
  let subscriptionRegistry: SubscriptionRegistry;
  let connectionHandler: ConnectionHandler;
  let notificationRouter: NotificationRouter;
  let sentMessages: Map<string, ServerMessage[]>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  // Вспомогательная функция для добавления подписки
  const addSubscription = (clientId: string, channel: string, subscriptionId: string, sessionId?: number) => {
    const subscription: ChannelSubscription = {
      clientId,
      subscriptionId,
      channel,
      sessionId,
    };
    subscriptionRegistry.add(subscription);
  };

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

    // Перехватываем console для проверки логирования
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Восстанавливаем console
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('4.1 createNewMessageFromTrigger() с валидным payload', () => {
    it('должен корректно обработать валидный payload от триггера с telegram_id (user)', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 123,
        data: {
          id: 123,
          session_id: 5,
          telegram_id: 987654321,
          message_type: 'text',
          message_text: 'Привет от пользователя',
          file_id: null,
          created_at: '2024-01-15T10:30:00Z',
          delivered: false,
        },
      };

      addSubscription('client-1', 'session_5', 'sub-1');
      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      const messages = sentMessages.get('client-1');
      expect(messages).toBeDefined();
      expect(messages).toHaveLength(1);

      const message = messages![0] as NewMessageMessage;
      expect(message.type).toBe('new_message');
      expect(message.data.id).toBe(123);
      expect(message.data.session_id).toBe(5);
      expect(message.data.sender_type).toBe('user');
      expect(message.data.message_text).toBe('Привет от пользователя');
      expect(message.data.created_at).toBe('2024-01-15T10:30:00Z');
      expect(message.data.is_read).toBe(false);
    });

    it('должен корректно обработать валидный payload от триггера без telegram_id (admin)', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 10,
        message_id: 456,
        data: {
          id: 456,
          session_id: 10,
          telegram_id: null,
          message_type: 'text',
          message_text: 'Ответ от администратора',
          file_id: null,
          created_at: '2024-01-15T11:00:00Z',
          delivered: true,
        },
      };

      addSubscription('client-2', 'session_10', 'sub-2');
      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      const messages = sentMessages.get('client-2');
      expect(messages).toBeDefined();
      expect(messages).toHaveLength(1);

      const message = messages![0] as NewMessageMessage;
      expect(message.type).toBe('new_message');
      expect(message.data.sender_type).toBe('admin');
      expect(message.data.is_read).toBe(false);
    });
  });

  describe('4.2 createNewMessageFromTrigger() с невалидным payload', () => {
    it('должен вернуть null и залогировать ошибку при отсутствии session_id', async () => {
      const invalidPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        message_id: 123,
        data: {
          id: 123,
          session_id: 5,
          message_text: 'Тест',
          created_at: '2024-01-15T10:30:00Z',
        },
      };

      addSubscription('client-1', 'session_5', 'sub-1');
      await notificationRouter.handleNotification('new_message', JSON.stringify(invalidPayload));

      const messages = sentMessages.get('client-1');
      expect(messages).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Невалидный payload от триггера new_message'),
        invalidPayload
      );
    });

    it('должен вернуть null и залогировать ошибку при отсутствии data', async () => {
      const invalidPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 123,
      };

      addSubscription('client-1', 'session_5', 'sub-1');
      await notificationRouter.handleNotification('new_message', JSON.stringify(invalidPayload));

      const messages = sentMessages.get('client-1');
      expect(messages).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('4.3 determineSenderType()', () => {
    it('должен вернуть "user" когда есть telegram_id', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 123,
        data: {
          id: 123,
          session_id: 5,
          telegram_id: 987654321,
          message_text: 'Сообщение от пользователя',
          created_at: '2024-01-15T10:30:00Z',
        },
      };

      addSubscription('client-1', 'session_5', 'sub-1');
      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      const messages = sentMessages.get('client-1');
      const message = messages![0] as NewMessageMessage;
      expect(message.data.sender_type).toBe('user');
    });

    it('должен вернуть "admin" когда telegram_id отсутствует', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 123,
        data: {
          id: 123,
          session_id: 5,
          telegram_id: null,
          message_text: 'Сообщение от админа',
          created_at: '2024-01-15T10:30:00Z',
        },
      };

      addSubscription('client-1', 'session_5', 'sub-1');
      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      const messages = sentMessages.get('client-1');
      const message = messages![0] as NewMessageMessage;
      expect(message.data.sender_type).toBe('admin');
    });
  });

  describe('4.4 getTargetChannels() с каналом new_message', () => {
    it('должен вернуть массив [session_5, all_messages] для канала new_message с session_id: 5', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 123,
        data: {
          id: 123,
          session_id: 5,
          telegram_id: 987654321,
          message_text: 'Тест маршрутизации',
          created_at: '2024-01-15T10:30:00Z',
        },
      };

      addSubscription('client-session', 'session_5', 'sub-1');
      addSubscription('client-all', 'all_messages', 'sub-2');

      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      const messagesSession = sentMessages.get('client-session');
      const messagesAll = sentMessages.get('client-all');

      expect(messagesSession).toBeDefined();
      expect(messagesSession).toHaveLength(1);
      expect(messagesAll).toBeDefined();
      expect(messagesAll).toHaveLength(1);
    });
  });

  describe('4.5 getTargetChannels() с другими каналами', () => {
    it('должен вернуть [all_messages] для канала all_messages', async () => {
      const messagePayload = {
        id: 100,
        session_id: 15,
        sender_type: 'user',
        message_text: 'Прямое уведомление в all_messages',
        created_at: '2024-01-15T14:00:00Z',
        is_read: false,
      };

      addSubscription('client-all', 'all_messages', 'sub-3');
      await notificationRouter.handleNotification('all_messages', JSON.stringify(messagePayload));

      const messages = sentMessages.get('client-all');
      expect(messages).toBeDefined();
      expect(messages).toHaveLength(1);
    });
  });

  describe('4.6 Маршрутизация к нескольким каналам в handleNotification()', () => {
    it('должен вызвать broadcastToSubscribers дважды для канала new_message с session_id: 7', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 7,
        message_id: 777,
        data: {
          id: 777,
          session_id: 7,
          telegram_id: 111222333,
          message_text: 'Тест множественной маршрутизации',
          created_at: '2024-01-15T16:00:00Z',
        },
      };

      addSubscription('client-session-7', 'session_7', 'sub-1');
      addSubscription('client-all', 'all_messages', 'sub-2');

      vi.clearAllMocks();
      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      expect(connectionHandler.sendToClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('4.7 Граничные случаи', () => {
    it('должен корректно обработать отсутствие подписчиков на целевые каналы', async () => {
      const validPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 50,
        message_id: 5000,
        data: {
          id: 5000,
          session_id: 50,
          telegram_id: 777888999,
          message_text: 'Сообщение без подписчиков',
          created_at: '2024-01-15T20:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(validPayload));

      expect(sentMessages.size).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Нет подписчиков для канала: session_50')
      );
    });

    it('должен корректно обработать невалидный JSON payload', async () => {
      const invalidJson = '{invalid json}';

      addSubscription('client-5', 'all_messages', 'sub-5');
      await notificationRouter.handleNotification('new_message', invalidJson);

      const messages = sentMessages.get('client-5');
      expect(messages).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
