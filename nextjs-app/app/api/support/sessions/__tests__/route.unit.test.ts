/**
 * Unit-тесты для API route GET /api/support/sessions
 * Feature: admin-chat-persistence
 * 
 * Validates: Requirements 3.1, 7.1, 8.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/database/client';
import type { SupportSession, PaginatedSessions } from '@/lib/database/client';

// Мокируем зависимости
vi.mock('next-auth');
vi.mock('@/lib/database/client');

describe('API Route: GET /api/support/sessions - Unit Tests', () => {
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
      getSessions: vi.fn(),
    };

    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Аутентификация', () => {
    it('должен вернуть 401 для неавторизованного запроса', async () => {
      /**
       * Edge case: отсутствие аутентификации
       * Validates: Requirements 8.1
       */
      vi.mocked(getServerSession).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/support/sessions');

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
      expect(result.message).toBe('Требуется авторизация');
      expect(mockDb.getSessions).not.toHaveBeenCalled();
    });

    it('должен разрешить доступ авторизованному пользователю', async () => {
      /**
       * Happy path: авторизованный запрос
       */
      const mockResult: PaginatedSessions = {
        sessions: [],
        total: 0,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest('http://localhost/api/support/sessions');

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalled();
    });
  });

  describe('Пагинация', () => {
    it('должен использовать default limit 50', async () => {
      /**
       * Default behavior: пагинация по умолчанию
       * Validates: Requirements 7.1
       */
      const mockResult: PaginatedSessions = {
        sessions: [],
        total: 0,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest('http://localhost/api/support/sessions');

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: undefined,
        session_type: undefined,
        page: 1,
        limit: 50,
      });
      expect(result.limit).toBe(50);
    });

    it('должен принимать кастомный limit', async () => {
      /**
       * Custom pagination: пользовательский лимит
       */
      const mockResult: PaginatedSessions = {
        sessions: [],
        total: 0,
        page: 1,
        limit: 20,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?limit=20'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: undefined,
        session_type: undefined,
        page: 1,
        limit: 20,
      });
      expect(result.limit).toBe(20);
    });

    it('должен вернуть 400 для limit < 1', async () => {
      /**
       * Edge case: невалидный лимит (слишком маленький)
       */
      const request = new NextRequest(
        'http://localhost/api/support/sessions?limit=0'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid limit');
      expect(result.message).toBe('Лимит должен быть от 1 до 100');
      expect(mockDb.getSessions).not.toHaveBeenCalled();
    });

    it('должен вернуть 400 для limit > 100', async () => {
      /**
       * Edge case: невалидный лимит (слишком большой)
       */
      const request = new NextRequest(
        'http://localhost/api/support/sessions?limit=101'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid limit');
      expect(result.message).toBe('Лимит должен быть от 1 до 100');
      expect(mockDb.getSessions).not.toHaveBeenCalled();
    });

    it('должен принимать номер страницы', async () => {
      /**
       * Pagination: переход на другую страницу
       */
      const mockResult: PaginatedSessions = {
        sessions: [],
        total: 100,
        page: 3,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?page=3'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: undefined,
        session_type: undefined,
        page: 3,
        limit: 50,
      });
      expect(result.page).toBe(3);
    });

    it('должен вернуть 400 для page < 1', async () => {
      /**
       * Edge case: невалидный номер страницы
       */
      const request = new NextRequest(
        'http://localhost/api/support/sessions?page=0'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid page');
      expect(result.message).toBe('Номер страницы должен быть >= 1');
      expect(mockDb.getSessions).not.toHaveBeenCalled();
    });
  });

  describe('Фильтрация по статусу', () => {
    it('должен фильтровать по status=active', async () => {
      /**
       * Filtering: фильтрация активных сессий
       * Validates: Requirements 5.3
       */
      const mockSessions: SupportSession[] = [
        {
          id: 1,
          telegram_id: 12345,
          status: 'active',
          session_type: 'chat',
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          telegram_id: 67890,
          status: 'active',
          session_type: 'support',
          created_at: new Date().toISOString(),
        },
      ];

      const mockResult: PaginatedSessions = {
        sessions: mockSessions,
        total: 2,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?status=active'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: 'active',
        session_type: undefined,
        page: 1,
        limit: 50,
      });
      
      // Проверяем, что все сессии имеют статус active
      result.sessions.forEach((session: SupportSession) => {
        expect(session.status).toBe('active');
      });
    });

    it('должен фильтровать по status=closed', async () => {
      /**
       * Filtering: фильтрация закрытых сессий
       */
      const mockSessions: SupportSession[] = [
        {
          id: 3,
          telegram_id: 11111,
          status: 'closed',
          session_type: 'chat',
          created_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        },
      ];

      const mockResult: PaginatedSessions = {
        sessions: mockSessions,
        total: 1,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?status=closed'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: 'closed',
        session_type: undefined,
        page: 1,
        limit: 50,
      });
      
      result.sessions.forEach((session: SupportSession) => {
        expect(session.status).toBe('closed');
      });
    });

    it('должен вернуть 400 для невалидного status', async () => {
      /**
       * Edge case: невалидное значение статуса
       */
      const request = new NextRequest(
        'http://localhost/api/support/sessions?status=invalid'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid status');
      expect(result.message).toBe('Статус должен быть "active" или "closed"');
      expect(mockDb.getSessions).not.toHaveBeenCalled();
    });
  });

  describe('Фильтрация по типу сессии', () => {
    it('должен фильтровать по session_type=chat', async () => {
      /**
       * Filtering: фильтрация обычных диалогов
       * Validates: Requirements 3.2, 5.3
       */
      const mockSessions: SupportSession[] = [
        {
          id: 1,
          telegram_id: 12345,
          status: 'active',
          session_type: 'chat',
          created_at: new Date().toISOString(),
        },
      ];

      const mockResult: PaginatedSessions = {
        sessions: mockSessions,
        total: 1,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?session_type=chat'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: undefined,
        session_type: 'chat',
        page: 1,
        limit: 50,
      });
      
      result.sessions.forEach((session: SupportSession) => {
        expect(session.session_type).toBe('chat');
      });
    });

    it('должен фильтровать по session_type=support', async () => {
      /**
       * Filtering: фильтрация сессий поддержки
       */
      const mockSessions: SupportSession[] = [
        {
          id: 2,
          telegram_id: 67890,
          status: 'active',
          session_type: 'support',
          created_at: new Date().toISOString(),
        },
      ];

      const mockResult: PaginatedSessions = {
        sessions: mockSessions,
        total: 1,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?session_type=support'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: undefined,
        session_type: 'support',
        page: 1,
        limit: 50,
      });
      
      result.sessions.forEach((session: SupportSession) => {
        expect(session.session_type).toBe('support');
      });
    });

    it('должен вернуть 400 для невалидного session_type', async () => {
      /**
       * Edge case: невалидное значение типа сессии
       */
      const request = new NextRequest(
        'http://localhost/api/support/sessions?session_type=invalid'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toBe('Invalid session_type');
      expect(result.message).toBe('Тип сессии должен быть "chat" или "support"');
      expect(mockDb.getSessions).not.toHaveBeenCalled();
    });
  });

  describe('Комбинированная фильтрация', () => {
    it('должен применять фильтры по status и session_type одновременно', async () => {
      /**
       * Combined filtering: комбинация фильтров
       */
      const mockSessions: SupportSession[] = [
        {
          id: 1,
          telegram_id: 12345,
          status: 'active',
          session_type: 'chat',
          created_at: new Date().toISOString(),
        },
      ];

      const mockResult: PaginatedSessions = {
        sessions: mockSessions,
        total: 1,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?status=active&session_type=chat'
      );

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: 'active',
        session_type: 'chat',
        page: 1,
        limit: 50,
      });
      
      result.sessions.forEach((session: SupportSession) => {
        expect(session.status).toBe('active');
        expect(session.session_type).toBe('chat');
      });
    });

    it('должен применять все параметры одновременно', async () => {
      /**
       * Full filtering: все параметры вместе
       */
      const mockResult: PaginatedSessions = {
        sessions: [],
        total: 0,
        page: 2,
        limit: 25,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest(
        'http://localhost/api/support/sessions?status=closed&session_type=support&page=2&limit=25'
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockDb.getSessions).toHaveBeenCalledWith({
        status: 'closed',
        session_type: 'support',
        page: 2,
        limit: 25,
      });
    });
  });

  describe('Сортировка по времени', () => {
    it('должен возвращать сессии отсортированными по времени последнего сообщения', async () => {
      /**
       * Sorting: сортировка по времени
       * Validates: Requirements 3.1
       */
      const now = Date.now();
      const mockSessions: SupportSession[] = [
        {
          id: 3,
          telegram_id: 33333,
          status: 'active',
          session_type: 'chat',
          created_at: new Date(now - 3000).toISOString(),
          last_message_at: new Date(now - 100).toISOString(), // Самое свежее
        },
        {
          id: 2,
          telegram_id: 22222,
          status: 'active',
          session_type: 'chat',
          created_at: new Date(now - 2000).toISOString(),
          last_message_at: new Date(now - 500).toISOString(),
        },
        {
          id: 1,
          telegram_id: 11111,
          status: 'active',
          session_type: 'chat',
          created_at: new Date(now - 1000).toISOString(),
          last_message_at: new Date(now - 1000).toISOString(), // Самое старое
        },
      ];

      const mockResult: PaginatedSessions = {
        sessions: mockSessions,
        total: 3,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest('http://localhost/api/support/sessions');

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      
      // Проверяем, что сессии отсортированы по убыванию времени
      for (let i = 0; i < result.sessions.length - 1; i++) {
        const currentTime = new Date(result.sessions[i].last_message_at!).getTime();
        const nextTime = new Date(result.sessions[i + 1].last_message_at!).getTime();
        expect(currentTime).toBeGreaterThanOrEqual(nextTime);
      }
    });
  });

  describe('Обработка ошибок', () => {
    it('должен вернуть 500 при ошибке БД', async () => {
      /**
       * Error handling: ошибка базы данных
       */
      mockDb.getSessions.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/support/sessions');

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toBe('Internal server error');
      expect(result.message).toBe('Не удалось получить список сессий. Попробуйте позже.');
    });

    it('должен вернуть пустой список если сессий нет', async () => {
      /**
       * Edge case: пустой результат
       */
      const mockResult: PaginatedSessions = {
        sessions: [],
        total: 0,
        page: 1,
        limit: 50,
        has_more: false,
      };

      mockDb.getSessions.mockResolvedValue(mockResult);

      const request = new NextRequest('http://localhost/api/support/sessions');

      const response = await GET(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.sessions).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });
  });
});
