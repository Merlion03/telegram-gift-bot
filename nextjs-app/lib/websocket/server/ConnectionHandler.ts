/**
 * Модуль обработки WebSocket соединений
 * Отвечает за управление соединениями, обработку сообщений и взаимодействие с клиентами
 * 
 * Validates: Requirements 1.2, 2.3, 2.4, 9.4
 */

import type { IncomingMessage } from 'http';
import type WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClientConnection,
  ClientMessage,
  ServerMessage,
  InitMessage,
  SubscribeMessage,
  UnsubscribeMessage,
} from '../types';
import {
  CLOSE_CODES,
  CUSTOM_CLOSE_CODES,
  ERROR_CODES,
} from '../constants';
import type { AuthenticationHandler } from './AuthenticationHandler';

/**
 * Callback для обработки различных событий соединения
 */
export interface ConnectionHandlerCallbacks {
  /** Callback при успешной аутентификации init сообщения */
  onInit?: (clientId: string, userId: number, userName: string, isAdmin: boolean) => void;
  
  /** Callback при получении subscribe сообщения */
  onSubscribe?: (clientId: string, message: SubscribeMessage) => void;
  
  /** Callback при получении unsubscribe сообщения */
  onUnsubscribe?: (clientId: string, message: UnsubscribeMessage) => void;
  
  /** Callback при закрытии соединения */
  onClose?: (clientId: string, code: number, reason: string) => void;
  
  /** Callback при ошибке */
  onError?: (clientId: string, error: Error) => void;
}

/**
 * Класс для обработки WebSocket соединений
 * Validates: Requirements 1.2, 2.3, 2.4, 9.4
 */
export class ConnectionHandler {
  /** Хранилище активных соединений */
  private connections: Map<string, ClientConnection> = new Map();
  
  /** Обработчик аутентификации */
  private authHandler: AuthenticationHandler;
  
  /** Callbacks для событий */
  private callbacks: ConnectionHandlerCallbacks;
  
  /**
   * Создаёт экземпляр ConnectionHandler
   * @param authHandler - Обработчик аутентификации
   * @param callbacks - Callbacks для событий соединения
   */
  constructor(
    authHandler: AuthenticationHandler,
    callbacks: ConnectionHandlerCallbacks = {}
  ) {
    this.authHandler = authHandler;
    this.callbacks = callbacks;
  }
  
  /**
   * Обработка нового WebSocket соединения
   * Validates: Requirements 1.2, 2.3
   * 
   * @param ws - WebSocket соединение
   * @param request - HTTP запрос с WebSocket upgrade
   */
  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    const clientId = this.generateClientId();
    const connectionTime = new Date();
    
    this.logConnectionStart(clientId, request);
    
    // Валидация токена при установке соединения
    const tokenValidation = await this.authHandler.validateToken(request);
    
    if (!tokenValidation.valid) {
      this.logConnectionRejected(clientId, tokenValidation.errorCode!, tokenValidation.errorMessage!);
      
      // Отправляем error сообщение перед закрытием
      this.sendErrorMessage(ws, tokenValidation.errorCode!, tokenValidation.errorMessage!);
      
      // Закрываем соединение с соответствующим кодом
      ws.close(tokenValidation.closeCode || CUSTOM_CLOSE_CODES.UNAUTHORIZED, tokenValidation.errorMessage);
      return;
    }
    
    // Создаём временное соединение (будет обновлено после init)
    const connection: ClientConnection = {
      id: clientId,
      ws,
      userId: tokenValidation.userId!,
      authenticatedAt: connectionTime,
      lastPongAt: connectionTime,
    };
    
    this.connections.set(clientId, connection);
    this.logConnectionEstablished(clientId, tokenValidation.userId!);
    
