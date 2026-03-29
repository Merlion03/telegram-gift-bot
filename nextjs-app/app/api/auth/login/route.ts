/**
 * API Route: Вход администратора
 * POST /api/auth/login
 * 
 * Аутентифицирует администратора с проверкой rate limit
 * и генерирует JWT токен при успехе
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminRepository } from '@/lib/repositories/adminRepository';
import { createAuthAttemptsRepository } from '@/lib/repositories/authAttemptsRepository';
import { createPasswordHasher } from '@/lib/services/passwordHasher';
import { createJWTSessionService } from '@/lib/services/jwtSessionService';
import { createRateLimitService } from '@/lib/services/rateLimitService';
import { createAdminAuthService } from '@/lib/services/adminAuthService';

/**
 * Интерфейс запроса
 */
interface LoginRequest {
  tgId: number;
  password: string;
}

/**
 * Интерфейс успешного ответа
 */
interface LoginResponse {
  token: string;
  role: number;
  expiresAt: string;
}

/**
 * Интерфейс ответа с ошибкой
 */
interface LoginErrorResponse {
  error: string;
  remainingAttempts?: number;
}

/**
 * POST handler для входа
 */
export async function POST(request: NextRequest) {
  try {
    // Парсим body
    const body: LoginRequest = await request.json();

    // Валидация входных данных
    if (!body.tgId || typeof body.tgId !== 'number') {
      return NextResponse.json(
        { error: 'Параметр tgId обязателен и должен быть числом' },
        { status: 400 }
      );
    }

    if (!body.password || typeof body.password !== 'string') {
      return NextResponse.json(
        { error: 'Параметр password обязателен' },
        { status: 400 }
      );
    }

    // Создаём зависимости
    const adminRepo = createAdminRepository();
    const attemptsRepo = createAuthAttemptsRepository();
    const passwordHasher = createPasswordHasher();
    const jwtService = createJWTSessionService();
    const rateLimiter = createRateLimitService(attemptsRepo);
    
    const authService = createAdminAuthService(
      adminRepo,
      rateLimiter,
      passwordHasher,
      jwtService
    );

    // Аутентифицируем
    const result = await authService.authenticate(body.tgId, body.password);

    if (!result.success) {
      // Проверяем, заблокирован ли пользователь (rate limit)
      if (result.error?.includes('Слишком много попыток')) {
        const errorResponse: LoginErrorResponse = {
          error: result.error,
          remainingAttempts: result.remainingAttempts,
        };

        return NextResponse.json(errorResponse, { status: 429 });
      }

      // Неправильные учётные данные
      const errorResponse: LoginErrorResponse = {
        error: result.error || 'Некорректные учётные данные',
        remainingAttempts: result.remainingAttempts,
      };

      return NextResponse.json(errorResponse, { status: 401 });
    }

    // Формируем успешный ответ
    const response: LoginResponse = {
      token: result.token!,
      role: result.role!,
      expiresAt: result.expiresAt!,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error in login API:', error);
    
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
