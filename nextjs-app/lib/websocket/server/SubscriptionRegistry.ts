/**
 * SubscriptionRegistry - Реестр подписок клиентов на каналы
 * 
 * Ответственность:
 * - Управление подписками клиентов на каналы уведомлений
 * - Двунаправленные индексы для быстрого поиска
 * - Поддержка трёх типов каналов: session_*, all_messages, status_changes
 * 
 * Requirements: 5.1, 5.2, 5.4
 */

import { ChannelSubscription } from '../types';

/**
 * Класс для управления реестром подписок
 * Использует двунаправленные индексы для эффективного поиска:
 * - channel → Set<clientId> (быстрый поиск подписчиков канала)
 * - clientId → ChannelSubscription[] (быстрый поиск подписок клиента)
 */
export class SubscriptionRegistry {
  // Индекс: channel → Set<clientId>
  // Позволяет быстро найти всех подписчиков конкретного канала
  private channelToClients: Map<string, Set<string>>;

  // Индекс: clientId → ChannelSubscription[]
  // Позволяет быстро найти все подписки конкретного клиента
  private clientToSubscriptions: Map<string, ChannelSubscription[]>;

  // Индекс: subscriptionId → ChannelSubscription
  // Позволяет быстро найти подписку по её ID для удаления
  private subscriptionById: Map<string, ChannelSubscription>;

  constructor() {
    this.channelToClients = new Map();
    this.clientToSubscriptions = new Map();
    this.subscriptionById = new Map();
  }

  /**
   * Добавляет новую подписку в реестр
   * Обновляет все индексы для быстрого поиска
   * 
   * @param subscription - Подписка для добавления
   */
  add(subscription: ChannelSubscription): void {
    const { clientId, subscriptionId, channel } = subscription;

    // Добавляем в индекс subscriptionId → subscription
    this.subscriptionById.set(subscriptionId, subscription);

    // Добавляем в индекс channel → clients
    if (!this.channelToClients.has(channel)) {
      this.channelToClients.set(channel, new Set());
    }
    this.channelToClients.get(channel)!.add(clientId);

    // Добавляем в индекс client → subscriptions
    if (!this.clientToSubscriptions.has(clientId)) {
      this.clientToSubscriptions.set(clientId, []);
    }
    this.clientToSubscriptions.get(clientId)!.push(subscription);
  }

  /**
   * Удаляет подписку из реестра по её ID
   * Обновляет все индексы
   * 
   * @param subscriptionId - ID подписки для удаления
   * @returns true если подписка была найдена и удалена, false иначе
   */
  remove(subscriptionId: string): boolean {
    const subscription = this.subscriptionById.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    const { clientId, channel } = subscription;

    // Удаляем из индекса subscriptionId → subscription
    this.subscriptionById.delete(subscriptionId);

    // Удаляем из индекса client → subscriptions
    const clientSubs = this.clientToSubscriptions.get(clientId);
    if (clientSubs) {
      const index = clientSubs.findIndex(sub => sub.subscriptionId === subscriptionId);
      if (index !== -1) {
        clientSubs.splice(index, 1);
      }
      
      // Если у клиента больше нет подписок, удаляем его из индекса
      if (clientSubs.length === 0) {
        this.clientToSubscriptions.delete(clientId);
      }
    }

    // Удаляем из индекса channel → clients
    const channelClients = this.channelToClients.get(channel);
    if (channelClients) {
      // Проверяем, есть ли у клиента другие подписки на этот канал
      const hasOtherSubsOnChannel = clientSubs?.some(sub => sub.channel === channel);
      
      if (!hasOtherSubsOnChannel) {
        channelClients.delete(clientId);
        
        // Если на канал больше никто не подписан, удаляем канал из индекса
        if (channelClients.size === 0) {
          this.channelToClients.delete(channel);
        }
      }
    }

    return true;
  }

  /**
   * Возвращает Set всех clientId, подписанных на указанный канал
   * 
   * @param channel - Название канала (например, "session_123", "all_messages", "status_changes")
   * @returns Set с clientId подписчиков (пустой Set если подписчиков нет)
   */
  getSubscribers(channel: string): Set<string> {
    return this.channelToClients.get(channel) || new Set();
  }

  /**
   * Возвращает все подписки конкретного клиента
   * 
   * @param clientId - ID клиента
   * @returns Массив подписок клиента (пустой массив если подписок нет)
   */
  getClientSubscriptions(clientId: string): ChannelSubscription[] {
    return this.clientToSubscriptions.get(clientId) || [];
  }

  /**
   * Удаляет все подписки клиента
   * Используется при отключении клиента для очистки
   * 
   * @param clientId - ID клиента
   * @returns Количество удалённых подписок
   */
  removeAllForClient(clientId: string): number {
    const subscriptions = this.getClientSubscriptions(clientId);
    const count = subscriptions.length;

    // Создаём копию массива subscriptionId для безопасной итерации
    // (метод remove модифицирует исходный массив subscriptions)
    const subscriptionIds = subscriptions.map(sub => sub.subscriptionId);

    // Удаляем каждую подписку через метод remove для корректного обновления всех индексов
    for (const subscriptionId of subscriptionIds) {
      this.remove(subscriptionId);
    }

    return count;
  }

  /**
   * Возвращает общее количество подписок в реестре
   * Полезно для метрик и отладки
   * 
   * @returns Количество подписок
   */
  getTotalSubscriptions(): number {
    return this.subscriptionById.size;
  }

  /**
   * Возвращает количество уникальных каналов с подписчиками
   * Полезно для метрик и отладки
   * 
   * @returns Количество активных каналов
   */
  getActiveChannelsCount(): number {
    return this.channelToClients.size;
  }

  /**
   * Проверяет, подписан ли клиент на указанный канал
   * 
   * @param clientId - ID клиента
   * @param channel - Название канала
   * @returns true если клиент подписан на канал
   */
  isSubscribed(clientId: string, channel: string): boolean {
    const channelClients = this.channelToClients.get(channel);
    return channelClients ? channelClients.has(clientId) : false;
  }

  /**
   * Очищает весь реестр
   * Используется при shutdown сервера
   */
  clear(): void {
    this.channelToClients.clear();
    this.clientToSubscriptions.clear();
    this.subscriptionById.clear();
  }
}
