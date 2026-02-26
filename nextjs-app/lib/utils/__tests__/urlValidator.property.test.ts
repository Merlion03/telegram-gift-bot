/**
 * Property-based тесты для валидации URL
 * 
 * Проверяет свойства корректности валидации URL на множестве входных данных
 * 
 * Feature: telegram-bot-webapp-system
 * Property: 29
 * Requirements: 12.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateUrl,
  isUrlSafe,
  sanitizeUrl,
  validateUrls,
  filterSafeUrls,
} from '../urlValidator';

describe('Property 29: Валидация протокола URL', () => {
  it('должно принимать любые валидные http и https URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Для любого URL с протоколом http или https,
     * валидация должна пройти успешно
     * 
     * Validates: Requirements 12.5
     */
    fc.assert(
      fc.property(
        fc.webUrl(),
        (url) => {
          const result = validateUrl(url);
          
          // Валидные web URL должны проходить валидацию
          if (url.startsWith('http://') || url.startsWith('https://')) {
            expect(result.isValid).toBe(true);
            expect(result.url).not.toBeNull();
            expect(result.error).toBeUndefined();
            
            // Результат должен начинаться с безопасного протокола
            expect(
              result.url!.startsWith('http://') || result.url!.startsWith('https://')
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно отклонять URL с опасными протоколами', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Для любого URL с опасным протоколом,
     * валидация должна вернуть ошибку
     * 
     * Validates: Requirements 12.5
     */
    const dangerousProtocols = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'about:',
    ];

    dangerousProtocols.forEach((protocol) => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (payload) => {
            const url = `${protocol}${payload}`;
            const result = validateUrl(url);
            
            // Опасные протоколы должны быть отклонены
            expect(result.isValid).toBe(false);
            expect(result.url).toBeNull();
            expect(result.error).toBeTruthy();
            expect(result.error).toContain(protocol);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  it('должно отклонять невалидные URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Для любой строки, которая не является валидным URL,
     * валидация должна вернуть ошибку
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !s.startsWith('http://') && !s.startsWith('https://')
        ),
        (invalidUrl) => {
          const result = validateUrl(invalidUrl);
          
          // Невалидные URL должны быть отклонены
          expect(result.isValid).toBe(false);
          expect(result.url).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('должно корректно обрабатывать пустые строки', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Пустые строки должны быть отклонены
     */
    const emptyStrings = ['', '   ', '\t', '\n'];

    emptyStrings.forEach((empty) => {
      const result = validateUrl(empty);
      
      expect(result.isValid).toBe(false);
      expect(result.url).toBeNull();
      expect(result.error).toContain('пустым');
    });
  });

  it('isUrlSafe должно возвращать boolean для любого URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Функция isUrlSafe должна всегда возвращать boolean
     */
    fc.assert(
      fc.property(
        fc.string(),
        (url) => {
          const result = isUrlSafe(url);
          
          // Результат всегда boolean
          expect(typeof result).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sanitizeUrl должно возвращать null для опасных URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Функция sanitizeUrl должна возвращать null для опасных URL
     */
    const dangerousUrls = [
      'javascript:alert("XSS")',
      'data:text/html,<script>alert("XSS")</script>',
      'vbscript:msgbox("XSS")',
      'file:///etc/passwd',
    ];

    dangerousUrls.forEach((url) => {
      const result = sanitizeUrl(url);
      
      expect(result).toBeNull();
    });
  });

  it('sanitizeUrl должно возвращать нормализованный URL для безопасных URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Функция sanitizeUrl должна возвращать нормализованный URL
     * для безопасных URL
     */
    const safeUrls = [
      'https://example.com',
      'http://example.com',
      'https://example.com/path',
      'http://subdomain.example.com:8080/path?query=value',
    ];

    safeUrls.forEach((url) => {
      const result = sanitizeUrl(url);
      
      expect(result).not.toBeNull();
      expect(result!.startsWith('http://') || result!.startsWith('https://')).toBe(
        true
      );
    });
  });

  it('validateUrls должно валидировать массив URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Функция validateUrls должна валидировать все URL в массиве
     */
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        (urls) => {
          const results = validateUrls(urls);
          
          // Количество результатов должно совпадать с количеством URL
          expect(results.length).toBe(urls.length);
          
          // Каждый результат должен иметь правильную структуру
          results.forEach((result) => {
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('url');
            expect(typeof result.isValid).toBe('boolean');
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('filterSafeUrls должно фильтровать только безопасные URL', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Функция filterSafeUrls должна возвращать только безопасные URL
     */
    const mixedUrls = [
      'https://example.com',
      'javascript:alert("XSS")',
      'http://example.com',
      'data:text/html,<script>alert("XSS")</script>',
      'https://example.com/path',
    ];

    const safeUrls = filterSafeUrls(mixedUrls);
    
    // Должны остаться только безопасные URL
    expect(safeUrls.length).toBe(3);
    
    // Все результаты должны начинаться с http:// или https://
    safeUrls.forEach((url) => {
      expect(url.startsWith('http://') || url.startsWith('https://')).toBe(true);
    });
  });

  it('должно обрабатывать URL с различными компонентами', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Валидация должна корректно обрабатывать URL с различными компонентами
     */
    fc.assert(
      fc.property(
        fc.record({
          protocol: fc.constantFrom('http:', 'https:'),
          domain: fc.domain(),
          port: fc.option(fc.integer({ min: 1, max: 65535 })),
          path: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          query: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        }),
        (components) => {
          // Строим URL из компонентов
          let url = `${components.protocol}//${components.domain}`;
          
          if (components.port) {
            url += `:${components.port}`;
          }
          
          if (components.path) {
            url += `/${components.path}`;
          }
          
          if (components.query) {
            url += `?${components.query}`;
          }
          
          const result = validateUrl(url);
          
          // URL с безопасным протоколом должен быть валиден
          expect(result.isValid).toBe(true);
          expect(result.url).not.toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('должно быть case-insensitive для протоколов', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Валидация протокола должна быть case-insensitive
     */
    const protocols = [
      'HTTP://',
      'HTTPS://',
      'Http://',
      'Https://',
      'hTTp://',
      'hTTps://',
    ];

    protocols.forEach((protocol) => {
      const url = `${protocol}example.com`;
      const result = validateUrl(url);
      
      // Валидные протоколы в любом регистре должны проходить
      expect(result.isValid).toBe(true);
      expect(result.url).not.toBeNull();
    });
  });

  it('должно отклонять опасные протоколы в любом регистре', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 29
     * 
     * Опасные протоколы должны отклоняться независимо от регистра
     */
    const dangerousVariants = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,test',
      'DATA:text/html,test',
      'Data:text/html,test',
    ];

    dangerousVariants.forEach((url) => {
      const result = validateUrl(url);
      
      expect(result.isValid).toBe(false);
      expect(result.url).toBeNull();
    });
  });
});
