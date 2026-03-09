/**
 * Unit-тесты для SubscriptionRegistry
 * Проверяют корректность работы реестра подписок
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionRegistry } from '../SubscriptionRegistry';
import { ChannelSubscription } from '../../types';

describe('SubscriptionRegistry', () => {
  let registry: SubscriptionRegistry;

  beforeEach(() => {
    registry = new SubscriptionRegistry();
  });

  describe('add()', () => {
    it('должен добавлять подписку в реестр', () => {
      const subscription: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      registry.add(subscription);

      expect(registry.getTotalSubscriptions()).toBe(1);
      expect(registry.getSubscribers('session_123').has('client-1')).toBe(true);
      expect(registry.getClientSubscriptions('client-1')).toHaveLength(1);
    });

    it('должен поддерживать множественные подписки одного клиента', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      registry.add(sub1);
      registry.add(sub2);

      expect(registry.getTotalSubscriptions()).toBe(2);
      expect(registry.getClientSubscriptions('client-1')).toHaveLength(2);
    });

    it('должен поддерживать множественных клиентов на одном канале', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'all_messages',
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      registry.add(sub1);
      registry.add(sub2);

      const subscribers = registry.getSubscribers('all_messages');
      expect(subscribers.size).toBe(2);
      expect(subscribers.has('client-1')).toBe(true);
      expect(subscribers.has('client-2')).toBe(true);
    });

    it('должен поддерживать три типа каналов: session_*, all_messages, status_changes', () => {
      const sessionSub: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_456',
        sessionId: 456,
      };

      const allSub: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      const statusSub: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-3',
        channel: 'status_changes',
      };

      registry.add(sessionSub);
      registry.add(allSub);
      registry.add(statusSub);

      expect(registry.getTotalSubscriptions()).toBe(3);
      expect(registry.getActiveChannelsCount()).toBe(3);
      expect(registry.getSubscribers('session_456').has('client-1')).toBe(true);
      expect(registry.getSubscribers('all_messages').has('client-1')).toBe(true);
      expect(registry.getSubscribers('status_changes').has('client-1')).toBe(true);
    });
  });

  describe('remove()', () => {
    it('должен удалять подписку по subscriptionId', () => {
      const subscription: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      registry.add(subscription);
      expect(registry.getTotalSubscriptions()).toBe(1);

      const removed = registry.remove('sub-1');
      expect(removed).toBe(true);
      expect(registry.getTotalSubscriptions()).toBe(0);
      expect(registry.getSubscribers('session_123').size).toBe(0);
    });

    it('должен возвращать false при попытке удалить несуществующую подписку', () => {
      const removed = registry.remove('non-existent');
      expect(removed).toBe(false);
    });

    it('должен корректно обновлять индексы при удалении', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      registry.add(sub1);
      registry.add(sub2);

      registry.remove('sub-1');

      // Клиент всё ещё должен быть в реестре с одной подпиской
      expect(registry.getClientSubscriptions('client-1')).toHaveLength(1);
      expect(registry.getClientSubscriptions('client-1')[0].subscriptionId).toBe('sub-2');
      
      // Канал session_123 должен быть удалён из индекса
      expect(registry.getSubscribers('session_123').size).toBe(0);
      
      // Канал all_messages должен остаться
      expect(registry.getSubscribers('all_messages').has('client-1')).toBe(true);
    });

    it('должен удалять клиента из индекса канала только если нет других подписок на этот канал', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'session_123',
        sessionId: 123,
      };

      registry.add(sub1);
      registry.add(sub2);

      registry.remove('sub-1');

      // Клиент всё ещё должен быть подписан на канал через sub-2
      expect(registry.getSubscribers('session_123').has('client-1')).toBe(true);
      expect(registry.getClientSubscriptions('client-1')).toHaveLength(1);
    });
  });

  describe('getSubscribers()', () => {
    it('должен возвращать пустой Set для канала без подписчиков', () => {
      const subscribers = registry.getSubscribers('non-existent-channel');
      expect(subscribers.size).toBe(0);
    });

    it('должен возвращать всех подписчиков канала', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'all_messages',
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      const sub3: ChannelSubscription = {
        clientId: 'client-3',
        subscriptionId: 'sub-3',
        channel: 'status_changes',
      };

      registry.add(sub1);
      registry.add(sub2);
      registry.add(sub3);

      const allMessagesSubscribers = registry.getSubscribers('all_messages');
      expect(allMessagesSubscribers.size).toBe(2);
      expect(allMessagesSubscribers.has('client-1')).toBe(true);
      expect(allMessagesSubscribers.has('client-2')).toBe(true);
      expect(allMessagesSubscribers.has('client-3')).toBe(false);
    });
  });

  describe('getClientSubscriptions()', () => {
    it('должен возвращать пустой массив для клиента без подписок', () => {
      const subscriptions = registry.getClientSubscriptions('non-existent-client');
      expect(subscriptions).toEqual([]);
    });

    it('должен возвращать все подписки клиента', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      const sub3: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-3',
        channel: 'status_changes',
      };

      registry.add(sub1);
      registry.add(sub2);
      registry.add(sub3);

      const client1Subs = registry.getClientSubscriptions('client-1');
      expect(client1Subs).toHaveLength(2);
      expect(client1Subs.map(s => s.subscriptionId)).toContain('sub-1');
      expect(client1Subs.map(s => s.subscriptionId)).toContain('sub-2');
    });
  });

  describe('removeAllForClient()', () => {
    it('должен удалять все подписки клиента', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      const sub3: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-3',
        channel: 'status_changes',
      };

      registry.add(sub1);
      registry.add(sub2);
      registry.add(sub3);

      const removedCount = registry.removeAllForClient('client-1');

      expect(removedCount).toBe(2);
      expect(registry.getTotalSubscriptions()).toBe(1);
      expect(registry.getClientSubscriptions('client-1')).toHaveLength(0);
      expect(registry.getClientSubscriptions('client-2')).toHaveLength(1);
    });

    it('должен возвращать 0 для клиента без подписок', () => {
      const removedCount = registry.removeAllForClient('non-existent-client');
      expect(removedCount).toBe(0);
    });

    it('должен корректно обновлять все индексы', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      registry.add(sub1);
      registry.add(sub2);

      registry.removeAllForClient('client-1');

      // Все индексы должны быть очищены
      expect(registry.getSubscribers('session_123').size).toBe(0);
      expect(registry.getSubscribers('all_messages').size).toBe(0);
      expect(registry.getActiveChannelsCount()).toBe(0);
    });
  });

  describe('isSubscribed()', () => {
    it('должен возвращать true если клиент подписан на канал', () => {
      const subscription: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      registry.add(subscription);

      expect(registry.isSubscribed('client-1', 'session_123')).toBe(true);
    });

    it('должен возвращать false если клиент не подписан на канал', () => {
      expect(registry.isSubscribed('client-1', 'session_123')).toBe(false);
    });

    it('должен возвращать false после удаления подписки', () => {
      const subscription: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      registry.add(subscription);
      expect(registry.isSubscribed('client-1', 'session_123')).toBe(true);

      registry.remove('sub-1');
      expect(registry.isSubscribed('client-1', 'session_123')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('должен очищать весь реестр', () => {
      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      registry.add(sub1);
      registry.add(sub2);

      registry.clear();

      expect(registry.getTotalSubscriptions()).toBe(0);
      expect(registry.getActiveChannelsCount()).toBe(0);
      expect(registry.getClientSubscriptions('client-1')).toHaveLength(0);
      expect(registry.getSubscribers('session_123').size).toBe(0);
    });
  });

  describe('Метрики', () => {
    it('getTotalSubscriptions() должен возвращать общее количество подписок', () => {
      expect(registry.getTotalSubscriptions()).toBe(0);

      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      registry.add(sub1);
      expect(registry.getTotalSubscriptions()).toBe(1);

      registry.add(sub2);
      expect(registry.getTotalSubscriptions()).toBe(2);

      registry.remove('sub-1');
      expect(registry.getTotalSubscriptions()).toBe(1);
    });

    it('getActiveChannelsCount() должен возвращать количество активных каналов', () => {
      expect(registry.getActiveChannelsCount()).toBe(0);

      const sub1: ChannelSubscription = {
        clientId: 'client-1',
        subscriptionId: 'sub-1',
        channel: 'session_123',
        sessionId: 123,
      };

      const sub2: ChannelSubscription = {
        clientId: 'client-2',
        subscriptionId: 'sub-2',
        channel: 'all_messages',
      };

      const sub3: ChannelSubscription = {
        clientId: 'client-3',
        subscriptionId: 'sub-3',
        channel: 'all_messages',
      };

      registry.add(sub1);
      expect(registry.getActiveChannelsCount()).toBe(1);

      registry.add(sub2);
      expect(registry.getActiveChannelsCount()).toBe(2);

      // Добавление ещё одного клиента на существующий канал не должно увеличивать счётчик
      registry.add(sub3);
      expect(registry.getActiveChannelsCount()).toBe(2);
    });
  });

  describe('Двунаправленные индексы', () => {
    it('должен поддерживать быстрый поиск подписчиков по каналу', () => {
      // Добавляем 100 клиентов на один канал
      for (let i = 0; i < 100; i++) {
        registry.add({
          clientId: `client-${i}`,
          subscriptionId: `sub-${i}`,
          channel: 'all_messages',
        });
      }

      const subscribers = registry.getSubscribers('all_messages');
      expect(subscribers.size).toBe(100);
      
      // Проверка должна быть быстрой (O(1))
      expect(subscribers.has('client-50')).toBe(true);
    });

    it('должен поддерживать быстрый поиск подписок по клиенту', () => {
      // Добавляем 100 подписок для одного клиента
      for (let i = 0; i < 100; i++) {
        registry.add({
          clientId: 'client-1',
          subscriptionId: `sub-${i}`,
          channel: `session_${i}`,
          sessionId: i,
        });
      }

      const subscriptions = registry.getClientSubscriptions('client-1');
      expect(subscriptions).toHaveLength(100);
      
      // Проверка должна быть быстрой (O(1))
      expect(subscriptions.some(s => s.subscriptionId === 'sub-50')).toBe(true);
    });
  });
});
