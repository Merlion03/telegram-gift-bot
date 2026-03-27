/**
 * Property-тест для утилиты formatDeliveryData
 * Property 3: Полнота отображения данных
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11
 * 
 * Этот тест проверяет, что:
 * 1. Все обязательные поля присутствуют в результате форматирования
 * 2. Опциональные поля отображаются только если заполнены
 * 3. Каждое поле имеет подпись на русском языке
 * 4. Данные правильно группируются по секциям
 */

import { describe, it, expect } from 'vitest';
import { fc } from '@fast-check/vitest';
import { formatDeliveryData } from '@/lib/webapp/formatDeliveryData';
import type { DeliveryData } from '@/types/delivery';

/**
 * Генератор для непустых строк (обязательные поля)
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Генератор для опциональных строк
 */
const optionalStringArbitrary = fc.option(
  fc.string({ minLength: 1, maxLength: 100 }),
  { nil: undefined }
);

/**
 * Генератор для валидных данных доставки
 * Генерирует случайные данные, соответствующие интерфейсу DeliveryData
 */
const deliveryDataArbitrary: fc.Arbitrary<DeliveryData> = fc.record({
  // Обязательные поля получателя
  last_name: nonEmptyStringArbitrary,
  first_name: nonEmptyStringArbitrary,
  patronymic: optionalStringArbitrary,
  
  // Обязательные поля адреса
  country: nonEmptyStringArbitrary,
  postal_code: fc.string({ minLength: 3, maxLength: 20 }),
  city: nonEmptyStringArbitrary,
  street: nonEmptyStringArbitrary,
  house: fc.string({ minLength: 1, maxLength: 20 }),
  apartment: optionalStringArbitrary,
  
  // Обязательные поля контактов
  phone: fc.string({ minLength: 10, maxLength: 20 }).map(s => '+' + s),
  comment: optionalStringArbitrary,
});

/**
 * Проверяет, что поле присутствует в массиве форматированных полей
 */
function hasField(fields: Array<{ label: string; value: string }>, label: string): boolean {
  return fields.some(f => f.label === label);
}

/**
 * Получает значение поля по подписи
 */
function getFieldValue(fields: Array<{ label: string; value: string }>, label: string): string | undefined {
  return fields.find(f => f.label === label)?.value;
}

