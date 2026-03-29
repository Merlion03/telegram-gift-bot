/**
 * Репозиторий для работы с попытками входа (rate limiting)
 * Использует существующий DatabaseClient для подключения к БД
 */

import { DatabaseClient } from '@/lib/database/client';

/**
 * Модель попытки входа
 */
export interface AuthAttempt {
  id: number;
  tgId: number;
  timestamp: Date;
  ipAddress: string | null;
  success: boolean;
}

/**
 * AuthAttemptsRepository - репозиторий для работы с таблицей auth_attempts
 */
export class AuthAttemptsRepository {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Подсчитывает количество попыток за последние N минут
   * @param tgId - Telegram ID администратора
   * @param minutes - Количество минут для проверки (по умолчанию 15)
   * @returns Количество попыток
   */
  async countRecentAttempts(tgId: number, minutes: number = 15): Promise<number> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    if (minutes < 1) {
      throw new Error('minutes must be >= 1');
    }

    try {
      const query = `
        SELECT COUNT(*) as count
        FROM auth_attempts
        WHERE tg_id = $1
          AND timestamp > NOW() - INTERVAL '${minutes} minutes'
          AND success = false
      `;

      const result = await this.db['pool'].query(query, [tgId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('Error counting recent auth attempts:', error);
      throw new Error('Failed to count recent auth attempts');
    }
  }

  /**
   * Записывает попытку входа
   * @param tgId - Telegram ID администратора
   * @param ipAddress - IP адрес (опционально)
   * @param success - Успешность попытки (по умолчанию false)
   */
  async recordAttempt(
    tgId: number,
    ipAddress: string | null = null,
    success: boolean = false
  ): Promise<void> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      const query = `
        INSERT INTO auth_attempts (tg_id, ip_address, success, timestamp)
        VALUES ($1, $2, $3, NOW())
      `;

      await this.db['pool'].query(query, [tgId, ipAddress, success]);
    } catch (error) {
      console.error('Error recording auth attempt:', error);
      throw new Error('Failed to record auth attempt');
    }
  }

  /**
   * Очищает все попытки для указанного tg_id
   * @param tgId - Telegram ID администратора
   */
  async clearAttempts(tgId: number): Promise<void> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      const query = `
        DELETE FROM auth_attempts
        WHERE tg_id = $1
      `;

      await this.db['pool'].query(query, [tgId]);
    } catch (error) {
      console.error('Error clearing auth attempts:', error);
      throw new Error('Failed to clear auth attempts');
    }
  }

  /**
   * Удаляет старые попытки (для периодической очистки)
   * @param hours - Количество часов (по умолчанию 24)
   * @returns Количество удалённых записей
   */
  async cleanupOldAttempts(hours: number = 24): Promise<number> {
    if (hours < 1) {
      throw new Error('hours must be >= 1');
    }

    try {
      const query = `
        DELETE FROM auth_attempts
        WHERE timestamp < NOW() - INTERVAL '${hours} hours'
      `;

      const result = await this.db['pool'].query(query);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up old auth attempts:', error);
      throw new Error('Failed to cleanup old auth attempts');
    }
  }

  /**
   * Получает самую старую попытку в окне времени
   * @param tgId - Telegram ID администратора
   * @param windowStart - Начало временного окна
   * @returns Самая старая попытка или null
   */
  async getOldestInWindow(
    tgId: number,
    windowStart: Date
  ): Promise<AuthAttempt | null> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      const query = `
        SELECT 
          id,
          tg_id as "tgId",
          timestamp,
          ip_address as "ipAddress",
          success
        FROM auth_attempts
        WHERE tg_id = $1
          AND timestamp >= $2
          AND success = false
        ORDER BY timestamp ASC
        LIMIT 1
      `;

      const result = await this.db['pool'].query(query, [tgId, windowStart]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        tgId: row.tgId,
        timestamp: new Date(row.timestamp),
        ipAddress: row.ipAddress,
        success: row.success,
      };
    } catch (error) {
      console.error('Error fetching oldest auth attempt:', error);
      throw new Error('Failed to fetch oldest auth attempt');
    }
  }
}

/**
 * Создаёт экземпляр AuthAttemptsRepository с существующим DatabaseClient
 */
export function createAuthAttemptsRepository(): AuthAttemptsRepository {
  const db = DatabaseClient.getInstance();
  return new AuthAttemptsRepository(db);
}
