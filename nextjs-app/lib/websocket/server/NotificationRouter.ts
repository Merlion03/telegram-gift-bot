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
  sender_type: 'user' | 'admin' | 'bot';
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
      
      // Определяем целевые каналы для маршрутизации
      const targetChannels = this.getTargetChannels(channel, parsedPayload);
      
      // Отправляем уведомление всем целевым каналам
      for (const targetChannel of targetChannels) {
        await this.broadcastToSubscribers(targetChannel, message);
      }
      
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
    // ВАЖНО: Проверяем специфичные каналы ПЕРЕД общими паттернами (session_*)
    
    // 1. Канал new_message - уведомление от триггера PostgreSQL
    if (channel === 'new_message') {
      return this.createNewMessageFromTrigger(payload);
    }
    
    // 2. Канал status_changes или session_status_change - изменение статуса сессии
    if (channel === 'status_changes' || channel === 'session_status_change') {
      return this.createStatusChangeMessage(payload);
    }
    
    // 3. Канал type_changes или session_type_change - изменение типа сессии
    if (channel === 'type_changes' || channel === 'session_type_change') {
      return this.createTypeChangeMessage(payload);
    }
    
    // 4. Канал all_messages - новое сообщение для всех админов
    if (channel === 'all_messages') {
      return this.createNewMessageMessage(payload);
    }
    
    // 5. Канал session_* - новое сообщение в конкретной сессии
    // ВАЖНО: Эта проверка должна быть ПОСЛЕ специфичных каналов session_status_change и session_type_change
    if (channel.startsWith('session_')) {
      return this.createNewMessageMessage(payload);
    }
    
    // 6. Проверяем кастомные обработчики
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
   * Создание сообщения о новом сообщении от триггера PostgreSQL
   * Обрабатывает специфическую структуру payload от триггера notify_new_message()
   * 
   * @param payload - Payload от триггера с вложенной структурой data
   * @returns NewMessageMessage или null при ошибке
   */
  private createNewMessageFromTrigger(payload: any): NewMessageMessage | null {
    try {
      // Валидация структуры payload от триггера
      if (!payload.session_id || !payload.message_id || !payload.data) {
        console.error(`[NotificationRouter] ❌ Невалидный payload от триггера new_message:`, payload);
        return null;
      }
      
      const data = payload.data;
      
      // Валидация обязательных полей в data
      if (!data.id || !data.session_id || !data.message_text || !data.created_at) {
        console.error(`[NotificationRouter] ❌ Невалидные данные в payload.data:`, data);
        return null;
      }
      
      // Определяем sender_type на основе наличия telegram_id
      const senderType = this.determineSenderType(data);
      
      return {
        type: 'new_message',
        data: {
          id: data.id,
          session_id: data.session_id,
          sender_type: senderType,
          message_text: data.message_text,
          created_at: data.created_at,
          is_read: false, // Новые сообщения всегда непрочитанные
        },
      };
      
    } catch (error) {
      console.error(`[NotificationRouter] ❌ Ошибка обработки триггера new_message:`, error);
      return null;
    }
  }
  
  /**
   * Определение типа отправителя на основе данных сообщения
   * 
   * ИСПРАВЛЕНИЕ: Используем поле message_type из базы данных вместо определения по telegram_id.
   * Это корректно обрабатывает все три типа сообщений:
   * - 'from_user' → 'user' (сообщения от пользователя)
   * - 'from_bot' → 'bot' (автоматические сообщения бота)
   * - 'from_support' → 'admin' (сообщения от администратора)
   * 
   * @param data - Данные сообщения из триггера (содержит message_type из БД)
   * @returns Тип отправителя ('user', 'bot' или 'admin')
   */
  private determineSenderType(data: any): 'user' | 'admin' | 'bot' {
    // Преобразуем message_type из БД в sender_type для WebSocket
    if (data.message_type === 'from_user') {
      return 'user';
    } else if (data.message_type === 'from_bot') {
      return 'bot';
    } else if (data.message_type === 'from_support') {
      return 'admin';
    }
    
    // Fallback: если message_type отсутствует или неизвестен, определяем по telegram_id
    // (для обратной совместимости со старыми данными)
    return data.telegram_id ? 'user' : 'admin';
  }
  
  /**
   * Определение целевых каналов для маршрутизации уведомления
   * 
   * Логика маршрутизации:
   * - Для канала new_message: маршрутизируем к session_<session_id> и all_messages
   *   (уведомление должно получить и конкретная сессия, и все админы)
   * - Для всех остальных каналов: маршрутизация 1:1 (отправляем в исходный канал)
   * 
   * @param channel - Исходный канал PostgreSQL
   * @param payload - Payload уведомления
   * @returns Массив целевых каналов для отправки
   */
  private getTargetChannels(channel: string, payload: any): string[] {
    // Для канала new_message маршрутизируем к нескольким подписчикам
    if (channel === 'new_message' && payload.session_id) {
      return [
        `session_${payload.session_id}`,
        'all_messages'
      ];
    }
    
    // Для канала session_status_change маршрутизируем к status_changes
    if (channel === 'session_status_change') {
      return ['status_changes'];
    }
    
    // Для канала session_type_change маршрутизируем к type_changes
    if (channel === 'session_type_change') {
      return ['type_changes'];
    }
    
    // Для всех остальных каналов - маршрутизация 1:1 (сохраняем существующее поведение)
    return [channel];
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
