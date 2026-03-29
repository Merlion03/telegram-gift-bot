/**
 * Unit-тесты для AdminAuthService
 * Проверяет регистрацию паролей, аутентификацию и проверку первого входа
 * 
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminAuthService } from '@/lib/services/adminAuthService';
import type { AdminRepository } from '@/lib/repositories/adminRepository';
import type { RateLimitService } from '@/lib/services/rateLimitService';
import type { PasswordHasher } from '@/lib/services/passwordHasher';
import type { JWTSessionService } from '@/lib/services/jwtSessionService';
import type { Administrator } from '@/lib/models/administrator';

describe('AdminAuthService', () => {
  let authService: AdminAuthService;
  let mockAdminRepo: AdminRepository;
  let mockRateLimiter: RateLimitService;
  let mockPasswordHasher: PasswordHasher;
  let mockJwtService: JWTSessionService;

  beforeEach(() => {
    // Создаём mock объекты для зависимостей
    mockAdminRepo = {
      getByTgId: vi.fn(),
      exists: vi.fn(),
      updatePassword: vi.fn(),
    } as any;

    mockRateLimiter = {
      checkRateLimit: vi.fn(),
      recordFailedAttempt: vi.fn(),
      clearAttempts: vi.fn(),
      getRemainingAttempts: vi.fn(),
    } as any;

    mockPasswordHasher = {
      hashPassword: vi.fn(),
      verifyPassword: vi.fn(),
    } as any;

    mockJwtService = {
      generateToken: vi.fn(),
      validateToken: vi.fn(),
      isTokenExpired: vi.fn(),
    } as any;

    // Создаём экземпляр сервиса с mock зависимостями
    authService = new AdminAuthService(
      mockAdminRepo,
      mockRateLimiter,
      mockPasswordHasher,
      mockJwtService
    );
  });

  describe('Регистрация пароля', () => {
    it('должен успешно регистрировать пароль для нового администратора', async () => {
      const tgId = 123456789;
      const password = 'SecurePassword123';
      const role = 2;
      const passwordHash = '$argon2id$v=19$m=65536,t=2,p=4$...';
      const token = 'jwt.token.here';

      // Настраиваем mock ответы
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role,
        passwordHash: null, // Первый вход
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);
      vi.mocked(mockPasswordHasher.hashPassword).mockResolvedValue(passwordHash);
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(token);
      vi.mocked(mockJwtService.validateToken).mockResolvedValue({
        tgId,
        role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 3600,
      });

      // Выполняем регистрацию
      const result = await authService.registerPassword(tgId, password);

      // Проверяем результат
      expect(result.success).toBe(true);
      expect(result.token).toBe(token);
      expect(result.role).toBe(role);
      expect(result.expiresAt).toBeDefined();

      // Проверяем, что вызваны нужные методы
      expect(mockAdminRepo.getByTgId).toHaveBeenCalledWith(tgId);
      expect(mockPasswordHasher.hashPassword).toHaveBeenCalledWith(password);
      expect(mockAdminRepo.updatePassword).toHaveBeenCalledWith({
        tgId,
        passwordHash,
      });
      expect(mockJwtService.generateToken).toHaveBeenCalledWith(tgId, role);
    });

    it('должен отклонять регистрацию если пароль уже установлен', async () => {
      const tgId = 123456789;
      const password = 'SecurePassword123';

      // Администратор с уже установленным паролем
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role: 2,
        passwordHash: '$argon2id$v=19$m=65536,t=2,p=4$...', // Пароль уже есть
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);

      // Выполняем регистрацию
      const result = await authService.registerPassword(tgId, password);

      // Проверяем отказ
      expect(result.success).toBe(false);
      expect(result.error).toBe('Пароль уже установлен');
      expect(result.token).toBeUndefined();

      // Проверяем, что пароль НЕ был обновлён
      expect(mockPasswordHasher.hashPassword).not.toHaveBeenCalled();
      expect(mockAdminRepo.updatePassword).not.toHaveBeenCalled();
    });

    it('должен отклонять регистрацию для несуществующего администратора', async () => {
      const tgId = 999999999;
      const password = 'SecurePassword123';

      // Администратор не найден
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(null);

      // Выполняем регистрацию
      const result = await authService.registerPassword(tgId, password);

      // Проверяем отказ
      expect(result.success).toBe(false);
      expect(result.error).toBe('Доступ запрещён');
      expect(result.token).toBeUndefined();
    });

    it('должен отклонять регистрацию с коротким паролем', async () => {
      const tgId = 123456789;
      const shortPassword = '1234567'; // 7 символов

      // Выполняем регистрацию
      const result = await authService.registerPassword(tgId, shortPassword);

      // Проверяем отказ
      expect(result.success).toBe(false);
      expect(result.error).toBe('Пароль должен содержать минимум 8 символов');

      // Проверяем, что БД не была затронута
      expect(mockAdminRepo.getByTgId).not.toHaveBeenCalled();
    });

    it('должен отклонять регистрацию с невалидным tgId', async () => {
      const password = 'SecurePassword123';

      // Тестируем невалидные tgId
      const result1 = await authService.registerPassword(0, password);
      const result2 = await authService.registerPassword(-1, password);

      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Некорректный идентификатор пользователя');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Некорректный идентификатор пользователя');
    });
  });

  describe('Аутентификация', () => {
    it('должен успешно аутентифицировать администратора с правильным паролем', async () => {
      const tgId = 123456789;
      const password = 'CorrectPassword123';
      const role = 1;
      const passwordHash = '$argon2id$v=19$m=65536,t=2,p=4$...';
      const token = 'jwt.token.here';

      // Настраиваем mock ответы
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role,
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: true,
        attemptsCount: 0,
        blockedUntil: null,
      });
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);
      vi.mocked(mockPasswordHasher.verifyPassword).mockResolvedValue(true);
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(token);
      vi.mocked(mockJwtService.validateToken).mockResolvedValue({
        tgId,
        role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 3600,
      });

      // Выполняем аутентификацию
      const result = await authService.authenticate(tgId, password);

      // Проверяем результат
      expect(result.success).toBe(true);
      expect(result.token).toBe(token);
      expect(result.role).toBe(role);
      expect(result.expiresAt).toBeDefined();

      // Проверяем, что попытки были очищены
      expect(mockRateLimiter.clearAttempts).toHaveBeenCalledWith(tgId);
      
      // Проверяем, что пароль был верифицирован
      expect(mockPasswordHasher.verifyPassword).toHaveBeenCalledWith(
        passwordHash,
        password
      );
    });

    it('должен отклонять аутентификацию с неправильным паролем', async () => {
      const tgId = 123456789;
      const password = 'WrongPassword123';
      const passwordHash = '$argon2id$v=19$m=65536,t=2,p=4$...';

      // Настраиваем mock ответы
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role: 2,
        passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: true,
        attemptsCount: 2,
        blockedUntil: null,
      });
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);
      vi.mocked(mockPasswordHasher.verifyPassword).mockResolvedValue(false); // Неправильный пароль
      vi.mocked(mockRateLimiter.getRemainingAttempts).mockResolvedValue(3);

      // Выполняем аутентификацию
      const result = await authService.authenticate(tgId, password);

      // Проверяем отказ
      expect(result.success).toBe(false);
      expect(result.error).toBe('Некорректные учётные данные');
      expect(result.token).toBeUndefined();
      expect(result.remainingAttempts).toBe(3);

      // Проверяем, что попытка была записана
      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith(tgId);
      
      // Проверяем, что попытки НЕ были очищены
      expect(mockRateLimiter.clearAttempts).not.toHaveBeenCalled();
    });

    it('должен блокировать аутентификацию при превышении rate limit', async () => {
      const tgId = 123456789;
      const password = 'SomePassword123';

      // Rate limit превышен
      vi.mocked(mockRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: false,
        attemptsCount: 5,
        blockedUntil: new Date(Date.now() + 15 * 60 * 1000),
      });
      vi.mocked(mockRateLimiter.getRemainingAttempts).mockResolvedValue(0);

      // Выполняем аутентификацию
      const result = await authService.authenticate(tgId, password);

      // Проверяем блокировку
      expect(result.success).toBe(false);
      expect(result.error).toBe('Слишком много попыток входа. Попробуйте позже.');
      expect(result.remainingAttempts).toBe(0);

      // Проверяем, что БД НЕ была затронута
      expect(mockAdminRepo.getByTgId).not.toHaveBeenCalled();
      expect(mockPasswordHasher.verifyPassword).not.toHaveBeenCalled();
    });

    it('должен отклонять аутентификацию для несуществующего администратора', async () => {
      const tgId = 999999999;
      const password = 'SomePassword123';

      // Настраиваем mock ответы
      vi.mocked(mockRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: true,
        attemptsCount: 0,
        blockedUntil: null,
      });
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(null); // Администратор не найден

      // Выполняем аутентификацию
      const result = await authService.authenticate(tgId, password);

      // Проверяем отказ с единообразным сообщением
      expect(result.success).toBe(false);
      expect(result.error).toBe('Некорректные учётные данные');

      // Проверяем, что попытка была записана
      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith(tgId);
    });

    it('должен отклонять аутентификацию для администратора без пароля', async () => {
      const tgId = 123456789;
      const password = 'SomePassword123';

      // Администратор без пароля (первый вход)
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role: 2,
        passwordHash: null, // Пароль не установлен
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: true,
        attemptsCount: 0,
        blockedUntil: null,
      });
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);

      // Выполняем аутентификацию
      const result = await authService.authenticate(tgId, password);

      // Проверяем отказ с единообразным сообщением
      expect(result.success).toBe(false);
      expect(result.error).toBe('Некорректные учётные данные');

      // Проверяем, что попытка была записана
      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith(tgId);
      
      // Проверяем, что верификация пароля НЕ была вызвана
      expect(mockPasswordHasher.verifyPassword).not.toHaveBeenCalled();
    });

    it('должен отклонять аутентификацию с пустым паролем', async () => {
      const tgId = 123456789;

      // Тестируем пустые пароли
      const result1 = await authService.authenticate(tgId, '');
      const result2 = await authService.authenticate(tgId, '   ');

      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Некорректные учётные данные');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Некорректные учётные данные');

      // Проверяем, что БД не была затронута
      expect(mockRateLimiter.checkRateLimit).not.toHaveBeenCalled();
    });

    it('должен отклонять аутентификацию с невалидным tgId', async () => {
      const password = 'SomePassword123';

      // Тестируем невалидные tgId
      const result1 = await authService.authenticate(0, password);
      const result2 = await authService.authenticate(-1, password);

      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Некорректные учётные данные');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Некорректные учётные данные');
    });
  });

  describe('Проверка первого входа', () => {
    it('должен возвращать true для администратора без пароля', async () => {
      const tgId = 123456789;

      // Администратор без пароля
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role: 2,
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);

      // Проверяем первый вход
      const isFirst = await authService.isFirstLogin(tgId);

      expect(isFirst).toBe(true);
      expect(mockAdminRepo.getByTgId).toHaveBeenCalledWith(tgId);
    });

    it('должен возвращать false для администратора с паролем', async () => {
      const tgId = 123456789;

      // Администратор с паролем
      const mockAdmin: Administrator = {
        tgId,
        username: 'testuser',
        role: 2,
        passwordHash: '$argon2id$v=19$m=65536,t=2,p=4$...',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);

      // Проверяем первый вход
      const isFirst = await authService.isFirstLogin(tgId);

      expect(isFirst).toBe(false);
    });

    it('должен возвращать false для несуществующего администратора', async () => {
      const tgId = 999999999;

      // Администратор не найден
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(null);

      // Проверяем первый вход
      const isFirst = await authService.isFirstLogin(tgId);

      expect(isFirst).toBe(false);
    });

    it('должен возвращать false при невалидном tgId', async () => {
      // Тестируем невалидные tgId
      const isFirst1 = await authService.isFirstLogin(0);
      const isFirst2 = await authService.isFirstLogin(-1);

      expect(isFirst1).toBe(false);
      expect(isFirst2).toBe(false);

      // Проверяем, что БД не была затронута
      expect(mockAdminRepo.getByTgId).not.toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки БД gracefully', async () => {
      const tgId = 123456789;

      // Симулируем ошибку БД
      vi.mocked(mockAdminRepo.getByTgId).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Проверяем первый вход
      const isFirst = await authService.isFirstLogin(tgId);

      // Должен вернуть false при ошибке
      expect(isFirst).toBe(false);
    });
  });

  describe('Единообразие сообщений об ошибках', () => {
    it('должен возвращать одинаковое сообщение для несуществующего пользователя и неправильного пароля', async () => {
      const password = 'SomePassword123';

      // Случай 1: Несуществующий пользователь
      vi.mocked(mockRateLimiter.checkRateLimit).mockResolvedValue({
        allowed: true,
        attemptsCount: 0,
        blockedUntil: null,
      });
      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(null);

      const result1 = await authService.authenticate(999999999, password);

      // Случай 2: Неправильный пароль
      const mockAdmin: Administrator = {
        tgId: 123456789,
        username: 'testuser',
        role: 2,
        passwordHash: '$argon2id$v=19$m=65536,t=2,p=4$...',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockAdminRepo.getByTgId).mockResolvedValue(mockAdmin);
      vi.mocked(mockPasswordHasher.verifyPassword).mockResolvedValue(false);
      vi.mocked(mockRateLimiter.getRemainingAttempts).mockResolvedValue(3);

      const result2 = await authService.authenticate(123456789, password);

      // Сообщения должны быть идентичными
      expect(result1.error).toBe(result2.error);
      expect(result1.error).toBe('Некорректные учётные данные');
    });
  });
});
