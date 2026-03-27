/**
 * Unit-тесты для утилиты formatDeliveryData
 * 
 * Тестируемая функция:
 * - formatDeliveryData() - форматирование данных доставки для отображения в модальном окне
 * 
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11
 */

import { describe, it, expect } from 'vitest';
import { formatDeliveryData } from '@/lib/webapp/formatDeliveryData';
import type { DeliveryData } from '@/types/delivery';

describe('Unit-тесты для formatDeliveryData', () => {
  describe('Форматирование полного набора данных', () => {
    it('должен корректно форматировать данные со всеми заполненными полями', () => {
      const fullData: DeliveryData = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: 'Иванович',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        apartment: '25',
        phone: '+79991234567',
        comment: 'Позвонить за час до доставки',
      };

      const result = formatDeliveryData(fullData);

      // Проверка структуры результата
      expect(result).toHaveProperty('recipient');
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('contacts');

      // Проверка секции "Получатель"
      expect(result.recipient.label).toBe('Получатель');
      expect(result.recipient.fields).toHaveLength(3);
      expect(result.recipient.fields[0]).toEqual({ label: 'Фамилия', value: 'Иванов' });
      expect(result.recipient.fields[1]).toEqual({ label: 'Имя', value: 'Иван' });
      expect(result.recipient.fields[2]).toEqual({ label: 'Отчество', value: 'Иванович' });

      // Проверка секции "Адрес"
      expect(result.address.label).toBe('Адрес');
      expect(result.address.fields).toHaveLength(6);
      expect(result.address.fields[0]).toEqual({ label: 'Страна', value: 'Россия' });
      expect(result.address.fields[1]).toEqual({ label: 'Почтовый индекс', value: '123456' });
      expect(result.address.fields[2]).toEqual({ label: 'Город', value: 'Москва' });
      expect(result.address.fields[3]).toEqual({ label: 'Улица', value: 'Ленина' });
      expect(result.address.fields[4]).toEqual({ label: 'Дом', value: '10' });
      expect(result.address.fields[5]).toEqual({ label: 'Квартира', value: '25' });

      // Проверка секции "Контакты"
      expect(result.contacts.label).toBe('Контакты');
      expect(result.contacts.fields).toHaveLength(2);
      expect(result.contacts.fields[0]).toEqual({ label: 'Телефон', value: '+79991234567' });
      expect(result.contacts.fields[1]).toEqual({ label: 'Комментарий', value: 'Позвонить за час до доставки' });
    });
  });

  describe('Обработка данных без опциональных полей', () => {
    it('должен корректно форматировать данные без patronymic', () => {
      const dataWithoutPatronymic: DeliveryData = {
        last_name: 'Петров',
        first_name: 'Петр',
        country: 'Россия',
        postal_code: '654321',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '1',
        apartment: '100',
        phone: '+79997654321',
      };

      const result = formatDeliveryData(dataWithoutPatronymic);

      // Проверка, что отчество отсутствует
      expect(result.recipient.fields).toHaveLength(2);
      expect(result.recipient.fields.find(f => f.label === 'Отчество')).toBeUndefined();
      expect(result.recipient.fields[0]).toEqual({ label: 'Фамилия', value: 'Петров' });
      expect(result.recipient.fields[1]).toEqual({ label: 'Имя', value: 'Петр' });
    });

    it('должен корректно форматировать данные без apartment', () => {
      const dataWithoutApartment: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        patronymic: 'Сидорович',
        country: 'Россия',
        postal_code: '111222',
        city: 'Казань',
        street: 'Баумана',
        house: '5А',
        phone: '+79995551122',
      };

      const result = formatDeliveryData(dataWithoutApartment);

      // Проверка, что квартира отсутствует
      expect(result.address.fields).toHaveLength(5);
      expect(result.address.fields.find(f => f.label === 'Квартира')).toBeUndefined();
      expect(result.address.fields[4]).toEqual({ label: 'Дом', value: '5А' });
    });

    it('должен корректно форматировать данные без comment', () => {
      const dataWithoutComment: DeliveryData = {
        last_name: 'Алексеев',
        first_name: 'Алексей',
        country: 'Россия',
        postal_code: '333444',
        city: 'Новосибирск',
        street: 'Красный проспект',
        house: '20',
        phone: '+79993334455',
      };

      const result = formatDeliveryData(dataWithoutComment);

      // Проверка, что комментарий отсутствует
      expect(result.contacts.fields).toHaveLength(1);
      expect(result.contacts.fields.find(f => f.label === 'Комментарий')).toBeUndefined();
      expect(result.contacts.fields[0]).toEqual({ label: 'Телефон', value: '+79993334455' });
    });

    it('должен корректно форматировать данные без всех опциональных полей', () => {
      const minimalData: DeliveryData = {
        last_name: 'Минимов',
        first_name: 'Минимал',
        country: 'Россия',
        postal_code: '555666',
        city: 'Екатеринбург',
        street: 'Ленина',
        house: '15',
        phone: '+79995556677',
      };

      const result = formatDeliveryData(minimalData);

      // Проверка секции "Получатель" - только обязательные поля
      expect(result.recipient.fields).toHaveLength(2);
      expect(result.recipient.fields.find(f => f.label === 'Отчество')).toBeUndefined();

      // Проверка секции "Адрес" - только обязательные поля
      expect(result.address.fields).toHaveLength(5);
      expect(result.address.fields.find(f => f.label === 'Квартира')).toBeUndefined();

      // Проверка секции "Контакты" - только обязательные поля
      expect(result.contacts.fields).toHaveLength(1);
      expect(result.contacts.fields.find(f => f.label === 'Комментарий')).toBeUndefined();
    });
  });

  describe('Корректность подписей на русском языке', () => {
    it('должен использовать правильные подписи для всех полей получателя', () => {
      const data: DeliveryData = {
        last_name: 'Тестов',
        first_name: 'Тест',
        patronymic: 'Тестович',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Тестовая',
        house: '1',
        phone: '+79991111111',
      };

      const result = formatDeliveryData(data);

      const recipientLabels = result.recipient.fields.map(f => f.label);
      expect(recipientLabels).toContain('Фамилия');
      expect(recipientLabels).toContain('Имя');
      expect(recipientLabels).toContain('Отчество');
    });

    it('должен использовать правильные подписи для всех полей адреса', () => {
      const data: DeliveryData = {
        last_name: 'Тестов',
        first_name: 'Тест',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Тестовая',
        house: '1',
        apartment: '10',
        phone: '+79991111111',
      };

      const result = formatDeliveryData(data);

      const addressLabels = result.address.fields.map(f => f.label);
      expect(addressLabels).toContain('Страна');
      expect(addressLabels).toContain('Почтовый индекс');
      expect(addressLabels).toContain('Город');
      expect(addressLabels).toContain('Улица');
      expect(addressLabels).toContain('Дом');
      expect(addressLabels).toContain('Квартира');
    });

    it('должен использовать правильные подписи для всех полей контактов', () => {
      const data: DeliveryData = {
        last_name: 'Тестов',
        first_name: 'Тест',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Тестовая',
        house: '1',
        phone: '+79991111111',
        comment: 'Тестовый комментарий',
      };

      const result = formatDeliveryData(data);

      const contactsLabels = result.contacts.fields.map(f => f.label);
      expect(contactsLabels).toContain('Телефон');
      expect(contactsLabels).toContain('Комментарий');
    });
  });

  describe('Группировка по категориям', () => {
    it('должен группировать данные в три секции: Получатель, Адрес, Контакты', () => {
      const data: DeliveryData = {
        last_name: 'Группов',
        first_name: 'Группа',
        country: 'Россия',
        postal_code: '777888',
        city: 'Владивосток',
        street: 'Океанская',
        house: '50',
        phone: '+79997778899',
      };

      const result = formatDeliveryData(data);

      // Проверка наличия всех трёх секций
      expect(result.recipient).toBeDefined();
      expect(result.address).toBeDefined();
      expect(result.contacts).toBeDefined();

      // Проверка подписей секций
      expect(result.recipient.label).toBe('Получатель');
      expect(result.address.label).toBe('Адрес');
      expect(result.contacts.label).toBe('Контакты');
    });

    it('должен правильно распределить поля по секциям', () => {
      const data: DeliveryData = {
        last_name: 'Распределов',
        first_name: 'Распределение',
        patronymic: 'Распределович',
        country: 'Россия',
        postal_code: '999000',
        city: 'Хабаровск',
        street: 'Амурская',
        house: '100',
        apartment: '200',
        phone: '+79999990000',
        comment: 'Тестовое распределение',
      };

      const result = formatDeliveryData(data);

      // Проверка, что ФИО в секции "Получатель"
      const recipientValues = result.recipient.fields.map(f => f.value);
      expect(recipientValues).toContain('Распределов');
      expect(recipientValues).toContain('Распределение');
      expect(recipientValues).toContain('Распределович');

      // Проверка, что адресные данные в секции "Адрес"
      const addressValues = result.address.fields.map(f => f.value);
      expect(addressValues).toContain('Россия');
      expect(addressValues).toContain('999000');
      expect(addressValues).toContain('Хабаровск');
      expect(addressValues).toContain('Амурская');
      expect(addressValues).toContain('100');
      expect(addressValues).toContain('200');

      // Проверка, что контактные данные в секции "Контакты"
      const contactsValues = result.contacts.fields.map(f => f.value);
      expect(contactsValues).toContain('+79999990000');
      expect(contactsValues).toContain('Тестовое распределение');
    });
  });

  describe('Граничные случаи', () => {
    it('должен корректно обработать специальные символы в данных', () => {
      const dataWithSpecialChars: DeliveryData = {
        last_name: 'О\'Коннор',
        first_name: 'Мария-Анна',
        country: 'Россия',
        postal_code: '123-456',
        city: 'Санкт-Петербург',
        street: 'Большая Морская',
        house: '10/12',
        apartment: '5А',
        phone: '+7 (999) 123-45-67',
        comment: 'Домофон: #123*',
      };

      const result = formatDeliveryData(dataWithSpecialChars);

      expect(result.recipient.fields[0].value).toBe('О\'Коннор');
      expect(result.recipient.fields[1].value).toBe('Мария-Анна');
      expect(result.address.fields[1].value).toBe('123-456');
      expect(result.address.fields[4].value).toBe('10/12');
      expect(result.address.fields[5].value).toBe('5А');
      expect(result.contacts.fields[0].value).toBe('+7 (999) 123-45-67');
      expect(result.contacts.fields[1].value).toBe('Домофон: #123*');
    });

    it('должен корректно обработать длинные значения полей', () => {
      const dataWithLongValues: DeliveryData = {
        last_name: 'Очень-Длинная-Фамилия-Которая-Может-Быть-В-Реальности',
        first_name: 'Очень-Длинное-Имя',
        country: 'Российская Федерация',
        postal_code: '123456',
        city: 'Город с очень длинным названием',
        street: 'Улица с очень длинным названием которое может встречаться в реальности',
        house: '123корпус456строение789',
        phone: '+79991234567',
        comment: 'Очень длинный комментарий с подробными инструкциями по доставке, которые могут включать множество деталей о том, как найти адрес, когда лучше приехать, и другую важную информацию для курьера',
      };

      const result = formatDeliveryData(dataWithLongValues);

      // Проверка, что длинные значения сохраняются полностью
      expect(result.recipient.fields[0].value).toBe('Очень-Длинная-Фамилия-Которая-Может-Быть-В-Реальности');
      expect(result.address.fields[3].value).toBe('Улица с очень длинным названием которое может встречаться в реальности');
      expect(result.contacts.fields[1].value.length).toBeGreaterThan(100);
    });

    it('должен корректно обработать пустые строки в опциональных полях', () => {
      const dataWithEmptyOptionals: DeliveryData = {
        last_name: 'Пустов',
        first_name: 'Пустой',
        patronymic: '',
        country: 'Россия',
        postal_code: '111111',
        city: 'Москва',
        street: 'Пустая',
        house: '0',
        apartment: '',
        phone: '+79990000000',
        comment: '',
      };

      const result = formatDeliveryData(dataWithEmptyOptionals);

      // Пустые строки должны фильтроваться и не отображаться
      // (это правильное поведение - пустые опциональные поля не нужны пользователю)
      const hasPatronymic = result.recipient.fields.some(f => f.label === 'Отчество');
      const hasApartment = result.address.fields.some(f => f.label === 'Квартира');
      const hasComment = result.contacts.fields.some(f => f.label === 'Комментарий');

      expect(hasPatronymic).toBe(false);
      expect(hasApartment).toBe(false);
      expect(hasComment).toBe(false);
    });
  });
});
