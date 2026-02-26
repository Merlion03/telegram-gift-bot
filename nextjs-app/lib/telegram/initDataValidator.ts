import crypto from 'crypto';

/**
 * Интерфейс для данных пользователя из InitData
 */
export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

/**
 * Интерфейс для валидированных InitData
 */
export interface ValidatedInitData {
  query_id?: string;
  user?: TelegramUser;
  auth_date: number;
  hash: string;
  [key: string]: string | number | TelegramUser | undefined;
}

/**
 * Класс для криптографической валидации InitData от Telegram WebApp
 * 
 * Реализует проверку подписи согласно документации Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export class InitDataValidator {
  private botToken: string;
  private maxAge: number; // в секундах

  /**
   * Создаёт экземпляр валидатора
   * 
   * @param botToken - Токен Telegram бота
   * @param maxAge - Максимальный возраст InitData в секундах (по умолчанию 24 часа)
   */
  constructor(botToken: string, maxAge: number = 24 * 60 * 60) {
    if (!botToken) {
      throw new Error('Bot token is required');
    }
    this.botToken = botToken;
    this.maxAge = maxAge;
  }

  /**
   * Валидирует InitData от Telegram WebApp
   * 
   * Выполняет:
   * 1. Проверку наличия обязательных полей (hash, auth_date)
   * 2. Проверку срока действия (не старше maxAge)
   * 3. Криптографическую проверку подписи
   * 
   * @param initDataString - Строка InitData от клиента
   * @returns true если подпись валидна
   * @throws Error если подпись невалидна или данные устарели
   */
  validate(initDataString: string): boolean {
    if (!initDataString) {
      throw new Error('InitData string is empty');
    }

    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');

    if (!hash) {
      throw new Error('Hash not found in initData');
    }

    // Проверка timestamp (не старше maxAge)
    const authDate = params.get('auth_date');
    if (!authDate) {
      throw new Error('auth_date not found in initData');
    }

    const authTimestamp = parseInt(authDate, 10);
    if (isNaN(authTimestamp)) {
      throw new Error('Invalid auth_date format');
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (currentTimestamp - authTimestamp > this.maxAge) {
      throw new Error(`InitData is too old (age: ${currentTimestamp - authTimestamp}s, max: ${this.maxAge}s)`);
    }

    // Удаление hash из параметров для проверки подписи
    params.delete('hash');

    // Сортировка параметров и создание data-check-string
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Вычисление ожидаемого hash согласно алгоритму Telegram
    // Шаг 1: HMAC-SHA256 строки "WebAppData" с ключом bot_token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(this.botToken)
      .digest();

    // Шаг 2: HMAC-SHA256 data-check-string с ключом из шага 1
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Сравнение hash (constant-time comparison для защиты от timing attacks)
    if (!this.constantTimeCompare(hash, expectedHash)) {
      throw new Error('Invalid signature');
    }

    return true;
  }

  /**
   * Извлекает данные пользователя из InitData
   * 
   * @param initDataString - Строка InitData от клиента
   * @returns Объект с данными пользователя
   * @throws Error если данные пользователя отсутствуют или невалидны
   */
  extractUserData(initDataString: string): TelegramUser {
    const params = new URLSearchParams(initDataString);
    const userString = params.get('user');

    if (!userString) {
      throw new Error('User data not found in initData');
    }

    try {
      const userData = JSON.parse(userString) as TelegramUser;

      // Валидация обязательного поля id
      if (typeof userData.id !== 'number') {
        throw new Error('Invalid user data: id is required and must be a number');
      }

      return userData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid user data format: JSON parse error');
      }
      throw error;
    }
  }

  /**
   * Парсит InitData в структурированный объект
   * 
   * @param initDataString - Строка InitData от клиента
   * @returns Объект с распарсенными данными
   */
  parseInitData(initDataString: string): ValidatedInitData {
    const params = new URLSearchParams(initDataString);
    const result: ValidatedInitData = {
      hash: params.get('hash') || '',
      auth_date: parseInt(params.get('auth_date') || '0', 10),
    };

    // Парсинг опциональных полей
    const queryId = params.get('query_id');
    if (queryId) {
      result.query_id = queryId;
    }

    const userString = params.get('user');
    if (userString) {
      try {
        result.user = JSON.parse(userString) as TelegramUser;
      } catch {
        // Игнорируем ошибки парсинга, поле опциональное
      }
    }

    // Добавление остальных параметров
    params.forEach((value, key) => {
      if (!['hash', 'auth_date', 'query_id', 'user'].includes(key)) {
        result[key] = value;
      }
    });

    return result;
  }

  /**
   * Constant-time сравнение строк для защиты от timing attacks
   * 
   * @param a - Первая строка
   * @param b - Вторая строка
   * @returns true если строки равны
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}
