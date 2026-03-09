/**
 * Custom Next.js server with WebSocket support.
 * Integrates RealtimeWebSocketServer for real-time notifications.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Pool } from 'pg';
import { RealtimeWebSocketServer } from './lib/realtime/RealtimeWebSocketServer';
import { WebSocket } from 'ws';

// Load local env for development
config({ path: resolve(__dirname, '.env.local') });

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function createPgPool(): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'telegram_bot',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

async function startServer() {
  try {
    console.log('[Server] Preparing Next.js application...');
    await app.prepare();

    const pgPool = createPgPool();
    console.log('[Server] PostgreSQL connection pool created');

    const server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url || '', true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[Server] Request handling error:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });

    console.log('[Server] Initializing RealtimeWebSocketServer...');
    const realtimeServer = new RealtimeWebSocketServer(server, {
      jwtSecret: process.env.NEXTAUTH_SECRET!,
      pgPool,
      shutdownTimeout: 10000,
    });
    await realtimeServer.initialize();

    // Isolate websocket upgrades for /api/realtime from any future Next.js upgrade listeners.
    // Some listeners can destroy unknown sockets, which causes immediate client/server close code 1006.
    const delegatedUpgradeListeners: Array<(request: any, socket: any, head: Buffer) => void> = [];
    const registerDelegatedUpgradeListener = (
      listener: (request: any, socket: any, head: Buffer) => void
    ): void => {
      if (!delegatedUpgradeListeners.includes(listener)) {
        delegatedUpgradeListeners.push(listener);
      }
    };

    const initialUpgradeListeners = server.listeners('upgrade') as Array<
      (request: any, socket: any, head: Buffer) => void
    >;
    for (const listener of initialUpgradeListeners) {
      registerDelegatedUpgradeListener(listener);
    }
    console.log(
      `[Server] Captured ${delegatedUpgradeListeners.length} existing upgrade listener(s) for delegation`
    );

    server.removeAllListeners('upgrade');

    const upgradeHandler = async (request: any, socket: any, head: Buffer) => {
      const upgradeId = Math.random().toString(36).substring(7);
      const { pathname } = parse(request.url || '', true);

      console.log(`[Server][${upgradeId}] ========== NEW UPGRADE REQUEST ==========`);
      console.log(`[Server][${upgradeId}] Pathname: ${pathname}`);
      console.log(`[Server][${upgradeId}] URL: ${request.url}`);
      console.log(
        `[Server][${upgradeId}] Socket state: destroyed=${socket.destroyed}, writable=${socket.writable}, readable=${socket.readable}`
      );
      console.log(`[Server][${upgradeId}] Headers:`, {
        upgrade: request.headers['upgrade'],
        connection: request.headers['connection'],
        origin: request.headers['origin'],
        'user-agent': request.headers['user-agent'],
      });

      if (pathname === '/api/realtime') {
        const wss = realtimeServer.getWebSocketServer();
        const upgradeHeader = request.headers['upgrade'];

        if (!upgradeHeader || String(upgradeHeader).toLowerCase() !== 'websocket') {
          console.error(`[Server][${upgradeId}] Invalid upgrade header:`, upgradeHeader);
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        try {
          console.log(`[Server][${upgradeId}] Upgrading websocket for /api/realtime...`);
          const upgradeStartTime = Date.now();

          wss.handleUpgrade(request, socket, head, (ws) => {
            const upgradeDuration = Date.now() - upgradeStartTime;
            console.log(`[Server][${upgradeId}] WebSocket upgrade callback after ${upgradeDuration}ms`);
            console.log(
              `[Server][${upgradeId}] WebSocket readyState: ${ws.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`
            );

            if (ws.readyState !== WebSocket.OPEN) {
              console.error(
                `[Server][${upgradeId}] WebSocket is not OPEN after upgrade, readyState=${ws.readyState}`
              );
              return;
            }

            console.log(`[Server][${upgradeId}] WebSocket upgrade successful`);
            console.log(`[Server][${upgradeId}] Calling realtimeServer.handleConnection...`);

            void realtimeServer.handleConnection(ws, request).catch((error) => {
              console.error(`[Server][${upgradeId}] handleConnection failed:`, error);
              if (ws.readyState === WebSocket.OPEN) {
                ws.close(1011, 'Internal server error');
              }
            });
          });

          console.log(`[Server][${upgradeId}] handleUpgrade called, waiting callback...`);
        } catch (error) {
          console.error(`[Server][${upgradeId}] Error during WebSocket setup:`, error);
          if (!socket.destroyed) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
          }
        }
        return;
      }

      console.log(`[Server][${upgradeId}] Not /api/realtime, delegating to Next.js listeners`);
      if (delegatedUpgradeListeners.length > 0) {
        console.log(
          `[Server][${upgradeId}] Delegating to ${delegatedUpgradeListeners.length} upgrade listener(s)`
        );
        for (const listener of delegatedUpgradeListeners.slice()) {
          listener.call(server, request, socket, head);
        }
      } else {
        console.log(`[Server][${upgradeId}] No delegated upgrade listeners, destroying socket`);
        socket.destroy();
      }
    };

    // Capture and remove any upgrade listeners that may be added later by Next.js.
    server.on('newListener', (event: string | symbol, listener: (...args: any[]) => void) => {
      if (event !== 'upgrade') {
        return;
      }
      if (listener === upgradeHandler) {
        return;
      }

      registerDelegatedUpgradeListener(listener as (request: any, socket: any, head: Buffer) => void);
      process.nextTick(() => {
        server.removeListener('upgrade', listener);
      });
      console.log('[Server] Captured a new upgrade listener and moved it to delegation list');
    });

    server.on('upgrade', upgradeHandler);

    server.listen(port, () => {
      console.log(`[Server] Server started at http://${hostname}:${port}`);
      console.log(`[Server] WebSocket endpoint: ws://${hostname}:${port}/api/realtime`);
      console.log(`[Server] Mode: ${dev ? 'development' : 'production'}`);
    });

    server.on('error', (err) => {
      console.error('[Server] Critical HTTP server error:', err);
      process.exit(1);
    });

    const shutdown = async () => {
      console.log('[Server] Shutdown signal received, closing server...');

      server.close(() => {
        console.log('[Server] HTTP server closed');
      });

      await pgPool.end();
      console.log('[Server] PostgreSQL pool closed');

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('[Server] Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
