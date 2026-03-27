/**
 * Модуль валидации названий листов Google Sheets
 * 
 * Обеспечивает проверку корректности sheet_name перед использованием в Google Sheets API
 */

/**
 * Список недопустимых символов для названий листов Google Sheets
 */
export const FORBIDDEN_CHARACTERS = ['[', ']', '*', '/', '\\', '?', ':'];

/**
 * Максимальная длина названия листа
 */
export const MAX_SHEET_NAME_LENGTH = 100;

/**
 * Ошибка валидации sheet_name
 */
export class InvalidSheetNameError extends Error {
  constructor(sheetName: string, reason: string) {
    super(`Invalid sheet name "${sheetName}": ${reason}`);
    this.name = 'InvalidSheetNameError';
  }
}

/**
 * Результат валидации sheet_name
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Валидирует название листа Google Sheets
 * 
 * Проверяет:
 * - Не пустая строка
 * - Длина не превышает 100 символов
 * - Не содержит недопустимые символы: [ ] * / \ ? :
 * 
 * @param sheetName - Название листа для валидации
 * @throws InvalidSheetNameError если валидация не прошла
 */
export function validateSheetName(sheetName: string): void {
  // Проверка на пустую строку или строку только из пробелов
  if (!sheetName || sheetName.trim().length === 0) {
    throw new InvalidSheetNameError(sheetName, 'sheet name cannot be empty');
  }

  // Проверка длины
  if (sheetName.length > MAX_SHEET_NAME_LENGTH) {
    throw new InvalidSheetNameError(
      sheetName,
      `sheet name length exceeds maximum of ${MAX_SHEET_NAME_LENGTH} characters`
    );
  }

  // Проверка на недопустимые символы
  for (const char of FORBIDDEN_CHARACTERS) {
    if (sheetName.includes(char)) {
      throw new InvalidSheetNameError(
        sheetName,
        `contains forbidden character: ${char}`
      );
    }
  }
}

/**
 * Проверяет название листа без выброса исключений
 * 
 * @param sheetName - Название листа для проверки
 * @returns Результат валидации с описанием ошибки (если есть)
 */
export function isValidSheetName(sheetName: string): ValidationResult {
  try {
    validateSheetName(sheetName);
    return { valid: true };
  } catch (error) {
    if (error instanceof InvalidSheetNameError) {
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Unknown validation error' };
  }
}
