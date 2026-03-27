/**
 * Property-Based тесты для PrizeClient
 * 
 * Проверяют универсальные свойства корректности работы HTTP клиента
 * на большом количестве сгенерированных входных данных
 * 
 * Validates: Requirements 1.1, 1.2, 1.4, 1.5
 */

import { describe, expect, beforeEach, vi, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { PrizeClient } from '../prizeClient';
import { PrizeNotFoundError, BackendUnavailableError } from '../../types/prize';

describe('PrizeClient - Property Tests', () => {
  let client: PrizeClient;
  const backendUrl = 'http://localhost:5000';
  
  beforeEach(() => {
    client = new PrizeClient(backendUrl);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 1:
   * Backend API возвращает полную информацию о призе
   * 
   * Для любого существующего в Prize_Database prize_id, Backend API должен вернуть
   * объект, содержащий все обязательные поля: sheet_name, row_id и code_word.
   * 
   * Validates: Requirements 1.1, 1.5
   */
  test.prop([
    fc.integer({ min: 1, max: 10000 }), // prize_id
    fc.string({ minLength: 1, maxLength: 100 }), // sheet_name
    fc.integer({ min: 1, max: 10000 }), // row_id
    fc.string({ minLength: 1, maxLength: 50 }), // code_word
  ])(
    'Property 1: Backend API возвращает полную информацию о призе',
    async (prizeId, sheetName, rowId, codeWord) => {
      // Arrange
      const mockResponse = {
        sheet_name: sheetName,
        row_id: rowId,
        code_word: codeWord,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // Act
      const result = await client.getPrizeInfo(prizeId);

      // Assert - проверяем что все обязательные поля присутствуют
      expect(result).toHaveProperty('sheet_name');
      expect(result).toHaveProperty('row_id');
      expect(result).toHaveProperty('code_word');
      
      // Проверяем что значения соответствуют ожидаемым
      expect(result.sheet_name).toBe(sheetName);
      expect(result.row_id).toBe(rowId);
      expect(result.code_word).toBe(codeWord);
      
      // Проверяем что был выполнен правильный запрос
      expect(global.fetch).toHaveBeenCalledWith(
        `${backendUrl}/api/prize/${prizeId}`,
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  );

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 2:
   * Backend API отклоняет несуществующие prize_id
   * 
   * Для любого prize_id, которого не существует в Prize_Database,
   * Backend API должен вернуть HTTP 404 с сообщением об ошибке.
   * 
   * Validates: Requirements 1.2
   */
  test.prop([
    fc.integer({ min: 1, max: 10000 }), // prize_id
  ])(
    'Property 2: Backend API отклоняет несуществующие prize_id',
    async (prizeId) => {
      // Arrange - Backend возвращает 404
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(PrizeNotFoundError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        `Prize with ID ${prizeId} not found`
      );
      
      // Проверяем что запрос был выполнен
      expect(global.fetch).toHaveBeenCalledWith(
        `${backendUrl}/api/prize/${prizeId}`,
        expect.any(Object)
      );
    }
  );

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 3:
   * Backend API валидирует формат prize_id
   * 
   * Для любого невалидного prize_id (отрицательное число, нецелое число, не число),
   * Backend API должен вернуть HTTP 400 с сообщением об ошибке валидации.
   * 
   * Validates: Requirements 1.4
   */
  test.prop([
    fc.oneof(
      fc.integer({ max: 0 }), // отрицательные числа и ноль
      fc.integer({ min: -10000, max: -1 }), // отрицательные числа
    ),
  ])(
    'Property 3: Backend API отклоняет невалидные prize_id (отрицательные)',
    async (invalidPrizeId) => {
      // Arrange - Backend возвращает 400 для невалидного prize_id
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      // Act & Assert
      await expect(client.getPrizeInfo(invalidPrizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(invalidPrizeId)).rejects.toThrow('HTTP 400');
      
      // Проверяем что запрос был выполнен
      expect(global.fetch).toHaveBeenCalledWith(
        `${backendUrl}/api/prize/${invalidPrizeId}`,
        expect.any(Object)
      );
    }
  );

  /**
   * Property 3 (продолжение): Проверка различных HTTP ошибок
   * 
   * Для любого HTTP кода ошибки (кроме 404), система должна выбросить BackendUnavailableError
   */
  test.prop([
    fc.integer({ min: 1, max: 10000 }), // prize_id
    fc.oneof(
      fc.constant(400), // Bad Request
      fc.constant(401), // Unauthorized
      fc.constant(403), // Forbidden
      fc.constant(500), // Internal Server Error
      fc.constant(502), // Bad Gateway
      fc.constant(503), // Service Unavailable
    ),
  ])(
    'Property 3 (расширенная): Backend API обрабатывает различные HTTP ошибки',
    async (prizeId, statusCode) => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: statusCode,
        statusText: `Error ${statusCode}`,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(`HTTP ${statusCode}`);
    }
  );

  /**
   * Property: Валидация структуры ответа - отсутствующие поля
   * 
   * Для любого ответа с отсутствующими обязательными полями,
   * система должна выбросить BackendUnavailableError
   */
  test.prop([
    fc.integer({ min: 1, max: 10000 }), // prize_id
    fc.oneof(
      // Отсутствует sheet_name
      fc.record({
        row_id: fc.integer({ min: 1, max: 10000 }),
        code_word: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      // Отсутствует row_id
      fc.record({
        sheet_name: fc.string({ minLength: 1, maxLength: 100 }),
        code_word: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      // Отсутствует code_word
      fc.record({
        sheet_name: fc.string({ minLength: 1, maxLength: 100 }),
        row_id: fc.integer({ min: 1, max: 10000 }),
      }),
    ),
  ])(
    'Property: Валидация структуры ответа - отсутствующие поля',
    async (prizeId, invalidResponse) => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    }
  );

  /**
   * Property: Валидация структуры ответа - невалидные значения полей
   * 
   * Для любого ответа с невалидными значениями полей (пустые строки, нулевые числа),
   * система должна выбросить BackendUnavailableError
   */
  test.prop([
    fc.integer({ min: 1, max: 10000 }), // prize_id
    fc.oneof(
      // Пустой sheet_name
      fc.record({
        sheet_name: fc.constant(''),
        row_id: fc.integer({ min: 1, max: 10000 }),
        code_word: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      // row_id = 0 или отрицательный
      fc.record({
        sheet_name: fc.string({ minLength: 1, maxLength: 100 }),
        row_id: fc.integer({ max: 0 }),
        code_word: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      // Пустой code_word
      fc.record({
        sheet_name: fc.string({ minLength: 1, maxLength: 100 }),
        row_id: fc.integer({ min: 1, max: 10000 }),
        code_word: fc.constant(''),
      }),
    ),
  ])(
    'Property: Валидация структуры ответа - невалидные значения',
    async (prizeId, invalidResponse) => {
      // Arrange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    }
  );

  /**
   * Property: Идемпотентность запросов
   * 
   * Для любого prize_id, повторные запросы должны возвращать одинаковый результат
   */
  test.prop([
    fc.integer({ min: 1, max: 10000 }), // prize_id
    fc.string({ minLength: 1, maxLength: 100 }), // sheet_name
    fc.integer({ min: 1, max: 10000 }), // row_id
    fc.string({ minLength: 1, maxLength: 50 }), // code_word
  ])(
    'Property: Идемпотентность запросов',
    async (prizeId, sheetName, rowId, codeWord) => {
      // Arrange
      const mockResponse = {
        sheet_name: sheetName,
        row_id: rowId,
        code_word: codeWord,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // Act - выполняем два запроса подряд
      const result1 = await client.getPrizeInfo(prizeId);
      const result2 = await client.getPrizeInfo(prizeId);

      // Assert - результаты должны быть идентичны
      expect(result1).toEqual(result2);
      expect(result1.sheet_name).toBe(result2.sheet_name);
      expect(result1.row_id).toBe(result2.row_id);
      expect(result1.code_word).toBe(result2.code_word);
    }
  );

  /**
   * Property: Корректная обработка различных форматов backendUrl
   * 
   * Для любого backendUrl (с trailing slash или без), запросы должны формироваться корректно
   */
  test.prop([
    fc.oneof(
      fc.constant('http://localhost:5000'),
      fc.constant('http://localhost:5000/'),
      fc.constant('https://api.example.com'),
      fc.constant('https://api.example.com/'),
    ),
    fc.integer({ min: 1, max: 10000 }), // prize_id
  ])(
    'Property: Корректная обработка различных форматов backendUrl',
    async (url, prizeId) => {
      // Arrange
      const testClient = new PrizeClient(url);
      const mockResponse = {
        sheet_name: 'Test',
        row_id: 1,
        code_word: 'CODE',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // Act
      await testClient.getPrizeInfo(prizeId);

      // Assert - URL должен быть сформирован без двойных слешей
      const expectedUrl = url.endsWith('/') 
        ? `${url.slice(0, -1)}/api/prize/${prizeId}`
        : `${url}/api/prize/${prizeId}`;
      
      expect(global.fetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.any(Object)
      );
    }
  );
});
