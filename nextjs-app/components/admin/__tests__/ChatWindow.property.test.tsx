/**
 * Property-based тесты для ChatWindow.tsx
 * Feature: bot-messages-tracking
 * 
 * Property 9: Хронологический порядок системных команд (Requirements 3.1)
 * Property 11: Хронологический порядок ответов бота (Requirements 4.1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fc, test } from '@fast-check/vitest';
import { ChatWindow } from '../ChatWindow';
import type { SupportSession, SupportMessage } from '@/types/support';

// Мокируем модуль database/realtimeClient
vi.mock('@/lib/database/realtimeClient', () => ({
  getRealtimeClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    subscribeToSessionMessages: vi.fn(() => vi.fn()),
  })),
}));

// Мокируем fetch API
global.fetch = vi.fn();

describe('ChatWindow - Property-Based Tests', () => {
  const mockSession: SupportSession = {
    id: 1,
    telegram_id: 123456789,
    session_type: 'chat',
    status: 'active',
    created_at: '2024-01-01T10:00:00Z',
    last_activity: '2024-01-01T10:00:00Z',
    closed_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Очищаем DOM перед каждым тестом
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Очищаем DOM после каждого теста
    document.body.innerHTML = '';
  });

  /**
   * Property 9: Хронологический порядок системных команд
   * 
   * For any диалога с партнёром, когда администратор открывает ChatWindow,
   * все системные команды должны отображаются в хронологическом порядке
   * (по возрастанию created_at).
   * 
   * Validates: Requirements 3.1
   */
  test.prop(
    [
      fc.integer({ min: 2, max: 5 }), // Количество команд
    ],
    { numRuns: 50 }
  )('Property 9: системные команды отображаются в хронологическом порядке', async (count) => {
    // Создаём уникальные команды с возрастающими timestamp
    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const uniqueId = Math.random().toString(36).substring(7);
    const messages: SupportMessage[] = [];
    
    for (let i = 0; i < count; i++) {
      messages.push({
        id: i + 1,
        session_id: 1,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: `/cmd${uniqueId}_${i}`,
        created_at: new Date(baseTime + i * 60000).toISOString(), // Каждая команда через минуту
        delivered: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      });
    }

    // Мокируем API ответ
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages,
        total: messages.length,
        has_more: false,
        session: mockSession,
      }),
    });

    // Рендерим компонент
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что все команды отображаются
    for (let i = 0; i < count; i++) {
      expect(screen.getByText(`/cmd${uniqueId}_${i}`)).toBeInTheDocument();
    }

    // Проверяем хронологический порядок в DOM
    const messageElements = [];
    for (let i = 0; i < count; i++) {
      messageElements.push(screen.getByText(`/cmd${uniqueId}_${i}`).closest('div.rounded-2xl'));
    }

    // Все элементы должны существовать
    messageElements.forEach(el => expect(el).toBeInTheDocument());

    // Проверяем, что порядок в DOM соответствует хронологическому порядку
    const positions = messageElements.map(el => {
      if (!el) return -1;
      const parent = el.closest('.space-y-4');
      if (!parent) return -1;
      return Array.from(parent.querySelectorAll('div.rounded-2xl')).indexOf(el);
    });

    // Проверяем, что позиции идут по возрастанию (хронологический порядок)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  /**
   * Property 11: Хронологический порядок ответов бота
   * 
   * For any диалога с партнёром, когда администратор открывает ChatWindow,
   * все ответы бота должны отображаться в хронологическом порядке
   * (по возрастанию created_at).
   * 
   * Validates: Requirements 4.1
   */
  test.prop(
    [
      fc.integer({ min: 2, max: 5 }), // Количество сообщений бота
    ],
    { numRuns: 50 }
  )('Property 11: ответы бота отображаются в хронологическом порядке', async (count) => {
    // Создаём уникальные сообщения бота с возрастающими timestamp
    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const uniqueId = Math.random().toString(36).substring(7);
    const messages: SupportMessage[] = [];
    
    for (let i = 0; i < count; i++) {
      messages.push({
        id: i + 1,
        session_id: 1,
        telegram_id: 0, // telegram_id = 0 для сообщений бота
        message_type: 'from_bot',
        message_text: `Bot message ${uniqueId}_${i}`,
        created_at: new Date(baseTime + i * 60000).toISOString(),
        delivered: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      });
    }

    // Мокируем API ответ
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages,
        total: messages.length,
        has_more: false,
        session: mockSession,
      }),
    });

    // Рендерим компонент
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что все сообщения бота отображаются
    for (let i = 0; i < count; i++) {
      expect(screen.getByText(`Bot message ${uniqueId}_${i}`)).toBeInTheDocument();
    }

    // Проверяем хронологический порядок в DOM
    const messageElements = [];
    for (let i = 0; i < count; i++) {
      messageElements.push(screen.getByText(`Bot message ${uniqueId}_${i}`).closest('div.rounded-2xl'));
    }

    // Все элементы должны существовать
    messageElements.forEach(el => expect(el).toBeInTheDocument());

    // Проверяем, что порядок в DOM соответствует хронологическому порядку
    const positions = messageElements.map(el => {
      if (!el) return -1;
      const parent = el.closest('.space-y-4');
      if (!parent) return -1;
      return Array.from(parent.querySelectorAll('div.rounded-2xl')).indexOf(el);
    });

    // Проверяем, что позиции идут по возрастанию (хронологический порядок)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  /**
   * Property: Смешанные сообщения (команды + ответы бота) в хронологическом порядке
   * 
   * For any диалога с партнёром, когда администратор открывает ChatWindow,
   * все сообщения (команды пользователя и ответы бота) должны отображаться
   * в хронологическом порядке (по возрастанию created_at).
   * 
   * Validates: Requirements 3.1, 4.1
   */
  test.prop(
    [
      fc.integer({ min: 3, max: 8 }), // Количество сообщений
    ],
    { numRuns: 50 }
  )('Property: смешанные сообщения отображаются в хронологическом порядке', async (count) => {
    // Создаём смешанные сообщения с возрастающими timestamp
    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const uniqueId = Math.random().toString(36).substring(7);
    const messages: SupportMessage[] = [];
    
    for (let i = 0; i < count; i++) {
      const isBot = i % 2 === 0;
      messages.push({
        id: i + 1,
        session_id: 1,
        telegram_id: isBot ? 0 : 123456789,
        message_type: isBot ? 'from_bot' : 'from_user',
        message_text: isBot ? `Bot msg ${uniqueId}_${i}` : `User msg ${uniqueId}_${i}`,
        created_at: new Date(baseTime + i * 60000).toISOString(),
        delivered: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      });
    }

    // Мокируем API ответ
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages,
        total: messages.length,
        has_more: false,
        session: mockSession,
      }),
    });

    // Рендерим компонент
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что все сообщения отображаются
    for (let i = 0; i < count; i++) {
      const isBot = i % 2 === 0;
      const text = isBot ? `Bot msg ${uniqueId}_${i}` : `User msg ${uniqueId}_${i}`;
      expect(screen.getByText(text)).toBeInTheDocument();
    }

    // Проверяем хронологический порядок в DOM
    const messageElements = [];
    for (let i = 0; i < count; i++) {
      const isBot = i % 2 === 0;
      const text = isBot ? `Bot msg ${uniqueId}_${i}` : `User msg ${uniqueId}_${i}`;
      messageElements.push(screen.getByText(text).closest('div.rounded-2xl'));
    }

    // Все элементы должны существовать
    messageElements.forEach(el => expect(el).toBeInTheDocument());

    // Проверяем, что порядок в DOM соответствует хронологическому порядку
    const positions = messageElements.map(el => {
      if (!el) return -1;
      const parent = el.closest('.space-y-4');
      if (!parent) return -1;
      return Array.from(parent.querySelectorAll('div.rounded-2xl')).indexOf(el);
    });

    // Проверяем, что позиции идут по возрастанию (хронологический порядок)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  /**
   * Property: Все сообщения бота имеют метку "🤖 Бот"
   * 
   * For any набора сообщений бота, каждое сообщение должно отображаться
   * с меткой "🤖 Бот".
   * 
   * Validates: Requirements 4.3
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 5 }), // Количество сообщений бота
    ],
    { numRuns: 50 }
  )('Property: все сообщения бота имеют метку "🤖 Бот"', async (count) => {
    // Создаём сообщения бота
    const uniqueId = Math.random().toString(36).substring(7);
    const messages: SupportMessage[] = [];
    
    for (let i = 0; i < count; i++) {
      messages.push({
        id: i + 1,
        session_id: 1,
        telegram_id: 0,
        message_type: 'from_bot',
        message_text: `Bot text ${uniqueId}_${i}`,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
        delivered: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      });
    }

    // Мокируем API ответ
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages,
        total: messages.length,
        has_more: false,
        session: mockSession,
      }),
    });

    // Рендерим компонент
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что метка "🤖 Бот" отображается для каждого сообщения бота
    const botLabels = screen.getAllByText('🤖 Бот');
    expect(botLabels).toHaveLength(count);
  });

  /**
   * Property: Все сообщения бота имеют фиолетовый стиль
   * 
   * For any набора сообщений бота, каждое сообщение должно отображаться
   * с фиолетовым фоном (bg-purple-100).
   * 
   * Validates: Requirements 4.2
   */
  test.prop(
    [
      fc.integer({ min: 1, max: 5 }), // Количество сообщений бота
    ],
    { numRuns: 50 }
  )('Property: все сообщения бота имеют фиолетовый стиль', async (count) => {
    // Создаём сообщения бота
    const uniqueId = Math.random().toString(36).substring(7);
    const messages: SupportMessage[] = [];
    
    for (let i = 0; i < count; i++) {
      messages.push({
        id: i + 1,
        session_id: 1,
        telegram_id: 0,
        message_type: 'from_bot',
        message_text: `Bot style ${uniqueId}_${i}`,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
        delivered: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      });
    }

    // Мокируем API ответ
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages,
        total: messages.length,
        has_more: false,
        session: mockSession,
      }),
    });

    // Рендерим компонент
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что все сообщения бота имеют фиолетовый стиль
    for (let i = 0; i < count; i++) {
      const messageElement = screen.getByText(`Bot style ${uniqueId}_${i}`);
      const messageBubble = messageElement.closest('div.rounded-2xl');
      
      expect(messageBubble).toHaveClass('bg-purple-100');
      expect(messageBubble).toHaveClass('text-purple-900');
      expect(messageBubble).toHaveClass('border-purple-200');
    }
  });
});
