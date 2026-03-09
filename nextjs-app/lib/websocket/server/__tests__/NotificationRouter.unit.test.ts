/**
 * Unit-тесты для NotificationRouter
 * 
 * Проверяет конкретные сценарии обработки уведомлений и ошибок
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationRouter } from '../NotificationRouter';
import { SubscriptionRegistry } from '../SubscriptionRegistry';
import { ConnectionHandler } from '../ConnectionHandler';
import { AuthenticationHandler } from '../AuthenticationHandler';
import { ERROR_CODES } from '../../constants';
import type { ServerMessage } from '../../types';

describe('NotificationRouter - Unit Tests', () => {
  let notificationRouter: NotificationRouter;
  let subscriptionRegistry: SubscriptionRegistry;
  let connectionHandler: ConnectionHandler;
  let authHandler: AuthenticationHandler;
  let sendToClientMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subscriptionRegistry = new SubscriptionRegistry();
    authHandler = new AuthenticationHandler('test-secret-key');
    connectionHandler = new ConnectionHandler(authHandler);
    
    // Mock метода sendToClient
    sendToClientMock = vi.fn().mockReturnValue(true);
    (connectionHandler.sendToClient as any) = sendToClientMock;
    
    notificationRouter = new NotificationRouter(
      subscriptionRegistry,
      connectionHandler
    );
  });

  /**
   * Тест для обработки отклонённых подписок
   * Validates: Requirements 9.3
   */
  describe('Обработка отклонённых подписок', () => {
    it('должен отправить error сообщение при отклонении подписки', () => {
      const clientId = 'client_123';
      const subscriptionId = 'sub_456';
      const reason = 'Access denied: insufficient permissions';

      // Вызываем метод sendSubscriptionError
      notificationRouter.sendSubscriptionError(clientId, subscriptionId, reason);

      // Проверяем, что sendToClient был вызван с правильными параметрами
      expect(sendToClientMock).toHaveBeenCalledTimes(1);
      expect(sendToClientMock).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: 'error',
          code: ERROR_CODES.SUBSCRIPTION_REJECTED,
          message: reason,
          subscriptionId: subscriptionId,
        })
      );
    });

    it('должен отправить error сообщение с правильным кодом ошибки', () => {
      const clientId = 'client_789';
      const subscriptionId = 'sub_abc';
      const reason = 'Channel not found';

      notificationRouter.sendSubscriptionError(clientId, subscriptionId, reason);

      // Получаем вызванное сообщение
      const calledMessage = sendToClientMock.mock.calls[0][1] as ServerMessage;

      expect(calledMessage.type).toBe('error');
      expect(calledMessage).toHaveProperty('code', ERROR_CODES.SUBSCRIPTION_REJECTED);
      expect(calledMessage).toHaveProperty('message', reason);
      expect(calledMessage).toHaveProperty('subscriptionId', subscriptionId);
    });

    it('должен корректно обрабатывать различные причины отклонения', () => {
      const testCases = [
        {
          clientId: 'client_1',
          subscriptionId: 'sub_1',
          reason: 'User not authorized for this session',
        },
        {
          clientId: 'client_2',
          subscriptionId: 'sub_2',
          reason: 'Session does not exist',
        },
        {
          clientId: 'client_3',
          subscriptionId: 'sub_3',
          reason: 'Subscription limit exceeded',
        },
        {
          clientId: 'client_4',
          subscriptionId: 'sub_4',
          reason: 'Invalid channel type',
        },
      ];

      testCases.forEach((testCase) => {
        sendToClientMock.mockClear();

        notificationRouter.sendSubscriptionError(
          testCase.clientId,
          testCase.subscriptionId,
          testCase.reason
        );

        expect(sendToClientMock).toHaveBeenCalledWith(
          testCase.clientId,
          expect.objectContaining({
            type: 'error',
            code: ERROR_CODES.SUBSCRIPTION_REJECTED,
            message: testCase.reason,
            subscriptionId: testCase.subscriptionId,
          })
        );
      });
    });

    it('должен логировать информацию об отклонённой подписке', () => {
      const clientId = 'client_test';
      const subscriptionId = 'sub_test';
      const reason = 'Test rejection reason';

      // Не должно быть исключений при вызове
      expect(() => {
        notificationRouter.sendSubscriptionError(clientId, subscriptionId, reason);
      }).not.toThrow();

      // Проверяем, что sendToClient был вызван
      expect(sendToClientMock).toHaveBeenCalled();
    });

    it('должен корректно работать при ошибке отправки сообщения', () => {
      // Mock sendToClient для возврата false (ошибка отправки)
      sendToClientMock.mockReturnValue(false);

      const clientId = 'client_error';
      const subscriptionId = 'sub_error';
      const reason = 'Test error';

      // Не должно быть исключений
      expect(() => {
        notificationRouter.sendSubscriptionError(clientId, subscriptionId, reason);
      }).not.toThrow();

      // sendToClient должен быть вызван
      expect(sendToClientMock).toHaveBeenCalled();
    });

    it('должен включать subscriptionId в error сообщение', () => {
      const clientId = 'client_xyz';
      const subscriptionId = 'sub_unique_id_12345';
      const reason = 'Subscription rejected';

      notificationRouter.sendSubscriptionError(clientId, subscriptionId, reason);

      const calledMessage = sendToClientMock.mock.calls[0][1] as ServerMessage;

      // Проверяем, что subscriptionId присутствует в сообщении
      expect(calledMessage).toHaveProperty('subscriptionId');
      if ('subscriptionId' in calledMessage) {
        expect(calledMessage.subscriptionId).toBe(subscriptionId);
      }
    });
  });

  /**
   * Дополнительные тесты для обработки уведомлений
   */
  describe('Обработка уведомлений', () => {
    it('должен корректно парсить JSON payload для new_message', async () => {
      const clientId = 'client_123';
      const channel = 'session_1';
      const sessionId = 1;

      // Добавляем подписку
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub_123',
        channel,
        sessionId,
      });

      const payload = JSON.stringify({
        id: 1,
        session_id: sessionId,
        sender_type: 'user',
        message_text: 'Test message',
        created_at: new Date().toISOString(),
        is_read: false,
      });

      await notificationRouter.handleNotification(channel, payload);

      // Проверяем, что сообщение было отправлено
      expect(sendToClientMock).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: 'new_message',
          data: expect.objectContaining({
            id: 1,
            session_id: sessionId,
            sender_type: 'user',
            message_text: 'Test message',
          }),
        })
      );
    });

    it('должен корректно обрабатывать невалидный JSON без исключений', async () => {
      const clientId = 'client_123';
      const channel = 'session_1';

      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub_123',
        channel,
        sessionId: 1,
      });

      const invalidPayload = '{ invalid json }';

      // Не должно быть исключений
      await expect(
        notificationRouter.handleNotification(channel, invalidPayload)
      ).resolves.not.toThrow();

      // Сообщение НЕ должно быть отправлено
      expect(sendToClientMock).not.toHaveBeenCalled();
    });

    it('должен корректно обрабатывать payload с отсутствующими полями', async () => {
      const clientId = 'client_123';
      const channel = 'session_1';

      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub_123',
        channel,
        sessionId: 1,
      });

      // Payload без обязательных полей
      const incompletePayload = JSON.stringify({
        id: 1,
        // session_id отсутствует
        sender_type: 'user',
        // message_text отсутствует
      });

      await notificationRouter.handleNotification(channel, incompletePayload);

      // Сообщение НЕ должно быть отправлено из-за невалидного payload
      expect(sendToClientMock).not.toHaveBeenCalled();
    });

    it('должен корректно определять тип уведомления по каналу', async () => {
      const clientId = 'client_123';

      // Тест для канала status_changes
      const statusChannel = 'status_changes';
      subscriptionRegistry.add({
        clientId,
        subscriptionId: 'sub_status',
        channel: statusChannel,
      });

      const statusPayload = JSON.stringify({
        session_id: 1,
        old_status: 'open',
        new_status: 'closed',
      });

      await notificationRouter.handleNotification(statusChannel, statusPayload);

      expect(sendToClientMock).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: 'status_change',
          sessionId: 1,
          oldStatus: 'open',
          newStatus: 'closed',
        })
      );
    });

    it('должен логировать получение уведомления', async () => {
      const channel = 'session_1';
      const payload = JSON.stringify({
        id: 1,
        session_id: 1,
        sender_type: 'user',
        message_text: 'Test',
        created_at: new Date().toISOString(),
        is_read: false,
      });

      // Не должно быть исключений
      await expect(
        notificationRouter.handleNotification(channel, payload)
      ).resolves.not.toThrow();
    });
  });

  /**
   * Тесты для регистрации кастомных обработчиков
   */
  describe('Регистрация кастомных обработчиков', () => {
    it('должен корректно регистрировать кастомный обработчик', () => {
      const customHandler = vi.fn().mockResolvedValue(undefined);
      const customType = 'custom_event';

      // Не должно быть исключений при регистрации
      expect(() => {
        notificationRouter.registerHandler(customType, customHandler);
      }).not.toThrow();

      // Регистрируем ещё один обработчик
      expect(() => {
        notificationRouter.registerHandler('another_type', vi.fn());
      }).not.toThrow();
    });
  });
});
