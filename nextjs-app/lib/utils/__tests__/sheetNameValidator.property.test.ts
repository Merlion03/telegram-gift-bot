/**
 * Property-Based тесты для модуля валидации sheet_name
 * 
 * Используется библиотека @fast-check/vitest для генерации тестовых данных
 */

import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  validateSheetName,
  isValidSheetName,
  InvalidSheetNameError,
  FORBIDDEN_CHARACTERS,
  MAX_SHEET_NAME_LENGTH,
} from '../sheetNameValidator';

describe('SheetNameValidator - Property Tests', () => {
  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 17:
   * Система валидирует пустые sheet_name
   * 
   * Validates: Requirements 2.4, 10.1
   * 
   * Для любого sheet_name, являющегося пустой строкой или содержащего только пробелы,
   * система должна выбросить ошибку валидации.
   */
  describe('Property 17: Система валидирует пустые sheet_name', () => {
    test.prop([fc.integer({ min: 0, max: 20 })])(
      'должен отклонять строки только из пробелов любой длины',
      (spaceCount) => {
        const emptySheet = ' '.repeat(spaceCount);
        
        expect(() => validateSheetName(emptySheet)).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName(emptySheet)).toThrow('sheet name cannot be empty');
        
        const result = isValidSheetName(emptySheet);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('sheet name cannot be empty');
      }
    );

    test.prop([
      fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 })
    ])(
      'должен отклонять строки из любых whitespace символов',
      (whitespaceString) => {
        expect(() => validateSheetName(whitespaceString)).toThrow(InvalidSheetNameError);
        
        const result = isValidSheetName(whitespaceString);
        expect(result.valid).toBe(false);
      }
    );

    it('должен отклонять пустую строку', () => {
      expect(() => validateSheetName('')).toThrow(InvalidSheetNameError);
      expect(() => validateSheetName('')).toThrow('sheet name cannot be empty');
    });
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 18:
   * Система валидирует недопустимые символы в sheet_name
   * 
   * Validates: Requirements 10.2, 10.4
   * 
   * Для любого sheet_name, содержащего недопустимые символы ([ ] * / \ ? :),
   * система должна выбросить ошибку "Invalid sheet name: contains forbidden characters".
   */
  describe('Property 18: Система валидирует недопустимые символы в sheet_name', () => {
    test.prop([
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.constantFrom(...FORBIDDEN_CHARACTERS),
      fc.string({ minLength: 0, maxLength: 50 })
    ])(
      'должен отклонять любую строку с недопустимым символом в любой позиции',
      (prefix, forbiddenChar, suffix) => {
        const sheetName = prefix + forbiddenChar + suffix;
        
        expect(() => validateSheetName(sheetName)).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName(sheetName)).toThrow('contains forbidden character');
        
        const result = isValidSheetName(sheetName);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('contains forbidden character');
      }
    );

    test.prop([
      fc.constantFrom(...FORBIDDEN_CHARACTERS)
    ])(
      'должен отклонять строку состоящую только из недопустимого символа',
      (forbiddenChar) => {
        expect(() => validateSheetName(forbiddenChar)).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName(forbiddenChar)).toThrow(`contains forbidden character: ${forbiddenChar}`);
      }
    );

    test.prop([
      fc.array(fc.constantFrom(...FORBIDDEN_CHARACTERS), { minLength: 2, maxLength: 5 })
    ])(
      'должен отклонять строку с несколькими недопустимыми символами',
      (forbiddenChars) => {
        const sheetName = 'Sheet' + forbiddenChars.join('');
        
        expect(() => validateSheetName(sheetName)).toThrow(InvalidSheetNameError);
        
        const result = isValidSheetName(sheetName);
        expect(result.valid).toBe(false);
      }
    );

    test.prop([
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
        // Генерируем только валидные строки без недопустимых символов
        return !FORBIDDEN_CHARACTERS.some(char => s.includes(char)) && s.trim().length > 0;
      })
    ])(
      'должен принимать строки без недопустимых символов',
      (validString) => {
        // Обрезаем до максимальной длины если нужно
        const sheetName = validString.slice(0, MAX_SHEET_NAME_LENGTH);
        
        expect(() => validateSheetName(sheetName)).not.toThrow();
        
        const result = isValidSheetName(sheetName);
        expect(result.valid).toBe(true);
      }
    );
  });

  /**
   * Feature: google-sheets-dynamic-worksheet-selection, Property 19:
   * Система валидирует длину sheet_name
   * 
   * Validates: Requirements 10.3
   * 
   * Для любого sheet_name длиной более 100 символов,
   * система должна выбросить ошибку валидации.
   */
  describe('Property 19: Система валидирует длину sheet_name', () => {
    test.prop([
      fc.integer({ min: MAX_SHEET_NAME_LENGTH + 1, max: MAX_SHEET_NAME_LENGTH + 1000 })
    ])(
      'должен отклонять строки длиной больше MAX_SHEET_NAME_LENGTH',
      (length) => {
        const tooLongName = 'A'.repeat(length);
        
        expect(() => validateSheetName(tooLongName)).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName(tooLongName)).toThrow(
          `sheet name length exceeds maximum of ${MAX_SHEET_NAME_LENGTH} characters`
        );
        
        const result = isValidSheetName(tooLongName);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      }
    );

    test.prop([
      fc.integer({ min: 1, max: MAX_SHEET_NAME_LENGTH })
    ])(
      'должен принимать строки длиной от 1 до MAX_SHEET_NAME_LENGTH',
      (length) => {
        const validLengthName = 'A'.repeat(length);
        
        expect(() => validateSheetName(validLengthName)).not.toThrow();
        
        const result = isValidSheetName(validLengthName);
        expect(result.valid).toBe(true);
      }
    );

    it('должен принимать строку ровно MAX_SHEET_NAME_LENGTH символов', () => {
      const exactMaxName = 'A'.repeat(MAX_SHEET_NAME_LENGTH);
      
      expect(() => validateSheetName(exactMaxName)).not.toThrow();
      
      const result = isValidSheetName(exactMaxName);
      expect(result.valid).toBe(true);
    });

    it('должен отклонять строку MAX_SHEET_NAME_LENGTH + 1 символов', () => {
      const tooLongName = 'A'.repeat(MAX_SHEET_NAME_LENGTH + 1);
      
      expect(() => validateSheetName(tooLongName)).toThrow(InvalidSheetNameError);
      
      const result = isValidSheetName(tooLongName);
      expect(result.valid).toBe(false);
    });

    test.prop([
      fc.string({ minLength: 1, maxLength: MAX_SHEET_NAME_LENGTH }).filter(s => {
        // Генерируем валидные строки: не пустые, без недопустимых символов
        return s.trim().length > 0 && !FORBIDDEN_CHARACTERS.some(char => s.includes(char));
      })
    ])(
      'должен принимать любую валидную строку допустимой длины',
      (validString) => {
        expect(() => validateSheetName(validString)).not.toThrow();
        
        const result = isValidSheetName(validString);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    );
  });

  /**
   * Дополнительный property тест: комбинированная валидация
   * 
   * Проверяет, что валидация работает корректно для любых комбинаций входных данных
   */
  describe('Комбинированная валидация', () => {
    test.prop([
      fc.string({ minLength: 1, maxLength: MAX_SHEET_NAME_LENGTH }).filter(s => {
        // Генерируем только полностью валидные строки
        return s.trim().length > 0 && !FORBIDDEN_CHARACTERS.some(char => s.includes(char));
      })
    ])(
      'validateSheetName и isValidSheetName должны давать согласованные результаты для валидных строк',
      (validString) => {
        let threwError = false;
        try {
          validateSheetName(validString);
        } catch {
          threwError = true;
        }
        
        const result = isValidSheetName(validString);
        
        // Если validateSheetName не выбросил ошибку, isValidSheetName должен вернуть valid: true
        expect(threwError).toBe(false);
        expect(result.valid).toBe(true);
      }
    );

    test.prop([
      fc.oneof(
        // Пустые строки
        fc.constant(''),
        fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }),
        // Строки с недопустимыми символами
        fc.string({ minLength: 1, maxLength: 50 }).chain(s => 
          fc.constantFrom(...FORBIDDEN_CHARACTERS).map(char => s + char)
        ),
        // Слишком длинные строки
        fc.string({ minLength: MAX_SHEET_NAME_LENGTH + 1, maxLength: MAX_SHEET_NAME_LENGTH + 100 })
      )
    ])(
      'validateSheetName и isValidSheetName должны давать согласованные результаты для невалидных строк',
      (invalidString) => {
        let threwError = false;
        try {
          validateSheetName(invalidString);
        } catch {
          threwError = true;
        }
        
        const result = isValidSheetName(invalidString);
        
        // Если validateSheetName выбросил ошибку, isValidSheetName должен вернуть valid: false
        expect(threwError).toBe(true);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    );
  });
});
