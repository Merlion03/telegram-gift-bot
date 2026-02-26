/**
 * Unit-тесты для SessionList компонента
 * Validates: Requirements 7.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionList } from '../SessionList';
import type { SupportSession } from '@/types/support';

// Mock fetch
global.fetch = vi.fn();

describe('SessionList', () => {
  const mockOnSelectSession = vi.fn();

  // Тестовые данные
  const mockSessions: SupportSession[] = [
    {
      id: 1,
      telegram_id: 123456789,
      status: 'active',
      created_at: '2024-01-15T10:30:00Z',
      unread_count: 3,
      last_message: 'Помогите с заказом',
      last_message_at: '2024-01-15T10:35:00Z',
    },
    {
      id: 2,
      telegram_id: 987654321,
      status: 'active',
      created_at: '2024-01-15T11:00:00Z',
      unread_count: 0,
      last_message: 'Спасибо за помощь',
      last_message_at: '2024-01-15T11:05:00Z',
    },
    {
      id: 3,
      telegram_id: 555555555,
      status: 'active',
      created_at: '2024-01-15T11:30:00Z',
      unread_count: 1,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Тест: отображение активных сессий при загрузке
   * Requirements: 7.4
   */
  it('должен отображать список активных сессий при загрузке', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: mockSessions }),
    });

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    // Assert: ждём загрузки
    await waitFor(() => {
      expect(screen.getByText('Пользователь: 123456789')).toBeInTheDocument();
    });

    expect(screen.getByText('Пользователь: 987654321')).toBeInTheDocument();
    expect(screen.getByText('Пользователь: 555555555')).toBeInTheDocument();
    expect(screen.getByText('Помогите с заказом')).toBeInTheDocument();
    expect(screen.getByText('Спасибо за помощь')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('должен отображать сообщение о пустом списке, если нет активных сессий', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Нет активных сессий')).toBeInTheDocument();
    });
  });

  it('должен отображать ошибку при неудачной загрузке', async () => {
    // Arrange
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/Ошибка: Network error/i)).toBeInTheDocument();
    });
  });

  it('должен отображать ошибку при HTTP ошибке', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();
    });
  });

  it('должен вызывать onSelectSession при клике на сессию', async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: mockSessions }),
    });

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    await waitFor(() => {
      expect(screen.getByText('Пользователь: 123456789')).toBeInTheDocument();
    });

    const firstSession = screen.getByText('Пользователь: 123456789').closest('button');
    await user.click(firstSession!);

    // Assert
    expect(mockOnSelectSession).toHaveBeenCalledWith(mockSessions[0]);
    expect(mockOnSelectSession).toHaveBeenCalledTimes(1);
  });

  it('должен выделять выбранную сессию', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: mockSessions }),
    });

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} selectedSessionId={1} />);

    await waitFor(() => {
      expect(screen.getByText('Пользователь: 123456789')).toBeInTheDocument();
    });

    // Assert
    const selectedSession = screen.getByText('Пользователь: 123456789').closest('button');
    expect(selectedSession).toHaveClass('bg-blue-50');
  });

  it('не должен отображать счётчик непрочитанных, если unread_count = 0', async () => {
    // Arrange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: [mockSessions[1]] }),
    });

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Пользователь: 987654321')).toBeInTheDocument();
    });

    // Счётчик не должен отображаться
    const badges = screen.queryByText('0');
    expect(badges).not.toBeInTheDocument();
  });

  it('должен отображать кнопку повтора при ошибке', async () => {
    // Arrange: первая попытка с ошибкой
    const user = userEvent.setup();
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    // Act
    render(<SessionList onSelectSession={mockOnSelectSession} />);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка: Network error/i)).toBeInTheDocument();
    });

    // Arrange: вторая попытка успешная
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: mockSessions }),
    });

    // Act: кликаем на кнопку повтора
    const retryButton = screen.getByText('Попробовать снова');
    await user.click(retryButton);

    // Assert: данные должны загрузиться
    await waitFor(() => {
      expect(screen.getByText('Пользователь: 123456789')).toBeInTheDocument();
    });
  });
});
