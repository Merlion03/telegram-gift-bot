/**
 * Property-Based тесты для Delivery API
 * 
 * Validates: Requirements 2.1, 2.2, 2.5, 6.4, 7.5, 9.2, 9.3, 9.5
 */

import { describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { NextRequest } from 'next/server';

// Моки модулей - ДОЛЖНЫ быть ДО импортов
vi.mock('@/lib/api/prizeClient');
vi.mock('@/lib/google/sheetsClient');
vi.mock('@/lib/telegram/initDataValidator', () => ({
  InitDataValidator: vi.fn().mockImplementation(() => ({
    validate: vi.fn(),
    extractUserData: vi.fn().mockReturnValue({ id: 12345 }),
  })),
}));

// Импорты после моков
import { POST } from '../route';
import { PrizeClient } from '@/lib/api/prizeClient';
import { GoogleSheetsClient } from '@/lib/google/sheetsClient';
import { SheetNotFoundError, SheetAccessDeniedError } from '@/lib/types/sheet';

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
const validStringArbitrary = (minLength: number, maxLength: number) =>
  fc.string({ minLength, maxLength })
    .filter(s => s.trim().length >= minLength);

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
  beforeEach(() => {
    // Настройка переменных окружения
    process.env.BOT_TOKEN = 'test-bot-token';
    process.env.GOOGLE_CREDENTIALS_PATH = '/path/to/credentials.json';
    process.env.SPREADSHEET_ID = 'test-spreadsheet-id';
    process.env.BACKEND_API_URL = 'http://localhost:5000';

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 4:
   * Delivery API получает sheet_name из Backend
   * 
   * Validates: Requirements 2.1, 9.2
   */
  test.prop([prizeIdArbitrary, validSheetNameArbitrary, rowIdArbitrary, validDeliveryDataArbitrary])(
    'Property 4: должен получать sheet_name из Backend для любого валидного prize_id',
    async (prizeId, sheetName, rowId, deliveryData) => {
      // Arrange
      const mockGetPrizeInfo = vi.fn().mockResolvedValue({
        sheet_name: sheetName,
        row_id: rowId,
        code_word: 'TEST123',
      });
      
      vi.mocked(PrizeClient).mockImplementation(() => ({
        getPrizeInfo: mockGetPrizeInfo,
      } as any));

      vi.mocked(GoogleSheetsClient).mockImplementation(() => ({
        saveDeliveryData: vi.fn().mockResolvedValue(true),
      } as any));

      const requestBody = {
        ...deliveryData,
        prize_id: prizeId,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      await POST(request);

      // Assert: PrizeClient.getPrizeInfo должен быть вызван с prize_id
      expect(mockGetPrizeInfo).toHaveBeenCalledWith(prizeId);
    }
  );

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 5:
   * Delivery API передает sheet_name в GoogleSheetsClient
   * 
   * Validates: Requirements 2.2, 9.5
   */
  test.prop([prizeIdArbitrary, validSheetNameArbitrary, rowIdArbitrary, validDeliveryDataArbitrary])(
    'Property 5: должен передавать sheet_name в GoogleSheetsClient.saveDeliveryData',
    async (prizeId, sheetName, rowId, deliveryData) => {
      // Arrange
      vi.mocked(PrizeClient).mockImplementation(() => ({
        getPrizeInfo: vi.fn().mockResolvedValue({
          sheet_name: sheetName,
          row_id: rowId,
          code_word: 'TEST123',
        }),
      } as any));

      const mockSaveDeliveryData = vi.fn().mockResolvedValue(true);
      vi.mocked(GoogleSheetsClient).mockImplementation(() => ({
        saveDeliveryData: mockSaveDeliveryData,
      } as any));

      const requestBody = {
        ...deliveryData,
        prize_id: prizeId,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      await POST(request);

      // Assert: saveDeliveryData должен быть вызван с sheet_name
      expect(mockSaveDeliveryData).toHaveBeenCalled();
      const callArgs = mockSaveDeliveryData.mock.calls[0];
      expect(callArgs[0]).toBe(rowId); // row_id
      expect(callArgs[2]).toBe(sheetName); // sheet_name (третий параметр)
    }
  );

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 6:
   * Delivery API логирует sheet_name
   * 
   * Validates: Requirements 2.5, 7.5
   */
  test.prop([prizeIdArbitrary, validSheetNameArbitrary, rowIdArbitrary, validDeliveryDataArbitrary])(
    'Property 6: должен логировать sheet_name для любого успешного запроса',
    async (prizeId, sheetName, rowId, deliveryData) => {
      // Arrange
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(PrizeClient).mockImplementation(() => ({
        getPrizeInfo: vi.fn().mockResolvedValue({
          sheet_name: sheetName,
          row_id: rowId,
          code_word: 'TEST123',
        }),
      } as any));

      vi.mocked(GoogleSheetsClient).mockImplementation(() => ({
        saveDeliveryData: vi.fn().mockResolvedValue(true),
      } as any));

      const requestBody = {
        ...deliveryData,
        prize_id: prizeId,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      await POST(request);

      // Assert: должен быть лог с sheet_name и prize_id
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Using sheet: ${sheetName} for prize ${prizeId}`)
      );

      consoleLogSpy.mockRestore();
    }
  );

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 16:
   * Delivery API обрабатывает ошибки GoogleSheetsClient
   * 
   * Validates: Requirements 6.4
   */
  test.prop([prizeIdArbitrary, validSheetNameArbitrary, rowIdArbitrary, validDeliveryDataArbitrary])(
    'Property 16: должен обрабатывать SheetNotFoundError и возвращать HTTP 500',
    async (prizeId, sheetName, rowId, deliveryData) => {
      // Arrange
      vi.mocked(PrizeClient).mockImplementation(() => ({
        getPrizeInfo: vi.fn().mockResolvedValue({
          sheet_name: sheetName,
          row_id: rowId,
          code_word: 'TEST123',
        }),
      } as any));

      vi.mocked(GoogleSheetsClient).mockImplementation(() => ({
        saveDeliveryData: vi.fn().mockRejectedValue(new SheetNotFoundError(sheetName)),
      } as any));

      const requestBody = {
        ...deliveryData,
        prize_id: prizeId,
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
      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Sheet not found');
      expect(responseData.message).toBe('Лист не найден в таблице');
    }
  );

  test.prop([prizeIdArbitrary, validSheetNameArbitrary, rowIdArbitrary, validDeliveryDataArbitrary])(
    'Property 16: должен обрабатывать SheetAccessDeniedError и возвращать HTTP 500',
    async (prizeId, sheetName, rowId, deliveryData) => {
      // Arrange
      vi.mocked(PrizeClient).mockImplementation(() => ({
        getPrizeInfo: vi.fn().mockResolvedValue({
          sheet_name: sheetName,
          row_id: rowId,
          code_word: 'TEST123',
        }),
      } as any));

      vi.mocked(GoogleSheetsClient).mockImplementation(() => ({
        saveDeliveryData: vi.fn().mockRejectedValue(new SheetAccessDeniedError(sheetName)),
      } as any));

      const requestBody = {
        ...deliveryData,
        prize_id: prizeId,
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
      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Access denied');
      expect(responseData.message).toBe('Нет доступа к листу');
    }
  );

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 20:
   * Delivery API парсит JSON ответ Backend
   * 
   * Validates: Requirements 9.3
   */
  test.prop([prizeIdArbitrary, validSheetNameArbitrary, rowIdArbitrary, validDeliveryDataArbitrary])(
    'Property 20: должен корректно парсить JSON ответ от Backend с полем sheet_name',
    async (prizeId, sheetName, rowId, deliveryData) => {
      // Arrange
      const backendResponse = {
        sheet_name: sheetName,
        row_id: rowId,
        code_word: 'TEST123',
      };

      const mockGetPrizeInfo = vi.fn().mockResolvedValue(backendResponse);
      
      vi.mocked(PrizeClient).mockImplementation(() => ({
        getPrizeInfo: mockGetPrizeInfo,
      } as any));

      const mockSaveDeliveryData = vi.fn().mockResolvedValue(true);
      vi.mocked(GoogleSheetsClient).mockImplementation(() => ({
        saveDeliveryData: mockSaveDeliveryData,
      } as any));

      const requestBody = {
        ...deliveryData,
        prize_id: prizeId,
        initData: 'valid-init-data',
      };

      const request = new NextRequest('http://localhost:3000/api/delivery', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Act
      await POST(request);

      // Assert: sheet_name из ответа Backend должен быть передан в saveDeliveryData
      expect(mockSaveDeliveryData).toHaveBeenCalled();
      const callArgs = mockSaveDeliveryData.mock.calls[0];
      expect(callArgs[2]).toBe(sheetName); // Проверяем, что sheet_name корректно извлечен
    }
  );
});
