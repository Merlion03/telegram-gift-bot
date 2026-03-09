/**
 * PostgresRealtimeClient - Главный класс для WebSocket клиента
 * 
 * Интегрирует все клиентские модули для обеспечения надёжной real-time коммуникации:
 * - ConnectionManager: управление WebSocket соединением
 * - StateManager: управление состоянием соединения
 * - SubscriptionManager: управление подписками на каналы
 * - MessageQueue: буферизация сообщений при разрыве
 * - HeartbeatMonitor: мониторинг активности соединения
 * - ReconnectionStrategy: автоматическое переподключение
 * 
 * Requirements: 2.1, 2.2, 2.5, 3.5, 4.3, 4.4, 8.1
 */

import type {
  ServerMessage,
  ConnectedMessage,
  SubscriptionType,
  ErrorCallback,
  MessageCallback,
  ConnectionState,
} from '../types';
import { CLOSE_CODES, CUSTOM_CLOSE_CODES } from '../constants';
import { ConnectionManager } from './ConnectionManager';
import { StateManager } from './StateManager';
import { SubscriptionManager, SubscriptionParams } from './SubscriptionManager';
import { MessageQueue } from './MessageQueue';
import { HeartbeatMonitor } from './HeartbeatMonitor';
import { ReconnectionStrategy } from './ReconnectionStrategy';

/**
 * Конфигурация клиента
 */
export interface PostgresRealtimeClientConfig {
  /** URL WebSocket сервера */
  wsUrl?: string;
  
  /** Функция для получения токена аутентификации */
  getToken?: () => Promise<string | null>;
  
  /** Функция для проверки авторизации пользователя */
  isUserAuthorized?: () => boolean;
}

/**
 * Конфигурация по умолчанию
 */
