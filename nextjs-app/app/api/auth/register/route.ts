/**
 * API Route: Регистрация пароля для нового администратора
 * POST /api/auth/register
 * 
 * Устанавливает пароль для администратора при первом входе
 * и генерирует JWT токен
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
interface RegisterRequest {
  tgId: number;
  password: string;
}

/**
 * Интерфейс ответа
 */
interface RegisterResponse {
  token: string;
  role: number;
  expiresAt: string;
}

/**
 * POST handler для регистрации пароля
 */
export async function POST(request: NextRequest) {
  try {
    // Парсим body
    const body: RegisterRequest = await request.json();

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

    if (body.password.trim().length < 8) {
      return NextResponse.json(
        { error: 'Пароль должен содержать минимум 8 символов' },
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

    // Регистрируем пароль
    const result = await authService.registerPassword(body.tgId, body.password);

    if (!result.success) {
      // Определяем статус код по типу ошибки
      let statusCode = 400;
      
      if (result.error?.includes('Доступ запрещён')) {
        statusCode = 403;
      } else if (result.error?.includes('уже установлен')) {
        statusCode = 403;
      }

      return NextResponse.json(
        { error: result.error },
        { status: statusCode }
      );
    }

    // Формируем успешный ответ
    const response: RegisterResponse = {
      token: result.token!,
      role: result.role!,
      expiresAt: result.expiresAt!,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error in register API:', error);
    
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
