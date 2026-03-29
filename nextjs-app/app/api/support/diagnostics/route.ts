/**
 * API Route: GET /api/support/diagnostics
 * Диагностика сетевых проблем и состояния Telegram Bot API
 * Требует аутентификации через NextAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminRequestAuth } from '@/lib/auth/adminRequestAuth';
import { NetworkDiagnostics } from '@/lib/telegram/networkDiagnostics';
import { TelegramBotApi } from '@/lib/telegram/botApi';

/**
 * GET /api/support/diagnostics
 * Выполняет полную диагностику сетевых проблем
 */
export async function GET(request: NextRequest) {
  try {
    // Проверка аутентификации
    const adminAuth = await resolveAdminRequestAuth(request);

    if (!adminAuth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Запускаем диагностику
    const diagnostics = await NetworkDiagnostics.runFullDiagnostics();
    
    // Дополнительно проверяем конкретно наш бот
    let botStatus = null;
    const botToken = process.env.BOT_TOKEN;
    
    if (botToken) {
      try {
        const botApi = new TelegramBotApi(botToken);
        const connectionOk = await botApi.checkConnection();
        
        if (connectionOk) {
          const botInfo = await botApi.getBotInfo();
          botStatus = {
            connected: true,
            botInfo,
          };
        } else {
          botStatus = {
            connected: false,
            error: 'Failed to connect to bot',
          };
        }
      } catch (error) {
        botStatus = {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    } else {
      botStatus = {
        connected: false,
        error: 'BOT_TOKEN not configured',
      };
    }

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        diagnostics,
        botStatus,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          hasProxy: !!process.env.HTTP_PROXY || !!process.env.HTTPS_PROXY,
          userAgent: request.headers.get('user-agent'),
        },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('GET /api/support/diagnostics error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Не удалось выполнить диагностику',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
