/**
 * Unit-тесты для API /api/support/sessions/[id]/reset-state
 * Feature: admin-reset-user-state-button
 * Validates: Requirements 4.2, 4.3, 4.4, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getDb } from '@/lib/database/client';
import { resolveAdminRequestAuth } from '@/lib/auth/adminRequestAuth';
import type { SupportSession } from '@/types/support';
import { createRouteParams } from '@/app/api/__tests__/test-utils';

// Мокируем зависимости
vi.mock('@/lib/auth/adminRequestAuth');
vi.mock('@/lib/database/client');

// Мокируем fetch для вызова Bot API
global.fetch = vi.fn();

describe('POST /api/support/sessions/[id]/reset-state', () => {
  let mockDb: any;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDb = {
      getSession: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);

    // Мокируем console для проверки логирования
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Устанавливаем переменную окружения для Bot API URL
    process.env.BACKEND_API_URL = 'http://localhost:5000';
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  /**
   * Тест аутентификации: возврат 401 при отсутствии токена
   * Validates: Requirements 4.2, 8.1
   */
  it('должен возвращать 401 для неавторизованных запросов', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Требуется авторизация');
  });

  /**
   * Тест авторизации: возврат 403 для role < 0 или role > 3
   * Validates: Requirements 4.4, 7.3, 7.4
   */
  it('должен возвращать 403 для пользователей без прав (role = -1)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: -1,
      source: 'cookie',
    });

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
    expect(data.message).toBe('Недостаточно прав для выполнения операции');
    
    // Проверяем логирование неудачной попытки доступа
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'reset_state_forbidden_attempt',
      expect.objectContaining({
        admin_id: 'tg:123456',
        role: -1,
      })
    );
  });

  it('должен возвращать 403 для пользователей без прав (role = 4)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 4,
      source: 'cookie',
    });

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  /**
   * Тест валидации: возврат 400 для невалидного session ID
   * Validates: Requirements 8.2
   */
  it('должен возвращать 400 для невалидного session_id (строка)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const request = new NextRequest('http://localhost/api/support/sessions/invalid/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: 'invalid' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid session_id');
    expect(data.message).toBe('ID сессии должен быть положительным числом');
  });

  it('должен возвращать 400 для невалидного session_id (отрицательное число)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const request = new NextRequest('http://localhost/api/support/sessions/-1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '-1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid session_id');
  });

  it('должен возвращать 400 для невалидного session_id (ноль)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const request = new NextRequest('http://localhost/api/support/sessions/0/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '0' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid session_id');
  });

  /**
   * Тест валидации: возврат 404 для несуществующей сессии
   * Validates: Requirements 8.1
   */
  it('должен возвращать 404 если сессия не найдена', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    mockDb.getSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/support/sessions/999/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '999' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
    expect(data.message).toBe('Сессия не найдена');
    expect(mockDb.getSession).toHaveBeenCalledWith(999);
  });

  /**
   * Тест валидации: возврат 400 для закрытой сессии (status = 'closed')
   * Validates: Requirements 8.2
   */
  it('должен возвращать 400 для закрытой сессии', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'closed',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Session closed');
    expect(data.message).toBe('Сессия уже завершена');
  });

  /**
   * Тест успешного вызова Bot API (200 OK)
   * Validates: Requirements 4.2, 4.3, 8.4
   */
  it('должен успешно сбрасывать состояние для разработчика (role = 0)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:111111',
      tgId: 111111,
      role: 0,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    // Мокируем успешный ответ от Bot API
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'State reset successfully',
        telegram_id: 123456789,
        session_id: 1,
      }),
    } as Response);

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Состояние пользователя успешно сброшено');
    expect(data.session_id).toBe(1);
    expect(data.telegram_id).toBe(123456789);
  });

  it('должен успешно сбрасывать состояние для помощника (role = 1)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:222222',
      tgId: 222222,
      role: 1,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    // Мокируем успешный ответ от Bot API
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'State reset successfully',
        telegram_id: 123456789,
        session_id: 1,
      }),
    } as Response);

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.session_id).toBe(1);
    expect(data.telegram_id).toBe(123456789);
  });

  it('должен успешно сбрасывать состояние для администратора (role = 2)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    // Мокируем успешный ответ от Bot API
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'State reset successfully',
        telegram_id: 123456789,
        session_id: 1,
      }),
    } as Response);

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Состояние пользователя успешно сброшено');
    expect(data.session_id).toBe(1);
    expect(data.telegram_id).toBe(123456789);

    // Проверяем вызов Bot API
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/bot/reset-state',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: 123456789,
          session_id: 1,
          admin_id: 'tg:123456',
        }),
      })
    );

    // Проверяем логирование успешной операции
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'state_reset_success',
      expect.objectContaining({
        session_id: 1,
        telegram_id: 123456789,
        admin_id: 'tg:123456',
      })
    );
  });

  it('должен успешно сбрасывать состояние для оператора (role = 3)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:987654',
      tgId: 987654,
      role: 3,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 2,
      telegram_id: 987654321,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    // Мокируем успешный ответ от Bot API
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'State reset successfully',
        telegram_id: 987654321,
        session_id: 2,
      }),
    } as Response);

    const request = new NextRequest('http://localhost/api/support/sessions/2/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '2' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.session_id).toBe(2);
    expect(data.telegram_id).toBe(987654321);
  });

  /**
   * Тест обработки недоступности Bot API (503)
   * Validates: Requirements 8.3
   */
  it('должен возвращать 503 при недоступности Bot API (network error)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    // Мокируем ошибку сети
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(data.error).toBe('Bot unavailable');
    expect(data.message).toBe('Бот временно недоступен');

    // Проверяем логирование ошибки
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'bot_unavailable',
      expect.objectContaining({
        session_id: 1,
        telegram_id: 123456789,
        admin_id: 'tg:123456',
        error: 'Network error',
      })
    );
  });

  it('должен возвращать 503 при ошибке Bot API (500 от бота)', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    // Мокируем ошибку от Bot API
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'FSM error',
        message: 'Failed to reset user state',
      }),
    } as Response);

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(data.error).toBe('Bot unavailable');
    expect(data.message).toBe('Бот временно недоступен');

    // Проверяем логирование ошибки Bot API
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'bot_api_error',
      expect.objectContaining({
        session_id: 1,
        telegram_id: 123456789,
        admin_id: 'tg:123456',
        status: 500,
        error: 'FSM error',
      })
    );
  });

  /**
   * Тест логирования успешных операций и ошибок
   * Validates: Requirements 8.4
   */
  it('должен логировать все этапы успешной операции', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    await POST(request, params);

    // Assert - проверяем, что логирование вызвано с правильными параметрами
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'state_reset_success',
      expect.objectContaining({
        session_id: 1,
        telegram_id: 123456789,
        admin_id: 'tg:123456',
        timestamp: expect.any(String),
      })
    );
  });

  it('должен логировать ошибки с полным stack trace', async () => {
    // Arrange
    vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
      adminId: 'tg:123456',
      tgId: 123456,
      role: 2,
      source: 'cookie',
    });

    // Мокируем ошибку базы данных
    mockDb.getSession.mockRejectedValue(new Error('Database connection failed'));

    const request = new NextRequest('http://localhost/api/support/sessions/1/reset-state', {
      method: 'POST',
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');

    // Проверяем логирование ошибки с stack trace
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'POST /api/support/sessions/[id]/reset-state error:',
      expect.any(Error)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error details:',
      expect.objectContaining({
        message: 'Database connection failed',
        stack: expect.any(String),
        timestamp: expect.any(String),
      })
    );
  });
});
