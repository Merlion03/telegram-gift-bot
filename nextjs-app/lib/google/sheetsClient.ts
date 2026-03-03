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
  last_name: string;
  first_name: string;
  patronymic: string | null;
  country: string;
  postal_code: string;
  city: string;
  street: string;
  house: string;
  apartment: string | null;
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
        // Подготовка batch update для всех полей
        // Структура столбцов:
        // E: last_name, F: first_name, G: patronymic
        // H: city, I: street, J: house, K: apartment
        // L: phone, M: comment
        // N: country, O: postal_code
        // P: claimed_at (timestamp)

        const updates = [
          { range: `Sheet1!E${rowId}`, values: [[deliveryData.last_name]] },
          { range: `Sheet1!F${rowId}`, values: [[deliveryData.first_name]] },
          { range: `Sheet1!G${rowId}`, values: [[deliveryData.patronymic || '']] },
          { range: `Sheet1!H${rowId}`, values: [[deliveryData.city]] },
          { range: `Sheet1!I${rowId}`, values: [[deliveryData.street]] },
          { range: `Sheet1!J${rowId}`, values: [[deliveryData.house]] },
          { range: `Sheet1!K${rowId}`, values: [[deliveryData.apartment || '']] },
          { range: `Sheet1!L${rowId}`, values: [[deliveryData.phone]] },
          { range: `Sheet1!M${rowId}`, values: [[deliveryData.comment || '']] },
          { range: `Sheet1!N${rowId}`, values: [[deliveryData.country]] },
          { range: `Sheet1!O${rowId}`, values: [[deliveryData.postal_code]] },
        ];

        // Отметка времени получения приза в столбце P
        // Формат: ISO 8601 для единообразия
        const claimedAt = new Date().toISOString();
        updates.push({ range: `Sheet1!P${rowId}`, values: [[claimedAt]] });

        // Выполнение batch update для всех полей
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: updates,
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
