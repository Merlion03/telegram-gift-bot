/**
 * Интеграционные тесты для полного flow обработки уведомлений new_message
 * 
 * Тестируемые сценарии:
 * - Полный flow от триггера до подписчиков
 * - Переключение между сессиями
 * - Множественные подписчики
 * - Совместная работа с другими типами уведомлений
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotificationRouter } from '../lib/websocket/server/NotificationRouter';
import { SubscriptionRegistry } from '../lib/websocket/server/SubscriptionRegistry';
import { ConnectionHandler } from '../lib/websocket/server/ConnectionHandler';
import type { ServerMessage, NewMessageMessage, StatusChangeMessage, TypeChangeMessage, ChannelSubscription } from '../lib/websocket/types';

describe('Интеграционные тесты для обработки уведомлений new_message', () => {
  let subscriptionRegistry: SubscriptionRegistry;
  let connectionHandler: ConnectionHandler;
  let notificationRouter: NotificationRouter;
  let sentMessages: Map<string, ServerMessage[]>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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

  // Вспомогательная функция для удаления подписки
  const removeSubscription = (subscriptionId: string) => {
    subscriptionRegistry.remove(subscriptionId);
  };

  // Вспомогательная функция для получения сообщений клиента
  const getClientMessages = (clientId: string): ServerMessage[] => {
    return sentMessages.get(clientId) || [];
  };

  // Вспомогательная функция для очистки сообщений
  const clearMessages = () => {
    sentMessages.clear();
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
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Восстанавливаем console
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('5.1 Полный flow от триггера до подписчиков', () => {
    it('должен доставить уведомление от триггера подписчикам session_* и all_messages', async () => {
      // Эмулируем payload от триггера PostgreSQL notify_new_message()
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
          message_text: 'Привет от пользователя',
          file_id: null,
          created_at: '2024-01-15T10:30:00Z',
          delivered: false,
        },
      };

      // Подписываем клиентов
      addSubscription('client-session-5', 'session_5', 'sub-session-5');
      addSubscription('client-all', 'all_messages', 'sub-all');

      // Эмулируем уведомление от триггера в канал new_message
      await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

      // Проверяем, что NotificationRouter обработал уведомление
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Получено уведомление'),
        expect.objectContaining({ channel: 'new_message' })
      );

      // Проверяем, что подписчик session_5 получил уведомление
      const messagesSession = getClientMessages('client-session-5');
      expect(messagesSession).toHaveLength(1);
      expect(messagesSession[0].type).toBe('new_message');
      
      const messageSession = messagesSession[0] as NewMessageMessage;
      expect(messageSession.data.id).toBe(123);
      expect(messageSession.data.session_id).toBe(5);
      expect(messageSession.data.sender_type).toBe('user');
      expect(messageSession.data.message_text).toBe('Привет от пользователя');

      // Проверяем, что подписчик all_messages получил уведомление
      const messagesAll = getClientMessages('client-all');
      expect(messagesAll).toHaveLength(1);
      expect(messagesAll[0].type).toBe('new_message');
      
      const messageAll = messagesAll[0] as NewMessageMessage;
      expect(messageAll.data.id).toBe(123);
      expect(messageAll.data.session_id).toBe(5);

      // Проверяем, что оба подписчика получили идентичное сообщение
      expect(messageSession).toEqual(messageAll);
    });

    it('должен корректно обработать уведомление когда подписан только session_*', async () => {
      const triggerPayload = {
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

      // Подписываем только на session_10
      addSubscription('client-session-10', 'session_10', 'sub-session-10');

      await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

      // Проверяем, что подписчик session_10 получил уведомление
      const messages = getClientMessages('client-session-10');
      expect(messages).toHaveLength(1);
      
      const message = messages[0] as NewMessageMessage;
      expect(message.data.sender_type).toBe('admin');
      expect(message.data.message_text).toBe('Ответ от администратора');

      // Проверяем, что логируется информация об отсутствии подписчиков на all_messages
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Нет подписчиков для канала: all_messages')
      );
    });

    it('должен корректно обработать уведомление когда подписан только all_messages', async () => {
      const triggerPayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 15,
        message_id: 789,
        data: {
          id: 789,
          session_id: 15,
          telegram_id: 111222333,
          message_type: 'text',
          message_text: 'Сообщение в сессию без подписчиков',
          file_id: null,
          created_at: '2024-01-15T12:00:00Z',
          delivered: false,
        },
      };

      // Подписываем только на all_messages
      addSubscription('client-all', 'all_messages', 'sub-all');

      await notificationRouter.handleNotification('new_message', JSON.stringify(triggerPayload));

      // Проверяем, что подписчик all_messages получил уведомление
      const messages = getClientMessages('client-all');
      expect(messages).toHaveLength(1);
      
      const message = messages[0] as NewMessageMessage;
      expect(message.data.session_id).toBe(15);
      expect(message.data.message_text).toBe('Сообщение в сессию без подписчиков');

      // Проверяем, что логируется информация об отсутствии подписчиков на session_15
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Нет подписчиков для канала: session_15')
      );
    });
  });

  describe('5.2 Переключение между сессиями', () => {
    it('должен корректно обрабатывать переключение клиента между сессиями', async () => {
      const client = 'client-switcher';

      // Шаг 1: Подписываем клиента на session_5
      addSubscription(client, 'session_5', 'sub-session-5');

      // Шаг 2: Эмулируем уведомление для session_id: 5
      const payload5 = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 100,
        data: {
          id: 100,
          session_id: 5,
          telegram_id: 111111111,
          message_text: 'Сообщение в сессию 5',
          created_at: '2024-01-15T13:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(payload5));

      // Проверяем, что клиент получил уведомление
      let messages = getClientMessages(client);
      expect(messages).toHaveLength(1);
      expect((messages[0] as NewMessageMessage).data.session_id).toBe(5);

      // Шаг 3: Отписываем клиента от session_5
      removeSubscription('sub-session-5');
      clearMessages();

      // Шаг 4: Подписываем клиента на session_10
      addSubscription(client, 'session_10', 'sub-session-10');

      // Шаг 5: Эмулируем уведомление для session_id: 10
      const payload10 = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 10,
        message_id: 200,
        data: {
          id: 200,
          session_id: 10,
          telegram_id: 222222222,
          message_text: 'Сообщение в сессию 10',
          created_at: '2024-01-15T14:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(payload10));

      // Проверяем, что клиент получил уведомление для session_10
      messages = getClientMessages(client);
      expect(messages).toHaveLength(1);
      expect((messages[0] as NewMessageMessage).data.session_id).toBe(10);
      expect((messages[0] as NewMessageMessage).data.message_text).toBe('Сообщение в сессию 10');

      clearMessages();

      // Шаг 6: Эмулируем уведомление для session_id: 5 (клиент больше не подписан)
      await notificationRouter.handleNotification('new_message', JSON.stringify(payload5));

      // Проверяем, что клиент НЕ получил уведомление для session_5
      messages = getClientMessages(client);
      expect(messages).toHaveLength(0);

      // Проверяем, что логируется отсутствие подписчиков на session_5
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Нет подписчиков для канала: session_5')
      );
    });

    it('должен корректно обрабатывать множественные переключения', async () => {
      const client = 'client-multi-switcher';

      // Переключаемся между session_1, session_2, session_3
      const sessions = [1, 2, 3];
      
      for (const sessionId of sessions) {
        // Подписываемся на текущую сессию
        const subId = `sub-session-${sessionId}`;
        addSubscription(client, `session_${sessionId}`, subId);

        // Отправляем уведомление
        const payload = {
          operation: 'INSERT',
          table: 'support_messages',
          session_id: sessionId,
          message_id: sessionId * 100,
          data: {
            id: sessionId * 100,
            session_id: sessionId,
            telegram_id: sessionId * 111111,
            message_text: `Сообщение в сессию ${sessionId}`,
            created_at: '2024-01-15T15:00:00Z',
          },
        };

        await notificationRouter.handleNotification('new_message', JSON.stringify(payload));

        // Проверяем получение
        const messages = getClientMessages(client);
        expect(messages.length).toBeGreaterThan(0);
        const lastMessage = messages[messages.length - 1] as NewMessageMessage;
        expect(lastMessage.data.session_id).toBe(sessionId);

        // Отписываемся от текущей сессии перед переключением на следующую
        if (sessionId < sessions[sessions.length - 1]) {
          removeSubscription(subId);
        }
      }
    });
  });

  describe('5.3 Множественные подписчики', () => {
    it('должен доставить уведомление правильным подписчикам', async () => {
      // Подписываем клиентов
      addSubscription('client-A', 'all_messages', 'sub-A');
      addSubscription('client-B', 'session_5', 'sub-B');
      addSubscription('client-C', 'session_10', 'sub-C');

      // Эмулируем уведомление для session_id: 5
      const payload5 = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 500,
        data: {
          id: 500,
          session_id: 5,
          telegram_id: 555555555,
          message_text: 'Сообщение для сессии 5',
          created_at: '2024-01-15T16:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(payload5));

      // Проверяем, что клиенты A и B получили уведомление
      const messagesA = getClientMessages('client-A');
      const messagesB = getClientMessages('client-B');
      const messagesC = getClientMessages('client-C');

      expect(messagesA).toHaveLength(1);
      expect((messagesA[0] as NewMessageMessage).data.session_id).toBe(5);

      expect(messagesB).toHaveLength(1);
      expect((messagesB[0] as NewMessageMessage).data.session_id).toBe(5);

      expect(messagesC).toHaveLength(0); // Клиент C не должен получить уведомление

      clearMessages();

      // Эмулируем уведомление для session_id: 10
      const payload10 = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 10,
        message_id: 1000,
        data: {
          id: 1000,
          session_id: 10,
          telegram_id: 101010101,
          message_text: 'Сообщение для сессии 10',
          created_at: '2024-01-15T17:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(payload10));

      // Проверяем, что клиенты A и C получили уведомление
      const messagesA2 = getClientMessages('client-A');
      const messagesB2 = getClientMessages('client-B');
      const messagesC2 = getClientMessages('client-C');

      expect(messagesA2).toHaveLength(1);
      expect((messagesA2[0] as NewMessageMessage).data.session_id).toBe(10);

      expect(messagesB2).toHaveLength(0); // Клиент B не должен получить уведомление

      expect(messagesC2).toHaveLength(1);
      expect((messagesC2[0] as NewMessageMessage).data.session_id).toBe(10);
    });

    it('должен доставить уведомление всем подписчикам all_messages', async () => {
      // Подписываем несколько админов на all_messages
      addSubscription('admin-1', 'all_messages', 'sub-admin-1');
      addSubscription('admin-2', 'all_messages', 'sub-admin-2');
      addSubscription('admin-3', 'all_messages', 'sub-admin-3');

      const payload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 20,
        message_id: 2000,
        data: {
          id: 2000,
          session_id: 20,
          telegram_id: 202020202,
          message_text: 'Сообщение для всех админов',
          created_at: '2024-01-15T18:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(payload));

      // Проверяем, что все админы получили уведомление
      const messagesAdmin1 = getClientMessages('admin-1');
      const messagesAdmin2 = getClientMessages('admin-2');
      const messagesAdmin3 = getClientMessages('admin-3');

      expect(messagesAdmin1).toHaveLength(1);
      expect(messagesAdmin2).toHaveLength(1);
      expect(messagesAdmin3).toHaveLength(1);

      // Проверяем, что все получили одинаковое сообщение
      expect(messagesAdmin1[0]).toEqual(messagesAdmin2[0]);
      expect(messagesAdmin2[0]).toEqual(messagesAdmin3[0]);
    });

    it('должен корректно обрабатывать клиента с множественными подписками', async () => {
      // Клиент подписан и на конкретную сессию, и на all_messages
      addSubscription('client-multi', 'session_7', 'sub-session-7');
      addSubscription('client-multi', 'all_messages', 'sub-all');

      const payload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 7,
        message_id: 700,
        data: {
          id: 700,
          session_id: 7,
          telegram_id: 777777777,
          message_text: 'Сообщение для клиента с двумя подписками',
          created_at: '2024-01-15T19:00:00Z',
        },
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(payload));

      // Клиент должен получить уведомление дважды (по одному на каждую подписку)
      const messages = getClientMessages('client-multi');
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(messages[1]);
    });
  });

  describe('5.4 Совместная работа с другими типами уведомлений', () => {
    it('должен корректно обработать одновременную отправку разных типов уведомлений', async () => {
      // Подписываем клиента на все типы каналов
      addSubscription('client-full', 'session_5', 'sub-session-5');
      addSubscription('client-full', 'all_messages', 'sub-all');
      addSubscription('client-full', 'status_changes', 'sub-status');

      // Эмулируем новое сообщение в new_message для session_id: 5
      const newMessagePayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 5,
        message_id: 5001,
        data: {
          id: 5001,
          session_id: 5,
          telegram_id: 123456789,
          message_text: 'Новое сообщение',
          created_at: '2024-01-15T20:00:00Z',
        },
      };

      // Эмулируем изменение статуса в session_status_change для session_id: 5
      const statusChangePayload = {
        session_id: 5,
        old_status: 'open',
        new_status: 'closed',
      };

      // Эмулируем изменение типа в session_type_change для session_id: 5
      const typeChangePayload = {
        session_id: 5,
        old_type: 'question',
        new_type: 'complaint',
      };

      // Отправляем все три уведомления
      await notificationRouter.handleNotification('new_message', JSON.stringify(newMessagePayload));
      await notificationRouter.handleNotification('session_status_change', JSON.stringify(statusChangePayload));
      await notificationRouter.handleNotification('session_type_change', JSON.stringify(typeChangePayload));

      // Проверяем, что клиент получил все три уведомления
      const messages = getClientMessages('client-full');
      
      // Клиент должен получить:
      // - 2 уведомления new_message (через session_5 и all_messages)
      // - 1 уведомление status_change (через status_changes)
      // - 1 уведомление type_change (через type_changes, но клиент не подписан)
      // Итого: 3 уведомления (2 new_message + 1 status_change)
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // Проверяем типы полученных сообщений
      const newMessages = messages.filter(m => m.type === 'new_message');
      const statusMessages = messages.filter(m => m.type === 'status_change');

      expect(newMessages).toHaveLength(2); // Через session_5 и all_messages
      expect(statusMessages).toHaveLength(1);

      // Проверяем содержимое new_message
      const newMsg = newMessages[0] as NewMessageMessage;
      expect(newMsg.data.session_id).toBe(5);
      expect(newMsg.data.message_text).toBe('Новое сообщение');

      // Проверяем содержимое status_change
      const statusMsg = statusMessages[0] as StatusChangeMessage;
      expect(statusMsg.sessionId).toBe(5);
      expect(statusMsg.oldStatus).toBe('open');
      expect(statusMsg.newStatus).toBe('closed');
    });

    it('должен сохранить обработку существующих каналов без регрессий', async () => {
      // Подписываем клиентов на существующие каналы
      addSubscription('client-status', 'status_changes', 'sub-status');
      addSubscription('client-type', 'type_changes', 'sub-type');

      // Отправляем уведомления в существующие каналы
      const statusPayload = {
        session_id: 10,
        old_status: 'pending',
        new_status: 'active',
      };

      const typePayload = {
        session_id: 10,
        old_type: 'support',
        new_type: 'technical',
      };

      await notificationRouter.handleNotification('session_status_change', JSON.stringify(statusPayload));
      await notificationRouter.handleNotification('session_type_change', JSON.stringify(typePayload));

      // Проверяем, что уведомления доставлены корректно
      const statusMessages = getClientMessages('client-status');
      const typeMessages = getClientMessages('client-type');

      expect(statusMessages).toHaveLength(1);
      expect(statusMessages[0].type).toBe('status_change');

      expect(typeMessages).toHaveLength(1);
      expect(typeMessages[0].type).toBe('type_change');

      // Проверяем, что структура сообщений не изменилась
      const statusMsg = statusMessages[0] as StatusChangeMessage;
      expect(statusMsg.sessionId).toBe(10);
      expect(statusMsg.oldStatus).toBe('pending');
      expect(statusMsg.newStatus).toBe('active');

      const typeMsg = typeMessages[0] as TypeChangeMessage;
      expect(typeMsg.sessionId).toBe(10);
      expect(typeMsg.oldType).toBe('support');
      expect(typeMsg.newType).toBe('technical');
    });

    it('должен корректно обрабатывать смешанные подписки и уведомления', async () => {
      // Создаём сложную конфигурацию подписок
      addSubscription('admin-1', 'all_messages', 'sub-admin-1-all');
      addSubscription('admin-1', 'status_changes', 'sub-admin-1-status');
      
      addSubscription('admin-2', 'session_15', 'sub-admin-2-session');
      addSubscription('admin-2', 'type_changes', 'sub-admin-2-type');

      addSubscription('admin-3', 'session_15', 'sub-admin-3-session');
      addSubscription('admin-3', 'all_messages', 'sub-admin-3-all');
      addSubscription('admin-3', 'status_changes', 'sub-admin-3-status');

      // Отправляем различные уведомления для session_id: 15
      const newMessagePayload = {
        operation: 'INSERT',
        table: 'support_messages',
        session_id: 15,
        message_id: 1500,
        data: {
          id: 1500,
          session_id: 15,
          telegram_id: 151515151,
          message_text: 'Комплексный тест',
          created_at: '2024-01-15T21:00:00Z',
        },
      };

      const statusPayload = {
        session_id: 15,
        old_status: 'new',
        new_status: 'in_progress',
      };

      const typePayload = {
        session_id: 15,
        old_type: 'general',
        new_type: 'urgent',
      };

      await notificationRouter.handleNotification('new_message', JSON.stringify(newMessagePayload));
      await notificationRouter.handleNotification('session_status_change', JSON.stringify(statusPayload));
      await notificationRouter.handleNotification('session_type_change', JSON.stringify(typePayload));

      // Проверяем, что каждый админ получил правильные уведомления
      const messagesAdmin1 = getClientMessages('admin-1');
      const messagesAdmin2 = getClientMessages('admin-2');
      const messagesAdmin3 = getClientMessages('admin-3');

      // Admin-1: all_messages (new_message) + status_changes (status_change)
      expect(messagesAdmin1.length).toBeGreaterThanOrEqual(2);
      expect(messagesAdmin1.some(m => m.type === 'new_message')).toBe(true);
      expect(messagesAdmin1.some(m => m.type === 'status_change')).toBe(true);

      // Admin-2: session_15 (new_message) + type_changes (type_change)
      expect(messagesAdmin2.length).toBeGreaterThanOrEqual(2);
      expect(messagesAdmin2.some(m => m.type === 'new_message')).toBe(true);
      expect(messagesAdmin2.some(m => m.type === 'type_change')).toBe(true);

      // Admin-3: session_15 (new_message) + all_messages (new_message) + status_changes (status_change)
      expect(messagesAdmin3.length).toBeGreaterThanOrEqual(3);
      const newMessagesAdmin3 = messagesAdmin3.filter(m => m.type === 'new_message');
      expect(newMessagesAdmin3).toHaveLength(2); // Через session_15 и all_messages
      expect(messagesAdmin3.some(m => m.type === 'status_change')).toBe(true);
    });

    it('должен корректно обрабатывать последовательность уведомлений в одной сессии', async () => {
      addSubscription('client-sequence', 'session_25', 'sub-sequence');

      // Последовательность событий в сессии 25
      const events = [
        {
          type: 'new_message',
          payload: {
            operation: 'INSERT',
            table: 'support_messages',
            session_id: 25,
            message_id: 2501,
            data: {
              id: 2501,
              session_id: 25,
              telegram_id: 252525252,
              message_text: 'Первое сообщение',
              created_at: '2024-01-15T22:00:00Z',
            },
          },
        },
        {
          type: 'session_status_change',
          payload: {
            session_id: 25,
            old_status: 'new',
            new_status: 'open',
          },
        },
        {
          type: 'new_message',
          payload: {
            operation: 'INSERT',
            table: 'support_messages',
            session_id: 25,
            message_id: 2502,
            data: {
              id: 2502,
              session_id: 25,
              telegram_id: null,
              message_text: 'Ответ администратора',
              created_at: '2024-01-15T22:05:00Z',
            },
          },
        },
        {
          type: 'session_type_change',
          payload: {
            session_id: 25,
            old_type: 'question',
            new_type: 'resolved',
          },
        },
      ];

      // Отправляем события последовательно
      for (const event of events) {
        await notificationRouter.handleNotification(event.type, JSON.stringify(event.payload));
      }

      // Проверяем, что клиент получил только уведомления new_message (подписан только на session_25)
      const messages = getClientMessages('client-sequence');
      
      const newMessages = messages.filter(m => m.type === 'new_message');
      expect(newMessages).toHaveLength(2);

      // Проверяем порядок и содержимое
      const msg1 = newMessages[0] as NewMessageMessage;
      expect(msg1.data.message_text).toBe('Первое сообщение');
      expect(msg1.data.sender_type).toBe('user');

      const msg2 = newMessages[1] as NewMessageMessage;
      expect(msg2.data.message_text).toBe('Ответ администратора');
      expect(msg2.data.sender_type).toBe('admin');
    });
  });
});
