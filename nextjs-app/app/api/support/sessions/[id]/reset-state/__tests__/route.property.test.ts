/**
 * Property-Based тесты для API /api/support/sessions/[id]/reset-state
 * Feature: admin-reset-user-state-button
 * 
 * Property 10: API endpoint проверяет аутентификацию
 * Property 11: API endpoint проверяет права доступа
 * 
 * Validates: Requirements 4.2, 4.3, 4.4, 7.3, 7.4
 */

import { describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { NextRequest } from 'next/server';

// Моки модулей - ДОЛЖНЫ быть ДО импортов
vi.mock('@/lib/auth/adminRequestAuth');
vi.mock('@/lib/database/client');

// Импорты после моков
import { POST } from '../route';
import { resolveAdminRequestAuth } from '@/lib/auth/adminRequestAuth';
import { getDb } from '@/lib/database/client';
import type { SupportSession } from '@/types/support';
import { createRouteParams } from '@/app/api/__tests__/test-utils';

// Генераторы для property-based тестов
const sessionIdArbitrary = fc.integer({ min: 1, max: 10000 });
const hasAuthArbitrary = fc.boolean();
const roleArbitrary = fc.integer({ min: 0, max: 4 });
const telegramIdArbitrary = fc.integer({ min: 100000, max: 999999999 });

describe('Reset State API - Property Tests', () => {
  let mockDb: any;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  // Mock fetch глобально
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();

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
    vi.restoreAllMocks();
  });

  /**
   * Property 10: API endpoint проверяет аутентификацию
   * 
   * For any запроса к endpoint, если аутентификация отсутствует,
   * система должна вернуть HTTP 401
   * 
   * Validates: Requirements 4.2, 4.3
   */
  test.prop([sessionIdArbitrary, hasAuthArbitrary], { numRuns: 100 })(
    'Property 10: должен возвращать 401 при отсутствии аутентификации',
    async (sessionId, hasAuth) => {
      // Arrange
      if (hasAuth) {
        // Пропускаем тест, если есть аутентификация
        return;
      }

      vi.mocked(resolveAdminRequestAuth).mockResolvedValue(null);

      const request = new NextRequest(
        `http://localhost/api/support/sessions/${sessionId}/reset-state`,
        { method: 'POST' }
      );
      const params = createRouteParams({ id: sessionId.toString() });

      // Act
      const response = await POST(request, params);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
      expect(data.message).toBe('Требуется авторизация');
    }
  );

  /**
   * Property 11: API endpoint проверяет права доступа
   * 
   * For any запроса к endpoint с аутентификацией,
   * если роль пользователя не равна 2 или 3,
   * система должна вернуть HTTP 403
   * 
   * Validates: Requirements 4.4, 7.3, 7.4
   */
  test.prop([sessionIdArbitrary, roleArbitrary, telegramIdArbitrary], { numRuns: 100 })(
    'Property 11: должен возвращать 403 для недостаточных прав (role !== 2 && role !== 3)',
    async (sessionId, role, tgId) => {
      // Arrange
      // Пропускаем тест для валидных ролей (2 и 3)
      if (role === 2 || role === 3) {
        return;
      }

      vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
        adminId: `tg:${tgId}`,
        tgId,
        role,
        source: 'cookie',
      });

      const request = new NextRequest(
        `http://localhost/api/support/sessions/${sessionId}/reset-state`,
        { method: 'POST' }
      );
      const params = createRouteParams({ id: sessionId.toString() });

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
          admin_id: `tg:${tgId}`,
          role,
        })
      );
    }
  );

  /**
   * Property 11 (дополнительный тест): Успешный доступ для валидных ролей
   * 
   * For any запроса к endpoint с аутентификацией и ролью 2 или 3,
   * система должна пройти проверку прав и продолжить обработку
   * 
   * Validates: Requirements 4.4, 7.3, 7.4
   */
  test.prop([
    sessionIdArbitrary,
    fc.constantFrom(2, 3), // Только валидные роли
    telegramIdArbitrary,
  ], { numRuns: 100 })(
    'Property 11 (позитивный): должен пропускать запросы с валидными ролями (2 или 3)',
    async (sessionId, role, tgId) => {
      // Arrange
      vi.mocked(resolveAdminRequestAuth).mockResolvedValue({
        adminId: `tg:${tgId}`,
        tgId,
        role,
        source: 'cookie',
      });

      const mockSession: SupportSession = {
        id: sessionId,
        telegram_id: tgId,
        status: 'active',
        session_type: 'support',
        created_at: new Date().toISOString(),
      };

      mockDb.getSession.mockResolvedValue(mockSession);

      // Мокируем успешный ответ от Bot API
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'State reset successfully',
          telegram_id: tgId,
          session_id: sessionId,
        }),
      } as Response);

      const request = new NextRequest(
        `http://localhost/api/support/sessions/${sessionId}/reset-state`,
        { method: 'POST' }
      );
      const params = createRouteParams({ id: sessionId.toString() });

      // Act
      const response = await POST(request, params);
      const data = await response.json();

      // Assert
      // Не должно быть ошибки 403
      expect(response.status).not.toBe(403);
      
      // Должен быть успешный ответ (200) или другая ошибка, но не 403
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.session_id).toBe(sessionId);
        expect(data.telegram_id).toBe(tgId);
      }

      // Не должно быть логирования forbidden_attempt
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        'reset_state_forbidden_attempt',
        expect.anything()
      );
    }
  );

  /**
   * Property 10 (дополнительный тест): Проверка с различными session ID
   * 
   * For any session ID, если аутентификация отсутствует,
   * система должна вернуть 401 независимо от session ID
   * 
   * Validates: Requirements 4.2, 4.3
   */
  test.prop([
    fc.oneof(
      sessionIdArbitrary,
      fc.constant('invalid'),
      fc.constant('0'),
      fc.constant('-1'),
      fc.constant('999999')
    ),
  ], { numRuns: 100 })(
    'Property 10 (расширенный): должен возвращать 401 для любого session ID без аутентификации',
    async (sessionId) => {
      // Arrange
      vi.mocked(resolveAdminRequestAuth).mockResolvedValue(null);

      const request = new NextRequest(
        `http://localhost/api/support/sessions/${sessionId}/reset-state`,
        { method: 'POST' }
      );
      const params = createRouteParams({ id: sessionId.toString() });

      // Act
      const response = await POST(request, params);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    }
  );
});
