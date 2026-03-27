/**
 * HTTP клиент для взаимодействия с Backend API
 * 
 * Модуль предоставляет класс PrizeClient для получения информации о призах
 * из Backend API (Python Telegram bot приложение)
 * 
 * Validates: Requirements 1.1, 1.2, 1.4, 9.2, 9.3
 */

import { PrizeInfo, PrizeNotFoundError, BackendUnavailableError } from '../types/prize';

// Реэкспорт классов ошибок для удобства использования
export { PrizeNotFoundError, BackendUnavailableError };

/**
 * HTTP клиент для получения информации о призах из Backend API
 * 
 * Класс обеспечивает:
 * - Получение информации о призе по prize_id
 * - Обработку HTTP 404 (приз не найден)
 * - Обработку сетевых ошибок и timeout (5 секунд)
 * - Валидацию структуры JSON ответа
 * - Логирование всех ошибок взаимодействия с Backend
 * 
 * @example
 * const client = new PrizeClient('http://localhost:5000');
 * const prizeInfo = await client.getPrizeInfo(42);
 * console.log(prizeInfo.sheet_name); // "Лист1"
 */
export class PrizeClient {
  private backendUrl: string;
  private readonly timeout: number = 5000; // 5 секунд

  /**
   * Создает экземпляр PrizeClient
   * 
   * @param backendUrl - URL Backend API (например, http://localhost:5000)
   */
  constructor(backendUrl: string) {
    this.backendUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
  }

  /**
   * Получает информацию о призе по prize_id
   * 
   * Выполняет GET запрос к Backend API endpoint /api/prize/{prize_id}
   * и возвращает информацию о призе (sheet_name, row_id, code_word)
   * 
   * @param prizeId - ID приза для получения информации
   * @returns Информация о призе
   * @throws PrizeNotFoundError если приз не найден (HTTP 404)
   * @throws BackendUnavailableError если Backend недоступен или вернул ошибку
   * 
   * Validates: Requirements 1.1, 1.2, 1.4, 9.2, 9.3
   */
  async getPrizeInfo(prizeId: number): Promise<PrizeInfo> {
    const url = `${this.backendUrl}/api/prize/${prizeId}`;
    
    try {
      console.log(`[PrizeClient] Fetching prize info for prize_id: ${prizeId}`);
      
      // Создаем AbortController для timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      
      // Обработка HTTP 404 - приз не найден
      if (response.status === 404) {
        console.error(`[PrizeClient] Prize not found: prize_id=${prizeId}`);
        throw new PrizeNotFoundError(prizeId);
      }
      
      // Обработка других HTTP ошибок
      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`[PrizeClient] Backend returned error: ${errorMessage}`);
        throw new BackendUnavailableError(errorMessage);
      }
      
      // Парсинг JSON ответа
      let data: unknown;
      try {
        data = await response.json();
      } catch (parseError) {
        const errorMessage = 'Invalid JSON response from backend';
        console.error(`[PrizeClient] ${errorMessage}:`, parseError);
        throw new BackendUnavailableError(errorMessage);
      }
      
      // Валидация структуры ответа
      if (!this.isValidPrizeInfo(data)) {
        const errorMessage = 'Invalid response structure from backend: missing required fields';
        console.error(`[PrizeClient] ${errorMessage}. Received:`, data);
        throw new BackendUnavailableError(errorMessage);
      }
      
      console.log(`[PrizeClient] Successfully fetched prize info: sheet_name="${data.sheet_name}", row_id=${data.row_id}`);
      
      return data;
      
    } catch (error) {
      // Проброс уже обработанных ошибок
      if (error instanceof PrizeNotFoundError || error instanceof BackendUnavailableError) {
        throw error;
      }
      
      // Обработка timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const errorMessage = `Request timeout after ${this.timeout}ms`;
        console.error(`[PrizeClient] ${errorMessage} for prize_id=${prizeId}`);
        throw new BackendUnavailableError(errorMessage);
      }
      
      // Обработка сетевых ошибок
      if (error instanceof TypeError) {
        const errorMessage = `Network error: unable to reach backend at ${this.backendUrl}`;
        console.error(`[PrizeClient] ${errorMessage}:`, error);
        throw new BackendUnavailableError(errorMessage);
      }
      
      // Обработка неожиданных ошибок
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[PrizeClient] Unexpected error:`, error);
      throw new BackendUnavailableError(`Unexpected error: ${errorMessage}`);
    }
  }

  /**
   * Проверяет, что объект соответствует интерфейсу PrizeInfo
   * 
   * @param data - Объект для проверки
   * @returns true если объект валиден
   */
  private isValidPrizeInfo(data: unknown): data is PrizeInfo {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    
    const obj = data as Record<string, unknown>;
    
    return (
      typeof obj.sheet_name === 'string' &&
      obj.sheet_name.length > 0 &&
      typeof obj.row_id === 'number' &&
      obj.row_id > 0 &&
      typeof obj.code_word === 'string' &&
      obj.code_word.length > 0
    );
  }
}
