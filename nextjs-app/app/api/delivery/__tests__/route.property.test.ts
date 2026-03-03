/**
 * Property-based тесты для API route /api/delivery
 * 
 * Проверяют:
 * - Property 5: Передача InitData при открытии WebApp
 * - Property 6: Валидация обязательных полей формы
 * - Property 8: Round-trip сохранения данных доставки
 * 
 * Validates: Requirements 3.4, 4.1, 4.2, 4.5, 10.1
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fc } from '@fast-check/vitest';
import crypto from 'crypto';
import { POST } from '../route';
import { NextRequest } from 'next/server';

// Моки для зависимостей
vi.mock('@/lib/telegram/initDataValidator');
vi.mock('@/lib/google/sheetsClient');

import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { GoogleSheetsClient } from '@/lib/google/sheetsClient';

describe('Delivery API Route - Property-Based Tests', () => {
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

    // Сброс всех моков
    vi.clearAllMocks();
    vi.resetAllMocks();
    
    // Настройка дефолтных моков для классов
    vi.mocked(InitDataValidator).mockImplementation((function(this: any, botToken: string) {
      this.validate = vi.fn().mockReturnValue(true);
      this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
    } as any) as any);
    
    vi.mocked(GoogleSheetsClient).mockImplementation((function(this: any) {
      this.saveDeliveryData = vi.fn().mockResolvedValue(true);
      this.healthCheck = vi.fn().mockResolvedValue(true);
    } as any) as any);
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

  describe('Property 5: Передача InitData при открытии WebApp', () => {
    /**
     * Property: Запрос без InitData всегда отклоняется с ошибкой валидации
     * 
     * Validates: Requirements 3.4, 10.1
     */
    it('должен отклонять запросы без InitData', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // full_name
          fc.string({ minLength: 10, maxLength: 100 }), // address
          fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '')), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (fullName, address, phone, prizeId) => {
            const requestBody = {
              full_name: fullName,
              address: address,
              phone: phone,
              prize_id: prizeId,
              // initData отсутствует
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            // Должен вернуть ошибку валидации
            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details).toBeDefined();
            expect(data.details.some((d: any) => d.field === 'initData')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос с пустым InitData отклоняется
     * 
     * Validates: Requirements 3.4, 10.1
     */
    it('должен отклонять запросы с пустым InitData', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // full_name
          fc.string({ minLength: 10, maxLength: 100 }), // address
          fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '')), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (fullName, address, phone, prizeId) => {
            const requestBody = {
              full_name: fullName,
              address: address,
              phone: phone,
              prize_id: prizeId,
              initData: '', // Пустой InitData
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            // Должен вернуть ошибку валидации
            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос с валидным InitData проходит проверку InitData
     * 
     * Validates: Requirements 3.4, 10.1
     */
    it('должен принимать запросы с валидным InitData', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // last_name
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // first_name
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // city
          fc.string({ minLength: 2, maxLength: 200 }).map(s => s.trim()).filter(s => s.length >= 2), // street
          fc.string({ minLength: 1, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 1), // house
          fc.integer({ min: 1000000000, max: 9999999999 }).map(n => '+' + n.toString()), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          fc.integer({ min: 1, max: 999999 }), // user_id
          async (lastName, firstName, city, street, house, phone, prizeId, userId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;
            const initData = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              city: city,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);

            // Должен успешно обработать запрос (не 403)
            expect(response.status).not.toBe(403);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });
  });

  describe('Property 6: Валидация обязательных полей формы', () => {
    /**
     * Property: Запрос без обязательного поля full_name отклоняется
     * 
     * Validates: Requirements 4.1, 4.2
     */
    it('должен отклонять запросы без last_name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // first_name
          fc.string({ minLength: 2, maxLength: 100 }), // city
          fc.string({ minLength: 2, maxLength: 200 }), // street
          fc.string({ minLength: 1, maxLength: 20 }), // house
          fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '')), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (firstName, city, street, house, phone, prizeId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

            const requestBody = {
              // last_name отсутствует
              first_name: firstName,
              city: city,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details.some((d: any) => d.field === 'last_name')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос без обязательного поля city отклоняется
     * 
     * Validates: Requirements 4.1, 4.2
     */
    it('должен отклонять запросы без city', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // last_name
          fc.string({ minLength: 2, maxLength: 50 }), // first_name
          fc.string({ minLength: 2, maxLength: 200 }), // street
          fc.string({ minLength: 1, maxLength: 20 }), // house
          fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '')), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (lastName, firstName, street, house, phone, prizeId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              // city отсутствует
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details.some((d: any) => d.field === 'city')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос без обязательного поля phone отклоняется
     * 
     * Validates: Requirements 4.1, 4.2
     */
    it('должен отклонять запросы без phone', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // last_name
          fc.string({ minLength: 2, maxLength: 50 }), // first_name
          fc.string({ minLength: 2, maxLength: 100 }), // city
          fc.string({ minLength: 2, maxLength: 200 }), // street
          fc.string({ minLength: 1, maxLength: 20 }), // house
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (lastName, firstName, city, street, house, prizeId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              city: city,
              street: street,
              house: house,
              // phone отсутствует
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details.some((d: any) => d.field === 'phone')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос с невалидным форматом phone отклоняется
     * 
     * Validates: Requirements 4.1, 4.2
     */
    it('должен отклонять запросы с невалидным форматом телефона', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // full_name
          fc.string({ minLength: 10, maxLength: 100 }), // address
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/^\+?[0-9]{10,15}$/.test(s)), // invalid phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (fullName, address, invalidPhone, prizeId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

            const requestBody = {
              full_name: fullName,
              address: address,
              phone: invalidPhone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details.some((d: any) => d.field === 'phone')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос с слишком коротким last_name отклоняется
     * 
     * Validates: Requirements 4.1, 4.2
     */
    it('должен отклонять запросы с слишком коротким last_name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1 }), // too short last_name
          fc.string({ minLength: 2, maxLength: 50 }), // first_name
          fc.string({ minLength: 2, maxLength: 100 }), // city
          fc.string({ minLength: 2, maxLength: 200 }), // street
          fc.string({ minLength: 1, maxLength: 20 }), // house
          fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '')), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (shortName, firstName, city, street, house, phone, prizeId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: shortName,
              first_name: firstName,
              city: city,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details.some((d: any) => d.field === 'last_name')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Запрос с слишком коротким city отклоняется
     * 
     * Validates: Requirements 4.1, 4.2
     */
    it('должен отклонять запросы с слишком коротким city', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }), // last_name
          fc.string({ minLength: 2, maxLength: 50 }), // first_name
          fc.string({ minLength: 0, maxLength: 1 }), // too short city
          fc.string({ minLength: 2, maxLength: 200 }), // street
          fc.string({ minLength: 1, maxLength: 20 }), // house
          fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '')), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          async (lastName, firstName, shortCity, street, house, phone, prizeId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const initData = createValidInitData(12345, currentTimestamp - 100, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              city: shortCity,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe('Validation error');
            expect(data.details.some((d: any) => d.field === 'city')).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Поле comment опционально и может отсутствовать
     * 
     * Validates: Requirements 4.1
     */
    it('должен принимать запросы без опционального поля comment', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // last_name
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // first_name
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // city
          fc.string({ minLength: 2, maxLength: 200 }).map(s => s.trim()).filter(s => s.length >= 2), // street
          fc.string({ minLength: 1, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 1), // house
          fc.integer({ min: 1000000000, max: 9999999999 }).map(n => '+' + n.toString()), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          fc.integer({ min: 1, max: 999999 }), // user_id
          async (lastName, firstName, city, street, house, phone, prizeId, userId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;
            const initData = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              city: city,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
              // comment отсутствует
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);

            // Не должен вернуть ошибку валидации для comment
            if (response.status === 400) {
              const data = await response.json();
              expect(data.details?.some((d: any) => d.field === 'comment')).toBe(false);
            }
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });
  });

  describe('Property 8: Round-trip сохранения данных доставки', () => {
    /**
     * Property: Данные, отправленные в API, корректно передаются в GoogleSheetsClient
     * 
     * Validates: Requirements 4.5
     */
    it('должен корректно передавать данные в GoogleSheetsClient', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // last_name
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // first_name
          fc.option(fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), { nil: undefined }), // patronymic
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // country
          fc.string({ minLength: 3, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 3), // postal_code
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // city
          fc.string({ minLength: 2, maxLength: 200 }).map(s => s.trim()).filter(s => s.length >= 2), // street
          fc.string({ minLength: 1, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 1), // house
          fc.option(fc.string({ minLength: 1, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 1), { nil: undefined }), // apartment
          fc.integer({ min: 1000000000, max: 9999999999 }).map(n => '+' + n.toString()), // phone
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }), // comment
          fc.integer({ min: 1, max: 100 }), // prize_id
          fc.integer({ min: 1, max: 999999 }), // user_id
          async (lastName, firstName, patronymic, country, postalCode, city, street, house, apartment, phone, comment, prizeId, userId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;
            const initData = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              ...(patronymic && { patronymic }),
              country: country,
              postal_code: postalCode,
              city: city,
              street: street,
              house: house,
              ...(apartment && { apartment }),
              phone: phone,
              ...(comment && { comment }),
              prize_id: prizeId,
              initData: initData,
            };

            // Создание spy для saveDeliveryData
            const saveDeliveryDataSpy = vi.fn().mockResolvedValue(true);
            const extractUserDataSpy = vi.fn().mockReturnValue({ id: userId });

            // Переопределение моков для этого теста
            vi.mocked(InitDataValidator).mockImplementation((function(this: any) {
              this.validate = vi.fn().mockReturnValue(true);
              this.extractUserData = extractUserDataSpy;
            } as any) as any);

            vi.mocked(GoogleSheetsClient).mockImplementation((function(this: any) {
              this.saveDeliveryData = saveDeliveryDataSpy;
              this.healthCheck = vi.fn().mockResolvedValue(true);
            } as any) as any);

            const request = createMockRequest(requestBody);
            const response = await POST(request);

            // Проверка, что saveDeliveryData был вызван с санитизированными параметрами
            expect(saveDeliveryDataSpy).toHaveBeenCalledWith(
              prizeId,
              expect.objectContaining({
                telegram_id: userId,
              })
            );

            // Проверка успешного ответа
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: При успешном сохранении API возвращает success: true
     * 
     * Validates: Requirements 4.5
     */
    it('должен возвращать success при успешном сохранении', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // last_name
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // first_name
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // country
          fc.string({ minLength: 3, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 3), // postal_code
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // city
          fc.string({ minLength: 2, maxLength: 200 }).map(s => s.trim()).filter(s => s.length >= 2), // street
          fc.string({ minLength: 1, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 1), // house
          fc.integer({ min: 1000000000, max: 9999999999 }).map(n => '+' + n.toString()), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          fc.integer({ min: 1, max: 999999 }), // user_id
          async (lastName, firstName, country, postalCode, city, street, house, phone, prizeId, userId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;
            const initData = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              country: country,
              postal_code: postalCode,
              city: city,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const request = createMockRequest(requestBody);
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.message).toBeDefined();
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });

    /**
     * Property: Telegram ID из InitData корректно передаётся в данные доставки
     * 
     * Validates: Requirements 4.5, 10.1
     */
    it('должен корректно извлекать и передавать telegram_id', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // last_name
          fc.string({ minLength: 2, maxLength: 50 }).map(s => s.trim()).filter(s => s.length >= 2), // first_name
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // country
          fc.string({ minLength: 3, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 3), // postal_code
          fc.string({ minLength: 2, maxLength: 100 }).map(s => s.trim()).filter(s => s.length >= 2), // city
          fc.string({ minLength: 2, maxLength: 200 }).map(s => s.trim()).filter(s => s.length >= 2), // street
          fc.string({ minLength: 1, maxLength: 20 }).map(s => s.trim()).filter(s => s.length >= 1), // house
          fc.integer({ min: 1000000000, max: 9999999999 }).map(n => '+' + n.toString()), // phone
          fc.integer({ min: 1, max: 100 }), // prize_id
          fc.integer({ min: 1, max: 999999 }), // user_id
          async (lastName, firstName, country, postalCode, city, street, house, phone, prizeId, userId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;
            const initData = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            const requestBody = {
              last_name: lastName,
              first_name: firstName,
              country: country,
              postal_code: postalCode,
              city: city,
              street: street,
              house: house,
              phone: phone,
              prize_id: prizeId,
              initData: initData,
            };

            const saveDeliveryDataSpy = vi.fn().mockResolvedValue(true);
            const extractUserDataSpy = vi.fn().mockReturnValue({ id: userId });

            // Переопределение моков для этого теста
            vi.mocked(InitDataValidator).mockImplementation((function(this: any) {
              this.validate = vi.fn().mockReturnValue(true);
              this.extractUserData = extractUserDataSpy;
            } as any) as any);

            vi.mocked(GoogleSheetsClient).mockImplementation((function(this: any) {
              this.saveDeliveryData = saveDeliveryDataSpy;
              this.healthCheck = vi.fn().mockResolvedValue(true);
            } as any) as any);

            const request = createMockRequest(requestBody);
            await POST(request);

            // Проверка, что telegram_id соответствует userId из InitData
            expect(saveDeliveryDataSpy).toHaveBeenCalledWith(
              prizeId,
              expect.objectContaining({
                telegram_id: userId,
              })
            );
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });
  });
});

