/**
 * Сервис аутентификации администраторов
 * Центральный сервис для регистрации паролей и аутентификации
 */

import type { AdminRepository } from '@/lib/repositories/adminRepository';
import type { RateLimitService } from '@/lib/services/rateLimitService';
import type { PasswordHasher } from '@/lib/services/passwordHasher';
import type { JWTSessionService } from '@/lib/services/jwtSessionService';
import type { Administrator } from '@/lib/models/administrator';

/**
 * Результат аутентификации
 */
export interface AuthResult {
  /** Успешность операции */
  success: boolean;
  
  /** JWT токен (если успешно) */
  token?: string;
  
  /** Роль администратора (если успешно) */
  role?: number;
  
  /** Время истечения токена (если успешно) */
  expiresAt?: string;
  
  /** Сообщение об ошибке (если неуспешно) */
  error?: string;
  
  /** Количество оставшихся попыток (если rate limit) */
  remainingAttempts?: number;
}

/**
 * AdminAuthService - сервис аутентификации администраторов
 */
export class AdminAuthService {
  private adminRepo: AdminRepository;
  private rateLimiter: RateLimitService;
  private passwordHasher: PasswordHasher;
  private jwtService: JWTSessionService;

  /**
   * Создаёт экземпляр AdminAuthService
   * @param adminRepo - Репозиторий администраторов
   * @param rateLimiter - Сервис rate limiting
   * @param passwordHasher - Сервис хеширования паролей
   * @param jwtService - Сервис JWT токенов
   */
  constructor(
    adminRepo: AdminRepository,
    rateLimiter: RateLimitService,
    passwordHasher: PasswordHasher,
    jwtService: JWTSessionService
  ) {
    this.adminRepo = adminRepo;
    this.rateLimiter = rateLimiter;
    this.passwordHasher = passwordHasher;
    this.jwtService = jwtService;
  }

  /**
   * Регистрирует пароль для нового администратора
   * @param tgId - Telegram ID администратора
   * @param password - Открытый пароль
   * @returns Результат регистрации с JWT токеном
   */
  async registerPassword(tgId: number, password: string): Promise<AuthResult> {
    if (tgId < 1) {
      return {
        success: false,
        error: 'Некорректный идентификатор пользователя',
      };
    }

    if (!password || password.trim().length < 8) {
      return {
        success: false,
        error: 'Пароль должен содержать минимум 8 символов',
      };
    }

    try {
      // Получаем администратора из БД
      const admin = await this.adminRepo.getByTgId(tgId);

      if (!admin) {
        return {
          success: false,
          error: 'Доступ запрещён',
        };
      }

      // Проверяем, что это первый вход (password_hash IS NULL)
      if (admin.passwordHash !== null) {
        return {
          success: false,
          error: 'Пароль уже установлен',
        };
      }

      // Хешируем пароль
      const passwordHash = await this.passwordHasher.hashPassword(password);

      // Обновляем password_hash в БД
      await this.adminRepo.updatePassword({
        tgId,
        passwordHash,
      });

      // Генерируем JWT токен
      const token = await this.jwtService.generateToken(tgId, admin.role);

      // Получаем claims для expiresAt
      const claims = await this.jwtService.validateToken(token);
      const expiresAt = claims
        ? new Date(claims.exp * 1000).toISOString()
        : undefined;

      return {
        success: true,
        token,
        role: admin.role,
        expiresAt,
      };
    } catch (error) {
      console.error('Error registering password:', error);
      return {
        success: false,
        error: 'Ошибка при регистрации пароля',
      };
    }
  }

  /**
   * Аутентифицирует администратора
   * @param tgId - Telegram ID администратора
   * @param password - Открытый пароль
   * @returns Результат аутентификации с JWT токеном
   */
  async authenticate(tgId: number, password: string): Promise<AuthResult> {
    if (tgId < 1) {
      return {
        success: false,
        error: 'Некорректные учётные данные',
      };
    }

    if (!password || password.trim().length === 0) {
      return {
        success: false,
        error: 'Некорректные учётные данные',
      };
    }

    try {
      // Проверяем rate limit
      const rateLimitResult = await this.rateLimiter.checkRateLimit(tgId);

      if (!rateLimitResult.allowed) {
        const remainingAttempts = await this.rateLimiter.getRemainingAttempts(tgId);
        
        return {
          success: false,
          error: 'Слишком много попыток входа. Попробуйте позже.',
          remainingAttempts,
        };
      }

      // Получаем администратора из БД
      const admin = await this.adminRepo.getByTgId(tgId);

      // Единообразное сообщение об ошибке (не раскрываем существование tg_id)
      if (!admin || admin.passwordHash === null) {
        await this.rateLimiter.recordFailedAttempt(tgId);
        return {
          success: false,
          error: 'Некорректные учётные данные',
        };
      }

      // Верифицируем пароль
      const isPasswordValid = await this.passwordHasher.verifyPassword(
        admin.passwordHash,
        password
      );

      if (!isPasswordValid) {
        // Записываем неудачную попытку
        await this.rateLimiter.recordFailedAttempt(tgId);
        
        const remainingAttempts = await this.rateLimiter.getRemainingAttempts(tgId);
        
        return {
          success: false,
          error: 'Некорректные учётные данные',
          remainingAttempts,
        };
      }

      // Успешная аутентификация - очищаем попытки
      await this.rateLimiter.clearAttempts(tgId);

      // Генерируем JWT токен
      const token = await this.jwtService.generateToken(tgId, admin.role);

      // Получаем claims для expiresAt
      const claims = await this.jwtService.validateToken(token);
      const expiresAt = claims
        ? new Date(claims.exp * 1000).toISOString()
        : undefined;

      return {
        success: true,
        token,
        role: admin.role,
        expiresAt,
      };
    } catch (error) {
      console.error('Error authenticating:', error);
      return {
        success: false,
        error: 'Ошибка при аутентификации',
      };
    }
  }

  /**
   * Проверяет, первый ли это вход (password_hash IS NULL)
   * @param tgId - Telegram ID администратора
   * @returns true если первый вход
   */
  async isFirstLogin(tgId: number): Promise<boolean> {
    if (tgId < 1) {
      return false;
    }

    try {
      const admin = await this.adminRepo.getByTgId(tgId);
      
      if (!admin) {
        return false;
      }

      return admin.passwordHash === null;
    } catch (error) {
      console.error('Error checking first login:', error);
      return false;
    }
  }
}

/**
 * Создаёт экземпляр AdminAuthService с зависимостями
 */
export function createAdminAuthService(
  adminRepo: AdminRepository,
  rateLimiter: RateLimitService,
  passwordHasher: PasswordHasher,
  jwtService: JWTSessionService
): AdminAuthService {
  return new AdminAuthService(adminRepo, rateLimiter, passwordHasher, jwtService);
}
