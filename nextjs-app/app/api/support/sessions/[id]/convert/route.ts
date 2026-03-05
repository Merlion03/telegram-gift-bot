/**
 * API Route: POST /api/support/sessions/[id]/convert
 * Ручное преобразование Chat_Session в Support_Session
 * Требует аутентификации через NextAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
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
 * POST /api/support/sessions/[id]/convert
 * Преобразует Chat_Session в Support_Session
 * 
 * Path параметры:
 * - id: ID сессии (обязательный)
 * 
 * Validates: Requirements 1.5, 4.3
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Проверка аутентификации (Requirements 8.1, 8.5)
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Извлечение и валидация ID сессии (await для Promise params в Next.js 15+)
    const resolvedParams = await params;
    const sessionId = parseInt(resolvedParams.id, 10);

    if (isNaN(sessionId) || sessionId < 1) {
      return NextResponse.json(
        { error: 'Invalid session_id', message: 'ID сессии должен быть положительным числом' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Проверяем существование сессии (Requirements 1.5)
    const supportSession = await db.getSession(sessionId);
    
    if (!supportSession) {
      return NextResponse.json(
        { error: 'Session not found', message: 'Сессия не найдена' },
        { status: 404 }
      );
    }

    // Проверяем, что сессия ещё не является Support_Session
    if (supportSession.session_type === 'support') {
      return NextResponse.json(
        { 
          error: 'Already support session',
          message: 'Сессия уже является сессией поддержки',
          session: supportSession,
        },
        { status: 400 }
      );
    }

    // Преобразуем Chat_Session в Support_Session (Requirements 4.3)
    const updated = await db.updateSessionType(sessionId, 'support');

    if (!updated) {
      return NextResponse.json(
        { 
          error: 'Update failed',
          message: 'Не удалось обновить тип сессии'
        },
        { status: 500 }
      );
    }

    // Логирование действия администратора (Requirements 8.3)
    console.log('Session manually converted', {
      session_id: sessionId,
      from: 'chat',
      to: 'support',
      admin_id: session.user?.email || 'unknown',
      timestamp: new Date().toISOString(),
    });

    // Получаем обновлённую сессию
    const updatedSession = await db.getSession(sessionId);

    return NextResponse.json(
      {
        success: true,
        message: 'Сессия успешно преобразована в сессию поддержки',
        session: updatedSession,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('POST /api/support/sessions/[id]/convert error:', error);
    
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
        message: 'Не удалось преобразовать сессию. Попробуйте позже.'
      },
      { status: 500 }
    );
  }
}
