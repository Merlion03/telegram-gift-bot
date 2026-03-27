/**
 * Unit тесты для PrizeClient
 * 
 * Проверяют конкретные сценарии работы HTTP клиента для Backend API:
 * - Успешное получение информации о призе
 * - Обработка HTTP 404 (приз не найден)
 * - Обработка HTTP 500 и других ошибок
 * - Обработка timeout
 * - Обработка сетевых ошибок
 * - Валидация структуры ответа
 * 
 * Validates: Requirements 1.1, 1.2, 1.4, 9.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PrizeClient } from '../prizeClient';
import { PrizeNotFoundError, BackendUnavailableError } from '../../types/prize';

describe('PrizeClient - Unit Tests', () => {
  let client: PrizeClient;
  const backendUrl = 'http://localhost:5000';
  
  beforeEach(() => {
    client = new PrizeClient(backendUrl);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Успешное получение информации о призе', () => {
    it('должен вернуть полную информацию о призе при успешном запросе', async () => {
      // Arrange
      const prizeId = 42;
      const mockResponse = {
        sheet_name: 'Лист1',
        row_id: 42,
        code_word: 'SECRET123',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // Act
      const result = await client.getPrizeInfo(prizeId);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        `${backendUrl}/api/prize/${prizeId}`,
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('должен корректно обрабатывать backendUrl с trailing slash', async () => {
      // Arrange
      const clientWithSlash = new PrizeClient('http://localhost:5000/');
      const prizeId = 1;
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
      await clientWithSlash.getPrizeInfo(prizeId);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/prize/1',
        expect.any(Object)
      );
    });
  });

  describe('Обработка HTTP 404 - приз не найден', () => {
    it('должен выбросить PrizeNotFoundError при HTTP 404', async () => {
      // Arrange
      const prizeId = 999;
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
    });
  });

  describe('Обработка HTTP 500 и других ошибок', () => {
    it('должен выбросить BackendUnavailableError при HTTP 500', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'HTTP 500: Internal Server Error'
      );
    });

    it('должен выбросить BackendUnavailableError при HTTP 503', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'HTTP 503: Service Unavailable'
      );
    });

    it('должен выбросить BackendUnavailableError при HTTP 400', async () => {
      // Arrange
      const prizeId = -1;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'HTTP 400: Bad Request'
      );
    });
  });

  describe('Обработка timeout', () => {
    it('должен выбросить BackendUnavailableError при timeout', async () => {
      // Arrange
      const prizeId = 1;
      
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        });
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'Request timeout after 5000ms'
      );
    }, 10000);
  });

  describe('Обработка сетевых ошибок', () => {
    it('должен выбросить BackendUnavailableError при сетевой ошибке', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'Network error: unable to reach backend'
      );
    });

    it('должен выбросить BackendUnavailableError при DNS ошибке', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockRejectedValue(
        new TypeError('getaddrinfo ENOTFOUND localhost')
      );

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('Network error');
    });
  });

  describe('Валидация структуры ответа', () => {
    it('должен выбросить BackendUnavailableError если отсутствует sheet_name', async () => {
      // Arrange
      const prizeId = 1;
      const invalidResponse = {
        row_id: 42,
        code_word: 'SECRET',
        // sheet_name отсутствует
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'Invalid response structure from backend: missing required fields'
      );
    });

    it('должен выбросить BackendUnavailableError если отсутствует row_id', async () => {
      // Arrange
      const prizeId = 1;
      const invalidResponse = {
        sheet_name: 'Лист1',
        code_word: 'SECRET',
        // row_id отсутствует
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    });

    it('должен выбросить BackendUnavailableError если отсутствует code_word', async () => {
      // Arrange
      const prizeId = 1;
      const invalidResponse = {
        sheet_name: 'Лист1',
        row_id: 42,
        // code_word отсутствует
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    });

    it('должен выбросить BackendUnavailableError если sheet_name пустая строка', async () => {
      // Arrange
      const prizeId = 1;
      const invalidResponse = {
        sheet_name: '',
        row_id: 42,
        code_word: 'SECRET',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    });

    it('должен выбросить BackendUnavailableError если row_id не положительное число', async () => {
      // Arrange
      const prizeId = 1;
      const invalidResponse = {
        sheet_name: 'Лист1',
        row_id: 0,
        code_word: 'SECRET',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    });

    it('должен выбросить BackendUnavailableError если ответ не JSON', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(
        'Invalid JSON response from backend'
      );
    });

    it('должен выбросить BackendUnavailableError если ответ null', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    });

    it('должен выбросить BackendUnavailableError если ответ не объект', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => 'invalid response',
      });

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('missing required fields');
    });
  });

  describe('Обработка неожиданных ошибок', () => {
    it('должен выбросить BackendUnavailableError при неожиданной ошибке', async () => {
      // Arrange
      const prizeId = 1;
      global.fetch = vi.fn().mockRejectedValue(new Error('Unexpected error'));

      // Act & Assert
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow(BackendUnavailableError);
      await expect(client.getPrizeInfo(prizeId)).rejects.toThrow('Unexpected error');
    });
  });
});
