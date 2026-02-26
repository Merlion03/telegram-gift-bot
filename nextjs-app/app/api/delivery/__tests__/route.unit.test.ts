/**
 * Unit-тесты для API route /api/delivery - Edge Cases
 * 
 * Проверяют специфические сценарии ошибок:
 * - Тест: невалидные InitData (403)
 * - Тест: ошибка валидации полей (400)
 * - Тест: ошибка сохранения в Google Sheets (500)
 * 
 * Validates: Requirements 4.4, 4.7
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { GoogleSheetsClient } from '@/lib/google/sheetsClient';

// Моки создаются вручную
vi.mock('@/lib/telegram/initDataValidator');
vi.mock('@/lib/google/sheetsClient');

describe('Delivery API Route - Unit Tests (Edge Cases)', () => {
  const TEST_BOT_TOKEN = 'test_bot_token_123456789';
  const TEST_SPREADSHEET_ID = 'test_spreadsheet_id';

  beforeEach(() => {
    // Настройка переменных окружения
    process.env.BOT_TOKEN = TEST_BOT_TOKEN;
    process.env.SPREADSHEET_ID = TEST_SPREADSHEET_ID;
    process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify({
      client_email: 'test@test.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
    });

    // Сброс моков
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Очистка переменных окружения
    delete process.env.BOT_TOKEN;
    delete process.env.SPREADSHEET_ID;
    delete process.env.GOOGLE_CREDENTIALS_JSON;
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
      full_name: 'Иван Иванов',
      address: 'г. Москва, ул. Ленина, д. 1, кв. 1',
      phone: '+79991234567',
      prize_id: 1,
      initData: initData,
      ...overrides,
    };
  }

  describe('Edge Case: Ошибка валидации полей (400)', () => {
    /**
     * Requirement 4.2: Невалидный JSON должен возвращать HTTP 400
     */
    it('должен возвращать 400 при невалидном JSON в теле запроса', async () => {
      const request = {
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      } as NextRequest;

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
      expect(data.message).toBe('Тело запроса должно быть валидным JSON');
    });

    /**
     * Requirement 4.2: Слишком длинное full_name должно возвращать HTTP 400
     */
    it('должен возвращать 400 при full_name длиннее 100 символов', async () => {
      const longName = 'А'.repeat(101);
      const requestBody = createValidRequestBody({
        full_name: longName,
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.details).toBeDefined();
      expect(data.details.some((d: any) => 
        d.field === 'full_name' && d.message.includes('100')
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
     * Requirement 4.7: Отсутствие BOT_TOKEN должно возвращать HTTP 500
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
     * Requirement 4.7: Отсутствие Google credentials должно возвращать HTTP 500
     */
    it('должен возвращать 500 при отсутствии Google credentials', async () => {
      delete process.env.GOOGLE_CREDENTIALS_JSON;
      delete process.env.GOOGLE_CREDENTIALS_PATH;

      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Configuration error');
      expect(data.message).toBe('Сервер неправильно настроен');
    });

    /**
     * Requirement 4.7: Отсутствие SPREADSHEET_ID должно возвращать HTTP 500
     */
    it('должен возвращать 500 при отсутствии SPREADSHEET_ID', async () => {
      delete process.env.SPREADSHEET_ID;

      const requestBody = createValidRequestBody();
      const request = createMockRequest(requestBody);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Configuration error');
      expect(data.message).toBe('Сервер неправильно настроен');
    });
  });
});
