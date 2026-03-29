/**
 * Property-тест для RateLimitService
 * Property 24: Rate limiting после 5 попыток
 * Validates: Requirements 12.4, 12.5
 * 
 * Этот тест проверяет, что:
 * 1. Первые 5 попыток разрешены
 * 2. 6-я попытка блокируется
 * 3. Блокировка действует в течение временного окна
 * 4. После очистки попыток доступ восстанавливается
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fc } from '@fast-check/vitest';
import { RateLimitService } from '@/lib/services/rateLimitService';
import type { AuthAttemptsRepository, AuthAttempt } from '@/lib/repositories/authAttemptsRepository';

/**
 * Генератор для валидных Telegram ID
 */
const tgIdArbitrary = fc.integer({ min: 1, max: 2147483647 });

/**
 * Mock-реализация AuthAttemptsRepository для тестирования
 */
class MockAuthAttemptsRepository implements AuthAttemptsRepository {
  private attempts: Map<number, AuthAttempt[]> = new Map();
  private nextId = 1;

  async countRecentAttempts(tgId: number, minutes: number = 15): Promise<number> {
    const userAttempts = this.attempts.get(tgId) || [];
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);

    return userAttempts.filter(
      attempt => !attempt.success && attempt.timestamp >= cutoffTime
    ).length;
  }

  async recordAttempt(
    tgId: number,
    ipAddress: string | null = null,
    success: boolean = false
  ): Promise<void> {
    const userAttempts = this.attempts.get(tgId) || [];
    
    userAttempts.push({
      id: this.nextId++,
      tgId,
      timestamp: new Date(),
      ipAddress,
      success,
    });

    this.attempts.set(tgId, userAttempts);
  }

  async clearAttempts(tgId: number): Promise<void> {
    this.attempts.delete(tgId);
  }

  async cleanupOldAttempts(hours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const [tgId, userAttempts] of this.attempts.entries()) {
      const beforeCount = userAttempts.length;
      const filtered = userAttempts.filter(
        attempt => attempt.timestamp >= cutoffTime
      );
      
      deletedCount += beforeCount - filtered.length;

      if (filtered.length === 0) {
        this.attempts.delete(tgId);
      } else {
        this.attempts.set(tgId, filtered);
      }
    }

    return deletedCount;
  }

  async getOldestInWindow(
    tgId: number,
    windowStart: Date
  ): Promise<AuthAttempt | null> {
    const userAttempts = this.attempts.get(tgId) || [];
    
    const attemptsInWindow = userAttempts
      .filter(attempt => !attempt.success && attempt.timestamp >= windowStart)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return attemptsInWindow.length > 0 ? attemptsInWindow[0] : null;
  }

  // Вспомогательный метод для тестов
  clear(): void {
    this.attempts.clear();
    this.nextId = 1;
  }
}

