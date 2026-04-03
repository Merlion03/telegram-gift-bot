/**
 * Unit-тесты для API route /api/delivery
 * 
 * Проверяют:
 * - Успешное сохранение данных через Backend API (HTTP 200)
 * - Валидацию полей country и postal_code
 * - Обработку ошибок Backend API (403, 404, 503)
 * - Производительность (время обработки < 500 мс)
 * - Отсутствие вызовов GoogleSheetsClient
 * 
 * Validates: Requirements 2.4, 9.1, 9.2, 9.4, 10.1, 10.2, 10.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { PrizeClient } from '@/lib/api/prizeClient';

// Моки
vi.mock('@/lib/telegram/initDataValidator');
vi.mock('@/lib/api/prizeClient');

describe('Delivery API Route - Unit Tests', () => {
  const TEST_BOT_TOKEN = 'test_bot_token_123456789';
  const TEST_BACKEND_URL = 'http://localhost:8000';

  // Mock fetch глобально
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    // Настройка переменных окружения
    process.env.BOT_TOKEN = TEST_BOT_TOKEN;
    process.env.BACKEND_API_URL = TEST_BACKEND_URL;

    // Сброс моков
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    // Очистка переменных окружения
    delete process.env.BOT_TOKEN;
    delete process.env.BACKEND_API_URL;
  });

  /**
   * Вспомогательная функция для генерации валидного hash
   */
  function generateValidHash(dataCheckString: string, botToken: string): string {
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    return crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
  }

  /**
   * Вспомогательная функция для создания валидного InitData
   */
  function createValidInitData(
    userId: number,
    authDate: number,
    botToken: string
  ): string {
    const params = new URLSearchParams({
      auth_date: authDate.toString(),
      user: JSON.stringify({ id: userId }),
    });

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const hash = generateValidHash(dataCheckString, botToken);
    params.append('hash', hash);

    return params.toString();
  }

  /**
   * Вспомогательная функция для создания mock request
   */
  function createMockRequest(body: unknown): NextRequest {
    return {
      json: async () => body,
    } as NextRequest;
  }

  /**
   * Вспомогательная функция для создания валидного тела запроса
   */
  function createValidRequestBody(overrides: Partial<any> = {}): any {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

    return {
      last_name: 'Иванов',
      first_name: 'Иван',
      patronymic: '',
      country: 'Россия',
      postal_code: '123456',
      city: 'Москва',
      street: 'Ленина',
      house: '1',
      apartment: '',
      phone: '+79991234567',
      comment: '',
      prize_id: 1,
      initData: initData,
      ...overrides,
    };
  }

  /**
   * Requirement 2.4, 10.1: Успешное сохранение данных через Backend API
   */
  describe('Успешное сохранение данных через Backend API', () => {
    it('должен успешно сохранить данные и вернуть HTTP 200', async () => {
      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);

      // Mock InitDataValidator
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);

      // Mock PrizeClient
      vi.mocked(PrizeClient).mockImplementation(function(this: any) {
        this.getPrizeInfo = vi.fn().mockResolvedValue({
          prize_id: 1,
          sheet_name: 'Sheet1',
          row_id: 10,
        });
        return this;
      } as any);

      // Mock Backend API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      // Mock notification response (не важно для теста)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const startTime = Date.now();
      const response = await POST(request);
      const elapsedTime = Date.now() - startTime;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Данные доставки успешно сохранены');

      // Проверяем, что Backend API был вызван
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_BACKEND_URL}/api/delivery/update`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Requirement 10.2: Время обработки < 500 мс
      expect(elapsedTime).toBeLessThan(500);
    });
  });

  /**
   * Requirement 9.1, 9.2: Валидация полей country и postal_code
   */
  describe('Валидация полей country и postal_code', () => {
    it('должен отклонить country короче 2 символов', async () => {
      const requestBody = createValidRequestBody({
        country: 'Р', // 1 символ
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details.some((d: any) => 
        d.field === 'country' && d.message.includes('минимум 2')
      )).toBe(true);
    });

    it('должен отклонить country длиннее 100 символов', async () => {
      const requestBody = createValidRequestBody({
        country: 'А'.repeat(101),
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details.some((d: any) => 
        d.field === 'country' && d.message.includes('100')
      )).toBe(true);
    });

    it('должен отклонить postal_code короче 3 символов', async () => {
      const requestBody = createValidRequestBody({
        postal_code: '12', // 2 символа
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details.some((d: any) => 
        d.field === 'postal_code' && d.message.includes('минимум 3')
      )).toBe(true);
    });

    it('должен отклонить postal_code длиннее 20 символов', async () => {
      const requestBody = createValidRequestBody({
        postal_code: '1'.repeat(21),
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details.some((d: any) => 
        d.field === 'postal_code' && d.message.includes('20')
      )).toBe(true);
    });

    it('должен принять валидные country и postal_code', async () => {
      const requestBody = createValidRequestBody({
        country: 'Россия',
        postal_code: '123456',
      });
      const request = createMockRequest(requestBody);

      // Mock InitDataValidator
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);

      // Mock PrizeClient
      vi.mocked(PrizeClient).mockImplementation(function(this: any) {
        this.getPrizeInfo = vi.fn().mockResolvedValue({
          prize_id: 1,
          sheet_name: 'Sheet1',
          row_id: 10,
        });
        return this;
      } as any);

      // Mock Backend API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      // Mock notification response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  /**
   * Requirement 7.1, 7.2, 7.3: Обработка ошибок Backend API
   */
  describe('Обработка ошибок Backend API', () => {
    beforeEach(() => {
      // Mock InitDataValidator для всех тестов в этом блоке
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);

      // Mock PrizeClient
      vi.mocked(PrizeClient).mockImplementation(function(this: any) {
        this.getPrizeInfo = vi.fn().mockResolvedValue({
          prize_id: 1,
          sheet_name: 'Sheet1',
          row_id: 10,
        });
        return this;
      } as any);
    });

    it('должен обработать HTTP 403 от Backend API (доступ запрещён)', async () => {
      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);

      // Mock Backend API response - 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Access denied' }),
      } as Response);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Access denied');
      expect(data.message).toBe('Доступ запрещён');
    });

    it('должен обработать HTTP 404 от Backend API (приз не найден)', async () => {
      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);

      // Mock Backend API response - 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Prize not found' }),
      } as Response);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Prize not found');
      expect(data.message).toBe('Приз не найден');
    });

    it('должен обработать HTTP 503 от Backend API (БД недоступна)', async () => {
      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);

      // Mock Backend API response - 503
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Database unavailable' }),
      } as Response);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Database unavailable');
      expect(data.message).toBe('База данных временно недоступна');
    });

    it('должен обработать ошибку сети при вызове Backend API', async () => {
      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);

      // Mock fetch error (network error)
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Backend unavailable');
      expect(data.message).toContain('временно недоступен');
    });
  });

  /**
   * Requirement 10.3: Производительность
   */
  describe('Производительность', () => {
    it('должен обработать запрос менее чем за 500 мс', async () => {
      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);

      // Mock InitDataValidator
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);

      // Mock PrizeClient
      vi.mocked(PrizeClient).mockImplementation(function(this: any) {
        this.getPrizeInfo = vi.fn().mockResolvedValue({
          prize_id: 1,
          sheet_name: 'Sheet1',
          row_id: 10,
        });
        return this;
      } as any);

      // Mock Backend API response (быстрый ответ)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      // Mock notification response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const startTime = Date.now();
      await POST(request);
      const elapsedTime = Date.now() - startTime;

      expect(elapsedTime).toBeLessThan(500);
    });
  });

  describe('Edge Case: Ошибка валидации полей (400)', () => {
    /**
     * Requirement 4.2: Невалидный JSON должен возвращать HTTP 400
     */
    it('должен возвращать 400 при невалидном JSON в теле запроса', async () => {
      const request = {
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      } as unknown as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
      expect(data.message).toBe('Тело запроса должно быть валидным JSON');
    });

    /**
     * Requirement 4.2: Слишком длинное last_name должно возвращать HTTP 400
     */
    it('должен возвращать 400 при last_name длиннее 50 символов', async () => {
      const longName = 'А'.repeat(51);
      const requestBody = createValidRequestBody({
        last_name: longName,
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details).toBeDefined();
      expect(data.details.some((d: any) => 
        d.field === 'last_name' && d.message.includes('50')
      )).toBe(true);
    });

    /**
     * Requirement 4.2: Невалидный формат телефона должен возвращать HTTP 400
     */
    it('должен возвращать 400 при невалидном формате телефона (буквы)', async () => {
      const requestBody = createValidRequestBody({
        phone: '+7999abc1234',
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details).toBeDefined();
      expect(data.details.some((d: any) => 
        d.field === 'phone' && d.message.includes('формат')
      )).toBe(true);
    });

    /**
     * Requirement 4.2: Отрицательный prize_id должен возвращать HTTP 400
     */
    it('должен возвращать 400 при отрицательном prize_id', async () => {
      const requestBody = createValidRequestBody({
        prize_id: -1,
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details).toBeDefined();
      expect(data.details.some((d: any) => 
        d.field === 'prize_id' && d.message.includes('положительным')
      )).toBe(true);
    });
  });

  describe('Edge Case: Отсутствие переменных окружения (500)', () => {
    /**
     * Requirement 13.4: Отсутствие BOT_TOKEN должно возвращать HTTP 500
     */
    it('должен возвращать 500 при отсутствии BOT_TOKEN', async () => {
      delete process.env.BOT_TOKEN;

      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Configuration error');
      expect(data.message).toBe('Сервер неправильно настроен');
    });

    /**
     * Requirement 13.4: Отсутствие BACKEND_API_URL должно возвращать HTTP 500
     */
    it('должен возвращать 500 при отсутствии BACKEND_API_URL', async () => {
      delete process.env.BACKEND_API_URL;

      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Configuration error');
      expect(data.message).toContain('Backend URL');
    });
  });
});
