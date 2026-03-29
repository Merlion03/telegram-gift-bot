/**
 * API Route: GET /api/support/sessions
 * Получение списка сессий поддержки с пагинацией
 * Требует аутентификации через NextAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminRequestAuth } from '@/lib/auth/adminRequestAuth';
import { getDb } from '@/lib/database/client';
import type { GetSessionsParams } from '@/types/support';

/**
 * GET /api/support/sessions
 * Получает список сессий поддержки с фильтрацией и пагинацией
 * 
 * Query параметры:
 * - status: 'active' | 'closed' (опционально)
 * - session_type: 'chat' | 'support' (опционально)
 * - page: номер страницы (по умолчанию 1)
 * - limit: количество сессий на странице (по умолчанию 50, максимум 100)
 * 
 * Validates: Requirements 3.1, 3.2, 5.3, 7.1, 8.1, 8.5
 */
export async function GET(request: NextRequest) {
  try {
    // Проверка аутентификации (Requirements 8.1, 8.5)
    const adminAuth = await resolveAdminRequestAuth(request);

    if (!adminAuth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Извлечение параметров запроса
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const session_type = searchParams.get('session_type') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Валидация параметров
    if (status && !['active', 'closed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status', message: 'Статус должен быть "active" или "closed"' },
        { status: 400 }
      );
    }

    if (session_type && !['chat', 'support'].includes(session_type)) {
      return NextResponse.json(
        { error: 'Invalid session_type', message: 'Тип сессии должен быть "chat" или "support"' },
        { status: 400 }
      );
    }

    if (page < 1) {
      return NextResponse.json(
        { error: 'Invalid page', message: 'Номер страницы должен быть >= 1' },
        { status: 400 }
      );
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit', message: 'Лимит должен быть от 1 до 100' },
        { status: 400 }
      );
    }

    // Получение сессий из БД
    const db = getDb();
    const params: GetSessionsParams = {
      status: status as 'active' | 'closed' | undefined,
      session_type: session_type as 'chat' | 'support' | undefined,
      page,
      limit,
    };

    const result = await db.getSessions(params);

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error('GET /api/support/sessions error:', error);
    
    // Логирование с контекстом для отладки
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
        message: 'Не удалось получить список сессий. Попробуйте позже.'
      },
      { status: 500 }
    );
  }
}

