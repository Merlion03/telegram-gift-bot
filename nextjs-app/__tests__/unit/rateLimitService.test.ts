/**
 * Unit-тесты для RateLimitService
 * Проверяет rate limiting, блокировку и очистку попыток
 * 
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimitService } from '@/lib/services/rateLimitService';
import type { AuthAttemptsRepository } from '@/lib/repositories/authAttemptsRepository';
import type { AuthAttempt } from '@/lib/models/authAttempt';

describe('RateLimitService', () => {
  let rateLimitService: RateLimitService;
  let mockAttemptsRepo: AuthAttemptsRepository;

  beforeEach(() => {
    // Создаём mock объект для репозитория
    mockAttemptsRepo = {
      countRecentAttempts: vi.fn(),
      recordAttempt: vi.fn(),
      clearAttempts: vi.fn(),
      getOldestInWindow: vi.fn(),
      cleanupOldAttempts: vi.fn(),
    } as any;

    // Создаём экземпляр сервиса с дефолтной конфигурацией (5 попыток за 15 минут)
    rateLimitService = new RateLimitService(mockAttemptsRepo, {
      maxAttempts: 5,
      windowMinutes: 15,
    });
  });

  describe('Разрешение первых 5 попыток', () => {
    it('должен разрешать первую попытку', async () => {
      const tgId = 123456789;

      // Нет предыдущих попыток
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(0);

      // Проверяем rate limit
      const result = await rateLimitService.checkRateLimit(tgId);

      expect(result.allowed).toBe(true);
      expect(result.attemptsCount).toBe(0);
      expect(result.blockedUntil).toBeNull();
      expect(mockAttemptsRepo.countRecentAttempts).toHaveBeenCalledWith(tgId, 15);
    });

    it('должен разрешать 5-ю попытку', async () => {
      const tgId = 123456789;

      // 4 предыдущие попытки
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(4);

      // Проверяем rate limit
      const result = await rateLimitService.checkRateLimit(tgId);

      expect(result.allowed).toBe(true);
      expect(result.attemptsCount).toBe(4);
      expect(result.blockedUntil).toBeNull();
    });

    it('должен разрешать попытки для разных пользователей независимо', async () => {
      const tgId1 = 111111111;
      const tgId2 = 222222222;

      // Первый пользователь: 4 попытки
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(4);
      
      const result1 = await rateLimitService.checkRateLimit(tgId1);
      expect(result1.allowed).toBe(true);

      // Второй пользователь: 0 попыток
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(0);
      
      const result2 = await rateLimitService.checkRateLimit(tgId2);
      expect(result2.allowed).toBe(true);

      // Проверяем, что вызовы были для разных tgId
      expect(mockAttemptsRepo.countRecentAttempts).toHaveBeenCalledWith(tgId1, 15);
      expect(mockAttemptsRepo.countRecentAttempts).toHaveBeenCalledWith(tgId2, 15);
    });
  });

  describe('Блокировка 6-й попытки', () => {
    it('должен блокировать 6-ю попытку', async () => {
      const tgId = 123456789;
      const oldestAttemptTime = new Date(Date.now() - 10 * 60 * 1000); // 10 минут назад

      // 5 попыток уже есть
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(5);
      
      // Самая старая попытка в окне
      const mockOldestAttempt: AuthAttempt = {
        id: 1,
        tgId,
        timestamp: oldestAttemptTime,
        ipAddress: null,
        success: false,
      };
      
      vi.mocked(mockAttemptsRepo.getOldestInWindow).mockResolvedValue(mockOldestAttempt);

      // Проверяем rate limit
      const result = await rateLimitService.checkRateLimit(tgId);

      expect(result.allowed).toBe(false);
      expect(result.attemptsCount).toBe(5);
      expect(result.blockedUntil).not.toBeNull();

      // Проверяем, что blockedUntil = oldestAttemptTime + 15 минут
      const expectedBlockedUntil = new Date(
        oldestAttemptTime.getTime() + 15 * 60 * 1000
      );
      expect(result.blockedUntil?.getTime()).toBe(expectedBlockedUntil.getTime());
    });

    it('должен блокировать при превышении лимита', async () => {
      const tgId = 123456789;

      // 10 попыток (больше лимита)
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(10);
      
      const mockOldestAttempt: AuthAttempt = {
        id: 1,
        tgId,
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        ipAddress: null,
        success: false,
      };
      
      vi.mocked(mockAttemptsRepo.getOldestInWindow).mockResolvedValue(mockOldestAttempt);

      // Проверяем rate limit
      const result = await rateLimitService.checkRateLimit(tgId);

      expect(result.allowed).toBe(false);
      expect(result.attemptsCount).toBe(10);
    });

    it('должен корректно вычислять время разблокировки', async () => {
      const tgId = 123456789;
      const now = Date.now();
      const oldestAttemptTime = new Date(now - 10 * 60 * 1000); // 10 минут назад

      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(5);
      
      const mockOldestAttempt: AuthAttempt = {
        id: 1,
        tgId,
        timestamp: oldestAttemptTime,
        ipAddress: null,
        success: false,
      };
      
      vi.mocked(mockAttemptsRepo.getOldestInWindow).mockResolvedValue(mockOldestAttempt);

      const result = await rateLimitService.checkRateLimit(tgId);

      // Время разблокировки должно быть через 5 минут (15 - 10)
      const expectedUnblockTime = oldestAttemptTime.getTime() + 15 * 60 * 1000;
      const actualUnblockTime = result.blockedUntil?.getTime() ?? 0;

      // Допускаем погрешность в 1 секунду
      expect(Math.abs(actualUnblockTime - expectedUnblockTime)).toBeLessThan(1000);
    });
  });

  describe('Запись неудачных попыток', () => {
    it('должен записывать неудачную попытку', async () => {
      const tgId = 123456789;
      const ipAddress = '192.168.1.1';

      vi.mocked(mockAttemptsRepo.recordAttempt).mockResolvedValue(undefined);

      // Записываем попытку
      await rateLimitService.recordFailedAttempt(tgId, ipAddress);

      // Проверяем, что метод был вызван с правильными параметрами
      expect(mockAttemptsRepo.recordAttempt).toHaveBeenCalledWith(
        tgId,
        ipAddress,
        false
      );
    });

    it('должен записывать попытку без IP адреса', async () => {
      const tgId = 123456789;

      vi.mocked(mockAttemptsRepo.recordAttempt).mockResolvedValue(undefined);

      // Записываем попытку без IP
      await rateLimitService.recordFailedAttempt(tgId);

      // Проверяем, что метод был вызван с null для IP
      expect(mockAttemptsRepo.recordAttempt).toHaveBeenCalledWith(
        tgId,
        null,
        false
      );
    });

    it('должен выбрасывать ошибку при невалидном tgId', async () => {
      await expect(rateLimitService.recordFailedAttempt(0)).rejects.toThrow(
        'tgId must be >= 1'
      );
      await expect(rateLimitService.recordFailedAttempt(-1)).rejects.toThrow(
        'tgId must be >= 1'
      );
    });

    it('должен пробрасывать ошибки репозитория', async () => {
      const tgId = 123456789;

      // Симулируем ошибку БД
      vi.mocked(mockAttemptsRepo.recordAttempt).mockRejectedValue(
        new Error('Database error')
      );

      // Проверяем, что ошибка пробрасывается
      await expect(rateLimitService.recordFailedAttempt(tgId)).rejects.toThrow(
        'Failed to record failed attempt'
      );
    });
  });

  describe('Очистка попыток', () => {
    it('должен очищать все попытки для пользователя', async () => {
      const tgId = 123456789;

      vi.mocked(mockAttemptsRepo.clearAttempts).mockResolvedValue(undefined);

      // Очищаем попытки
      await rateLimitService.clearAttempts(tgId);

      // Проверяем, что метод был вызван
      expect(mockAttemptsRepo.clearAttempts).toHaveBeenCalledWith(tgId);
    });

    it('должен разрешать попытки после очистки', async () => {
      const tgId = 123456789;

      // Сначала 5 попыток (блокировка)
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(5);
      
      const mockOldestAttempt: AuthAttempt = {
        id: 1,
        tgId,
        timestamp: new Date(Date.now() - 10 * 60 * 1000),
        ipAddress: null,
        success: false,
      };
      
      vi.mocked(mockAttemptsRepo.getOldestInWindow).mockResolvedValue(mockOldestAttempt);

      const resultBefore = await rateLimitService.checkRateLimit(tgId);
      expect(resultBefore.allowed).toBe(false);

      // Очищаем попытки
      vi.mocked(mockAttemptsRepo.clearAttempts).mockResolvedValue(undefined);
      await rateLimitService.clearAttempts(tgId);

      // После очистки 0 попыток
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(0);

      const resultAfter = await rateLimitService.checkRateLimit(tgId);
      expect(resultAfter.allowed).toBe(true);
      expect(resultAfter.attemptsCount).toBe(0);
    });

    it('должен выбрасывать ошибку при невалидном tgId', async () => {
      await expect(rateLimitService.clearAttempts(0)).rejects.toThrow(
        'tgId must be >= 1'
      );
      await expect(rateLimitService.clearAttempts(-1)).rejects.toThrow(
        'tgId must be >= 1'
      );
    });
  });

  describe('Получение оставшихся попыток', () => {
    it('должен возвращать 5 при отсутствии попыток', async () => {
      const tgId = 123456789;

      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(0);

      const remaining = await rateLimitService.getRemainingAttempts(tgId);

      expect(remaining).toBe(5);
    });

    it('должен возвращать 2 после 3 попыток', async () => {
      const tgId = 123456789;

      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(3);

      const remaining = await rateLimitService.getRemainingAttempts(tgId);

      expect(remaining).toBe(2);
    });

    it('должен возвращать 0 при превышении лимита', async () => {
      const tgId = 123456789;

      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(5);

      const remaining = await rateLimitService.getRemainingAttempts(tgId);

      expect(remaining).toBe(0);
    });

    it('должен возвращать 0 при значительном превышении лимита', async () => {
      const tgId = 123456789;

      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(10);

      const remaining = await rateLimitService.getRemainingAttempts(tgId);

      expect(remaining).toBe(0);
    });
  });

  describe('Изоляция между пользователями', () => {
    it('должен изолировать попытки разных пользователей', async () => {
      const tgId1 = 111111111;
      const tgId2 = 222222222;

      // Первый пользователь: 5 попыток (заблокирован)
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(5);
      
      const mockOldestAttempt: AuthAttempt = {
        id: 1,
        tgId: tgId1,
        timestamp: new Date(Date.now() - 10 * 60 * 1000),
        ipAddress: null,
        success: false,
      };
      
      vi.mocked(mockAttemptsRepo.getOldestInWindow).mockResolvedValue(mockOldestAttempt);

      const result1 = await rateLimitService.checkRateLimit(tgId1);
      expect(result1.allowed).toBe(false);

      // Второй пользователь: 0 попыток (разрешено)
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(0);

      const result2 = await rateLimitService.checkRateLimit(tgId2);
      expect(result2.allowed).toBe(true);

      // Проверяем, что запросы были для разных пользователей
      expect(mockAttemptsRepo.countRecentAttempts).toHaveBeenCalledWith(tgId1, 15);
      expect(mockAttemptsRepo.countRecentAttempts).toHaveBeenCalledWith(tgId2, 15);
    });
  });

  describe('Конфигурация сервиса', () => {
    it('должен использовать кастомный лимит попыток', async () => {
      const tgId = 123456789;
      
      // Создаём сервис с лимитом 3 попытки
      const customService = new RateLimitService(mockAttemptsRepo, {
        maxAttempts: 3,
        windowMinutes: 15,
      });

      // 2 попытки - разрешено
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(2);
      const result1 = await customService.checkRateLimit(tgId);
      expect(result1.allowed).toBe(true);

      // 3 попытки - блокировка
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValueOnce(3);
      
      const mockOldestAttempt: AuthAttempt = {
        id: 1,
        tgId,
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        ipAddress: null,
        success: false,
      };
      
      vi.mocked(mockAttemptsRepo.getOldestInWindow).mockResolvedValue(mockOldestAttempt);

      const result2 = await customService.checkRateLimit(tgId);
      expect(result2.allowed).toBe(false);
    });

    it('должен использовать кастомное временное окно', async () => {
      const tgId = 123456789;
      const customWindowMinutes = 30;
      
      // Создаём сервис с окном 30 минут
      const customService = new RateLimitService(mockAttemptsRepo, {
        maxAttempts: 5,
        windowMinutes: customWindowMinutes,
      });

      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockResolvedValue(0);

      await customService.checkRateLimit(tgId);

      // Проверяем, что использовалось правильное окно
      expect(mockAttemptsRepo.countRecentAttempts).toHaveBeenCalledWith(
        tgId,
        customWindowMinutes
      );
    });

    it('должен выбрасывать ошибку при невалидном maxAttempts', () => {
      expect(() => {
        new RateLimitService(mockAttemptsRepo, {
          maxAttempts: 0,
          windowMinutes: 15,
        });
      }).toThrow('maxAttempts must be >= 1');

      expect(() => {
        new RateLimitService(mockAttemptsRepo, {
          maxAttempts: -1,
          windowMinutes: 15,
        });
      }).toThrow('maxAttempts must be >= 1');
    });

    it('должен выбрасывать ошибку при невалидном windowMinutes', () => {
      expect(() => {
        new RateLimitService(mockAttemptsRepo, {
          maxAttempts: 5,
          windowMinutes: 0,
        });
      }).toThrow('windowMinutes must be >= 1');

      expect(() => {
        new RateLimitService(mockAttemptsRepo, {
          maxAttempts: 5,
          windowMinutes: -1,
        });
      }).toThrow('windowMinutes must be >= 1');
    });
  });

  describe('Валидация входных данных', () => {
    it('должен выбрасывать ошибку при невалидном tgId в checkRateLimit', async () => {
      await expect(rateLimitService.checkRateLimit(0)).rejects.toThrow(
        'tgId must be >= 1'
      );
      await expect(rateLimitService.checkRateLimit(-1)).rejects.toThrow(
        'tgId must be >= 1'
      );
    });

    it('должен выбрасывать ошибку при невалидном tgId в clearAttempts', async () => {
      await expect(rateLimitService.clearAttempts(0)).rejects.toThrow(
        'tgId must be >= 1'
      );
      await expect(rateLimitService.clearAttempts(-1)).rejects.toThrow(
        'tgId must be >= 1'
      );
    });

    it('должен выбрасывать ошибку при невалидном tgId в getRemainingAttempts', async () => {
      await expect(rateLimitService.getRemainingAttempts(0)).rejects.toThrow(
        'tgId must be >= 1'
      );
      await expect(rateLimitService.getRemainingAttempts(-1)).rejects.toThrow(
        'tgId must be >= 1'
      );
    });
  });

  describe('Обработка ошибок', () => {
    it('должен пробрасывать ошибки при проверке rate limit', async () => {
      const tgId = 123456789;

      // Симулируем ошибку БД
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Проверяем, что ошибка пробрасывается
      await expect(rateLimitService.checkRateLimit(tgId)).rejects.toThrow(
        'Failed to check rate limit'
      );
    });

    it('должен пробрасывать ошибки при очистке попыток', async () => {
      const tgId = 123456789;

      // Симулируем ошибку БД
      vi.mocked(mockAttemptsRepo.clearAttempts).mockRejectedValue(
        new Error('Database error')
      );

      // Проверяем, что ошибка пробрасывается
      await expect(rateLimitService.clearAttempts(tgId)).rejects.toThrow(
        'Failed to clear attempts'
      );
    });

    it('должен пробрасывать ошибки при получении оставшихся попыток', async () => {
      const tgId = 123456789;

      // Симулируем ошибку БД
      vi.mocked(mockAttemptsRepo.countRecentAttempts).mockRejectedValue(
        new Error('Database error')
      );

      // Проверяем, что ошибка пробрасывается
      await expect(rateLimitService.getRemainingAttempts(tgId)).rejects.toThrow(
        'Failed to get remaining attempts'
      );
    });
  });
});
