/**
 * Типы для системы поддержки
 */

// Статус сессии поддержки
export type SupportSessionStatus = 'active' | 'closed';

// Тип сообщения
export type MessageType = 'from_user' | 'from_support';

// Сессия поддержки
export interface SupportSession {
  id: number;
  telegram_id: number;
  status: SupportSessionStatus;
  created_at: string; // ISO 8601 timestamp
  closed_at?: string; // ISO 8601 timestamp
  unread_count?: number; // Количество непрочитанных сообщений
  last_message?: string; // Текст последнего сообщения
  last_message_at?: string; // Время последнего сообщения
}

// Сообщение поддержки
export interface SupportMessage {
  id: number;
  session_id: number;
  telegram_id: number;
  message_type: MessageType;
  message_text: string;
  file_id?: string; // ID медиа-контента в Telegram
  created_at: string; // ISO 8601 timestamp
  delivered: boolean; // Доставлено ли сообщение пользователю
}

// Данные для создания нового сообщения
export interface CreateMessageData {
  session_id: number;
  telegram_id: number;
  message_type: MessageType;
  message_text: string;
  file_id?: string;
}

// Параметры для получения списка сессий
export interface GetSessionsParams {
  status?: SupportSessionStatus;
  page?: number;
  limit?: number;
}

// Ответ API со списком сессий
export interface GetSessionsResponse {
  sessions: SupportSession[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// Параметры для получения сообщений
export interface GetMessagesParams {
  session_id: number;
}

// Ответ API со списком сообщений
export interface GetMessagesResponse {
  messages: SupportMessage[];
  session: SupportSession;
}

// Данные для отправки ответа пользователю
export interface SendReplyData {
  session_id: number;
  telegram_id: number;
  message_text: string;
}

// Ответ API при отправке сообщения
export interface SendReplyResponse {
  success: boolean;
  message?: SupportMessage;
  error?: string;
}

// Real-time событие нового сообщения (для Supabase Realtime)
export interface NewMessageEvent {
  type: 'INSERT';
  table: 'support_messages';
  schema: 'public';
  record: SupportMessage;
  old_record: null;
}

// Real-time событие обновления сессии
export interface SessionUpdateEvent {
  type: 'UPDATE';
  table: 'support_sessions';
  schema: 'public';
  record: SupportSession;
  old_record: SupportSession;
}

// Фильтр для real-time подписки
export interface RealtimeFilter {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
}
