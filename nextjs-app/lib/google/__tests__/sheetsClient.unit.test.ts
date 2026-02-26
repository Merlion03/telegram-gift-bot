/**
 * Unit-тесты для GoogleSheetsClient
 * 
 * Проверяет корректность сохранения данных доставки в Google Sheets
 * и обработку ошибок API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleSheetsClient, DeliveryData } from '../sheetsClient';

// Мокирование googleapis
vi.mock('googleapis', () => {
  const mockSheetsUpdate = vi.fn();
  const mockSheetsGet = vi.fn();
  
  return {
    google: {
      sheets: vi.fn(() => ({
        spreadsheets: {
          values: {
            update: mockSheetsUpdate,
          },
          get: mockSheetsGet,
        },
      })),
      auth: {
        JWT: vi.fn(function(this: any, config: any) {
          this.email = config.email;
          this.key = config.key;
          this.scopes = config.scopes;
          return this;
        }),
      },
    },
  };
});

describe('GoogleSheetsClient', () => {
  let mockSheetsUpdate: ReturnType<typeof vi.fn>;
  let mockSheetsGet: ReturnType<typeof vi.fn>;
  let client: GoogleSheetsClient;

  const testCredentials = {
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----',
  };

  const testSpreadsheetId = 'test-spreadsheet-id';

  beforeEach(async () => {
    // Получаем ссылки на моки из модуля
    const { google } = await import('googleapis');
    const sheetsInstance = google.sheets({} as any);
    
    mockSheetsUpdate = sheetsInstance.spreadsheets.values.update as any;
    mockSheetsGet = sheetsInstance.spreadsheets.get as any;

    // Настройка моков
    mockSheetsUpdate.mockResolvedValue({ data: {} });
    mockSheetsGet.mockResolvedValue({ data: { spreadsheetId: testSpreadsheetId } });

    // Мокирование переменной окружения с credentials
    process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify(testCredentials);

    // Создание клиента
    client = new GoogleSheetsClient('dummy-path', testSpreadsheetId);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_CREDENTIALS_JSON;
  });

  describe('saveDeliveryData', () => {
    it('должен успешно сохранять данные доставки в Google Sheets', async () => {
      /**
       * Тест: успешное сохранение данных
       * Requirements: 4.5
       */
      // Arrange
      const rowId = 5;
      const deliveryData: DeliveryData = {
        full_name: 'Иван Иванов',
        address: 'г. Москва, ул. Ленина, д. 1, кв. 10',
        phone: '+79991234567',
        comment: 'Позвонить за час',
        telegram_id: 123456789,
      };

      // Act
      const result = await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      expect(result).toBe(true);

      // Проверяем, что update был вызван дважды (данные + timestamp)
      expect(mockSheetsUpdate).toHaveBeenCalledTimes(2);

      // Проверяем первый вызов (сохранение данных доставки)
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(1, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!E${rowId}:H${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            deliveryData.full_name,
            deliveryData.address,
            deliveryData.phone,
            deliveryData.comment,
          ]],
        },
      });

      // Проверяем второй вызов (сохранение timestamp)
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(2, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!I${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[expect.any(String)]], // ISO timestamp
        },
      });
    });

    it('должен сохранять данные без комментария (опциональное поле)', async () => {
      /**
       * Тест: сохранение без опционального поля
       * Requirements: 4.5
       */
      // Arrange
      const rowId = 3;
      const deliveryData: DeliveryData = {
        full_name: 'Петр Петров',
        address: 'г. Санкт-Петербург, Невский пр., д. 50',
        phone: '+79997654321',
        telegram_id: 987654321,
      };

      // Act
      const result = await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      expect(result).toBe(true);

      // Проверяем, что комментарий сохранён как пустая строка
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(1, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!E${rowId}:H${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            deliveryData.full_name,
            deliveryData.address,
            deliveryData.phone,
            '', // Пустой комментарий
          ]],
        },
      });
    });

    it('должен обрабатывать ошибки Google Sheets API', async () => {
      /**
       * Тест: обработка ошибок API
       * Requirements: 4.7
       */
      // Arrange
      const rowId = 10;
      const deliveryData: DeliveryData = {
        full_name: 'Тест Тестов',
        address: 'Тестовый адрес',
        phone: '+79991111111',
        telegram_id: 111111111,
      };

      const apiError = new Error('API Error: Rate limit exceeded');
      mockSheetsUpdate.mockRejectedValueOnce(apiError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData)).rejects.toThrow(
        'Failed to save delivery data: API Error: Rate limit exceeded'
      );

      // Проверяем, что ошибка была залогирована
      expect(mockSheetsUpdate).toHaveBeenCalledTimes(1);
    });

    it('должен обрабатывать ошибки сети', async () => {
      /**
       * Тест: обработка сетевых ошибок
       * Requirements: 4.7
       */
      // Arrange
      const rowId = 7;
      const deliveryData: DeliveryData = {
        full_name: 'Сергей Сергеев',
        address: 'г. Казань, ул. Баумана, д. 20',
        phone: '+79992222222',
        telegram_id: 222222222,
      };

      const networkError = new Error('Network error: ECONNREFUSED');
      mockSheetsUpdate.mockRejectedValueOnce(networkError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData)).rejects.toThrow(
        'Failed to save delivery data: Network error: ECONNREFUSED'
      );
    });

    it('должен обрабатывать ошибки аутентификации', async () => {
      /**
       * Тест: обработка ошибок аутентификации
       * Requirements: 4.7
       */
      // Arrange
      const rowId = 12;
      const deliveryData: DeliveryData = {
        full_name: 'Анна Аннова',
        address: 'г. Екатеринбург, ул. Малышева, д. 5',
        phone: '+79993333333',
        telegram_id: 333333333,
      };

      const authError = new Error('Invalid credentials');
      mockSheetsUpdate.mockRejectedValueOnce(authError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData)).rejects.toThrow(
        'Failed to save delivery data: Invalid credentials'
      );
    });

    it('должен обрабатывать ошибки доступа к таблице', async () => {
      /**
       * Тест: обработка ошибок доступа (недостаточно прав)
       * Requirements: 4.7
       */
      // Arrange
      const rowId = 15;
      const deliveryData: DeliveryData = {
        full_name: 'Мария Марьева',
        address: 'г. Новосибирск, пр. Ленина, д. 100',
        phone: '+79994444444',
        telegram_id: 444444444,
      };

      const permissionError = new Error('Permission denied');
      mockSheetsUpdate.mockRejectedValueOnce(permissionError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData)).rejects.toThrow(
        'Failed to save delivery data: Permission denied'
      );
    });
  });

  describe('healthCheck', () => {
    it('должен возвращать true если API доступен', async () => {
      /**
       * Тест: проверка доступности API
       */
      // Act
      const result = await client.healthCheck();

      // Assert
      expect(result).toBe(true);
      expect(mockSheetsGet).toHaveBeenCalledWith({
        spreadsheetId: testSpreadsheetId,
      });
    });

    it('должен возвращать false если API недоступен', async () => {
      /**
       * Тест: обработка недоступности API
       */
      // Arrange
      mockSheetsGet.mockRejectedValueOnce(new Error('Service unavailable'));

      // Act
      const result = await client.healthCheck();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Инициализация', () => {
    it('должен корректно инициализироваться с credentials из переменной окружения', async () => {
      /**
       * Тест: инициализация из переменной окружения
       */
      // Arrange
      process.env.GOOGLE_CREDENTIALS_JSON = JSON.stringify(testCredentials);
      const { google } = await import('googleapis');

      // Act
      const newClient = new GoogleSheetsClient('dummy-path', testSpreadsheetId);

      // Assert
      expect(newClient).toBeDefined();
      expect(google.auth.JWT).toHaveBeenCalled();
    });

    it('должен выбросить ошибку при невалидных credentials', () => {
      /**
       * Тест: обработка невалидных credentials
       */
      // Arrange
      process.env.GOOGLE_CREDENTIALS_JSON = 'invalid-json';

      // Act & Assert
      expect(() => {
        new GoogleSheetsClient('dummy-path', testSpreadsheetId);
      }).toThrow('Failed to load Google credentials');
    });

    it('должен выбросить ошибку при отсутствии credentials', () => {
      /**
       * Тест: обработка отсутствия credentials
       */
      // Arrange
      delete process.env.GOOGLE_CREDENTIALS_JSON;

      // Мокирование fs для симуляции отсутствия файла
      vi.mock('fs', () => ({
        readFileSync: vi.fn().mockImplementation(() => {
          throw new Error('ENOENT: no such file or directory');
        }),
      }));

      // Act & Assert
      expect(() => {
        new GoogleSheetsClient('non-existent-path', testSpreadsheetId);
      }).toThrow('Failed to load Google credentials');
    });
  });
});