const DEFAULT_CONFIG: Required<PostgresRealtimeClientConfig> = {
  wsUrl: typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/realtime`
    : 'ws://localhost:3000/api/realtime',
  
  getToken: async () => {
    // Получаем токен через API endpoint
    try {
      const response = await fetch('/api/auth/ws-token');
      if (response.ok) {
        const data = await response.json();
        return data.token || null;
      }
      return null;
    } catch (error) {
      console.error('[PostgresRealtimeClient] Ошибка получения токена:', error);
      return null;
    }
  },
  
  isUserAuthorized: () => {
    // По умолчанию считаем пользователя авторизованным
    // В реальном приложении здесь должна быть проверка сессии
    return true;
  },
};

/**
 * Главный класс WebSocket клиента с модульной архитектурой
 * Singleton pattern для переиспользования соединения
 */
export class PostgresRealtimeClient {
  private static instance: PostgresRealtimeClient | null = null;
  
  /** Конфигурация клиента */
  private config: Required<PostgresRealtimeClientConfig>;
  
  /** Модули клиента */
  private connectionManager: ConnectionManager;
  private stateManager: StateManager;
  private subscriptionManager: SubscriptionManager;
  private messageQueue: MessageQueue;
  private heartbeatMonitor: HeartbeatMonitor;
  private reconnectionStrategy: ReconnectionStrategy;
  
  /** ID клиента (присваивается сервером) */
  private clientId: string | null = null;
  
  /** URL и токен для подключения */
  private wsUrl: string | null = null;
  private token: string | null = null;

  /**
   * Private constructor для singleton pattern
   * 
   * @param config - Конфигурация клиента
   */
  private constructor(config?: PostgresRealtimeClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Инициализация модулей
    this.stateManager = new StateManager();
    this.connectionManager = new ConnectionManager(this.stateManager);
    this.subscriptionManager = new SubscriptionManager();
    this.messageQueue = new MessageQueue();
    this.heartbeatMonitor = new HeartbeatMonitor();
    this.reconnectionStrategy = new ReconnectionStrategy(this.config.isUserAuthorized);
    
    // Настройка обработчиков событий
    this.setupEventHandlers();
  }

  /**
   * Получить singleton instance клиента
   * 
   * @param config - Конфигурация клиента (используется только при первом вызове)
   * @returns Singleton instance PostgresRealtimeClient
   */
  static getInstance(config?: PostgresRealtimeClientConfig): PostgresRealtimeClient {
    if (!PostgresRealtimeClient.instance) {
      PostgresRealtimeClient.instance = new PostgresRealtimeClient(config);
    }
    return PostgresRealtimeClient.instance;
  }

  /**
   * Создать новый экземпляр клиента для тестирования
   * ВАЖНО: Используется только в тестах! Не использовать в production коде.
   * 
   * @param wsUrl - URL WebSocket сервера
   * @param token - Токен аутентификации
   * @returns Новый экземпляр PostgresRealtimeClient
   */
  static createForTesting(wsUrl: string, token: string): PostgresRealtimeClient {
    const client = new PostgresRealtimeClient({
      wsUrl,
      getToken: async () => token,
      isUserAuthorized: () => true,
    });
    
    // Сохраняем токен и URL для использования в connect()
    (client as any).token = token;
    (client as any).wsUrl = wsUrl;
    
    return client;
  }

  /**
   * Настройка обработчиков событий для всех модулей
   */
  private setupEventHandlers(): void {
    // Обработчики ConnectionManager
    this.connectionManager.setHandlers({
      onOpen: () => this.handleConnectionOpen(),
      onClose: (code, reason) => this.handleConnectionClose(code, reason),
      onError: (error) => this.handleConnectionError(error),
      onMessage: (message) => this.handleMessage(message),
    });
    
    // Обработчик HeartbeatMonitor для "мёртвого" соединения
    this.heartbeatMonitor.onDead(() => this.handleDeadConnection());
    
    // Подписка на изменения состояния
    this.stateManager.onChange((state) => this.handleStateChange(state));
  }

  // ============================================================================
  // Обработчики событий соединения
  // ============================================================================

  /**
   * Обработчик открытия WebSocket соединения
   * 
   * Requirements:
   * - 2.1, 2.2: Client speaks first - init сообщение отправляется в ConnectionManager
   * - 12.1: Задержка 50ms обрабатывается в ConnectionManager
   */
  private handleConnectionOpen(): void {
    console.log('[PostgresRealtimeClient] WebSocket соединение открыто, ожидаем подтверждения от сервера');
    // ConnectionManager уже отправил init сообщение
    // Ждём connected сообщение от сервера
  }

  /**
   * Обработчик закрытия WebSocket соединения
   * 
   * Requirements:
   * - 4.1: Автоматическое переподключение при аномальном закрытии
   * - 4.5, 4.6: Не переподключаться при определённых кодах
   * 
   * @param code - Код закрытия
   * @param reason - Причина закрытия
   */
  private handleConnectionClose(code: number, reason: string): void {
    console.log(`[PostgresRealtimeClient] Соединение закрыто: код=${code}, причина="${reason}"`);
    
    // Останавливаем heartbeat
    this.heartbeatMonitor.stop();
    
    // Сбрасываем clientId
    this.clientId = null;
    
    // Проверяем, нужно ли переподключаться
    if (this.reconnectionStrategy.shouldReconnect(code)) {
      console.log('[PostgresRealtimeClient] Запуск переподключения...');
      this.stateManager.setState('reconnecting');
      
      // Requirement 4.1, 4.2: Переподключение с экспоненциальной задержкой
      this.reconnectionStrategy.reconnect(() => this.connect());
    } else {
      console.log('[PostgresRealtimeClient] Переподключение не требуется для кода', code);
      this.stateManager.setState('disconnected');
    }
  }

  /**
   * Обработчик ошибки WebSocket соединения
   * 
   * @param error - Ошибка соединения
   */
  private handleConnectionError(error: Error): void {
    console.error('[PostgresRealtimeClient] Ошибка соединения:', error);
    
    // Уведомляем все подписки об ошибке
    this.notifyAllSubscriptionsError(error);
  }

  /**
   * Обработчик "мёртвого" соединения (нет сообщений 90 секунд)
   * 
   * Requirements: 3.3, 3.6 - Обнаружение мёртвого соединения
   */
  private handleDeadConnection(): void {
    console.warn('[PostgresRealtimeClient] Обнаружено мёртвое соединение, переподключение...');
    
    // Закрываем текущее соединение
    this.connectionManager.disconnect(
      CLOSE_CODES.GOING_AWAY,
      'Dead connection detected'
    );
    
    // handleConnectionClose запустит переподключение
  }

  /**
   * Обработчик изменения состояния соединения
   * 
   * @param state - Новое состояние
   */
  private handleStateChange(state: ConnectionState): void {
    console.log('[PostgresRealtimeClient] Состояние изменено:', state);
  }

  // ============================================================================
  // Обработка входящих сообщений
  // ============================================================================

  /**
   * Обработчик входящих сообщений от сервера
   * 
   * Requirements:
   * - 2.5: Обработка connected сообщения и переход в состояние connected
   * - 3.5: Запуск heartbeat после получения connected
   * - 4.3: Восстановление подписок после переподключения
   * - 4.4: Отправка сообщений из очереди после переподключения
   * 
   * @param message - Сообщение от сервера
   */
  private handleMessage(message: ServerMessage): void {
    // Обновляем timestamp для heartbeat мониторинга
    this.heartbeatMonitor.updateLastMessageTime();
    
    switch (message.type) {
      case 'connected':
        this.handleConnectedMessage(message);
        break;
      
      case 'subscription_confirmed':
      case 'new_message':
      case 'status_change':
      case 'type_change':
      case 'error':
        // Передаём сообщения в SubscriptionManager для маршрутизации
        this.subscriptionManager.handleMessage(message);
        break;
      
      case 'closing':
        this.handleClosingMessage(message);
        break;
      
      default:
        console.warn('[PostgresRealtimeClient] Неизвестный тип сообщения:', (message as any).type);
    }
  }

  /**
   * Обработка connected сообщения от сервера
   * 
   * Requirements:
   * - 2.5: Переход в состояние connected
   * - 3.5: Запуск heartbeat после handshake
   * - 4.3: Восстановление подписок
   * - 4.4: Отправка сообщений из очереди
   * 
   * @param message - Connected сообщение
   */
  private handleConnectedMessage(message: ConnectedMessage): void {
    console.log('[PostgresRealtimeClient] Получено подтверждение подключения от сервера');
    
    // Сохраняем clientId
    this.clientId = message.clientId;
    
    // Requirement 2.5: Переходим в состояние connected
    this.stateManager.setState('connected');
    
    // Requirement 3.5: Запускаем heartbeat ТОЛЬКО после получения connected
    this.heartbeatMonitor.start();
    console.log('[PostgresRealtimeClient] Heartbeat запущен после handshake');
    
    // Сбрасываем счётчик попыток переподключения
    this.reconnectionStrategy.reset();
    
    // Requirement 4.3: Восстанавливаем все подписки
    this.subscriptionManager.restoreAll((subscribeMessage) => {
      this.connectionManager.send(subscribeMessage);
    });
    
    // Requirement 4.4: Отправляем сообщения из очереди
    const sentCount = this.messageQueue.flush((message) => {
      return this.connectionManager.send(message);
    });
    
    if (sentCount > 0) {
      console.log(`[PostgresRealtimeClient] Отправлено ${sentCount} сообщений из очереди`);
    }
  }

  /**
   * Обработка closing сообщения от сервера (graceful shutdown)
   * 
   * @param message - Closing сообщение
   */
  private handleClosingMessage(message: any): void {
    console.log(`[PostgresRealtimeClient] Сервер закрывается: ${message.reason}`);
    
    // Закрываем соединение нормально, не пытаемся переподключиться
    this.connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Server closing');
  }

  // ============================================================================
  // Управление соединением
  // ============================================================================

  /**
   * Установить WebSocket соединение
   * 
   * Requirements:
   * - 2.1, 2.2: Client speaks first - init отправляется в ConnectionManager
   * - 4.7: Проверка авторизации перед подключением
   * 
   * @returns Promise, который резолвится при успешном подключении
   */
  async connect(): Promise<void> {
    // Requirement 4.7: Проверяем авторизацию пользователя
    if (!this.config.isUserAuthorized()) {
      console.warn('[PostgresRealtimeClient] Пользователь не авторизован, подключение отменено');
      return;
    }
    
    // Если уже подключены или подключаемся, ничего не делаем
    const currentState = this.stateManager.getState();
    if (currentState === 'connecting' || currentState === 'connected' || currentState === 'reconnecting') {
      console.log(`[PostgresRealtimeClient] Подключение уже в процессе или установлено (состояние: ${currentState}), пропускаем`);
      return;
    }
    
    console.log('[PostgresRealtimeClient] Начало подключения...');
    
    // КРИТИЧЕСКИ ВАЖНО: Устанавливаем состояние connecting СРАЗУ
    // Это предотвращает race condition, когда несколько компонентов
    // одновременно вызывают subscribe() → connect()
    this.stateManager.setState('connecting');
    
    try {
      // Получаем токен аутентификации
      this.token = await this.config.getToken();
      
      if (!this.token) {
        console.warn('[PostgresRealtimeClient] Не удалось получить токен, пользователь не авторизован');
        this.stateManager.setState('disconnected');
        return;
      }
      
      // Сохраняем URL
      this.wsUrl = this.config.wsUrl;
      
      // Устанавливаем соединение через ConnectionManager
      // ConnectionManager автоматически:
      // 1. Создаст WebSocket с токеном
      // 2. Отправит init сообщение (Client speaks first)
      await this.connectionManager.connect(this.wsUrl, this.token);
      
    } catch (error) {
      console.error('[PostgresRealtimeClient] Ошибка подключения:', error);
      this.stateManager.setState('disconnected');
      
      const errorObj = error instanceof Error ? error : new Error('Connection failed');
      this.notifyAllSubscriptionsError(errorObj);
      
      throw error;
    }
  }

  /**
   * Закрыть WebSocket соединение
   * 
   * @param code - Код закрытия (по умолчанию 1000)
   * @param reason - Причина закрытия
   */
  disconnect(code?: number, reason?: string): void {
    console.log('[PostgresRealtimeClient] Закрытие соединения...');
    
    // Останавливаем heartbeat
    this.heartbeatMonitor.stop();
    
    // Отменяем переподключение
    this.reconnectionStrategy.cancel();
    
    // Закрываем соединение
    this.connectionManager.disconnect(code, reason);
  }

  // ============================================================================
  // Управление подписками
  // ============================================================================

  /**
   * Подписаться на канал уведомлений
   * 
   * Requirements: 5.1, 5.2, 5.4, 5.6 - Управление подписками
   * 
   * @param params - Параметры подписки
   * @returns ID подписки для отписки
   */
  subscribe(params: SubscriptionParams): string {
    // Создаём подписку через SubscriptionManager
    const subscriptionId = this.subscriptionManager.subscribe(params);
    
    console.log(`[PostgresRealtimeClient] Создана подписка ${subscriptionId} на канал ${params.channel}`);
    
    // Если подключены, отправляем subscribe сообщение
    if (this.stateManager.isConnected()) {
      const subscribeMessage = {
        type: 'subscribe' as const,
        channel: params.channel,
        sessionId: params.sessionId,
        subscriptionId: subscriptionId,
      };
      
      this.connectionManager.send(subscribeMessage);
    } else {
      // Если не подключены, подключаемся
      this.connect().catch((error) => {
        console.error('[PostgresRealtimeClient] Ошибка подключения при подписке:', error);
        
        if (params.onError) {
          params.onError(error instanceof Error ? error : new Error('Connection failed'));
        }
      });
    }
    
    return subscriptionId;
  }

  /**
   * Отписаться от канала
   * 
   * Requirements: 5.4 - Удаление подписки
   * 
   * @param subscriptionId - ID подписки
   */
  unsubscribe(subscriptionId: string): void {
    console.log(`[PostgresRealtimeClient] Отписка от ${subscriptionId}`);
    
    // Отправляем unsubscribe сообщение на сервер
    if (this.stateManager.isConnected()) {
      const unsubscribeMessage = {
        type: 'unsubscribe' as const,
        subscriptionId: subscriptionId,
      };
      
      this.connectionManager.send(unsubscribeMessage);
    }
    
    // Удаляем подписку из SubscriptionManager
    this.subscriptionManager.unsubscribe(subscriptionId);
  }

  /**
   * Отписаться от всех подписок
   */
  unsubscribeAll(): void {
    console.log('[PostgresRealtimeClient] Отписка от всех подписок');
    
    const subscriptions = this.subscriptionManager.getAll();
    
    for (const [subscriptionId] of subscriptions) {
      this.unsubscribe(subscriptionId);
    }
  }

  // ============================================================================
  // Утилиты
  // ============================================================================

  /**
   * Уведомить все подписки об ошибке
   * 
   * @param error - Ошибка для передачи
   */
  private notifyAllSubscriptionsError(error: Error): void {
    const subscriptions = this.subscriptionManager.getAll();
    
    for (const subscription of subscriptions.values()) {
      if (subscription.onError) {
        try {
          subscription.onError(error);
        } catch (callbackError) {
          console.error('[PostgresRealtimeClient] Ошибка в onError callback:', callbackError);
        }
      }
    }
  }

  /**
   * Получить текущее состояние соединения
   * 
   * @returns Состояние соединения
   */
  getConnectionState(): ConnectionState {
    return this.stateManager.getState();
  }

  /**
   * Проверить, установлено ли соединение
   * 
   * @returns true если соединение активно
   */
  isConnected(): boolean {
    return this.stateManager.isConnected();
  }

  /**
   * Получить ID клиента (присвоенный сервером)
   * 
   * @returns ID клиента или null
   */
  getClientId(): string | null {
    return this.clientId;
  }

  /**
   * Получить количество активных подписок
   * 
   * @returns Количество подписок
   */
  getSubscriptionCount(): number {
    return this.subscriptionManager.size();
  }

  /**
   * Получить размер очереди сообщений
   * 
   * @returns Размер очереди
   */
  getMessageQueueSize(): number {
    return this.messageQueue.size();
  }

  /**
   * Проверить подключение к серверу (для тестирования)
   * 
   * @returns true если подключение активно
   */
  async testConnection(): Promise<boolean> {
    return this.isConnected();
  }
  /**
   * Подписаться на изменения статусов сессий (метод для обратной совместимости)
   *
   * @param onStatusChange - Callback при изменении статуса
   * @param onError - Callback при ошибке
   * @returns Функция для отписки
   */
  subscribeToSessionStatusChanges(
    onStatusChange: (sessionId: number, status: string) => void,
    onError?: ErrorCallback
  ): () => void {
    console.log('[PostgresRealtimeClient] Подписка на изменения статусов сессий');

    // Подписываемся на канал status
    const subscriptionId = this.subscribe({
      channel: 'status',
      onMessage: (message: any) => {
        try {
          // Обрабатываем сообщение об изменении статуса
          if (message.sessionId && message.status) {
            onStatusChange(message.sessionId, message.status);
          }
        } catch (error) {
          console.error('[PostgresRealtimeClient] Ошибка обработки изменения статуса:', error);
          if (onError) {
            onError(error instanceof Error ? error : new Error('Unknown error'));
          }
        }
      },
      onError: onError,
    });

    // Возвращаем функцию для отписки
    return () => {
      this.unsubscribe(subscriptionId);
    };
  }

  /**
   * Подписаться на сообщения конкретной сессии (метод для обратной совместимости)
   *
   * @param sessionId - ID сессии
   * @param onMessage - Callback при получении нового сообщения
   * @param onError - Callback при ошибке
   * @returns Функция для отписки
   */
  subscribeToSessionMessages(
    sessionId: number,
    onMessage: MessageCallback,
    onError?: ErrorCallback
  ): () => void {
    console.log(`[PostgresRealtimeClient] Подписка на сообщения сессии ${sessionId}`);

    // Подписываемся на канал сообщений конкретной сессии
    const subscriptionId = this.subscribe({
      channel: 'session',
      sessionId: sessionId,
      onMessage: (message: any) => {
        try {
          // Передаём сообщение в callback
          onMessage(message);
        } catch (error) {
          console.error('[PostgresRealtimeClient] Ошибка обработки сообщения:', error);
          if (onError) {
            onError(error instanceof Error ? error : new Error('Unknown error'));
          }
        }
      },
      onError: onError,
    });

    // Возвращаем функцию для отписки
    return () => {
      this.unsubscribe(subscriptionId);
    };
  }

  /**
   * Уничтожить клиент и освободить ресурсы
   */
  destroy(): void {
    console.log('[PostgresRealtimeClient] Уничтожение клиента...');
    
    // Отписываемся от всех подписок
    this.unsubscribeAll();
    
    // Останавливаем heartbeat
    this.heartbeatMonitor.stop();
    
    // Отменяем переподключение
    this.reconnectionStrategy.cancel();
    
    // Закрываем соединение
    this.connectionManager.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Client destroyed');
    
    // Очищаем очередь
    this.messageQueue.clear();
    
    // Очищаем подписки StateManager
    this.stateManager.clear();
    
    // Сбрасываем singleton instance
    PostgresRealtimeClient.instance = null;
  }
}
