/**
 * NotificationRouter - Маршрутизация уведомлений от PostgreSQL к клиентам
 * 
 * Ответственность:
 * - Обработка уведомлений от PostgreSQL LISTEN
 * - Парсинг JSON payload от PostgreSQL
 * - Определение типа уведомления (new_message, status_change, type_change)
 * - Маршрутизация уведомлений к соответствующим подписчикам
 * - Обработка ошибок при отправке
 * 
 * Requirements: 5.3, 9.3
 */

import type { ServerMessage, NewMessageMessage, StatusChangeMessage, TypeChangeMessage } from '../types';
import type { SubscriptionRegistry } from './SubscriptionRegistry';
import type { ConnectionHandler } from './ConnectionHandler';
import { ERROR_CODES } from '../constants';

/**
 * Payload от PostgreSQL для нового сообщения
 */
interface PostgresNewMessagePayload {
  id: number;
  session_id: number;
  sender_type: 'user' | 'admin';
  message_text: string;
  created_at: string;
  is_read: boolean;
}

/**
 * Payload от PostgreSQL для изменения статуса
 */
interface PostgresStatusChangePayload {
  session_id: number;
  old_status: string;
  new_status: string;
}

/**
 * Payload от PostgreSQL для изменения типа
 */
interface PostgresTypeChangePayload {
  session_id: number;
  old_type: string;
  new_type: string;
}

/**
 * Обработчик для конкретного типа уведомления
 */
type NotificationHandler = (payload: any) => Promise<void>;

/**
 * Класс для маршрутизации уведомлений от PostgreSQL к WebSocket клиентам
 * Validates: Requirements 5.3, 9.3
 */
export class NotificationRouter {
  /** Реестр подписок для поиска подписчиков */
  private subscriptionRegistry: SubscriptionRegistry;
  
  /** Обработчик соединений для отправки сообщений */
  private connectionHandler: ConnectionHandler;
  
  /** Обработчики для различных типов уведомлений */
  private handlers: Map<string, NotificationHandler> = new Map();
  
  /**
   * Создаёт экземпляр NotificationRouter
   * 
   * @param subscriptionRegistry - Реестр подписок
   * @param connectionHandler - Обработчик соединений
   */
  constructor(
    subscriptionRegistry: SubscriptionRegistry,
    connectionHandler: ConnectionHandler
  ) {
    this.subscriptionRegistry = subscriptionRegistry;
    this.connectionHandler = connectionHandler;
  }
  
  /**
   * Обработка уведомления от PostgreSQL LISTEN
   * Validates: Requirements 5.3
   * 
   * @param channel - Название канала PostgreSQL (например, "session_123", "all_messages", "status_changes")
   * @param payload - JSON payload от PostgreSQL
   */
  async handleNotification(channel: string, payload: string): Promise<void> {
    console.log(`[NotificationRouter] 📨 Получено уведомление:`, {
      channel,
      payload: payload.substring(0, 100), // Логируем первые 100 символов
      timestamp: new Date().toISOString(),
    });
    
    try {
      // Парсим JSON payload
      const parsedPayload = JSON.parse(payload);
      
      // Определяем тип уведомления и создаём соответствующее сообщение
      const message = this.createMessageFromPayload(channel, parsedPayload);
      
      if (!message) {
        console.warn(`[NotificationRouter] ⚠️ Не удалось определить тип уведомления для канала: ${channel}`);
        return;
      }
      
      // Отправляем уведомление подписчикам
      await this.broadcastToSubscribers(channel, message);
      
    } catch (error) {
      console.error(`[NotificationRouter] ❌ Ошибка обработки уведомления:`, {
        channel,
        error: error instanceof Error ? error.message : String(error),
        payload: payload.substring(0, 100),
      });
      
      // Не пробрасываем ошибку дальше - логируем и продолжаем работу
    }
  }
  
