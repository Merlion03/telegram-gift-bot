/**
 * Типы для работы с Telegram WebApp и Bot API
 */

// Данные пользователя Telegram
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

// InitData от Telegram WebApp (криптографически подписанные данные)
export interface TelegramInitData {
  query_id?: string;
  user?: string; // JSON строка с TelegramUser
  receiver?: string;
  chat?: string;
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  can_send_after?: string;
  auth_date: string; // Unix timestamp
  hash: string; // HMAC-SHA256 подпись
}

// Распарсенные InitData
export interface ParsedInitData {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    photo_url?: string;
  };
  chat_type?: 'sender' | 'private' | 'group' | 'supergroup' | 'channel';
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
}

// WebApp Info для кнопки
export interface WebAppInfo {
  url: string;
}

// Inline кнопка с WebApp
export interface InlineKeyboardButton {
  text: string;
  web_app?: WebAppInfo;
  url?: string;
  callback_data?: string;
}

// Inline клавиатура
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// Ответ от Telegram Bot API при отправке сообщения
export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  date: number;
  text?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    width: number;
    height: number;
  }>;
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
}

// Параметры для отправки сообщения через Bot API
export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
}

// Ответ от Bot API
export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// Ошибка валидации InitData
export class InitDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitDataValidationError';
  }
}
