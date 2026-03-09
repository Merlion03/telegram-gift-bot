/**
 * Интеграционный тест: Полный handshake протокол
 * 
 * Проверяет последовательность: connect → init → connected → subscribe
 * Requirements: 14.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { Pool } from 'pg';
import * as fc from 'fast-check';
import { integrationFastCheckConfig, delay, waitFor } from '../setup';
import { tokenArbitrary, subscriptionTypeArbitrary, sessionIdArbitrary } from '../arbitraries';
import { RealtimeWebSocketServer } from '../../server/RealtimeWebSocketServer';
import { PostgresRealtimeClient } from '../../client/PostgresRealtimeClient';
import type { ServerMessage, SubscribeMessage } from '../../types';

// Увеличиваем timeout для интеграционных тестов
vi.setConfig({ testTimeout: 120_000 });

describe('Integration: Handshake Protocol', () => {
  let server: RealtimeWebSocketServer;
  let wss: WebSocketServer;
  let pool: Pool;
  let serverPort: number;

  beforeEach(async () => {
    // Создаём mock PostgreSQL pool
    pool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
        on: vi.fn(),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
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
  });

  /**
   * Property 1: Полный handshake round-trip
   * 
   * FOR ALL валидных токенов и типов подписок,
   * WHEN клиент подключается и выполняет handshake,
   * THEN последовательность connect → init → connected → subscribe должна завершиться успешно
   */
  it('должен выполнить полный handshake: connect → init → connected → subscribe', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArbitrary.filter(t => t.includes('.')), // Только валидные токены
        subscriptionTypeArbitrary,
        fc.option(sessionIdArbitrary, { nil: undefined }),
        async (token, subscriptionType, sessionId) => {
          // Создаём клиента
          const client = PostgresRealtimeClient.createForTesting(
            `ws://localhost:${serverPort}`,
            token
          );

          let connectedReceived = false;
          let subscriptionConfirmed = false;
          let clientId: string | null = null;

          // Отслеживаем события
          const messageHandler = (message: ServerMessage) => {
            if (message.type === 'connected') {
              connectedReceived = true;
              clientId = message.clientId;
            } else if (message.type === 'subscription_confirmed') {
              subscriptionConfirmed = true;
            }
          };

          try {
            // Шаг 1: Подключение
            await client.connect();
            await delay(100); // Даём время на установку соединения

            // Проверяем, что соединение установлено
            expect(client.isConnected()).toBe(true);

            // Шаг 2: Ожидаем connected сообщение
            await waitFor(() => connectedReceived, 5000);
            expect(connectedReceived).toBe(true);
            expect(clientId).toBeTruthy();

            // Шаг 3: Подписка
            const subscriptionId = await new Promise<string>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
              
              const subId = client.subscribe({
                channel: subscriptionType,
                sessionId: subscriptionType === 'session' ? sessionId : undefined,
                onMessage: messageHandler,
                onConfirmed: () => {
                  clearTimeout(timeout);
                  resolve(subId);
                },
                onError: (error) => {
                  clearTimeout(timeout);
                  reject(error);
                },
              });
            });

            // Проверяем, что подписка подтверждена
            expect(subscriptionId).toBeTruthy();

            // Отключаемся
            client.disconnect();
            await delay(100);

            return true;
          } catch (error) {
            console.error('Handshake failed:', error);
            client.disconnect();
            return false;
          }
        }
      ),
      integrationFastCheckConfig
    );
  });

  /**
   * Example 1: Конкретный пример успешного handshake
   */
  it('должен выполнить handshake с конкретными данными', async () => {
    const token = 'valid.jwt.token';
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    let connectedReceived = false;
    let clientId: string | null = null;

    // Подключаемся
    await client.connect();
    await delay(100);

    // Ожидаем connected
    await waitFor(() => {
      // Проверяем внутреннее состояние через публичные методы
      return client.isConnected();
    }, 5000);

    expect(client.isConnected()).toBe(true);

    // Подписываемся
    const subscriptionId = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      
      const subId = client.subscribe({
        channel: 'all',
        onMessage: () => {},
        onConfirmed: () => {
          clearTimeout(timeout);
          resolve(subId);
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    expect(subscriptionId).toBeTruthy();

    // Отключаемся
    client.disconnect();
    await delay(100);
  });

  /**
   * Example 2: Handshake с session подпиской
   */
  it('должен выполнить handshake с session подпиской', async () => {
    const token = 'valid.jwt.token';
    const sessionId = 123;
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    // Подключаемся
    await client.connect();
    await delay(100);

    // Ожидаем connected
    await waitFor(() => client.isConnected(), 5000);

    // Подписываемся на session
    const subscriptionId = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      
      const subId = client.subscribe({
        channel: 'session',
        sessionId,
        onMessage: () => {},
        onConfirmed: () => {
          clearTimeout(timeout);
          resolve(subId);
        },
        onError: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    expect(subscriptionId).toBeTruthy();

    // Отключаемся
    client.disconnect();
    await delay(100);
  });

  /**
   * Example 3: Множественные подписки после handshake
   */
  it('должен поддерживать множественные подписки после handshake', async () => {
    const token = 'valid.jwt.token';
    const client = PostgresRealtimeClient.createForTesting(
      `ws://localhost:${serverPort}`,
      token
    );

    // Подключаемся
    await client.connect();
    await delay(100);

    // Ожидаем connected
    await waitFor(() => client.isConnected(), 5000);

    // Создаём несколько подписок
    const subscriptionIds: string[] = [];

    for (const channel of ['all', 'status'] as const) {
      const subId = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);
        
        const id = client.subscribe({
          channel,
          onMessage: () => {},
          onConfirmed: () => {
            clearTimeout(timeout);
            resolve(id);
          },
          onError: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
      });

      subscriptionIds.push(subId);
    }

    // Проверяем, что все подписки созданы
    expect(subscriptionIds.length).toBe(2);
    expect(new Set(subscriptionIds).size).toBe(2); // Уникальные ID

    // Отключаемся
    client.disconnect();
    await delay(100);
  });
});
