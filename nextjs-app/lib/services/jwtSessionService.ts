/**
 * Сервис управления JWT сессиями для администраторов
 * Использует библиотеку jose для работы с JWT
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { SessionClaims } from '@/lib/models/session';

/**
 * Конфигурация JWT сервиса
 */
export interface JWTConfig {
  /** Секретный ключ для подписи JWT */
  secretKey: string;
  
  /** Время жизни сессии в часах (по умолчанию 24) */
  sessionLifetimeHours?: number;
  
  /** Алгоритм подписи (по умолчанию HS256) */
  algorithm?: string;
}

/**
 * JWTSessionService - сервис управления JWT токенами
 */
export class JWTSessionService {
  private secretKey: Uint8Array;
  private sessionLifetimeHours: number;
  private algorithm: string;

  /**
   * Создаёт экземпляр JWTSessionService
   * @param config - Конфигурация JWT
   */
  constructor(config: JWTConfig) {
    if (!config.secretKey || config.secretKey.trim().length === 0) {
      throw new Error('JWT secret key is required');
    }

    // Преобразуем строку в Uint8Array для jose
    // Используем trim() для удаления пробелов по краям
    const trimmedKey = config.secretKey.trim();
    this.secretKey = new TextEncoder().encode(trimmedKey);
    
    // Проверяем минимальную длину ключа (32 байта для HS256)
    if (this.secretKey.length < 32) {
      throw new Error('JWT secret key must be at least 32 bytes');
    }
    
    this.sessionLifetimeHours = config.sessionLifetimeHours ?? 24;
    this.algorithm = config.algorithm ?? 'HS256';

    if (this.sessionLifetimeHours <= 0) {
      throw new Error('Session lifetime must be positive');
    }
  }

  /**
   * Генерирует JWT токен для администратора
   * @param tgId - Telegram ID администратора
   * @param role - Роль администратора
   * @returns JWT токен
   */
  async generateToken(tgId: number, role: number): Promise<string> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    if (role < 0 || role > 3) {
      throw new Error('role must be between 0 and 3');
    }

    try {
      const token = await new SignJWT({
        tgId,
        role,
      })
        .setProtectedHeader({ alg: this.algorithm })
        .setIssuedAt()
        .setExpirationTime(`${this.sessionLifetimeHours}h`)
        .sign(this.secretKey);

      return token;
    } catch (error) {
      console.error('Error generating JWT token:', error);
      throw new Error('Failed to generate JWT token');
    }
  }

  /**
   * Валидирует JWT токен и возвращает claims
   * @param token - JWT токен
   * @returns SessionClaims или null если токен невалиден
   */
  async validateToken(token: string): Promise<SessionClaims | null> {
    if (!token || token.trim().length === 0) {
      return null;
    }

    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        algorithms: [this.algorithm],
      });

      // Проверяем наличие обязательных полей
      if (
        typeof payload.tgId !== 'number' ||
        typeof payload.role !== 'number' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        console.error('Invalid JWT payload structure');
        return null;
      }

      return {
        tgId: payload.tgId,
        role: payload.role,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch (error) {
      // jwtVerify выбрасывает исключения при невалидном токене
      // Логируем и возвращаем null
      console.error('Error validating JWT token:', error);
      return null;
    }
  }

  /**
   * Проверяет, истёк ли токен
   * @param token - JWT токен
   * @returns true если токен истёк
   */
  async isTokenExpired(token: string): Promise<boolean> {
    const claims = await this.validateToken(token);
    
    if (!claims) {
      return true; // Невалидный токен считаем истёкшим
    }

    const now = Math.floor(Date.now() / 1000);
    return claims.exp < now;
  }

  /**
   * Извлекает claims из токена без валидации подписи
   * ВНИМАНИЕ: Использовать только для отладки!
   * @param token - JWT токен
   * @returns Payload или null
   */
  decodeTokenUnsafe(token: string): JWTPayload | null {
    if (!token || token.trim().length === 0) {
      return null;
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf-8')
      );

      return payload;
    } catch (error) {
      console.error('Error decoding JWT token:', error);
      return null;
    }
  }
}

/**
 * Создаёт экземпляр JWTSessionService из переменных окружения
 */
export function createJWTSessionService(): JWTSessionService {
  const secretKey = process.env.JWT_SECRET;
  
  if (!secretKey) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const sessionLifetimeHours = process.env.SESSION_LIFETIME_HOURS
    ? parseInt(process.env.SESSION_LIFETIME_HOURS, 10)
    : 24;

  return new JWTSessionService({
    secretKey,
    sessionLifetimeHours,
  });
}
