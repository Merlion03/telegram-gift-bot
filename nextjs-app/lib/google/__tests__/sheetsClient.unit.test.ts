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
  const mockSheetsBatchUpdate = vi.fn();
  const mockSheetsGet = vi.fn();
  
  return {
    google: {
      sheets: vi.fn(() => ({
        spreadsheets: {
          values: {
            batchUpdate: mockSheetsBatchUpdate,
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
  let mockSheetsBatchUpdate: ReturnType<typeof vi.fn>;
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
    
    mockSheetsBatchUpdate = sheetsInstance.spreadsheets.values.batchUpdate as any;
    mockSheetsGet = sheetsInstance.spreadsheets.get as any;

    // Настройка моков
    mockSheetsBatchUpdate.mockResolvedValue({ data: {} });
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
        country: 'Россия',
        postal_code: '123456',
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

      // Проверяем, что batchUpdate был вызван один раз
      expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);

      // Проверяем вызов batchUpdate с новыми полями
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: testSpreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `Sheet1!E${rowId}`, values: [[deliveryData.last_name]] },
            { range: `Sheet1!F${rowId}`, values: [[deliveryData.first_name]] },
            { range: `Sheet1!G${rowId}`, values: [[deliveryData.patronymic]] },
            { range: `Sheet1!H${rowId}`, values: [[deliveryData.city]] },
            { range: `Sheet1!I${rowId}`, values: [[deliveryData.street]] },
            { range: `Sheet1!J${rowId}`, values: [[deliveryData.house]] },
            { range: `Sheet1!K${rowId}`, values: [[deliveryData.apartment]] },
            { range: `Sheet1!L${rowId}`, values: [[deliveryData.phone]] },
            { range: `Sheet1!M${rowId}`, values: [[deliveryData.comment]] },
            { range: `Sheet1!N${rowId}`, values: [[deliveryData.country]] },
            { range: `Sheet1!O${rowId}`, values: [[deliveryData.postal_code]] },
            { range: `Sheet1!P${rowId}`, values: [[expect.any(String)]] }, // ISO timestamp
          ],
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
        country: 'Казахстан',
        postal_code: '050000',
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

      // Проверяем, что опциональные поля сохранены как пустые строки
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: testSpreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: expect.arrayContaining([
            { range: `Sheet1!G${rowId}`, values: [['']] },  // patronymic
            { range: `Sheet1!K${rowId}`, values: [['']] },  // apartment
            { range: `Sheet1!M${rowId}`, values: [['']] },  // comment
            { range: `Sheet1!N${rowId}`, values: [[deliveryData.country]] },
            { range: `Sheet1!O${rowId}`, values: [[deliveryData.postal_code]] },
          ]),
        },
      });
    });

    it('должен корректно формировать диапазон столбцов E-O для новых полей', async () => {
      /**
       * Тест: проверка корректного формирования диапазонов для новых полей
       * Requirements: 6.1, 6.2, 6.3
       */
      // Arrange
      const rowId = 42;
      const deliveryData: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        patronymic: 'Сидорович',
        country: 'Беларусь',
        postal_code: '220000',
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
      // Проверяем, что диапазоны сформированы правильно для новых полей
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!N${rowId}`, values: [[deliveryData.country]] },
              { range: `Sheet1!O${rowId}`, values: [[deliveryData.postal_code]] },
            ]),
          }),
        })
      );
    });

    it('должен записывать claimed_at в столбец P', async () => {
      /**
       * Тест: проверка записи timestamp в столбец P (после новых полей)
       * Requirements: 6.5
       */
      // Arrange
      const rowId = 8;
      const deliveryData: DeliveryData = {
        last_name: 'Федоров',
        first_name: 'Федор',
        patronymic: null,
        country: 'Украина',
        postal_code: '01001',
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
      // Проверяем, что claimed_at записан в столбец P
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!P${rowId}`, values: [[expect.any(String)]] },
            ]),
          }),
        })
      );

      // Проверяем, что timestamp - валидная ISO строка
      const call = mockSheetsBatchUpdate.mock.calls[0];
      const timestampEntry = call[0].requestBody.data.find(
        (entry: any) => entry.range === `Sheet1!P${rowId}`
      );
      const timestamp = timestampEntry.values[0][0];
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
        country: 'Россия',
        postal_code: '100000',
        city: 'Москва',
        street: 'Тестовая',
        house: '1',
        apartment: '1',
        phone: '+79991111111',
        telegram_id: 111111111,
      };

      const apiError = new Error('API Error: Rate limit exceeded');
      mockSheetsBatchUpdate.mockRejectedValueOnce(apiError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData)).rejects.toThrow(
        'Failed to save delivery data: API Error: Rate limit exceeded'
      );

      // Проверяем, что ошибка была залогирована
      expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);
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
        country: 'Россия',
        postal_code: '420000',
        city: 'Казань',
        street: 'Баумана',
        house: '20',
        apartment: null,
        phone: '+79992222222',
        telegram_id: 222222222,
      };

      const networkError = new Error('Network error: ECONNREFUSED');
      mockSheetsBatchUpdate.mockRejectedValueOnce(networkError);

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
        country: 'Россия',
        postal_code: '620000',
        city: 'Екатеринбург',
        street: 'Малышева',
        house: '5',
        apartment: '15',
        phone: '+79993333333',
        telegram_id: 333333333,
      };

      const authError = new Error('Invalid credentials');
      mockSheetsBatchUpdate.mockRejectedValueOnce(authError);

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
        country: 'Россия',
        postal_code: '630000',
        city: 'Новосибирск',
        street: 'Ленина',
        house: '100',
        apartment: null,
        phone: '+79994444444',
        telegram_id: 444444444,
      };

      const permissionError = new Error('Permission denied');
      mockSheetsBatchUpdate.mockRejectedValueOnce(permissionError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData)).rejects.toThrow(
        'Failed to save delivery data: Permission denied'
      );
    });

    it('должен сохранять country в колонку N', async () => {
      /**
       * Тест: проверка сохранения поля country в колонку N
       * Requirements: 6.1, 6.3
       */
      // Arrange
      const rowId = 20;
      const deliveryData: DeliveryData = {
        last_name: 'Тестов',
        first_name: 'Тест',
        patronymic: 'Тестович',
        country: 'Германия',
        postal_code: '10115',
        city: 'Берлин',
        street: 'Hauptstraße',
        house: '1',
        apartment: '5',
        phone: '+491234567890',
        telegram_id: 777777777,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!N${rowId}`, values: [['Германия']] },
            ]),
          }),
        })
      );
    });

    it('должен сохранять postal_code в колонку O', async () => {
      /**
       * Тест: проверка сохранения поля postal_code в колонку O
       * Requirements: 6.2, 6.4
       */
      // Arrange
      const rowId = 21;
      const deliveryData: DeliveryData = {
        last_name: 'Смит',
        first_name: 'Джон',
        patronymic: null,
        country: 'США',
        postal_code: '12345-6789',
        city: 'Нью-Йорк',
        street: 'Broadway',
        house: '100',
        apartment: null,
        phone: '+11234567890',
        telegram_id: 888888888,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!O${rowId}`, values: [['12345-6789']] },
            ]),
          }),
        })
      );
    });

    it('должен сохранять данные в той же строке для всех полей', async () => {
      /**
       * Тест: проверка, что все поля сохраняются в одной строке
       * Requirements: 6.5
       */
      // Arrange
      const rowId = 25;
      const deliveryData: DeliveryData = {
        last_name: 'Дюпон',
        first_name: 'Жан',
        patronymic: null,
        country: 'Франция',
        postal_code: '75001',
        city: 'Париж',
        street: 'Rue de Rivoli',
        house: '10',
        apartment: '3',
        phone: '+33123456789',
        telegram_id: 999999999,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData);

      // Assert
      // Проверяем, что все диапазоны используют одну и ту же строку
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!E${rowId}`, values: [[deliveryData.last_name]] },
              { range: `Sheet1!F${rowId}`, values: [[deliveryData.first_name]] },
              { range: `Sheet1!N${rowId}`, values: [[deliveryData.country]] },
              { range: `Sheet1!O${rowId}`, values: [[deliveryData.postal_code]] },
              { range: `Sheet1!P${rowId}`, values: [[expect.any(String)]] },
            ]),
          }),
        })
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
