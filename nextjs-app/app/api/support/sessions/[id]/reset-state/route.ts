/**
 * API Route: POST /api/support/sessions/[id]/reset-state
 * Сброс состояния пользователя и отправка команды /start
 * Требует аутентификации и прав администратора или оператора
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminRequestAuth } from '@/lib/auth/adminRequestAuth';
import { getDb } from '@/lib/database/client';

/**
 * Параметры маршрута
 */
interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * POST /api/support/sessions/[id]/reset-state
 * Сбрасывает состояние пользователя и отправляет команду /start
 * 
 * Path параметры:
 * - id: ID сессии (обязательный)
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Проверка аутентификации (Requirements 4.2, 8.1)
    const adminAuth = await resolveAdminRequestAuth(request);

    if (!adminAuth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Проверка роли пользователя (Requirements 4.4, 7.3, 7.4)
    // Разрешены роли: 0 (Developer), 1 (Assistant), 2 (Administrator), 3 (Operator)
    if (adminAuth.role === undefined || adminAuth.role < 0 || adminAuth.role > 3) {
      // Логирование неудачной попытки доступа (Requirements 7.6, 8.5)
      console.warn('reset_state_forbidden_attempt', {
        admin_id: adminAuth.adminId,
        role: adminAuth.role,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Недостаточно прав для выполнения операции' },
        { status: 403 }
      );
    }

    // Извлечение и валидация ID сессии (Requirements 4.1, 8.2)
    const resolvedParams = await params;
    const sessionId = parseInt(resolvedParams.id, 10);

    if (isNaN(sessionId) || sessionId < 1) {
      return NextResponse.json(
        { error: 'Invalid session_id', message: 'ID сессии должен быть положительным числом' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Проверка существования сессии (Requirements 4.1, 8.1)
    const supportSession = await db.getSession(sessionId);
    
    if (!supportSession) {
      return NextResponse.json(
        { error: 'Session not found', message: 'Сессия не найдена' },
        { status: 404 }
      );
    }

    // Проверка статуса сессии (Requirements 4.1, 8.2)
    if (supportSession.status !== 'active') {
      return NextResponse.json(
        { error: 'Session closed', message: 'Сессия уже завершена' },
        { status: 400 }
      );
    }

    // Вызов Python Bot API для сброса состояния (Requirements 4.5, 4.6)
    const botApiUrl = process.env.BACKEND_API_URL || process.env.BOT_API_URL || 'http://localhost:5000';
    
    try {
      const botResponse = await fetch(`${botApiUrl}/api/bot/reset-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: supportSession.telegram_id,
          session_id: sessionId,
          admin_id: adminAuth.adminId,
        }),
      });

      if (!botResponse.ok) {
        const errorData = await botResponse.json().catch(() => ({}));
        
        // Логирование ошибки Bot API (Requirements 8.5)
        console.error('bot_api_error', {
          session_id: sessionId,
          telegram_id: supportSession.telegram_id,
          admin_id: adminAuth.adminId,
          status: botResponse.status,
          error: errorData.error || 'Unknown error',
          timestamp: new Date().toISOString(),
        });

        throw new Error(`Bot API returned ${botResponse.status}`);
      }

      const botData = await botResponse.json();

      // Логирование успешного сброса (Requirements 7.5, 8.4)
      console.log('state_reset_success', {
        session_id: sessionId,
        telegram_id: supportSession.telegram_id,
        admin_id: adminAuth.adminId,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Состояние пользователя успешно сброшено',
          session_id: sessionId,
          telegram_id: supportSession.telegram_id,
        },
        { status: 200 }
      );

    } catch (botError) {
      // Обработка недоступности Bot API (Requirements 8.3)
      console.error('bot_unavailable', {
        session_id: sessionId,
        telegram_id: supportSession.telegram_id,
        admin_id: adminAuth.adminId,
        error: botError instanceof Error ? botError.message : 'Unknown error',
        stack: botError instanceof Error ? botError.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        { error: 'Bot unavailable', message: 'Бот временно недоступен' },
        { status: 503 }
      );
    }

  } catch (error) {
    // Обработка внутренних ошибок (Requirements 8.4, 8.5)
    console.error('POST /api/support/sessions/[id]/reset-state error:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Не удалось сбросить состояние пользователя'
      },
      { status: 500 }
    );
  }
}
