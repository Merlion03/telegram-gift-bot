/**
 * Unit-тесты для SubscriptionManager
 * 
 * Проверяет конкретные примеры и edge cases управления подписками
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionManager } from '../SubscriptionManager';
import type {
  NewMessageMessage,
  StatusChangeMessage,
  TypeChangeMessage,
} from '../../types';

describe('SubscriptionManager - Unit Tests', () => {
  let subscriptionManager: SubscriptionManager;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
  });

  /**
   * Requirements 5.5: Поддержка трёх типов подписок
   * 
   * Проверяет, что SubscriptionManager корректно обрабатывает
   * три типа подписок: session, all, status
   */
  describe('Поддержка трёх типов подписок', () => {
    describe('Тип подписки: session', () => {
      it('должен создавать подписку на конкретную сессию', () => {
        const onMessageMock = vi.fn();
        const sessionId = 123;
        
        const id = subscriptionManager.subscribe({
          channel: 'session',
          sessionId: sessionId,
          onMessage: onMessageMock,
        });
        
        const subscription = subscriptionManager.get(id);
        
        expect(subscription).toBeDefined();
        expect(subscription?.channel).toBe('session');
        expect(subscription?.sessionId).toBe(sessionId);
      });

      it('должен получать сообщения только для своей сессии', () => {
        const onMessage1 = vi.fn();
        const onMessage2 = vi.fn();
        
        // Подписка на сессию 123
        subscriptionManager.subscribe({
          channel: 'session',
          sessionId: 123,
          onMessage: onMessage1,
        });
        
        // Подписка на сессию 456
        subscriptionManager.subscribe({
          channel: 'session',
          sessionId: 456,
          onMessage: onMessage2,
        });
        
        // Отправляем сообщение для сессии 123
        const message: NewMessageMessage = {
          type: 'new_message',
          data: {
            id: 1,
            session_id: 123,
            sender_type: 'user',
            message_text: 'Test message',
            created_at: new Date().toISOString(),
            is_read: false,
          },
        };
        
        subscriptionManager.handleMessage(message);
        
        // Только первая подписка должна получить сообщение
        expect(onMessage1).toHaveBeenCalledTimes(1);
        expect(onMessage1).toHaveBeenCalledWith(message);
        expect(onMessage2).not.toHaveBeenCalled();
      });

      it('должен поддерживать множественные подписки на одну сессию', () => {
        const onMessage1 = vi.fn();
        const onMessage2 = vi.fn();
        const sessionId = 123;
        
        // Две подписки на одну сессию
        subscriptionManager.subscribe({
          channel: 'session',
          sessionId: sessionId,
          onMessage: onMessage1,
        });
        
        subscriptionManager.subscribe({
          channel: 'session',
          sessionId: sessionId,
          onMessage: onMessage2,
        });
        
        // Отправляем сообщение
        const message: NewMessageMessage = {
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
        
        subscriptionManager.handleMessage(message);
        
        // Обе подписки должны получить сообщение
        expect(onMessage1).toHaveBeenCalledTimes(1);
        expect(onMessage2).toHaveBeenCalledTimes(1);
      });
    });

    describe('Тип подписки: all', () => {
      it('должен создавать подписку на все сообщения', () => {
        const onMessageMock = vi.fn();
        
        const id = subscriptionManager.subscribe({
          channel: 'all',
          onMessage: onMessageMock,
        });
        
        const subscription = subscriptionManager.get(id);
        
        expect(subscription).toBeDefined();
        expect(subscription?.channel).toBe('all');
        expect(subscription?.sessionId).toBeUndefined();
      });

      it('должен получать сообщения из всех сессий', () => {
        const onMessageMock = vi.fn();
        
        subscriptionManager.subscribe({
          channel: 'all',
          onMessage: onMessageMock,
        });
        
        // Отправляем сообщения из разных сессий
        const message1: NewMessageMessage = {
          type: 'new_message',
          data: {
            id: 1,
            session_id: 123,
            sender_type: 'user',
            message_text: 'Message 1',
            created_at: new Date().toISOString(),
            is_read: false,
          },
        };
        
        const message2: NewMessageMessage = {
          type: 'new_message',
          data: {
            id: 2,
            session_id: 456,
            sender_type: 'admin',
            message_text: 'Message 2',
            created_at: new Date().toISOString(),
            is_read: false,
          },
        };
        
        subscriptionManager.handleMessage(message1);
        subscriptionManager.handleMessage(message2);
        
        // Подписка должна получить оба сообщения
        expect(onMessageMock).toHaveBeenCalledTimes(2);
        expect(onMessageMock).toHaveBeenNthCalledWith(1, message1);
        expect(onMessageMock).toHaveBeenNthCalledWith(2, message2);
      });

      it('должен работать совместно с подписками типа session', () => {
        const onMessageAll = vi.fn();
        const onMessageSession = vi.fn();
        
        // Подписка на все сообщения
        subscriptionManager.subscribe({
          channel: 'all',
          onMessage: onMessageAll,
        });
        
        // Подписка на конкретную сессию
        subscriptionManager.subscribe({
          channel: 'session',
          sessionId: 123,
          onMessage: onMessageSession,
        });
        
        // Отправляем сообщение для сессии 123
        const message: NewMessageMessage = {
          type: 'new_message',
          data: {
            id: 1,
            session_id: 123,
            sender_type: 'user',
            message_text: 'Test message',
            created_at: new Date().toISOString(),
            is_read: false,
          },
        };
        
        subscriptionManager.handleMessage(message);
        
        // Обе подписки должны получить сообщение
        expect(onMessageAll).toHaveBeenCalledTimes(1);
        expect(onMessageSession).toHaveBeenCalledTimes(1);
      });
    });

    describe('Тип подписки: status', () => {
      it('должен создавать подписку на изменения статуса', () => {
        const onMessageMock = vi.fn();
        
        const id = subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessageMock,
        });
        
        const subscription = subscriptionManager.get(id);
        
        expect(subscription).toBeDefined();
        expect(subscription?.channel).toBe('status');
        expect(subscription?.sessionId).toBeUndefined();
      });

      it('должен получать сообщения об изменении статуса', () => {
        const onMessageMock = vi.fn();
        
        subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessageMock,
        });
        
        // Отправляем сообщение об изменении статуса
        const statusMessage: StatusChangeMessage = {
          type: 'status_change',
          sessionId: 123,
          oldStatus: 'open',
          newStatus: 'closed',
        };
        
        subscriptionManager.handleMessage(statusMessage);
        
        expect(onMessageMock).toHaveBeenCalledTimes(1);
        expect(onMessageMock).toHaveBeenCalledWith(statusMessage);
      });

      it('должен получать сообщения об изменении типа', () => {
        const onMessageMock = vi.fn();
        
        subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessageMock,
        });
        
        // Отправляем сообщение об изменении типа
        const typeMessage: TypeChangeMessage = {
          type: 'type_change',
          sessionId: 123,
          oldType: 'question',
          newType: 'complaint',
        };
        
        subscriptionManager.handleMessage(typeMessage);
        
        expect(onMessageMock).toHaveBeenCalledTimes(1);
        expect(onMessageMock).toHaveBeenCalledWith(typeMessage);
      });

      it('НЕ должен получать сообщения типа new_message', () => {
        const onMessageMock = vi.fn();
        
        subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessageMock,
        });
        
        // Отправляем обычное сообщение
        const message: NewMessageMessage = {
          type: 'new_message',
          data: {
            id: 1,
            session_id: 123,
            sender_type: 'user',
            message_text: 'Test message',
            created_at: new Date().toISOString(),
            is_read: false,
          },
        };
        
        subscriptionManager.handleMessage(message);
        
        // Подписка на статус не должна получить это сообщение
        expect(onMessageMock).not.toHaveBeenCalled();
      });

      it('должен поддерживать множественные подписки на статус', () => {
        const onMessage1 = vi.fn();
        const onMessage2 = vi.fn();
        
        subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessage1,
        });
        
        subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessage2,
        });
        
        // Отправляем сообщение об изменении статуса
        const statusMessage: StatusChangeMessage = {
          type: 'status_change',
          sessionId: 123,
          oldStatus: 'open',
          newStatus: 'closed',
        };
        
        subscriptionManager.handleMessage(statusMessage);
        
        // Обе подписки должны получить сообщение
        expect(onMessage1).toHaveBeenCalledTimes(1);
        expect(onMessage2).toHaveBeenCalledTimes(1);
      });
    });

    describe('Комбинированные сценарии', () => {
      it('должен корректно обрабатывать все три типа подписок одновременно', () => {
        const onMessageSession = vi.fn();
        const onMessageAll = vi.fn();
        const onMessageStatus = vi.fn();
        
        // Создаём подписки всех типов
        subscriptionManager.subscribe({
          channel: 'session',
          sessionId: 123,
          onMessage: onMessageSession,
        });
        
        subscriptionManager.subscribe({
          channel: 'all',
          onMessage: onMessageAll,
        });
        
        subscriptionManager.subscribe({
          channel: 'status',
          onMessage: onMessageStatus,
        });
        
        // Отправляем new_message
        const newMessage: NewMessageMessage = {
          type: 'new_message',
          data: {
            id: 1,
            session_id: 123,
            sender_type: 'user',
            message_text: 'Test message',
            created_at: new Date().toISOString(),
            is_read: false,
          },
        };
        
        subscriptionManager.handleMessage(newMessage);
        
        // session и all должны получить сообщение, status - нет
        expect(onMessageSession).toHaveBeenCalledTimes(1);
        expect(onMessageAll).toHaveBeenCalledTimes(1);
        expect(onMessageStatus).not.toHaveBeenCalled();
        
        // Сбрасываем моки
        vi.clearAllMocks();
        
        // Отправляем status_change
        const statusMessage: StatusChangeMessage = {
          type: 'status_change',
          sessionId: 123,
          oldStatus: 'open',
          newStatus: 'closed',
        };
        
        subscriptionManager.handleMessage(statusMessage);
        
        // Только status должен получить сообщение
        expect(onMessageSession).not.toHaveBeenCalled();
        expect(onMessageAll).not.toHaveBeenCalled();
        expect(onMessageStatus).toHaveBeenCalledTimes(1);
      });

      it('должен корректно восстанавливать все типы подписок', () => {
        const sendFn = vi.fn();
        
        // Создаём подписки всех типов
        const id1 = subscriptionManager.subscribe({
          channel: 'session',
          sessionId: 123,
          onMessage: vi.fn(),
        });
        
        const id2 = subscriptionManager.subscribe({
          channel: 'all',
          onMessage: vi.fn(),
        });
        
        const id3 = subscriptionManager.subscribe({
          channel: 'status',
          onMessage: vi.fn(),
        });
        
        // Восстанавливаем все подписки
        subscriptionManager.restoreAll(sendFn);
        
        // Должны быть отправлены три subscribe сообщения
        expect(sendFn).toHaveBeenCalledTimes(3);
        
        // Проверяем, что отправлены правильные сообщения
        expect(sendFn).toHaveBeenCalledWith({
          type: 'subscribe',
          channel: 'session',
          sessionId: 123,
          subscriptionId: id1,
        });
        
        expect(sendFn).toHaveBeenCalledWith({
          type: 'subscribe',
          channel: 'all',
          sessionId: undefined,
          subscriptionId: id2,
        });
        
        expect(sendFn).toHaveBeenCalledWith({
          type: 'subscribe',
          channel: 'status',
          sessionId: undefined,
          subscriptionId: id3,
        });
      });
    });
  });

  /**
   * Дополнительные edge cases
   */
  describe('Edge Cases', () => {
    it('должен корректно обрабатывать пустой SubscriptionManager', () => {
      expect(subscriptionManager.size()).toBe(0);
      expect(subscriptionManager.getAll().size).toBe(0);
      
      // Восстановление пустого менеджера не должно вызывать ошибок
      const sendFn = vi.fn();
      subscriptionManager.restoreAll(sendFn);
      expect(sendFn).not.toHaveBeenCalled();
      
      // Очистка пустого менеджера не должна вызывать ошибок
      subscriptionManager.clear();
      expect(subscriptionManager.size()).toBe(0);
    });

    it('должен корректно обрабатывать clear()', () => {
      // Создаём несколько подписок
      subscriptionManager.subscribe({
        channel: 'session',
        sessionId: 123,
        onMessage: vi.fn(),
      });
      
      subscriptionManager.subscribe({
        channel: 'all',
        onMessage: vi.fn(),
      });
      
      expect(subscriptionManager.size()).toBe(2);
      
      // Очищаем все подписки
      subscriptionManager.clear();
      
      expect(subscriptionManager.size()).toBe(0);
      expect(subscriptionManager.getAll().size).toBe(0);
    });

    it('должен корректно обрабатывать isConfirmed()', () => {
      const id = subscriptionManager.subscribe({
        channel: 'session',
        sessionId: 123,
        onMessage: vi.fn(),
      });
      
      // До подтверждения должно быть false
      expect(subscriptionManager.isConfirmed(id)).toBe(false);
      
      // Отправляем подтверждение
      subscriptionManager.handleMessage({
        type: 'subscription_confirmed',
        subscriptionId: id,
        channel: 'session',
      });
      
      // После подтверждения должно быть true
      expect(subscriptionManager.isConfirmed(id)).toBe(true);
    });

    it('должен возвращать false для несуществующей подписки в isConfirmed()', () => {
      expect(subscriptionManager.isConfirmed('non-existent-id')).toBe(false);
    });
  });
});
