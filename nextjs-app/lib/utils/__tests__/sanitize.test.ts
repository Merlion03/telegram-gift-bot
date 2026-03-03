/**
 * Unit-тесты для утилит санитизации данных
 * 
 * Проверяет корректность санитизации всех полей формы доставки,
 * обработку опциональных полей и удаление потенциально опасных символов
 * 
 * Requirements: 4.1, 4.3, 4.4
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeDeliveryData,
  escapeHtml,
  stripHtmlTags,
} from '../sanitize';

describe('sanitizeText', () => {
  it('должен удалять HTML-теги', () => {
    const input = '<script>alert("XSS")</script>Hello';
    const result = sanitizeText(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('должен экранировать специальные символы', () => {
    const input = 'Test & "quotes"';
    const result = sanitizeText(input);
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
    expect(result).toBe('Test &amp; &quot;quotes&quot;');
  });

  it('должен удалять опасные протоколы', () => {
    const input = 'javascript:alert("XSS")';
    const result = sanitizeText(input);
    expect(result).not.toContain('javascript:');
  });

  it('должен нормализовать множественные пробелы', () => {
    const input = 'Hello    World   Test';
    const result = sanitizeText(input);
    expect(result).toBe('Hello World Test');
  });

  it('должен удалять управляющие символы', () => {
    const input = 'Hello\x00\x01\x02World';
    const result = sanitizeText(input);
    expect(result).toBe('HelloWorld');
  });
});

describe('escapeHtml', () => {
  it('должен экранировать все специальные HTML символы', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#x27;');
    expect(escapeHtml('/')).toBe('&#x2F;');
  });

  it('должен обрабатывать строки с несколькими специальными символами', () => {
    const input = '<div class="test">Hello & "World"</div>';
    const result = escapeHtml(input);
    expect(result).toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;World&quot;&lt;&#x2F;div&gt;');
  });
});

describe('stripHtmlTags', () => {
  it('должен удалять все HTML-теги', () => {
    const input = '<p>Hello <b>World</b></p>';
    const result = stripHtmlTags(input);
    expect(result).toBe('Hello World');
  });

  it('должен обрабатывать пустую строку', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('должен обрабатывать строку без тегов', () => {
    const input = 'Plain text';
    expect(stripHtmlTags(input)).toBe(input);
  });
});

describe('sanitizeDeliveryData', () => {
  describe('Санитизация всех полей', () => {
    it('должен санитизировать все обязательные текстовые поля', () => {
      const input = {
        last_name: '<script>Иванов</script>',
        first_name: 'Иван<b>',
        country: 'Россия<tag>',
        postal_code: '123456<script>',
        city: 'Москва & Область',
        street: 'Ленина "123"',
        house: '10<tag>',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      // Проверяем, что HTML-теги удалены
      expect(result.last_name).not.toContain('<script>');
      expect(result.last_name).not.toContain('</script>');
      expect(result.first_name).not.toContain('<b>');
      expect(result.country).not.toContain('<tag>');
      expect(result.postal_code).not.toContain('<script>');
      expect(result.house).not.toContain('<tag>');

      // Проверяем, что специальные символы экранированы
      expect(result.city).toContain('&amp;');
      expect(result.street).toContain('&quot;');

      // Проверяем, что telegram_id не изменился
      expect(result.telegram_id).toBe(123456789);
    });

    it('должен санитизировать поле телефона', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+7999<script>1234567</script>',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.phone).not.toContain('<script>');
    });

    it('должен нормализовать пробелы во всех полях', () => {
      const input = {
        last_name: '  Иванов  ',
        first_name: 'Иван   Петрович',
        country: '  Россия  ',
        postal_code: '  123456  ',
        city: 'Москва    ',
        street: '  Ленина  ',
        house: '  10  ',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      expect(result.last_name).toBe('Иванов');
      expect(result.first_name).toBe('Иван Петрович');
      expect(result.country).toBe('Россия');
      expect(result.postal_code).toBe('123456');
      expect(result.city).toBe('Москва');
      expect(result.street).toBe('Ленина');
      expect(result.house).toBe('10');
    });
  });

  describe('Обработка опциональных полей', () => {
    it('должен корректно обрабатывать patronymic как null при пустой строке', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: '',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.patronymic).toBeNull();
    });

    it('должен корректно обрабатывать patronymic как null при строке из пробелов', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: '   ',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.patronymic).toBeNull();
    });

    it('должен санитизировать patronymic если оно предоставлено', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: '<b>Петрович</b>',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.patronymic).not.toBeNull();
      expect(result.patronymic).not.toContain('<b>');
      expect(result.patronymic).toContain('Петрович');
    });

    it('должен корректно обрабатывать apartment как null при пустой строке', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        apartment: '',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.apartment).toBeNull();
    });

    it('должен корректно обрабатывать apartment как null при строке из пробелов', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        apartment: '   ',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.apartment).toBeNull();
    });

    it('должен санитизировать apartment если оно предоставлено', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        apartment: '<script>25</script>',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.apartment).not.toBeNull();
      expect(result.apartment).not.toContain('<script>');
      expect(result.apartment).toContain('25');
    });

    it('должен корректно обрабатывать comment как undefined при отсутствии', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.comment).toBeUndefined();
    });

    it('должен санитизировать comment если оно предоставлено', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        comment: '<b>Позвоните</b> перед доставкой',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.comment).toBeDefined();
      expect(result.comment).not.toContain('<b>');
      expect(result.comment).toContain('Позвоните');
    });

    it('должен обрабатывать все опциональные поля одновременно', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        patronymic: '',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        apartment: '   ',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.patronymic).toBeNull();
      expect(result.apartment).toBeNull();
      expect(result.comment).toBeUndefined();
    });
  });

  describe('Санитизация полей country и postal_code', () => {
    it('должен удалять HTML-теги из поля country', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: '<script>Россия</script>',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.country).not.toContain('<script>');
      expect(result.country).not.toContain('</script>');
      expect(result.country).toContain('Россия');
    });

    it('должен удалять HTML-теги из поля postal_code', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '<b>123456</b>',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).not.toContain('<b>');
      expect(result.postal_code).not.toContain('</b>');
      expect(result.postal_code).toContain('123456');
    });

    it('должен экранировать специальные символы в country', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия & СНГ',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.country).toContain('&amp;');
      expect(result.country).toContain('Россия');
      expect(result.country).toContain('СНГ');
    });

    it('должен сохранять валидные символы в postal_code (цифры)', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('123456');
    });

    it('должен сохранять валидные символы в postal_code (буквы, цифры, дефисы)', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'США',
        postal_code: '12345-6789',
        city: 'Нью-Йорк',
        street: 'Broadway',
        house: '100',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('12345-6789');
    });

    it('должен сохранять валидные символы в postal_code (буквы и цифры с пробелами)', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Канада',
        postal_code: 'A1A 1A1',
        city: 'Торонто',
        street: 'Main Street',
        house: '50',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('A1A 1A1');
    });

    it('должен обрабатывать различные форматы почтовых индексов - российский', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('123456');
      expect(result.postal_code).toMatch(/^\d{6}$/);
    });

    it('должен обрабатывать различные форматы почтовых индексов - американский', () => {
      const input = {
        last_name: 'Smith',
        first_name: 'John',
        country: 'USA',
        postal_code: '12345-6789',
        city: 'New York',
        street: 'Broadway',
        house: '100',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('12345-6789');
      expect(result.postal_code).toMatch(/^\d{5}-\d{4}$/);
    });

    it('должен обрабатывать различные форматы почтовых индексов - канадский', () => {
      const input = {
        last_name: 'Dupont',
        first_name: 'Jean',
        country: 'Canada',
        postal_code: 'K1A 0B1',
        city: 'Ottawa',
        street: 'Wellington',
        house: '1',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('K1A 0B1');
      expect(result.postal_code).toMatch(/^[A-Z]\d[A-Z] \d[A-Z]\d$/);
    });

    it('должен обрабатывать различные форматы почтовых индексов - британский', () => {
      const input = {
        last_name: 'Brown',
        first_name: 'James',
        country: 'United Kingdom',
        postal_code: 'SW1A 1AA',
        city: 'London',
        street: 'Westminster',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.postal_code).toBe('SW1A 1AA');
      expect(result.postal_code).toMatch(/^[A-Z]{2}\d[A-Z] \d[A-Z]{2}$/);
    });

    it('должен удалять XSS-векторы из country и postal_code', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: '<img src=x onerror=alert(1)>Россия',
        postal_code: 'javascript:alert(1)123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);
      expect(result.country).not.toContain('<img');
      expect(result.country).not.toContain('onerror');
      expect(result.postal_code).not.toContain('javascript:');
    });
  });

  describe('Удаление потенциально опасных символов', () => {
    it('должен удалять XSS-векторы из всех полей', () => {
      const input = {
        last_name: '<img src=x onerror=alert(1)>Иванов',
        first_name: 'javascript:alert(1)Иван',
        patronymic: 'data:text/html,<script>alert(1)</script>Петрович',
        country: '<iframe src="evil.com">Россия',
        postal_code: 'vbscript:msgbox(1)123456',
        city: '<iframe src="evil.com">Москва',
        street: 'vbscript:msgbox(1)Ленина',
        house: '<svg onload=alert(1)>10',
        apartment: '<body onload=alert(1)>25',
        phone: '+79991234567<script>',
        comment: '<a href="javascript:void(0)">Комментарий</a>',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      // Проверяем, что все опасные конструкции удалены
      expect(result.last_name).not.toContain('<img');
      expect(result.last_name).not.toContain('onerror');
      expect(result.first_name).not.toContain('javascript:');
      expect(result.patronymic).not.toContain('data:');
      expect(result.patronymic).not.toContain('<script>');
      expect(result.country).not.toContain('<iframe');
      expect(result.postal_code).not.toContain('vbscript:');
      expect(result.city).not.toContain('<iframe');
      expect(result.street).not.toContain('vbscript:');
      expect(result.house).not.toContain('<svg');
      expect(result.house).not.toContain('onload');
      expect(result.apartment).not.toContain('<body');
      expect(result.apartment).not.toContain('onload');
      expect(result.phone).not.toContain('<script>');
      expect(result.comment).not.toContain('<a');
      expect(result.comment).not.toContain('javascript:');
    });

    it('должен удалять управляющие символы из всех полей', () => {
      const input = {
        last_name: 'Иванов\x00\x01',
        first_name: 'Иван\x02\x03',
        country: 'Россия\x04\x05',
        postal_code: '123456\x06\x07',
        city: 'Москва\x04\x05',
        street: 'Ленина\x06\x07',
        house: '10\x08',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      expect(result.last_name).toBe('Иванов');
      expect(result.first_name).toBe('Иван');
      expect(result.country).toBe('Россия');
      expect(result.postal_code).toBe('123456');
      expect(result.city).toBe('Москва');
      expect(result.street).toBe('Ленина');
      expect(result.house).toBe('10');
    });

    it('должен обрабатывать SQL-инъекции как обычный текст', () => {
      const input = {
        last_name: "'; DROP TABLE users; --",
        first_name: "1' OR '1'='1",
        country: "Russia' UNION SELECT * FROM countries--",
        postal_code: "123456' OR 1=1--",
        city: "Moscow' UNION SELECT * FROM passwords--",
        street: "Lenin'; DELETE FROM orders WHERE '1'='1",
        house: "10' OR 1=1--",
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      // SQL-инъекции должны быть экранированы, но не удалены полностью
      // так как это может быть легитимный текст с апострофами
      expect(result.last_name).toBeDefined();
      expect(result.first_name).toBeDefined();
      expect(result.country).toBeDefined();
      expect(result.postal_code).toBeDefined();
      expect(result.city).toBeDefined();
      expect(result.street).toBeDefined();
      expect(result.house).toBeDefined();
    });
  });

  describe('Комплексные сценарии', () => {
    it('должен обрабатывать полный набор данных с санитизацией', () => {
      const input = {
        last_name: '  <b>Иванов</b>  ',
        first_name: 'Иван   ',
        patronymic: '  Петрович  ',
        country: '  Россия & СНГ  ',
        postal_code: '  123456  ',
        city: 'Москва & Область',
        street: 'Ленина "проспект"',
        house: '10-А',
        apartment: '25',
        phone: '+7 (999) 123-45-67',
        comment: 'Позвоните за 30 минут',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      expect(result.last_name).toBe('Иванов');
      expect(result.first_name).toBe('Иван');
      expect(result.patronymic).toBe('Петрович');
      expect(result.country).toContain('Россия');
      expect(result.country).toContain('&amp;');
      expect(result.postal_code).toBe('123456');
      expect(result.city).toContain('Москва');
      expect(result.city).toContain('&amp;');
      expect(result.street).toContain('Ленина');
      expect(result.street).toContain('&quot;');
      expect(result.house).toBe('10-А');
      expect(result.apartment).toBe('25');
      expect(result.comment).toContain('Позвоните');
      expect(result.telegram_id).toBe(123456789);
    });

    it('должен обрабатывать минимальный набор данных', () => {
      const input = {
        last_name: 'Иванов',
        first_name: 'Иван',
        country: 'Россия',
        postal_code: '123456',
        city: 'Москва',
        street: 'Ленина',
        house: '10',
        phone: '+79991234567',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      expect(result.last_name).toBe('Иванов');
      expect(result.first_name).toBe('Иван');
      expect(result.patronymic).toBeNull();
      expect(result.country).toBe('Россия');
      expect(result.postal_code).toBe('123456');
      expect(result.city).toBe('Москва');
      expect(result.street).toBe('Ленина');
      expect(result.house).toBe('10');
      expect(result.apartment).toBeNull();
      expect(result.phone).toBe('+79991234567');
      expect(result.comment).toBeUndefined();
      expect(result.telegram_id).toBe(123456789);
    });

    it('должен сохранять кириллические символы', () => {
      const input = {
        last_name: 'Иванов-Петров',
        first_name: 'Иван',
        patronymic: 'Александрович',
        country: 'Россия',
        postal_code: '123456',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '10/12',
        apartment: '25А',
        phone: '+79991234567',
        comment: 'Доставка в будний день',
        telegram_id: 123456789,
      };

      const result = sanitizeDeliveryData(input);

      expect(result.last_name).toBe('Иванов-Петров');
      expect(result.first_name).toBe('Иван');
      expect(result.patronymic).toBe('Александрович');
      expect(result.country).toBe('Россия');
      expect(result.postal_code).toBe('123456');
      expect(result.city).toBe('Санкт-Петербург');
      expect(result.street).toBe('Невский проспект');
      expect(result.house).toBe('10&#x2F;12');
      expect(result.apartment).toBe('25А');
      expect(result.comment).toBe('Доставка в будний день');
    });
  });
});
