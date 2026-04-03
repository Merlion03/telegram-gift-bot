/**
 * Property-Based тесты для Delivery API
 * 
 * Property 6: Валидация длины строковых полей
 * 
 * Validates: Requirements 9.1, 9.2
 */

import { describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { NextRequest } from 'next/server';

// Моки модулей - ДОЛЖНЫ быть ДО импортов
vi.mock('@/lib/telegram/initDataValidator');
vi.mock('@/lib/api/prizeClient');

// Импорты после моков
import { POST } from '../route';
import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { PrizeClient } from '@/lib/api/prizeClient';

// Генераторы для property-based тестов
const validSheetNameArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(name => {
    const forbidden = ['[', ']', '*', '/', '\\', '?', ':'];
    return !forbidden.some(char => name.includes(char)) && name.trim().length > 0;
  });

const prizeIdArbitrary = fc.integer({ min: 1, max: 10000 });

const rowIdArbitrary = fc.integer({ min: 1, max: 10000 });

const telegramIdArbitrary = fc.integer({ min: 1, max: 999999999 });

// Генератор валидных строк (не только пробелы)
// ВАЖНО: генерируем строки только из букв и цифр, чтобы гарантировать прохождение валидации
const validStringArbitrary = (minLength: number, maxLength: number) =>
  fc
    .stringMatching(/^[a-zA-Z0-9]+$/)
    .filter(s => s.length >= minLength && s.length <= maxLength);

// Генератор валидного телефона
const validPhoneArbitrary = fc.string({ minLength: 10, maxLength: 15 })
  .map(s => '+' + s.replace(/\D/g, '').padEnd(10, '0').slice(0, 15));

const validDeliveryDataArbitrary = fc.record({
  last_name: validStringArbitrary(2, 50),
  first_name: validStringArbitrary(2, 50),
  patronymic: fc.option(validStringArbitrary(2, 50), { nil: '' }),
  country: validStringArbitrary(2, 100),
  postal_code: validStringArbitrary(3, 20),
  city: validStringArbitrary(2, 100),
  street: validStringArbitrary(2, 200),
  house: validStringArbitrary(1, 20),
  apartment: fc.option(validStringArbitrary(1, 20), { nil: '' }),
  phone: validPhoneArbitrary,
  comment: fc.option(fc.string({ maxLength: 500 })),
});

describe('Delivery API - Property Tests', () => {
  // Mock fetch глобально
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    // Настройка переменных окружения
    process.env.BOT_TOKEN = 'test-bot-token';
    process.env.BACKEND_API_URL = 'http://localhost:8000';

    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 6: Валидация длины строковых полей
   * 
   * Validates: Requirements 9.1, 9.2
   */
  test.prop([
    fc.string({ minLength: 0, maxLength: 1 }), // Короткая country (< 2)
    validStringArbitrary(3, 20), // Валидный postal_code
    validDeliveryDataArbitrary,
  ], { numRuns: 100 })(
    'Property 6: должен отклонять country короче 2 символов',
    async (shortCountry, postalCode, deliveryData) => {
      // Arrange - настройка моков
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);
      
      const requestBody = {
        ...deliveryData,
        country: shortCountry,
        postal_code: postalCode,
        prize_id: 1,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Validation error');
      expect(responseData.details.some((d: any) => 
        d.field === 'country' && d.message.includes('минимум 2')
      )).toBe(true);
    }
  );

  test.prop([
    fc.string({ minLength: 101, maxLength: 150 }), // Длинная country (> 100)
    validStringArbitrary(3, 20), // Валидный postal_code
    validDeliveryDataArbitrary,
  ], { numRuns: 100 })(
    'Property 6: должен отклонять country длиннее 100 символов',
    async (longCountry, postalCode, deliveryData) => {
      // Arrange - настройка моков
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);
      
      const requestBody = {
        ...deliveryData,
        country: longCountry,
        postal_code: postalCode,
        prize_id: 1,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Validation error');
      expect(responseData.details.some((d: any) => 
        d.field === 'country' && d.message.includes('100')
      )).toBe(true);
    }
  );

  test.prop([
    validStringArbitrary(2, 100), // Валидная country
    fc.string({ minLength: 0, maxLength: 2 }), // Короткий postal_code (< 3)
    validDeliveryDataArbitrary,
  ], { numRuns: 100 })(
    'Property 6: должен отклонять postal_code короче 3 символов',
    async (country, shortPostalCode, deliveryData) => {
      // Arrange - настройка моков
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);
      
      const requestBody = {
        ...deliveryData,
        country: country,
        postal_code: shortPostalCode,
        prize_id: 1,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Validation error');
      expect(responseData.details.some((d: any) => 
        d.field === 'postal_code' && d.message.includes('минимум 3')
      )).toBe(true);
    }
  );

  test.prop([
    validStringArbitrary(2, 100), // Валидная country
    fc.string({ minLength: 21, maxLength: 50 }), // Длинный postal_code (> 20)
    validDeliveryDataArbitrary,
  ], { numRuns: 100 })(
    'Property 6: должен отклонять postal_code длиннее 20 символов',
    async (country, longPostalCode, deliveryData) => {
      // Arrange - настройка моков
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);
      
      const requestBody = {
        ...deliveryData,
        country: country,
        postal_code: longPostalCode,
        prize_id: 1,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Validation error');
      expect(responseData.details.some((d: any) => 
        d.field === 'postal_code' && d.message.includes('20')
      )).toBe(true);
    }
  );

  test.prop([
    validStringArbitrary(2, 100), // Валидная country
    validStringArbitrary(3, 20), // Валидный postal_code
    validDeliveryDataArbitrary,
  ], { numRuns: 100 })(
    'Property 6: должен принимать валидные country и postal_code',
    async (country, postalCode, deliveryData) => {
      // Arrange - настройка моков
      vi.mocked(InitDataValidator).mockImplementation(function(this: any) {
        this.validate = vi.fn();
        this.extractUserData = vi.fn().mockReturnValue({ id: 12345 });
        return this;
      } as any);
      
      vi.mocked(PrizeClient).mockImplementation(function(this: any) {
        this.getPrizeInfo = vi.fn().mockResolvedValue({
          sheet_name: 'Sheet1',
          row_id: 10,
          code_word: 'TEST123',
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

      const requestBody = {
        ...deliveryData,
        country: country,
        postal_code: postalCode,
        prize_id: 1,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
    }
  );
});
