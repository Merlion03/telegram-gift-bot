/**
 * Unit-тесты для ConnectionHandler
 * Проверяют обработку соединений, сообщений и интеграцию с AuthenticationHandler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import { ConnectionHandler } from '../ConnectionHandler';
import { AuthenticationHandler } from '../AuthenticationHandler';
import {
  CUSTOM_CLOSE_CODES,
  ERROR_CODES,
} from '../../constants';
import type {
  InitMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  ServerMessage,
} from '../../types';

/**
 * Mock WebSocket класс
 */
class MockWebSocket extends EventEmitter {
  readyState: number = 1; // OPEN
  sentMessages: string[] = [];
  closeCalled: boolean = false;
  closeCode?: number;
  closeReason?: string;
  
  send(data: string): void {
    this.sentMessages.push(data);
  }
  
  close(code?: number, reason?: string): void {
    this.closeCalled = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3; // CLOSED
    this.emit('close', code, Buffer.from(reason || ''));
  }
  
  // Симуляция получения сообщения
  simulateMessage(message: string): void {
    this.emit('message', Buffer.from(message));
  }
  
  // Симуляция pong
  simulatePong(): void {
    this.emit('pong');
  }
  
  // Симуляция ошибки
  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

/**
 * Mock IncomingMessage
 */
function createMockRequest(url: string = '/', token?: string): IncomingMessage {
  const fullUrl = token ? `${url}?token=${token}` : url;
  
  return {
    url: fullUrl,
    headers: {
      origin: 'http://localhost:3000',
      'user-agent': 'test-agent',
      cookie: token ? `next-auth.session-token=${token}` : '',
    },
    socket: {
      remoteAddress: '127.0.0.1',
    },
  } as any;
}

/**
 * Mock AuthenticationHandler
 */
function createMockAuthHandler(shouldSucceed: boolean = true) {
  return {
    validateToken: vi.fn().mockResolvedValue(
      shouldSucceed
        ? {
            valid: true,
            userId: 1,
            userName: 'Test User',
            isAdmin: true,
          }
        : {
            valid: false,
            errorCode: ERROR_CODES.INVALID_TOKEN,
            errorMessage: 'Invalid token',
            closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
          }
    ),
    authenticateInit: vi.fn().mockResolvedValue({
      success: true,
      userId: 1,
      userName: 'Test User',
      isAdmin: true,
    }),
    canSubscribe: vi.fn().mockResolvedValue({
      allowed: true,
    }),
  } as any;
}

describe('ConnectionHandler', () => {
  let handler: ConnectionHandler;
  let mockAuthHandler: AuthenticationHandler;
  let mockWs: MockWebSocket;
  let mockRequest: IncomingMessage;
  
  beforeEach(() => {
    mockAuthHandler = createMockAuthHandler(true);
    mockWs = new MockWebSocket();
    mockRequest = createMockRequest('/', 'valid-token');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('handleConnection', () => {
    it('должен успешно установить соединение с валидным токеном', async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      
      await handler.handleConnection(mockWs as any, mockRequest);
      
      // Проверяем, что токен был валидирован
      expect(mockAuthHandler.validateToken).toHaveBeenCalledWith(mockRequest);
      
      // Проверяем, что соединение добавлено
      const connections = handler.getAllConnections();
      expect(connections.size).toBe(1);
      
      // Проверяем, что обработчики событий установлены
      expect(mockWs.listenerCount('message')).toBe(1);
      expect(mockWs.listenerCount('pong')).toBe(1);
      expect(mockWs.listenerCount('close')).toBe(1);
      expect(mockWs.listenerCount('error')).toBe(1);
    });
    
    it('должен отклонить соединение с невалидным токеном', async () => {
      mockAuthHandler = createMockAuthHandler(false);
      handler = new ConnectionHandler(mockAuthHandler);
      
      await handler.handleConnection(mockWs as any, mockRequest);
      
      // Проверяем, что токен был валидирован
      expect(mockAuthHandler.validateToken).toHaveBeenCalledWith(mockRequest);
      
      // Проверяем, что соединение НЕ добавлено
      const connections = handler.getAllConnections();
      expect(connections.size).toBe(0);
      
      // Проверяем, что соединение закрыто с правильным кодом
      expect(mockWs.closeCalled).toBe(true);
      expect(mockWs.closeCode).toBe(CUSTOM_CLOSE_CODES.UNAUTHORIZED);
      
      // Проверяем, что отправлено error сообщение
      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      const errorMsg = JSON.parse(mockWs.sentMessages[0]);
      expect(errorMsg.type).toBe('error');
      expect(errorMsg.code).toBe(ERROR_CODES.INVALID_TOKEN);
    });
    
    it('должен вызвать onInit callback после успешной аутентификации', async () => {
      const onInitMock = vi.fn();
      handler = new ConnectionHandler(mockAuthHandler, {
        onInit: onInitMock,
      });
      
      await handler.handleConnection(mockWs as any, mockRequest);
      
      // Отправляем init сообщение
      const initMessage: InitMessage = { type: 'init' };
      mockWs.simulateMessage(JSON.stringify(initMessage));
      
      // Ждём обработки
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Проверяем, что callback вызван
      expect(onInitMock).toHaveBeenCalled();
      const [clientId, userId, userName, isAdmin] = onInitMock.mock.calls[0];
      expect(clientId).toMatch(/^client_/);
      expect(userId).toBe(1);
      expect(isAdmin).toBe(true);
    });
  });
  
  describe('handleMessage', () => {
    beforeEach(async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      await handler.handleConnection(mockWs as any, mockRequest);
    });
    
    it('должен обработать init сообщение и отправить connected', async () => {
      const initMessage: InitMessage = { type: 'init' };
      mockWs.simulateMessage(JSON.stringify(initMessage));
      
      // Ждём обработки
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Проверяем, что отправлено connected сообщение
      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      const connectedMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(connectedMsg.type).toBe('connected');
      expect(connectedMsg.clientId).toMatch(/^client_/);
    });
    
    it('должен обработать subscribe сообщение и вызвать callback', async () => {
      const onSubscribeMock = vi.fn();
      handler = new ConnectionHandler(mockAuthHandler, {
        onSubscribe: onSubscribeMock,
      });
      
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const subscribeMessage: SubscribeMessage = {
        type: 'subscribe',
        channel: 'session',
        sessionId: 123,
        subscriptionId: 'sub-1',
      };
      
      mockWs.simulateMessage(JSON.stringify(subscribeMessage));
      
      // Ждём обработки
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Проверяем, что callback вызван
      expect(onSubscribeMock).toHaveBeenCalled();
      const [clientId, message] = onSubscribeMock.mock.calls[0];
      expect(clientId).toMatch(/^client_/);
      expect(message).toEqual(subscribeMessage);
    });
    
    it('должен обработать unsubscribe сообщение и вызвать callback', async () => {
      const onUnsubscribeMock = vi.fn();
      handler = new ConnectionHandler(mockAuthHandler, {
        onUnsubscribe: onUnsubscribeMock,
      });
      
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const unsubscribeMessage: UnsubscribeMessage = {
        type: 'unsubscribe',
        subscriptionId: 'sub-1',
      };
      
      mockWs.simulateMessage(JSON.stringify(unsubscribeMessage));
      
      // Ждём обработки
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Проверяем, что callback вызван
      expect(onUnsubscribeMock).toHaveBeenCalled();
      const [clientId, message] = onUnsubscribeMock.mock.calls[0];
      expect(clientId).toMatch(/^client_/);
      expect(message).toEqual(unsubscribeMessage);
    });
    
    it('должен отправить error при невалидном JSON', async () => {
      mockWs.simulateMessage('invalid json {');
      
      // Ждём обработки
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Проверяем, что отправлено error сообщение
      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      const errorMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(errorMsg.type).toBe('error');
      expect(errorMsg.code).toBe(ERROR_CODES.INVALID_MESSAGE);
    });
    
    it('должен отправить error при неизвестном типе сообщения', async () => {
      mockWs.simulateMessage(JSON.stringify({ type: 'unknown' }));
      
      // Ждём обработки
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Проверяем, что отправлено error сообщение
      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      const errorMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(errorMsg.type).toBe('error');
      expect(errorMsg.code).toBe(ERROR_CODES.INVALID_MESSAGE);
    });
  });
  
  describe('sendToClient', () => {
    let clientId: string;
    
    beforeEach(async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const connections = handler.getAllConnections();
      clientId = Array.from(connections.keys())[0];
    });
    
    it('должен успешно отправить сообщение клиенту', () => {
      const message: ServerMessage = {
        type: 'connected',
        clientId: 'test-client',
      };
      
      const result = handler.sendToClient(clientId, message);
      
      expect(result).toBe(true);
      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      
      const sentMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(sentMsg).toEqual(message);
    });
    
    it('должен вернуть false для несуществующего клиента', () => {
      const message: ServerMessage = {
        type: 'connected',
        clientId: 'test-client',
      };
      
      const result = handler.sendToClient('non-existent-client', message);
      
      expect(result).toBe(false);
    });
    
    it('должен вернуть false если WebSocket не в состоянии OPEN', () => {
      mockWs.readyState = 3; // CLOSED
      
      const message: ServerMessage = {
        type: 'connected',
        clientId: 'test-client',
      };
      
      const result = handler.sendToClient(clientId, message);
      
      expect(result).toBe(false);
    });
  });
  
  describe('closeConnection', () => {
    let clientId: string;
    
    beforeEach(async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const connections = handler.getAllConnections();
      clientId = Array.from(connections.keys())[0];
    });
    
    it('должен закрыть соединение с правильным кодом', () => {
      handler.closeConnection(clientId, 1000, 'Normal closure');
      
      expect(mockWs.closeCalled).toBe(true);
      expect(mockWs.closeCode).toBe(1000);
      expect(mockWs.closeReason).toBe('Normal closure');
      
      // Проверяем, что соединение удалено
      const connection = handler.getConnection(clientId);
      expect(connection).toBeUndefined();
    });
    
    it('должен вызвать onClose callback', () => {
      const onCloseMock = vi.fn();
      handler = new ConnectionHandler(mockAuthHandler, {
        onClose: onCloseMock,
      });
      
      // Переустанавливаем соединение с новым handler
      handler.closeConnection(clientId, 1000, 'Normal closure');
      
      // Callback должен быть вызван, но не из нашего handler
      // Создаём новое соединение с правильным handler
      mockWs = new MockWebSocket();
      mockRequest = createMockRequest('/', 'valid-token');
      
      handler.handleConnection(mockWs as any, mockRequest).then(() => {
        const connections = handler.getAllConnections();
        const newClientId = Array.from(connections.keys())[0];
        
        handler.closeConnection(newClientId, 1000, 'Normal closure');
        
        expect(onCloseMock).toHaveBeenCalledWith(newClientId, 1000, 'Normal closure');
      });
    });
  });
  
