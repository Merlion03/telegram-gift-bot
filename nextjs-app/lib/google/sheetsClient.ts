/**
 * Google Sheets Client для Next.js
 * 
 * Обеспечивает интеграцию с Google Sheets API для сохранения данных доставки.
 * Использует Service Account для аутентификации.
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

/**
 * Интерфейс данных доставки для сохранения в Google Sheets
 */
export interface DeliveryData {
  full_name: string;
  address: string;
  phone: string;
  comment?: string;
  telegram_id: number;
}

/**
 * Клиент для работы с Google Sheets API
 */
export class GoogleSheetsClient {
  private auth: JWT;
  private spreadsheetId: string;
  private sheets: ReturnType<typeof google.sheets>;

  /**
   * Создаёт экземпляр GoogleSheetsClient
   * 
   * @param credentialsPath - Путь к JSON файлу с credentials Service Account
   * @param spreadsheetId - ID Google Таблицы
   */
  constructor(credentialsPath: string, spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
    this.auth = this.initializeAuth(credentialsPath);
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * Инициализирует аутентификацию через Service Account
   */
  private initializeAuth(credentialsPath: string): JWT {
    // Загрузка credentials из файла или переменной окружения
    let credentials;
    
    try {
      // Попытка загрузить из переменной окружения (для production)
      if (process.env.GOOGLE_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      } else {
        // Загрузка из файла (для development)
        const fs = require('fs');
        credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      }
    } catch (error) {
      throw new Error(`Failed to load Google credentials: ${error}`);
    }

    return new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  /**
   * Сохраняет данные доставки в Google Sheets
   * 
   * @param rowId - Номер строки для обновления (row_id из Prize_Database)
   * @param deliveryData - Данные доставки для сохранения
   * @returns true если сохранение успешно
   * @throws Error если произошла ошибка при сохранении
   */
  async saveDeliveryData(rowId: number, deliveryData: DeliveryData): Promise<boolean> {
    try {
      // Подготовка данных для записи
      // Предполагаем, что столбцы E-H используются для данных доставки
      // E: full_name, F: address, G: phone, H: comment
      const values = [
        [
          deliveryData.full_name,
          deliveryData.address,
          deliveryData.phone,
          deliveryData.comment || '',
        ],
      ];

      // Определение диапазона для обновления (строка rowId, столбцы E-H)
      const range = `Sheet1!E${rowId}:H${rowId}`;

      // Выполнение обновления
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      // Дополнительно: отметка времени получения приза в столбце I
      const claimedAtRange = `Sheet1!I${rowId}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: claimedAtRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[new Date().toISOString()]],
        },
      });

      return true;
    } catch (error) {
      // Логирование ошибки
      console.error('Error saving delivery data to Google Sheets:', error);
      
      // Проброс ошибки для обработки на верхнем уровне
      throw new Error(
        `Failed to save delivery data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Проверяет доступность Google Sheets API
   * 
   * @returns true если API доступен
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      return true;
    } catch (error) {
      console.error('Google Sheets API health check failed:', error);
      return false;
    }
  }
}
