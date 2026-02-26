/**
 * Клиент для работы с Telegram Bot API
 * Отвечает за отправку сообщений пользователям от имени бота
 */

interface SendMessageParams {
  chat_id: number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  description?: string;
  error_code?: number;
}

export class TelegramBotApiError extends Error {
  constructor(
    message: string,
    public code?: number,
    public description?: string
  ) {
    super(message);
    this.name = 'TelegramBotApiError';
  }
}

export class TelegramBotApi {
  private botToken: string;
  private baseUrl: string;

  constructor(botToken: string) {
    if (!botToken) {
      throw new Error('Bot token is required');
    }
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Отправляет текстовое сообщение пользователю
   * 
   * @param chatId - Telegram ID пользователя
   * @param text - Текст сообщения
   * @param options - Дополнительные параметры отправки
   * @returns Promise с результатом отправки
   * @throws TelegramBotApiError при ошибке отправки
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: Omit<SendMessageParams, 'chat_id' | 'text'>
  ): Promise<TelegramApiResponse> {
    // Валидация входных данных
    if (!chatId || chatId <= 0) {
      throw new TelegramBotApiError('Invalid chat_id: must be a positive number');
    }

    if (!text || text.trim().length === 0) {
      throw new TelegramBotApiError('Invalid text: message text cannot be empty');
    }

    if (text.length > 4096) {
      throw new TelegramBotApiError('Invalid text: message text exceeds 4096 characters');
    }

    const params: SendMessageParams = {
      chat_id: chatId,
      text: text.trim(),
      ...options,
    };

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const data: TelegramApiResponse = await response.json();

      // Обработка ошибок от Telegram API
      if (!data.ok) {
        throw new TelegramBotApiError(
          `Failed to send message: ${data.description || 'Unknown error'}`,
          data.error_code,
          data.description
        );
      }

      return data;
    } catch (error) {
      // Если это уже наша ошибка, пробрасываем дальше
      if (error instanceof TelegramBotApiError) {
        throw error;
      }

      // Обработка сетевых ошибок
      if (error instanceof Error) {
        throw new TelegramBotApiError(
          `Network error while sending message: ${error.message}`
        );
      }

      throw new TelegramBotApiError('Unknown error while sending message');
    }
  }

  /**
   * Проверяет доступность Telegram Bot API
   * 
   * @returns Promise<boolean> - true если API доступен
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      const data: TelegramApiResponse = await response.json();
      return data.ok;
    } catch {
      return false;
    }
  }
}
