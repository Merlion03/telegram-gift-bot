/**
 * Модуль аутентификации для WebSocket соединений.
 * Поддерживает оба формата токенов:
 * - admin-token (кастомный JWT с tgId/role)
 * - legacy NextAuth token
 */

import { decode } from 'next-auth/jwt';
import type { IncomingMessage } from 'http';
import { ERROR_CODES, CUSTOM_CLOSE_CODES } from '../constants';
import { JWTSessionService } from '../../services/jwtSessionService';

export interface TokenValidationResult {
  valid: boolean;
  userId?: number;
  userName?: string;
  isAdmin?: boolean;
  errorCode?: string;
  errorMessage?: string;
  closeCode?: number;
}

export interface InitAuthResult {
  success: boolean;
  userId?: number;
  userName?: string;
  isAdmin?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface SubscriptionAuthResult {
  allowed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export class AuthenticationHandler {
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  async validateToken(request: IncomingMessage): Promise<TokenValidationResult> {
    const authId = this.generateAuthId();
    const startTime = Date.now();

    try {
      this.logAuthStart(authId, request);

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

      const looksLikeAdminJwt = tokenString.split('.').length === 3;

      // 1) Сначала пробуем admin-token (основной путь текущей админки)
      if (looksLikeAdminJwt) {
        const adminClaims = await this.validateAdminJwtToken(tokenString, authId);
        if (adminClaims) {
          const duration = Date.now() - startTime;
          const userId = adminClaims.tgId;
          const userName = `admin_${userId}`;

          this.logAuthSuccess(authId, String(userId), userName, duration);

          return {
            valid: true,
            userId,
            userName,
            isAdmin: true,
          };
        }
      }

      // 2) Legacy fallback: NextAuth token
      const token = await this.decodeNextAuthToken(tokenString, authId, looksLikeAdminJwt);

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

      const userId = Number.parseInt(String(token.id), 10);
      if (!Number.isFinite(userId) || userId <= 0) {
        const duration = Date.now() - startTime;
        this.logAuthFailure(authId, 'Некорректный user id в токене', duration);

        return {
          valid: false,
          errorCode: ERROR_CODES.INVALID_TOKEN,
          errorMessage: 'Invalid session token: user id is invalid',
          closeCode: CUSTOM_CLOSE_CODES.UNAUTHORIZED,
        };
      }

      const userName = String(token.name);
      const duration = Date.now() - startTime;
      this.logAuthSuccess(authId, String(userId), userName, duration);

      return {
        valid: true,
        userId,
        userName,
        isAdmin: true,
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

  async authenticateInit(clientId: string, request: IncomingMessage): Promise<InitAuthResult> {
    console.log(`[AuthHandler][${clientId}] Аутентификация init сообщения...`);

    const validationResult = await this.validateToken(request);

    if (!validationResult.valid) {
      console.log(`[AuthHandler][${clientId}] ? Аутентификация не пройдена:`, {
        errorCode: validationResult.errorCode,
        errorMessage: validationResult.errorMessage,
      });

      return {
        success: false,
        errorCode: validationResult.errorCode,
        errorMessage: validationResult.errorMessage,
      };
    }

    console.log(`[AuthHandler][${clientId}] ? Аутентификация успешна:`, {
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

  async canSubscribe(userId: number, channel: string, sessionId?: number): Promise<SubscriptionAuthResult> {
    console.log('[AuthHandler] Проверка прав доступа:', {
      userId,
      channel,
      sessionId,
    });

    if (channel === 'session' && !sessionId) {
      console.log('[AuthHandler] ? Отказано: sessionId не указан для канала session');

      return {
        allowed: false,
        errorCode: ERROR_CODES.INVALID_MESSAGE,
        errorMessage: 'sessionId is required for session channel',
      };
    }

    return { allowed: true };
  }

  private generateAuthId(): string {
    return Math.random().toString(36).substring(7);
  }

  private extractToken(request: IncomingMessage, authId: string): string | null {
    const url = (request as any).url || '';

    if (url.includes('?token=')) {
      console.log(`[AuthHandler][${authId}] Ищем токен в query параметрах...`);
      const urlObj = new URL(url, 'http://localhost');
      const queryToken = urlObj.searchParams.get('token');
      if (queryToken) {
        console.log(`[AuthHandler][${authId}] Токен найден в query, длина: ${queryToken.length}`);
        return queryToken;
      }
    }

    const cookies = request.headers.cookie || '';
    const cookieNames = process.env.NODE_ENV === 'production'
      ? ['admin-token', '__Secure-next-auth.session-token', 'next-auth.session-token']
      : ['admin-token', 'next-auth.session-token', '__Secure-next-auth.session-token'];

    for (const cookieName of cookieNames) {
      const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = cookies.match(new RegExp(`${escapedName}=([^;]+)`));
      if (match?.[1]) {
        console.log(`[AuthHandler][${authId}] Токен найден в cookie ${cookieName}, длина: ${match[1].length}`);
        return match[1];
      }
    }

    console.log(`[AuthHandler][${authId}] Токен не найден в query и cookies`);
    return null;
  }

  private async decodeNextAuthToken(tokenString: string, authId: string, suppressError: boolean): Promise<any | null> {
    console.log(`[AuthHandler][${authId}] Расшифровка NextAuth токена...`);
    const decodeStartTime = Date.now();

    try {
      const token = await decode({
        token: tokenString,
        secret: this.secret,
      });

      const decodeDuration = Date.now() - decodeStartTime;
      console.log(`[AuthHandler][${authId}] NextAuth decode: ${token ? 'success' : 'null'} (${decodeDuration}ms)`);
      return token;
    } catch (error) {
      const decodeDuration = Date.now() - decodeStartTime;
      console.log(`[AuthHandler][${authId}] NextAuth decode failed (${decodeDuration}ms):`, error);

      if (suppressError) {
        return null;
      }

      throw error;
    }
  }

  private async validateAdminJwtToken(
    tokenString: string,
    authId: string
  ): Promise<{ tgId: number; role: number } | null> {
    const secretCandidates = [process.env.JWT_SECRET, this.secret]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .filter((value, index, array) => array.indexOf(value) === index);

    for (const secret of secretCandidates) {
      try {
        const jwtService = new JWTSessionService({ secretKey: secret });
        const claims = await jwtService.validateToken(tokenString);

        if (claims) {
          console.log(`[AuthHandler][${authId}] admin-token validated for tgId=${claims.tgId}`);
          return {
            tgId: claims.tgId,
            role: claims.role,
          };
        }
      } catch {
        // Пробуем следующий кандидат секрета.
      }
    }

    return null;
  }

  private checkTokenExpiration(token: any, authId: string): { valid: boolean } {
    const tokenExp = typeof token.exp === 'number' ? token.exp : null;
    const now = Math.floor(Date.now() / 1000);

    console.log(`[AuthHandler][${authId}] Проверка истечения:`, {
      hasExp: !!tokenExp,
      exp: tokenExp,
      now,
      expired: tokenExp ? tokenExp < now : 'no exp field',
    });

    if (tokenExp && tokenExp < now) {
      return { valid: false };
    }

    return { valid: true };
  }

  private logAuthStart(authId: string, request: IncomingMessage): void {
    console.log(`[AuthHandler][${authId}] Начало аутентификации`);
    console.log(`[AuthHandler][${authId}] URL: ${(request as any).url || 'undefined'}`);
  }

  private logAuthSuccess(authId: string, userId: string, userName: string, duration: number): void {
    console.log(`[AuthHandler][${authId}] ? Аутентификация успешна (${duration}ms):`, {
      userId,
      userName,
      isAdmin: true,
    });
  }

  private logAuthFailure(authId: string, reason: string, duration: number): void {
    console.log(`[AuthHandler][${authId}] ? ${reason} (${duration}ms)`);
  }

  private logAuthError(authId: string, error: unknown, duration: number): void {
    console.error(`[AuthHandler][${authId}] ? Ошибка аутентификации (${duration}ms):`, error);
  }
}