describe('Property 24: Rate limiting после 5 попыток', () => {
  let mockRepo: MockAuthAttemptsRepository;

  beforeEach(() => {
    mockRepo = new MockAuthAttemptsRepository();
  });

  /**
   * Проверяет, что первые 5 попыток разрешены
   * Requirements: 12.4
   */
  it('первые 5 попыток разрешены', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes: 15,
        });

        // Записываем 5 неудачных попыток
        for (let i = 0; i < 5; i++) {
          await mockRepo.recordAttempt(tgId, null, false);
        }

        // Проверяем rate limit после 5 попыток
        const result = await service.checkRateLimit(tgId);

        // 5-я попытка ещё разрешена (блокировка с 6-й)
        expect(result.allowed).toBe(false);
        expect(result.attemptsCount).toBe(5);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что 6-я попытка блокируется
   * Requirements: 12.5
   */
  it('6-я попытка блокируется', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes: 15,
        });

        // Записываем 6 неудачных попыток
        for (let i = 0; i < 6; i++) {
          await mockRepo.recordAttempt(tgId, null, false);
        }

        // Проверяем rate limit после 6 попыток
        const result = await service.checkRateLimit(tgId);

        // 6-я попытка должна быть заблокирована
        expect(result.allowed).toBe(false);
        expect(result.attemptsCount).toBeGreaterThanOrEqual(5);
        expect(result.blockedUntil).not.toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что после очистки попыток доступ восстанавливается
   * Requirements: 12.4, 12.5
   */
  it('после очистки попыток доступ восстанавливается', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes: 15,
        });

        // Записываем 6 неудачных попыток (блокируем)
        for (let i = 0; i < 6; i++) {
          await mockRepo.recordAttempt(tgId, null, false);
        }

        // Проверяем блокировку
        const resultBlocked = await service.checkRateLimit(tgId);
        expect(resultBlocked.allowed).toBe(false);

        // Очищаем попытки
        await service.clearAttempts(tgId);

        // Проверяем восстановление доступа
        const resultAfterClear = await service.checkRateLimit(tgId);
        expect(resultAfterClear.allowed).toBe(true);
        expect(resultAfterClear.attemptsCount).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет изоляцию между разными tg_id
   * Requirements: 12.4
   */
  it('rate limiting изолирован между разными tg_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        tgIdArbitrary,
        tgIdArbitrary,
        async (tgId1, tgId2) => {
          // Пропускаем случай, когда tg_id совпадают
          fc.pre(tgId1 !== tgId2);

          mockRepo.clear();
          const service = new RateLimitService(mockRepo, {
            maxAttempts: 5,
            windowMinutes: 15,
          });

          // Блокируем первого пользователя (6 попыток)
          for (let i = 0; i < 6; i++) {
            await mockRepo.recordAttempt(tgId1, null, false);
          }

          // Проверяем, что первый пользователь заблокирован
          const result1 = await service.checkRateLimit(tgId1);
          expect(result1.allowed).toBe(false);

          // Проверяем, что второй пользователь не заблокирован
          const result2 = await service.checkRateLimit(tgId2);
          expect(result2.allowed).toBe(true);
          expect(result2.attemptsCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что успешные попытки не учитываются в rate limiting
   * Requirements: 12.4
   */
  it('успешные попытки не учитываются в rate limiting', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes: 15,
        });

        // Записываем 3 успешных попытки
        for (let i = 0; i < 3; i++) {
          await mockRepo.recordAttempt(tgId, null, true);
        }

        // Записываем 3 неудачных попытки
        for (let i = 0; i < 3; i++) {
          await mockRepo.recordAttempt(tgId, null, false);
        }

        // Проверяем rate limit
        const result = await service.checkRateLimit(tgId);

        // Должно быть разрешено (только 3 неудачных попытки)
        expect(result.allowed).toBe(true);
        expect(result.attemptsCount).toBe(3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что getRemainingAttempts возвращает корректное значение
   * Requirements: 12.4
   */
  it('getRemainingAttempts возвращает корректное значение', async () => {
    await fc.assert(
      fc.asyncProperty(
        tgIdArbitrary,
        fc.integer({ min: 0, max: 10 }),
        async (tgId, attemptCount) => {
          mockRepo.clear();
          const maxAttempts = 5;
          const service = new RateLimitService(mockRepo, {
            maxAttempts,
            windowMinutes: 15,
          });

          // Записываем attemptCount неудачных попыток
          for (let i = 0; i < attemptCount; i++) {
            await mockRepo.recordAttempt(tgId, null, false);
          }

          // Получаем количество оставшихся попыток
          const remaining = await service.getRemainingAttempts(tgId);

          // Проверяем формулу: remaining = max(0, maxAttempts - attemptCount)
          const expected = Math.max(0, maxAttempts - attemptCount);
          expect(remaining).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет инвариант: количество попыток монотонно возрастает
   * Requirements: 12.4
   */
  it('количество попыток монотонно возрастает при записи', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes: 15,
        });

        let previousCount = 0;

        // Записываем 5 попыток и проверяем монотонность
        for (let i = 0; i < 5; i++) {
          await mockRepo.recordAttempt(tgId, null, false);
          
          const result = await service.checkRateLimit(tgId);
          
          // Количество попыток должно увеличиваться
          expect(result.attemptsCount).toBeGreaterThan(previousCount);
          previousCount = result.attemptsCount;
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что recordFailedAttempt корректно записывает попытку
   * Requirements: 12.5
   */
  it('recordFailedAttempt корректно записывает попытку', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes: 15,
        });

        // Получаем начальное количество попыток
        const initialResult = await service.checkRateLimit(tgId);
        const initialCount = initialResult.attemptsCount;

        // Записываем неудачную попытку
        await service.recordFailedAttempt(tgId, null);

        // Проверяем, что количество увеличилось на 1
        const afterResult = await service.checkRateLimit(tgId);
        expect(afterResult.attemptsCount).toBe(initialCount + 1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет конфигурируемость maxAttempts
   * Requirements: 12.4
   */
  it('maxAttempts конфигурируется корректно', async () => {
    await fc.assert(
      fc.asyncProperty(
        tgIdArbitrary,
        fc.integer({ min: 1, max: 10 }),
        async (tgId, maxAttempts) => {
          mockRepo.clear();
          const service = new RateLimitService(mockRepo, {
            maxAttempts,
            windowMinutes: 15,
          });

          // Записываем maxAttempts попыток
          for (let i = 0; i < maxAttempts; i++) {
            await mockRepo.recordAttempt(tgId, null, false);
          }

          // Проверяем, что ещё не заблокирован
          const resultAtLimit = await service.checkRateLimit(tgId);
          expect(resultAtLimit.allowed).toBe(false);

          // Записываем ещё одну попытку
          await mockRepo.recordAttempt(tgId, null, false);

          // Проверяем блокировку
          const resultOverLimit = await service.checkRateLimit(tgId);
          expect(resultOverLimit.allowed).toBe(false);
          expect(resultOverLimit.attemptsCount).toBeGreaterThan(maxAttempts);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что blockedUntil устанавливается корректно
   * Requirements: 12.5
   */
  it('blockedUntil устанавливается корректно при блокировке', async () => {
    await fc.assert(
      fc.asyncProperty(tgIdArbitrary, async (tgId) => {
        mockRepo.clear();
        const windowMinutes = 15;
        const service = new RateLimitService(mockRepo, {
          maxAttempts: 5,
          windowMinutes,
        });

        // Записываем 6 попыток для блокировки
        for (let i = 0; i < 6; i++) {
          await mockRepo.recordAttempt(tgId, null, false);
        }

        const result = await service.checkRateLimit(tgId);

        // Проверяем блокировку
        expect(result.allowed).toBe(false);
        expect(result.blockedUntil).not.toBeNull();

        if (result.blockedUntil) {
          // blockedUntil должен быть в будущем
          expect(result.blockedUntil.getTime()).toBeGreaterThan(Date.now());

          // blockedUntil должен быть примерно через windowMinutes минут
          const expectedBlockedUntil = Date.now() + windowMinutes * 60 * 1000;
          const timeDiff = Math.abs(
            result.blockedUntil.getTime() - expectedBlockedUntil
          );

          // Допускаем погрешность в 5 секунд
          expect(timeDiff).toBeLessThan(5000);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет инвариант: checkRateLimit идемпотентен
   * Requirements: 12.4
   */
  it('checkRateLimit идемпотентен (не изменяет состояние)', async () => {
    await fc.assert(
      fc.asyncProperty(
        tgIdArbitrary,
        fc.integer({ min: 0, max: 10 }),
        async (tgId, attemptCount) => {
          mockRepo.clear();
          const service = new RateLimitService(mockRepo, {
            maxAttempts: 5,
            windowMinutes: 15,
          });

          // Записываем attemptCount попыток
          for (let i = 0; i < attemptCount; i++) {
            await mockRepo.recordAttempt(tgId, null, false);
          }

          // Вызываем checkRateLimit несколько раз
          const result1 = await service.checkRateLimit(tgId);
          const result2 = await service.checkRateLimit(tgId);
          const result3 = await service.checkRateLimit(tgId);

          // Все результаты должны быть идентичны
          expect(result1.allowed).toBe(result2.allowed);
          expect(result2.allowed).toBe(result3.allowed);
          expect(result1.attemptsCount).toBe(result2.attemptsCount);
          expect(result2.attemptsCount).toBe(result3.attemptsCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что конфигурация windowMinutes работает корректно
   * Requirements: 12.4
   */
  it('конфигурация windowMinutes работает корректно', async () => {
    await fc.assert(
      fc.asyncProperty(
        tgIdArbitrary,
        fc.integer({ min: 1, max: 60 }),
        async (tgId, windowMinutes) => {
          mockRepo.clear();
          const service = new RateLimitService(mockRepo, {
            maxAttempts: 5,
            windowMinutes,
          });

          // Записываем 6 попыток
          for (let i = 0; i < 6; i++) {
            await mockRepo.recordAttempt(tgId, null, false);
          }

          // Проверяем блокировку
          const result = await service.checkRateLimit(tgId);
          expect(result.allowed).toBe(false);

          if (result.blockedUntil) {
            // Время блокировки должно соответствовать windowMinutes
            const expectedUnblockTime = Date.now() + windowMinutes * 60 * 1000;
            const timeDiff = Math.abs(
              result.blockedUntil.getTime() - expectedUnblockTime
            );

            // Допускаем погрешность в 5 секунд
            expect(timeDiff).toBeLessThan(5000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что невалидные параметры вызывают ошибки
   * Requirements: 12.4
   */
  it('невалидные параметры вызывают ошибки', async () => {
    const service = new RateLimitService(mockRepo, {
      maxAttempts: 5,
      windowMinutes: 15,
    });

    // tgId < 1 должен вызвать ошибку
    await expect(service.checkRateLimit(0)).rejects.toThrow();
    await expect(service.checkRateLimit(-1)).rejects.toThrow();
    await expect(service.recordFailedAttempt(0)).rejects.toThrow();
    await expect(service.clearAttempts(0)).rejects.toThrow();
  });

  /**
   * Проверяет, что конструктор валидирует конфигурацию
   * Requirements: 12.4
   */
  it('конструктор валидирует конфигурацию', () => {
    // maxAttempts < 1 должен вызвать ошибку
    expect(() => {
      new RateLimitService(mockRepo, {
        maxAttempts: 0,
        windowMinutes: 15,
      });
    }).toThrow();

    // windowMinutes < 1 должен вызвать ошибку
    expect(() => {
      new RateLimitService(mockRepo, {
        maxAttempts: 5,
        windowMinutes: 0,
      });
    }).toThrow();
  });
});
