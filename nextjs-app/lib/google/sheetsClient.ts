/**
 * Google Sheets Client для Next.js
 * 
 * Обеспечивает интеграцию с Google Sheets API для сохранения данных доставки.
 * Использует Service Account для аутентификации.
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { validateSheetName } from '../utils/sheetNameValidator';
import { SheetNotFoundError, SheetAccessDeniedError } from '../types/sheet';

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
  private sheetCache: Map<string, boolean> = new Map();

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
   * Получает список всех листов в таблице
   * 
   * @returns Массив названий листов
   * @throws Error если не удалось получить информацию о листах
   */
  private async getAllSheetNames(): Promise<string[]> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheets = response.data.sheets;
      if (!sheets || sheets.length === 0) {
        throw new Error('No sheets found in spreadsheet');
      }

      return sheets
        .map(sheet => sheet.properties?.title)
        .filter((title): title is string => !!title);
    } catch (error) {
      console.error('Failed to get sheet names:', error);
      throw new Error(`Failed to get sheet names: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Проверяет существование листа в таблице с кэшированием
   * 
   * @param sheetName - Название листа для проверки
   * @returns true если лист существует
   * @throws SheetNotFoundError если лист не найден
   */
  private async verifySheetExists(sheetName: string): Promise<boolean> {
    console.log(`Verifying sheet '${sheetName}' exists`);

    // Проверяем кэш
    if (this.sheetCache.has(sheetName)) {
      return this.sheetCache.get(sheetName)!;
    }

    try {
      // Получаем список всех листов
      const allSheets = await this.getAllSheetNames();
      
      // Обновляем кэш для всех листов
      allSheets.forEach(name => this.sheetCache.set(name, true));

      // Проверяем существование нужного листа
      const exists = allSheets.includes(sheetName);
      
      if (!exists) {
        throw new SheetNotFoundError(sheetName);
      }

      return true;
    } catch (error) {
      // Если это уже SheetNotFoundError, пробрасываем дальше
      if (error instanceof SheetNotFoundError) {
        throw error;
      }

      // Для других ошибок логируем и пробрасываем
      console.error('Error verifying sheet existence:', error);
      throw error;
    }
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
   * @param sheetName - Название листа (ОБЯЗАТЕЛЬНЫЙ параметр)
   * @returns true если сохранение успешно
   * @throws Error если sheetName не передан
   * @throws SheetNotFoundError если лист не существует
   * @throws SheetAccessDeniedError если нет доступа к листу
   */
  async saveDeliveryData(
    rowId: number, 
    deliveryData: DeliveryData,
    sheetName: string
  ): Promise<boolean> {
    try {
      // Валидация sheet_name
      validateSheetName(sheetName);

      // Проверка существования листа
      await this.verifySheetExists(sheetName);

      console.log(`Using sheet: ${sheetName} for row ${rowId}`);
      
      // Подготовка batch update для всех полей
      // Структура столбцов:
      // E: last_name, F: first_name, G: patronymic
      // H: city, I: street, J: house, K: apartment
      // L: phone, M: comment
      // N: country, O: postal_code
      // P: claimed_at (timestamp)

      const updates = [
        { range: `${sheetName}!E${rowId}:E${rowId}`, values: [[deliveryData.last_name]] },
        { range: `${sheetName}!F${rowId}:F${rowId}`, values: [[deliveryData.first_name]] },
        { range: `${sheetName}!G${rowId}:G${rowId}`, values: [[deliveryData.patronymic || '']] },
        { range: `${sheetName}!H${rowId}:H${rowId}`, values: [[deliveryData.city]] },
        { range: `${sheetName}!I${rowId}:I${rowId}`, values: [[deliveryData.street]] },
        { range: `${sheetName}!J${rowId}:J${rowId}`, values: [[deliveryData.house]] },
        { range: `${sheetName}!K${rowId}:K${rowId}`, values: [[deliveryData.apartment || '']] },
        { range: `${sheetName}!L${rowId}:L${rowId}`, values: [[deliveryData.phone]] },
        { range: `${sheetName}!M${rowId}:M${rowId}`, values: [[deliveryData.comment || '']] },
        { range: `${sheetName}!N${rowId}:N${rowId}`, values: [[deliveryData.country]] },
        { range: `${sheetName}!O${rowId}:O${rowId}`, values: [[deliveryData.postal_code]] },
      ];

      // Отметка времени получения приза в столбце P
      // Формат: ISO 8601 для единообразия
      const claimedAt = new Date().toISOString();
      updates.push({ range: `${sheetName}!P${rowId}:P${rowId}`, values: [[claimedAt]] });

      console.log(`Prepared ${updates.length} updates for batch operation`);

      // Выполнение batch update для всех полей
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates,
        },
      });

      console.log(`Successfully saved delivery data to sheet '${sheetName}', row ${rowId}`);
      return true;
    } catch (error) {
      // Логирование ошибки с контекстом
      console.error('Error saving delivery data to Google Sheets:', {
        sheetName,
        rowId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Обработка специфичных ошибок Google Sheets API
      if (error instanceof Error) {
        if (error.message.includes('Unable to parse range')) {
          throw new SheetNotFoundError(sheetName);
        }
        if (error.message.includes('permission') || error.message.includes('access')) {
          throw new SheetAccessDeniedError(sheetName);
        }
      }

      // Проброс ошибки выше
      throw error;
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
