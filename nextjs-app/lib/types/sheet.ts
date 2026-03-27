/**
 * Типы и классы ошибок для работы с листами Google Sheets
 */

/**
 * Базовая ошибка для всех ошибок, связанных с листами
 */
export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetError';
  }
}

/**
 * Ошибка: лист не найден в таблице
 */
export class SheetNotFoundError extends SheetError {
  constructor(sheetName: string) {
    super(`Sheet "${sheetName}" does not exist in spreadsheet`);
    this.name = 'SheetNotFoundError';
  }
}

/**
 * Ошибка: нет доступа к листу
 */
export class SheetAccessDeniedError extends SheetError {
  constructor(sheetName: string) {
    super(`Access denied to sheet "${sheetName}"`);
    this.name = 'SheetAccessDeniedError';
  }
}
