/**
 * API Route: Проверка первого входа администратора
 * GET /api/auth/check-first-login?tgId={tg_id}
 * 
 * Проверяет, является ли вход первым для администратора
 * (password_hash IS NULL в таблице administrators)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminRepository } from '@/lib/repositories/adminRepository';

/**
 * Интерфейс ответа
 */
interface CheckFirstLoginResponse {
  /** Первый ли это вход (password_hash IS NULL) */
  isFirstLogin: boolean;
  
  /** Существует ли администратор в БД */
  exists: boolean;
}

/**
 * GET handler для проверки первого входа
 */
export async function GET(request: NextRequest) {
  try {
    // Извлекаем tgId из query параметров
    const searchParams = request.nextUrl.searchParams;
    const tgIdParam = searchParams.get('tgId');

    // Валидация tgId
    if (!tgIdParam) {
      return NextResponse.json(
        { error: 'Параметр tgId обязателен' },
        { status: 400 }
      );
    }

    const tgId = parseInt(tgIdParam, 10);

    if (isNaN(tgId) || tgId < 1) {
      return NextResponse.json(
        { error: 'Некорректный параметр tgId' },
        { status: 400 }
      );
    }

    // Создаём репозиторий
    const adminRepo = createAdminRepository();

    // Получаем администратора из БД
    const admin = await adminRepo.getByTgId(tgId);

    // Если администратор не найден
    if (!admin) {
      const response: CheckFirstLoginResponse = {
        isFirstLogin: false,
        exists: false,
      };

      return NextResponse.json(response, { status: 200 });
    }

    // Проверяем, первый ли это вход
    const isFirstLogin = admin.passwordHash === null;

    const response: CheckFirstLoginResponse = {
      isFirstLogin,
      exists: true,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error in check-first-login API:', error);
    
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
