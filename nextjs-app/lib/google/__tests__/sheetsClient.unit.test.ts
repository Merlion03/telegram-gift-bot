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
       * Requirements: 4.2, 4.3, 4.4
       */
      // Arrange
      const rowId = 5;
      const deliveryData: DeliveryData = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: 'Иванович',
        city: 'Москва',
        street: 'Ленина',
        house: '1',
        apartment: '10',
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
      // Новая структура: E-M (9 колонок)
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(1, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!E${rowId}:M${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            deliveryData.last_name,
            deliveryData.first_name,
            deliveryData.patronymic,
            deliveryData.city,
            deliveryData.street,
            deliveryData.house,
            deliveryData.apartment,
            deliveryData.phone,
            deliveryData.comment,
          ]],
        },
      });

      // Проверяем второй вызов (сохранение timestamp)
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(2, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!N${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[expect.any(String)]], // ISO timestamp
        },
      });
    });

    it('должен сохранять данные без комментария (опциональное поле)', async () => {
      /**
       * Тест: сохранение без опционального поля
       * Requirements: 4.2, 4.3, 4.4
       */
      // Arrange
      const rowId = 3;
      const deliveryData: DeliveryData = {
        last_name: 'Петров',
        first_name: 'Петр',
        patronymic: null,
        city: 'Санкт-Петербург',
        street: 'Невский пр.',
        house: '50',
        apartment: null,
        phone: '+79997654321',
        telegram_id: 987654321,
      };

      // Act
      const result = await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      expect(result).toBe(true);

      // Проверяем, что комментарий и опциональные поля сохранены как пустые строки
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(1, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!E${rowId}:M${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            deliveryData.last_name,
            deliveryData.first_name,
            '',  // patronymic
            deliveryData.city,
            deliveryData.street,
            deliveryData.house,
            '',  // apartment
            deliveryData.phone,
            '', // Пустой комментарий
          ]],
        },
      });
    });

    it('должен корректно формировать диапазон столбцов E-M', async () => {
      /**
       * Тест: проверка корректного формирования диапазона столбцов
       * Requirements: 4.2
       */
      // Arrange
      const rowId = 42;
      const deliveryData: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        patronymic: 'Сидорович',
        city: 'Казань',
        street: 'Пушкина',
        house: '7',
        apartment: '3',
        phone: '+79995555555',
        comment: 'Тестовый комментарий',
        telegram_id: 555555555,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      // Проверяем, что диапазон сформирован правильно: E42:M42
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({
          range: `Sheet1!E${rowId}:M${rowId}`,
        })
      );
    });

    it('должен записывать claimed_at в столбец N', async () => {
      /**
       * Тест: проверка записи timestamp в столбец N
       * Requirements: 4.2
       */
      // Arrange
      const rowId = 8;
      const deliveryData: DeliveryData = {
        last_name: 'Федоров',
        first_name: 'Федор',
        patronymic: null,
        city: 'Уфа',
        street: 'Ленина',
        house: '15',
        apartment: '22',
        phone: '+79996666666',
        telegram_id: 666666666,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      // Проверяем второй вызов - запись claimed_at
      expect(mockSheetsUpdate).toHaveBeenNthCalledWith(2, {
        spreadsheetId: testSpreadsheetId,
        range: `Sheet1!N${rowId}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[expect.any(String)]], // ISO timestamp
        },
      });

      // Проверяем, что timestamp - валидная ISO строка
      const timestampCall = mockSheetsUpdate.mock.calls[1];
      const timestamp = timestampCall[0].requestBody.values[0][0];
      expect(() => new Date(timestamp)).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('должен обрабатывать ошибки Google Sheets API', async () => {
      /**
       * Тест: обработка ошибок API
       * Requirements: 4.2, 4.3, 4.4
       */
      // Arrange
      const rowId = 10;
      const deliveryData: DeliveryData = {
        last_name: 'Тестов',
        first_name: 'Тест',
        patronymic: 'Тестович',
        city: 'Москва',
        street: 'Тестовая',
        house: '1',
        apartment: '1',
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
       * Requirements: 4.2, 4.3, 4.4
       */
      // Arrange
      const rowId = 7;
      const deliveryData: DeliveryData = {
        last_name: 'Сергеев',
        first_name: 'Сергей',
        patronymic: 'Сергеевич',
        city: 'Казань',
        street: 'Баумана',
        house: '20',
        apartment: null,
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
       * Requirements: 4.2, 4.3, 4.4
       */
      // Arrange
      const rowId = 12;
      const deliveryData: DeliveryData = {
        last_name: 'Аннова',
        first_name: 'Анна',
        patronymic: null,
        city: 'Екатеринбург',
        street: 'Малышева',
        house: '5',
        apartment: '15',
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
       * Requirements: 4.2, 4.3, 4.4
       */
      // Arrange
      const rowId = 15;
      const deliveryData: DeliveryData = {
        last_name: 'Марьева',
        first_name: 'Мария',
        patronymic: 'Марьевна',
        city: 'Новосибирск',
        street: 'Ленина',
        house: '100',
        apartment: null,
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
