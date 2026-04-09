/**
 * Database Client для работы с PostgreSQL
 * Обеспечивает подключение и базовые операции с БД поддержки
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import type {
  SupportSession,
  SupportMessage,
  CreateMessageData,
  GetSessionsParams,
} from '@/types/support';

/**
 * Конфигурация подключения к БД
 */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number; // Максимальное количество соединений в пуле
  idleTimeoutMillis?: number; // Таймаут неактивного соединения
  connectionTimeoutMillis?: number; // Таймаут подключения
}

/**
 * Результат пагинации сессий
 */
export interface PaginatedSessions {
  sessions: SupportSession[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Экспорт типа SupportSession для использования в других модулях
 */
export type { SupportSession };

/**
 * DatabaseClient - клиент для работы с PostgreSQL
 * Использует connection pooling для оптимальной производительности
 */
export class DatabaseClient {
  private pool: Pool;
  private static instance: DatabaseClient | null = null;

  /**
   * Создаёт новый экземпляр DatabaseClient
   * @param config - Конфигурация подключения (опционально, по умолчанию из env)
   */
  constructor(config?: DatabaseConfig) {
    const dbConfig = config || this.getConfigFromEnv();
    
    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: dbConfig.max || 20, // Максимум 20 соединений
      idleTimeoutMillis: dbConfig.idleTimeoutMillis || 30000, // 30 секунд
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis || 5000, // 5 секунд
    });

    // Обработка ошибок пула
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Получает конфигурацию из переменных окружения
   */
  private getConfigFromEnv(): DatabaseConfig {
    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
    const database = process.env.POSTGRES_DB || 'telegram_bot';
    const user = process.env.POSTGRES_USER || 'postgres';
    const password = process.env.POSTGRES_PASSWORD || '';

    if (!password) {
      throw new Error('POSTGRES_PASSWORD environment variable is required');
    }

    return { host, port, database, user, password };
  }

  /**
   * Singleton pattern для переиспользования пула соединений
   */
  static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  /**
   * Получает список сессий поддержки с пагинацией
   * @param params - Параметры фильтрации и пагинации
   * @returns Список сессий с метаданными пагинации
   * 
   * Validates: Requirements 3.1, 3.2, 5.3, 7.1, 8.1, 8.5
   */
  async getSessions(params: GetSessionsParams = {}): Promise<PaginatedSessions> {
    const {
      status,
      session_type,
      page = 1,
      limit = 50,
    } = params;

    // Валидация параметров
    if (page < 1) {
      throw new Error('Page must be >= 1');
    }
    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    const offset = (page - 1) * limit;

    try {
      // Строим WHERE условия динамически
      const whereConditions: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (status) {
        whereConditions.push(`s.status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      if (session_type) {
        whereConditions.push(`s.session_type = $${paramIndex}`);
        queryParams.push(session_type);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Получаем общее количество сессий
      const countQuery = `
        SELECT COUNT(*) as total
        FROM support_sessions s
        ${whereClause}
      `;
      const countResult = await this.pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total, 10);

      // Получаем сессии с подсчётом непрочитанных сообщений и информацией о пользователях
      // Сортировка по времени последнего сообщения (Requirements 3.1)
      const sessionsQuery = `
        SELECT 
          s.id,
          s.telegram_id,
          s.status,
          s.session_type,
          s.created_at,
          s.closed_at,
          s.first_name,
          s.last_name,
          s.username,
          s.help_needed,
          COUNT(CASE WHEN m.message_type = 'from_user' AND m.delivered = false THEN 1 END) as unread_count,
          MAX(m.message_text) as last_message,
          MAX(m.created_at) as last_message_at
        FROM support_sessions s
        LEFT JOIN support_messages m ON s.id = m.session_id
        ${whereClause}
        GROUP BY s.id, s.telegram_id, s.status, s.session_type, s.created_at, s.closed_at, s.first_name, s.last_name, s.username, s.help_needed
        ORDER BY COALESCE(MAX(m.created_at), s.created_at) DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const sessionsResult = await this.pool.query(
        sessionsQuery, 
        [...queryParams, limit, offset]
      );

      const sessions: SupportSession[] = sessionsResult.rows.map((row) => ({
        id: row.id,
        telegram_id: row.telegram_id,
        status: row.status,
        session_type: row.session_type,
        created_at: row.created_at.toISOString(),
        closed_at: row.closed_at ? row.closed_at.toISOString() : undefined,
        unread_count: parseInt(row.unread_count, 10),
        last_message: row.last_message || undefined,
        last_message_at: row.last_message_at ? row.last_message_at.toISOString() : undefined,
        // Информация о пользователе
        user_name: row.first_name && row.last_name 
          ? `${row.first_name} ${row.last_name}` 
          : row.first_name || undefined,
        user_username: row.username || undefined,
        // Флаг запроса помощи (Requirements 5.8)
        help_needed: row.help_needed || false,
      }));

      const has_more = offset + sessions.length < total;

      return {
        sessions,
        total,
        page,
        limit,
        has_more,
      };
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw new Error('Failed to fetch support sessions');
    }
  }

  /**
   * Получает все сообщения для конкретной сессии
   * @param sessionId - ID сессии поддержки
   * @returns Список сообщений, отсортированных по времени создания
   */
  async getMessages(sessionId: number): Promise<SupportMessage[]> {
    if (sessionId < 1) {
      throw new Error('Session ID must be >= 1');
    }

    try {
      const query = `
        SELECT 
          id,
          session_id,
          telegram_id,
          message_type,
          message_text,
          file_id,
          created_at,
          delivered,
          media_type,
          file_path,
          caption,
          file_size
        FROM support_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
      `;

      const result = await this.pool.query(query, [sessionId]);

      return result.rows.map((row) => ({
        id: row.id,
        session_id: row.session_id,
        telegram_id: row.telegram_id,
        message_type: row.message_type,
        message_text: row.message_text,
        file_id: row.file_id || undefined,
        created_at: row.created_at.toISOString(),
        delivered: row.delivered,
        media_type: row.media_type || 'text',
        file_path: row.file_path || undefined,
        caption: row.caption || undefined,
        file_size: row.file_size || undefined,
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw new Error('Failed to fetch messages');
    }
  }

  /**
   * Сохраняет новое сообщение в БД
   * @param data - Данные сообщения
   * @returns Созданное сообщение с ID
   */
  async saveMessage(data: CreateMessageData): Promise<SupportMessage> {
    const { session_id, telegram_id, message_type, message_text, file_id } = data;

    // Валидация данных
    if (!session_id || session_id < 1) {
      throw new Error('Valid session_id is required');
    }
    if (!telegram_id || telegram_id < 1) {
      throw new Error('Valid telegram_id is required');
    }
    if (!message_type || !['from_user', 'from_support'].includes(message_type)) {
      throw new Error('message_type must be "from_user" or "from_support"');
    }
    if (!message_text || message_text.trim().length === 0) {
      throw new Error('message_text cannot be empty');
    }

    try {
      const query = `
        INSERT INTO support_messages (
          session_id,
          telegram_id,
          message_type,
          message_text,
          file_id,
          delivered,
          media_type,
          file_path,
          caption,
          file_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING 
          id,
          session_id,
          telegram_id,
          message_type,
          message_text,
          file_id,
          created_at,
          delivered,
          media_type,
          file_path,
          caption,
          file_size
      `;

      // Сообщения от поддержки изначально не доставлены
      const delivered = message_type === 'from_user';

      const result = await this.pool.query(query, [
        session_id,
        telegram_id,
        message_type,
        message_text,
        file_id || null,
        delivered,
        'text', // media_type по умолчанию
        null,   // file_path
        null,   // caption
        null,   // file_size
      ]);

      const row = result.rows[0];

      return {
        id: row.id,
        session_id: row.session_id,
        telegram_id: row.telegram_id,
        message_type: row.message_type,
        message_text: row.message_text,
        file_id: row.file_id || undefined,
        created_at: row.created_at.toISOString(),
        delivered: row.delivered,
        media_type: row.media_type || 'text',
        file_path: row.file_path || undefined,
        caption: row.caption || undefined,
        file_size: row.file_size || undefined,
      };
    } catch (error) {
      console.error('Error saving message:', error);
      throw new Error('Failed to save message');
    }
  }

  /**
   * Отмечает сообщение как доставленное
   * @param messageId - ID сообщения
   */
  async markMessageAsDelivered(messageId: number): Promise<void> {
    if (messageId < 1) {
      throw new Error('Message ID must be >= 1');
    }

    try {
      const query = `
        UPDATE support_messages
        SET delivered = true
        WHERE id = $1
      `;

      await this.pool.query(query, [messageId]);
    } catch (error) {
      console.error('Error marking message as delivered:', error);
      throw new Error('Failed to mark message as delivered');
    }
  }

  /**
   * Отмечает все непрочитанные сообщения от пользователя как доставленные
   * Используется при открытии диалога оператором для обнуления счётчика непрочитанных
   * @param sessionId - ID сессии поддержки
   * @returns Количество обновлённых сообщений
   * 
   * Validates: Requirements 3.1, 3.2
   * Bug_Condition: isBugCondition1 - отсутствие метода для массового обновления delivered
   * Expected_Behavior: метод обновляет все непрочитанные сообщения от пользователя
   * Preservation: существующий метод markMessageAsDelivered(messageId) продолжает работать
   */
  async markMessagesAsDelivered(sessionId: number): Promise<number> {
    if (sessionId < 1) {
      throw new Error('Session ID must be >= 1');
    }

    try {
      const query = `
        UPDATE support_messages
        SET delivered = true
        WHERE session_id = $1 
          AND message_type = 'from_user' 
          AND delivered = false
      `;

      const result = await this.pool.query(query, [sessionId]);
      const updatedCount = result.rowCount || 0;

      console.log(`[markMessagesAsDelivered] Marked ${updatedCount} messages as delivered for session ${sessionId}`);

      return updatedCount;
    } catch (error) {
      console.error(`[markMessagesAsDelivered] Error marking messages as delivered for session ${sessionId}:`, error);
      throw new Error('Failed to mark messages as delivered');
    }
  }

  /**
   * Устанавливает флаг help_needed для сессии
   * Используется при нажатии пользователем кнопки "Нужна помощь" или при сбросе флага оператором
   * @param sessionId - ID сессии поддержки
   * @param helpNeeded - Значение флага (true = нужна помощь, false = помощь не требуется)
   * @returns true если обновление успешно
   * 
   * Validates: Requirements 4.1, 4.2
   * Bug_Condition: isBugCondition2 - отсутствие метода для установки help_needed
   * Expected_Behavior: метод устанавливает флаг help_needed в БД
   */
  async setHelpNeeded(sessionId: number, helpNeeded: boolean): Promise<boolean> {
    if (sessionId < 1) {
      throw new Error('Session ID must be >= 1');
    }

    try {
      const query = `
        UPDATE support_sessions
        SET help_needed = $1
        WHERE id = $2
      `;

      const result = await this.pool.query(query, [helpNeeded, sessionId]);
      const success = result.rowCount !== null && result.rowCount > 0;

      if (success) {
        console.log(`[setHelpNeeded] Set help_needed=${helpNeeded} for session ${sessionId}`);
      } else {
        console.warn(`[setHelpNeeded] Session ${sessionId} not found`);
      }

      return success;
    } catch (error) {
      console.error(`[setHelpNeeded] Error setting help_needed for session ${sessionId}:`, error);
      throw new Error('Failed to set help_needed flag');
    }
  }

  /**
   * Получает информацию о конкретной сессии
   * @param sessionId - ID сессии
   * @returns Информация о сессии или null если не найдена
   */
  async getSession(sessionId: number): Promise<SupportSession | null> {
    if (sessionId < 1) {
      throw new Error('Session ID must be >= 1');
    }

    try {
      const query = `
        SELECT 
          id,
          telegram_id,
          status,
          session_type,
          created_at,
          closed_at
        FROM support_sessions
        WHERE id = $1
      `;

      const result = await this.pool.query(query, [sessionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        id: row.id,
        telegram_id: row.telegram_id,
        status: row.status,
        session_type: row.session_type,
        created_at: row.created_at.toISOString(),
        closed_at: row.closed_at ? row.closed_at.toISOString() : undefined,
      };
    } catch (error) {
      console.error('Error fetching session:', error);
      throw new Error('Failed to fetch session');
    }
  }

  /**
   * Проверяет подключение к БД
   * @returns true если подключение успешно
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT NOW()');
      return result.rows.length > 0;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Закрывает все соединения в пуле
   * Используется при graceful shutdown
   */
  async close(): Promise<void> {
    await this.pool.end();
    DatabaseClient.instance = null;
  }

  /**
   * Обновляет тип сессии (преобразование chat -> support)
   * @param sessionId - ID сессии
   * @param sessionType - Новый тип сессии ('chat' или 'support')
   * @returns true если успешно обновлено
   * 
   * Validates: Requirements 1.5, 4.3
   */
  async updateSessionType(
    sessionId: number,
    sessionType: 'chat' | 'support'
  ): Promise<boolean> {
    if (sessionId < 1) {
      throw new Error('Session ID must be >= 1');
    }

    if (!['chat', 'support'].includes(sessionType)) {
      throw new Error('session_type must be "chat" or "support"');
    }

    try {
      const query = `
        UPDATE support_sessions
        SET session_type = $1
        WHERE id = $2
      `;

      const result = await this.pool.query(query, [sessionType, sessionId]);

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error updating session type:', error);
      throw new Error('Failed to update session type');
    }
  }
}

/**
 * Функция для получения singleton instance
 * Используется вместо прямого экспорта для избежания проблем с тестами
 */
export function getDb(): DatabaseClient {
  return DatabaseClient.getInstance();
}
