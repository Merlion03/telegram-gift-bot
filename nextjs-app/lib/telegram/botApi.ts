/**
 * Клиент для работы с Telegram Bot API
 * Отвечает за отправку сообщений пользователям от имени бота
 * Включает retry логику и улучшенную обработку сетевых ошибок
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

interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // в миллисекундах
  maxDelay: number;
  backoffMultiplier: number;
}

export class TelegramBotApiError extends Error {
  constructor(
    message: string,
    public code?: number,
    public description?: string,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'TelegramBotApiError';
  }
}

export class TelegramBotApi {
  private botToken: string;
  private baseUrl: string;
  private retryConfig: RetryConfig;

  constructor(
    botToken: string, 
    retryConfig: Partial<RetryConfig> = {}
  ) {
    if (!botToken) {
      throw new Error('Bot token is required');
    }
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    // Настройки retry по умолчанию - более консервативные
    this.retryConfig = {
      maxRetries: 1, // Только одна попытка retry
      baseDelay: 2000, // 2 секунды
      maxDelay: 5000, // 5 секунд максимум
      backoffMultiplier: 2,
      ...retryConfig,
    };
  }

  /**
   * Определяет, является ли ошибка повторяемой
   */
  private isRetryableError(error: any): boolean {
    // Только HTTP коды Telegram API повторяемы
    if (error instanceof TelegramBotApiError && error.code) {
      const retryableCodes = [429, 500, 502, 503, 504]; // Rate limit, server errors
      return retryableCodes.includes(error.code);
    }
    
    // Сетевые ошибки НЕ повторяем - они указывают на проблемы с Docker/сетью
    return false;
  }

  /**
   * Вычисляет задержку для retry с экспоненциальным backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Выполняет HTTP запрос с retry логикой
   */
  private async makeRequestWithRetry(
    url: string,
    options: RequestInit,
    attempt: number = 0
  ): Promise<Response> {
    try {
      // Добавляем таймаут для каждого запроса
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt >= this.retryConfig.maxRetries;
      const shouldRetry = this.isRetryableError(error) && !isLastAttempt;

      if (shouldRetry) {
        const delay = this.calculateRetryDelay(attempt);
        console.warn(
          `Telegram API request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), ` +
          `retrying in ${delay}ms:`,
          error instanceof Error ? error.message : error
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(url, options, attempt + 1);
      }

      throw error;
    }
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
      const response = await this.makeRequestWithRetry(
        `${this.baseUrl}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TelegramBot/1.0',
          },
          body: JSON.stringify(params),
        }
      );

      const data = await response.json() as TelegramApiResponse;

      // Обработка ошибок от Telegram API
      if (!data.ok) {
        const isRetryable = this.isRetryableError({ code: data.error_code });
        throw new TelegramBotApiError(
          `Failed to send message: ${data.description || 'Unknown error'}`,
          data.error_code,
          data.description,
          isRetryable
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
        const isRetryable = this.isRetryableError(error);
        throw new TelegramBotApiError(
          `Network error while sending message: ${error.message}`,
          undefined,
          undefined,
          isRetryable
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
      const response = await this.makeRequestWithRetry(
        `${this.baseUrl}/getMe`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'TelegramBot/1.0',
          },
        }
      );
      
      const data = await response.json() as TelegramApiResponse;
      return data.ok;
    } catch {
      return false;
    }
  }

  /**
   * Получает информацию о боте
   */
  async getBotInfo(): Promise<any> {
    try {
      const response = await this.makeRequestWithRetry(
        `${this.baseUrl}/getMe`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'TelegramBot/1.0',
          },
        }
      );
      
      const data = await response.json() as TelegramApiResponse;
      
      if (!data.ok) {
        throw new TelegramBotApiError(
          `Failed to get bot info: ${data.description || 'Unknown error'}`,
          data.error_code,
          data.description
        );
      }
      
      return data.result;
    } catch (error) {
      if (error instanceof TelegramBotApiError) {
        throw error;
      }
      
      throw new TelegramBotApiError(
        `Network error while getting bot info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
