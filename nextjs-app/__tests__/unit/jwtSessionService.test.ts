/**
 * Unit-тесты для JWTSessionService
 * Проверяет генерацию, валидацию и истечение JWT токенов
 * 
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JWTSessionService } from '@/lib/services/jwtSessionService';

describe('JWTSessionService', () => {
  let jwtService: JWTSessionService;
  const testSecretKey = 'test-secret-key-for-jwt-signing-minimum-32-chars';

  beforeEach(() => {
    // Создаём новый экземпляр перед каждым тестом
    jwtService = new JWTSessionService({
      secretKey: testSecretKey,
      sessionLifetimeHours: 24,
    });
  });

  describe('Генерация JWT токена', () => {
    it('должен успешно генерировать JWT токен с корректными claims', async () => {
      const tgId = 123456789;
      const role = 2;

      const token = await jwtService.generateToken(tgId, role);

      // Проверяем, что токен не пустой
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Проверяем структуру JWT (3 части разделённые точками)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      // Валидируем токен и проверяем claims
      const claims = await jwtService.validateToken(token);
      expect(claims).not.toBeNull();
      expect(claims?.tgId).toBe(tgId);
      expect(claims?.role).toBe(role);
      expect(claims?.iat).toBeDefined();
      expect(claims?.exp).toBeDefined();

      // Проверяем, что exp = iat + 24 часа
      const expectedExp = claims!.iat + 24 * 3600;
      expect(claims?.exp).toBe(expectedExp);
    });

    it('должен генерировать разные токены для одного пользователя', async () => {
      const tgId = 123456789;
      const role = 1;

      // Генерируем два токена с небольшой задержкой
      const token1 = await jwtService.generateToken(tgId, role);
      
      // Ждём 1 секунду чтобы iat изменился
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const token2 = await jwtService.generateToken(tgId, role);

      // Токены должны различаться (разные iat)
      expect(token1).not.toBe(token2);
    });

    it('должен выбрасывать ошибку при невалидном tgId', async () => {
      await expect(jwtService.generateToken(0, 2)).rejects.toThrow();
      await expect(jwtService.generateToken(-1, 2)).rejects.toThrow();
    });

    it('должен выбрасывать ошибку при невалидной роли', async () => {
      const tgId = 123456789;

      await expect(jwtService.generateToken(tgId, -1)).rejects.toThrow();
      await expect(jwtService.generateToken(tgId, 4)).rejects.toThrow();
    });
  });

  describe('Валидация JWT токена', () => {
    it('должен успешно валидировать валидный токен', async () => {
      const tgId = 987654321;
      const role = 0;

      const token = await jwtService.generateToken(tgId, role);
      const claims = await jwtService.validateToken(token);

      expect(claims).not.toBeNull();
      expect(claims?.tgId).toBe(tgId);
      expect(claims?.role).toBe(role);
    });

    it('должен отклонять токен с неправильной подписью', async () => {
      const tgId = 123456789;
      const role = 2;

      // Генерируем токен с одним ключом
      const token = await jwtService.generateToken(tgId, role);

      // Создаём новый сервис с другим ключом
      const otherService = new JWTSessionService({
        secretKey: 'different-secret-key-for-testing-purposes-32-chars',
        sessionLifetimeHours: 24,
      });

      // Пытаемся валидировать токен с другим ключом
      const claims = await otherService.validateToken(token);

      expect(claims).toBeNull();
    });

    it('должен отклонять истёкший токен', async () => {
      const tgId = 123456789;
      const role = 1;

      // Создаём сервис с очень коротким временем жизни
      const shortLivedService = new JWTSessionService({
        secretKey: testSecretKey,
        sessionLifetimeHours: 0.0001, // ~0.36 секунды
      });

      const token = await shortLivedService.generateToken(tgId, role);

      // Ждём истечения токена
      await new Promise(resolve => setTimeout(resolve, 500));

      // Проверяем, что токен истёк
      const isExpired = await shortLivedService.isTokenExpired(token);
      expect(isExpired).toBe(true);

      // Валидация должна вернуть null
      const claims = await shortLivedService.validateToken(token);
      expect(claims).toBeNull();
    });

    it('должен отклонять пустой токен', async () => {
      const claims1 = await jwtService.validateToken('');
      const claims2 = await jwtService.validateToken('   ');

      expect(claims1).toBeNull();
      expect(claims2).toBeNull();
    });

    it('должен отклонять токен с модифицированными claims', async () => {
      const tgId = 123456789;
      const role = 2;

      const token = await jwtService.generateToken(tgId, role);

      // Модифицируем payload (меняем роль в декодированном токене)
      const parts = token.split('.');
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf-8')
      );
      
      // Меняем роль
      payload.role = 0;
      
      // Создаём модифицированный токен
      const modifiedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const modifiedToken = `${parts[0]}.${modifiedPayload}.${parts[2]}`;

      // Валидация должна отклонить модифицированный токен
      const claims = await jwtService.validateToken(modifiedToken);
      expect(claims).toBeNull();
    });
  });

  describe('Проверка истечения токена', () => {
    it('должен корректно определять неистёкший токен', async () => {
      const tgId = 123456789;
      const role = 2;

      const token = await jwtService.generateToken(tgId, role);
      const isExpired = await jwtService.isTokenExpired(token);

      expect(isExpired).toBe(false);
    });

    it('должен корректно определять истёкший токен', async () => {
      const tgId = 123456789;
      const role = 1;

      // Создаём сервис с очень коротким временем жизни
      const shortLivedService = new JWTSessionService({
        secretKey: testSecretKey,
        sessionLifetimeHours: 0.0001,
      });

      const token = await shortLivedService.generateToken(tgId, role);

      // Ждём истечения
      await new Promise(resolve => setTimeout(resolve, 500));

      const isExpired = await shortLivedService.isTokenExpired(token);
      expect(isExpired).toBe(true);
    });

    it('должен считать невалидный токен истёкшим', async () => {
      const isExpired = await jwtService.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });
  });

  describe('Конфигурация сервиса', () => {
    it('должен использовать кастомное время жизни сессии', async () => {
      const customLifetime = 48; // 48 часов
      const customService = new JWTSessionService({
        secretKey: testSecretKey,
        sessionLifetimeHours: customLifetime,
      });

      const tgId = 123456789;
      const role = 2;

      const token = await customService.generateToken(tgId, role);
      const claims = await customService.validateToken(token);

      expect(claims).not.toBeNull();
      
      // Проверяем, что exp = iat + 48 часов
      const expectedExp = claims!.iat + customLifetime * 3600;
      expect(claims?.exp).toBe(expectedExp);
    });

    it('должен выбрасывать ошибку при пустом секретном ключе', () => {
      expect(() => {
        new JWTSessionService({
          secretKey: '',
          sessionLifetimeHours: 24,
        });
      }).toThrow('JWT secret key is required');
    });

    it('должен выбрасывать ошибку при отрицательном времени жизни', () => {
      expect(() => {
        new JWTSessionService({
          secretKey: testSecretKey,
          sessionLifetimeHours: -1,
        });
      }).toThrow('Session lifetime must be positive');
    });

    it('должен выбрасывать ошибку при нулевом времени жизни', () => {
      expect(() => {
        new JWTSessionService({
          secretKey: testSecretKey,
          sessionLifetimeHours: 0,
        });
      }).toThrow('Session lifetime must be positive');
    });
  });
});
