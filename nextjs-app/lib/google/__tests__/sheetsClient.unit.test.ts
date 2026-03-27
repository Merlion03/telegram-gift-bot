/**
 * Unit-тесты для GoogleSheetsClient
 * 
 * Проверяет корректность сохранения данных доставки в Google Sheets
 * и обработку ошибок API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleSheetsClient, DeliveryData } from '../sheetsClient';
import { SheetNotFoundError, SheetAccessDeniedError } from '../../types/sheet';

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
    
    // Мокируем ответ с информацией о листах
    mockSheetsGet.mockResolvedValue({ 
      data: { 
        spreadsheetId: testSpreadsheetId,
        sheets: [
          {
            properties: {
              title: 'Sheet1',
              sheetId: 0,
            },
          },
          {
            properties: {
              title: 'Sheet2',
              sheetId: 1,
            },
          },
          {
            properties: {
              title: 'Лист1',
              sheetId: 2,
            },
          },
        ],
      } 
    });

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
      const result = await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

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
            { range: `Sheet1!E${rowId}:E${rowId}`, values: [[deliveryData.last_name]] },
            { range: `Sheet1!F${rowId}:F${rowId}`, values: [[deliveryData.first_name]] },
            { range: `Sheet1!G${rowId}:G${rowId}`, values: [[deliveryData.patronymic]] },
            { range: `Sheet1!H${rowId}:H${rowId}`, values: [[deliveryData.city]] },
            { range: `Sheet1!I${rowId}:I${rowId}`, values: [[deliveryData.street]] },
            { range: `Sheet1!J${rowId}:J${rowId}`, values: [[deliveryData.house]] },
            { range: `Sheet1!K${rowId}:K${rowId}`, values: [[deliveryData.apartment]] },
            { range: `Sheet1!L${rowId}:L${rowId}`, values: [[deliveryData.phone]] },
            { range: `Sheet1!M${rowId}:M${rowId}`, values: [[deliveryData.comment]] },
            { range: `Sheet1!N${rowId}:N${rowId}`, values: [[deliveryData.country]] },
            { range: `Sheet1!O${rowId}:O${rowId}`, values: [[deliveryData.postal_code]] },
            { range: `Sheet1!P${rowId}:P${rowId}`, values: [[expect.any(String)]] }, // ISO timestamp
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
      const result = await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

      // Assert
      expect(result).toBe(true);

      // Проверяем, что опциональные поля сохранены как пустые строки
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: testSpreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: expect.arrayContaining([
            { range: `Sheet1!G${rowId}:G${rowId}`, values: [['']] },  // patronymic
            { range: `Sheet1!K${rowId}:K${rowId}`, values: [['']] },  // apartment
            { range: `Sheet1!M${rowId}:M${rowId}`, values: [['']] },  // comment
            { range: `Sheet1!N${rowId}:N${rowId}`, values: [[deliveryData.country]] },
            { range: `Sheet1!O${rowId}:O${rowId}`, values: [[deliveryData.postal_code]] },
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
      await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

      // Assert
      // Проверяем, что диапазоны сформированы правильно для новых полей
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!N${rowId}:N${rowId}`, values: [[deliveryData.country]] },
              { range: `Sheet1!O${rowId}:O${rowId}`, values: [[deliveryData.postal_code]] },
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
      await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

      // Assert
      // Проверяем, что claimed_at записан в столбец P
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!P${rowId}:P${rowId}`, values: [[expect.any(String)]] },
            ]),
          }),
        })
      );

      // Проверяем, что timestamp - валидная ISO строка
      const call = mockSheetsBatchUpdate.mock.calls[0];
      const timestampEntry = call[0].requestBody.data.find(
        (entry: any) => entry.range === `Sheet1!P${rowId}:P${rowId}`
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
      await expect(client.saveDeliveryData(rowId, deliveryData, 'Sheet1')).rejects.toThrow(
        'API Error: Rate limit exceeded'
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
      await expect(client.saveDeliveryData(rowId, deliveryData, 'Sheet1')).rejects.toThrow(
        'Network error: ECONNREFUSED'
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
      await expect(client.saveDeliveryData(rowId, deliveryData, 'Sheet1')).rejects.toThrow(
        'Invalid credentials'
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
      await expect(client.saveDeliveryData(rowId, deliveryData, 'Sheet1')).rejects.toThrow(
        'Permission denied'
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
      await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

      // Assert
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!N${rowId}:N${rowId}`, values: [['Германия']] },
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
      await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

      // Assert
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!O${rowId}:O${rowId}`, values: [['12345-6789']] },
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
      await client.saveDeliveryData(rowId, deliveryData, 'Sheet1');

      // Assert
      // Проверяем, что все диапазоны используют одну и ту же строку
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `Sheet1!E${rowId}:E${rowId}`, values: [[deliveryData.last_name]] },
              { range: `Sheet1!F${rowId}:F${rowId}`, values: [[deliveryData.first_name]] },
              { range: `Sheet1!N${rowId}:N${rowId}`, values: [[deliveryData.country]] },
              { range: `Sheet1!O${rowId}:O${rowId}`, values: [[deliveryData.postal_code]] },
              { range: `Sheet1!P${rowId}:P${rowId}`, values: [[expect.any(String)]] },
            ]),
          }),
        })
      );
    });

    it('должен использовать переданный sheet_name в диапазонах', async () => {
      /**
       * Тест: проверка использования динамического sheet_name
       * Requirements: 3.2, 3.5
       */
      // Arrange
      const rowId = 10;
      const sheetName = 'Лист1';
      const deliveryData: DeliveryData = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: null,
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '1',
        apartment: null,
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData, sheetName);

      // Assert
      expect(mockSheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            data: expect.arrayContaining([
              { range: `${sheetName}!E${rowId}:E${rowId}`, values: [[deliveryData.last_name]] },
              { range: `${sheetName}!F${rowId}:F${rowId}`, values: [[deliveryData.first_name]] },
              { range: `${sheetName}!N${rowId}:N${rowId}`, values: [[deliveryData.country]] },
            ]),
          }),
        })
      );
    });

    it('должен проверять существование листа перед сохранением', async () => {
      /**
       * Тест: проверка существования листа
       * Requirements: 4.1
       */
      // Arrange
      const rowId = 5;
      const sheetName = 'Sheet2';
      const deliveryData: DeliveryData = {
        last_name: 'Петров',
        first_name: 'Петр',
        patronymic: null,
        country: 'Россия',
        postal_code: '654321',
        city: 'Санкт-Петербург',
        street: 'Невский',
        house: '10',
        apartment: null,
        phone: '+79997654321',
        telegram_id: 987654321,
      };

      // Act
      await client.saveDeliveryData(rowId, deliveryData, sheetName);

      // Assert
      // Проверяем, что был вызван метод get для получения списка листов
      expect(mockSheetsGet).toHaveBeenCalled();
      expect(mockSheetsBatchUpdate).toHaveBeenCalled();
    });

    it('должен выбросить SheetNotFoundError для несуществующего листа', async () => {
      /**
       * Тест: обработка несуществующего листа
       * Requirements: 4.2
       */
      // Arrange
      const rowId = 5;
      const sheetName = 'НесуществующийЛист';
      const deliveryData: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        patronymic: null,
        country: 'Россия',
        postal_code: '111111',
        city: 'Казань',
        street: 'Пушкина',
        house: '5',
        apartment: null,
        phone: '+79995555555',
        telegram_id: 555555555,
      };

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData, sheetName)).rejects.toThrow(
        `Sheet "${sheetName}" does not exist in spreadsheet`
      );
    });

    it('должен кэшировать проверки существования листа', async () => {
      /**
       * Тест: кэширование проверок существования
       * Requirements: 4.3
       */
      // Arrange
      const rowId1 = 5;
      const rowId2 = 10;
      const sheetName = 'Sheet1';
      const deliveryData: DeliveryData = {
        last_name: 'Федоров',
        first_name: 'Федор',
        patronymic: null,
        country: 'Россия',
        postal_code: '222222',
        city: 'Уфа',
        street: 'Ленина',
        house: '15',
        apartment: null,
        phone: '+79996666666',
        telegram_id: 666666666,
      };

      // Act
      await client.saveDeliveryData(rowId1, deliveryData, sheetName);
      mockSheetsGet.mockClear(); // Очищаем счетчик вызовов
      await client.saveDeliveryData(rowId2, deliveryData, sheetName);

      // Assert
      // Второй вызов не должен запрашивать список листов (используется кэш)
      expect(mockSheetsGet).not.toHaveBeenCalled();
    });

    it('должен логировать использование sheet_name', async () => {
      /**
       * Тест: логирование использования листа
       * Requirements: 7.1
       */
      // Arrange
      const rowId = 7;
      const sheetName = 'Лист1';
      const deliveryData: DeliveryData = {
        last_name: 'Алексеев',
        first_name: 'Алексей',
        patronymic: null,
        country: 'Россия',
        postal_code: '333333',
        city: 'Екатеринбург',
        street: 'Малышева',
        house: '20',
        apartment: null,
        phone: '+79997777777',
        telegram_id: 777777777,
      };

      const consoleSpy = vi.spyOn(console, 'log');

      // Act
      await client.saveDeliveryData(rowId, deliveryData, sheetName);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Using sheet: ${sheetName} for row ${rowId}`)
      );

      consoleSpy.mockRestore();
    });

    it('должен логировать проверку существования листа', async () => {
      /**
       * Тест: логирование проверки существования
       * Requirements: 4.5, 7.2
       */
      // Arrange
      const rowId = 8;
      const sheetName = 'Sheet2';
      const deliveryData: DeliveryData = {
        last_name: 'Михайлов',
        first_name: 'Михаил',
        patronymic: null,
        country: 'Россия',
        postal_code: '444444',
        city: 'Новосибирск',
        street: 'Ленина',
        house: '25',
        apartment: null,
        phone: '+79998888888',
        telegram_id: 888888888,
      };

      const consoleSpy = vi.spyOn(console, 'log');

      // Act
      await client.saveDeliveryData(rowId, deliveryData, sheetName);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Verifying sheet '${sheetName}' exists`)
      );

      consoleSpy.mockRestore();
    });

    it('должен логировать успешное сохранение с sheet_name', async () => {
      /**
       * Тест: логирование успешного сохранения
       * Requirements: 7.3
       */
      // Arrange
      const rowId = 9;
      const sheetName = 'Лист1';
      const deliveryData: DeliveryData = {
        last_name: 'Николаев',
        first_name: 'Николай',
        patronymic: null,
        country: 'Россия',
        postal_code: '555555',
        city: 'Самара',
        street: 'Ленина',
        house: '30',
        apartment: null,
        phone: '+79999999999',
        telegram_id: 999999999,
      };

      const consoleSpy = vi.spyOn(console, 'log');

      // Act
      await client.saveDeliveryData(rowId, deliveryData, sheetName);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Successfully saved delivery data to sheet '${sheetName}', row ${rowId}`)
      );

      consoleSpy.mockRestore();
    });

    it('должен логировать ошибки с контекстом (sheetName, rowId)', async () => {
      /**
       * Тест: логирование ошибок с контекстом
       * Requirements: 6.3, 7.4
       */
      // Arrange
      const rowId = 11;
      const sheetName = 'Sheet1';
      const deliveryData: DeliveryData = {
        last_name: 'Павлов',
        first_name: 'Павел',
        patronymic: null,
        country: 'Россия',
        postal_code: '666666',
        city: 'Ростов',
        street: 'Ленина',
        house: '35',
        apartment: null,
        phone: '+79991010101',
        telegram_id: 101010101,
      };

      const apiError = new Error('Test API Error');
      mockSheetsBatchUpdate.mockRejectedValueOnce(apiError);

      const consoleErrorSpy = vi.spyOn(console, 'error');

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData, sheetName)).rejects.toThrow();

      // Проверяем, что ошибка залогирована с контекстом
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving delivery data to Google Sheets:',
        expect.objectContaining({
          sheetName,
          rowId,
          error: 'Test API Error',
          stack: expect.any(String),
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('должен обрабатывать ошибку "Unable to parse range" как SheetNotFoundError', async () => {
      /**
       * Тест: обработка ошибки парсинга диапазона
       * Requirements: 6.1
       */
      // Arrange
      const rowId = 12;
      const sheetName = 'InvalidSheet';
      const deliveryData: DeliveryData = {
        last_name: 'Романов',
        first_name: 'Роман',
        patronymic: null,
        country: 'Россия',
        postal_code: '777777',
        city: 'Воронеж',
        street: 'Ленина',
        house: '40',
        apartment: null,
        phone: '+79991111111',
        telegram_id: 111111111,
      };

      const parseError = new Error('Unable to parse range: InvalidSheet!E12:E12');
      mockSheetsBatchUpdate.mockRejectedValueOnce(parseError);

      // Act & Assert
      await expect(client.saveDeliveryData(rowId, deliveryData, sheetName)).rejects.toThrow(
        `Sheet "${sheetName}" does not exist in spreadsheet`
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
