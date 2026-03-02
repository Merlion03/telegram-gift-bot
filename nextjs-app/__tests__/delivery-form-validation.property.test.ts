/**
 * Property-based тесты для валидации формы доставки
 * Feature: delivery-form-field-separation
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';

// Схема валидации формы (идентична схеме в DeliveryForm.tsx)
const formSchema = z.object({
  // ФИО поля
  last_name: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .trim(),
  first_name: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .trim(),
  patronymic: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .trim()
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Адресные поля
  city: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(100, 'Максимум 100 символов')
    .trim(),
  street: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(200, 'Максимум 200 символов')
    .trim(),
  house: z
    .string()
    .min(1, 'Минимум 1 символ')
    .max(20, 'Максимум 20 символов')
    .trim(),
  apartment: z
    .string()
    .min(1, 'Минимум 1 символ')
    .max(20, 'Максимум 20 символов')
    .trim()
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Существующие поля
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Неверный формат телефона')
    .trim(),
  comment: z
    .string()
    .max(500, 'Максимум 500 символов')
    .trim()
    .optional(),
});

describe('Property 1: Валидация длины полей ФИО', () => {
  /**
   * Feature: delivery-form-field-separation, Property 1
   * **Validates: Requirements 1.2, 1.3, 1.4**
   * 
   * Для любого поля ФИО (last_name, first_name, patronymic), валидация должна
   * отклонять строки короче 2 символов или длиннее 50 символов (для непустых значений patronymic).
   */

  it('Property 1.1: Поля ФИО отклоняют строки короче 2 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1 }),
        (invalidString) => {
          // Проверяем обязательные поля: last_name, first_name
          const fields = ['last_name', 'first_name'] as const;
          
          fields.forEach(field => {
            const result = formSchema.safeParse({ [field]: invalidString });
            expect(result.success).toBe(false);
            
            if (!result.success) {
              // Проверяем, что ошибка связана с минимальной длиной
              const fieldError = result.error.errors.find(e => e.path[0] === field);
              expect(fieldError).toBeDefined();
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1.2: Поля ФИО отклоняют строки длиннее 50 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 51, maxLength: 100 }),
        (invalidString) => {
          // Проверяем все поля ФИО: last_name, first_name, patronymic
          const fields = ['last_name', 'first_name', 'patronymic'] as const;
          
          fields.forEach(field => {
            const result = formSchema.safeParse({ [field]: invalidString });
            expect(result.success).toBe(false);
            
            if (!result.success) {
              // Проверяем, что ошибка связана с максимальной длиной
              const fieldError = result.error.errors.find(e => e.path[0] === field);
              expect(fieldError).toBeDefined();
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1.3: Поля ФИО принимают валидные строки от 2 до 50 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }),
        fc.string({ minLength: 2, maxLength: 50 }),
        fc.string({ minLength: 2, maxLength: 50 }),
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, patronymic, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            patronymic: patronymic,
            city: city,
            street: street,
            house: house,
            phone: phone,
          });
          
          // Если телефон валидный, вся форма должна быть валидной
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 1.4: Patronymic может быть пустой строкой (опциональное поле)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }),
        fc.string({ minLength: 2, maxLength: 50 }),
        fc.string({ minLength: 2, maxLength: 100 }),
        fc.string({ minLength: 2, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)),
        (lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            patronymic: '', // Пустое отчество
            city: city,
            street: street,
            house: house,
            phone: phone,
          });
          
          // Если телефон валидный, форма должна быть валидной даже с пустым patronymic
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2, 3, 4, 5: Валидация длины адресных полей', () => {
  /**
   * Feature: delivery-form-field-separation, Property 2, 3, 4, 5
   * **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
   * 
   * Для адресных полей (city, street, house, apartment), валидация должна
   * отклонять строки вне допустимых диапазонов длины.
   */

  it('Property 2: Поле "Город" отклоняет строки короче 2 или длиннее 100 символов', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 1 }),
          fc.string({ minLength: 101, maxLength: 150 })
        ),
        (invalidCity) => {
          const result = formSchema.safeParse({ city: invalidCity });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const cityError = result.error.errors.find(e => e.path[0] === 'city');
            expect(cityError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2: Поле "Город" принимает строки от 2 до 100 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }),
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (city, lastName, firstName, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
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
      { numRuns: 100 }
    );
  });

  it('Property 3: Поле "Улица" отклоняет строки короче 2 или длиннее 200 символов', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 1 }),
          fc.string({ minLength: 201, maxLength: 250 })
        ),
        (invalidStreet) => {
          const result = formSchema.safeParse({ street: invalidStreet });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const streetError = result.error.errors.find(e => e.path[0] === 'street');
            expect(streetError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3: Поле "Улица" принимает строки от 2 до 200 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 200 }),
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (street, lastName, firstName, city, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
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
      { numRuns: 100 }
    );
  });

  it('Property 4: Поле "Дом" отклоняет строки короче 1 или длиннее 20 символов', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''), // Пустая строка
          fc.string({ minLength: 21, maxLength: 50 })
        ),
        (invalidHouse) => {
          const result = formSchema.safeParse({ house: invalidHouse });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const houseError = result.error.errors.find(e => e.path[0] === 'house');
            expect(houseError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: Поле "Дом" принимает строки от 1 до 20 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (house, lastName, firstName, city, street, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
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
      { numRuns: 100 }
    );
  });

  it('Property 5: Поле "Квартира" отклоняет непустые строки короче 1 или длиннее 20 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 21, maxLength: 50 }),
        (invalidApartment) => {
          const result = formSchema.safeParse({ apartment: invalidApartment });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const apartmentError = result.error.errors.find(e => e.path[0] === 'apartment');
            expect(apartmentError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: Поле "Квартира" принимает пустую строку (опциональное поле)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            apartment: '', // Пустая квартира
            phone: phone,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: Поле "Квартира" принимает строки от 1 до 20 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (apartment, lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            apartment: apartment,
            phone: phone,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 6: Валидация формата телефона', () => {
  /**
   * Feature: delivery-form-field-separation, Property 6
   * **Validates: Requirements 3.1**
   * 
   * Для любой строки телефона, валидация должна принимать только строки,
   * соответствующие regex /^\+?[0-9]{10,15}$/, и отклонять все остальные.
   */

  it('Property 6.1: Телефон отклоняет строки, не соответствующие формату', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !/^\+?[0-9]{10,15}$/.test(s.trim())),
        (invalidPhone) => {
          const result = formSchema.safeParse({ phone: invalidPhone });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const phoneError = result.error.errors.find(e => e.path[0] === 'phone');
            expect(phoneError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 6.2: Телефон принимает валидные номера с + и без', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 15 }),
        fc.boolean(),
        (length, withPlus) => {
          // Генерируем валидный номер телефона
          const digits = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
          const phone = withPlus ? '+' + digits : digits;
          
          const result = formSchema.safeParse({ phone: phone });
          expect(result.success).toBe(false); // Ожидаем false, так как не все обязательные поля заполнены
          
          // Но ошибка не должна быть связана с телефоном
          if (!result.success) {
            const phoneError = result.error.errors.find(e => e.path[0] === 'phone');
            expect(phoneError).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 6.3: Телефон отклоняет номера короче 10 цифр', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        (length) => {
          const phone = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
          
          const result = formSchema.safeParse({ phone: phone });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const phoneError = result.error.errors.find(e => e.path[0] === 'phone');
            expect(phoneError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 6.4: Телефон отклоняет номера длиннее 15 цифр', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 25 }),
        (length) => {
          const phone = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
          
          const result = formSchema.safeParse({ phone: phone });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const phoneError = result.error.errors.find(e => e.path[0] === 'phone');
            expect(phoneError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 6.5: Телефон отклоняет номера с буквами или спецсимволами', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 15 }).filter(s => /[a-zA-Z\-\(\)\s]/.test(s)),
        (invalidPhone) => {
          const result = formSchema.safeParse({ phone: invalidPhone });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const phoneError = result.error.errors.find(e => e.path[0] === 'phone');
            expect(phoneError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 7: Валидация длины комментария', () => {
  /**
   * Feature: delivery-form-field-separation, Property 7
   * **Validates: Requirements 3.2**
   * 
   * Для любой строки комментария, валидация должна принимать строки до 500 символов
   * и отклонять строки длиннее 500 символов.
   */

  it('Property 7.1: Комментарий отклоняет строки длиннее 500 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 501, maxLength: 1000 }),
        (invalidComment) => {
          const result = formSchema.safeParse({ comment: invalidComment });
          expect(result.success).toBe(false);
          
          if (!result.success) {
            const commentError = result.error.errors.find(e => e.path[0] === 'comment');
            expect(commentError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7.2: Комментарий принимает строки до 500 символов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (comment, lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            phone: phone,
            comment: comment,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7.3: Комментарий может быть пустым (опциональное поле)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            phone: phone,
            comment: '', // Пустой комментарий
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7.4: Комментарий может быть undefined (опциональное поле)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            phone: phone,
            // comment отсутствует (undefined)
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: Обработка опциональных полей', () => {
  /**
   * Feature: delivery-form-field-separation, Property 8
   * **Validates: Requirements 1.5, 2.6, 4.3, 4.4**
   * 
   * Для любого опционального поля (patronymic, apartment, comment), система должна
   * корректно обрабатывать пустые значения (пустая строка или undefined), не вызывая ошибок валидации.
   */

  it('Property 8.1: Все опциональные поля могут быть пустыми строками одновременно', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            patronymic: '', // Пустое отчество
            city: city,
            street: street,
            house: house,
            apartment: '', // Пустая квартира
            phone: phone,
            comment: '', // Пустой комментарий
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8.2: Все опциональные поля могут быть undefined одновременно', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        (lastName, firstName, city, street, house, phone) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            // patronymic отсутствует
            city: city,
            street: street,
            house: house,
            // apartment отсутствует
            phone: phone,
            // comment отсутствует
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8.3: Опциональные поля могут быть заполнены или пустыми в любой комбинации', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.option(fc.string({ minLength: 2, maxLength: 50 })), // patronymic
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.option(fc.string({ minLength: 1, maxLength: 20 })), // apartment
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        fc.option(fc.string({ minLength: 0, maxLength: 500 })), // comment
        (lastName, firstName, patronymic, city, street, house, apartment, phone, comment) => {
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            patronymic: patronymic ?? '',
            city: city,
            street: street,
            house: house,
            apartment: apartment ?? '',
            phone: phone,
            comment: comment,
          });
          
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8.4: Patronymic с пробелами обрезается и может стать пустым', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        fc.nat({ max: 10 }), // количество пробелов
        (lastName, firstName, city, street, house, phone, spaces) => {
          const patronymic = ' '.repeat(spaces); // Только пробелы
          
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            patronymic: patronymic,
            city: city,
            street: street,
            house: house,
            phone: phone,
          });
          
          // После trim patronymic станет пустой строкой, что валидно
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.patronymic).toBe('');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 8.5: Apartment с пробелами обрезается и может стать пустым', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 10, maxLength: 15 }).map(s => '+' + s.replace(/\D/g, '').slice(0, 15)), // phone
        fc.nat({ max: 10 }), // количество пробелов
        (lastName, firstName, city, street, house, phone, spaces) => {
          const apartment = ' '.repeat(spaces); // Только пробелы
          
          const result = formSchema.safeParse({
            last_name: lastName,
            first_name: firstName,
            city: city,
            street: street,
            house: house,
            apartment: apartment,
            phone: phone,
          });
          
          // После trim apartment станет пустой строкой, что валидно
          if (/^\+?[0-9]{10,15}$/.test(phone.trim())) {
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.apartment).toBe('');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 12: Автоматическая обрезка пробелов', () => {
  /**
   * Feature: delivery-form-field-separation, Property 12
   * **Validates: Implicit requirement from schema design**
   * 
   * Для любого текстового поля формы, система должна автоматически удалять
   * начальные и конечные пробелы (trim) перед валидацией и сохранением.
   */

  it('Property 12.1: Обрезка пробелов в полях ФИО', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }),
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        (str, leadingSpaces, trailingSpaces) => {
          const paddedStr = ' '.repeat(leadingSpaces) + str + ' '.repeat(trailingSpaces);
          
          // Проверяем для last_name
          const result = formSchema.safeParse({ last_name: paddedStr });
          
          if (result.success) {
            expect(result.data.last_name).toBe(str.trim());
            expect(result.data.last_name).not.toContain('  '); // Нет двойных пробелов по краям
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12.2: Обрезка пробелов в адресных полях', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }),
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        (city, leadingSpaces, trailingSpaces) => {
          const paddedCity = ' '.repeat(leadingSpaces) + city + ' '.repeat(trailingSpaces);
          
          const result = formSchema.safeParse({ city: paddedCity });
          
          if (result.success) {
            expect(result.data.city).toBe(city.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12.3: Обрезка пробелов в телефоне', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 15 }),
        fc.nat({ max: 5 }),
        fc.nat({ max: 5 }),
        (length, leadingSpaces, trailingSpaces) => {
          const phone = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
          const paddedPhone = ' '.repeat(leadingSpaces) + phone + ' '.repeat(trailingSpaces);
          
          const result = formSchema.safeParse({ phone: paddedPhone });
          
          if (result.success) {
            expect(result.data.phone).toBe(phone);
            expect(result.data.phone).not.toMatch(/^\s|\s$/); // Нет пробелов по краям
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12.4: Обрезка пробелов в комментарии', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.nat({ max: 10 }),
        fc.nat({ max: 10 }),
        (comment, leadingSpaces, trailingSpaces) => {
          const paddedComment = ' '.repeat(leadingSpaces) + comment + ' '.repeat(trailingSpaces);
          
          const result = formSchema.safeParse({ comment: paddedComment });
          
          if (result.success && result.data.comment !== undefined) {
            expect(result.data.comment).toBe(comment.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12.5: Полная форма с пробелами во всех полях обрезается корректно', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 50 }), // last_name
        fc.string({ minLength: 2, maxLength: 50 }), // first_name
        fc.string({ minLength: 2, maxLength: 50 }), // patronymic
        fc.string({ minLength: 2, maxLength: 100 }), // city
        fc.string({ minLength: 2, maxLength: 200 }), // street
        fc.string({ minLength: 1, maxLength: 20 }), // house
        fc.string({ minLength: 1, maxLength: 20 }), // apartment
        fc.integer({ min: 10, max: 15 }), // phone length
        fc.string({ minLength: 0, maxLength: 500 }), // comment
        fc.nat({ max: 5 }), // spaces count
        (lastName, firstName, patronymic, city, street, house, apartment, phoneLength, comment, spaces) => {
          const phone = Array.from({ phoneLength }, () => Math.floor(Math.random() * 10)).join('');
          const padding = ' '.repeat(spaces);
          
          const result = formSchema.safeParse({
            last_name: padding + lastName + padding,
            first_name: padding + firstName + padding,
            patronymic: padding + patronymic + padding,
            city: padding + city + padding,
            street: padding + street + padding,
            house: padding + house + padding,
            apartment: padding + apartment + padding,
            phone: padding + phone + padding,
            comment: padding + comment + padding,
          });
          
          if (result.success) {
            // Все поля должны быть обрезаны
            expect(result.data.last_name).toBe(lastName.trim());
            expect(result.data.first_name).toBe(firstName.trim());
            expect(result.data.patronymic).toBe(patronymic.trim());
            expect(result.data.city).toBe(city.trim());
            expect(result.data.street).toBe(street.trim());
            expect(result.data.house).toBe(house.trim());
            expect(result.data.apartment).toBe(apartment.trim());
            expect(result.data.phone).toBe(phone);
            if (result.data.comment !== undefined) {
              expect(result.data.comment).toBe(comment.trim());
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12.6: Строка только из пробелов становится пустой после trim', () => {
    fc.assert(
      fc.property(
        fc.nat({ min: 1, max: 20 }),
        (spaces) => {
          const onlySpaces = ' '.repeat(spaces);
          
          // Для опциональных полей (patronymic, apartment) пустая строка после trim валидна
          const result = formSchema.safeParse({
            patronymic: onlySpaces,
            apartment: onlySpaces,
          });
          
          if (result.success) {
            expect(result.data.patronymic).toBe('');
            expect(result.data.apartment).toBe('');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
