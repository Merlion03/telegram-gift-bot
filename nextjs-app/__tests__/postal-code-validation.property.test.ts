/**
 * Property-based тесты для валидации почтовых индексов
 * Feature: delivery-form-country-postal-fields
 * Task 9: Написать property-based тесты для валидации почтовых индексов
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';

// Схема валидации для country и postal_code (идентична схеме в DeliveryForm.tsx)
const postalCodeSchema = z.object({
  country: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(100, 'Максимум 100 символов'),
  postal_code: z
    .string()
    .trim()
    .min(3, 'Минимум 3 символа')
    .max(20, 'Максимум 20 символов'),
});

// Полная схема формы для интеграционных тестов
const fullFormSchema = z.object({
  last_name: z.string().trim().min(2).max(50),
  first_name: z.string().trim().min(2).max(50),
  patronymic: z.string().trim().min(2).max(50).optional().or(z.literal('')),
  country: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(3).max(20),
  city: z.string().trim().min(2).max(100),
  street: z.string().trim().min(2).max(200),
  house: z.string().trim().min(1).max(20),
  apartment: z.string().trim().min(1).max(20).optional().or(z.literal('')),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  comment: z.string().trim().max(500).optional(),
});

describe('Property 1: Валидация длины почтового индекса', () => {
  /**
   * Feature: delivery-form-country-postal-fields, Property 1
   * **Validates: Requirements 2.3, 2.5, 2.6**
   * 
   * Для поля postal_code, валидация должна отклонять строки короче 3 символов
   * или длиннее 20 символов, и принимать строки в диапазоне 3-20 символов.
   */

  it('Property 1.1: Почтовый индекс отклоняет строки короче 3 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2 }),
        (invalidPostalCode) => {
          const result = postalCodeSchema.safeParse({ postal_code: invalidPostalCode });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const postalCodeError = result.error.errors.find(e => e.path[0] === 'postal_code');
            expect(postalCodeError).toBeDefined();
            expect(postalCodeError?.message).toContain('Минимум 3 символа');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1.2: Почтовый индекс отклоняет строки длиннее 20 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 21, maxLength: 50 }).filter(s => s.trim().length > 20),
        (invalidPostalCode) => {
          const result = postalCodeSchema.safeParse({ postal_code: invalidPostalCode });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const postalCodeError = result.error.errors.find(e => e.path[0] === 'postal_code');
            expect(postalCodeError).toBeDefined();
            expect(postalCodeError?.message).toContain('Максимум 20 символов');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1.3: Почтовый индекс принимает строки от 3 до 20 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3),
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2), // country
        (postalCode, country) => {
          const result = postalCodeSchema.safeParse({
            postal_code: postalCode,
            country: country,
          });
          
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.postal_code).toBe(postalCode.trim());
            expect(result.data.postal_code.length).toBeGreaterThanOrEqual(3);
            expect(result.data.postal_code.length).toBeLessThanOrEqual(20);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 1.4: Почтовый индекс с пробелами обрезается и валидируется по длине после trim', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 })
          .filter(s => {
            const trimmed = s.trim();
            return trimmed.length >= 3 && trimmed.length <= 20;
          }),
        fc.nat({ max: 10 }), // количество пробелов в начале
        fc.nat({ max: 10 }), // количество пробелов в конце
        fc.string({ minLength: 2, maxLength: 100 })
          .filter(s => s.trim().length >= 2), // country
        (postalCode, leadingSpaces, trailingSpaces, country) => {
          const paddedPostalCode = ' '.repeat(leadingSpaces) + postalCode + ' '.repeat(trailingSpaces);
          
          const result = postalCodeSchema.safeParse({ 
            postal_code: paddedPostalCode,
            country: country
          });
          
          // После trim длина валидна (3-20), должно быть успешно
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.postal_code).toBe(postalCode.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Поддержка международных форматов почтовых индексов', () => {
  /**
   * Feature: delivery-form-country-postal-fields, Property 2
   * **Validates: Requirements 2.8**
   * 
   * Для поля postal_code, валидация должна принимать различные международные
   * форматы почтовых индексов: российский, американский, канадский, британский.
   */

  // Генераторы для различных форматов почтовых индексов
  const russianPostalCode = fc.integer({ min: 100000, max: 999999 }).map(n => n.toString());
  
  const usPostalCode = fc.oneof(
    fc.integer({ min: 10000, max: 99999 }).map(n => n.toString()),
    fc.tuple(
      fc.integer({ min: 10000, max: 99999 }),
      fc.integer({ min: 1000, max: 9999 })
    ).map(([zip, plus4]) => `${zip}-${plus4}`)
  );
  
  const canadianPostalCode = fc.tuple(
    fc.constantFrom('A', 'B', 'C', 'E', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'X', 'Y'),
    fc.integer({ min: 0, max: 9 }),
    fc.constantFrom('A', 'B', 'C', 'E', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'),
    fc.integer({ min: 0, max: 9 }),
    fc.constantFrom('A', 'B', 'C', 'E', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'),
    fc.integer({ min: 0, max: 9 })
  ).map(([l1, n1, l2, n2, l3, n3]) => `${l1}${n1}${l2} ${n2}${l3}${n3}`);
  
  const ukPostalCode = fc.oneof(
    // Формат: A9 9AA
    fc.tuple(
      fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'),
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 9 }),
      fc.constantFrom('A', 'B', 'D', 'E', 'F', 'G', 'H', 'J', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'),
      fc.constantFrom('A', 'B', 'D', 'E', 'F', 'G', 'H', 'J', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z')
    ).map(([l1, n1, n2, l2, l3]) => `${l1}${n1} ${n2}${l2}${l3}`),
    // Формат: AA9 9AA
    fc.tuple(
      fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'),
      fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'),
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 9 }),
      fc.constantFrom('A', 'B', 'D', 'E', 'F', 'G', 'H', 'J', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'),
      fc.constantFrom('A', 'B', 'D', 'E', 'F', 'G', 'H', 'J', 'L', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z')
    ).map(([l1, l2, n1, n2, l3, l4]) => `${l1}${l2}${n1} ${n2}${l3}${l4}`)
  );

  it('Property 2.1: Российские почтовые индексы (6 цифр) проходят валидацию', () => {
    fc.assert(
      fc.property(
        russianPostalCode,
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2), // country
        (postalCode, country) => {
          const result = postalCodeSchema.safeParse({
            postal_code: postalCode,
            country: country,
          });
          
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.postal_code).toBe(postalCode);
            expect(result.data.postal_code).toMatch(/^\d{6}$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2.2: Американские почтовые индексы (ZIP и ZIP+4) проходят валидацию', () => {
    fc.assert(
      fc.property(
        usPostalCode,
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2), // country
        (postalCode, country) => {
          const result = postalCodeSchema.safeParse({
            postal_code: postalCode,
            country: country,
          });
          
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.postal_code).toBe(postalCode);
            // Проверяем формат: либо 5 цифр, либо 5 цифр-4 цифры
            expect(result.data.postal_code).toMatch(/^\d{5}(-\d{4})?$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2.3: Канадские почтовые индексы (A1A 1A1) проходят валидацию', () => {
    fc.assert(
      fc.property(
        canadianPostalCode,
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2), // country
        (postalCode, country) => {
          const result = postalCodeSchema.safeParse({
            postal_code: postalCode,
            country: country,
          });
          
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.postal_code).toBe(postalCode);
            // Проверяем формат: буква-цифра-буква пробел цифра-буква-цифра
            expect(result.data.postal_code).toMatch(/^[A-Z]\d[A-Z] \d[A-Z]\d$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2.4: Британские почтовые индексы (SW1A 1AA) проходят валидацию', () => {
    fc.assert(
      fc.property(
        ukPostalCode,
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2), // country
        (postalCode, country) => {
          const result = postalCodeSchema.safeParse({
            postal_code: postalCode,
            country: country,
          });
          
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.postal_code).toBe(postalCode);
            // Проверяем, что это валидный британский формат
            expect(result.data.postal_code.length).toBeGreaterThanOrEqual(6);
            expect(result.data.postal_code.length).toBeLessThanOrEqual(8);
            expect(result.data.postal_code).toContain(' ');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2.5: Все международные форматы проходят валидацию в полной форме', () => {
    fc.assert(
      fc.property(
        fc.oneof(russianPostalCode, usPostalCode, canadianPostalCode, ukPostalCode),
        fc.string({ minLength: 2, maxLength: 100 }), // country
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (postalCode, country, lastName, firstName, city, street, house, phone) => {
          const result = fullFormSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            country: country,
            postal_code: postalCode,
            city: city,
            street: street,
            house: house,
            phone: phone,
          });
          
          // Если телефон валидный, вся форма должна быть валидной
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.postal_code).toBe(postalCode.trim());
              expect(result.data.country).toBe(country.trim());
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('Property 3: Валидация поля "Страна"', () => {
  /**
   * Feature: delivery-form-country-postal-fields
   * **Validates: Requirements 1.3, 1.5, 1.6**
   * 
   * Для поля country, валидация должна отклонять строки короче 2 символов
   * или длиннее 100 символов, и принимать строки в диапазоне 2-100 символов.
   */

  it('Property 3.1: Страна отклоняет строки короче 2 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1 }),
        (invalidCountry) => {
          const result = postalCodeSchema.safeParse({ country: invalidCountry });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const countryError = result.error.errors.find(e => e.path[0] === 'country');
            expect(countryError).toBeDefined();
            expect(countryError?.message).toContain('Минимум 2 символа');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3.2: Страна отклоняет строки длиннее 100 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 150 }).filter(s => s.trim().length > 100),
        (invalidCountry) => {
          const result = postalCodeSchema.safeParse({ country: invalidCountry });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const countryError = result.error.errors.find(e => e.path[0] === 'country');
            expect(countryError).toBeDefined();
            expect(countryError?.message).toContain('Максимум 100 символов');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3.3: Страна принимает строки от 2 до 100 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
        fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3), // postal_code
        (country, postalCode) => {
          const result = postalCodeSchema.safeParse({
            country: country,
            postal_code: postalCode,
          });
          
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.country).toBe(country.trim());
            expect(result.data.country.length).toBeGreaterThanOrEqual(2);
            expect(result.data.country.length).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 3.4: Страна с пробелами обрезается и валидируется по длине после trim', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }),
        fc.nat({ max: 10 }), // количество пробелов в начале
        fc.nat({ max: 10 }), // количество пробелов в конце
        (country, leadingSpaces, trailingSpaces) => {
          const paddedCountry = ' '.repeat(leadingSpaces) + country + ' '.repeat(trailingSpaces);
          
          const result = postalCodeSchema.safeParse({ country: paddedCountry });
          
          // Если после trim длина валидна (2-100), должно быть успешно
          const trimmed = country.trim();
          if (trimmed.length >= 2 && trimmed.length <= 100) {
            expect(result.success).toBe(false); // false потому что postal_code отсутствует
            // Но ошибка не должна быть связана с country
            if (!result.success) {
              const countryError = result.error.errors.find(e => e.path[0] === 'country');
              expect(countryError).toBeUndefined();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 4: Обязательность полей country и postal_code', () => {
  /**
   * Feature: delivery-form-country-postal-fields
   * **Validates: Requirements 1.2, 2.2**
   * 
   * Поля country и postal_code являются обязательными и не могут быть пустыми.
   */

  it('Property 4.1: Форма отклоняет отсутствующее поле country', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 }), // postal_code
        (postalCode) => {
          const result = postalCodeSchema.safeParse({
            postal_code: postalCode,
            // country отсутствует
          });
          
          expect(result.success).toBe(false);
          if (!result.success) {
            const countryError = result.error.errors.find(e => e.path[0] === 'country');
            expect(countryError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.2: Форма отклоняет отсутствующее поле postal_code', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }), // country
        (country) => {
          const result = postalCodeSchema.safeParse({
            country: country,
            // postal_code отсутствует
          });
          
          expect(result.success).toBe(false);
          if (!result.success) {
            const postalCodeError = result.error.errors.find(e => e.path[0] === 'postal_code');
            expect(postalCodeError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.3: Форма отклоняет пустую строку для country', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 }), // postal_code
        (postalCode) => {
          const result = postalCodeSchema.safeParse({
            country: '',
            postal_code: postalCode,
          });
          
          expect(result.success).toBe(false);
          if (!result.success) {
            const countryError = result.error.errors.find(e => e.path[0] === 'country');
            expect(countryError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.4: Форма отклоняет пустую строку для postal_code', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }), // country
        (country) => {
          const result = postalCodeSchema.safeParse({
            country: country,
            postal_code: '',
          });
          
          expect(result.success).toBe(false);
          if (!result.success) {
            const postalCodeError = result.error.errors.find(e => e.path[0] === 'postal_code');
            expect(postalCodeError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4.5: Форма отклоняет строки только из пробелов для country и postal_code', () => {
    fc.assert(
      fc.property(
        fc.nat({ min: 1, max: 20 }), // количество пробелов для country
        fc.nat({ min: 1, max: 20 }), // количество пробелов для postal_code
        (countrySpaces, postalCodeSpaces) => {
          const result = postalCodeSchema.safeParse({
            country: ' '.repeat(countrySpaces),
            postal_code: ' '.repeat(postalCodeSpaces),
          });
          
          // После trim оба поля станут пустыми строками, что невалидно
          expect(result.success).toBe(false);
          if (!result.success) {
            // Должна быть хотя бы одна ошибка (может быть для одного или обоих полей)
            expect(result.error.errors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 5: Интеграция с полной формой', () => {
  /**
   * Feature: delivery-form-country-postal-fields
   * **Validates: Requirements 8.1, 8.2**
   * 
   * Новые поля country и postal_code должны корректно интегрироваться с
   * существующими полями формы без нарушения обратной совместимости.
   */

  it('Property 5.1: Полная форма с валидными country и postal_code проходит валидацию', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // country
        fc.string({ minLength: 3, maxLength: 20 }), // postal_code
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, country, postalCode, city, street, house, phone) => {
          const result = fullFormSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            country: country,
            postal_code: postalCode,
            city: city,
            street: street,
            house: house,
            phone: phone,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 5.2: Форма с опциональными полями и новыми обязательными полями работает корректно', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.option(fc.string({ minLength: 2, maxLength: 50 })), // patronymic
        fc.string({ minLength: 2, maxLength: 100 }), // country
        fc.string({ minLength: 3, maxLength: 20 }), // postal_code
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.option(fc.string({ minLength: 1, maxLength: 20 })), // apartment
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        fc.option(fc.string({ minLength: 0, maxLength: 500 })), // comment
        (lastName, firstName, patronymic, country, postalCode, city, street, house, apartment, phone, comment) => {
          const result = fullFormSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            patronymic: patronymic ?? '',
            country: country,
            postal_code: postalCode,
            city: city,
            street: street,
            house: house,
            apartment: apartment ?? '',
            phone: phone,
            comment: comment,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
            if (result.success) {
              // Проверяем, что новые поля присутствуют в результате
              expect(result.data.country).toBeDefined();
              expect(result.data.postal_code).toBeDefined();
              expect(result.data.country).toBe(country.trim());
              expect(result.data.postal_code).toBe(postalCode.trim());
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 5.3: Порядок полей не влияет на валидацию', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // country
        fc.string({ minLength: 3, maxLength: 20 }), // postal_code
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, country, postalCode, city, street, house, phone) => {
          // Проверяем разные порядки полей
          const result1 = fullFormSchema.safeParse({
            country: country,
            postal_code: postalCode,
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            phone: phone,
          });
          
          const result2 = fullFormSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            phone: phone,
            country: country,
            postal_code: postalCode,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result1.success).toBe(result2.success);
            if (result1.success && result2.success) {
              expect(result1.data.country).toBe(result2.data.country);
              expect(result1.data.postal_code).toBe(result2.data.postal_code);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
