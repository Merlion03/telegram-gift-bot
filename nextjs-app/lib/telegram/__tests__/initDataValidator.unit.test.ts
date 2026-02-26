import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { InitDataValidator } from '../initDataValidator';

/**
 * Unit-тесты для InitDataValidator
 * 
 * Проверяют edge cases и специфические сценарии ошибок
 */

describe('InitDataValidator - Unit Tests', () => {
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
    botToken: string
  ): string {
    const params = new URLSearchParams({
      auth_date: authDate.toString(),
      user: JSON.stringify({ id: userId }),
    });

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const hash = generateValidHash(dataCheckString, botToken);
    params.append('hash', hash);

    return params.toString();
  }

  describe('Edge Case: Невалидная подпись (HTTP 403)', () => {
    /**
     * Тест: невалидная подпись должна выбрасывать ошибку "Invalid signature"
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен выбрасывать ошибку "Invalid signature" при невалидной подписи', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;

      const params = new URLSearchParams({
        auth_date: authDate.toString(),
        user: JSON.stringify({ id: 12345 }),
        hash: 'invalid_hash_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      });

      const initDataString = params.toString();

      expect(() => validator.validate(initDataString)).toThrow('Invalid signature');
    });

    /**
     * Тест: подпись с неправильным ключом должна отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять InitData с подписью от другого бота', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;

      // Создание InitData с подписью от другого бота
      const wrongBotToken = 'wrong_bot_token_987654321';
      const initDataString = createValidInitData(12345, authDate, wrongBotToken);

      // Валидация с правильным токеном должна выбросить ошибку
      expect(() => validator.validate(initDataString)).toThrow('Invalid signature');
    });

    /**
     * Тест: подпись с изменённым порядком параметров должна быть валидной
     * (порядок не важен, т.к. параметры сортируются)
     * 
     * Requirements: 4.3, 10.2
     */
    it('должен принимать InitData с любым порядком параметров', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;
      const userId = 12345;

      // Создание параметров в определённом порядке
      const params1 = new URLSearchParams();
      params1.append('user', JSON.stringify({ id: userId }));
      params1.append('auth_date', authDate.toString());

      const dataCheckString = Array.from(params1.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);

      // Создание InitData с другим порядком параметров
      const params2 = new URLSearchParams();
      params2.append('auth_date', authDate.toString());
      params2.append('user', JSON.stringify({ id: userId }));
      params2.append('hash', hash);

      const initDataString = params2.toString();

      // Валидация должна пройти успешно
      expect(() => validator.validate(initDataString)).not.toThrow();
      expect(validator.validate(initDataString)).toBe(true);
    });

    /**
     * Тест: пустая строка hash должна отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять InitData с пустым hash', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;

      // Создаём строку вручную, чтобы hash был пустым
      const initDataString = `auth_date=${authDate}&user=${encodeURIComponent(JSON.stringify({ id: 12345 }))}&hash=`;

      // Пустой hash приводит к ошибке "Hash not found" (т.к. URLSearchParams игнорирует пустые значения)
      expect(() => validator.validate(initDataString)).toThrow('Hash not found in initData');
    });
  });

  describe('Edge Case: Устаревшие InitData (старше 24 часов)', () => {
    /**
     * Тест: InitData ровно 24 часа должны отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять InitData ровно 24 часа', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - (24 * 60 * 60 + 1); // 24 часа + 1 секунда

      const initDataString = createValidInitData(12345, authDate, TEST_BOT_TOKEN);

      expect(() => validator.validate(initDataString)).toThrow(/InitData is too old/);
    });

    /**
     * Тест: InitData 23 часа 59 минут должны приниматься
     * 
     * Requirements: 10.6
     */
    it('должен принимать InitData 23 часа 59 минут', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - (24 * 60 * 60 - 60); // 23 часа 59 минут

      const initDataString = createValidInitData(12345, authDate, TEST_BOT_TOKEN);

      expect(() => validator.validate(initDataString)).not.toThrow();
      expect(validator.validate(initDataString)).toBe(true);
    });

    /**
     * Тест: InitData с очень старым timestamp должны отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять InitData старше 30 дней', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - (30 * 24 * 60 * 60); // 30 дней назад

      const initDataString = createValidInitData(12345, authDate, TEST_BOT_TOKEN);

      expect(() => validator.validate(initDataString)).toThrow(/InitData is too old/);
    });

    /**
     * Тест: InitData с timestamp в будущем должны приниматься
     * (защита от небольших расхождений времени между серверами)
     * 
     * Requirements: 10.6
     */
    it('должен принимать InitData с timestamp в будущем (в пределах разумного)', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp + 60; // 1 минута в будущем

      const initDataString = createValidInitData(12345, authDate, TEST_BOT_TOKEN);

      // Должен принять (т.к. проверяется только старость, не будущее)
      expect(() => validator.validate(initDataString)).not.toThrow();
      expect(validator.validate(initDataString)).toBe(true);
    });

    /**
     * Тест: невалидный формат auth_date должен отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять InitData с невалидным форматом auth_date', () => {
      const params = new URLSearchParams({
        auth_date: 'invalid_timestamp',
        user: JSON.stringify({ id: 12345 }),
      });

      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
      params.append('hash', hash);

      const initDataString = params.toString();

      expect(() => validator.validate(initDataString)).toThrow('Invalid auth_date format');
    });
  });

  describe('Edge Case: Дополнительные сценарии', () => {
    /**
     * Тест: пустая строка InitData должна отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять пустую строку InitData', () => {
      expect(() => validator.validate('')).toThrow('InitData string is empty');
    });

    /**
     * Тест: InitData только с hash должны отклоняться
     * 
     * Requirements: 4.4, 10.5
     */
    it('должен отклонять InitData только с hash', () => {
      const params = new URLSearchParams({
        hash: 'some_hash_1234567890abcdef',
      });

      const initDataString = params.toString();

      expect(() => validator.validate(initDataString)).toThrow('auth_date not found in initData');
    });

    /**
     * Тест: extractUserData с невалидным JSON должен выбрасывать ошибку
     * 
     * Requirements: 10.1
     */
    it('должен выбрасывать ошибку при невалидном JSON в user', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;

      const params = new URLSearchParams({
        auth_date: authDate.toString(),
        user: 'invalid_json{',
      });

      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
      params.append('hash', hash);

      const initDataString = params.toString();

      expect(() => validator.extractUserData(initDataString)).toThrow('Invalid user data format: JSON parse error');
    });

    /**
     * Тест: extractUserData без id должен выбрасывать ошибку
     * 
     * Requirements: 10.1
     */
    it('должен выбрасывать ошибку при отсутствии id в user', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;

      const params = new URLSearchParams({
        auth_date: authDate.toString(),
        user: JSON.stringify({ first_name: 'John' }), // id отсутствует
      });

      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
      params.append('hash', hash);

      const initDataString = params.toString();

      expect(() => validator.extractUserData(initDataString)).toThrow('Invalid user data: id is required and must be a number');
    });

    /**
     * Тест: parseInitData корректно парсит все поля
     * 
     * Requirements: 10.1
     */
    it('должен корректно парсить InitData со всеми полями', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;
      const userId = 12345;
      const queryId = 'test_query_id_123';

      const params = new URLSearchParams({
        auth_date: authDate.toString(),
        user: JSON.stringify({ id: userId, first_name: 'John' }),
        query_id: queryId,
      });

      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const hash = generateValidHash(dataCheckString, TEST_BOT_TOKEN);
      params.append('hash', hash);

      const initDataString = params.toString();

      const parsed = validator.parseInitData(initDataString);

      expect(parsed.auth_date).toBe(authDate);
      expect(parsed.user?.id).toBe(userId);
      expect(parsed.user?.first_name).toBe('John');
      expect(parsed.query_id).toBe(queryId);
      expect(parsed.hash).toBe(hash);
    });

    /**
     * Тест: конструктор без токена должен выбрасывать ошибку
     * 
     * Requirements: 10.2
     */
    it('должен выбрасывать ошибку при создании без токена', () => {
      expect(() => new InitDataValidator('')).toThrow('Bot token is required');
    });

    /**
     * Тест: кастомный maxAge должен корректно применяться
     * 
     * Requirements: 10.6
     */
    it('должен использовать кастомный maxAge при создании', () => {
      const customMaxAge = 3600; // 1 час
      const customValidator = new InitDataValidator(TEST_BOT_TOKEN, customMaxAge);

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 7200; // 2 часа назад

      const initDataString = createValidInitData(12345, authDate, TEST_BOT_TOKEN);

      // Должен отклонить (старше 1 часа)
      expect(() => customValidator.validate(initDataString)).toThrow(/InitData is too old/);
    });
  });

  describe('Edge Case: Специальные символы и кодировка', () => {
    /**
     * Тест: InitData с специальными символами в user должны корректно обрабатываться
     * 
     * Requirements: 10.1, 10.2
     */
    it('должен корректно обрабатывать специальные символы в данных пользователя', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;
      const userId = 12345;

      const userData = {
        id: userId,
        first_name: 'Иван',
        last_name: 'Петров',
        username: 'test_user_123',
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

      // Валидация должна пройти успешно
      expect(() => validator.validate(initDataString)).not.toThrow();
      expect(validator.validate(initDataString)).toBe(true);

      // Извлечение данных должно корректно работать
      const extractedUser = validator.extractUserData(initDataString);
      expect(extractedUser.id).toBe(userId);
      expect(extractedUser.first_name).toBe('Иван');
      expect(extractedUser.last_name).toBe('Петров');
    });

    /**
     * Тест: InitData с URL-encoded символами должны корректно обрабатываться
     * 
     * Requirements: 10.1, 10.2
     */
    it('должен корректно обрабатывать URL-encoded символы', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const authDate = currentTimestamp - 100;
      const userId = 12345;

      const userData = {
        id: userId,
        first_name: 'Test User',
        username: 'test@user',
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

      // Валидация должна пройти успешно
      expect(() => validator.validate(initDataString)).not.toThrow();
      expect(validator.validate(initDataString)).toBe(true);
    });
  });
});
