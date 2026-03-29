/**
 * Property-тест для JWTSessionService
 * Property 17: JWT структура и срок действия
 * Validates: Requirements 10.1, 10.2, 10.5
 * 
 * Этот тест проверяет, что:
 * 1. JWT токены генерируются с корректной структурой
 * 2. JWT токены содержат все необходимые claims (tgId, role, iat, exp)
 * 3. Срок действия токена соответствует session_lifetime_hours
 * 4. Токены могут быть успешно валидированы
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fc } from '@fast-check/vitest';
import { JWTSessionService } from '@/lib/services/jwtSessionService';

/**
 * Генератор для валидных Telegram ID (положительные целые числа)
 */
const tgIdArbitrary = fc.integer({ min: 1, max: 2147483647 });

/**
 * Генератор для валидных ролей (0-3)
 */
const roleArbitrary = fc.integer({ min: 0, max: 3 });

/**
 * Генератор для времени жизни сессии в часах (1-168 часов = 1 неделя)
 */
const sessionLifetimeArbitrary = fc.integer({ min: 1, max: 168 });

/**
 * Генератор для секретного ключа (минимум 32 символа, без пробелов)
 * Используем alphanumeric для генерации валидных ключей
 */
const secretKeyArbitrary = fc.string({ 
  minLength: 32, 
  maxLength: 64,
}).filter(s => s.trim().length >= 32);

describe('Property 17: JWT структура и срок действия', () => {
  /**
   * Проверяет, что JWT токен генерируется с корректной структурой
   * Requirements: 10.1, 10.2
   */
  it('JWT токен генерируется с корректной структурой', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        async (secretKey, tgId, role) => {
          const service = new JWTSessionService({
            secretKey,
            sessionLifetimeHours: 24,
          });

          const token = await service.generateToken(tgId, role);

          // Проверяем, что токен не пустой
          expect(token).toBeTruthy();
          expect(token.length).toBeGreaterThan(0);

          // Проверяем структуру JWT (3 части, разделённые точками)
          const parts = token.split('.');
          expect(parts.length).toBe(3);

          // Проверяем, что каждая часть не пустая
          parts.forEach(part => {
            expect(part.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что JWT токен содержит все необходимые claims
   * Requirements: 10.2
   */
  it('JWT токен содержит все необходимые claims', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        async (secretKey, tgId, role) => {
          const service = new JWTSessionService({
            secretKey,
            sessionLifetimeHours: 24,
          });

          const token = await service.generateToken(tgId, role);
          const claims = await service.validateToken(token);

          // Проверяем, что claims не null
          expect(claims).not.toBeNull();

          if (claims) {
            // Проверяем наличие всех обязательных полей
            expect(claims.tgId).toBe(tgId);
            expect(claims.role).toBe(role);
            expect(typeof claims.iat).toBe('number');
            expect(typeof claims.exp).toBe('number');

            // Проверяем, что iat и exp - валидные Unix timestamps
            expect(claims.iat).toBeGreaterThan(0);
            expect(claims.exp).toBeGreaterThan(0);
            expect(claims.exp).toBeGreaterThan(claims.iat);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что срок действия токена соответствует session_lifetime_hours
   * Requirements: 10.5
   */
  it('срок действия токена соответствует session_lifetime_hours', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        sessionLifetimeArbitrary,
        async (secretKey, tgId, role, sessionLifetime) => {
          const service = new JWTSessionService({
            secretKey,
            sessionLifetimeHours: sessionLifetime,
          });

          const token = await service.generateToken(tgId, role);
          const claims = await service.validateToken(token);

          expect(claims).not.toBeNull();

          if (claims) {
            // Проверяем формулу: exp = iat + session_lifetime_hours * 3600
            const expectedExp = claims.iat + sessionLifetime * 3600;
            expect(claims.exp).toBe(expectedExp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что токены могут быть успешно валидированы
   * Requirements: 10.1, 10.2
   */
  it('токены могут быть успешно валидированы', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        async (secretKey, tgId, role) => {
          const service = new JWTSessionService({
            secretKey,
            sessionLifetimeHours: 24,
          });

          const token = await service.generateToken(tgId, role);
          const claims = await service.validateToken(token);

          // Проверяем успешную валидацию
          expect(claims).not.toBeNull();

          if (claims) {
            // Проверяем, что данные сохранились корректно
            expect(claims.tgId).toBe(tgId);
            expect(claims.role).toBe(role);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что токены с разными секретными ключами не валидируются
   * Requirements: 10.1
   */
  it('токены с разными секретными ключами не валидируются', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        async (secretKey1, secretKey2, tgId, role) => {
          // Пропускаем случай, когда ключи совпадают
          fc.pre(secretKey1 !== secretKey2);

          const service1 = new JWTSessionService({
            secretKey: secretKey1,
            sessionLifetimeHours: 24,
          });

          const service2 = new JWTSessionService({
            secretKey: secretKey2,
            sessionLifetimeHours: 24,
          });

          // Генерируем токен с первым ключом
          const token = await service1.generateToken(tgId, role);

          // Пытаемся валидировать со вторым ключом
          const claims = await service2.validateToken(token);

          // Валидация должна провалиться
          expect(claims).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что isTokenExpired корректно определяет истёкшие токены
   * Requirements: 10.2
   */
  it('isTokenExpired корректно определяет истёкшие токены', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        async (secretKey, tgId, role) => {
          // Создаём сервис с очень коротким временем жизни (1 секунда)
          const service = new JWTSessionService({
            secretKey,
            sessionLifetimeHours: 1 / 3600, // 1 секунда
          });

          const token = await service.generateToken(tgId, role);

          // Сразу после генерации токен не должен быть истёкшим
          const isExpiredImmediately = await service.isTokenExpired(token);
          expect(isExpiredImmediately).toBe(false);

          // Ждём 2 секунды
          await new Promise(resolve => setTimeout(resolve, 2000));

          // После истечения времени токен должен быть истёкшим
          const isExpiredAfterWait = await service.isTokenExpired(token);
          expect(isExpiredAfterWait).toBe(true);
        }
      ),
      { numRuns: 10 } // Меньше итераций из-за setTimeout
    );
  });

  /**
   * Проверяет инвариант: валидация токена идемпотентна
   * Requirements: 10.1, 10.2
   */
  it('валидация токена идемпотентна', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretKeyArbitrary,
        tgIdArbitrary,
        roleArbitrary,
        async (secretKey, tgId, role) => {
          const service = new JWTSessionService({
            secretKey,
            sessionLifetimeHours: 24,
          });

          const token = await service.generateToken(tgId, role);

          // Валидируем токен несколько раз
          const claims1 = await service.validateToken(token);
          const claims2 = await service.validateToken(token);
          const claims3 = await service.validateToken(token);

          // Все результаты должны быть идентичны
          expect(claims1).toEqual(claims2);
          expect(claims2).toEqual(claims3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
