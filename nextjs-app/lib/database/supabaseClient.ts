/**
 * Supabase Client для real-time обновлений
 * Обеспечивает подписку на изменения в таблице support_messages
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { SupportMessage } from '@/types/support';

/**
 * Тип callback функции для обработки новых сообщений
 */
export type MessageCallback = (message: SupportMessage) => void;

/**
 * Тип callback функции для обработки ошибок
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Конфигурация Supabase клиента
 */
interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

/**
 * SupabaseRealtimeClient - клиент для real-time подписок
 * Использует Supabase Realtime для получения обновлений из PostgreSQL
 */
export class SupabaseRealtimeClient {
  private client: SupabaseClient;
  private channels: Map<string, RealtimeChannel> = new Map();
  private static instance: SupabaseRealtimeClient | null = null;

  /**
   * Создаёт новый экземпляр SupabaseRealtimeClient
   * @param config - Конфигурация подключения (опционально, по умолчанию из env)
   */
  constructor(config?: SupabaseConfig) {
    const supabaseConfig = config || this.getConfigFromEnv();
    
    // Используем service role key для серверных операций, anon key для клиентских
    const key = supabaseConfig.serviceRoleKey || supabaseConfig.anonKey;
    
    this.client = createClient(supabaseConfig.url, key, {
      auth: {
        persistSession: false, // Не сохраняем сессию на сервере
      },
      realtime: {
        params: {
          eventsPerSecond: 10, // Ограничение событий в секунду
        },
      },
    });
  }

  /**
   * Получает конфигурацию из переменных окружения
   */
  private getConfigFromEnv(): SupabaseConfig {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
    }

    return { url, anonKey, serviceRoleKey };
  }

  /**
   * Singleton pattern для переиспользования клиента
   */
  static getInstance(): SupabaseRealtimeClient {
    if (!SupabaseRealtimeClient.instance) {
      SupabaseRealtimeClient.instance = new SupabaseRealtimeClient();
    }
    return SupabaseRealtimeClient.instance;
  }

  /**
   * Подписывается на новые сообщения для конкретной сессии
   * @param sessionId - ID сессии поддержки
   * @param onMessage - Callback для обработки новых сообщений
   * @param onError - Callback для обработки ошибок (опционально)
   * @returns Функция для отписки
   */
  subscribeToSessionMessages(
    sessionId: number,
    onMessage: MessageCallback,
    onError?: ErrorCallback
  ): () => void {
    const channelName = `session-${sessionId}`;

    // Проверяем, не существует ли уже подписка
    if (this.channels.has(channelName)) {
      console.warn(`Channel ${channelName} already exists, removing old subscription`);
      this.unsubscribe(channelName);
    }

    // Создаём канал для подписки
    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          try {
            // Преобразуем payload в SupportMessage
            const message = this.transformPayloadToMessage(payload.new);
            onMessage(message);
          } catch (error) {
            console.error('Error processing message payload:', error);
            if (onError) {
              onError(error instanceof Error ? error : new Error('Unknown error'));
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Channel error: ${channelName}`);
          if (onError) {
            onError(new Error(`Channel subscription error: ${channelName}`));
          }
        } else if (status === 'TIMED_OUT') {
          console.error(`Channel timeout: ${channelName}`);
          if (onError) {
            onError(new Error(`Channel subscription timeout: ${channelName}`));
          }
        }
      });

    // Сохраняем канал для последующей отписки
    this.channels.set(channelName, channel);

    // Возвращаем функцию для отписки
    return () => this.unsubscribe(channelName);
  }

  /**
   * Подписывается на все новые сообщения (для админки)
   * @param onMessage - Callback для обработки новых сообщений
   * @param onError - Callback для обработки ошибок (опционально)
   * @returns Функция для отписки
   */
  subscribeToAllMessages(
    onMessage: MessageCallback,
    onError?: ErrorCallback
  ): () => void {
    const channelName = 'all-messages';

    // Проверяем, не существует ли уже подписка
    if (this.channels.has(channelName)) {
      console.warn(`Channel ${channelName} already exists, removing old subscription`);
      this.unsubscribe(channelName);
    }

    // Создаём канал для подписки на все сообщения
    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
        },
        (payload) => {
          try {
            const message = this.transformPayloadToMessage(payload.new);
            onMessage(message);
          } catch (error) {
            console.error('Error processing message payload:', error);
            if (onError) {
              onError(error instanceof Error ? error : new Error('Unknown error'));
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Channel error: ${channelName}`);
          if (onError) {
            onError(new Error(`Channel subscription error: ${channelName}`));
          }
        } else if (status === 'TIMED_OUT') {
          console.error(`Channel timeout: ${channelName}`);
          if (onError) {
            onError(new Error(`Channel subscription timeout: ${channelName}`));
          }
        }
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Подписывается на изменения статуса сессий
   * @param onStatusChange - Callback для обработки изменений статуса
   * @param onError - Callback для обработки ошибок (опционально)
   * @returns Функция для отписки
   */
  subscribeToSessionStatusChanges(
    onStatusChange: (sessionId: number, status: string) => void,
    onError?: ErrorCallback
  ): () => void {
    const channelName = 'session-status-changes';

    if (this.channels.has(channelName)) {
      console.warn(`Channel ${channelName} already exists, removing old subscription`);
      this.unsubscribe(channelName);
    }

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_sessions',
        },
        (payload) => {
          try {
            const sessionId = payload.new.id as number;
            const status = payload.new.status as string;
            onStatusChange(sessionId, status);
          } catch (error) {
            console.error('Error processing status change payload:', error);
            if (onError) {
              onError(error instanceof Error ? error : new Error('Unknown error'));
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Channel error: ${channelName}`);
          if (onError) {
            onError(new Error(`Channel subscription error: ${channelName}`));
          }
        }
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Преобразует payload от Supabase в SupportMessage
   */
  private transformPayloadToMessage(payload: any): SupportMessage {
    // Валидация обязательных полей
    if (!payload.id || !payload.session_id || !payload.telegram_id || 
        !payload.message_type || !payload.message_text || !payload.created_at) {
      throw new Error('Invalid message payload: missing required fields');
    }
    
    return {
      id: payload.id,
      session_id: payload.session_id,
      telegram_id: payload.telegram_id,
      message_type: payload.message_type,
      message_text: payload.message_text,
      file_id: payload.file_id || undefined,
      created_at: payload.created_at,
      delivered: payload.delivered,
    };
  }

  /**
   * Отписывается от канала
   * @param channelName - Имя канала
   */
  private async unsubscribe(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    
    if (channel) {
      await this.client.removeChannel(channel);
      this.channels.delete(channelName);
      console.log(`Unsubscribed from channel: ${channelName}`);
    }
  }

  /**
   * Отписывается от всех каналов
   */
  async unsubscribeAll(): Promise<void> {
    const channelNames = Array.from(this.channels.keys());
    
    for (const channelName of channelNames) {
      await this.unsubscribe(channelName);
    }
  }

  /**
   * Получает базовый Supabase клиент для прямых запросов
   * Используется для операций, не связанных с real-time
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Проверяет подключение к Supabase
   * @returns true если подключение успешно
   */
  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('support_messages')
        .select('id')
        .limit(1);
      
      return !error;
    } catch (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
  }
}

/**
 * Функция для получения singleton instance
 */
export function getSupabaseClient(): SupabaseRealtimeClient {
  return SupabaseRealtimeClient.getInstance();
}