    // Устанавливаем обработчики событий
    this.setupEventHandlers(clientId, ws, request);
  }
  
  /**
   * Обработка сообщения от клиента
   * Validates: Requirements 2.3, 2.4
   * 
   * @param clientId - ID клиента
   * @param rawMessage - Сырое сообщение (строка)
   */
  handleMessage(clientId: string, rawMessage: string): void {
    const connection = this.connections.get(clientId);
    
    if (!connection) {
      console.error(`[ConnectionHandler][${clientId}] ❌ Соединение не найдено`);
      return;
    }
    
    try {
      // Парсим JSON сообщение
      const message = JSON.parse(rawMessage) as ClientMessage;
      
      this.logMessageReceived(clientId, message);
      
      // Обрабатываем сообщение в зависимости от типа
      switch (message.type) {
        case 'init':
          this.handleInitMessage(clientId, message, connection);
          break;
          
        case 'subscribe':
          this.handleSubscribeMessage(clientId, message);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscribeMessage(clientId, message);
          break;
          
        default:
          console.warn(`[ConnectionHandler][${clientId}] ⚠️ Неизвестный тип сообщения:`, (message as any).type);
          this.sendErrorMessage(
            connection.ws,
            ERROR_CODES.INVALID_MESSAGE,
            `Unknown message type: ${(message as any).type}`
          );
      }
      
    } catch (error) {
      console.error(`[ConnectionHandler][${clientId}] ❌ Ошибка парсинга сообщения:`, error);
      this.sendErrorMessage(
        connection.ws,
        ERROR_CODES.INVALID_MESSAGE,
        'Invalid JSON message format'
      );
      
      if (this.callbacks.onError) {
        this.callbacks.onError(clientId, error as Error);
      }
    }
  }
  
  /**
   * Отправка сообщения клиенту
   * Validates: Requirements 1.2
   * 
   * @param clientId - ID клиента
   * @param message - Сообщение для отправки
   * @returns true если отправлено успешно, false в противном случае
   */
  sendToClient(clientId: string, message: ServerMessage): boolean {
    const connection = this.connections.get(clientId);
    
    if (!connection) {
      console.error(`[ConnectionHandler][${clientId}] ❌ Соединение не найдено для отправки сообщения`);
      return false;
    }
    
    if (connection.ws.readyState !== 1) { // 1 = OPEN
      console.warn(`[ConnectionHandler][${clientId}] ⚠️ WebSocket не в состоянии OPEN (${connection.ws.readyState})`);
      return false;
    }
    
    try {
      const messageStr = JSON.stringify(message);
      connection.ws.send(messageStr);
      
      this.logMessageSent(clientId, message);
      return true;
      
    } catch (error) {
      console.error(`[ConnectionHandler][${clientId}] ❌ Ошибка отправки сообщения:`, error);
      
      if (this.callbacks.onError) {
        this.callbacks.onError(clientId, error as Error);
      }
      
      return false;
    }
  }
  
  /**
   * Закрытие соединения с клиентом
   * Validates: Requirements 1.2
   * 
   * @param clientId - ID клиента
   * @param code - Код закрытия WebSocket
   * @param reason - Причина закрытия
   */
  closeConnection(clientId: string, code: number, reason: string): void {
    const connection = this.connections.get(clientId);
    
    if (!connection) {
      console.warn(`[ConnectionHandler][${clientId}] ⚠️ Соединение не найдено для закрытия`);
      return;
    }
    
    this.logConnectionClosing(clientId, code, reason);
    
    try {
      if (connection.ws.readyState === 1) { // OPEN
        connection.ws.close(code, reason);
      }
    } catch (error) {
      console.error(`[ConnectionHandler][${clientId}] ❌ Ошибка при закрытии соединения:`, error);
    }
    
    // Удаляем соединение из хранилища
    this.connections.delete(clientId);
    
    // Вызываем callback
    if (this.callbacks.onClose) {
      this.callbacks.onClose(clientId, code, reason);
    }
  }
  
  /**
   * Получение соединения по ID клиента
   * 
   * @param clientId - ID клиента
   * @returns Соединение или undefined
   */
  getConnection(clientId: string): ClientConnection | undefined {
    return this.connections.get(clientId);
  }
  
  /**
   * Получение всех активных соединений
   * 
   * @returns Map всех соединений
   */
  getAllConnections(): Map<string, ClientConnection> {
    return new Map(this.connections);
  }
  
  /**
   * Обновление времени последнего pong от клиента
   * 
   * @param clientId - ID клиента
   */
  updateLastPong(clientId: string): void {
    const connection = this.connections.get(clientId);
    
    if (connection) {
      connection.lastPongAt = new Date();
      console.log(`[ConnectionHandler][${clientId}] 🏓 Pong получен, обновлено lastPongAt`);
    }
  }
  
  // ============================================================================
  // Приватные методы
  // ============================================================================
  
  /**
   * Генерация уникального ID клиента
   */
  private generateClientId(): string {
    return `client_${uuidv4()}`;
  }
  
  /**
   * Установка обработчиков событий WebSocket
   */
  private setupEventHandlers(clientId: string, ws: WebSocket, request: IncomingMessage): void {
    // Обработчик сообщений
    ws.on('message', (data: Buffer) => {
      const message = data.toString('utf-8');
      console.log(`[ConnectionHandler][${clientId}] 📨 Получено сообщение от клиента:`, message);
      this.handleMessage(clientId, message);
    });
    
    // Обработчик pong frames
    ws.on('pong', () => {
      this.updateLastPong(clientId);
    });
    
    // Обработчик закрытия соединения
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString('utf-8');
      this.logConnectionClosed(clientId, code, reasonStr);
      
      // Удаляем соединение
      this.connections.delete(clientId);
      
      // Вызываем callback
      if (this.callbacks.onClose) {
        this.callbacks.onClose(clientId, code, reasonStr);
      }
    });
    
    // Обработчик ошибок
    ws.on('error', (error: Error) => {
      console.error(`[ConnectionHandler][${clientId}] ❌ Ошибка WebSocket:`, error);
      
      if (this.callbacks.onError) {
        this.callbacks.onError(clientId, error);
      }
    });
  }
  
  /**
   * Обработка init сообщения
   * Validates: Requirements 2.3, 2.4
   */
  private async handleInitMessage(
    clientId: string,
    message: InitMessage,
    connection: ClientConnection
  ): Promise<void> {
    console.log(`[ConnectionHandler][${clientId}] 📨 Обработка init сообщения...`);
    
    // Аутентификация уже выполнена при установке соединения
    // Отправляем connected сообщение
    const connectedMessage: ServerMessage = {
      type: 'connected',
      clientId,
    };
    
    const sent = this.sendToClient(clientId, connectedMessage);
    
    if (sent) {
      console.log(`[ConnectionHandler][${clientId}] ✅ Connected сообщение отправлено`);
      
      // Вызываем callback
      if (this.callbacks.onInit) {
        // Получаем данные пользователя из соединения
        this.callbacks.onInit(clientId, connection.userId, 'User', true);
      }
    } else {
      console.error(`[ConnectionHandler][${clientId}] ❌ Не удалось отправить connected сообщение`);
    }
  }
  
  /**
   * Обработка subscribe сообщения
   */
  private handleSubscribeMessage(clientId: string, message: SubscribeMessage): void {
    console.log(`[ConnectionHandler][${clientId}] 📨 Обработка subscribe сообщения:`, {
      channel: message.channel,
      sessionId: message.sessionId,
      subscriptionId: message.subscriptionId,
    });
    
    // Вызываем callback для дальнейшей обработки
    if (this.callbacks.onSubscribe) {
      this.callbacks.onSubscribe(clientId, message);
    }
  }
  
  /**
   * Обработка unsubscribe сообщения
   */
  private handleUnsubscribeMessage(clientId: string, message: UnsubscribeMessage): void {
    console.log(`[ConnectionHandler][${clientId}] 📨 Обработка unsubscribe сообщения:`, {
      subscriptionId: message.subscriptionId,
    });
    
    // Вызываем callback для дальнейшей обработки
    if (this.callbacks.onUnsubscribe) {
      this.callbacks.onUnsubscribe(clientId, message);
    }
  }
  
  /**
   * Отправка error сообщения клиенту
   */
  private sendErrorMessage(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState !== 1) { // OPEN
      return;
    }
    
    try {
      const errorMessage: ServerMessage = {
        type: 'error',
        code,
        message,
      };
      
      ws.send(JSON.stringify(errorMessage));
    } catch (error) {
      console.error('[ConnectionHandler] ❌ Ошибка отправки error сообщения:', error);
    }
  }
  
  // ============================================================================
  // Методы логирования
  // Validates: Requirements 9.4
  // ============================================================================
  
  /**
   * Логирование начала установки соединения
   */
  private logConnectionStart(clientId: string, request: IncomingMessage): void {
    console.log(`[ConnectionHandler][${clientId}] ========== НОВОЕ СОЕДИНЕНИЕ ==========`);
    console.log(`[ConnectionHandler][${clientId}] Timestamp: ${new Date().toISOString()}`);
    console.log(`[ConnectionHandler][${clientId}] URL: ${(request as any).url || 'undefined'}`);
    console.log(`[ConnectionHandler][${clientId}] Origin: ${request.headers?.origin || 'undefined'}`);
    console.log(`[ConnectionHandler][${clientId}] User-Agent: ${request.headers?.['user-agent'] || 'undefined'}`);
    console.log(`[ConnectionHandler][${clientId}] IP: ${request.socket.remoteAddress || 'undefined'}`);
  }
  
  /**
   * Логирование отклонения соединения
   */
  private logConnectionRejected(clientId: string, errorCode: string, errorMessage: string): void {
    console.log(`[ConnectionHandler][${clientId}] ❌ СОЕДИНЕНИЕ ОТКЛОНЕНО`);
    console.log(`[ConnectionHandler][${clientId}] Код ошибки: ${errorCode}`);
    console.log(`[ConnectionHandler][${clientId}] Сообщение: ${errorMessage}`);
    console.log(`[ConnectionHandler][${clientId}] ========================================`);
  }
  
  /**
   * Логирование успешного установления соединения
   */
  private logConnectionEstablished(clientId: string, userId: number): void {
    console.log(`[ConnectionHandler][${clientId}] ✅ СОЕДИНЕНИЕ УСТАНОВЛЕНО`);
    console.log(`[ConnectionHandler][${clientId}] User ID: ${userId}`);
    console.log(`[ConnectionHandler][${clientId}] Активных соединений: ${this.connections.size}`);
    console.log(`[ConnectionHandler][${clientId}] ========================================`);
  }
  
  /**
   * Логирование получения сообщения
   */
  private logMessageReceived(clientId: string, message: ClientMessage): void {
    console.log(`[ConnectionHandler][${clientId}] 📨 Получено сообщение:`, {
      type: message.type,
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Логирование отправки сообщения
   */
  private logMessageSent(clientId: string, message: ServerMessage): void {
    console.log(`[ConnectionHandler][${clientId}] 📤 Отправлено сообщение:`, {
      type: message.type,
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Логирование закрытия соединения (инициировано сервером)
   */
  private logConnectionClosing(clientId: string, code: number, reason: string): void {
    console.log(`[ConnectionHandler][${clientId}] 🔌 Закрытие соединения (сервер):`, {
      code,
      reason,
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Логирование закрытия соединения (получено от клиента)
   */
  private logConnectionClosed(clientId: string, code: number, reason: string): void {
    console.log(`[ConnectionHandler][${clientId}] 🔌 Соединение закрыто (клиент):`, {
      code,
      reason,
      timestamp: new Date().toISOString(),
      remainingConnections: this.connections.size - 1,
    });
  }
}
