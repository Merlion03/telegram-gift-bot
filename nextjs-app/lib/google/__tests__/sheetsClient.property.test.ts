/**
 * Property-based тесты для GoogleSheetsClient
 * 
 * Feature: delivery-form-field-separation
 * Property 11: Round-trip сохранения данных
 * 
 * Validates: Requirements 4.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc } from '@fast-check/vitest';
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

describe('GoogleSheetsClient - Property-Based Tests', () => {
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
    
    // Мокируем ответ с информацией о листах (поддержка динамических листов)
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
          {
            properties: {
              title: 'TestSheet',
              sheetId: 3,
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

  /**
   * Генератор валидных строк для полей ФИО
   */
  const nameArbitrary = fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2);

  /**
   * Генератор валидных названий листов Google Sheets
   * Не содержит недопустимые символы: [ ] * / \ ? :
   * Длина от 1 до 100 символов
   */
  const validSheetNameArbitrary = fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => {
      const forbidden = ['[', ']', '*', '/', '\\', '?', ':'];
      return s.trim().length >= 1 && !forbidden.some(char => s.includes(char));
    });

  /**
   * Генератор валидных строк для города
   */
  const cityArbitrary = fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2);

  /**
   * Генератор валидных строк для улицы
   */
  const streetArbitrary = fc.string({ minLength: 2, maxLength: 200 }).filter(s => s.trim().length >= 2);

  /**
   * Генератор валидных строк для дома
   */
  const houseArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length >= 1);

  /**
   * Генератор валидных строк для квартиры
   */
  const apartmentArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length >= 1);

  /**
   * Генератор валидных строк для страны
   */
  const countryArbitrary = fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2);

  /**
   * Генератор валидных почтовых индексов
   */
  const postalCodeArbitrary = fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3);

  /**
   * Генератор валидных номеров телефонов
   */
  const phoneArbitrary = fc.integer({ min: 10000000000, max: 999999999999999 })
    .map(n => `+${n}`);

  /**
   * Генератор валидных комментариев
   */
  const commentArbitrary = fc.string({ maxLength: 500 });

  /**
   * Feature: delivery-form-field-separation, Property 11:
   * Round-trip сохранения данных
   * 
   * Для любых валидных данных доставки, отправленных через API,
   * данные должны быть сохранены в Google Sheets в том же структурированном виде
   * (с сохранением всех полей и их значений).
   * 
   * Validates: Requirements 4.2
   */
  it('должен сохранять и корректно обрабатывать все поля данных доставки', async () => {
    await fc.assert(
      fc.asyncProperty(
        nameArbitrary,
        nameArbitrary,
        fc.option(nameArbitrary, { nil: null }),
        countryArbitrary,
        postalCodeArbitrary,
        cityArbitrary,
        streetArbitrary,
        houseArbitrary,
        fc.option(apartmentArbitrary, { nil: null }),
        phoneArbitrary,
        fc.option(commentArbitrary, { nil: undefined }),
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'), // Используем существующие листы
        async (
          last_name,
          first_name,
          patronymic,
          country,
          postal_code,
          city,
          street,
          house,
          apartment,
          phone,
          comment,
          telegram_id,
          rowId,
          sheetName
        ) => {
          // Arrange
          const deliveryData: DeliveryData = {
            last_name,
            first_name,
            patronymic,
            country,
            postal_code,
            city,
            street,
            house,
            apartment,
            phone,
            comment,
            telegram_id,
          };

          // Act
          const result = await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          expect(result).toBe(true);

          // Проверяем, что batchUpdate был вызван один раз
          expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);

          // Проверяем вызов batchUpdate
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          
          // Проверяем структуру запроса
          expect(call.spreadsheetId).toBe(testSpreadsheetId);
          expect(call.requestBody.valueInputOption).toBe('RAW');
          expect(call.requestBody.data).toBeDefined();
          
          // Проверяем сохраненные значения
          const data = call.requestBody.data;
          
          // Находим записи по диапазонам
          const findValue = (range: string) => {
            const entry = data.find((d: any) => d.range === range);
            return entry ? entry.values[0][0] : undefined;
          };

          expect(findValue(`${sheetName}!E${rowId}:E${rowId}`)).toBe(last_name);
          expect(findValue(`${sheetName}!F${rowId}:F${rowId}`)).toBe(first_name);
          expect(findValue(`${sheetName}!G${rowId}:G${rowId}`)).toBe(patronymic || '');
          expect(findValue(`${sheetName}!H${rowId}:H${rowId}`)).toBe(city);
          expect(findValue(`${sheetName}!I${rowId}:I${rowId}`)).toBe(street);
          expect(findValue(`${sheetName}!J${rowId}:J${rowId}`)).toBe(house);
          expect(findValue(`${sheetName}!K${rowId}:K${rowId}`)).toBe(apartment || '');
          expect(findValue(`${sheetName}!L${rowId}:L${rowId}`)).toBe(phone);
          expect(findValue(`${sheetName}!M${rowId}:M${rowId}`)).toBe(comment || '');
          expect(findValue(`${sheetName}!N${rowId}:N${rowId}`)).toBe(country);
          expect(findValue(`${sheetName}!O${rowId}:O${rowId}`)).toBe(postal_code);
          
          // Проверяем timestamp в колонке P
          const timestamp = findValue(`${sheetName}!P${rowId}:P${rowId}`);
          expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

          // Очищаем моки для следующей итерации
          mockSheetsBatchUpdate.mockClear();
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Property: Опциональные поля корректно обрабатываются как null
   * 
   * Validates: Requirements 4.3, 4.4
   */
  it('должен корректно обрабатывать null значения для опциональных полей', async () => {
    await fc.assert(
      fc.asyncProperty(
        nameArbitrary,
        nameArbitrary,
        countryArbitrary,
        postalCodeArbitrary,
        cityArbitrary,
        streetArbitrary,
        houseArbitrary,
        phoneArbitrary,
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (
          last_name,
          first_name,
          country,
          postal_code,
          city,
          street,
          house,
          phone,
          telegram_id,
          rowId,
          sheetName
        ) => {
          // Arrange - все опциональные поля null
          const deliveryData: DeliveryData = {
            last_name,
            first_name,
            patronymic: null,
            country,
            postal_code,
            city,
            street,
            house,
            apartment: null,
            phone,
            comment: undefined,
            telegram_id,
          };

          // Act
          await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          const findValue = (range: string) => {
            const entry = data.find((d: any) => d.range === range);
            return entry ? entry.values[0][0] : undefined;
          };
          
          // Проверяем, что null значения сохранены как пустые строки
          expect(findValue(`${sheetName}!G${rowId}:G${rowId}`)).toBe(''); // patronymic
          expect(findValue(`${sheetName}!K${rowId}:K${rowId}`)).toBe(''); // apartment
          expect(findValue(`${sheetName}!M${rowId}:M${rowId}`)).toBe(''); // comment

          // Очищаем моки для следующей итерации
          mockSheetsBatchUpdate.mockClear();
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Property: Все поля сохраняются через batchUpdate с правильными диапазонами
   * 
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
   */
  it('должен использовать batchUpdate для сохранения всех полей включая новые', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          
          // Act
          await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          
          // Проверяем, что используется batchUpdate
          expect(call.requestBody.valueInputOption).toBe('RAW');
          expect(call.requestBody.data).toBeDefined();
          
          // Проверяем, что сохраняется 12 полей (E-O + P для timestamp)
          expect(call.requestBody.data).toHaveLength(12);
          
          // Проверяем наличие новых полей с правильным sheetName
          const ranges = call.requestBody.data.map((d: any) => d.range);
          expect(ranges).toContain(`${sheetName}!N${rowId}:N${rowId}`); // country
          expect(ranges).toContain(`${sheetName}!O${rowId}:O${rowId}`); // postal_code
          expect(ranges).toContain(`${sheetName}!P${rowId}:P${rowId}`); // timestamp
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Property: Timestamp всегда записывается в столбец P
   * 
   * Validates: Requirements 6.5
   */
  it('должен всегда записывать timestamp в столбец P', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          
          // Act
          await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          // Находим запись для timestamp
          const timestampEntry = data.find((d: any) => d.range === `${sheetName}!P${rowId}:P${rowId}`);
          
          // Проверяем, что timestamp записывается в столбец P
          expect(timestampEntry).toBeDefined();
          expect(timestampEntry.range).toBe(`${sheetName}!P${rowId}:P${rowId}`);
          
          // Проверяем, что timestamp - валидная ISO строка
          const timestamp = timestampEntry.values[0][0];
          expect(() => new Date(timestamp)).not.toThrow();
          expect(new Date(timestamp).toISOString()).toBe(timestamp);
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 7:
   * GoogleSheetsClient использует переданный sheet_name в диапазонах
   * 
   * Для любого валидного sheet_name, переданного в saveDeliveryData,
   * GoogleSheetsClient должен использовать его для формирования всех диапазонов
   * ячеек в формате {sheet_name}!{column}{row}.
   * 
   * Validates: Requirements 3.2, 3.5
   */
  it('должен использовать переданный sheet_name во всех диапазонах ячеек', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          
          // Act
          await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          // Проверяем, что все диапазоны начинаются с переданного sheetName
          data.forEach((entry: any) => {
            expect(entry.range).toMatch(new RegExp(`^${sheetName}!`));
          });
          
          // Проверяем конкретные диапазоны
          const ranges = data.map((d: any) => d.range);
          expect(ranges).toContain(`${sheetName}!E${rowId}:E${rowId}`); // last_name
          expect(ranges).toContain(`${sheetName}!F${rowId}:F${rowId}`); // first_name
          expect(ranges).toContain(`${sheetName}!G${rowId}:G${rowId}`); // patronymic
          expect(ranges).toContain(`${sheetName}!H${rowId}:H${rowId}`); // city
          expect(ranges).toContain(`${sheetName}!I${rowId}:I${rowId}`); // street
          expect(ranges).toContain(`${sheetName}!J${rowId}:J${rowId}`); // house
          expect(ranges).toContain(`${sheetName}!K${rowId}:K${rowId}`); // apartment
          expect(ranges).toContain(`${sheetName}!L${rowId}:L${rowId}`); // phone
          expect(ranges).toContain(`${sheetName}!M${rowId}:M${rowId}`); // comment
          expect(ranges).toContain(`${sheetName}!N${rowId}:N${rowId}`); // country
          expect(ranges).toContain(`${sheetName}!O${rowId}:O${rowId}`); // postal_code
          expect(ranges).toContain(`${sheetName}!P${rowId}:P${rowId}`); // timestamp
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 8:
   * GoogleSheetsClient не вызывает getSheetName при явной передаче
   * 
   * Для любого вызова saveDeliveryData с явно переданным sheet_name,
   * метод getSheetName не должен вызываться (оптимизация).
   * 
   * Validates: Requirements 3.3
   */
  it('не должен вызывать getSheetName при явной передаче sheet_name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          mockSheetsGet.mockClear();
          
          // Act
          await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          // Проверяем, что spreadsheets.get вызывается только для проверки существования листа
          // но не для получения имени первого листа
          expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);
          
          // Проверяем, что используется переданный sheetName, а не полученный из API
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          // Все диапазоны должны использовать переданный sheetName
          data.forEach((entry: any) => {
            expect(entry.range).toContain(sheetName);
          });
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 9:
   * GoogleSheetsClient проверяет существование листа
   * 
   * Для любого переданного sheet_name, GoogleSheetsClient должен проверить
   * существование листа в таблице перед сохранением данных.
   * 
   * Validates: Requirements 4.1
   */
  it('должен проверять существование листа перед сохранением данных', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Создаем новый клиент для каждой итерации, чтобы кэш был пустой
          const freshClient = new GoogleSheetsClient('dummy-path', testSpreadsheetId);
          
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          mockSheetsGet.mockClear();
          
          // Act
          await freshClient.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          // Проверяем, что spreadsheets.get был вызван для получения списка листов
          expect(mockSheetsGet).toHaveBeenCalled();
          
          // Проверяем, что batchUpdate был вызван после проверки
          expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 10:
   * GoogleSheetsClient отклоняет несуществующие листы
   * 
   * Для любого sheet_name, который не существует в Google Таблице,
   * GoogleSheetsClient должен выбросить ошибку с сообщением
   * "Sheet '{sheet_name}' not found".
   * 
   * Validates: Requirements 4.2
   */
  it('должен выбрасывать ошибку для несуществующих листов', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        validSheetNameArbitrary.filter(name => 
          !['Sheet1', 'Sheet2', 'Лист1', 'TestSheet'].includes(name)
        ),
        async (deliveryData, rowId, nonExistentSheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          mockSheetsGet.mockClear();
          
          // Act & Assert
          await expect(
            client.saveDeliveryData(rowId, deliveryData, nonExistentSheetName)
          ).rejects.toThrow(`Sheet "${nonExistentSheetName}" does not exist in spreadsheet`);
          
          // Проверяем, что batchUpdate НЕ был вызван
          expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 11:
   * GoogleSheetsClient кэширует проверки существования
   * 
   * Для любого sheet_name, повторная проверка существования листа
   * не должна приводить к повторному запросу к Google Sheets API (используется кэш).
   * 
   * Validates: Requirements 4.3
   */
  it('должен кэшировать проверки существования листов', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Создаем новый клиент для каждой итерации
          const freshClient = new GoogleSheetsClient('dummy-path', testSpreadsheetId);
          
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          mockSheetsGet.mockClear();
          
          // Act - первый вызов
          await freshClient.saveDeliveryData(rowId, deliveryData, sheetName);
          const firstGetCallCount = mockSheetsGet.mock.calls.length;
          
          // Act - второй вызов с тем же sheetName
          mockSheetsBatchUpdate.mockClear();
          mockSheetsGet.mockClear();
          await freshClient.saveDeliveryData(rowId + 1, deliveryData, sheetName);
          const secondGetCallCount = mockSheetsGet.mock.calls.length;
          
          // Assert
          // Первый вызов должен проверить существование листа
          expect(firstGetCallCount).toBeGreaterThan(0);
          
          // Второй вызов НЕ должен проверять существование (используется кэш)
          expect(secondGetCallCount).toBe(0);
          
          // Оба вызова должны успешно сохранить данные
          expect(mockSheetsBatchUpdate).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 21:
   * Round-trip сохранения с динамическим листом
   * 
   * Для любого валидного sheet_name, row_id и delivery_data,
   * сохранение данных через saveDeliveryData должно привести к тому,
   * что данные окажутся на указанном листе в указанной строке.
   * 
   * Validates: Requirements 3.2, 3.5
   */
  it('должен сохранять данные на указанный лист в указанную строку', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          
          // Act
          const result = await client.saveDeliveryData(rowId, deliveryData, sheetName);

          // Assert
          expect(result).toBe(true);
          
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          // Проверяем, что все данные сохранены на правильный лист и в правильную строку
          data.forEach((entry: any) => {
            // Каждый диапазон должен начинаться с sheetName
            expect(entry.range).toMatch(new RegExp(`^${sheetName}!`));
            
            // Каждый диапазон должен содержать правильный rowId
            // Формат диапазона: Sheet1!E1:E1, где оба числа - это rowId
            expect(entry.range).toMatch(new RegExp(`${rowId}:.*${rowId}$`));
          });
          
          // Проверяем, что данные сохранены в правильном формате
          expect(call.spreadsheetId).toBe(testSpreadsheetId);
          expect(call.requestBody.valueInputOption).toBe('RAW');
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 22:
   * Идемпотентность сохранения на динамический лист
   * 
   * Для любого набора данных (sheet_name, row_id, delivery_data),
   * повторное сохранение тех же данных должно давать тот же результат
   * (перезапись данных в тех же ячейках).
   * 
   * Validates: Requirements 3.2, 3.5
   */
  it('должен идемпотентно сохранять данные при повторных вызовах', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
          country: countryArbitrary,
          postal_code: postalCodeArbitrary,
          city: cityArbitrary,
          street: streetArbitrary,
          house: houseArbitrary,
          apartment: fc.option(apartmentArbitrary, { nil: null }),
          phone: phoneArbitrary,
          comment: fc.option(commentArbitrary, { nil: undefined }),
          telegram_id: fc.integer({ min: 1, max: 1000000 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom('Sheet1', 'Sheet2', 'Лист1', 'TestSheet'),
        async (deliveryData, rowId, sheetName) => {
          // Очищаем моки перед тестом
          mockSheetsBatchUpdate.mockClear();
          
          // Act - первое сохранение
          const result1 = await client.saveDeliveryData(rowId, deliveryData, sheetName);
          const call1 = mockSheetsBatchUpdate.mock.calls[0][0];
          
          // Act - второе сохранение тех же данных
          mockSheetsBatchUpdate.mockClear();
          const result2 = await client.saveDeliveryData(rowId, deliveryData, sheetName);
          const call2 = mockSheetsBatchUpdate.mock.calls[0][0];

          // Assert
          expect(result1).toBe(true);
          expect(result2).toBe(true);
          
          // Проверяем, что оба вызова используют одинаковые диапазоны
          const ranges1 = call1.requestBody.data.map((d: any) => d.range).sort();
          const ranges2 = call2.requestBody.data.map((d: any) => d.range).sort();
          
          // Исключаем timestamp из сравнения (он всегда разный)
          const rangesWithoutTimestamp1 = ranges1.filter((r: string) => !r.includes('!P'));
          const rangesWithoutTimestamp2 = ranges2.filter((r: string) => !r.includes('!P'));
          
          expect(rangesWithoutTimestamp1).toEqual(rangesWithoutTimestamp2);
          
          // Проверяем, что значения одинаковые (кроме timestamp)
          const values1 = call1.requestBody.data
            .filter((d: any) => !d.range.includes('!P'))
            .map((d: any) => ({ range: d.range, value: d.values[0][0] }))
            .sort((a: any, b: any) => a.range.localeCompare(b.range));
            
          const values2 = call2.requestBody.data
            .filter((d: any) => !d.range.includes('!P'))
            .map((d: any) => ({ range: d.range, value: d.values[0][0] }))
            .sort((a: any, b: any) => a.range.localeCompare(b.range));
          
          expect(values1).toEqual(values2);
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });
});
