/**
 * API Route: Валидация JWT токена
 * POST /api/auth/validate
 * 
 * Проверяет валидность JWT токена и возвращает claims
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJWTSessionService } from '@/lib/services/jwtSessionService';

/**
 * Интерфейс запроса
 */
interface ValidateTokenRequest {
  token: string;
}

/**
 * Интерфейс успешного ответа
 */
interface ValidateTokenResponse {
  valid: boolean;
  tgId?: number;
  role?: number;
  expiresAt?: string;
}

/**
 * POST handler для валидации токена
 */
export async function POST(request: NextRequest) {
  try {
    // Парсим body
    const body: ValidateTokenRequest = await request.json();

    // Валидация входных данных
    if (!body.token || typeof body.token !== 'string') {
      return NextResponse.json(
        { error: 'Параметр token обязателен' },
        { status: 400 }
      );
    }

    // Создаём JWT сервис
    const jwtService = createJWTSessionService();

    // Валидируем токен
    const claims = await jwtService.validateToken(body.token);

    // Если токен невалиден
    if (!claims) {
      const response: ValidateTokenResponse = {
        valid: false,
      };

      return NextResponse.json(response, { status: 401 });
    }

    // Формируем успешный ответ
    const response: ValidateTokenResponse = {
      valid: true,
      tgId: claims.tgId,
      role: claims.role,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error in validate API:', error);
    
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
