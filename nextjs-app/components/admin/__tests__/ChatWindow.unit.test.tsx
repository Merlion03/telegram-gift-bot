/**
 * Unit-тесты для ChatWindow компонента
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatWindow } from '../ChatWindow';
import type { SupportSession, SupportMessage } from '@/types/support';

// Mock Supabase client
vi.mock('@/lib/database/supabaseClient', () => ({
  getSupabaseClient: () => ({
    subscribeToSessionMessages: vi.fn(() => vi.fn()),
  }),
}));

// Mock fetch
global.fetch = vi.fn();

describe('ChatWindow', () => {
  // Тестовые данные для Chat_Session
  const mockChatSession: SupportSession = {
    id: 1,
    telegram_id: 123456789,
    status: 'active',
    session_type: 'chat',
    created_at: '2024-01-15T10:30:00Z',
  };

  // Тестовые данные для Support_Session
  const mockSupportSession: SupportSession = {
    id: 2,
    telegram_id: 987654321,
    status: 'active',
    session_type: 'support',
    created_at: '2024-01-15T11:00:00Z',
  };

  // Тестовые сообщения с разными типами
  const mockMessages: SupportMessage[] = [
    {
      id: 1,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_user',
      message_text: 'Привет, у меня вопрос',
      created_at: '2024-01-15T10:31:00Z',
      delivered: true,
    },
    {
      id: 2,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_bot',
      message_text: 'Здравствуйте! Чем могу помочь?',
      created_at: '2024-01-15T10:31:30Z',
      delivered: true,
    },
    {
      id: 3,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_user',
      message_text: 'Как оформить заказ?',
      created_at: '2024-01-15T10:32:00Z',
      delivered: true,
    },
  ];

  const mockMessagesWithSupport: SupportMessage[] = [
    ...mockMessages,
    {
      id: 4,
      session_id: 1,
      telegram_id: 123456789,
      message_type: 'from_support',
      message_text: 'Сейчас помогу вам с оформлением',
      created_at: '2024-01-15T10:33:00Z',
      delivered: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Тест: отображение кнопки подключения для Chat_Session
   * Requirements: 4.1
   */
  it('должен отображать кнопку "Подключиться к диалогу" для активной Chat_Session', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    // Act
    render(<ChatWindow session={mockChatSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Подключиться к диалогу')).toBeInTheDocument();
    });

    // Проверяем, что кнопка активна
    const connectButton = screen.getByText('Подключиться к диалогу');
    expect(connectButton).not.toBeDisabled();
  });

  /**
   * Тест: отсутствие кнопки подключения для Support_Session
   * Requirements: 4.1
   */
  it('не должен отображать кнопку подключения для Support_Session', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessagesWithSupport,
        session: mockSupportSession,
      }),
    });

    // Act
    render(<ChatWindow session={mockSupportSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Поддержка')).toBeInTheDocument();
    });

    expect(screen.queryByText('Подключиться к диалогу')).not.toBeInTheDocument();
  });

  /**
   * Тест: отправка первого сообщения админа в Chat_Session
   * Requirements: 4.2, 4.3
   */
  it('должен отправлять первое сообщение админа и автоматически преобразовывать Chat_Session в Support_Session', async () => {
    // Arrange
    const user = userEvent.setup();

    // Первая загрузка - Chat_Session с сообщениями
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    render(<ChatWindow session={mockChatSession} />);

    await waitFor(() => {
      expect(screen.getByText('Привет, у меня вопрос')).toBeInTheDocument();
    });

    // Вторая загрузка - отправка сообщения с автоматическим преобразованием
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: {
          id: 4,
          session_id: 1,
          telegram_id: 123456789,
          message_type: 'from_support',
          message_text: 'Здравствуйте! Чем могу помочь?',
          created_at: '2024-01-15T10:33:00Z',
          delivered: true,
        },
        session: {
          ...mockChatSession,
          session_type: 'support',
        },
      }),
    });

    // Act: вводим и отправляем сообщение
    const input = screen.getByPlaceholderText('Введите сообщение...');
    await user.type(input, 'Здравствуйте! Чем могу помочь?');

    const sendButton = screen.getByText('Отправить');
    await user.click(sendButton);

    // Assert
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/support/sessions/1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message_text: 'Здравствуйте! Чем могу помочь?',
          }),
        })
      );
    });

    // Проверяем, что тип сессии обновился
    await waitFor(() => {
      expect(screen.getByText('Поддержка')).toBeInTheDocument();
    });
  });

  /**
   * Тест: отображение разных типов сообщений
   * Requirements: 4.1
   */
  it('должен отображать сообщения от пользователя, бота и поддержки с разными стилями', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessagesWithSupport,
        session: mockSupportSession,
      }),
    });

    // Act
    render(<ChatWindow session={mockSupportSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Привет, у меня вопрос')).toBeInTheDocument();
    });

    // Проверяем наличие всех типов сообщений
    expect(screen.getByText('Здравствуйте! Чем могу помочь?')).toBeInTheDocument();
    expect(screen.getByText('Как оформить заказ?')).toBeInTheDocument();
    expect(screen.getByText('Сейчас помогу вам с оформлением')).toBeInTheDocument();

    // Проверяем наличие метки бота
    expect(screen.getByText('🤖 Бот')).toBeInTheDocument();
  });

  /**
   * Тест: подключение к диалогу через кнопку
   * Requirements: 4.1, 4.3
   */
  it('должен подключаться к Chat_Session при клике на кнопку "Подключиться к диалогу"', async () => {
    // Arrange
    const user = userEvent.setup();

    // Первая загрузка - Chat_Session
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    render(<ChatWindow session={mockChatSession} />);

    await waitFor(() => {
      expect(screen.getByText('Подключиться к диалогу')).toBeInTheDocument();
    });

    // Вторая загрузка - преобразование сессии
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        session: {
          ...mockChatSession,
          session_type: 'support',
        },
      }),
    });

    // Третья загрузка - перезагрузка сообщений
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: {
          ...mockChatSession,
          session_type: 'support',
        },
      }),
    });

    // Act: кликаем на кнопку подключения
    const connectButton = screen.getByText('Подключиться к диалогу');
    await user.click(connectButton);

    // Assert
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/support/sessions/1/convert',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    // Проверяем, что тип сессии обновился
    await waitFor(() => {
      expect(screen.getByText('Поддержка')).toBeInTheDocument();
    });

    // Кнопка подключения должна исчезнуть
    expect(screen.queryByText('Подключиться к диалогу')).not.toBeInTheDocument();
  });

  /**
   * Тест: обработка ошибки при отправке сообщения
   * Requirements: 4.2
   */
  it('должен отображать ошибку при неудачной отправке сообщения', async () => {
    // Arrange
    const user = userEvent.setup();

    // Первая загрузка - успешная
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    render(<ChatWindow session={mockChatSession} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Введите сообщение...')).toBeInTheDocument();
    });

    // Вторая загрузка - ошибка отправки
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error',
        message: 'Не удалось отправить сообщение',
      }),
    });

    // Act: вводим и отправляем сообщение
    const input = screen.getByPlaceholderText('Введите сообщение...');
    await user.type(input, 'Тестовое сообщение');

    const sendButton = screen.getByText('Отправить');
    await user.click(sendButton);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/Internal server error/)).toBeInTheDocument();
    });
  });

  /**
   * Тест: обработка ошибки при подключении к диалогу
   * Requirements: 4.1
   */
  it('должен отображать ошибку при неудачном подключении к диалогу', async () => {
    // Arrange
    const user = userEvent.setup();

    // Первая загрузка - успешная
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    render(<ChatWindow session={mockChatSession} />);

    await waitFor(() => {
      expect(screen.getByText('Подключиться к диалогу')).toBeInTheDocument();
    });

    // Вторая загрузка - ошибка подключения
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error',
        message: 'Не удалось подключиться к диалогу',
      }),
    });

    // Act: кликаем на кнопку подключения
    const connectButton = screen.getByText('Подключиться к диалогу');
    await user.click(connectButton);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/Internal server error/)).toBeInTheDocument();
    });
  });

  /**
   * Тест: индикатор типа сессии в заголовке
   * Requirements: 4.1
   */
  it('должен отображать индикатор типа сессии в заголовке', async () => {
    // Arrange - Chat_Session
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    const { unmount } = render(<ChatWindow session={mockChatSession} />);

    // Assert - Chat_Session
    await waitFor(() => {
      expect(screen.getByText('Обычный диалог')).toBeInTheDocument();
    });

    // Размонтируем компонент перед следующим рендером
    unmount();

    // Arrange - Support_Session
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessagesWithSupport,
        session: mockSupportSession,
      }),
    });

    render(<ChatWindow session={mockSupportSession} />);

    // Assert - Support_Session
    await waitFor(() => {
      expect(screen.getByText('Поддержка')).toBeInTheDocument();
    });
  });

  /**
   * Тест: отображение состояния загрузки
   */
  it('должен отображать индикатор загрузки при загрузке сообщений', async () => {
    // Arrange
    let resolvePromise: any;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    (global.fetch as any).mockReturnValueOnce(promise);

    // Act
    render(<ChatWindow session={mockChatSession} />);

    // Assert
    expect(screen.getByText('Загрузка сообщений...')).toBeInTheDocument();

    // Завершаем загрузку
    resolvePromise({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });
  });

  /**
   * Тест: отключение отправки для закрытой сессии
   */
  it('не должен позволять отправлять сообщения в закрытую сессию', async () => {
    // Arrange
    const closedSession: SupportSession = {
      ...mockChatSession,
      status: 'closed',
      closed_at: '2024-01-15T12:00:00Z',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: closedSession,
      }),
    });

    // Act
    render(<ChatWindow session={closedSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Сессия завершена. Отправка сообщений недоступна.')).toBeInTheDocument();
    });

    // Форма отправки не должна отображаться
    expect(screen.queryByPlaceholderText('Введите сообщение...')).not.toBeInTheDocument();
  });

  /**
   * Тест: очистка поля ввода после отправки
   */
  it('должен очищать поле ввода после успешной отправки сообщения', async () => {
    // Arrange
    const user = userEvent.setup();

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        session: mockChatSession,
      }),
    });

    render(<ChatWindow session={mockChatSession} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Введите сообщение...')).toBeInTheDocument();
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: {
          id: 4,
          session_id: 1,
          telegram_id: 123456789,
          message_type: 'from_support',
          message_text: 'Тестовое сообщение',
          created_at: '2024-01-15T10:33:00Z',
          delivered: true,
        },
      }),
    });

    // Act
    const input = screen.getByPlaceholderText('Введите сообщение...') as HTMLInputElement;
    await user.type(input, 'Тестовое сообщение');
    
    expect(input.value).toBe('Тестовое сообщение');

    const sendButton = screen.getByText('Отправить');
    await user.click(sendButton);

    // Assert
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  /**
   * Тест: отображение пустого состояния
   */
  it('должен отображать сообщение о пустом списке, если нет сообщений', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messages: [],
        session: mockChatSession,
      }),
    });

    // Act
    render(<ChatWindow session={mockChatSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Нет сообщений')).toBeInTheDocument();
    });

    expect(screen.getByText('Сообщения появятся здесь, когда пользователь напишет')).toBeInTheDocument();
  });
});
