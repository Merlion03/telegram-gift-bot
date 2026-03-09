/**
 * Модуль аутентификации для WebSocket соединений
 * Отвечает за валидацию токенов и проверку прав доступа к каналам
 * 
 * Validates: Requirements 2.3, 2.7, 9.2
 */

import { decode } from 'next-auth/jwt';
import type { IncomingMessage } from 'http';
import { ERROR_CODES, CUSTOM_CLOSE_CODES } from '../constants';

/**
 * Результат валидации токена
 */
export interface TokenValidationResult {
  /** Успешность валидации */
  valid: boolean;
  
  /** ID пользователя (если валидация успешна) */
  userId?: number;
  
  /** Имя пользователя */
  userName?: string;
  
  /** Флаг администратора */
  isAdmin?: boolean;
  
  /** Код ошибки */
  errorCode?: string;
  
  /** Сообщение об ошибке */
  errorMessage?: string;
  
  /** Код закрытия WebSocket */
  closeCode?: number;
}

/**
 * Результат аутентификации init сообщения
 */
export interface InitAuthResult {
  /** Успешность аутентификации */
  success: boolean;
  
  /** ID пользователя */
  userId?: number;
  
  /** Имя пользователя */
  userName?: string;
  
  /** Флаг администратора */
  isAdmin?: boolean;
  
  /** Код ошибки */
  errorCode?: string;
  
  /** Сообщение об ошибке */
  errorMessage?: string;
}

/**
 * Результат проверки прав доступа к каналу
 */
export interface SubscriptionAuthResult {
  /** Разрешена ли подписка */
  allowed: boolean;
  
  /** Код ошибки (если не разрешена) */
  errorCode?: string;
  
  /** Сообщение об ошибке */
  errorMessage?: string;
}

/**
 * Класс для аутентификации WebSocket соединений
 * Validates: Requirements 2.3, 2.7, 9.2
 */
export class AuthenticationHandler {
  private readonly secret: string;
  
  /**
   * Создаёт экземпляр AuthenticationHandler
   * @param secret - Секретный ключ для расшифровки JWT токенов
   */
  constructor(secret: string) {
    this.secret = secret;
  }
  
