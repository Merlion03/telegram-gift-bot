/**
 * Property-based тесты для API routes сообщений поддержки
 * Feature: telegram-bot-webapp-system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/database/client';
import { TelegramBotApi } from '@/lib/telegram/botApi';
import type { SupportMessage, SupportSession } from '@/types/support';

// Мокируем зависимости
vi.mock('next-auth');
vi.mock('@/lib/database/client');

// Создаём мок-функцию для sendMessage ДО мокирования модуля
const mockSendMessageGlobal = vi.fn();
const mockCheckConnectionGlobal = vi.fn();

vi.mock('@/lib/telegram/botApi', () => ({
  TelegramBotApi: vi.fn(function(this: any, botToken: string) {
    this.sendMessage = mockSendMessageGlobal;
    this.checkConnection = mockCheckConnectionGlobal;
  }),
  TelegramBotApiError: class TelegramBotApiError extends Error {
    constructor(message: string, public code?: number, public description?: string) {
      super(message);
      this.name = 'TelegramBotApiError';
    }
  },
}));

// Вспомогательная функция для генерации валидного текста сообщения
// API route использует z.string().trim().min(2), поэтому генерируем строки,
// которые после trim будут >= 2 символов
// Генерируем строку из буквенно-цифровых символов (минимум 2 символа)
const validMessageTextArbitrary = () =>
  fc.string({ minLength: 2, maxLength: 500 })
    .map(s => s.replace(/[^a-zA-Z0-9 ]/g, 'a')) // Заменяем все спецсимволы на 'a'
    .filter(s => s.trim().length >= 2); // Гарантируем, что после trim >= 2 символов

describe('Property 20: Полный цикл отправки сообщения от поддержки', () => {
  let mockDb: any;
  let defaultSession: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Полная очистка всех моков (включая счётчики вызовов и implementations)
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Мокируем console.error для подавления логирования ошибок в тестах
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Сохраняем дефолтную сессию для переиспользования
    defaultSession = {
      user: { email: 'admin@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    };
    
    // Настройка моков для каждого теста - используем mockResolvedValue, а не mockImplementation
    vi.mocked(getServerSession).mockResolvedValue(defaultSession as any);

    // Создаём новый mockDb для каждого теста
    mockDb = {
      getSession: vi.fn(),
      getMessages: vi.fn(),
      saveMessage: vi.fn(),
      markMessageAsDelivered: vi.fn(),
    };

    vi.mocked(getDb).mockReturnValue(mockDb);

    // Устанавливаем BOT_TOKEN для тестов
    process.env.BOT_TOKEN = 'test_bot_token_123';
    
    // Очищаем глобальные моки для Telegram API
    mockSendMessageGlobal.mockClear();
    mockSendMessageGlobal.mockResolvedValue({ ok: true });
    mockCheckConnectionGlobal.mockClear();
  });

  afterEach(() => {
    // Полная очистка после каждого теста
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Восстанавливаем console.error
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  it('Property 20.1: Сообщение должно быть сохранено в БД с типом "from_support"', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 20
     * Validates: Requirements 8.1, 8.2
     * 
     * Для любого сообщения от поддержки, оно должно быть сохранено в БД
     * с корректным типом "from_support"
     */
    fc.assert(
      fc.asyncProperty(
        fc.record({
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
          message_text: validMessageTextArbitrary(),
        }),
        async (data) => {
          // Очищаем моки перед каждой итерацией property-based теста
          vi.clearAllMocks();
          
          // Arrange: настраиваем моки
          const mockSession: SupportSession = {
            id: data.session_id,
            telegram_id: data.telegram_id,
            status: 'active',
            created_at: new Date().toISOString(),
          };

          const mockSavedMessage: SupportMessage = {
            id: Math.floor(Math.random() * 10000),
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text,
            created_at: new Date().toISOString(),
            delivered: false,
          };

          mockDb.getSession.mockResolvedValue(mockSession);
          mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
          mockSendMessageGlobal.mockResolvedValue({ ok: true });
          mockDb.markMessageAsDelivered.mockResolvedValue(undefined);

          // Act: отправляем запрос
          const request = new NextRequest('http://localhost/api/support/messages', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          const response = await POST(request);
          const result = await response.json();

          // Assert: проверяем, что ответ успешный
          expect(response.status).toBe(200);
          
          // Assert: проверяем, что saveMessage был вызван с правильными параметрами
          // ВАЖНО: API route использует .trim() в Zod схеме, поэтому ожидаем обрезанную строку
          expect(mockDb.saveMessage).toHaveBeenCalledWith({
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text.trim(),
          });

          // Проверяем, что сообщение сохранено с типом "from_support"
          const saveCall = mockDb.saveMessage.mock.calls[0][0];
          expect(saveCall.message_type).toBe('from_support');
          expect(saveCall.message_text).toBe(data.message_text.trim());
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 20.2: Сообщение должно быть отправлено через Telegram Bot API', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 20
     * Validates: Requirements 8.3, 8.4
     * 
     * Для любого сохранённого сообщения, оно должно быть отправлено
     * пользователю через Telegram Bot API с корректным telegram_id
     */
    fc.assert(
      fc.asyncProperty(
        fc.record({
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
          message_text: validMessageTextArbitrary(),
        }),
        async (data) => {
          // Очищаем моки перед каждой итерацией property-based теста
          vi.clearAllMocks();
          
          // Arrange
          const mockSession: SupportSession = {
            id: data.session_id,
            telegram_id: data.telegram_id,
            status: 'active',
            created_at: new Date().toISOString(),
          };

          const mockSavedMessage: SupportMessage = {
            id: Math.floor(Math.random() * 10000),
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text,
            created_at: new Date().toISOString(),
            delivered: false,
          };

          mockDb.getSession.mockResolvedValue(mockSession);
          mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
          mockSendMessageGlobal.mockResolvedValue({ ok: true });
          mockDb.markMessageAsDelivered.mockResolvedValue(undefined);

          // Act
          const request = new NextRequest('http://localhost/api/support/messages', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          await POST(request);

          // Assert: проверяем, что sendMessage был вызван с правильными параметрами
          // ВАЖНО: API route использует .trim() в Zod схеме
          expect(mockSendMessageGlobal).toHaveBeenCalledWith(
            data.telegram_id,
            data.message_text.trim()
          );

          // Проверяем, что telegram_id совпадает
          const sendCall = mockSendMessageGlobal.mock.calls[0];
          expect(sendCall[0]).toBe(data.telegram_id);
          expect(sendCall[1]).toBe(data.message_text.trim());
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 20.3: После успешной отправки сообщение должно быть отмечено как доставленное', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 20
     * Validates: Requirements 8.5
     * 
     * Для любого успешно отправленного сообщения, оно должно быть
     * отмечено в БД как доставленное (delivered = true)
     */
    fc.assert(
      fc.asyncProperty(
        fc.record({
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
          message_text: validMessageTextArbitrary(),
        }),
        async (data) => {
          // Очищаем моки перед каждой итерацией property-based теста
          vi.clearAllMocks();
          
          // Arrange
          const mockSession: SupportSession = {
            id: data.session_id,
            telegram_id: data.telegram_id,
            status: 'active',
            created_at: new Date().toISOString(),
          };

          const messageId = Math.floor(Math.random() * 10000);
          const mockSavedMessage: SupportMessage = {
            id: messageId,
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text,
            created_at: new Date().toISOString(),
            delivered: false,
          };

          mockDb.getSession.mockResolvedValue(mockSession);
          mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
          mockSendMessageGlobal.mockResolvedValue({ ok: true });
          mockDb.markMessageAsDelivered.mockResolvedValue(undefined);

          // Act
          const request = new NextRequest('http://localhost/api/support/messages', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          const response = await POST(request);
          const result = await response.json();

          // Assert: проверяем, что markMessageAsDelivered был вызван
          expect(mockDb.markMessageAsDelivered).toHaveBeenCalledWith(messageId);

          // Проверяем, что в ответе delivered = true
          expect(result.success).toBe(true);
          expect(result.message.delivered).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 20.4: Полный цикл - сохранение, отправка, отметка о доставке', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 20
     * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
     * 
     * Для любого сообщения от поддержки, должен выполниться полный цикл:
     * 1. Сохранение в БД с типом "from_support"
     * 2. Отправка через Telegram Bot API
     * 3. Отметка как доставленное
     * 4. Возврат успешного ответа с delivered = true
     */
    fc.assert(
      fc.asyncProperty(
        fc.record({
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
          message_text: validMessageTextArbitrary(),
        }),
        async (data) => {
          // Очищаем моки перед каждой итерацией property-based теста
          vi.clearAllMocks();
          
          // Arrange
          const mockSession: SupportSession = {
            id: data.session_id,
            telegram_id: data.telegram_id,
            status: 'active',
            created_at: new Date().toISOString(),
          };

          const messageId = Math.floor(Math.random() * 10000);
          const mockSavedMessage: SupportMessage = {
            id: messageId,
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text,
            created_at: new Date().toISOString(),
            delivered: false,
          };

          mockDb.getSession.mockResolvedValue(mockSession);
          mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
          mockSendMessageGlobal.mockResolvedValue({ ok: true });
          mockDb.markMessageAsDelivered.mockResolvedValue(undefined);

          // Act
          const request = new NextRequest('http://localhost/api/support/messages', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          const response = await POST(request);
          const result = await response.json();

          // Assert: проверяем полный цикл
          
          // 1. Сохранение в БД (с обрезанным текстом)
          expect(mockDb.saveMessage).toHaveBeenCalledWith({
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text.trim(),
          });

          // 2. Отправка через Telegram API (с обрезанным текстом)
          expect(mockSendMessageGlobal).toHaveBeenCalledWith(
            data.telegram_id,
            data.message_text.trim()
          );

          // 3. Отметка как доставленное
          expect(mockDb.markMessageAsDelivered).toHaveBeenCalledWith(messageId);

          // 4. Успешный ответ
          expect(response.status).toBe(200);
          expect(result.success).toBe(true);
          expect(result.message).toBeDefined();
          expect(result.message.delivered).toBe(true);
          expect(result.message.message_type).toBe('from_support');

          // Проверяем порядок вызовов
          const callOrder = [
            mockDb.getSession.mock.invocationCallOrder[0],
            mockDb.saveMessage.mock.invocationCallOrder[0],
            mockSendMessageGlobal.mock.invocationCallOrder[0],
            mockDb.markMessageAsDelivered.mock.invocationCallOrder[0],
          ];

          // Убеждаемся, что вызовы были в правильном порядке
          expect(callOrder[0]).toBeLessThan(callOrder[1]); // getSession перед saveMessage
          expect(callOrder[1]).toBeLessThan(callOrder[2]); // saveMessage перед sendMessage
          expect(callOrder[2]).toBeLessThan(callOrder[3]); // sendMessage перед markAsDelivered
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 20.5: При ошибке Telegram API сообщение остаётся в БД как недоставленное', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 20
     * Validates: Requirements 8.6
     * 
     * Если отправка через Telegram API не удалась, сообщение должно
     * остаться в БД с delivered = false для последующей повторной отправки
     */
    fc.assert(
      fc.asyncProperty(
        fc.record({
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
          message_text: validMessageTextArbitrary(),
        }),
        async (data) => {
          // Очищаем моки перед каждой итерацией property-based теста
          vi.clearAllMocks();
          consoleErrorSpy.mockClear();
          
          // Arrange: настраиваем мок для ошибки Telegram API
          const mockSession: SupportSession = {
            id: data.session_id,
            telegram_id: data.telegram_id,
            status: 'active',
            created_at: new Date().toISOString(),
          };

          const messageId = Math.floor(Math.random() * 10000);
          const mockSavedMessage: SupportMessage = {
            id: messageId,
            session_id: data.session_id,
            telegram_id: data.telegram_id,
            message_type: 'from_support',
            message_text: data.message_text,
            created_at: new Date().toISOString(),
            delivered: false,
          };

          mockDb.getSession.mockResolvedValue(mockSession);
          mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
          
          // Telegram API возвращает ошибку
          mockSendMessageGlobal.mockRejectedValue(
            new Error('Telegram API error: chat not found')
          );

          // Act
          const request = new NextRequest('http://localhost/api/support/messages', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          const response = await POST(request);
          const result = await response.json();

          // Assert: проверяем, что сообщение сохранено, но не отмечено как доставленное
          expect(mockDb.saveMessage).toHaveBeenCalled();
          expect(mockSendMessageGlobal).toHaveBeenCalled();
          
          // markMessageAsDelivered НЕ должен быть вызван
          expect(mockDb.markMessageAsDelivered).not.toHaveBeenCalled();

          // Ответ должен содержать ошибку
          expect(response.status).toBe(500);
          expect(result.error).toBe('Telegram API error');
          
          // Сохранённое сообщение должно быть в ответе с delivered = false
          expect(result.saved_message).toBeDefined();
          expect(result.saved_message.delivered).toBe(false);
          
          // Проверяем, что ошибка была залогирована
          expect(consoleErrorSpy).toHaveBeenCalled();
        }
      ),
      { numRuns: 10 } // Меньше итераций для тестов с ошибками
    );
  });

  it('Property 20.6: Требуется аутентификация для отправки сообщений', () => {
    /**
     * Feature: telegram-bot-webapp-system, Property 20
     * Validates: Requirements 11.1
     * 
     * Для любого запроса без активной сессии, API должен вернуть 401
     */
    fc.assert(
      fc.asyncProperty(
        fc.record({
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 1, max: 999999999 }),
          message_text: validMessageTextArbitrary(),
        }),
        async (data) => {
          // Очищаем моки перед каждой итерацией property-based теста
          vi.clearAllMocks();
          
          // Arrange: убираем аутентификацию для КАЖДОЙ итерации
          // ВАЖНО: используем mockResolvedValue (не Once!), чтобы работало для всех вызовов в итерации
          vi.mocked(getServerSession).mockResolvedValue(null);

          // Act
          const request = new NextRequest('http://localhost/api/support/messages', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          const response = await POST(request);
          const result = await response.json();

          // Assert
          expect(response.status).toBe(401);
          expect(result.error).toBe('Unauthorized');

          // Не должно быть попыток сохранения или отправки
          expect(mockDb.saveMessage).not.toHaveBeenCalled();
          expect(mockSendMessageGlobal).not.toHaveBeenCalled();
          
          // КРИТИЧЕСКИ ВАЖНО: восстанавливаем аутентификацию для следующей итерации
          vi.mocked(getServerSession).mockResolvedValue(defaultSession as any);
        }
      ),
      { numRuns: 10 }
    );
  });
});



