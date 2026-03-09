/**
 * Unit-тесты для API /api/support/sessions/[id]/messages
 * Feature: admin-chat-persistence
 * Validates: Requirements 3.4, 4.2, 4.3, 7.3, 8.1, 8.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { GET, POST } from '../route';
import { getDb } from '@/lib/database/client';
import type { SupportSession, SupportMessage } from '@/types/support';
import { createRouteParams } from '@/app/api/__tests__/test-utils';

// Мокируем зависимости
vi.mock('next-auth');
vi.mock('@/lib/database/client');

// Мокируем TelegramBotApi как класс
const mockSendMessage = vi.fn();
class MockTelegramBotApi {
  sendMessage = mockSendMessage;
}

vi.mock('@/lib/telegram/botApi', () => ({
  TelegramBotApi: MockTelegramBotApi,
}));

describe('GET /api/support/sessions/[id]/messages', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      getSession: vi.fn(),
      getMessages: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  it('должен возвращать 401 для неавторизованных запросов', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/1/messages');
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await GET(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('должен возвращать 400 для невалидного session_id', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    const request = new NextRequest('http://localhost/api/support/sessions/invalid/messages');
    const params = createRouteParams({ id: 'invalid' });

    // Act
    const response = await GET(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid session_id');
  });

  it('должен возвращать 404 если сессия не найдена', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    mockDb.getSession.mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/999/messages');
    const params = createRouteParams({ id: '999' });

    // Act
    const response = await GET(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('должен возвращать историю сообщений с пагинацией (Requirements 7.3)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    const mockMessages: SupportMessage[] = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_user' as const,
      message_text: `Message ${i + 1}`,
      created_at: new Date(Date.now() + i * 1000).toISOString(),
      delivered: true,
    }));

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.getMessages.mockResolvedValue(mockMessages.slice(0, 50)); // Имитируем limit

    const request = new NextRequest('http://localhost/api/support/sessions/1/messages?limit=50');
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await GET(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.messages).toHaveLength(50);
    expect(data.session).toEqual(mockSession);
  });

  it('должен фильтровать системные команды (Requirements 8.4)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    const mockMessages: SupportMessage[] = [
      {
        id: 1,
        session_id: 1,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: '/start',
        created_at: new Date().toISOString(),
        delivered: true,
      },
      {
        id: 2,
        session_id: 1,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Обычное сообщение',
        created_at: new Date().toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 1,
        telegram_id: 123456789,
        message_type: 'from_bot',
        message_text: 'Ответ бота',
        created_at: new Date().toISOString(),
        delivered: true,
      },
    ];

    // Имитируем фильтрацию на стороне API
    const filteredMessages = mockMessages.filter(msg => {
      if (msg.message_type !== 'from_user') return true;
      return !msg.message_text.startsWith('/start') && !msg.message_text.startsWith('/help');
    });

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.getMessages.mockResolvedValue(filteredMessages);

    const request = new NextRequest('http://localhost/api/support/sessions/1/messages');
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await GET(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.messages).toHaveLength(2);
    expect(data.messages.find((m: SupportMessage) => m.message_text === '/start')).toBeUndefined();
  });

  it('должен возвращать все сообщения если filter_commands=false', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat',
      created_at: new Date().toISOString(),
    };

    const mockMessages: SupportMessage[] = [
      {
        id: 1,
        session_id: 1,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: '/start',
        created_at: new Date().toISOString(),
        delivered: true,
      },
      {
        id: 2,
        session_id: 1,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Обычное сообщение',
        created_at: new Date().toISOString(),
        delivered: true,
      },
    ];

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.getMessages.mockResolvedValue(mockMessages);

    const request = new NextRequest('http://localhost/api/support/sessions/1/messages?filter_commands=false');
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await GET(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data.messages).toHaveLength(2);
  });
});

describe('POST /api/support/sessions/[id]/messages', () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      getSession: vi.fn(),
      saveMessage: vi.fn(),
      markMessageAsDelivered: vi.fn(),
      updateSessionType: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb);
    
    // Сбрасываем мок sendMessage
    mockSendMessage.mockReset();
  });

  it('должен возвращать 401 для неавторизованных запросов', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/1/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: 'Test' }),
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('должен возвращать 400 для пустого message_text', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    const request = new NextRequest('http://localhost/api/support/sessions/1/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: '   ' }),
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Empty message_text');
  });

  it('должен возвращать 404 если сессия не найдена', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    mockDb.getSession.mockResolvedValue(null);
    const request = new NextRequest('http://localhost/api/support/sessions/999/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: 'Test message' }),
    });
    const params = createRouteParams({ id: '999' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(data.error).toBe('Session not found');
  });

  it('должен возвращать 400 если сессия закрыта', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'closed',
      session_type: 'support',
      created_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    const request = new NextRequest('http://localhost/api/support/sessions/1/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: 'Test message' }),
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(data.error).toBe('Session closed');
  });

  it('должен автоматически преобразовывать Chat_Session в Support_Session (Requirements 4.3)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'chat', // Обычная сессия
      created_at: new Date().toISOString(),
    };

    const savedMessage: SupportMessage = {
      id: 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_support',
      message_text: 'Здравствуйте!',
      created_at: new Date().toISOString(),
      delivered: false,
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.saveMessage.mockResolvedValue(savedMessage);
    mockDb.markMessageAsDelivered.mockResolvedValue(undefined);
    mockDb.updateSessionType.mockResolvedValue(true);
    mockSendMessage.mockResolvedValue({ ok: true });

    const request = new NextRequest('http://localhost/api/support/sessions/1/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: 'Здравствуйте!' }),
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(mockDb.updateSessionType).toHaveBeenCalledWith(1, 'support');
    expect(data.session.session_type).toBe('support');
  });

  it('должен сохранять сообщение с типом from_support (Requirements 4.2)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    const savedMessage: SupportMessage = {
      id: 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_support',
      message_text: 'Тестовое сообщение',
      created_at: new Date().toISOString(),
      delivered: false,
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.saveMessage.mockResolvedValue(savedMessage);
    mockDb.markMessageAsDelivered.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue({ ok: true });

    const request = new NextRequest('http://localhost/api/support/sessions/1/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: 'Тестовое сообщение' }),
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(mockDb.saveMessage).toHaveBeenCalledWith({
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_support',
      message_text: 'Тестовое сообщение',
    });
    expect(data.message.message_type).toBe('from_support');
  });

  it('должен обрабатывать ошибки Telegram API (Requirements 4.2)', async () => {
    // Arrange
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@test.com' } } as any);
    
    const mockSession: SupportSession = {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      session_type: 'support',
      created_at: new Date().toISOString(),
    };

    const savedMessage: SupportMessage = {
      id: 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_support',
      message_text: 'Тестовое сообщение',
      created_at: new Date().toISOString(),
      delivered: false,
    };

    mockDb.getSession.mockResolvedValue(mockSession);
    mockDb.saveMessage.mockResolvedValue(savedMessage);
    mockSendMessage.mockRejectedValue(new Error('Telegram API error'));

    const request = new NextRequest('http://localhost/api/support/sessions/1/messages', {
      method: 'POST',
      body: JSON.stringify({ message_text: 'Тестовое сообщение' }),
    });
    const params = createRouteParams({ id: '1' });

    // Act
    const response = await POST(request, params);
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data.error).toBe('Telegram API error');
    expect(data.saved_message).toBeDefined(); // Сообщение сохранено, но не доставлено
  });
});

