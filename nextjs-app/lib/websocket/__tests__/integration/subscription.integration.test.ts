/**
 * Интеграционный тест: Подписка с уведомлениями
 * 
 * Проверяет: subscribe → subscription_confirmed → получение уведомления
 * Requirements: 14.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { Pool, PoolClient } from 'pg';
import * as fc from 'fast-check';
import { integrationFastCheckConfig, delay, waitFor } from '../setup';
import { 
  tokenArbitrary, 
  subscriptionTypeArbitrary, 
  sessionIdArbitrary,
  newMessageMessageArbitrary,
  statusChangeMessageArbitrary,
} from '../arbitraries';
import { RealtimeWebSocketServer } from '../../server/RealtimeWebSocketServer';
import { PostgresRealtimeClient } from '../../client/PostgresRealtimeClient';
import type { ServerMessage, NewMessageMessage, StatusChangeMessage } from '../../types';

// Увеличиваем timeout для интеграционных тестов
vi.setConfig({ testTimeout: 120_000 });

describe('Integration: Subscription with Notifications', () => {
  let server: RealtimeWebSocketServer;
  let wss: WebSocketServer;
  let pool: Pool;
  let mockListenClient: PoolClient;
  let serverPort: number;
  let notificationCallbacks: Map<string, (channel: string, payload: string) => void>;

  beforeEach(async () => {
    notificationCallbacks = new Map();

    // Создаём mock PoolClient для LISTEN
    mockListenClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      on: vi.fn((event, callback) => {
        if (event === 'notification') {
          // Сохраняем callback для эмуляции уведомлений
          notificationCallbacks.set('notification', callback);
        }
      }),
      release: vi.fn(),
    } as any;

    // Создаём mock PostgreSQL pool
    pool = {
      connect: vi.fn().mockResolvedValue(mockListenClient),
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
      end: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Создаём WebSocket сервер на случайном порту
    wss = new WebSocketServer({ port: 0 });
    serverPort = (wss.address() as any).port;

    // Создаём RealtimeWebSocketServer
    server = RealtimeWebSocketServer.createForTesting(wss, pool);
    await server.initialize();
  });

  afterEach(async () => {
    await server.shutdown();
    wss.close();
    await pool.end();
    notificationCallbacks.clear();
  });

  /**
   * Хелпер для эмуляции PostgreSQL NOTIFY
   */
  function emulatePostgresNotify(channel: string, payload: any) {
    const callback = notificationCallbacks.get('notification');
    if (callback) {
      callback(channel, JSON.stringify(payload));
    }
  }

  /**
   * Property 1: Subscription round-trip с уведомлениями
   * 
   * FOR ALL валидных подписок,
   * WHEN клиент подписывается и сервер отправляет уведомление,
   * THEN клиент должен получить уведомление
   */
  it('должен получать уведомления после подписки', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArbitrary.filter(t => t.includes('.')),
        sessionIdArbitrary,
        newMessageMessageArbitrary,
        async (token, sessionId, notificationData) => {
          const client = PostgresRealtimeClient.createForTesting(
            `ws://localhost:${serverPort}`,
            token
          );

          let notificationReceived = false;
          let receivedData: any = null;

          try {
            // Подключаемся
            await client.connect();
            await delay(100);
            await waitFor(() => client.isConnected(), 5000);

            // Подписываемся на session
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
              
              client.subscribe({
                channel: 'session',
                sessionId,
                onMessage: (message) => {
                  if (message.type === 'new_message') {
                    notificationReceived = true;
                    receivedData = message.data;
                  }
                },
                onConfirmed: () => {
                  clearTimeout(timeout);
                  resolve();
                },
                onError: (error) => {
                  clearTimeout(timeout);
                  reject(error);
                },
              });
            });

            // Даём время на установку подписки на сервере
            await delay(200);

            // Эмулируем PostgreSQL NOTIFY
            emulatePostgresNotify(`session_${sessionId}`, {
              type: 'new_message',
              data: notificationData.data,
            });

            // Ожидаем получение уведомления
            await waitFor(() => notificationReceived, 5000);

            // Проверяем, что данные получены
            expect(receivedData).toBeTruthy();

            // Отключаемся
            client.disconnect();
            await delay(100);

            return true;
          } catch (error) {
            console.error('Subscription notification failed:', error);
            client.disconnect();
            return false;
          }
        }
      ),
      integrationFastCheckConfig
    );
  });

  /**
   * Example 1: Получение new_message уведомления
   */
  it('должен получить new_message уведомление', async () => {
    const token = 'valid.jwt.token';
    const sessionId = 123;
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    let messageReceived = false;
    let receivedMessage: any = null;

    // Подключаемся
    await client.connect();
    await delay(100);
    await waitFor(() => client.isConnected(), 5000);

    // Подписываемся
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      
      client.subscribe({
        channel: 'session',
        sessionId,
        onMessage: (message) => {
          if (message.type === 'new_message') {
            messageReceived = true;
            receivedMessage = message;
          }
        },
        onConfirmed: () => {
          clearTimeout(timeout);
          resolve();
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    await delay(200);

    // Отправляем уведомление
    const notification = {
      type: 'new_message',
      data: {
        id: 1,
        session_id: sessionId,
        sender_type: 'user',
        message_text: 'Test message',
        created_at: new Date().toISOString(),
        is_read: false,
      },
    };

    emulatePostgresNotify(`session_${sessionId}`, notification);

    // Ожидаем получение
    await waitFor(() => messageReceived, 5000);

    expect(messageReceived).toBe(true);
    expect(receivedMessage).toMatchObject({
      type: 'new_message',
      data: expect.objectContaining({
        id: 1,
        session_id: sessionId,
        message_text: 'Test message',
      }),
    });

    client.disconnect();
    await delay(100);
  });

  /**
   * Example 2: Получение status_change уведомления
   */
  it('должен получить status_change уведомление', async () => {
    const token = 'valid.jwt.token';
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    let statusChangeReceived = false;
    let receivedChange: any = null;

    // Подключаемся
    await client.connect();
    await delay(100);
    await waitFor(() => client.isConnected(), 5000);

    // Подписываемся на status changes
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      
      client.subscribe({
        channel: 'status',
        onMessage: (message) => {
          if (message.type === 'status_change') {
            statusChangeReceived = true;
            receivedChange = message;
          }
        },
        onConfirmed: () => {
          clearTimeout(timeout);
          resolve();
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    await delay(200);

    // Отправляем уведомление
    const notification = {
      type: 'status_change',
      sessionId: 456,
      oldStatus: 'open',
      newStatus: 'in_progress',
    };

    emulatePostgresNotify('status_changes', notification);

    // Ожидаем получение
    await waitFor(() => statusChangeReceived, 5000);

    expect(statusChangeReceived).toBe(true);
    expect(receivedChange).toMatchObject({
      type: 'status_change',
      sessionId: 456,
      oldStatus: 'open',
      newStatus: 'in_progress',
    });

    client.disconnect();
    await delay(100);
  });

  /**
   * Example 3: Множественные уведомления для одной подписки
   */
  it('должен получить несколько уведомлений подряд', async () => {
    const token = 'valid.jwt.token';
    const sessionId = 789;
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    const receivedMessages: any[] = [];

    // Подключаемся
    await client.connect();
    await delay(100);
    await waitFor(() => client.isConnected(), 5000);

    // Подписываемся
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      
      client.subscribe({
        channel: 'session',
        sessionId,
        onMessage: (message) => {
          if (message.type === 'new_message') {
            receivedMessages.push(message);
          }
        },
        onConfirmed: () => {
          clearTimeout(timeout);
          resolve();
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    await delay(200);

    // Отправляем несколько уведомлений
    for (let i = 1; i <= 3; i++) {
      const notification = {
        type: 'new_message',
        data: {
          id: i,
          session_id: sessionId,
          sender_type: 'user',
          message_text: `Message ${i}`,
          created_at: new Date().toISOString(),
          is_read: false,
        },
      };

      emulatePostgresNotify(`session_${sessionId}`, notification);
      await delay(100);
    }

    // Ожидаем получение всех сообщений
    await waitFor(() => receivedMessages.length === 3, 5000);

    expect(receivedMessages.length).toBe(3);
    expect(receivedMessages[0].data.message_text).toBe('Message 1');
    expect(receivedMessages[1].data.message_text).toBe('Message 2');
    expect(receivedMessages[2].data.message_text).toBe('Message 3');

    client.disconnect();
    await delay(100);
  });

  /**
   * Example 4: Подписка на all_messages
   */
  it('должен получать уведомления через all_messages подписку', async () => {
    const token = 'valid.jwt.token';
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    let messageReceived = false;

    // Подключаемся
    await client.connect();
    await delay(100);
    await waitFor(() => client.isConnected(), 5000);

    // Подписываемся на all messages
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      
      client.subscribe({
        channel: 'all',
        onMessage: (message) => {
          if (message.type === 'new_message') {
            messageReceived = true;
          }
        },
        onConfirmed: () => {
          clearTimeout(timeout);
          resolve();
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    await delay(200);

    // Отправляем уведомление
    const notification = {
      type: 'new_message',
      data: {
        id: 999,
        session_id: 123,
        sender_type: 'admin',
        message_text: 'Broadcast message',
        created_at: new Date().toISOString(),
        is_read: false,
      },
    };

    emulatePostgresNotify('all_messages', notification);

    // Ожидаем получение
    await waitFor(() => messageReceived, 5000);

    expect(messageReceived).toBe(true);

    client.disconnect();
    await delay(100);
  });
});
