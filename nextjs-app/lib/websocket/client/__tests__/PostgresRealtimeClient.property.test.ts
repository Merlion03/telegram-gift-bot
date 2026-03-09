/**
 * Property-based тесты для PostgresRealtimeClient
 * 
 * Проверяет универсальные свойства корректности интеграции всех модулей
 * с использованием fast-check для генерации тестовых данных
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { PostgresRealtimeClient } from '../PostgresRealtimeClient';
import type { ServerMessage, ConnectedMessage, SubscriptionConfirmedMessage } from '../../types';

/**
 * Mock WebSocket для тестирования с поддержкой handshake протокола
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  
  private listeners: Map<string, Set<Function>> = new Map();
  public sentMessages: any[] = [];
  
  constructor(url: string) {
    this.url = url;
    
    // Симулируем асинхронное открытие соединения
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.trigger('open', new Event('open'));
    }, 10);
  }

  addEventListener(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: Function): void {
    this.listeners.get(event)?.delete(handler);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    const message = JSON.parse(data);
    this.sentMessages.push(message);
    
    // Автоматически отвечаем на init сообщение (handshake)
    if (message.type === 'init') {
      setTimeout(() => {
        const connectedMessage: ConnectedMessage = {
          type: 'connected',
          clientId: `client_${Date.now()}`,
        };
        this.receiveMessage(connectedMessage);
      }, 20);
    }
    
    // Автоматически подтверждаем подписки
    if (message.type === 'subscribe') {
      setTimeout(() => {
        const confirmedMessage: SubscriptionConfirmedMessage = {
          type: 'subscription_confirmed',
          subscriptionId: message.subscriptionId,
          channel: message.channel,
        };
        this.receiveMessage(confirmedMessage);
      }, 20);
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const event = new CloseEvent('close', {
        code: code || 1000,
        reason: reason || '',
        wasClean: true,
      });
      this.trigger('close', event);
    }, 10);
  }

  trigger(event: string, data: any): void {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    });
  }

  receiveMessage(message: ServerMessage): void {
    const event = new MessageEvent('message', {
      data: JSON.stringify(message),
    });
    this.trigger('message', event);
  }

  getSentMessages(): any[] {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

describe('PostgresRealtimeClient - Property-Based Tests', () => {
  let originalWebSocket: any;
  let mockWebSocket: MockWebSocket | null = null;

  beforeEach(() => {
    // Сохраняем оригинальный WebSocket
    originalWebSocket = global.WebSocket;
    
    // Подменяем глобальный WebSocket на наш Mock
    global.WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWebSocket = this;
      }
    } as any;
    
    // Мокаем fetch для получения токена
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token' }),
    });
  });

  afterEach(() => {
    // Восстанавливаем оригинальный WebSocket
    global.WebSocket = originalWebSocket;
    
    // Уничтожаем клиент
    const client = (PostgresRealtimeClient as any).instance;
    if (client) {
      client.destroy();
    }
    
    mockWebSocket = null;
    
    vi.restoreAllMocks();
  });

  /**
   * Property 3: Handshake round-trip (Client speaks first)
   * 
   * Для любого валидного подключения:
   * 1. Клиент отправляет init сообщение первым (Client speaks first)
   * 2. Сервер отвечает connected сообщением
   * 3. Клиент переходит в состояние 'connected'
   * 4. Heartbeat запускается ТОЛЬКО после получения connected
   * 5. Подписки отправляются ТОЛЬКО после получения connected
   * 
   * Feature: websocket-architecture-refactor, Property 3
   * Validates: Requirements 2.1, 2.3, 2.4, 2.5, 14.1
   */
  describe('Property 3: Handshake round-trip (Client speaks first)', () => {
    it('должен выполнить полный handshake для любого валидного подключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }), // clientId
          async (clientId) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Проверяем начальное состояние
            expect(client.getConnectionState()).toBe('disconnected');
            expect(client.isConnected()).toBe(false);
            
            // Подключаемся
            await client.connect();
            
            // Ждём завершения handshake
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Проверяем, что клиент отправил init первым
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            expect(sentMessages.length).toBeGreaterThan(0);
            expect(sentMessages[0].type).toBe('init');
            
            // Проверяем, что клиент перешёл в состояние connected
            expect(client.getConnectionState()).toBe('connected');
            expect(client.isConnected()).toBe(true);
            
            // Проверяем, что clientId установлен
            expect(client.getClientId()).toBeTruthy();
            
            // Очищаем
            client.destroy();
          }
        ),
        { numRuns: 30 }
      );
    });

    it('должен отправлять init сообщение ПЕРВЫМ для любого подключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // Количество переподключений
          async (reconnectCount) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Выполняем несколько циклов подключения/отключения
            for (let i = 0; i < reconnectCount; i++) {
              mockWebSocket?.clearSentMessages();
              
              await client.connect();
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Проверяем, что init всегда первое сообщение
              const sentMessages = mockWebSocket?.getSentMessages() || [];
              expect(sentMessages.length).toBeGreaterThan(0);
              expect(sentMessages[0].type).toBe('init');
              
              // Отключаемся для следующей итерации
              if (i < reconnectCount - 1) {
                client.disconnect();
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('НЕ должен отправлять subscribe до получения connected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('session', 'all', 'status'),
          fc.integer({ min: 1, max: 100 }),
          async (channel, sessionId) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Создаём подписку ДО подключения
            const subscriptionId = client.subscribe({
              channel: channel as any,
              sessionId: channel === 'session' ? sessionId : undefined,
              onMessage: () => {},
            });
            
            // Ждём открытия WebSocket и отправки init
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Проверяем отправленные сообщения
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            
            // Должен быть init
            const initMessages = sentMessages.filter(m => m.type === 'init');
            
            // Если WebSocket открылся, должен быть init
            if (sentMessages.length > 0) {
              expect(initMessages.length).toBeGreaterThan(0);
              
              // Если есть subscribe сообщения, они должны быть ПОСЛЕ init
              const subscribeMessages = sentMessages.filter(m => m.type === 'subscribe');
              if (subscribeMessages.length > 0) {
                const initIndex = sentMessages.findIndex(m => m.type === 'init');
                const subscribeIndex = sentMessages.findIndex(m => m.type === 'subscribe');
                expect(subscribeIndex).toBeGreaterThan(initIndex);
              }
            }
            
            // Ждём завершения handshake
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Теперь subscribe должен быть отправлен
            const finalMessages = mockWebSocket?.getSentMessages() || [];
            const finalSubscribeMessages = finalMessages.filter(m => m.type === 'subscribe');
            expect(finalSubscribeMessages.length).toBeGreaterThan(0);
            
            client.destroy();
          }
        ),
        { numRuns: 30 }
      );
    }, 30000);

    it('должен корректно обрабатывать handshake с задержкой ответа сервера', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 200 }), // Задержка ответа сервера (мс)
          async (serverDelay) => {
            // Создаём специальный Mock с задержкой
            global.WebSocket = class extends MockWebSocket {
              constructor(url: string) {
                super(url);
                mockWebSocket = this;
              }
              
              send(data: string): void {
                if (this.readyState !== MockWebSocket.OPEN) {
                  throw new Error('WebSocket is not open');
                }
                
                const message = JSON.parse(data);
                this.sentMessages.push(message);
                
                // Отвечаем на init с задержкой
                if (message.type === 'init') {
                  setTimeout(() => {
                    const connectedMessage: ConnectedMessage = {
                      type: 'connected',
                      clientId: `client_${Date.now()}`,
                    };
                    this.receiveMessage(connectedMessage);
                  }, serverDelay);
                }
              }
            } as any;
            
            const client = PostgresRealtimeClient.getInstance();
            
            await client.connect();
            
            // Ждём с учётом задержки сервера
            await new Promise(resolve => setTimeout(resolve, serverDelay + 100));
            
            // Проверяем, что handshake завершён успешно
            expect(client.isConnected()).toBe(true);
            expect(client.getConnectionState()).toBe('connected');
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('должен сохранять порядок сообщений: init → connected → subscribe', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              channel: fc.constantFrom('session', 'all', 'status'),
              sessionId: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (subscriptions) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Создаём подписки
            const subscriptionIds = subscriptions.map(sub =>
              client.subscribe({
                channel: sub.channel as any,
                sessionId: sub.channel === 'session' ? sub.sessionId : undefined,
                onMessage: () => {},
              })
            );
            
            // Ждём завершения handshake и подписок
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Проверяем порядок сообщений
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            
            // Если есть сообщения, проверяем порядок
            if (sentMessages.length > 0) {
              // Находим индексы типов сообщений
              const initIndex = sentMessages.findIndex(m => m.type === 'init');
              const firstSubscribeIndex = sentMessages.findIndex(m => m.type === 'subscribe');
              
              // Если есть init, он должен быть первым
              if (initIndex !== -1) {
                expect(initIndex).toBe(0);
              }
              
              // subscribe должны быть после init
              if (firstSubscribeIndex !== -1 && initIndex !== -1) {
                expect(firstSubscribeIndex).toBeGreaterThan(initIndex);
              }
              
              // Все subscribe сообщения должны быть после init
              sentMessages.forEach((msg, index) => {
                if (msg.type === 'subscribe' && initIndex !== -1) {
                  expect(index).toBeGreaterThan(initIndex);
                }
              });
            }
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);
  });

  /**
   * Property 4: Heartbeat запускается после handshake
   * 
   * Для любого валидного подключения, heartbeat механизм должен запускаться
   * ТОЛЬКО после получения connected сообщения от сервера (завершения handshake).
   * До получения connected heartbeat НЕ должен быть активен.
   * 
   * Feature: websocket-architecture-refactor, Property 4
   * Validates: Requirements 3.5
   */
  describe('Property 4: Heartbeat запускается после handshake', () => {
    it('должен запускать heartbeat ТОЛЬКО после получения connected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 100 }), // Задержка перед проверкой (мс)
          async (checkDelay) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Получаем доступ к HeartbeatMonitor через приватное поле (для тестирования)
            const heartbeatMonitor = (client as any).heartbeatMonitor;
            
            // До подключения heartbeat не должен быть запущен
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
            
            // Начинаем подключение
            await client.connect();
            
            // Ждём открытия WebSocket, но ДО получения connected
            await new Promise(resolve => setTimeout(resolve, 15));
            
            // После открытия WebSocket, но ДО получения connected, heartbeat НЕ должен быть запущен
            // (connected приходит через 20ms после init)
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
            
            // Ждём получения connected сообщения
            await new Promise(resolve => setTimeout(resolve, checkDelay));
            
            // После получения connected heartbeat ДОЛЖЕН быть запущен
            if (client.isConnected()) {
              expect(heartbeatMonitor.getIsRunning()).toBe(true);
            }
            
            client.destroy();
          }
        ),
        { numRuns: 30 }
      );
    }, 30000);

    it('должен останавливать heartbeat при закрытии соединения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1000, max: 4000 }), // Код закрытия
          async (closeCode) => {
            const client = PostgresRealtimeClient.getInstance();
            const heartbeatMonitor = (client as any).heartbeatMonitor;
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Heartbeat должен быть запущен
            if (client.isConnected()) {
              expect(heartbeatMonitor.getIsRunning()).toBe(true);
            }
            
            // Закрываем соединение
            client.disconnect(closeCode, 'Test close');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Heartbeat должен быть остановлен
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
            
            client.destroy();
          }
        ),
        { numRuns: 30 }
      );
    }, 30000);

    it('должен перезапускать heartbeat при переподключении', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // Количество циклов переподключения
          async (reconnectCycles) => {
            const client = PostgresRealtimeClient.getInstance();
            const heartbeatMonitor = (client as any).heartbeatMonitor;
            
            for (let i = 0; i < reconnectCycles; i++) {
              // Подключаемся
              await client.connect();
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Heartbeat должен быть запущен после handshake
              if (client.isConnected()) {
                expect(heartbeatMonitor.getIsRunning()).toBe(true);
              }
              
              // Отключаемся
              client.disconnect(1000, 'Test disconnect');
              await new Promise(resolve => setTimeout(resolve, 50));
              
              // Heartbeat должен быть остановлен
              expect(heartbeatMonitor.getIsRunning()).toBe(false);
            }
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('НЕ должен запускать heartbeat если handshake не завершён', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }), // Время проверки до завершения handshake (мс)
          async (checkTime) => {
            // Создаём Mock, который НЕ отвечает на init (handshake не завершается)
            global.WebSocket = class extends MockWebSocket {
              constructor(url: string) {
                super(url);
                mockWebSocket = this;
              }
              
              send(data: string): void {
                if (this.readyState !== MockWebSocket.OPEN) {
                  throw new Error('WebSocket is not open');
                }
                
                const message = JSON.parse(data);
                this.sentMessages.push(message);
                
                // НЕ отвечаем на init - handshake не завершается
              }
            } as any;
            
            const client = PostgresRealtimeClient.getInstance();
            const heartbeatMonitor = (client as any).heartbeatMonitor;
            
            await client.connect();
            
            // Ждём некоторое время
            await new Promise(resolve => setTimeout(resolve, checkTime));
            
            // Heartbeat НЕ должен быть запущен, т.к. handshake не завершён
            expect(heartbeatMonitor.getIsRunning()).toBe(false);
            expect(client.isConnected()).toBe(false);
            
            client.destroy();
          }
        ),
        { numRuns: 30 }
      );
    }, 30000);
  });

  /**
   * Property 8: Восстановление подписок после переподключения
   * 
   * Для любого набора подписок, после разрыва и восстановления соединения,
   * все активные подписки должны быть автоматически восстановлены.
   * Состояние подписок до разрыва = состояние подписок после восстановления.
   * 
   * Feature: websocket-architecture-refactor, Property 8
   * Validates: Requirements 4.3, 5.3, 14.3
   */
  describe('Property 8: Восстановление подписок после переподключения', () => {
    it('должен восстанавливать все подписки после переподключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              channel: fc.constantFrom('session', 'all', 'status'),
              sessionId: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (subscriptions) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Создаём подписки
            const subscriptionIds = subscriptions.map(sub =>
              client.subscribe({
                channel: sub.channel as any,
                sessionId: sub.channel === 'session' ? sub.sessionId : undefined,
                onMessage: () => {},
              })
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Сохраняем количество подписок до разрыва
            const subscriptionsBeforeDisconnect = client.getSubscriptionCount();
            expect(subscriptionsBeforeDisconnect).toBe(subscriptions.length);
            
            // Очищаем отправленные сообщения
            mockWebSocket?.clearSentMessages();
            
            // Симулируем разрыв соединения (аномальное закрытие)
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Подписки должны остаться в памяти
            expect(client.getSubscriptionCount()).toBe(subscriptions.length);
            
            // Переподключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Проверяем, что все подписки были восстановлены
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            const subscribeMessages = sentMessages.filter(m => m.type === 'subscribe');
            
            // Должны быть отправлены subscribe сообщения для всех подписок
            expect(subscribeMessages.length).toBe(subscriptions.length);
            
            // Проверяем, что все subscriptionId совпадают
            const restoredIds = subscribeMessages.map(m => m.subscriptionId);
            subscriptionIds.forEach(id => {
              expect(restoredIds).toContain(id);
            });
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('должен сохранять подписки при множественных переподключениях', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              channel: fc.constantFrom('session', 'all', 'status'),
              sessionId: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.integer({ min: 2, max: 4 }), // Количество циклов переподключения
          async (subscriptions, reconnectCycles) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Подключаемся и создаём подписки
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const subscriptionIds = subscriptions.map(sub =>
              client.subscribe({
                channel: sub.channel as any,
                sessionId: sub.channel === 'session' ? sub.sessionId : undefined,
                onMessage: () => {},
              })
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Выполняем несколько циклов разрыва/переподключения
            for (let i = 0; i < reconnectCycles; i++) {
              mockWebSocket?.clearSentMessages();
              
              // Разрыв
              mockWebSocket?.close(1006, 'Abnormal closure');
              await new Promise(resolve => setTimeout(resolve, 50));
              
              // Переподключение
              await client.connect();
              await new Promise(resolve => setTimeout(resolve, 150));
              
              // Проверяем восстановление подписок
              const sentMessages = mockWebSocket?.getSentMessages() || [];
              const subscribeMessages = sentMessages.filter(m => m.type === 'subscribe');
              
              expect(subscribeMessages.length).toBe(subscriptions.length);
              
              const restoredIds = subscribeMessages.map(m => m.subscriptionId);
              subscriptionIds.forEach(id => {
                expect(restoredIds).toContain(id);
              });
            }
            
            client.destroy();
          }
        ),
        { numRuns: 15 }
      );
    }, 30000);

    it('НЕ должен восстанавливать отписанные подписки', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              channel: fc.constantFrom('session', 'all', 'status'),
              sessionId: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (subscriptions) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Подключаемся и создаём подписки
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const subscriptionIds = subscriptions.map(sub =>
              client.subscribe({
                channel: sub.channel as any,
                sessionId: sub.channel === 'session' ? sub.sessionId : undefined,
                onMessage: () => {},
              })
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Отписываемся от половины подписок
            const halfIndex = Math.floor(subscriptionIds.length / 2);
            const unsubscribedIds = subscriptionIds.slice(0, halfIndex);
            const remainingIds = subscriptionIds.slice(halfIndex);
            
            unsubscribedIds.forEach(id => client.unsubscribe(id));
            await new Promise(resolve => setTimeout(resolve, 50));
            
            mockWebSocket?.clearSentMessages();
            
            // Разрыв и переподключение
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Проверяем, что восстановлены только оставшиеся подписки
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            const subscribeMessages = sentMessages.filter(m => m.type === 'subscribe');
            
            expect(subscribeMessages.length).toBe(remainingIds.length);
            
            const restoredIds = subscribeMessages.map(m => m.subscriptionId);
            
            // Оставшиеся подписки должны быть восстановлены
            remainingIds.forEach(id => {
              expect(restoredIds).toContain(id);
            });
            
            // Отписанные подписки НЕ должны быть восстановлены
            unsubscribedIds.forEach(id => {
              expect(restoredIds).not.toContain(id);
            });
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('должен восстанавливать подписки в правильном порядке после handshake', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              channel: fc.constantFrom('session', 'all', 'status'),
              sessionId: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (subscriptions) => {
            const client = PostgresRealtimeClient.getInstance();
            
            // Подключаемся и создаём подписки
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            subscriptions.forEach(sub =>
              client.subscribe({
                channel: sub.channel as any,
                sessionId: sub.channel === 'session' ? sub.sessionId : undefined,
                onMessage: () => {},
              })
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            mockWebSocket?.clearSentMessages();
            
            // Разрыв и переподключение
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Проверяем порядок: init → subscribe сообщения
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            
            const initIndex = sentMessages.findIndex(m => m.type === 'init');
            const firstSubscribeIndex = sentMessages.findIndex(m => m.type === 'subscribe');
            
            // init должен быть первым
            expect(initIndex).toBe(0);
            
            // subscribe должны быть после init
            if (firstSubscribeIndex !== -1) {
              expect(firstSubscribeIndex).toBeGreaterThan(initIndex);
            }
            
            // Все subscribe должны быть после init
            sentMessages.forEach((msg, index) => {
              if (msg.type === 'subscribe') {
                expect(index).toBeGreaterThan(initIndex);
              }
            });
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);
  });

  /**
   * Property 9: Отправка сообщений из очереди после переподключения
   * 
   * Для любого набора сообщений, отправленных во время разрыва соединения,
   * все сообщения должны быть сохранены в очереди и отправлены после
   * восстановления соединения в порядке FIFO.
   * 
   * Feature: websocket-architecture-refactor, Property 9
   * Validates: Requirements 4.4, 6.4, 14.3
   */
  describe('Property 9: Отправка сообщений из очереди после переподключения', () => {
    it('должен отправлять сообщения из очереди после переподключения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.constant('custom_message'),
              data: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (messages) => {
            const client = PostgresRealtimeClient.getInstance();
            const messageQueue = (client as any).messageQueue;
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Закрываем соединение
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Пытаемся отправить сообщения во время разрыва
            // Они должны попасть в очередь
            messages.forEach(msg => {
              messageQueue.enqueue(msg);
            });
            
            // Проверяем, что сообщения в очереди
            expect(messageQueue.size()).toBe(messages.length);
            
            mockWebSocket?.clearSentMessages();
            
            // Переподключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Очередь должна быть пуста (сообщения отправлены)
            expect(messageQueue.size()).toBe(0);
            
            // Проверяем, что сообщения были отправлены
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            const customMessages = sentMessages.filter(m => m.type === 'custom_message');
            
            expect(customMessages.length).toBe(messages.length);
            
            // Проверяем порядок FIFO
            customMessages.forEach((sentMsg, index) => {
              expect(sentMsg.data).toBe(messages[index].data);
            });
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('должен отправлять сообщения из очереди ПОСЛЕ handshake', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.constant('custom_message'),
              data: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (messages) => {
            const client = PostgresRealtimeClient.getInstance();
            const messageQueue = (client as any).messageQueue;
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Разрыв
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Добавляем сообщения в очередь
            messages.forEach(msg => messageQueue.enqueue(msg));
            
            mockWebSocket?.clearSentMessages();
            
            // Переподключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Проверяем порядок: init → connected → сообщения из очереди
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            
            const initIndex = sentMessages.findIndex(m => m.type === 'init');
            const firstCustomIndex = sentMessages.findIndex(m => m.type === 'custom_message');
            
            // init должен быть первым
            expect(initIndex).toBe(0);
            
            // Сообщения из очереди должны быть после init
            if (firstCustomIndex !== -1) {
              expect(firstCustomIndex).toBeGreaterThan(initIndex);
            }
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('должен сохранять порядок FIFO при отправке из очереди', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.integer({ min: 1, max: 1000 }),
            { minLength: 5, maxLength: 20 }
          ),
          async (messageIds) => {
            const client = PostgresRealtimeClient.getInstance();
            const messageQueue = (client as any).messageQueue;
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Разрыв
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Добавляем сообщения с уникальными ID в очередь
            messageIds.forEach(id => {
              messageQueue.enqueue({
                type: 'custom_message',
                id: id,
              });
            });
            
            mockWebSocket?.clearSentMessages();
            
            // Переподключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Проверяем порядок отправки
            const sentMessages = mockWebSocket?.getSentMessages() || [];
            const customMessages = sentMessages.filter(m => m.type === 'custom_message');
            
            expect(customMessages.length).toBe(messageIds.length);
            
            // Порядок должен совпадать с порядком добавления в очередь
            customMessages.forEach((msg, index) => {
              expect(msg.id).toBe(messageIds[index]);
            });
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('НЕ должен сохранять subscribe/unsubscribe в очереди', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              channel: fc.constantFrom('session', 'all', 'status'),
              sessionId: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (subscriptions) => {
            const client = PostgresRealtimeClient.getInstance();
            const messageQueue = (client as any).messageQueue;
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Разрыв
            mockWebSocket?.close(1006, 'Abnormal closure');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Пытаемся создать подписки во время разрыва
            subscriptions.forEach(sub => {
              client.subscribe({
                channel: sub.channel as any,
                sessionId: sub.channel === 'session' ? sub.sessionId : undefined,
                onMessage: () => {},
              });
            });
            
            // subscribe сообщения НЕ должны попасть в очередь
            // (они восстанавливаются через SubscriptionManager)
            const queueSize = messageQueue.size();
            
            // Очередь должна быть пуста или содержать только не-subscribe сообщения
            // (в данном случае должна быть пуста)
            expect(queueSize).toBe(0);
            
            client.destroy();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('должен отправлять сообщения из очереди при множественных переподключениях', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // Количество циклов
          fc.array(
            fc.record({
              type: fc.constant('custom_message'),
              data: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (cycles, messagesPerCycle) => {
            const client = PostgresRealtimeClient.getInstance();
            const messageQueue = (client as any).messageQueue;
            
            // Подключаемся
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const allSentMessages: any[] = [];
            
            for (let i = 0; i < cycles; i++) {
              // Разрыв
              mockWebSocket?.close(1006, 'Abnormal closure');
              await new Promise(resolve => setTimeout(resolve, 50));
              
              // Добавляем сообщения в очередь
              const cycleMessages = messagesPerCycle.map(msg => ({
                ...msg,
                cycle: i,
              }));
              
              cycleMessages.forEach(msg => messageQueue.enqueue(msg));
              
              mockWebSocket?.clearSentMessages();
              
              // Переподключаемся
              await client.connect();
              await new Promise(resolve => setTimeout(resolve, 150));
              
              // Сохраняем отправленные сообщения
              const sentMessages = mockWebSocket?.getSentMessages() || [];
              const customMessages = sentMessages.filter(m => m.type === 'custom_message');
              allSentMessages.push(...customMessages);
              
              // Очередь должна быть пуста после отправки
              expect(messageQueue.size()).toBe(0);
            }
            
            // Проверяем, что все сообщения были отправлены
            expect(allSentMessages.length).toBe(cycles * messagesPerCycle.length);
            
            client.destroy();
          }
        ),
        { numRuns: 15 }
      );
    }, 30000);
  });
});
