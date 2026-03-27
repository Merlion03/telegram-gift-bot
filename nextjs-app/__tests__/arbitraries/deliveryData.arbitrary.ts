import * as fc from 'fast-check';
import { DeliveryData } from '@/types/delivery';

/**
 * Генератор валидных данных доставки для property-based тестирования
 * 
 * Генерирует случайные данные, соответствующие схеме валидации DeliveryData:
 * - Обязательные поля: last_name, first_name, country, postal_code, city, street, house, phone
 * - Опциональные поля: patronymic, apartment, comment
 * 
 * @returns {fc.Arbitrary<DeliveryData>} Генератор валидных данных доставки
 */
export const deliveryDataArbitrary: fc.Arbitrary<DeliveryData> = fc.record({
  // ФИО
  last_name: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2),
  first_name: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2),
  patronymic: fc.option(
    fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2),
    { nil: undefined }
  ),
  
  // Адрес
  country: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
  postal_code: fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3),
  city: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
  street: fc.string({ minLength: 2, maxLength: 200 }).filter(s => s.trim().length >= 2),
  house: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length >= 1),
  apartment: fc.option(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length >= 1),
    { nil: undefined }
  ),
  
  // Контакты
  phone: fc.integer({ min: 1000000000, max: 999999999999999 }).map(n => `+${n}`),
  comment: fc.option(
    fc.string({ maxLength: 500 }),
    { nil: undefined }
  ),
});

/**
 * Генератор невалидных данных доставки для тестирования валидации
 * 
 * Генерирует данные с пустыми или невалидными обязательными полями
 * 
 * @returns {fc.Arbitrary<Partial<DeliveryData>>} Генератор невалидных данных
 */
export const invalidDeliveryDataArbitrary: fc.Arbitrary<Partial<DeliveryData>> = fc.record({
  // Генерируем невалидные обязательные поля (пустые или слишком короткие)
  last_name: fc.option(fc.oneof(
    fc.constant(''),
    fc.string({ maxLength: 1 })
  ), { nil: undefined }),
  first_name: fc.option(fc.oneof(
    fc.constant(''),
    fc.string({ maxLength: 1 })
  ), { nil: undefined }),
  patronymic: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  
  country: fc.option(fc.oneof(
    fc.constant(''),
    fc.string({ maxLength: 1 })
  ), { nil: undefined }),
  postal_code: fc.option(fc.oneof(
    fc.constant(''),
    fc.string({ maxLength: 2 })
  ), { nil: undefined }),
  city: fc.option(fc.oneof(
    fc.constant(''),
    fc.string({ maxLength: 1 })
  ), { nil: undefined }),
  street: fc.option(fc.oneof(
    fc.constant(''),
    fc.string({ maxLength: 1 })
  ), { nil: undefined }),
  house: fc.option(fc.constant(''), { nil: undefined }),
  apartment: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
  
  phone: fc.option(fc.oneof(
    fc.constant(''),
    fc.constant('123'), // Слишком короткий
    fc.constant('abc'), // Невалидные символы
  ), { nil: undefined }),
  comment: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
});
