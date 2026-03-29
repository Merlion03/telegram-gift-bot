/**
 * Сервис безопасного хеширования паролей через Argon2id
 * Использует библиотеку argon2 для Node.js
 */

import * as argon2 from 'argon2';

/**
 * Конфигурация параметров Argon2id
 * Соответствует рекомендациям OWASP
 */
export interface Argon2Config {
  /** Количество итераций (по умолчанию 2) */
  timeCost?: number;
  
  /** Объём памяти в КБ (по умолчанию 65536 = 64 MB) */
  memoryCost?: number;
  
  /** Количество параллельных потоков (по умолчанию 4) */
  parallelism?: number;
  
  /** Длина хеша в байтах (по умолчанию 32) */
  hashLength?: number;
  
  /** Длина соли в байтах (по умолчанию 16) */
  saltLength?: number;
}

/**
 * PasswordHasher - сервис хеширования паролей
 */
export class PasswordHasher {
  private config: Required<Argon2Config>;

  /**
   * Создаёт экземпляр PasswordHasher с заданной конфигурацией
   * @param config - Конфигурация Argon2id (опционально)
   */
  constructor(config?: Argon2Config) {
    this.config = {
      timeCost: config?.timeCost ?? 2,
      memoryCost: config?.memoryCost ?? 65536, // 64 MB
      parallelism: config?.parallelism ?? 4,
      hashLength: config?.hashLength ?? 32,
      saltLength: config?.saltLength ?? 16,
    };
  }

  /**
   * Хеширует пароль с автоматической генерацией соли
   * @param password - Открытый пароль
   * @returns Хеш пароля в формате Argon2id
   */
  async hashPassword(password: string): Promise<string> {
    if (!password || password.trim().length === 0) {
      throw new Error('Password cannot be empty');
    }

    try {
      const hash = await argon2.hash(password, {
        type: argon2.argon2id,
        timeCost: this.config.timeCost,
        memoryCost: this.config.memoryCost,
        parallelism: this.config.parallelism,
        hashLength: this.config.hashLength,
      });

      return hash;
    } catch (error) {
      console.error('Error hashing password:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Верифицирует пароль против хеша
   * @param passwordHash - Хеш пароля из БД
   * @param password - Открытый пароль для проверки
   * @returns true если пароль совпадает
   */
  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    if (!passwordHash || passwordHash.trim().length === 0) {
      throw new Error('Password hash cannot be empty');
    }

    if (!password || password.trim().length === 0) {
      throw new Error('Password cannot be empty');
    }

    try {
      const isValid = await argon2.verify(passwordHash, password);
      return isValid;
    } catch (error) {
      // argon2.verify выбрасывает исключение при невалидном хеше
      // Возвращаем false вместо пробрасывания ошибки
      console.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Проверяет, нужно ли перехешировать пароль
   * (если параметры хеширования изменились)
   * @param passwordHash - Хеш пароля из БД
   * @returns true если нужно перехешировать
   */
  needsRehash(passwordHash: string): boolean {
    if (!passwordHash || passwordHash.trim().length === 0) {
      throw new Error('Password hash cannot be empty');
    }

    try {
      const needsRehash = argon2.needsRehash(passwordHash, {
        timeCost: this.config.timeCost,
        memoryCost: this.config.memoryCost,
        parallelism: this.config.parallelism,
      });

      return needsRehash;
    } catch (error) {
      console.error('Error checking if password needs rehash:', error);
      return false;
    }
  }
}

/**
 * Создаёт экземпляр PasswordHasher с конфигурацией по умолчанию
 */
export function createPasswordHasher(config?: Argon2Config): PasswordHasher {
  return new PasswordHasher(config);
}
