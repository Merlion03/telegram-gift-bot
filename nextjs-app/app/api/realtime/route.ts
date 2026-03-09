/**
 * API Route для WebSocket upgrade
 * Обрабатывает HTTP запросы на /api/realtime и проверяет возможность WebSocket upgrade
 * 
 * Validates: Requirements 2.1
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET handler для WebSocket upgrade endpoint
 * 
 * В custom server (server.ts) WebSocket upgrade обрабатывается на уровне HTTP сервера
 * через событие 'upgrade'. Этот route служит для обработки обычных HTTP GET запросов
 * к /api/realtime, которые не являются WebSocket upgrade запросами.
 * 
 * Если клиент пытается подключиться через обычный HTTP (без WebSocket upgrade),
 * возвращаем 426 Upgrade Required с инструкциями.
 */
export async function GET(request: NextRequest) {
  // Проверка заголовка Upgrade
  const upgradeHeader = request.headers.get('upgrade');
  const connectionHeader = request.headers.get('connection');

  // Если это попытка WebSocket upgrade, но она попала сюда (не обработана на уровне HTTP сервера)
  if (
    upgradeHeader?.toLowerCase() === 'websocket' &&
    connectionHeader?.toLowerCase().includes('upgrade')
  ) {
    return NextResponse.json(
      {
        error: 'WebSocket upgrade должен обрабатываться на уровне HTTP сервера',
        message: 'Убедитесь, что custom server (server.ts) запущен и обрабатывает upgrade события',
      },
      { status: 500 }
    );
  }

  // Для обычных HTTP запросов возвращаем 426 Upgrade Required
  return NextResponse.json(
    {
      error: 'Upgrade Required',
      message: 'Этот endpoint требует WebSocket подключения',
      instructions: {
        protocol: 'WebSocket',
        url: `ws://${request.headers.get('host')}/api/realtime`,
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
        },
        authentication: 'Требуется валидный NextAuth session token в cookies',
      },
    },
    { 
      status: 426,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
      },
    }
  );
}

/**
 * Обработка других HTTP методов
 * Все методы кроме GET не поддерживаются
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Method Not Allowed', message: 'Только GET запросы поддерживаются для WebSocket upgrade' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method Not Allowed', message: 'Только GET запросы поддерживаются для WebSocket upgrade' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method Not Allowed', message: 'Только GET запросы поддерживаются для WebSocket upgrade' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Method Not Allowed', message: 'Только GET запросы поддерживаются для WebSocket upgrade' },
    { status: 405 }
  );
}
