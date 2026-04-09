/**
 * Integration тесты для ChatWindow с ResetStateButton
 * Проверяет интеграцию кнопки сброса состояния в ChatWindow
 * Requirements: 1.1, 1.2, 6.4, 11.3
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChatWindow } from '../ChatWindow';
import type { SupportSession } from '@/types/support';

// Мокаем fetch для API запросов
global.fetch = vi.fn();

// Мокаем getRealtimeClient
vi.mock('@/lib/database/realtimeClient', () => ({
  getRealtimeClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    subscribeToSessionMessages: vi.fn(() => vi.fn()),
  })),
}));

describe('ChatWindow Integration - ResetStateButton', () => {
  const mockSession: SupportSession = {
    id: 1,
    telegram_id: 123456789,
    status: 'active',
    session_type: 'support',
    created_at: '2024-01-01T00:00:00Z',
    closed_at: null,
    last_activity: '2024-01-01T00:00:00Z',
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Мокаем fetch для загрузки сообщений
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/support/sessions/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [],
            total: 0,
            has_more: false,
            session: mockSession,
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  /**
   * Requirement 1.1: Отображение кнопки в ChatWindow для активной сессии
   */
  it('должен отображать кнопку сброса состояния для активной сессии с правами администратора', async () => {
    // Arrange & Act
    render(<ChatWindow session={mockSession} userRole={2} />);

    // Assert - ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем наличие кнопки
    const resetButton = screen.getByRole('button', { name: /вызвать главное меню/i });
    expect(resetButton).toBeInTheDocument();
  });

  /**
   * Requirement 1.1: Отображение кнопки в ChatWindow для активной сессии с правами оператора
   */
  it('должен отображать кнопку сброса состояния для активной сессии с правами оператора', async () => {
    // Arrange & Act
    render(<ChatWindow session={mockSession} userRole={3} />);

    // Assert - ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем наличие кнопки
    const resetButton = screen.getByRole('button', { name: /сбросить состояние/i });
    expect(resetButton).toBeInTheDocument();
  });

  /**
   * Requirement 1.2: Скрытие кнопки для закрытой сессии
   */
  it('не должен отображать кнопку сброса состояния для закрытой сессии', async () => {
    // Arrange
    const closedSession: SupportSession = {
      ...mockSession,
      status: 'closed',
      closed_at: '2024-01-02T00:00:00Z',
    };

    // Act
    render(<ChatWindow session={closedSession} userRole={2} />);

    // Assert - ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем отсутствие кнопки
    expect(screen.queryByRole('button', { name: /вызвать главное меню/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сбросить состояние/i })).not.toBeInTheDocument();
  });

  /**
   * Requirement 1.2: Скрытие кнопки для пользователей без прав
   */
  it('не должен отображать кнопку сброса состояния для пользователей без прав', async () => {
    // Arrange & Act
    render(<ChatWindow session={mockSession} userRole={0} />);

    // Assert - ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем отсутствие кнопки
    expect(screen.queryByRole('button', { name: /вызвать главное меню/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сбросить состояние/i })).not.toBeInTheDocument();
  });

  /**
   * Requirement 1.2: Скрытие кнопки когда userRole не передан
   */
  it('не должен отображать кнопку сброса состояния когда userRole не передан', async () => {
    // Arrange & Act
    render(<ChatWindow session={mockSession} />);

    // Assert - ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем отсутствие кнопки
    expect(screen.queryByRole('button', { name: /вызвать главное меню/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сбросить состояние/i })).not.toBeInTheDocument();
  });

  /**
   * Requirement 6.4: Взаимодействие - нажатие кнопки и отображение уведомления
   */
  it('должен отображать уведомление об успехе после нажатия кнопки', async () => {
    // Arrange
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/support/sessions/1/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [],
            total: 0,
            has_more: false,
            session: mockSession,
          }),
        });
      }
      if (url.includes('/api/support/sessions/1/reset-state')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            message: 'Состояние пользователя успешно сброшено',
            session_id: 1,
            telegram_id: 123456789,
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<ChatWindow session={mockSession} userRole={2} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Act - нажимаем кнопку
    const resetButton = screen.getByRole('button', { name: /вызвать главное меню/i });
    fireEvent.click(resetButton);

    // Assert - проверяем отображение уведомления об успехе
    await waitFor(() => {
      expect(screen.getByText(/состояние пользователя успешно сброшено/i)).toBeInTheDocument();
    });
  });

  /**
   * Requirement 6.4: Взаимодействие - отображение ошибки при неудаче
   */
  it('должен отображать сообщение об ошибке при неудачном сбросе состояния', async () => {
    // Arrange
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/support/sessions/1/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [],
            total: 0,
            has_more: false,
            session: mockSession,
          }),
        });
      }
      if (url.includes('/api/support/sessions/1/reset-state')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({
            error: 'Bot unavailable',
            message: 'Бот временно недоступен',
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<ChatWindow session={mockSession} userRole={2} />);

    // Ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Act - нажимаем кнопку
    const resetButton = screen.getByRole('button', { name: /вызвать главное меню/i });
    fireEvent.click(resetButton);

    // Assert - проверяем отображение ошибки (используем getAllByText, так как ошибка может быть в двух местах)
    await waitFor(() => {
      const errorElements = screen.getAllByText(/бот временно недоступен/i);
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  /**
   * Requirement 11.3: Обновление истории сообщений через WebSocket после сброса
   * 
   * Примечание: Полная проверка WebSocket обновлений требует более сложной настройки моков.
   * Этот тест проверяет, что компонент корректно подписывается на WebSocket события.
   */
  it('должен подписаться на WebSocket обновления для получения новых сообщений', async () => {
    // Arrange
    const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
    const mockSubscribe = vi.fn(() => vi.fn());
    const mockConnect = vi.fn().mockResolvedValue(undefined);

    vi.mocked(getRealtimeClient).mockReturnValue({
      connect: mockConnect,
      subscribeToSessionMessages: mockSubscribe,
    } as any);

    // Act
    render(<ChatWindow session={mockSession} userRole={2} />);

    // Assert - ждём загрузки сообщений
    await waitFor(() => {
      expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
    });

    // Проверяем, что подписка на WebSocket была создана
    expect(mockConnect).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalledWith(
      mockSession.id,
      expect.any(Function),
      expect.any(Function)
    );
  });
});
