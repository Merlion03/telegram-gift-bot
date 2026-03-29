/**
 * Репозиторий для работы с администраторами
 * Использует существующий DatabaseClient для подключения к БД
 */

import { DatabaseClient } from '@/lib/database/client';
import type { Administrator, UpdatePasswordData } from '@/lib/models/administrator';

/**
 * AdminRepository - репозиторий для работы с таблицей administrators
 */
export class AdminRepository {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Получает администратора по Telegram ID
   * @param tgId - Telegram ID администратора
   * @returns Администратор или null если не найден
   */
  async getByTgId(tgId: number): Promise<Administrator | null> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      const query = `
        SELECT 
          tg_id as "tgId",
          username,
          role,
          password_hash as "passwordHash",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM administrators
        WHERE tg_id = $1
      `;

      const result = await this.db['pool'].query(query, [tgId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        tgId: row.tgId,
        username: row.username,
        role: row.role,
        passwordHash: row.passwordHash,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      };
    } catch (error) {
      console.error('Error fetching administrator by tgId:', error);
      throw new Error('Failed to fetch administrator');
    }
  }

  /**
   * Проверяет существование администратора
   * @param tgId - Telegram ID администратора
   * @returns true если администратор существует
   */
  async exists(tgId: number): Promise<boolean> {
    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    try {
      const query = `
        SELECT EXISTS(
          SELECT 1 FROM administrators WHERE tg_id = $1
        ) as exists
      `;

      const result = await this.db['pool'].query(query, [tgId]);
      return result.rows[0].exists;
    } catch (error) {
      console.error('Error checking administrator existence:', error);
      throw new Error('Failed to check administrator existence');
    }
  }

  /**
   * Обновляет пароль администратора
   * @param data - Данные для обновления пароля
   */
  async updatePassword(data: UpdatePasswordData): Promise<void> {
    const { tgId, passwordHash } = data;

    if (tgId < 1) {
      throw new Error('tgId must be >= 1');
    }

    if (!passwordHash || passwordHash.trim().length === 0) {
      throw new Error('passwordHash cannot be empty');
    }

    try {
      const query = `
        UPDATE administrators
        SET 
          password_hash = $1,
          updated_at = NOW()
        WHERE tg_id = $2
      `;

      const result = await this.db['pool'].query(query, [passwordHash, tgId]);

      if (result.rowCount === 0) {
        throw new Error('Administrator not found');
      }
    } catch (error) {
      console.error('Error updating administrator password:', error);
      throw new Error('Failed to update administrator password');
    }
  }

  /**
   * Получает всех администраторов
   * @returns Список всех администраторов
   */
  async getAll(): Promise<Administrator[]> {
    try {
      const query = `
        SELECT 
          tg_id as "tgId",
          username,
          role,
          password_hash as "passwordHash",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM administrators
        ORDER BY role ASC, created_at ASC
      `;

      const result = await this.db['pool'].query(query);

      return result.rows.map((row) => ({
        tgId: row.tgId,
        username: row.username,
        role: row.role,
        passwordHash: row.passwordHash,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }));
    } catch (error) {
      console.error('Error fetching all administrators:', error);
      throw new Error('Failed to fetch administrators');
    }
  }
}

/**
 * Создаёт экземпляр AdminRepository с существующим DatabaseClient
 */
export function createAdminRepository(): AdminRepository {
  const db = DatabaseClient.getInstance();
  return new AdminRepository(db);
}
