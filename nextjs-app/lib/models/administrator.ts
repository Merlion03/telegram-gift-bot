/**
 * Модель администратора системы
 * Представляет запись из таблицы administrators
 */

export interface Administrator {
  /** Telegram ID администратора (Primary Key) */
  tgId: number;
  
  /** Telegram username администратора */
  username: string;
  
  /** Уровень роли: 0=Developer, 1=Assistant, 2=Administrator, 3=Operator */
  role: number;
  
  /** Хеш пароля (Argon2id), NULL для новых администраторов */
  passwordHash: string | null;
  
  /** Время создания записи */
  createdAt: Date;
  
  /** Время последнего обновления */
  updatedAt: Date;
}

/**
 * Данные для создания нового администратора
 */
export interface CreateAdministratorData {
  tgId: number;
  username: string;
  role: number;
}

/**
 * Данные для обновления пароля администратора
 */
export interface UpdatePasswordData {
  tgId: number;
  passwordHash: string;
}