  /**
   * Отправка уведомления всем подписчикам канала
   * Validates: Requirements 5.3, 9.3
   * 
   * @param channel - Название канала
   * @param message - Сообщение для отправки
   */
  async broadcastToSubscribers(channel: string, message: ServerMessage): Promise<void> {
    // Получаем всех подписчиков канала
    const subscribers = this.subscriptionRegistry.getSubscribers(channel);
    
    if (subscribers.size === 0) {
      console.log(`[NotificationRouter] ℹ️ Нет подписчиков для канала: ${channel}`);
      return;
    }
    
    console.log(`[NotificationRouter] 📤 Отправка уведомления подписчикам:`, {
      channel,
      subscribersCount: subscribers.size,
      messageType: message.type,
    });
    
    // Счётчики для статистики
    let successCount = 0;
    let errorCount = 0;
    
    // Отправляем сообщение каждому подписчику
    // Используем Array.from для совместимости с ES5
    const subscribersList = Array.from(subscribers);
    for (const clientId of subscribersList) {
      try {
        const sent = this.connectionHandler.sendToClient(clientId, message);
        
        if (sent) {
          successCount++;
        } else {
          errorCount++;
          console.warn(`[NotificationRouter] ⚠️ Не удалось отправить сообщение клиенту: ${clientId}`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`[NotificationRouter] ❌ Ошибка отправки сообщения клиенту ${clientId}:`, error);
      }
    }
    
    console.log(`[NotificationRouter] ✅ Отправка завершена:`, {
      channel,
      total: subscribers.size,
      success: successCount,
      errors: errorCount,
    });
  }
  
  /**
   * Регистрация обработчика для типа уведомления
   * Позволяет расширять функциональность без изменения основного кода
   * 
   * @param type - Тип уведомления (например, "custom_event")
   * @param handler - Функция-обработчик
   */
  registerHandler(type: string, handler: NotificationHandler): void {
    this.handlers.set(type, handler);
    console.log(`[NotificationRouter] ✅ Зарегистрирован обработчик для типа: ${type}`);
  }
  
  /**
   * Отправка error сообщения клиенту при отклонении подписки
   * Validates: Requirements 9.3
   * 
   * @param clientId - ID клиента
   * @param subscriptionId - ID подписки
   * @param reason - Причина отклонения
   */
  sendSubscriptionError(clientId: string, subscriptionId: string, reason: string): void {
    const errorMessage: ServerMessage = {
      type: 'error',
      code: ERROR_CODES.SUBSCRIPTION_REJECTED,
      message: reason,
      subscriptionId,
    };
    
    console.log(`[NotificationRouter] ❌ Отправка ошибки подписки:`, {
      clientId,
      subscriptionId,
      reason,
    });
    
    this.connectionHandler.sendToClient(clientId, errorMessage);
  }
  
  // ============================================================================
  // Приватные методы
  // ============================================================================
  
  /**
   * Создание ServerMessage из payload PostgreSQL
   * Определяет тип уведомления на основе канала и структуры payload
   * 
   * @param channel - Название канала
   * @param payload - Распарсенный JSON payload
   * @returns ServerMessage или null если тип не определён
   */
  private createMessageFromPayload(channel: string, payload: any): ServerMessage | null {
    // Определяем тип уведомления по названию канала
    
    // 1. Канал all_messages - новое сообщение для всех админов
    if (channel === 'all_messages') {
      return this.createNewMessageMessage(payload);
    }
    
    // 2. Канал session_* - новое сообщение в конкретной сессии
    if (channel.startsWith('session_')) {
      return this.createNewMessageMessage(payload);
    }
    
    // 3. Канал status_changes - изменение статуса сессии
    if (channel === 'status_changes') {
      return this.createStatusChangeMessage(payload);
    }
    
    // 4. Канал type_changes - изменение типа сессии
    if (channel === 'type_changes') {
      return this.createTypeChangeMessage(payload);
    }
    
    // 5. Проверяем кастомные обработчики
    const handler = this.handlers.get(channel);
    if (handler) {
      // Кастомные обработчики должны сами создавать сообщения
      // Здесь мы просто вызываем их асинхронно
      handler(payload).catch(error => {
        console.error(`[NotificationRouter] ❌ Ошибка в кастомном обработчике для ${channel}:`, error);
      });
      return null;
    }
    
    // Неизвестный тип канала
    console.warn(`[NotificationRouter] ⚠️ Неизвестный канал: ${channel}`);
    return null;
  }
  
  /**
   * Создание сообщения о новом сообщении
   */
  private createNewMessageMessage(payload: any): NewMessageMessage | null {
    try {
      const data = payload as PostgresNewMessagePayload;
      
      // Валидация обязательных полей
      if (!data.id || !data.session_id || !data.sender_type || !data.message_text || !data.created_at) {
        console.error(`[NotificationRouter] ❌ Невалидный payload для new_message:`, payload);
        return null;
      }
      
      return {
        type: 'new_message',
        data: {
          id: data.id,
          session_id: data.session_id,
          sender_type: data.sender_type,
          message_text: data.message_text,
          created_at: data.created_at,
          is_read: data.is_read ?? false,
        },
      };
      
    } catch (error) {
      console.error(`[NotificationRouter] ❌ Ошибка создания new_message:`, error);
      return null;
    }
  }
  
  /**
   * Создание сообщения об изменении статуса
   */
  private createStatusChangeMessage(payload: any): StatusChangeMessage | null {
    try {
      const data = payload as PostgresStatusChangePayload;
      
      // Валидация обязательных полей
      if (!data.session_id || !data.old_status || !data.new_status) {
        console.error(`[NotificationRouter] ❌ Невалидный payload для status_change:`, payload);
        return null;
      }
      
      return {
        type: 'status_change',
        sessionId: data.session_id,
        oldStatus: data.old_status,
        newStatus: data.new_status,
      };
      
    } catch (error) {
      console.error(`[NotificationRouter] ❌ Ошибка создания status_change:`, error);
      return null;
    }
  }
  
  /**
   * Создание сообщения об изменении типа
   */
  private createTypeChangeMessage(payload: any): TypeChangeMessage | null {
    try {
      const data = payload as PostgresTypeChangePayload;
      
      // Валидация обязательных полей
      if (!data.session_id || !data.old_type || !data.new_type) {
        console.error(`[NotificationRouter] ❌ Невалидный payload для type_change:`, payload);
        return null;
      }
      
      return {
        type: 'type_change',
        sessionId: data.session_id,
        oldType: data.old_type,
        newType: data.new_type,
      };
      
    } catch (error) {
      console.error(`[NotificationRouter] ❌ Ошибка создания type_change:`, error);
      return null;
    }
  }
}
