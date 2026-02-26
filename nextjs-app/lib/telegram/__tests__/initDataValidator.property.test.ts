import { describe, it, expect, beforeEach } from 'vitest';
import { fc } from '@fast-check/vitest';
import crypto from 'crypto';
import { InitDataValidator } from '../initDataValidator';

/**
 * Property-based тесты для InitDataValidator
 * 
 * Проверяют корректность криптографической валидации InitData
 * и проверки срока действия данных
 */

describe('InitDataValidator - Property-Based Tests', () => {
  const TEST_BOT_TOKEN = 'test_bot_token_123456789';
  let validator: InitDataValidator;

  beforeEach(() => {
    validator = new InitDataValidator(TEST_BOT_TOKEN);
  });

  /**
   * Вспомогательная функция для генерации валидного hash
   */
  function generateValidHash(dataCheckString: string, botToken: string): string {
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    return crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
  }

  /**
   * Вспомогательная функция для создания валидного InitData
   */
  function createValidInitData(
    userId: number,
    authDate: number,
    botToken: string,
    additionalParams: Record<string, string> = {}
  ): string {
    const params = new URLSearchParams({
      auth_date: authDate.toString(),
      user: JSON.stringify({ id: userId }),
      ...additionalParams,
    });

    // Сортировка параметров для data-check-string
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const hash = generateValidHash(dataCheckString, botToken);
    params.append('hash', hash);

    return params.toString();
  }

  describe('Property 7: Криптографическая валидация InitData', () => {
    /**
     * Property: Валидный InitData с корректной подписью всегда проходит валидацию
     * 
     * Validates: Requirements 4.3, 10.2, 10.3
     */
    it('должен принимать любой валидный InitData с корректной подписью', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.record({
            query_id: fc.option(fc.uuid(), { nil: undefined }),
            first_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            username: fc.option(fc.string({ minLength: 3, maxLength: 32 }), { nil: undefined }),
          }),
          (userId, additionalData) => {
            // Генерация текущего timestamp (в пределах допустимого времени)
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - fc.sample(fc.integer({ min: 0, max: 3600 }), 1)[0]; // в пределах 1 часа

            // Создание дополнительных параметров
            const params: Record<string, string> = {};
            if (additionalData.query_id) {
              params.query_id = additionalData.query_id;
            }

            // Создание валидного InitData
            const initDataString = createValidInitData(userId, authDate, TEST_BOT_TOKEN, params);

            // Валидация должна пройти успешно
            expect(() => validator.validate(initDataString)).not.toThrow();
            expect(validator.validate(initDataString)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: InitData с невалидной подписью всегда отклоняется
     * 
     * Validates: Requirements 4.3, 10.2, 10.3
     */
    it('должен отклонять InitData с невалидной подписью', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.hexaString({ minLength: 64, maxLength: 64 }), // случайный hash
          (userId, randomHash) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;

            const params = new URLSearchParams({
              auth_date: authDate.toString(),
              user: JSON.stringify({ id: userId }),
              hash: randomHash, // Невалидный hash
            });

            const initDataString = params.toString();

            // Валидация должна выбросить ошибку
            expect(() => validator.validate(initDataString)).toThrow('Invalid signature');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Изменение любого параметра делает подпись невалидной
     * 
     * Validates: Requirements 4.3, 10.2, 10.3
     */
    it('должен отклонять InitData при изменении любого параметра', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.integer({ min: 1, max: 999999999 }), // modified user_id
          (userId, modifiedUserId) => {
            // Пропускаем случай, когда ID совпадают
            fc.pre(userId !== modifiedUserId);

            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;

            // Создание валидного InitData
            const validInitData = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            // Изменение user_id в InitData (подпись остаётся прежней)
            const params = new URLSearchParams(validInitData);
            params.set('user', JSON.stringify({ id: modifiedUserId }));

            const modifiedInitData = params.toString();

            // Валидация должна выбросить ошибку
            expect(() => validator.validate(modifiedInitData)).toThrow('Invalid signature');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: InitData без hash отклоняется
     * 
     * Validates: Requirements 4.3, 10.2
     */
    it('должен отклонять InitData без hash', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          (userId) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;

            const params = new URLSearchParams({
              auth_date: authDate.toString(),
              user: JSON.stringify({ id: userId }),
              // hash отсутствует
            });

            const initDataString = params.toString();

            // Валидация должна выбросить ошибку
            expect(() => validator.validate(initDataString)).toThrow('Hash not found in initData');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 24: Проверка срока действия InitData', () => {
    /**
     * Property: InitData старше maxAge всегда отклоняется
     * 
     * Validates: Requirements 10.6
     */
    it('должен отклонять InitData старше maxAge', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.integer({ min: 24 * 60 * 60 + 1, max: 30 * 24 * 60 * 60 }), // age в секундах (больше 24 часов)
          (userId, age) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - age;

            // Создание валидного InitData с устаревшим timestamp
            const initDataString = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            // Валидация должна выбросить ошибку о устаревших данных
            expect(() => validator.validate(initDataString)).toThrow(/InitData is too old/);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: InitData в пределах maxAge всегда принимается (при валидной подписи)
     * 
     * Validates: Requirements 10.6
     */
    it('должен принимать InitData в пределах maxAge', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.integer({ min: 0, max: 24 * 60 * 60 - 1 }), // age в секундах (меньше 24 часов)
          (userId, age) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - age;

            // Создание валидного InitData
            const initDataString = createValidInitData(userId, authDate, TEST_BOT_TOKEN);

            // Валидация должна пройти успешно
            expect(() => validator.validate(initDataString)).not.toThrow();
            expect(validator.validate(initDataString)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: InitData без auth_date отклоняется
     * 
     * Validates: Requirements 10.6
     */
    it('должен отклонять InitData без auth_date', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          (userId) => {
            const params = new URLSearchParams({
              user: JSON.stringify({ id: userId }),
              // auth_date отсутствует
            });

            // Генерация hash (хотя он будет невалидным без auth_date)
            const dataCheckString = Array.from(params.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => `${key}=${value}`)
              .join('\n');

            const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
            params.append('hash', hash);

            const initDataString = params.toString();

            // Валидация должна выбросить ошибку
            expect(() => validator.validate(initDataString)).toThrow('auth_date not found in initData');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Кастомный maxAge корректно применяется
     * 
     * Validates: Requirements 10.6
     */
    it('должен корректно применять кастомный maxAge', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.integer({ min: 60, max: 3600 }), // custom maxAge (от 1 минуты до 1 часа)
          (userId, customMaxAge) => {
            const customValidator = new InitDataValidator(TEST_BOT_TOKEN, customMaxAge);

            const currentTimestamp = Math.floor(Date.now() / 1000);
            
            // Создание InitData чуть старше customMaxAge
            const oldAuthDate = currentTimestamp - customMaxAge - 10;
            const oldInitData = createValidInitData(userId, oldAuthDate, TEST_BOT_TOKEN);

            // Должен отклонить устаревшие данные
            expect(() => customValidator.validate(oldInitData)).toThrow(/InitData is too old/);

            // Создание InitData в пределах customMaxAge
            const validAuthDate = currentTimestamp - customMaxAge + 10;
            const validInitData = createValidInitData(userId, validAuthDate, TEST_BOT_TOKEN);

            // Должен принять свежие данные
            expect(() => customValidator.validate(validInitData)).not.toThrow();
            expect(customValidator.validate(validInitData)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Извлечение данных пользователя', () => {
    /**
     * Property: extractUserData корректно извлекает данные пользователя
     * 
     * Validates: Requirements 10.1
     */
    it('должен корректно извлекать данные пользователя из валидного InitData', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }), // user_id
          fc.string({ minLength: 1, maxLength: 50 }), // first_name
          fc.option(fc.string({ minLength: 3, maxLength: 32 }), { nil: undefined }), // username
          (userId, firstName, username) => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;

            const userData = {
              id: userId,
              first_name: firstName,
              ...(username && { username }),
            };

            const params = new URLSearchParams({
              auth_date: authDate.toString(),
              user: JSON.stringify(userData),
            });

            const dataCheckString = Array.from(params.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => `${key}=${value}`)
              .join('\n');

            const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
            params.append('hash', hash);

            const initDataString = params.toString();

            // Извлечение данных пользователя
            const extractedUser = validator.extractUserData(initDataString);

            // Проверка корректности извлечённых данных
            expect(extractedUser.id).toBe(userId);
            expect(extractedUser.first_name).toBe(firstName);
            if (username) {
              expect(extractedUser.username).toBe(username);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: extractUserData выбрасывает ошибку при отсутствии user
     * 
     * Validates: Requirements 10.1
     */
    it('должен выбрасывать ошибку при отсутствии данных пользователя', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const authDate = currentTimestamp - 100;

            const params = new URLSearchParams({
              auth_date: authDate.toString(),
              // user отсутствует
            });

            const dataCheckString = Array.from(params.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => `${key}=${value}`)
              .join('\n');

            const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
            params.append('hash', hash);

            const initDataString = params.toString();

            // Должен выбросить ошибку
            expect(() => validator.extractUserData(initDataString)).toThrow('User data not found in initData');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
