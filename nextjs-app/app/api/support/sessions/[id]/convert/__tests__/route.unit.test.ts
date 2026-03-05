/**
 * Unit-тесты для API /api/support/sessions/[id]/convert
 * Feature: admin-chat-persistence
 * Validates: Requirements 1.5, 4.3, 8.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { POST } from '../route';
import { getDb } from '@/lib/database/client';
import type { SupportSession } from '@/types/support';

// Мокируем зависимости
vi.mock('next-auth');
vi.mock('@/lib/database/client');

describe('POST /api/support/sessions/[id]/convert', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      getSession: vi.fn(),
      updateSessionType: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  it('должен возвращать 401 для неавторизованных запросов', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/1/convert', {
      method: 'POST',
    });
    const params = { params: { id: '1' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('должен возвращать 400 для невалидного session_id', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    const request = new NextRequest('http://localhost/api/support/sessions/invalid/convert', {
      method: 'POST',
    });
    const params = { params: { id: 'invalid' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid session_id');
  });

  it('должен возвращать 404 если сессия не найдена (Requirements 1.5)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    mockDb.getSession.mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/999/convert', {
      method: 'POST',
    });
    const params = { params: { id: '999' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('должен возвращать 400 если сессия уже является Support_Session', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support', // Уже Support_Session
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    const request = new NextRequest('http://localhost/api/support/sessions/1/convert', {
      method: 'POST',
    });
    const params = { params: { id: '1' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Already support session');
    expect(data.session).toEqual(mockSession);
  });

  it('должен успешно преобразовывать Chat_Session в Support_Session (Requirements 4.3)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockChatSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    const mockSupportSession: SupportSession = {
      ...mockChatSession,
      session_type: 'support',
    };

    mockDb.getSession
      .mockResolvedValueOnce(mockChatSession) // Первый вызов - до преобразования
      .mockResolvedValueOnce(mockSupportSession); // Второй вызов - после преобразования
    mockDb.updateSessionType.mockResolvedValue(true);

    const request = new NextRequest('http://localhost/api/support/sessions/1/convert', {
      method: 'POST',
    });
    const params = { params: { id: '1' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockDb.updateSessionType).toHaveBeenCalledWith(1, 'support');
    expect(data.session.session_type).toBe('support');
  });

  it('должен возвращать 500 если обновление не удалось', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.updateSessionType.mockResolvedValue(false); // Обновление не удалось

    const request = new NextRequest('http://localhost/api/support/sessions/1/convert', {
      method: 'POST',
    });
    const params = { params: { id: '1' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe('Update failed');
  });

  it('должен логировать действие администратора (Requirements 8.3)', async () => {
    // Arrange
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockChatSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    const mockSupportSession: SupportSession = {
      ...mockChatSession,
      session_type: 'support',
    };

    mockDb.getSession
      .mockResolvedValueOnce(mockChatSession)
      .mockResolvedValueOnce(mockSupportSession);
    mockDb.updateSessionType.mockResolvedValue(true);

    const request = new NextRequest('http://localhost/api/support/sessions/1/convert', {
      method: 'POST',
    });
    const params = { params: { id: '1' } };

    // Act
    await POST(request, params);

    // Assert
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Session manually converted',
      expect.objectContaining({
        session_id: 1,
        from: 'chat',
        to: 'support',
        admin_id: 'admin@test.com',
      })
    );

    consoleLogSpy.mockRestore();
  });

  it('должен обрабатывать ошибки БД', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.updateSessionType.mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost/api/support/sessions/1/convert', {
      method: 'POST',
    });
    const params = { params: { id: '1' } };

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
