/**
 * RealtimeWebSocketServer - Главный класс WebSocket сервера
 * Интегрирует все серверные модули для обработки real-time уведомлений
 * 
 * Validates: Requirements 2.3, 2.4, 3.5, 8.2, 12.2
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
import { Pool as PgPool, PoolClient } from 'pg';
import type { ServerMessage, SubscribeMessage, UnsubscribeMessage } from '../types';
import { TIMEOUTS, CUSTOM_CLOSE_CODES } from '../constants';
import { ConnectionHandler } from './ConnectionHandler';
import { AuthenticationHandler } from './AuthenticationHandler';
import { NotificationRouter } from './NotificationRouter';
import { SubscriptionRegistry } from './SubscriptionRegistry';
import { HeartbeatManager } from './HeartbeatManager';
import { MetricsCollector } from './MetricsCollector';

/**
 * Конфигурация сервера
 */
export interface ServerConfig {
  /** Секретный ключ для JWT */
  jwtSecret: string;
  
  /** PostgreSQL connection pool */
  pgPool: PgPool;
  
  /** Таймаут graceful shutdown (мс) */
  shutdownTimeout?: number;
}

/**
 * Главный класс WebSocket сервера
 * Validates: Requirements 2.3, 2.4, 3.5, 8.2, 12.2
 */
export class RealtimeWebSocketServer {
  /** WebSocket сервер */
  private wss: WebSocketServer;
  
  /** PostgreSQL connection pool */
  private pgPool: PgPool;
  
  /** Выделенный клиент для PostgreSQL LISTEN */
  private pgListenClient: PoolClient | null = null;
  
  /** Флаг graceful shutdown */
  private isShuttingDown: boolean = false;
  
  /** Таймаут graceful shutdown */
  private shutdownTimeout: number;
  
  // ============================================================================
  // Модули
  // ============================================================================
  
  /** Обработчик соединений */
  private connectionHandler: ConnectionHandler;
  
  /** Обработчик аутентификации */
  private authHandler: AuthenticationHandler;
  
  /** Маршрутизатор уведомлений */
  private notificationRouter: NotificationRouter;
  
  /** Реестр подписок */
  private subscriptionRegistry: SubscriptionRegistry;
  
  /** Менеджер heartbeat */
  private heartbeatManager: HeartbeatManager;
  
  /** Сборщик метрик */
  private metricsCollector: MetricsCollector;
  
