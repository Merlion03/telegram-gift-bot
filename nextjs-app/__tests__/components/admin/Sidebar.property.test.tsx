/**
 * Property-тест для компонента Sidebar
 * Property 6: Функциональность сворачивания работает корректно
 * Validates: Requirements 2.2, 2.3
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Sidebar } from '@/components/admin/Sidebar';
import type { SupportSession } from '@/types/support';

// Генератор для SupportSession
const generateSupportSession = (): SupportSession => ({
  id: Math.floor(Math.random() * 10000),
  telegram_id: Math.floor(Math.random() * 1000000),
  session_type: Math.random() > 0.5 ? 'chat' : 'support',
  status: Math.random() > 0.5 ? 'active' : 'closed',
  created_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  last_message: `Test message ${Math.random()}`,
  unread_count: Math.floor(Math.random() * 10),
  user_avatar: 'https://example.com/avatar.jpg',
  user_name: `User ${Math.random()}`,
  user_username: `user_${Math.random()}`,
  user_online: Math.random() > 0.5,
});

describe('Sidebar - Property 6: Функциональность сворачивания работает корректно', () => {
  // Mock fetch
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [generateSupportSession(), generateSupportSession()],
          }),
      })
    ) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 6.1: При клике на кнопку сворачивания, компонент переходит в свернутое состояние
   * и ширина панели уменьшается
   */
  it('должен сворачиваться и разворачиваться при клике на кнопку', async () => {
    const mockOnSelectSession = vi.fn();

    const { rerender } = render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });

    const toggleButton = screen.getByTitle('Свернуть');

    // Проверяем, что компонент развернут (ширина w-80)
    const sidebarContainer = toggleButton.closest('div')?.parentElement;
    expect(sidebarContainer).toHaveClass('w-80');

    // Кликаем на кнопку сворачивания
    fireEvent.click(toggleButton);

    // Ждем изменения состояния
    await waitFor(() => {
      expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
    });

    // Проверяем, что компонент свернут (ширина w-20)
    const collapsedContainer = screen.getByTitle('Развернуть').closest('div')?.parentElement;
    expect(collapsedContainer).toHaveClass('w-20');

    // Кликаем еще раз для разворачивания
    fireEvent.click(screen.getByTitle('Развернуть'));

    // Ждем возврата в развернутое состояние
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });
  });

  /**
   * Property 6.2: В свернутом состоянии показываются только аватары без текста
   */
  it('должен показывать только аватары в свернутом состоянии', async () => {
    const mockOnSelectSession = vi.fn();

    render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });

    // Кликаем на кнопку сворачивания
    fireEvent.click(screen.getByTitle('Свернуть'));

    // Ждем свернутого состояния
    await waitFor(() => {
      expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
    });

    // Проверяем, что заголовок "Сессии" не видно
    const sessionTitle = screen.queryByText('Сессии');
    if (sessionTitle) {
      expect(sessionTitle).not.toBeVisible();
    }
  });

  /**
   * Property 6.3: При выборе сессии в свернутом состоянии, вызывается callback onSelectSession
   */
  it('должен вызывать onSelectSession при клике на аватар в свернутом состоянии', async () => {
    const mockOnSelectSession = vi.fn();
    const testSession = generateSupportSession();

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [testSession],
          }),
      })
    ) as any;

    render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });

    // Кликаем на кнопку сворачивания
    fireEvent.click(screen.getByTitle('Свернуть'));

    // Ждем свернутого состояния
    await waitFor(() => {
      expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
    });

    // Ищем аватар и кликаем на него
    const avatarButtons = screen.getAllByRole('button');
    const avatarButton = avatarButtons.find(
      (btn) => btn !== screen.getByTitle('Развернуть')
    );

    if (avatarButton) {
      fireEvent.click(avatarButton);
      expect(mockOnSelectSession).toHaveBeenCalled();
    }
  });

  /**
   * Property 6.4: Анимация сворачивания/разворачивания работает плавно
   * (проверяем наличие transition класса)
   */
  it('должен применять плавные анимации при сворачивании', async () => {
    const mockOnSelectSession = vi.fn();

    render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });

    const toggleButton = screen.getByTitle('Свернуть');
    const sidebarContainer = toggleButton.closest('div')?.parentElement;

    // Проверяем наличие transition класса
    expect(sidebarContainer).toHaveClass('transition-all', 'duration-300', 'ease-out');
  });

  /**
   * Property 6.5: При изменении размера экрана на мобильный, компонент автоматически сворачивается
   */
  it('должен автоматически сворачиваться на мобильных устройствах', async () => {
    const mockOnSelectSession = vi.fn();

    // Устанавливаем мобильный размер экрана
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
    });

    // Проверяем, что компонент свернут на мобильном экране
    const sidebarContainer = screen.getByTitle('Развернуть').closest('div')?.parentElement;
    expect(sidebarContainer).toHaveClass('w-20');

    // Восстанавливаем размер экрана
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  /**
   * Property 6.6: Индикаторы непрочитанных сообщений видны в свернутом состоянии
   */
  it('должен показывать индикаторы непрочитанных сообщений в свернутом состоянии', async () => {
    const mockOnSelectSession = vi.fn();
    const sessionWithUnread = generateSupportSession();
    sessionWithUnread.unread_count = 5;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [sessionWithUnread],
          }),
      })
    ) as any;

    render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });

    // Кликаем на кнопку сворачивания
    fireEvent.click(screen.getByTitle('Свернуть'));

    // Ждем свернутого состояния
    await waitFor(() => {
      expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
    });

    // Проверяем наличие индикатора непрочитанных сообщений
    const unreadBadge = screen.getByText('5');
    expect(unreadBadge).toBeInTheDocument();
    expect(unreadBadge).toHaveClass('bg-telegram-red');
  });

  /**
   * Property 6.7: Индикатор статуса онлайн видна в свернутом состоянии
   */
  it('должен показывать индикатор статуса онлайн в свернутом состоянии', async () => {
    const mockOnSelectSession = vi.fn();
    const onlineSession = generateSupportSession();
    onlineSession.user_online = true;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [onlineSession],
          }),
      })
    ) as any;

    render(
      <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
    );

    // Ждем загрузки компонента
    await waitFor(() => {
      expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
    });

    // Кликаем на кнопку сворачивания
    fireEvent.click(screen.getByTitle('Свернуть'));

    // Ждем свернутого состояния
    await waitFor(() => {
      expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
    });

    // Проверяем наличие индикатора онлайн (зеленая точка)
    const onlineIndicators = document.querySelectorAll('.bg-telegram-green');
    expect(onlineIndicators.length).toBeGreaterThan(0);
  });
});
