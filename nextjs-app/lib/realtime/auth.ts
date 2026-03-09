/**
 * Модуль аутентификации для WebSocket подключений
 * Проверяет session token через NextAuth и роль администратора
 */

import { getToken } from 'next-auth/jwt';
import { decode } from 'next-auth/jwt';
import type { IncomingMessage } from 'http';
import type { JWT } from 'next-auth/jwt';

/**
 * Результат аутентификации клиента
 */
export interface AuthResult {
  /** Успешность аутентификации */
  success: boolean;
  
  /** ID пользователя (если аутентификация успешна) */
  userId?: number;
  
  /** Имя пользователя */
  userName?: string;
  
  /** Флаг администратора */
  isAdmin: boolean;
  
  /** Код ошибки (если аутентификация неудачна) */
  errorCode?: number;
  
  /** Сообщение об ошибке */
  errorMessage?: string;
}

/**
 * Аутентификация WebSocket клиента через NextAuth
 * Validates: Requirements 2.2, 8.1, 8.2, 8.3, 8.4
 * 
 * @param request - HTTP запрос с WebSocket upgrade
 * @returns Результат аутентификации
 */
export async function authenticateWebSocketClient(
  request: IncomingMessage
): Promise<AuthResult> {
  const authId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  try {
    console.log(`[WebSocket Auth][${authId}] ========== НАЧАЛО АУТЕНТИФИКАЦИИ ==========`);
    console.log(`[WebSocket Auth][${authId}] URL: ${(request as any).url || 'undefined'}`);
    console.log(`[WebSocket Auth][${authId}] Headers:`, {
      cookie: request.headers.cookie ? `присутствует (${request.headers.cookie.length} символов)` : 'отсутствует',
      origin: request.headers.origin,
      'user-agent': request.headers['user-agent']
    });
    
    // Извлекаем токен из query параметра
    const url = (request as any).url || '';
    let tokenString: string | null = null;
    let tokenSource: 'query' | 'cookie' | null = null;
    
    if (url.includes('?token=')) {
      console.log(`[WebSocket Auth][${authId}] 🔍 Ищем токен в query параметрах...`);
      const urlObj = new URL(url, 'http://localhost');
      tokenString = urlObj.searchParams.get('token');
      if (tokenString) {
        tokenSource = 'query';
        console.log(`[WebSocket Auth][${authId}] ✓ Токен найден в query параметрах, длина: ${tokenString.length}`);
      }
    }
    
    // Если токен не найден в query, пытаемся получить из cookies
    if (!tokenString) {
      console.log(`[WebSocket Auth][${authId}] 🔍 Ищем токен в cookies...`);
      const cookieName = process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token' 
        : 'next-auth.session-token';
      
      console.log(`[WebSocket Auth][${authId}] Cookie name: ${cookieName}, NODE_ENV: ${process.env.NODE_ENV}`);
      
      const cookies = request.headers.cookie || '';
      const match = cookies.match(new RegExp(`${cookieName}=([^;]+)`));
      tokenString = match ? match[1] : null;
      
      if (tokenString) {
        tokenSource = 'cookie';
        console.log(`[WebSocket Auth][${authId}] ✓ Токен найден в cookies, длина: ${tokenString.length}`);
      } else {
        console.log(`[WebSocket Auth][${authId}] ❌ Токен не найден в cookies`);
      }
    }
    
    // Если токен не найден ни в query, ни в cookies
    if (!tokenString) {
      const duration = Date.now() - startTime;
      console.log(`[WebSocket Auth][${authId}] ❌ Токен не найден ни в query, ни в cookies (${duration}ms)`);
      return {
        success: false,
        isAdmin: false,
        errorCode: 401,
        errorMessage: 'Authentication required: session token missing',
      };
    }
    
    console.log(`[WebSocket Auth][${authId}] 🔐 Расшифровка токена из источника: ${tokenSource}...`);
    const decodeStartTime = Date.now();
    
    // Расшифровываем токен вручную используя decode из next-auth/jwt
    const token = await decode({
      token: tokenString,
      secret: process.env.NEXTAUTH_SECRET!,
    });

    const decodeDuration = Date.now() - decodeStartTime;
    console.log(`[WebSocket Auth][${authId}] 🔐 Результат расшифровки: ${token ? 'успешно' : 'токен null'} (${decodeDuration}ms)`);
    
    // Проверка наличия токена
    if (!token) {
      const duration = Date.now() - startTime;
      console.log(`[WebSocket Auth][${authId}] ❌ Токен не удалось расшифровать (null) (${duration}ms)`);
      return {
        success: false,
        isAdmin: false,
        errorCode: 401,
        errorMessage: 'Authentication required: invalid or expired session token',
      };
    }

    // Проверяем наличие и тип поля exp
    const tokenExp = typeof token.exp === 'number' ? token.exp : null;
    const now = Math.floor(Date.now() / 1000);
    
    console.log(`[WebSocket Auth][${authId}] 🔍 Токен содержит:`, {
      hasId: !!token.id,
      hasName: !!token.name,
      hasExp: !!tokenExp,
      exp: tokenExp,
      now: now,
      expired: tokenExp ? tokenExp < now : 'no exp field'
    });

    // Проверка истечения токена
    if (tokenExp && tokenExp < now) {
      const duration = Date.now() - startTime;
      console.log(`[WebSocket Auth][${authId}] ❌ Токен истёк (${duration}ms)`);
      return {
        success: false,
        isAdmin: false,
        errorCode: 401,
        errorMessage: 'Session token expired',
      };
    }

    // Проверка валидности токена (наличие обязательных полей)
    if (!token.id || !token.name) {
      const duration = Date.now() - startTime;
      console.log(`[WebSocket Auth][${authId}] ❌ Токен не содержит обязательных полей (id или name) (${duration}ms)`);
      return {
        success: false,
        isAdmin: false,
        errorCode: 401,
        errorMessage: 'Invalid session token',
      };
    }

    console.log(`[WebSocket Auth][${authId}] ✓ Токен валиден`);

    // В текущей реализации все аутентифицированные пользователи - администраторы
    // В будущем здесь можно добавить проверку роли из БД
    const isAdmin = true;

    // Проверка роли администратора
    if (!isAdmin) {
      const duration = Date.now() - startTime;
      console.log(`[WebSocket Auth][${authId}] ❌ Пользователь не является администратором (${duration}ms)`);
      return {
        success: false,
        isAdmin: false,
        errorCode: 403,
        errorMessage: 'Admin access required',
      };
    }

    const duration = Date.now() - startTime;
    console.log(`[WebSocket Auth][${authId}] ✅ Аутентификация успешна (${duration}ms):`, {
      userId: token.id,
      userName: token.name,
      isAdmin: true
    });
    console.log(`[WebSocket Auth][${authId}] ========== АУТЕНТИФИКАЦИЯ ЗАВЕРШЕНА ==========`);

    // Успешная аутентификация
    return {
      success: true,
      userId: parseInt(token.id as string, 10),
      userName: token.name as string,
      isAdmin: true,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[WebSocket Auth][${authId}] ❌ Ошибка аутентификации (${duration}ms):`, error);
    console.error(`[WebSocket Auth][${authId}] Stack trace:`, error instanceof Error ? error.stack : 'no stack');
    console.error(`[WebSocket Auth][${authId}] Error type:`, error instanceof Error ? error.constructor.name : typeof error);
    return {
      success: false,
      isAdmin: false,
      errorCode: 500,
      errorMessage: 'Internal authentication error',
    };
  }
}

/**
 * Извлечение session token из query параметров (fallback)
 * Используется если токен не найден в cookies
 * 
 * @param request - HTTP запрос
 * @returns Session token или null
 */
export function extractTokenFromQuery(request: IncomingMessage): string | null {
  if (!request.url) return null;

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}