  /**
   * Создаёт экземпляр RealtimeWebSocketServer
   * Validates: Requirements 8.2
   * 
   * @param server - HTTP сервер для WebSocket upgrade
   * @param config - Конфигурация сервера
   */
  constructor(server: HttpServer, config: ServerConfig) {
    this.pgPool = config.pgPool;
    this.shutdownTimeout = config.shutdownTimeout || TIMEOUTS.GRACEFUL_SHUTDOWN_TIMEOUT;
    
    // Создание WebSocket сервера
    // Validates: Requirements 12.2 - отключаем perMessageDeflate для совместимости с прокси
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });
    
    // Инициализация модулей
    this.subscriptionRegistry = new SubscriptionRegistry();
    this.metricsCollector = new MetricsCollector();
    this.authHandler = new AuthenticationHandler(config.jwtSecret);
    
    // ConnectionHandler с callbacks
    this.connectionHandler = new ConnectionHandler(this.authHandler, {
      onInit: this.handleInit.bind(this),
      onSubscribe: this.handleSubscribe.bind(this),
      onUnsubscribe: this.handleUnsubscribe.bind(this),
      onClose: this.handleClose.bind(this),
      onError: this.handleError.bind(this),
    });
    
    // NotificationRouter
    this.notificationRouter = new NotificationRouter(
      this.subscriptionRegistry,
      this.connectionHandler
    );
    
    // HeartbeatManager
    this.heartbeatManager = new HeartbeatManager(this.connectionHandler);
    
    console.log('[RealtimeWebSocketServer] ✅ Сервер инициализирован');
  }

  /**
   * Создать экземпляр сервера для тестирования
   * ВАЖНО: Используется только в тестах! Не использовать в production коде.
   * 
   * @param wss - WebSocket сервер
   * @param pool - PostgreSQL connection pool (может быть mock)
   * @returns Новый экземпляр RealtimeWebSocketServer
   */
  static createForTesting(wss: WebSocketServer, pool: PgPool): RealtimeWebSocketServer {
    // Создаём фиктивный HTTP сервер для конструктора
    const dummyServer = {} as HttpServer;
    
    const server = new RealtimeWebSocketServer(dummyServer, {
      jwtSecret: 'test-secret',
      pgPool: pool,
    });
    
    // Заменяем WebSocket сервер на переданный
    (server as any).wss = wss;
    
    // Настраиваем обработчик подключений для тестового WebSocket сервера
    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      server['connectionHandler'].handleConnection(ws, request);
    });
    
    return server;
  }
  
  /**
   * Инициализация сервера
   * Validates: Requirements 2.3, 2.4, 3.5
   * 
   * Запускает:
   * - PostgreSQL LISTEN для получения уведомлений
   * - Heartbeat механизм
   * - Логирование метрик
   * - Обработчики graceful shutdown
   */
  async initialize(): Promise<void> {
    console.log('[RealtimeWebSocketServer] 🚀 Запуск инициализации...');
    
    // Подключение к PostgreSQL LISTEN
    await this.connectPostgresListen();
    
    // Запуск heartbeat механизма
    // Validates: Requirements 3.5 - heartbeat запускается после handshake
    // Но сам механизм запускается сразу, а отправка ping начинается после init
    this.heartbeatManager.start();
    
    // Запуск логирования метрик
    this.metricsCollector.startLogging();
    
    // Настройка обработчиков graceful shutdown
    this.setupShutdownHandlers();
    
    console.log('[RealtimeWebSocketServer] ✅ Инициализация завершена успешно');
  }
  
  /**
   * Обработка нового WebSocket подключения
   * Validates: Requirements 2.3, 2.4
   * 
   * @param ws - WebSocket соединение
   * @param request - HTTP запрос с WebSocket upgrade
   */
  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    // Проверка graceful shutdown
    if (this.isShuttingDown) {
      console.log('[RealtimeWebSocketServer] ❌ Сервер в режиме shutdown, отклоняем подключение');
      ws.close(CUSTOM_CLOSE_CODES.SERVER_OVERLOADED, 'Server is shutting down');
      return;
    }
    
    // Обновляем метрики
    this.metricsCollector.increment('totalConnections');
    this.metricsCollector.increment('activeConnections');
    
    // Делегируем обработку ConnectionHandler
    await this.connectionHandler.handleConnection(ws, request);
  }
  
  // ============================================================================
  // Callbacks от ConnectionHandler
  // ============================================================================
  
  /**
   * Обработка init сообщения от клиента
   * Validates: Requirements 2.3, 2.4, 3.5
   * 
   * @param clientId - ID клиента
   * @param userId - ID пользователя
   * @param userName - Имя пользователя
   * @param isAdmin - Флаг администратора
   */
  private handleInit(
    clientId: string,
    userId: number,
    userName: string,
    isAdmin: boolean
  ): void {
    console.log(`[RealtimeWebSocketServer][${clientId}] ✅ Init обработан:`, {
      userId,
      userName,
      isAdmin,
    });
    
    // Validates: Requirements 3.5 - heartbeat запускается ТОЛЬКО после handshake
    // Heartbeat уже запущен глобально, но ping отправляется только после init
    // Это обеспечивается тем, что HeartbeatManager проверяет состояние соединения
  }
  
  /**
   * Обработка subscribe сообщения от клиента
   * Validates: Requirements 2.3, 2.4
   * 
   * @param clientId - ID клиента
   * @param message - Subscribe сообщение
   */
  private async handleSubscribe(
    clientId: string,
    message: SubscribeMessage
  ): Promise<void> {
    console.log(`[RealtimeWebSocketServer][${clientId}] 📨 Обработка subscribe:`, {
      channel: message.channel,
      sessionId: message.sessionId,
      subscriptionId: message.subscriptionId,
    });
    
    // Получаем соединение для проверки прав
    const connection = this.connectionHandler.getConnection(clientId);
    if (!connection) {
      console.error(`[RealtimeWebSocketServer][${clientId}] ❌ Соединение не найдено`);
      return;
    }
    
    // Проверяем права доступа к каналу
    const authResult = await this.authHandler.canSubscribe(
      connection.userId,
      message.channel,
      message.sessionId
    );
    
    if (!authResult.allowed) {
      console.warn(`[RealtimeWebSocketServer][${clientId}] ❌ Подписка отклонена:`, {
        errorCode: authResult.errorCode,
        errorMessage: authResult.errorMessage,
      });
      
      // Отправляем error сообщение
      this.notificationRouter.sendSubscriptionError(
        clientId,
        message.subscriptionId,
        authResult.errorMessage || 'Subscription rejected'
      );
      
      return;
    }
    
    // Определяем название канала для PostgreSQL LISTEN
    const pgChannel = this.getPostgresChannel(message.channel, message.sessionId);
    
    // Добавляем подписку в реестр
    this.subscriptionRegistry.add({
      clientId,
      subscriptionId: message.subscriptionId,
      channel: pgChannel,
      sessionId: message.sessionId,
    });
    
    console.log(`[RealtimeWebSocketServer][${clientId}] ✅ Подписка добавлена:`, {
      subscriptionId: message.subscriptionId,
      pgChannel,
    });
    
    // Отправляем подтверждение
    const confirmMessage: ServerMessage = {
      type: 'subscription_confirmed',
      subscriptionId: message.subscriptionId,
      channel: pgChannel,
    };
    
    this.connectionHandler.sendToClient(clientId, confirmMessage);
  }
  
  /**
   * Обработка unsubscribe сообщения от клиента
   * 
   * @param clientId - ID клиента
   * @param message - Unsubscribe сообщение
   */
  private handleUnsubscribe(
    clientId: string,
    message: UnsubscribeMessage
  ): void {
    console.log(`[RealtimeWebSocketServer][${clientId}] 📨 Обработка unsubscribe:`, {
      subscriptionId: message.subscriptionId,
    });
    
    // Удаляем подписку из реестра
    const removed = this.subscriptionRegistry.remove(message.subscriptionId);
    
    if (removed) {
      console.log(`[RealtimeWebSocketServer][${clientId}] ✅ Подписка удалена:`, {
        subscriptionId: message.subscriptionId,
      });
    } else {
      console.warn(`[RealtimeWebSocketServer][${clientId}] ⚠️ Подписка не найдена:`, {
        subscriptionId: message.subscriptionId,
      });
    }
  }
  
  /**
   * Обработка закрытия соединения
   * 
   * @param clientId - ID клиента
   * @param code - Код закрытия
   * @param reason - Причина закрытия
   */
  private handleClose(clientId: string, code: number, reason: string): void {
    console.log(`[RealtimeWebSocketServer][${clientId}] 🔌 Соединение закрыто:`, {
      code,
      reason,
    });
    
    // Удаляем все подписки клиента
    const removedCount = this.subscriptionRegistry.removeAllForClient(clientId);
    
    console.log(`[RealtimeWebSocketServer][${clientId}] 🗑️ Удалено подписок: ${removedCount}`);
    
    // Обновляем метрики
    this.metricsCollector.decrement('activeConnections');
  }
  
  /**
   * Обработка ошибки
   * 
   * @param clientId - ID клиента
   * @param error - Ошибка
   */
  private handleError(clientId: string, error: Error): void {
    console.error(`[RealtimeWebSocketServer][${clientId}] ❌ Ошибка:`, error);
    
    // Обновляем метрики
    this.metricsCollector.increment('totalErrors');
  }
  
  // ============================================================================
  // PostgreSQL LISTEN
  // ============================================================================
  
  /**
   * Подключение к PostgreSQL для LISTEN операций
   * Создаёт выделенное подключение вне pool
   */
  private async connectPostgresListen(): Promise<void> {
    try {
      console.log('[RealtimeWebSocketServer] 🔌 Подключение к PostgreSQL LISTEN...');
      
      // Создаём выделенный клиент для LISTEN из pool
      this.pgListenClient = await this.pgPool.connect();
      console.log('[RealtimeWebSocketServer] ✅ PostgreSQL LISTEN подключение установлено');
      
      // Подписка на каналы уведомлений
      await this.pgListenClient.query('LISTEN new_message');
      await this.pgListenClient.query('LISTEN session_status_change');
      await this.pgListenClient.query('LISTEN session_type_change');
      console.log('[RealtimeWebSocketServer] ✅ LISTEN подписки активированы');
      
      // Настройка обработчика уведомлений
      this.pgListenClient.on('notification', (msg) => {
        this.handlePostgresNotification(msg.channel, msg.payload || '');
      });
      
      // Обработка ошибок подключения
      this.pgListenClient.on('error', (err) => {
        console.error('[RealtimeWebSocketServer] ❌ PostgreSQL LISTEN ошибка:', err);
        this.metricsCollector.increment('totalErrors');
        // TODO: Реализовать переподключение
      });
      
    } catch (error) {
      console.error('[RealtimeWebSocketServer] ❌ Ошибка подключения к PostgreSQL LISTEN:', error);
      this.metricsCollector.increment('totalErrors');
      throw error;
    }
  }
  
  /**
   * Обработка уведомления от PostgreSQL
   * 
   * @param channel - Название канала PostgreSQL
   * @param payload - JSON payload от PostgreSQL
   */
  private async handlePostgresNotification(channel: string, payload: string): Promise<void> {
    // Обновляем метрики
    this.metricsCollector.increment('totalNotifications');
    this.metricsCollector.set('lastNotificationAt', new Date());
    
    // Делегируем обработку NotificationRouter
    await this.notificationRouter.handleNotification(channel, payload);
  }
  
  // ============================================================================
  // Вспомогательные методы
  // ============================================================================
  
  /**
   * Получение названия канала PostgreSQL из типа подписки
   * 
   * @param channel - Тип канала (session, all, status)
   * @param sessionId - ID сессии (для канала session)
   * @returns Название канала PostgreSQL
   */
  private getPostgresChannel(channel: string, sessionId?: number): string {
    switch (channel) {
      case 'session':
        return `session_${sessionId}`;
      case 'all':
        return 'all_messages';
      case 'status':
        return 'status_changes';
      default:
        return channel;
    }
  }
  
  /**
   * Настройка обработчиков graceful shutdown
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = () => {
      console.log('[RealtimeWebSocketServer] 🛑 Получен сигнал завершения, начинаем graceful shutdown');
      this.shutdown();
    };
    
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
  }
  
  /**
   * Graceful shutdown сервера
   * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
   */
  async shutdown(): Promise<void> {
    console.log('[RealtimeWebSocketServer] 🛑 Graceful shutdown начат');
    
    // Устанавливаем флаг shutdown
    this.isShuttingDown = true;
    
    // Останавливаем heartbeat
    this.heartbeatManager.stop();
    
    // Останавливаем логирование метрик
    this.metricsCollector.stopLogging();
    
    // Отправляем closing сообщение всем клиентам
    const connections = this.connectionHandler.getAllConnections();
    const closingMessage: ServerMessage = {
      type: 'closing',
      reason: 'Server is shutting down',
    };
    
    console.log(`[RealtimeWebSocketServer] 📤 Отправка closing сообщения ${connections.size} клиентам`);
    
    connections.forEach((connection, clientId) => {
      this.connectionHandler.sendToClient(clientId, closingMessage);
    });
    
    // Закрываем все соединения
    connections.forEach((connection, clientId) => {
      this.connectionHandler.closeConnection(clientId, 1001, 'Server shutting down');
    });
    
    // Ожидаем закрытия всех соединений с timeout
    const shutdownStart = Date.now();
    const checkInterval = 100; // Проверяем каждые 100ms
    
    while (this.connectionHandler.getAllConnections().size > 0) {
      const elapsed = Date.now() - shutdownStart;
      
      if (elapsed >= this.shutdownTimeout) {
        const remaining = this.connectionHandler.getAllConnections().size;
        console.warn(`[RealtimeWebSocketServer] ⚠️ Shutdown timeout: ${remaining} клиентов ещё подключены`);
        break;
      }
      
      // Ждём немного перед следующей проверкой
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
    
    const finalCount = this.connectionHandler.getAllConnections().size;
    console.log(`[RealtimeWebSocketServer] ✅ Закрыто соединений: ${connections.size - finalCount} из ${connections.size}`);
    
    // Закрываем PostgreSQL LISTEN подключение
    if (this.pgListenClient) {
      try {
        console.log('[RealtimeWebSocketServer] 🔌 Закрытие PostgreSQL LISTEN подключения...');
        await this.pgListenClient.query('UNLISTEN new_message');
        await this.pgListenClient.query('UNLISTEN session_status_change');
        await this.pgListenClient.query('UNLISTEN session_type_change');
        
        // Освобождаем клиент обратно в pool
        this.pgListenClient.release();
        this.pgListenClient = null;
        console.log('[RealtimeWebSocketServer] ✅ PostgreSQL LISTEN подключение закрыто');
      } catch (error) {
        console.error('[RealtimeWebSocketServer] ❌ Ошибка закрытия PostgreSQL LISTEN подключения:', error);
      }
    }
    
    // Закрываем WebSocket сервер
    this.wss.close(() => {
      console.log('[RealtimeWebSocketServer] ✅ WebSocket сервер закрыт');
    });
    
    console.log('[RealtimeWebSocketServer] ✅ Graceful shutdown завершён');
    
    // Завершаем процесс только если не в тестовом окружении
    if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  }
  
  /**
   * Получение WebSocketServer для интеграции с HTTP server
   * @returns WebSocket сервер
   */
  getWebSocketServer(): WebSocketServer {
    return this.wss;
  }
  
  /**
   * Получение текущих метрик
   * @returns Метрики сервера
   */
  getMetrics() {
    return this.metricsCollector.getAll();
  }
}
