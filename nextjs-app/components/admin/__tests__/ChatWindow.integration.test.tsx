/**
 * Интеграционные тесты WebSocket для ChatWindow.tsx
 * Feature: bot-messages-tracking
 * Requirements: 5.1, 5.2, 5.4, 5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatWindow } from '../ChatWindow';
import type { SupportSession, SupportMessage } from '@/types/support';

describe('ChatWindow - WebSocket Integration Tests', () => {
  const mockSession: SupportSession = {
    id: 1,
    telegram_id: 123456789,
    session_type: 'chat',
    status: 'active',
    created_at: '2024-01-01T10:00:00Z',
    last_activity: '2024-01-01T10:00:00Z',
    closed_at: null,
  };

  const initialMessages: SupportMessage[] = [
    {
      id: 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_user',
      message_text: 'Привет!',
      created_at: '2024-01-01T10:00:00Z',
      delivered: false,
      media_type: 'text',
      file_path: null,
      caption: null,
      file_size: null,
    },
  ];

  let mockSubscriptionCallback: ((message: any) => void) | null = null;
  let mockUnsubscribe: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionCallback = null;
    mockUnsubscribe = vi.fn();

    // Мокируем getRealtimeClient с возможностью вызова callback
    vi.mock('@/lib/database/realtimeClient', () => ({
      getRealtimeClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        subscribeToSessionMessages: vi.fn((sessionId, callback, errorCallback) => {
          // Сохраняем callback для последующего вызова
          mockSubscriptionCallback = callback;
          return mockUnsubscribe;
        }),
      })),
    }));

    // Мокируем fetch API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: initialMessages,
        total: initialMessages.length,
        has_more: false,
        session: mockSession,
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Тест 1: Получение нового сообщения бота через WebSocket
   * Requirements: 5.1, 5.2
   */
  it('должен получать новое сообщение бота через WebSocket и отображать его', async () => {
    // Динамически импортируем мок
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем, что начальное сообщение отображается
    expect(screen.getByText('Привет!')).toBeInTheDocument();

    // Проверяем, что подписка была создана
    expect(getRealtimeClient).toHaveBeenCalled();

    // Симулируем получение нового сообщения бота через WebSocket
    const newBotMessage = {
      type: 'new_message',
      data: {
        id: 2,
        session_id: 1,
        sender_type: 'bot',
        message_text: 'Привет! Я бот.',
        created_at: '2024-01-01T10:00:01Z',
        is_read: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      },
    };

    // Вызываем callback подписки
    if (mockSubscriptionCallback) {
      mockSubscriptionCallback(newBotMessage);
    }

    // Ждём, пока новое сообщение появится в DOM
    await waitFor(() => {
      expect(screen.getByText('Привет! Я бот.')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что сообщение бота отображается с правильным стилем
    const botMessage = screen.getByText('Привет! Я бот.');
    const botMessageBubble = botMessage.closest('div.rounded-2xl');
    expect(botMessageBubble).toHaveClass('bg-purple-100');
  });

  /**
   * Тест 2: Автоматическое добавление в список сообщений
   * Requirements: 5.4
   */
  it('должен автоматически добавлять новое сообщение бота в конец списка', async () => {
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Симулируем получение нового сообщения бота
    const newBotMessage = {
      type: 'new_message',
      data: {
        id: 2,
        session_id: 1,
        sender_type: 'bot',
        message_text: 'Новое сообщение бота',
        created_at: '2024-01-01T10:00:01Z',
        is_read: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      },
    };

    if (mockSubscriptionCallback) {
      mockSubscriptionCallback(newBotMessage);
    }

    // Ждём появления нового сообщения
    await waitFor(() => {
      expect(screen.getByText('Новое сообщение бота')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что новое сообщение добавлено в конец списка
    const allMessages = screen.getAllByText(/Привет!|Новое сообщение бота/);
    expect(allMessages).toHaveLength(2);
    
    // Последнее сообщение должно быть новым сообщением бота
    expect(allMessages[allMessages.length - 1]).toHaveTextContent('Новое сообщение бота');
  });

  /**
   * Тест 3: Автоматическая прокрутка к новому сообщению
   * Requirements: 5.5
   */
  it('должен автоматически прокручивать к новому сообщению бота', async () => {
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    // Мокируем scrollIntoView
    const mockScrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = mockScrollIntoView;

    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Сбрасываем счётчик вызовов после начальной загрузки
    mockScrollIntoView.mockClear();

    // Симулируем получение нового сообщения бота
    const newBotMessage = {
      type: 'new_message',
      data: {
        id: 2,
        session_id: 1,
        sender_type: 'bot',
        message_text: 'Автоскролл тест',
        created_at: '2024-01-01T10:00:01Z',
        is_read: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      },
    };

    if (mockSubscriptionCallback) {
      mockSubscriptionCallback(newBotMessage);
    }

    // Ждём появления нового сообщения
    await waitFor(() => {
      expect(screen.getByText('Автоскролл тест')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Ждём вызова scrollIntoView (с учётом setTimeout в 100ms)
    await waitFor(() => {
      expect(mockScrollIntoView).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  /**
   * Тест 4: Обработка нескольких сообщений бота подряд
   * Requirements: 5.1, 5.2, 5.4
   */
  it('должен корректно обрабатывать несколько сообщений бота подряд', async () => {
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Симулируем получение нескольких сообщений бота
    const botMessages = [
      {
        type: 'new_message',
        data: {
          id: 2,
          session_id: 1,
          sender_type: 'bot',
          message_text: 'Первое сообщение бота',
          created_at: '2024-01-01T10:00:01Z',
          is_read: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      },
      {
        type: 'new_message',
        data: {
          id: 3,
          session_id: 1,
          sender_type: 'bot',
          message_text: 'Второе сообщение бота',
          created_at: '2024-01-01T10:00:02Z',
          is_read: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      },
      {
        type: 'new_message',
        data: {
          id: 4,
          session_id: 1,
          sender_type: 'bot',
          message_text: 'Третье сообщение бота',
          created_at: '2024-01-01T10:00:03Z',
          is_read: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      },
    ];

    // Отправляем сообщения последовательно
    for (const message of botMessages) {
      if (mockSubscriptionCallback) {
        mockSubscriptionCallback(message);
      }
      // Небольшая задержка между сообщениями
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Ждём появления всех сообщений
    await waitFor(() => {
      expect(screen.getByText('Первое сообщение бота')).toBeInTheDocument();
      expect(screen.getByText('Второе сообщение бота')).toBeInTheDocument();
      expect(screen.getByText('Третье сообщение бота')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что все сообщения имеют правильный стиль
    const botMessageElements = [
      screen.getByText('Первое сообщение бота'),
      screen.getByText('Второе сообщение бота'),
      screen.getByText('Третье сообщение бота'),
    ];

    botMessageElements.forEach(element => {
      const bubble = element.closest('div.rounded-2xl');
      expect(bubble).toHaveClass('bg-purple-100');
    });
  });

  /**
   * Тест 5: Предотвращение дублирования сообщений
   * Requirements: 5.2
   */
  it('не должен дублировать сообщения при повторной отправке через WebSocket', async () => {
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Симулируем получение сообщения бота
    const botMessage = {
      type: 'new_message',
      data: {
        id: 2,
        session_id: 1,
        sender_type: 'bot',
        message_text: 'Уникальное сообщение',
        created_at: '2024-01-01T10:00:01Z',
        is_read: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      },
    };

    // Отправляем сообщение первый раз
    if (mockSubscriptionCallback) {
      mockSubscriptionCallback(botMessage);
    }

    // Ждём появления сообщения
    await waitFor(() => {
      expect(screen.getByText('Уникальное сообщение')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Отправляем то же сообщение повторно (симуляция дублирования)
    if (mockSubscriptionCallback) {
      mockSubscriptionCallback(botMessage);
    }

    // Ждём немного
    await new Promise(resolve => setTimeout(resolve, 200));

    // Проверяем, что сообщение отображается только один раз
    const messages = screen.getAllByText('Уникальное сообщение');
    expect(messages).toHaveLength(1);
  });

  /**
   * Тест 6: Отписка от WebSocket при размонтировании компонента
   * Requirements: 5.1
   */
  it('должен отписаться от WebSocket при размонтировании компонента', async () => {
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    const { unmount } = render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Размонтируем компонент
    unmount();

    // Проверяем, что функция отписки была вызвана
    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  /**
   * Тест 7: Обработка сообщений с разными sender_type
   * Requirements: 5.3
   */
  it('должен корректно обрабатывать сообщения с sender_type="bot"', async () => {
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    
    render(<ChatWindow session={mockSession} />);

    // Ждём загрузки начальных сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Симулируем получение сообщения с sender_type="bot"
    const botMessage = {
      type: 'new_message',
      data: {
        id: 2,
        session_id: 1,
        sender_type: 'bot', // Важно: sender_type должен быть 'bot'
        message_text: 'Сообщение с sender_type=bot',
        created_at: '2024-01-01T10:00:01Z',
        is_read: false,
        media_type: 'text',
        file_path: null,
        caption: null,
        file_size: null,
      },
    };

    if (mockSubscriptionCallback) {
      mockSubscriptionCallback(botMessage);
    }

    // Ждём появления сообщения
    await waitFor(() => {
      expect(screen.getByText('Сообщение с sender_type=bot')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Проверяем, что сообщение отображается как сообщение бота
    const message = screen.getByText('Сообщение с sender_type=bot');
    const messageBubble = message.closest('div.rounded-2xl');
    expect(messageBubble).toHaveClass('bg-purple-100');

    // Проверяем наличие метки "🤖 Бот"
    expect(screen.getByText('🤖 Бот')).toBeInTheDocument();
  });
});
