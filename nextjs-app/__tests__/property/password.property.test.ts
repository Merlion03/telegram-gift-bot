/**
 * Property-тесты для PasswordHasher
 * Property 12: Пароли всегда хешируются
 * Property 16: Уникальность солей
 * Validates: Requirements 8.2, 9.1, 13.2, 13.3
 * 
 * Эти тесты проверяют, что:
 * 1. Пароли никогда не хранятся в открытом виде
 * 2. Хеши начинаются с префикса $argon2id$
 * 3. Каждый хеш использует уникальную соль
 * 4. Один пароль хешируется в разные хеши при повторном хешировании
 */

import { describe, it, expect } from 'vitest';
import { fc } from '@fast-check/vitest';
import { PasswordHasher } from '@/lib/services/passwordHasher';

/**
 * Генератор для валидных паролей (минимум 8 символов)
 */
const passwordArbitrary = fc.string({ minLength: 8, maxLength: 128 });

/**
 * Генератор для коротких паролей (1-7 символов)
 */
const shortPasswordArbitrary = fc.string({ minLength: 1, maxLength: 7 });

describe('Property 12: Пароли всегда хешируются', () => {
  /**
   * Проверяет, что hashPassword никогда не возвращает открытый пароль
   * Requirements: 8.2, 9.1, 13.3
   */
  it('hashPassword никогда не возвращает открытый пароль', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();
        const hash = await hasher.hashPassword(password);

        // Проверяем, что хеш не равен открытому паролю
        expect(hash).not.toBe(password);

        // Проверяем, что хеш не содержит открытый пароль как подстроку
        expect(hash.includes(password)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что хеши начинаются с префикса $argon2id$
   * Requirements: 13.3
   */
  it('хеши начинаются с префикса $argon2id$', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();
        const hash = await hasher.hashPassword(password);

        // Проверяем префикс Argon2id
        expect(hash.startsWith('$argon2id$')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что хеш имеет достаточную длину
   * Requirements: 13.3
   */
  it('хеш имеет достаточную длину', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();
        const hash = await hasher.hashPassword(password);

        // Argon2id хеш должен быть достаточно длинным (минимум 50 символов)
        expect(hash.length).toBeGreaterThan(50);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что верификация работает корректно для правильного пароля
   * Requirements: 9.1, 9.2
   */
  it('верификация работает корректно для правильного пароля', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();
        const hash = await hasher.hashPassword(password);

        // Верификация с правильным паролем должна вернуть true
        const isValid = await hasher.verifyPassword(hash, password);
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что верификация отклоняет неправильный пароль
   * Requirements: 9.3, 9.4
   */
  it('верификация отклоняет неправильный пароль', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordArbitrary,
        passwordArbitrary,
        async (correctPassword, wrongPassword) => {
          // Пропускаем случай, когда пароли совпадают
          fc.pre(correctPassword !== wrongPassword);

          const hasher = new PasswordHasher();
          const hash = await hasher.hashPassword(correctPassword);

          // Верификация с неправильным паролем должна вернуть false
          const isValid = await hasher.verifyPassword(hash, wrongPassword);
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что пустой пароль вызывает ошибку
   * Requirements: 13.3
   */
  it('пустой пароль вызывает ошибку', async () => {
    const hasher = new PasswordHasher();

    // Пустая строка должна вызвать ошибку
    await expect(hasher.hashPassword('')).rejects.toThrow();

    // Строка из пробелов должна вызвать ошибку
    await expect(hasher.hashPassword('   ')).rejects.toThrow();
  });
});

describe('Property 16: Уникальность солей', () => {
  /**
   * Проверяет, что один пароль хешируется в разные хеши
   * Requirements: 13.2
   */
  it('один пароль хешируется в разные хеши при повторном хешировании', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();

        // Хешируем один пароль дважды
        const hash1 = await hasher.hashPassword(password);
        const hash2 = await hasher.hashPassword(password);

        // Хеши должны различаться (разные соли)
        expect(hash1).not.toBe(hash2);

        // Но оба хеша должны верифицироваться с исходным паролем
        const isValid1 = await hasher.verifyPassword(hash1, password);
        const isValid2 = await hasher.verifyPassword(hash2, password);

        expect(isValid1).toBe(true);
        expect(isValid2).toBe(true);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Проверяет, что разные пароли дают разные хеши
   * Requirements: 13.2
   */
  it('разные пароли дают разные хеши', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordArbitrary,
        passwordArbitrary,
        async (password1, password2) => {
          // Пропускаем случай, когда пароли совпадают
          fc.pre(password1 !== password2);

          const hasher = new PasswordHasher();

          const hash1 = await hasher.hashPassword(password1);
          const hash2 = await hasher.hashPassword(password2);

          // Хеши разных паролей должны различаться
          expect(hash1).not.toBe(hash2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что множественное хеширование одного пароля даёт уникальные хеши
   * Requirements: 13.2
   */
  it('множественное хеширование одного пароля даёт уникальные хеши', { timeout: 60000 }, async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();

        // Хешируем один пароль 5 раз
        const hashes = await Promise.all([
          hasher.hashPassword(password),
          hasher.hashPassword(password),
          hasher.hashPassword(password),
          hasher.hashPassword(password),
          hasher.hashPassword(password),
        ]);

        // Все хеши должны быть уникальными
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(5);

        // Все хеши должны верифицироваться с исходным паролем
        for (const hash of hashes) {
          const isValid = await hasher.verifyPassword(hash, password);
          expect(isValid).toBe(true);
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Проверяет инвариант: round-trip хеширования и верификации
   * Requirements: 8.2, 9.1, 9.2
   */
  it('round-trip хеширования и верификации сохраняет корректность', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher();

        // Хешируем пароль
        const hash = await hasher.hashPassword(password);

        // Верифицируем с исходным паролем
        const isValid = await hasher.verifyPassword(hash, password);

        // Верификация должна быть успешной
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что хеши содержат информацию о параметрах
   * Requirements: 13.2
   */
  it('хеши содержат информацию о параметрах Argon2id', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArbitrary, async (password) => {
        const hasher = new PasswordHasher({
          timeCost: 2,
          memoryCost: 65536,
          parallelism: 4,
        });

        const hash = await hasher.hashPassword(password);

        // Argon2id хеш содержит параметры в формате:
        // $argon2id$v=19$m=65536,t=2,p=4$...
        expect(hash).toMatch(/\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/);
      }),
      { numRuns: 100 }
    );
  });
});
