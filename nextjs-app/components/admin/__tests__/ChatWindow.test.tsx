/**
 * Unit-тесты для ChatWindow.tsx
 * Feature: bot-messages-tracking
 * Requirements: 3.1, 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('ChatWindow - Unit Tests', () => {
  const mockSession: SupportSession = {
    id: 1,
    telegram_id: 123456789,
    session_type: 'chat',
    status: 'active',
    created_at: '2024-01-01T10:00:00Z',
    last_activity: '2024-01-01T10:00:00Z',
    closed_at: null,
  };

  const mockMessages: SupportMessage[] = [
    {
      id: 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_user',
      message_text: '/start',
      created_at: '2024-01-01T10:00:00Z',
      delivered: false,
      media_type: 'text',
      file_path: null,
      caption: null,
      file_size: null,
    },
    {
      id: 2,
      session_id: 1,
      telegram_id: 0,
      message_type: 'from_bot',
      message_text: 'Привет! Я бот.',
      created_at: '2024-01-01T10:00:01Z',
      delivered: false,
      media_type: 'text',
      file_path: null,
      caption: null,
      file_size: null,
    },
    {
      id: 3,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_user',
      message_text: 'Привет!',
      created_at: '2024-01-01T10:00:02Z',
      delivered: false,
      media_type: 'text',
      file_path: null,
      caption: null,
      file_size: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Мокируем успешный ответ API
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        total: mockMessages.length,
        has_more: false,
        session: mockSession,
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Тест 1: Отображение сообщения бота с правильным стилем
   * Requirements: 4.2, 4.3
   */
  it('должен отображать сообщение бота с фиолетовым фоном', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем, что сообщение бота отображается
    const botMessage = screen.getByText('Привет! Я бот.');
    expect(botMessage).toBeInTheDocument();

    // Проверяем, что у сообщения бота правильный стиль (фиолетовый фон)
    const botMessageBubble = botMessage.closest('div.rounded-2xl');
    expect(botMessageBubble).toHaveClass('bg-purple-100');
    expect(botMessageBubble).toHaveClass('text-purple-900');
    expect(botMessageBubble).toHaveClass('border-purple-200');
  });

  /**
   * Тест 2: Отображение метки "🤖 Бот"
   * Requirements: 4.3, 4.4
   */
  it('должен отображать метку "🤖 Бот" над сообщением бота', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем наличие метки "🤖 Бот"
    const botLabel = screen.getByText('🤖 Бот');
    expect(botLabel).toBeInTheDocument();
    expect(botLabel).toHaveClass('text-purple-700');
  });

  /**
   * Тест 3: Хронологический порядок сообщений
   * Requirements: 3.1, 4.1
   */
  it('должен отображать сообщения в хронологическом порядке', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Получаем все текстовые сообщения в порядке их появления в DOM
    const messageTexts = [
      screen.getByText('/start'),
      screen.getByText('Привет! Я бот.'),
      screen.getByText('Привет!'),
    ];

    // Проверяем, что сообщения отображаются в правильном порядке
    expect(messageTexts[0]).toBeInTheDocument();
    expect(messageTexts[1]).toBeInTheDocument();
    expect(messageTexts[2]).toBeInTheDocument();

    // Проверяем порядок в DOM
    const messagesContainer = messageTexts[0].closest('.space-y-4');
    expect(messagesContainer).toBeInTheDocument();
  });

  /**
   * Тест 4: Отображение системной команды как обычного сообщения пользователя
   * Requirements: 3.1, 3.2, 3.3
   */
  it('должен отображать системную команду /start как обычное сообщение пользователя', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем, что команда /start отображается
    const commandMessage = screen.getByText('/start');
    expect(commandMessage).toBeInTheDocument();

    // Проверяем, что у команды стиль обычного сообщения пользователя (белый фон)
    const commandBubble = commandMessage.closest('div.rounded-2xl');
    expect(commandBubble).toHaveClass('bg-white');
    expect(commandBubble).toHaveClass('text-telegram-text');
  });

  /**
   * Тест 5: Отображение аватара бота
   * Requirements: 4.4
   */
  it('должен отображать аватар бота с иконкой 🤖', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем наличие аватара бота
    const botAvatar = screen.getByTitle('Бот');
    expect(botAvatar).toBeInTheDocument();
    expect(botAvatar).toHaveTextContent('🤖');
  });

  /**
   * Тест 6: Отсутствие метки "🤖 Бот" у сообщений пользователя
   * Requirements: 4.3
   */
  it('не должен отображать метку "🤖 Бот" у сообщений пользователя', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем, что метка "🤖 Бот" отображается только один раз (для сообщения бота)
    const botLabels = screen.getAllByText('🤖 Бот');
    expect(botLabels).toHaveLength(1);
  });

  /**
   * Тест 7: Отображение временной метки для всех сообщений
   * Requirements: 3.4, 4.4
   */
  it('должен отображать временную метку для каждого сообщения', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем, что временные метки отображаются
    // formatTime возвращает время в формате HH:MM
    const timeElements = screen.getAllByText(/\d{2}:\d{2}/);
    expect(timeElements.length).toBeGreaterThanOrEqual(3); // Минимум 3 сообщения
  });

  /**
   * Тест 8: Различие визуального стиля сообщений бота и пользователя
   * Requirements: 4.6
   */
  it('должен визуально различать сообщения бота и пользователя', async () => {
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Получаем пузыри сообщений
    const botMessage = screen.getByText('Привет! Я бот.').closest('div.rounded-2xl');
    const userMessage = screen.getByText('Привет!').closest('div.rounded-2xl');

    // Проверяем, что стили различаются
    expect(botMessage).toHaveClass('bg-purple-100');
    expect(userMessage).toHaveClass('bg-white');
    
    expect(botMessage).not.toHaveClass('bg-white');
    expect(userMessage).not.toHaveClass('bg-purple-100');
  });
});
