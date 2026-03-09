/**
 * Unit-тесты для API routes сообщений поддержки
 * Тестирование edge cases и обработки ошибок
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/database/client';
import { TelegramBotApi, TelegramBotApiError } from '@/lib/telegram/botApi';
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

describe('API Routes: /api/support/messages - Edge Cases', () => {
  let mockDb: any;

  beforeEach(() => {
    // Очищаем моки перед каждым тестом
    vi.clearAllMocks();
    
    // Настройка моков
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: 'admin@example.com' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    mockDb = {
      getSession: vi.fn(),
      getMessages: vi.fn(),
      saveMessage: vi.fn(),
      markMessageAsDelivered: vi.fn(),
    };

    vi.mocked(getDb).mockReturnValue(mockDb);

    process.env.BOT_TOKEN = 'test_bot_token_123';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/support/messages', () => {
    it('должен вернуть 400 если session_id отсутствует', async () => {
      /**
       * Edge case: отсутствующий обязательный параметр
       * Validates: Requirements 7.5
       */
      const request = new NextRequest('http://localhost/api/support/messages');

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Missing session_id');
      expect(mockDb.getMessages).not.toHaveBeenCalled();
    });

    it('должен вернуть 400 если session_id невалиден', async () => {
      /**
       * Edge case: невалидный формат параметра
       */
      const request = new NextRequest(
        'http://localhost/api/support/messages?session_id=invalid'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid session_id');
      expect(mockDb.getMessages).not.toHaveBeenCalled();
    });

    it('должен вернуть 400 если session_id отрицательный', async () => {
      /**
       * Edge case: отрицательное значение ID
       */
      const request = new NextRequest(
        'http://localhost/api/support/messages?session_id=-1'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid session_id');
    });

    it('должен вернуть 404 если сессия не найдена', async () => {
      /**
       * Edge case: несуществующая сессия
       */
      mockDb.getSession.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/support/messages?session_id=999999'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.error).toBe('Session not found');
      expect(mockDb.getMessages).not.toHaveBeenCalled();
    });

    it('должен вернуть пустой массив сообщений для новой сессии', async () => {
      /**
       * Edge case: сессия без сообщений
       */
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 12345,
        status: 'active',
        session_type: 'support',
        created_at: new Date().toISOString(),
      };

      mockDb.getSession.mockResolvedValue(mockSession);
      mockDb.getMessages.mockResolvedValue([]);

      const request = new NextRequest(
        'http://localhost/api/support/messages?session_id=1'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.messages).toEqual([]);
      expect(result.session).toEqual(mockSession);
    });

    it('должен вернуть 401 для неавторизованного запроса', async () => {
      /**
       * Edge case: отсутствие аутентификации
       * Validates: Requirements 11.1
       */
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/support/messages?session_id=1'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
    });

    it('должен вернуть 500 при ошибке БД', async () => {
      /**
       * Edge case: ошибка базы данных
       * Validates: Requirements 16.3
       */
      mockDb.getSession.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest(
        'http://localhost/api/support/messages?session_id=1'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe('Internal server error');
    });
  });

  describe('POST /api/support/messages', () => {
    it('должен вернуть 400 при отсутствии обязательных полей', async () => {
      /**
       * Edge case: неполные данные
       * Validates: Requirements 8.1
       */
      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          // telegram_id и message_text отсутствуют
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Validation error');
      expect(result.details).toBeDefined();
    });

    it('должен вернуть 400 для пустого текста сообщения', async () => {
      /**
       * Edge case: пустое сообщение
       */
      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: '',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Validation error');
    });

    it('должен вернуть 400 для слишком длинного сообщения', async () => {
      /**
       * Edge case: превышение лимита длины сообщения
       * Telegram лимит: 4096 символов
       */
      const longMessage = 'a'.repeat(5000);

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: longMessage,
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Validation error');
    });

    it('должен вернуть 400 для отрицательных ID', async () => {
      /**
       * Edge case: невалидные ID
       */
      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: -1,
          telegram_id: -12345,
          message_text: 'Test message',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Validation error');
    });

    it('должен вернуть 404 если сессия не найдена', async () => {
      /**
       * Edge case: несуществующая сессия
       */
      mockDb.getSession.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 999999,
          telegram_id: 12345,
          message_text: 'Test message',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.error).toBe('Session not found');
      expect(mockDb.saveMessage).not.toHaveBeenCalled();
    });

    it('должен вернуть 400 если сессия уже закрыта', async () => {
      /**
       * Edge case: попытка отправить сообщение в закрытую сессию
       */
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 12345,
        status: 'closed',
        session_type: 'support',
        created_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      };

      mockDb.getSession.mockResolvedValue(mockSession);

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: 'Test message',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Session closed');
      expect(mockDb.saveMessage).not.toHaveBeenCalled();
    });

    it('должен вернуть 500 при ошибке отправки через Telegram API', async () => {
      /**
       * Edge case: ошибка Telegram API
       * Validates: Requirements 8.6
       */
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 12345,
        status: 'active',
        session_type: 'support',
        created_at: new Date().toISOString(),
      };

      const mockSavedMessage: SupportMessage = {
        id: 1,
        session_id: 1,
        telegram_id: 12345,
        message_type: 'from_support',
        message_text: 'Test message',
        created_at: new Date().toISOString(),
        delivered: false,
      };

      mockDb.getSession.mockResolvedValue(mockSession);
      mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
      
      // Telegram API возвращает ошибку
      mockSendMessageGlobal.mockRejectedValue(
        new TelegramBotApiError('Chat not found', 400, 'Bad Request: chat not found')
      );

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: 'Test message',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe('Telegram API error');
      
      // Сообщение должно быть сохранено, но не доставлено
      expect(mockDb.saveMessage).toHaveBeenCalled();
      expect(mockDb.markMessageAsDelivered).not.toHaveBeenCalled();
    });

    it('должен вернуть 500 если BOT_TOKEN не установлен', async () => {
      /**
       * Edge case: отсутствие конфигурации
       * Validates: Requirements 13.1
       */
      delete process.env.BOT_TOKEN;

      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 12345,
        status: 'active',
        session_type: 'support',
        created_at: new Date().toISOString(),
      };

      const mockSavedMessage: SupportMessage = {
        id: 1,
        session_id: 1,
        telegram_id: 12345,
        message_type: 'from_support',
        message_text: 'Test message',
        created_at: new Date().toISOString(),
        delivered: false,
      };

      mockDb.getSession.mockResolvedValue(mockSession);
      mockDb.saveMessage.mockResolvedValue(mockSavedMessage);

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: 'Test message',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe('Internal server error');
    });

    it('должен вернуть 500 при ошибке сохранения в БД', async () => {
      /**
       * Edge case: ошибка базы данных при сохранении
       * Validates: Requirements 16.3
       */
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 12345,
        status: 'active',
        session_type: 'support',
        created_at: new Date().toISOString(),
      };

      mockDb.getSession.mockResolvedValue(mockSession);
      mockDb.saveMessage.mockRejectedValue(new Error('Database write failed'));

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: 'Test message',
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe('Internal server error');
      expect(mockSendMessageGlobal).not.toHaveBeenCalled();
    });

    it('должен корректно обрабатывать специальные символы в тексте', async () => {
      /**
       * Edge case: специальные символы и эмодзи
       */
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 12345,
        status: 'active',
        session_type: 'support',
        created_at: new Date().toISOString(),
      };

      const specialMessage = 'Привет! 👋 Это тест <script>alert("xss")</script> & "quotes"';
      
      const mockSavedMessage: SupportMessage = {
        id: 1,
        session_id: 1,
        telegram_id: 12345,
        message_type: 'from_support',
        message_text: specialMessage,
        created_at: new Date().toISOString(),
        delivered: false,
      };

      mockDb.getSession.mockResolvedValue(mockSession);
      mockDb.saveMessage.mockResolvedValue(mockSavedMessage);
      mockSendMessageGlobal.mockResolvedValue({ ok: true });
      mockDb.markMessageAsDelivered.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 1,
          telegram_id: 12345,
          message_text: specialMessage,
        }),
      });

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      
      // Проверяем, что текст передан без изменений
      expect(mockSendMessageGlobal).toHaveBeenCalledWith(12345, specialMessage);
    });
  });
});

