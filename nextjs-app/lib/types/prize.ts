/**
 * Типы и классы ошибок для работы с призами
 * 
 * Модуль содержит интерфейсы для данных призов и классы ошибок
 * для обработки различных сценариев взаимодействия с Backend API
 */

/**
 * Информация о призе из Backend API
 * 
 * @property sheet_name - Название листа в Google Таблице, где находится запись победителя
 * @property row_id - Номер строки в Google Sheets с записью победителя
 * @property code_word - Кодовое слово для верификации приза
 */
export interface PrizeInfo {
  sheet_name: string;
  row_id: number;
  code_word: string;
}

/**
 * Ошибка: приз не найден в базе данных
 * 
 * Выбрасывается когда Backend API возвращает HTTP 404,
 * указывая что приз с указанным prize_id не существует в Prize_Database
 * 
 * Validates: Requirements 1.2
 */
export class PrizeNotFoundError extends Error {
  constructor(prizeId: number) {
    super(`Prize with ID ${prizeId} not found`);
    this.name = 'PrizeNotFoundError';
  }
}

/**
 * Ошибка: Backend API недоступен
 * 
 * Выбрасывается при сетевых ошибках, timeout или других проблемах
 * взаимодействия с Backend API
 * 
 * Validates: Requirements 9.3
 */
export class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(`Backend service unavailable: ${message}`);
    this.name = 'BackendUnavailableError';
  }
}
