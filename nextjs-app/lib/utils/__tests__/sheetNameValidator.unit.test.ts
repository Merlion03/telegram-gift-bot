/**
 * Unit тесты для модуля валидации sheet_name
 */

import { describe, it, expect } from 'vitest';
import {
  validateSheetName,
  isValidSheetName,
  InvalidSheetNameError,
  FORBIDDEN_CHARACTERS,
  MAX_SHEET_NAME_LENGTH,
} from '../sheetNameValidator';

describe('SheetNameValidator - Unit Tests', () => {
  describe('validateSheetName()', () => {
    describe('валидные названия листов', () => {
      it('должен принимать простое название листа', () => {
        expect(() => validateSheetName('Лист1')).not.toThrow();
      });

      it('должен принимать название с пробелами', () => {
        expect(() => validateSheetName('Мой Лист')).not.toThrow();
      });

      it('должен принимать название с цифрами', () => {
        expect(() => validateSheetName('Sheet123')).not.toThrow();
      });

      it('должен принимать название с дефисами и подчеркиваниями', () => {
        expect(() => validateSheetName('My-Sheet_2024')).not.toThrow();
      });

      it('должен принимать название с кириллицей', () => {
        expect(() => validateSheetName('Призы 2024')).not.toThrow();
      });

      it('должен принимать название максимальной длины (100 символов)', () => {
        const maxLengthName = 'A'.repeat(MAX_SHEET_NAME_LENGTH);
        expect(() => validateSheetName(maxLengthName)).not.toThrow();
      });
    });

    describe('пустые строки и строки с пробелами', () => {
      it('должен отклонять пустую строку', () => {
        expect(() => validateSheetName('')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('')).toThrow('sheet name cannot be empty');
      });

      it('должен отклонять строку только из пробелов', () => {
        expect(() => validateSheetName('   ')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('   ')).toThrow('sheet name cannot be empty');
      });

      it('должен отклонять строку из табуляций', () => {
        expect(() => validateSheetName('\t\t')).toThrow(InvalidSheetNameError);
      });

      it('должен отклонять строку из переносов строк', () => {
        expect(() => validateSheetName('\n\n')).toThrow(InvalidSheetNameError);
      });
    });

    describe('недопустимые символы', () => {
      it('должен отклонять название с символом [', () => {
        expect(() => validateSheetName('Sheet[1]')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet[1]')).toThrow('contains forbidden character: [');
      });

      it('должен отклонять название с символом ]', () => {
        expect(() => validateSheetName('Sheet]1')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet]1')).toThrow('contains forbidden character: ]');
      });

      it('должен отклонять название с символом *', () => {
        expect(() => validateSheetName('Sheet*')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet*')).toThrow('contains forbidden character: *');
      });

      it('должен отклонять название с символом /', () => {
        expect(() => validateSheetName('Sheet/1')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet/1')).toThrow('contains forbidden character: /');
      });

      it('должен отклонять название с символом \\', () => {
        expect(() => validateSheetName('Sheet\\1')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet\\1')).toThrow('contains forbidden character: \\');
      });

      it('должен отклонять название с символом ?', () => {
        expect(() => validateSheetName('Sheet?')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet?')).toThrow('contains forbidden character: ?');
      });

      it('должен отклонять название с символом :', () => {
        expect(() => validateSheetName('Sheet:1')).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName('Sheet:1')).toThrow('contains forbidden character: :');
      });

      it('должен отклонять название с несколькими недопустимыми символами', () => {
        expect(() => validateSheetName('Sheet[*]')).toThrow(InvalidSheetNameError);
      });
    });

    describe('слишком длинные названия', () => {
      it('должен отклонять название длиной 101 символ', () => {
        const tooLongName = 'A'.repeat(MAX_SHEET_NAME_LENGTH + 1);
        expect(() => validateSheetName(tooLongName)).toThrow(InvalidSheetNameError);
        expect(() => validateSheetName(tooLongName)).toThrow(
          `sheet name length exceeds maximum of ${MAX_SHEET_NAME_LENGTH} characters`
        );
      });

      it('должен отклонять название длиной 200 символов', () => {
        const tooLongName = 'A'.repeat(200);
        expect(() => validateSheetName(tooLongName)).toThrow(InvalidSheetNameError);
      });

      it('должен отклонять очень длинное название (1000 символов)', () => {
        const veryLongName = 'A'.repeat(1000);
        expect(() => validateSheetName(veryLongName)).toThrow(InvalidSheetNameError);
      });
    });
  });

  describe('isValidSheetName()', () => {
    it('должен возвращать valid: true для корректного названия', () => {
      const result = isValidSheetName('Лист1');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('должен возвращать valid: false для пустой строки', () => {
      const result = isValidSheetName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('sheet name cannot be empty');
    });

    it('должен возвращать valid: false для названия с недопустимым символом', () => {
      const result = isValidSheetName('Sheet[1]');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('contains forbidden character');
    });

    it('должен возвращать valid: false для слишком длинного названия', () => {
      const tooLongName = 'A'.repeat(MAX_SHEET_NAME_LENGTH + 1);
      const result = isValidSheetName(tooLongName);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('exceeds maximum');
    });

    it('должен возвращать valid: true для названия максимальной длины', () => {
      const maxLengthName = 'A'.repeat(MAX_SHEET_NAME_LENGTH);
      const result = isValidSheetName(maxLengthName);
      expect(result.valid).toBe(true);
    });

    it('должен возвращать valid: false для строки из пробелов', () => {
      const result = isValidSheetName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sheet name cannot be empty');
    });
  });

  describe('константы', () => {
    it('FORBIDDEN_CHARACTERS должен содержать все недопустимые символы', () => {
      expect(FORBIDDEN_CHARACTERS).toEqual(['[', ']', '*', '/', '\\', '?', ':']);
    });

    it('MAX_SHEET_NAME_LENGTH должен быть равен 100', () => {
      expect(MAX_SHEET_NAME_LENGTH).toBe(100);
    });
  });

  describe('InvalidSheetNameError', () => {
    it('должен создавать ошибку с правильным сообщением', () => {
      const error = new InvalidSheetNameError('TestSheet', 'test reason');
      expect(error.message).toBe('Invalid sheet name "TestSheet": test reason');
      expect(error.name).toBe('InvalidSheetNameError');
    });

    it('должен быть экземпляром Error', () => {
      const error = new InvalidSheetNameError('TestSheet', 'test reason');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