  /**
   * Валидация JWT токена из URL
   * Validates: Requirements 2.3
   * 
   * @param request - HTTP запрос с WebSocket upgrade
   * @returns Результат валидации токена
   */
  async validateToken(request: IncomingMessage): Promise<TokenValidationResult> {
    const authId = this.generateAuthId();
    const startTime = Date.now();
    
    try {
      this.logAuthStart(authId, request);
      
      // Извлекаем токен из query параметра или cookies
      const tokenString = this.extractToken(request, authId);
      
      if (!tokenString) {
        const duration = Date.now() - startTime;
        this.logAuthFailure(authId, 'Токен не найден', duration);
        
        return {
          valid: false,
          errorCode: ERROR_CODES.INVALID_TOKEN,
          errorMessage: 'Authentication required: session token missing',
          closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
        };
      }
      
      // Расшифровываем токен
      const token = await this.decodeToken(tokenString, authId);
      
      if (!token) {
        const duration = Date.now() - startTime;
        this.logAuthFailure(authId, 'Токен не удалось расшифровать', duration);
        
        return {
          valid: false,
          errorCode: ERROR_CODES.INVALID_TOKEN,
          errorMessage: 'Invalid or expired session token',
          closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
        };
      }
      
      // Проверяем истечение токена
      const expResult = this.checkTokenExpiration(token, authId);
      if (!expResult.valid) {
        const duration = Date.now() - startTime;
        this.logAuthFailure(authId, 'Токен истёк', duration);
        
        return {
          valid: false,
          errorCode: ERROR_CODES.TOKEN_EXPIRED,
          errorMessage: 'Session token expired',
          closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
        };
      }
      
      // Проверяем обязательные поля
      if (!token.id || !token.name) {
        const duration = Date.now() - startTime;
        this.logAuthFailure(authId, 'Токен не содержит обязательных полей', duration);
        
        return {
          valid: false,
          errorCode: ERROR_CODES.INVALID_TOKEN,
          errorMessage: 'Invalid session token: missing required fields',
          closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
        };
      }
      
      // В текущей реализации все аутентифицированные пользователи - администраторы
      const isAdmin = true;
      
      const duration = Date.now() - startTime;
      this.logAuthSuccess(authId, token.id as string, token.name as string, duration);
      
      return {
        valid: true,
        userId: parseInt(token.id as string, 10),
        userName: token.name as string,
        isAdmin,
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logAuthError(authId, error, duration);
      
      return {
        valid: false,
        errorCode: ERROR_CODES.INTERNAL_ERROR,
        errorMessage: 'Internal authentication error',
        closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
      };
    }
  }
  
  /**
   * Аутентификация init сообщения
   * Validates: Requirements 2.3, 2.7
   * 
   * @param clientId - ID клиента
   * @param request - HTTP запрос с WebSocket upgrade
   * @returns Результат аутентификации
   */
  async authenticateInit(clientId: string, request: IncomingMessage): Promise<InitAuthResult> {
    console.log(`[AuthHandler][${clientId}] Аутентификация init сообщения...`);
    
    const validationResult = await this.validateToken(request);
    
    if (!validationResult.valid) {
      console.log(`[AuthHandler][${clientId}] ❌ Аутентификация не пройдена:`, {
        errorCode: validationResult.errorCode,
        errorMessage: validationResult.errorMessage,
      });
      
      return {
        success: false,
        errorCode: validationResult.errorCode,
        errorMessage: validationResult.errorMessage,
      };
    }
    
    console.log(`[AuthHandler][${clientId}] ✅ Аутентификация успешна:`, {
      userId: validationResult.userId,
      userName: validationResult.userName,
      isAdmin: validationResult.isAdmin,
    });
    
    return {
      success: true,
      userId: validationResult.userId,
      userName: validationResult.userName,
      isAdmin: validationResult.isAdmin,
    };
  }
  
  /**
   * Проверка прав доступа к каналу подписки
   * Validates: Requirements 9.2
   * 
   * @param userId - ID пользователя
   * @param channel - Тип канала (session, all, status)
   * @param sessionId - ID сессии (для канала session)
   * @returns Результат проверки прав доступа
   */
  async canSubscribe(
    userId: number,
    channel: string,
    sessionId?: number
  ): Promise<SubscriptionAuthResult> {
    console.log(`[AuthHandler] Проверка прав доступа:`, {
      userId,
      channel,
      sessionId,
    });
    
    // Для канала session проверяем, что sessionId указан
    if (channel === 'session' && !sessionId) {
      console.log(`[AuthHandler] ❌ Отказано: sessionId не указан для канала session`);
      
      return {
        allowed: false,
        errorCode: ERROR_CODES.INVALID_MESSAGE,
        errorMessage: 'sessionId is required for session channel',
      };
    }
    
    // В текущей реализации все аутентифицированные администраторы имеют доступ ко всем каналам
    // В будущем здесь можно добавить проверку прав доступа к конкретной сессии из БД
    
    console.log(`[AuthHandler] ✅ Доступ разрешён`);
    
    return {
      allowed: true,
    };
  }
  
  // ============================================================================
  // Приватные методы
  // ============================================================================
  
  /**
   * Генерация уникального ID для логирования аутентификации
   */
  private generateAuthId(): string {
    return Math.random().toString(36).substring(7);
  }
  
  /**
   * Извлечение токена из query параметров или cookies
   */
  private extractToken(request: IncomingMessage, authId: string): string | null {
    const url = (request as any).url || '';
    let tokenString: string | null = null;
    let tokenSource: 'query' | 'cookie' | null = null;
    
    // Пытаемся извлечь из query параметров
    if (url.includes('?token=')) {
      console.log(`[AuthHandler][${authId}] 🔍 Ищем токен в query параметрах...`);
      const urlObj = new URL(url, 'http://localhost');
      tokenString = urlObj.searchParams.get('token');
      
      if (tokenString) {
        tokenSource = 'query';
        console.log(`[AuthHandler][${authId}] ✓ Токен найден в query, длина: ${tokenString.length}`);
      }
    }
    
    // Если не найден в query, пытаемся извлечь из cookies
    if (!tokenString) {
      console.log(`[AuthHandler][${authId}] 🔍 Ищем токен в cookies...`);
      const cookieName = process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token';
      
      const cookies = request.headers.cookie || '';
      const match = cookies.match(new RegExp(`${cookieName}=([^;]+)`));
      tokenString = match ? match[1] : null;
      
      if (tokenString) {
        tokenSource = 'cookie';
        console.log(`[AuthHandler][${authId}] ✓ Токен найден в cookies, длина: ${tokenString.length}`);
      } else {
        console.log(`[AuthHandler][${authId}] ❌ Токен не найден в cookies`);
      }
    }
    
    return tokenString;
  }
  
  /**
   * Расшифровка JWT токена
   */
  private async decodeToken(tokenString: string, authId: string): Promise<any> {
    console.log(`[AuthHandler][${authId}] 🔐 Расшифровка токена...`);
    const decodeStartTime = Date.now();
    
    const token = await decode({
      token: tokenString,
      secret: this.secret,
    });
    
    const decodeDuration = Date.now() - decodeStartTime;
    console.log(`[AuthHandler][${authId}] 🔐 Результат: ${token ? 'успешно' : 'null'} (${decodeDuration}ms)`);
    
    return token;
  }
  
  /**
   * Проверка истечения токена
   */
  private checkTokenExpiration(token: any, authId: string): { valid: boolean } {
    const tokenExp = typeof token.exp === 'number' ? token.exp : null;
    const now = Math.floor(Date.now() / 1000);
    
    console.log(`[AuthHandler][${authId}] 🔍 Проверка истечения:`, {
      hasExp: !!tokenExp,
      exp: tokenExp,
      now: now,
      expired: tokenExp ? tokenExp < now : 'no exp field',
    });
    
    if (tokenExp && tokenExp < now) {
      return { valid: false };
    }
    
    return { valid: true };
  }
  
  /**
   * Логирование начала аутентификации
   */
  private logAuthStart(authId: string, request: IncomingMessage): void {
    console.log(`[AuthHandler][${authId}] ========== НАЧАЛО АУТЕНТИФИКАЦИИ ==========`);
    console.log(`[AuthHandler][${authId}] URL: ${(request as any).url || 'undefined'}`);
    console.log(`[AuthHandler][${authId}] Headers:`, {
      cookie: request.headers.cookie ? `присутствует (${request.headers.cookie.length} символов)` : 'отсутствует',
      origin: request.headers.origin,
      'user-agent': request.headers['user-agent'],
    });
  }
  
  /**
   * Логирование успешной аутентификации
   */
  private logAuthSuccess(authId: string, userId: string, userName: string, duration: number): void {
    console.log(`[AuthHandler][${authId}] ✅ Аутентификация успешна (${duration}ms):`, {
      userId,
      userName,
      isAdmin: true,
    });
    console.log(`[AuthHandler][${authId}] ========== АУТЕНТИФИКАЦИЯ ЗАВЕРШЕНА ==========`);
  }
  
  /**
   * Логирование неудачной аутентификации
   */
  private logAuthFailure(authId: string, reason: string, duration: number): void {
    console.log(`[AuthHandler][${authId}] ❌ ${reason} (${duration}ms)`);
  }
  
  /**
   * Логирование ошибки аутентификации
   */
  private logAuthError(authId: string, error: unknown, duration: number): void {
    console.error(`[AuthHandler][${authId}] ❌ Ошибка аутентификации (${duration}ms):`, error);
    console.error(`[AuthHandler][${authId}] Stack:`, error instanceof Error ? error.stack : 'no stack');
  }
}
