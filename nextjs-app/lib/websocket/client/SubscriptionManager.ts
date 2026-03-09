/**
 * SubscriptionManager - управление подписками на каналы уведомлений
 * 
 * Ответственность:
 * - Хранение активных подписок в Map структуре
 * - Создание подписок с уникальными ID
 * - Восстановление подписок после переподключения
 * - Обработка входящих сообщений и маршрутизация к соответствующим подпискам
 * - Поддержка трёх типов подписок: session, all, status
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Subscription,
  SubscriptionType,
  ServerMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  SubscriptionConfirmedMessage,
  NewMessageMessage,
  StatusChangeMessage,
  TypeChangeMessage,
  ErrorMessage,
} from '../types';

/**
 * Параметры для создания подписки (без ID, который генерируется автоматически)
 */
export interface SubscriptionParams {
  channel: SubscriptionType;
  sessionId?: number;
  onMessage: (message: ServerMessage) => void;
  onError?: (error: Error) => void;
  onConfirmed?: () => void;
}

/**
 * Внутреннее представление подписки с дополнительными полями
 */
interface InternalSubscription extends Subscription {
  onConfirmed?: () => void;
  confirmed: boolean;
}

/**
 * Менеджер подписок на каналы уведомлений
 */
export class SubscriptionManager {
  /** Хранилище всех активных подписок */
  private subscriptions: Map<string, InternalSubscription> = new Map();

  /**
   * Создать новую подписку
   * 
   * @param params - параметры подписки
   * @returns уникальный ID подписки
   * 
   * Requirements: 5.2 - сохранение подписки с уникальным ID
   */
  subscribe(params: SubscriptionParams): string {
    // Генерируем уникальный ID для подписки
    const id = uuidv4();

    // Создаём внутреннее представление подписки
    const subscription: InternalSubscription = {
      id,
      channel: params.channel,
      sessionId: params.sessionId,
      onMessage: params.onMessage,
      onError: params.onError,
      onConfirmed: params.onConfirmed,
      confirmed: false,
    };

    // Сохраняем подписку
    this.subscriptions.set(id, subscription);

    return id;
  }

  /**
   * Удалить подписку
   * 
   * @param subscriptionId - ID подписки для удаления
   * @returns true если подписка была удалена, false если не найдена
   * 
   * Requirements: 5.4 - удаление подписки
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Получить все активные подписки
   * 
   * @returns Map всех подписок
   */
  getAll(): Map<string, Subscription> {
    // Возвращаем копию Map без внутренних полей
    const result = new Map<string, Subscription>();
    
    for (const [id, sub] of this.subscriptions.entries()) {
      result.set(id, {
        id: sub.id,
        channel: sub.channel,
        sessionId: sub.sessionId,
        onMessage: sub.onMessage,
        onError: sub.onError,
      });
    }
    
    return result;
  }

  /**
   * Получить подписку по ID
   * 
   * @param subscriptionId - ID подписки
   * @returns подписка или undefined если не найдена
   */
  get(subscriptionId: string): Subscription | undefined {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return undefined;

    return {
      id: sub.id,
      channel: sub.channel,
      sessionId: sub.sessionId,
      onMessage: sub.onMessage,
      onError: sub.onError,
    };
  }

  /**
   * Восстановить все подписки после переподключения
   * Отправляет subscribe сообщения для всех активных подписок
   * 
   * @param sendFn - функция для отправки сообщений на сервер
   * 
   * Requirements: 5.3 - автоматическое восстановление подписок
   */
  restoreAll(sendFn: (message: SubscribeMessage) => void): void {
    for (const subscription of this.subscriptions.values()) {
      // Сбрасываем флаг подтверждения
      subscription.confirmed = false;

      // Отправляем subscribe сообщение
      const message: SubscribeMessage = {
        type: 'subscribe',
        channel: subscription.channel,
        sessionId: subscription.sessionId,
        subscriptionId: subscription.id,
      };

      sendFn(message);
    }
  }

  /**
   * Обработать входящее сообщение от сервера
   * Маршрутизирует сообщение к соответствующим подпискам
   * 
   * @param message - сообщение от сервера
   * 
   * Requirements: 5.6 - вызов callback при подтверждении подписки
   */
  handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'subscription_confirmed':
        this.handleSubscriptionConfirmed(message);
        break;

      case 'new_message':
        this.handleNewMessage(message);
        break;

      case 'status_change':
        this.handleStatusChange(message);
        break;

      case 'type_change':
        this.handleTypeChange(message);
        break;

      case 'error':
        this.handleError(message);
        break;

      // Другие типы сообщений не относятся к подпискам
      default:
        break;
    }
  }

  /**
   * Обработать подтверждение подписки
   */
  private handleSubscriptionConfirmed(message: SubscriptionConfirmedMessage): void {
    const subscription = this.subscriptions.get(message.subscriptionId);
    
    if (subscription) {
      // Помечаем подписку как подтверждённую
      subscription.confirmed = true;

      // Вызываем callback подтверждения если он есть
      if (subscription.onConfirmed) {
        subscription.onConfirmed();
      }
    }
  }

  /**
   * Обработать новое сообщение
   * Маршрутизирует к подпискам типа 'session' и 'all'
   */
  private handleNewMessage(message: NewMessageMessage): void {
    const sessionId = message.data.session_id;

    for (const subscription of this.subscriptions.values()) {
      // Отправляем сообщение подпискам на конкретную сессию
      if (subscription.channel === 'session' && subscription.sessionId === sessionId) {
        subscription.onMessage(message);
      }
      
      // Отправляем сообщение подпискам на все сообщения
      if (subscription.channel === 'all') {
        subscription.onMessage(message);
      }
    }
  }

  /**
   * Обработать изменение статуса сессии
   * Маршрутизирует к подпискам типа 'status'
   */
  private handleStatusChange(message: StatusChangeMessage): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.channel === 'status') {
        subscription.onMessage(message);
      }
    }
  }

  /**
   * Обработать изменение типа сессии
   * Маршрутизирует к подпискам типа 'status'
   */
  private handleTypeChange(message: TypeChangeMessage): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.channel === 'status') {
        subscription.onMessage(message);
      }
    }
  }

  /**
   * Обработать ошибку подписки
   */
  private handleError(message: ErrorMessage): void {
    // Если ошибка связана с конкретной подпиской
    if (message.subscriptionId) {
      const subscription = this.subscriptions.get(message.subscriptionId);
      
      if (subscription && subscription.onError) {
        const error = new Error(message.message);
        error.name = message.code;
        subscription.onError(error);
      }
    }
  }

  /**
   * Очистить все подписки
   * Используется при полном отключении
   */
  clear(): void {
    this.subscriptions.clear();
  }

  /**
   * Получить количество активных подписок
   */
  size(): number {
    return this.subscriptions.size;
  }

  /**
   * Проверить, подтверждена ли подписка
   * 
   * @param subscriptionId - ID подписки
   * @returns true если подписка подтверждена, false иначе
   */
  isConfirmed(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    return subscription?.confirmed ?? false;
  }
}