describe('Property 3: Полнота отображения данных', () => {
  /**
   * Проверяет, что все обязательные поля получателя присутствуют в результате
   * Requirements: 2.2, 2.3
   */
  it('все обязательные поля получателя присутствуют в результате', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        // Проверяем наличие обязательных полей
        expect(hasField(result.recipient.fields, 'Фамилия')).toBe(true);
        expect(hasField(result.recipient.fields, 'Имя')).toBe(true);
        
        // Проверяем, что значения соответствуют исходным данным
        expect(getFieldValue(result.recipient.fields, 'Фамилия')).toBe(data.last_name);
        expect(getFieldValue(result.recipient.fields, 'Имя')).toBe(data.first_name);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что опциональное поле patronymic отображается только если заполнено
   * Requirements: 2.4
   */
  it('опциональное поле patronymic отображается только если заполнено', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        const hasPatronymic = hasField(result.recipient.fields, 'Отчество');
        
        if (data.patronymic) {
          // Если patronymic заполнено, оно должно присутствовать
          expect(hasPatronymic).toBe(true);
          expect(getFieldValue(result.recipient.fields, 'Отчество')).toBe(data.patronymic);
        } else {
          // Если patronymic не заполнено, оно не должно присутствовать
          expect(hasPatronymic).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что все обязательные поля адреса присутствуют в результате
   * Requirements: 2.5, 2.6, 2.7, 2.8
   */
  it('все обязательные поля адреса присутствуют в результате', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        // Проверяем наличие обязательных полей
        expect(hasField(result.address.fields, 'Страна')).toBe(true);
        expect(hasField(result.address.fields, 'Почтовый индекс')).toBe(true);
        expect(hasField(result.address.fields, 'Город')).toBe(true);
        expect(hasField(result.address.fields, 'Улица')).toBe(true);
        expect(hasField(result.address.fields, 'Дом')).toBe(true);
        
        // Проверяем, что значения соответствуют исходным данным
        expect(getFieldValue(result.address.fields, 'Страна')).toBe(data.country);
        expect(getFieldValue(result.address.fields, 'Почтовый индекс')).toBe(data.postal_code);
        expect(getFieldValue(result.address.fields, 'Город')).toBe(data.city);
        expect(getFieldValue(result.address.fields, 'Улица')).toBe(data.street);
        expect(getFieldValue(result.address.fields, 'Дом')).toBe(data.house);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что опциональное поле apartment отображается только если заполнено
   * Requirements: 2.8
   */
  it('опциональное поле apartment отображается только если заполнено', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        const hasApartment = hasField(result.address.fields, 'Квартира');
        
        if (data.apartment) {
          // Если apartment заполнено, оно должно присутствовать
          expect(hasApartment).toBe(true);
          expect(getFieldValue(result.address.fields, 'Квартира')).toBe(data.apartment);
        } else {
          // Если apartment не заполнено, оно не должно присутствовать
          expect(hasApartment).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что обязательное поле phone присутствует в результате
   * Requirements: 2.9
   */
  it('обязательное поле phone присутствует в результате', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        // Проверяем наличие обязательного поля
        expect(hasField(result.contacts.fields, 'Телефон')).toBe(true);
        
        // Проверяем, что значение соответствует исходным данным
        expect(getFieldValue(result.contacts.fields, 'Телефон')).toBe(data.phone);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что опциональное поле comment отображается только если заполнено
   * Requirements: 2.10
   */
  it('опциональное поле comment отображается только если заполнено', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        const hasComment = hasField(result.contacts.fields, 'Комментарий');
        
        if (data.comment) {
          // Если comment заполнено, оно должно присутствовать
          expect(hasComment).toBe(true);
          expect(getFieldValue(result.contacts.fields, 'Комментарий')).toBe(data.comment);
        } else {
          // Если comment не заполнено, оно не должно присутствовать
          expect(hasComment).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что все поля имеют подписи на русском языке
   * Requirements: 2.11
   */
  it('все поля имеют подписи на русском языке', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        // Проверяем подписи секций
        expect(result.recipient.label).toBe('Получатель');
        expect(result.address.label).toBe('Адрес');
        expect(result.contacts.label).toBe('Контакты');
        
        // Проверяем, что все подписи полей на русском языке
        const allLabels = [
          ...result.recipient.fields.map(f => f.label),
          ...result.address.fields.map(f => f.label),
          ...result.contacts.fields.map(f => f.label),
        ];
        
        const validLabels = [
          'Фамилия', 'Имя', 'Отчество',
          'Страна', 'Почтовый индекс', 'Город', 'Улица', 'Дом', 'Квартира',
          'Телефон', 'Комментарий'
        ];
        
        // Все подписи должны быть из списка валидных подписей на русском
        allLabels.forEach(label => {
          expect(validLabels).toContain(label);
        });
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что данные правильно группируются по секциям
   * Requirements: 2.11
   */
  it('данные правильно группируются по секциям', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        // Проверяем наличие всех трёх секций
        expect(result.recipient).toBeDefined();
        expect(result.address).toBeDefined();
        expect(result.contacts).toBeDefined();
        
        // Проверяем, что секция "Получатель" содержит только поля получателя
        const recipientLabels = result.recipient.fields.map(f => f.label);
        const validRecipientLabels = ['Фамилия', 'Имя', 'Отчество'];
        recipientLabels.forEach(label => {
          expect(validRecipientLabels).toContain(label);
        });
        
        // Проверяем, что секция "Адрес" содержит только поля адреса
        const addressLabels = result.address.fields.map(f => f.label);
        const validAddressLabels = ['Страна', 'Почтовый индекс', 'Город', 'Улица', 'Дом', 'Квартира'];
        addressLabels.forEach(label => {
          expect(validAddressLabels).toContain(label);
        });
        
        // Проверяем, что секция "Контакты" содержит только поля контактов
        const contactsLabels = result.contacts.fields.map(f => f.label);
        const validContactsLabels = ['Телефон', 'Комментарий'];
        contactsLabels.forEach(label => {
          expect(validContactsLabels).toContain(label);
        });
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет полноту отображения данных для всех комбинаций опциональных полей
   * Requirements: 2.2-2.11
   */
  it('полнота отображения данных для всех комбинаций опциональных полей', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result = formatDeliveryData(data);
        
        // Подсчитываем ожидаемое количество полей
        let expectedRecipientFields = 2; // last_name, first_name
        if (data.patronymic) expectedRecipientFields++;
        
        let expectedAddressFields = 5; // country, postal_code, city, street, house
        if (data.apartment) expectedAddressFields++;
        
        let expectedContactsFields = 1; // phone
        if (data.comment) expectedContactsFields++;
        
        // Проверяем, что количество полей соответствует ожидаемому
        expect(result.recipient.fields.length).toBe(expectedRecipientFields);
        expect(result.address.fields.length).toBe(expectedAddressFields);
        expect(result.contacts.fields.length).toBe(expectedContactsFields);
        
        // Проверяем, что все значения не пустые
        [...result.recipient.fields, ...result.address.fields, ...result.contacts.fields].forEach(field => {
          expect(field.value).toBeTruthy();
          expect(field.value.length).toBeGreaterThan(0);
        });
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет инвариант: форматирование не изменяет исходные данные
   * Requirements: 2.2-2.11
   */
  it('форматирование не изменяет исходные данные', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        // Создаём копию исходных данных
        const originalData = { ...data };
        
        // Форматируем данные
        formatDeliveryData(data);
        
        // Проверяем, что исходные данные не изменились
        expect(data).toEqual(originalData);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет идемпотентность: повторное форматирование даёт тот же результат
   * Requirements: 2.2-2.11
   */
  it('повторное форматирование даёт тот же результат', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data) => {
        const result1 = formatDeliveryData(data);
        const result2 = formatDeliveryData(data);
        
        // Проверяем, что результаты идентичны
        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });
});
