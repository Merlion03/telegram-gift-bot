/**
 * Сервис защиты от brute-force атак через rate limiting
 * Использует AuthAttemptsRepository для подсчёта попыток
 */

import type { AuthAttemptsRepository } from '@/lib/repositories/authAttemptsRepository';

/**
 * Результат проверки rate limit
 */
export interface RateLimitResult {
  /** Разрешена ли попытка входа */
  allowed: boolean;
  
  /** Количество попыток за период */
  attemptsCount: number;
  
  /** Время до разблокировки (если заблокирован) */
  blockedUntil: Date | null;
}

/**
 * Конфигурация rate limiting
 */
export interface RateLimitConfig {
  /** Максимальное количество попыток (по умолчанию 5) */
  maxAttempts?: number;
  
  /** Временное окно в минутах (по умолчанию 15) */
  windowMinutes?: number;
}

/**
 * RateLimitService - сервис rate limiting
 */
export class RateLimitService {
  private attemptsRepo: AuthAttemptsRepository;
  private maxAttempts: number;
  private windowMinutes: number;

  /**
   * Создаёт экземпляр RateLimitService
   * @param attemptsRepo - Репозиторий попыток входа
   * @param config - Конфигурация rate limiting
   */
  constructor(
    attemptsRepo: AuthAttemptsRepository,
    config?: RateLimitConfig
  ) {
    this.attemptsRepo = attemptsRepo;
    this.maxAttempts = config?.maxAttempts ?? 5;
    this.windowMinutes = config?.windowMinutes ?? 15;

    if (this.maxAttempts < 1) {
      throw new Error('maxAttempts must be >= 1');
    }

    if (this.windowMinutes < 1) {
      throw new Error('windowMinutes must be >= 1');
    }
  }

  /**
   * Проверяет rate limit для указанного tg_id
   * @param tgId - Telegram ID администратора
   * @returns Результат проверки rate limit
   */
  async checkRateLimit(tgId: number): Promise<RateLimitResult> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      // Подсчитываем попытки за последние N минут
      const attemptsCount = await this.attemptsRepo.countRecentAttempts(
        tgId,
        this.windowMinutes
      );

      // Если попыток меньше максимума - разрешаем
      if (attemptsCount < this.maxAttempts) {
        return {
          allowed: true,
          attemptsCount,
          blockedUntil: null,
        };
      }

      // Если попыток >= максимума - блокируем
      // Вычисляем время разблокировки (самая старая попытка + окно)
      const windowStart = new Date(
        Date.now() - this.windowMinutes * 60 * 1000
      );
      
      const oldestAttempt = await this.attemptsRepo.getOldestInWindow(
        tgId,
        windowStart
      );

      let blockedUntil: Date | null = null;
      
      if (oldestAttempt) {
        blockedUntil = new Date(
          oldestAttempt.timestamp.getTime() + this.windowMinutes * 60 * 1000
        );
      }

      return {
        allowed: false,
        attemptsCount,
        blockedUntil,
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      throw new Error('Failed to check rate limit');
    }
  }

  /**
   * Записывает неудачную попытку входа
   * @param tgId - Telegram ID администратора
   * @param ipAddress - IP адрес (опционально)
   */
  async recordFailedAttempt(
    tgId: number,
    ipAddress: string | null = null
  ): Promise<void> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      await this.attemptsRepo.recordAttempt(tgId, ipAddress, false);
    } catch (error) {
      console.error('Error recording failed attempt:', error);
      throw new Error('Failed to record failed attempt');
    }
  }

  /**
   * Очищает все попытки после успешного входа
   * @param tgId - Telegram ID администратора
   */
  async clearAttempts(tgId: number): Promise<void> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      await this.attemptsRepo.clearAttempts(tgId);
    } catch (error) {
      console.error('Error clearing attempts:', error);
      throw new Error('Failed to clear attempts');
    }
  }

  /**
   * Получает количество оставшихся попыток
   * @param tgId - Telegram ID администратора
   * @returns Количество оставшихся попыток (0 если заблокирован)
   */
  async getRemainingAttempts(tgId: number): Promise<number> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      const attemptsCount = await this.attemptsRepo.countRecentAttempts(
        tgId,
        this.windowMinutes
      );

      const remaining = this.maxAttempts - attemptsCount;
      return remaining > 0 ? remaining : 0;
    } catch (error) {
      console.error('Error getting remaining attempts:', error);
      throw new Error('Failed to get remaining attempts');
    }
  }
}

/**
 * Создаёт экземпляр RateLimitService с конфигурацией из переменных окружения
 */
export function createRateLimitService(
  attemptsRepo: AuthAttemptsRepository
): RateLimitService {
  const maxAttempts = process.env.RATE_LIMIT_MAX_ATTEMPTS
    ? parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS, 10)
    : 5;

  const windowMinutes = process.env.RATE_LIMIT_WINDOW_MINUTES
    ? parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10)
    : 15;

  return new RateLimitService(attemptsRepo, {
    maxAttempts,
    windowMinutes,
  });
}
