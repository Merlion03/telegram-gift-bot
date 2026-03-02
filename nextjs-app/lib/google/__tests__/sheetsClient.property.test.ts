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

describe('GoogleSheetsClient - Property-Based Tests', () => {
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

          // Проверяем, что update был вызван дважды (данные + timestamp)
          expect(mockSheetsUpdate).toHaveBeenCalledTimes(2);

          // Проверяем первый вызов (сохранение данных доставки)
          const firstCall = mockSheetsUpdate.mock.calls[0][0];
          
          // Проверяем диапазон
          expect(firstCall.range).toBe(`Sheet1!E${rowId}:M${rowId}`);
          
          // Проверяем сохраненные значения
          const savedValues = firstCall.requestBody.values[0];
          
          expect(savedValues[0]).toBe(last_name);
          expect(savedValues[1]).toBe(first_name);
          expect(savedValues[2]).toBe(patronymic || '');
          expect(savedValues[3]).toBe(city);
          expect(savedValues[4]).toBe(street);
          expect(savedValues[5]).toBe(house);
          expect(savedValues[6]).toBe(apartment || '');
          expect(savedValues[7]).toBe(phone);
          expect(savedValues[8]).toBe(comment || '');

          // Проверяем второй вызов (сохранение timestamp)
          const secondCall = mockSheetsUpdate.mock.calls[1][0];
          expect(secondCall.range).toBe(`Sheet1!N${rowId}`);
          expect(secondCall.requestBody.values[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

          // Очищаем моки для следующей итерации
          mockSheetsUpdate.mockClear();
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
        cityArbitrary,
        streetArbitrary,
        houseArbitrary,
        phoneArbitrary,
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 1000 }),
        async (
          last_name,
          first_name,
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
          const firstCall = mockSheetsUpdate.mock.calls[0][0];
          const savedValues = firstCall.requestBody.values[0];
          
          // Проверяем, что null значения сохранены как пустые строки
          expect(savedValues[2]).toBe(''); // patronymic
          expect(savedValues[6]).toBe(''); // apartment
          expect(savedValues[8]).toBe(''); // comment

          // Очищаем моки для следующей итерации
          mockSheetsUpdate.mockClear();
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Property: Диапазон столбцов всегда E-M независимо от данных
   * 
   * Validates: Requirements 4.2
   */
  it('должен всегда использовать диапазон E-M для сохранения данных', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
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
          const firstCall = mockSheetsUpdate.mock.calls[0][0];
          
          // Проверяем, что диапазон всегда E-M
          expect(firstCall.range).toBe(`Sheet1!E${rowId}:M${rowId}`);
          
          // Проверяем, что всегда сохраняется ровно 9 значений
          expect(firstCall.requestBody.values[0]).toHaveLength(9);

          // Очищаем моки для следующей итерации
          mockSheetsUpdate.mockClear();
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  /**
   * Property: Timestamp всегда записывается в столбец N
   * 
   * Validates: Requirements 4.2
   */
  it('должен всегда записывать timestamp в столбец N', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          last_name: nameArbitrary,
          first_name: nameArbitrary,
          patronymic: fc.option(nameArbitrary, { nil: null }),
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
          const secondCall = mockSheetsUpdate.mock.calls[1][0];
          
          // Проверяем, что timestamp записывается в столбец N
          expect(secondCall.range).toBe(`Sheet1!N${rowId}`);
          
          // Проверяем, что timestamp - валидная ISO строка
          const timestamp = secondCall.requestBody.values[0][0];
          expect(() => new Date(timestamp)).not.toThrow();
          expect(new Date(timestamp).toISOString()).toBe(timestamp);

          // Очищаем моки для следующей итерации
          mockSheetsUpdate.mockClear();
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });
});
