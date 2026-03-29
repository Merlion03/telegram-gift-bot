/**
 * API endpoint для проверки валидности JWT токена
 * 
 * GET /api/admin/check-auth
 * 
 * Проверяет наличие и валидность JWT токена в cookie.
 * Возвращает 200 OK если токен валиден, 401 Unauthorized если нет.
 */

import { NextRequest, NextResponse } from 'next/server';
import { JWTSessionService } from '@/lib/services/jwtSessionService';

export async function GET(request: NextRequest) {
  try {
    // Извлекаем JWT токен из cookie
    const token = request.cookies.get('admin-token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'Токен отсутствует' },
        { status: 401 }
      );
    }
    
    // Валидируем токен
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return NextResponse.json(
        { error: 'Ошибка конфигурации сервера' },
        { status: 500 }
      );
    }
    
    const jwtService = new JWTSessionService({
      secretKey: jwtSecret,
    });
    
    const claims = await jwtService.validateToken(token);
    
    if (!claims) {
      return NextResponse.json(
        { error: 'Токен невалиден или истёк' },
        { status: 401 }
      );
    }
    
    // Токен валиден
    return NextResponse.json({
      authenticated: true,
      tgId: claims.tgId,
      role: claims.role,
    });
  } catch (error) {
    console.error('Error checking auth:', error);
    return NextResponse.json(
      { error: 'Ошибка проверки аутентификации' },
      { status: 500 }
    );
  }
}
