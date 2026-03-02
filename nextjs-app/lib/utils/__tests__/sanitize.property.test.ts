/**
 * Property-based тесты для утилит санитизации
 * 
 * Проверяет свойства корректности санитизации на множестве входных данных
 * 
 * Feature: telegram-bot-webapp-system
 * Properties: 27, 28
 * Requirements: 12.1, 12.3
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  escapeHtml,
  stripHtmlTags,
  sanitizeText,
  sanitizeUrl,
  sanitizeDeliveryData,
  sanitizeSupportMessage,
} from '../sanitize';

describe('Property 27: Экранирование HTML в пользовательском контенте', () => {
  it('должно экранировать все HTML-теги в любой строке', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 27
     * 
     * Для любого пользовательского контента, содержащего HTML-теги,
     * при отображении все теги должны быть экранированы
     * 
     * Validates: Requirements 12.1
     */
    fc.assert(
      fc.property(
        fc.string(),
        (text) => {
          const escaped = escapeHtml(text);
          
          // Проверяем, что опасные символы экранированы
          expect(escaped).not.toContain('<script');
          expect(escaped).not.toContain('</script>');
          expect(escaped).not.toContain('<img');
          expect(escaped).not.toContain('onerror=');
          expect(escaped).not.toContain('onclick=');
          
          // Если в исходной строке были < или >, они должны быть экранированы
          if (text.includes('<')) {
            expect(escaped).toContain('&lt;');
          }
          if (text.includes('>')) {
            expect(escaped).toContain('&gt;');
          }
          if (text.includes('&')) {
            expect(escaped).toContain('&amp;');
          }
          if (text.includes('"')) {
            expect(escaped).toContain('&quot;');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно удалять все HTML-теги из любой строки', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 27
     * 
     * Проверяет, что stripHtmlTags полностью удаляет все HTML-теги
     */
    fc.assert(
      fc.property(
        fc.string(),
        (text) => {
          const stripped = stripHtmlTags(text);
          
          // После удаления тегов не должно остаться открывающих/закрывающих скобок тегов
          const tagPattern = /<[^>]*>/g;
          expect(stripped).not.toMatch(tagPattern);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно санитизировать любой текст, удаляя теги и экранируя символы', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 27
     * 
     * Комплексная санитизация должна работать для любого входного текста
     */
    fc.assert(
      fc.property(
        fc.string(),
        (text) => {
          const sanitized = sanitizeText(text);
          
          // Не должно быть HTML-тегов
          expect(sanitized).not.toMatch(/<[^>]*>/g);
          
          // Не должно быть нескольких пробелов подряд
          expect(sanitized).not.toMatch(/\s{2,}/);
          
          // Не должно быть управляющих символов (кроме пробелов)
          expect(sanitized).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно корректно обрабатывать специальные XSS-векторы', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 27
     * 
     * Проверяет защиту от известных XSS-векторов атак
     */
    const xssVectors = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg onload=alert("XSS")>',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')">',
      '<body onload=alert("XSS")>',
      '<input onfocus=alert("XSS") autofocus>',
      '<select onfocus=alert("XSS") autofocus>',
      '<textarea onfocus=alert("XSS") autofocus>',
      '<marquee onstart=alert("XSS")>',
      '<div style="background:url(javascript:alert(\'XSS\'))">',
    ];

    xssVectors.forEach((vector) => {
      const sanitized = sanitizeText(vector);
      
      // Не должно быть исполняемого кода
      expect(sanitized.toLowerCase()).not.toContain('<script');
      expect(sanitized.toLowerCase()).not.toContain('javascript:');
      expect(sanitized.toLowerCase()).not.toContain('onerror');
      expect(sanitized.toLowerCase()).not.toContain('onload');
      expect(sanitized.toLowerCase()).not.toContain('onfocus');
      expect(sanitized.toLowerCase()).not.toContain('onclick');
      
      // Не должно быть HTML-тегов
      expect(sanitized).not.toMatch(/<[^>]*>/g);
    });
  });
});

describe('Property 28: Серверная валидация пользовательского ввода', () => {
  it('должно валидировать и санитизировать данные доставки', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 28
     * 
     * Для любого пользовательского ввода, отправленного на API,
     * должна выполняться валидация и санитизация на стороне сервера
     * 
     * Validates: Requirements 12.3
     */
    fc.assert(
      fc.property(
        fc.record({
          last_name: fc.string({ minLength: 1, maxLength: 50 }),
          first_name: fc.string({ minLength: 1, maxLength: 50 }),
          patronymic: fc.option(fc.string({ maxLength: 50 })),
          city: fc.string({ minLength: 1, maxLength: 100 }),
          street: fc.string({ minLength: 1, maxLength: 200 }),
          house: fc.string({ minLength: 1, maxLength: 20 }),
          apartment: fc.option(fc.string({ maxLength: 20 })),
          phone: fc.string({ minLength: 1, maxLength: 50 }),
          comment: fc.option(fc.string({ maxLength: 500 })),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
        }),
        (data) => {
          const sanitized = sanitizeDeliveryData(data);
          
          // Все текстовые поля должны быть санитизированы
          expect(sanitized.last_name).not.toMatch(/<[^>]*>/g);
          expect(sanitized.first_name).not.toMatch(/<[^>]*>/g);
          expect(sanitized.city).not.toMatch(/<[^>]*>/g);
          expect(sanitized.street).not.toMatch(/<[^>]*>/g);
          expect(sanitized.house).not.toMatch(/<[^>]*>/g);
          expect(sanitized.phone).not.toMatch(/<[^>]*>/g);
          
          if (sanitized.patronymic) {
            expect(sanitized.patronymic).not.toMatch(/<[^>]*>/g);
          }
          
          if (sanitized.apartment) {
            expect(sanitized.apartment).not.toMatch(/<[^>]*>/g);
          }
          
          if (sanitized.comment) {
            expect(sanitized.comment).not.toMatch(/<[^>]*>/g);
          }
          
          // Telegram ID должен остаться числом
          expect(typeof sanitized.telegram_id).toBe('number');
          expect(sanitized.telegram_id).toBe(data.telegram_id);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно санитизировать сообщения поддержки', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 28
     * 
     * Сообщения поддержки должны быть санитизированы перед сохранением
     */
    fc.assert(
      fc.property(
        fc.string(),
        (message) => {
          const sanitized = sanitizeSupportMessage(message);
          
          // Не должно быть HTML-тегов
          expect(sanitized).not.toMatch(/<[^>]*>/g);
          
          // Не должно быть управляющих символов (кроме переносов строк)
          expect(sanitized).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно валидировать протокол URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Для любого URL из пользовательского ввода,
     * система должна проверять протокол и разрешать только http и https
     * 
     * Validates: Requirements 12.5
     */
    fc.assert(
      fc.property(
        fc.webUrl(),
        (url) => {
          const sanitized = sanitizeUrl(url);
          
          if (sanitized !== null) {
            // Если URL прошёл валидацию, он должен начинаться с http:// или https://
            expect(
              sanitized.startsWith('http://') || sanitized.startsWith('https://')
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно отклонять опасные протоколы URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Проверяет, что опасные протоколы отклоняются
     */
    const dangerousProtocols = [
      'javascript:alert("XSS")',
      'data:text/html,<script>alert("XSS")</script>',
      'vbscript:msgbox("XSS")',
      'file:///etc/passwd',
      'ftp://malicious.com',
    ];

    dangerousProtocols.forEach((url) => {
      const sanitized = sanitizeUrl(url);
      
      // Опасные протоколы должны быть отклонены
      expect(sanitized).toBeNull();
    });
  });

  it('должно сохранять валидные http и https URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Валидные URL с безопасными протоколами должны проходить валидацию
     */
    const validUrls = [
      'https://example.com',
      'http://example.com',
      'https://example.com/path?query=value',
      'http://subdomain.example.com:8080/path',
    ];

    validUrls.forEach((url) => {
      const sanitized = sanitizeUrl(url);
      
      // Валидные URL должны проходить
      expect(sanitized).not.toBeNull();
      
      // URL должен начинаться с безопасного протокола
      expect(
        sanitized!.startsWith('http://') || sanitized!.startsWith('https://')
      ).toBe(true);
      
      // URL должен содержать основной домен
      if (url.includes('example.com')) {
        expect(sanitized).toContain('example.com');
      }
    });
  });
});

describe('Property 27 & 28: Интеграционные тесты санитизации', () => {
  it('должно обрабатывать комбинированные XSS-атаки в данных доставки', () => {
    /**
     * Feature: telegram-bot-webapp-system, Properties 27, 28
     * 
     * Проверяет защиту от сложных XSS-атак в реальных данных
     */
    const maliciousData = {
      last_name: '<script>alert("XSS")</script>Иванов',
      first_name: 'Иван<img src=x onerror=alert("XSS")>',
      patronymic: 'Иванович<svg onload=alert("XSS")>',
      city: 'Москва<iframe src="javascript:alert(\'XSS\')">',
      street: 'Ленина<script>alert("XSS")</script>',
      house: '10<img src=x onerror=alert("XSS")>',
      apartment: '5<svg onload=alert("XSS")>',
      phone: '+7999<svg onload=alert("XSS")>1234567',
      comment: 'Комментарий <iframe src="javascript:alert(\'XSS\')">',
      telegram_id: 12345,
    };

    const sanitized = sanitizeDeliveryData(maliciousData);

    // Все поля должны быть очищены от XSS
    expect(sanitized.last_name).not.toContain('<script');
    expect(sanitized.last_name).not.toContain('</script>');
    
    expect(sanitized.first_name).not.toContain('<img');
    expect(sanitized.first_name).not.toContain('onerror');
    
    if (sanitized.patronymic) {
      expect(sanitized.patronymic).not.toContain('<svg');
      expect(sanitized.patronymic).not.toContain('onload');
    }
    
    expect(sanitized.city).not.toContain('<iframe');
    expect(sanitized.city).not.toContain('javascript:');
    
    expect(sanitized.street).not.toContain('<script');
    expect(sanitized.street).not.toContain('</script>');
    
    expect(sanitized.house).not.toContain('<img');
    expect(sanitized.house).not.toContain('onerror');
    
    if (sanitized.apartment) {
      expect(sanitized.apartment).not.toContain('<svg');
      expect(sanitized.apartment).not.toContain('onload');
    }
    
    expect(sanitized.phone).not.toContain('<svg');
    expect(sanitized.phone).not.toContain('onload');
    
    if (sanitized.comment) {
      expect(sanitized.comment).not.toContain('<iframe');
      expect(sanitized.comment).not.toContain('javascript:');
    }
  });

  it('должно сохранять читаемость текста после санитизации', () => {
    /**
     * Feature: telegram-bot-webapp-system, Properties 27, 28
     * 
     * Санитизация не должна делать текст нечитаемым
     */
    const normalData = {
      last_name: 'Иванов',
      first_name: 'Иван',
      patronymic: 'Иванович',
      city: 'Москва',
      street: 'Ленина',
      house: '10',
      apartment: '5',
      phone: '+79991234567',
      comment: 'Позвонить перед доставкой',
      telegram_id: 12345,
    };

    const sanitized = sanitizeDeliveryData(normalData);

    // Нормальные данные должны остаться читаемыми
    expect(sanitized.last_name).toContain('Иванов');
    expect(sanitized.first_name).toContain('Иван');
    expect(sanitized.patronymic).toContain('Иванович');
    expect(sanitized.city).toContain('Москва');
    expect(sanitized.street).toContain('Ленина');
    expect(sanitized.house).toContain('10');
    expect(sanitized.apartment).toContain('5');
    expect(sanitized.phone).toContain('+7999');
    expect(sanitized.comment).toContain('Позвонить');
  });
});