  describe('updateLastPong', () => {
    let clientId: string;
    
    beforeEach(async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const connections = handler.getAllConnections();
      clientId = Array.from(connections.keys())[0];
    });
    
    it('должен обновить lastPongAt при получении pong', async () => {
      const connection = handler.getConnection(clientId);
      const oldPongTime = connection!.lastPongAt;
      
      // Ждём немного
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          mockWs.simulatePong();
          
          const updatedConnection = handler.getConnection(clientId);
          expect(updatedConnection!.lastPongAt.getTime()).toBeGreaterThan(oldPongTime.getTime());
          resolve();
        }, 10);
      });
    });
  });
  
  describe('getConnection и getAllConnections', () => {
    it('должен вернуть соединение по clientId', async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const connections = handler.getAllConnections();
      const clientId = Array.from(connections.keys())[0];
      
      const connection = handler.getConnection(clientId);
      
      expect(connection).toBeDefined();
      expect(connection!.id).toBe(clientId);
      expect(connection!.userId).toBe(1);
    });
    
    it('должен вернуть undefined для несуществующего clientId', () => {
      handler = new ConnectionHandler(mockAuthHandler);
      
      const connection = handler.getConnection('non-existent');
      
      expect(connection).toBeUndefined();
    });
    
    it('должен вернуть все активные соединения', async () => {
      handler = new ConnectionHandler(mockAuthHandler);
      
      // Создаём несколько соединений
      await handler.handleConnection(mockWs as any, mockRequest);
      
      const mockWs2 = new MockWebSocket();
      await handler.handleConnection(mockWs2 as any, mockRequest);
      
      const connections = handler.getAllConnections();
      
      expect(connections.size).toBe(2);
    });
  });
});
