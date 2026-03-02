import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fc } from '@fast-check/vitest';
import { TelegramBotApi, TelegramBotApiError } from '../botApi';

/**
 * Property-based тесты для TelegramBotApi
 * 
 * Проверяют корректность отправки сообщений через Telegram Bot API
 * и обработку различных сценариев ошибок
 */

describe('TelegramBotApi - Property-Based Tests', () => {
  const TEST_BOT_TOKEN = 'test_bot_token_123456789';
  let botApi: TelegramBotApi;

  beforeEach(() => {
    botApi = new TelegramBotApi(TEST_BOT_TOKEN);
    // Очистка всех моков перед каждым тестом
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 20 (часть): Полный цикл отправки сообщения от поддержки
   * 
   * Validates: Requirements 8.3, 8.4
   */
  describe('Property 20: Отправка сообщений через Telegram Bot API', () => {
    /**
     * Property: Для любого валидного chat_id и текста сообщения,
     * API должен отправить корректный запрос к Telegram Bot API
     * 
     * Validates: Requirements 8.3, 8.4
     */
    it('должен отправлять корректный запрос для любого валидного chat_id и текста', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999999 }), // chat_id
          fc.string({ minLength: 1, maxLength: 4096 })
            .map(s => s.trim())
            .filter(s => s.length > 0), // текст сообщения (не только пробелы)
          async (chatId, messageText) => {
            // Мокирование успешного ответа от Telegram API
            const mockFetch = vi.fn().mockResolvedValue({
              json: async () => ({
                ok: true,
                result: {
                  message_id: 123,
                  chat: { id: chatId },
                  text: messageText.trim(),
                },
              }),
            });

            global.fetch = mockFetch;

            // Отправка сообщения
            const result = await botApi.sendMessage(chatId, messageText);

            // Проверка, что fetch был вызван с корректными параметрами
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(
              `https://api.telegram.org/bot${TEST_BOT_TOKEN}/sendMessage`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: messageText.trim(),
                }),
              }
            );

            // Проверка успешного результата
            expect(result.ok).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Для любого валидного сообщения с дополнительными опциями,
     * API должен включить эти опции в запрос
     * 
     * Validates: Requirements 8.3
     */
    it('должен корректно передавать дополнительные опции', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999999 }), // chat_id
          fc.string({ minLength: 1, maxLength: 100 })
            .map(s => s.trim())
            .filter(s => s.length > 0), // текст (не только пробелы)
          fc.constantFrom('HTML', 'Markdown', 'MarkdownV2'), // parse_mode
          fc.boolean(), // disable_web_page_preview
          async (chatId, text, parseMode, disablePreview) => {
            const mockFetch = vi.fn().mockResolvedValue({
              json: async () => ({ ok: true, result: {} }),
            });

            global.fetch = mockFetch;

            await botApi.sendMessage(chatId, text, {
              parse_mode: parseMode,
              disable_web_page_preview: disablePreview,
            });

            // Проверка, что опции были переданы
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);

            expect(body.parse_mode).toBe(parseMode);
            expect(body.disable_web_page_preview).toBe(disablePreview);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Для любого невалидного chat_id (<=0),
     * API должен выбросить ошибку валидации
     * 
     * Validates: Requirements 8.4
     */
    it('должен отклонять невалидный chat_id', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -999999999, max: 0 }), // невалидный chat_id
          fc.string({ minLength: 1, maxLength: 100 }),
          async (invalidChatId, text) => {
            await expect(
              botApi.sendMessage(invalidChatId, text)
            ).rejects.toThrow(TelegramBotApiError);

            await expect(
              botApi.sendMessage(invalidChatId, text)
            ).rejects.toThrow('Invalid chat_id');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Для любого пустого или слишком длинного текста,
     * API должен выбросить ошибку валидации
     * 
     * Validates: Requirements 8.4
     */
    it('должен отклонять невалидный текст сообщения', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999999 }),
          fc.oneof(
            fc.constant(''), // пустая строка
            fc.constant('   '), // только пробелы
            fc.string({ minLength: 4097, maxLength: 5000 }) // слишком длинный текст
          ),
          async (chatId, invalidText) => {
            await expect(
              botApi.sendMessage(chatId, invalidText)
            ).rejects.toThrow(TelegramBotApiError);

            await expect(
              botApi.sendMessage(chatId, invalidText)
            ).rejects.toThrow(/Invalid text/);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: При ошибке от Telegram API,
     * должна быть выброшена TelegramBotApiError с деталями ошибки
     * 
     * Validates: Requirements 8.4, 8.6
     */
    it('должен обрабатывать ошибки от Telegram API', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999999 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.integer({ min: 400, max: 500 }), // error_code
          fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 0), // описание ошибки (не только пробелы)
          async (chatId, text, errorCode, errorDescription) => {
            // Мокирование ошибки от Telegram API
            const mockFetch = vi.fn().mockResolvedValue({
              json: async () => ({
                ok: false,
                error_code: errorCode,
                description: errorDescription,
              }),
            });

            global.fetch = mockFetch;

            // Проверка, что выбрасывается ошибка с правильными деталями
            await expect(
              botApi.sendMessage(chatId, text)
            ).rejects.toThrow(TelegramBotApiError);

            try {
              await botApi.sendMessage(chatId, text);
            } catch (error) {
              expect(error).toBeInstanceOf(TelegramBotApiError);
              if (error instanceof TelegramBotApiError) {
                expect(error.code).toBe(errorCode);
                expect(error.description).toBe(errorDescription);
                expect(error.message).toContain(errorDescription);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: При сетевой ошибке,
     * должна быть выброшена TelegramBotApiError с описанием проблемы
     * 
     * Validates: Requirements 8.4, 8.6
     */
    it('должен обрабатывать сетевые ошибки', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999999 }),
          fc.string({ minLength: 1, maxLength: 100 })
            .map(s => s.trim())
            .filter(s => s.length > 0), // валидный текст
          fc.string({ minLength: 10, maxLength: 50 }), // сообщение об ошибке
          async (chatId, text, networkErrorMessage) => {
            // Мокирование сетевой ошибки
            const mockFetch = vi.fn().mockRejectedValue(
              new Error(networkErrorMessage)
            );

            global.fetch = mockFetch;

            // Проверка, что выбрасывается ошибка
            await expect(
              botApi.sendMessage(chatId, text)
            ).rejects.toThrow(TelegramBotApiError);

            try {
              await botApi.sendMessage(chatId, text);
            } catch (error) {
              expect(error).toBeInstanceOf(TelegramBotApiError);
              if (error instanceof TelegramBotApiError) {
                expect(error.message).toContain('Network error');
                expect(error.message).toContain(networkErrorMessage);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Текст сообщения должен быть обрезан (trim) перед отправкой
     * 
     * Validates: Requirements 8.3
     */
    it('должен обрезать пробелы в начале и конце текста', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999999 }),
          fc.string({ minLength: 1, maxLength: 100 })
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => s.trim()), // текст без пробелов в начале/конце
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^\s+$/.test(s)), // пробелы в начале (минимум 1)
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^\s+$/.test(s)), // пробелы в конце (минимум 1)
          async (chatId, text, leadingSpaces, trailingSpaces) => {
            const textWithSpaces = leadingSpaces + text + trailingSpaces;

            const mockFetch = vi.fn().mockResolvedValue({
              json: async () => ({ ok: true, result: {} }),
            });

            global.fetch = mockFetch;

            await botApi.sendMessage(chatId, textWithSpaces);

            // Проверка, что текст был обрезан
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);

            // Отправленный текст должен быть равен исходному тексту без пробелов
            expect(body.text).toBe(text);
            // Проверяем, что в обрезанном тексте нет начальных/конечных пробелов
            expect(body.text).toBe(body.text.trim());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Проверка подключения к API', () => {
    /**
     * Property: checkConnection возвращает true при успешном ответе
     */
    it('должен возвращать true при доступности API', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const mockFetch = vi.fn().mockResolvedValue({
              json: async () => ({
                ok: true,
                result: {
                  id: 123456789,
                  is_bot: true,
                  first_name: 'Test Bot',
                },
              }),
            });

            global.fetch = mockFetch;

            const isConnected = await botApi.checkConnection();

            expect(isConnected).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
              `https://api.telegram.org/bot${TEST_BOT_TOKEN}/getMe`
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: checkConnection возвращает false при ошибке
     */
    it('должен возвращать false при недоступности API', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(new Error('Network error')),
            fc.constant({ json: async () => ({ ok: false }) })
          ),
          async (errorOrResponse) => {
            const mockFetch = vi.fn().mockImplementation(() => {
              if (errorOrResponse instanceof Error) {
                return Promise.reject(errorOrResponse);
              }
              return Promise.resolve(errorOrResponse);
            });

            global.fetch = mockFetch;

            const isConnected = await botApi.checkConnection();

            expect(isConnected).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Инициализация клиента', () => {
    /**
     * Property: Конструктор должен выбрасывать ошибку при отсутствии токена
     */
    it('должен выбрасывать ошибку при пустом токене', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant(null as any),
            fc.constant(undefined as any)
          ),
          (invalidToken) => {
            expect(() => new TelegramBotApi(invalidToken)).toThrow('Bot token is required');
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Конструктор должен корректно формировать baseUrl для любого валидного токена
     */
    it('должен корректно формировать baseUrl', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 100 }),
          (token) => {
            const api = new TelegramBotApi(token);
            
            // Проверяем через приватное свойство (для тестирования)
            expect((api as any).baseUrl).toBe(`https://api.telegram.org/bot${token}`);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
