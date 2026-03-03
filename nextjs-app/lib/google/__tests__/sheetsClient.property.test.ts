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

  /**
   * Генератор валидных строк для полей ФИО
   */
  const nameArbitrary = fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2);

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
          rowId
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
          const result = await client.saveDeliveryData(rowId, deliveryData);

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

          expect(findValue(`Sheet1!E${rowId}`)).toBe(last_name);
          expect(findValue(`Sheet1!F${rowId}`)).toBe(first_name);
          expect(findValue(`Sheet1!G${rowId}`)).toBe(patronymic || '');
          expect(findValue(`Sheet1!H${rowId}`)).toBe(city);
          expect(findValue(`Sheet1!I${rowId}`)).toBe(street);
          expect(findValue(`Sheet1!J${rowId}`)).toBe(house);
          expect(findValue(`Sheet1!K${rowId}`)).toBe(apartment || '');
          expect(findValue(`Sheet1!L${rowId}`)).toBe(phone);
          expect(findValue(`Sheet1!M${rowId}`)).toBe(comment || '');
          expect(findValue(`Sheet1!N${rowId}`)).toBe(country);
          expect(findValue(`Sheet1!O${rowId}`)).toBe(postal_code);
          
          // Проверяем timestamp в колонке P
          const timestamp = findValue(`Sheet1!P${rowId}`);
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
          rowId
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
          await client.saveDeliveryData(rowId, deliveryData);

          // Assert
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          const findValue = (range: string) => {
            const entry = data.find((d: any) => d.range === range);
            return entry ? entry.values[0][0] : undefined;
          };
          
          // Проверяем, что null значения сохранены как пустые строки
          expect(findValue(`Sheet1!G${rowId}`)).toBe(''); // patronymic
          expect(findValue(`Sheet1!K${rowId}`)).toBe(''); // apartment
          expect(findValue(`Sheet1!M${rowId}`)).toBe(''); // comment

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
        async (deliveryData, rowId) => {
          // Act
          await client.saveDeliveryData(rowId, deliveryData);

          // Assert
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          
          // Проверяем, что используется batchUpdate
          expect(call.requestBody.valueInputOption).toBe('RAW');
          expect(call.requestBody.data).toBeDefined();
          
          // Проверяем, что сохраняется 12 полей (E-O + P для timestamp)
          expect(call.requestBody.data).toHaveLength(12);
          
          // Проверяем наличие новых полей
          const ranges = call.requestBody.data.map((d: any) => d.range);
          expect(ranges).toContain(`Sheet1!N${rowId}`); // country
          expect(ranges).toContain(`Sheet1!O${rowId}`); // postal_code
          expect(ranges).toContain(`Sheet1!P${rowId}`); // timestamp

          // Очищаем моки для следующей итерации
          mockSheetsBatchUpdate.mockClear();
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
        async (deliveryData, rowId) => {
          // Act
          await client.saveDeliveryData(rowId, deliveryData);

          // Assert
          const call = mockSheetsBatchUpdate.mock.calls[0][0];
          const data = call.requestBody.data;
          
          // Находим запись для timestamp
          const timestampEntry = data.find((d: any) => d.range === `Sheet1!P${rowId}`);
          
          // Проверяем, что timestamp записывается в столбец P
          expect(timestampEntry).toBeDefined();
          expect(timestampEntry.range).toBe(`Sheet1!P${rowId}`);
          
          // Проверяем, что timestamp - валидная ISO строка
          const timestamp = timestampEntry.values[0][0];
          expect(() => new Date(timestamp)).not.toThrow();
          expect(new Date(timestamp).toISOString()).toBe(timestamp);

          // Очищаем моки для следующей итерации
          mockSheetsBatchUpdate.mockClear();
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });
});
