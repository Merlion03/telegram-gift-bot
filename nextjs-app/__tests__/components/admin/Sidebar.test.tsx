/**
 * Unit-тесты для компонента Sidebar
 * Тестирует новый дизайн, анимации и функциональность сворачивания
 * Requirements: 2.1, 2.2, 2.4, 2.7
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Sidebar } from '@/components/admin/Sidebar';
import type { SupportSession } from '@/types/support';

// Генератор тестовой сессии
const createTestSession = (overrides?: Partial<SupportSession>): SupportSession => ({
  id: 1,
  telegram_id: 123456,
  session_type: 'chat',
  status: 'active',
  created_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  last_message: 'Test message',
  unread_count: 2,
  user_name: 'Test User',
  user_username: 'testuser',
  user_online: true,
  ...overrides,
});

describe('Sidebar - Unit Tests', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [createTestSession()],
          }),
      })
    ) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Дизайн и стили', () => {
    it('должен применять telegram-дизайн стили', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const sidebarContainer = screen.getByTitle('Свернуть').closest('div')?.parentElement;
      expect(sidebarContainer).toHaveClass('border-r', 'border-telegram-border');
    });

    it('должен использовать правильные цвета для кнопки сворачивания', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTitle('Свернуть');
      const icon = toggleButton.querySelector('svg');
      expect(icon).toHaveClass('text-telegram-blue');
    });
  });

  describe('Функциональность сворачивания', () => {
    it('должен отображать полный список в развернутом состоянии', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const sidebarContainer = screen.getByTitle('Свернуть').closest('div')?.parentElement;
      expect(sidebarContainer).toHaveClass('w-80');
    });

    it('должен сворачиваться при клике на кнопку', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Свернуть'));

      await waitFor(() => {
        expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
      });

      const sidebarContainer = screen.getByTitle('Развернуть').closest('div')?.parentElement;
      expect(sidebarContainer).toHaveClass('w-20');
    });

    it('должен разворачиваться при повторном клике', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      // Сворачиваем
      fireEvent.click(screen.getByTitle('Свернуть'));

      await waitFor(() => {
        expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
      });

      // Разворачиваем
      fireEvent.click(screen.getByTitle('Развернуть'));

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const sidebarContainer = screen.getByTitle('Свернуть').closest('div')?.parentElement;
      expect(sidebarContainer).toHaveClass('w-80');
    });
  });

  describe('Анимации', () => {
    it('должен применять transition классы для плавной анимации', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const sidebarContainer = screen.getByTitle('Свернуть').closest('div')?.parentElement;
      expect(sidebarContainer).toHaveClass('transition-all', 'duration-300', 'ease-out');
    });

    it('должен применять hover эффект на кнопку сворачивания', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const toggleButton = screen.getByTitle('Свернуть');
      expect(toggleButton).toHaveClass('hover:bg-telegram-sidebar');
    });
  });

  describe('Выбор сессии', () => {
    it('должен вызывать onSelectSession при клике на сессию в развернутом состоянии', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession();

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

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      // Ищем кнопку сессии (не кнопку сворачивания)
      const buttons = screen.getAllByRole('button');
      const sessionButton = buttons.find(
        (btn) => btn !== screen.getByTitle('Свернуть')
      );

      if (sessionButton) {
        fireEvent.click(sessionButton);
        expect(mockOnSelectSession).toHaveBeenCalledWith(expect.objectContaining(testSession));
      }
    });

    it('должен вызывать onSelectSession при клике на аватар в свернутом состоянии', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession();

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

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      // Сворачиваем
      fireEvent.click(screen.getByTitle('Свернуть'));

      await waitFor(() => {
        expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
      });

      // Ищем аватар и кликаем
      const buttons = screen.getAllByRole('button');
      const avatarButton = buttons.find(
        (btn) => btn !== screen.getByTitle('Развернуть')
      );

      if (avatarButton) {
        fireEvent.click(avatarButton);
        expect(mockOnSelectSession).toHaveBeenCalled();
      }
    });
  });

  describe('Отображение информации', () => {
    it('должен отображать имя пользователя в развернутом состоянии', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession({ user_name: 'John Doe' });

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

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('должен отображать счетчик непрочитанных сообщений', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession({ unread_count: 5 });

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

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('должен отображать индикатор онлайн статуса', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession({ user_online: true });

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

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      // Проверяем наличие зеленого индикатора
      const onlineIndicators = document.querySelectorAll('.bg-telegram-green');
      expect(onlineIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('Выделение выбранной сессии', () => {
    it('должен выделять выбранную сессию в развернутом состоянии', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession({ id: 1 });

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

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const sessionButton = buttons.find(
        (btn) => btn !== screen.getByTitle('Свернуть')
      );

      if (sessionButton) {
        expect(sessionButton).toHaveClass('bg-telegram-chat', 'border-l-4', 'border-telegram-blue');
      }
    });

    it('должен выделять выбранный аватар в свернутом состоянии', async () => {
      const mockOnSelectSession = vi.fn();
      const testSession = createTestSession({ id: 1 });

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

      await waitFor(() => {
        expect(screen.getByTitle('Свернуть')).toBeInTheDocument();
      });

      // Сворачиваем
      fireEvent.click(screen.getByTitle('Свернуть'));

      await waitFor(() => {
        expect(screen.getByTitle('Развернуть')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const avatarButton = buttons.find(
        (btn) => btn !== screen.getByTitle('Развернуть')
      );

      if (avatarButton) {
        expect(avatarButton).toHaveClass('ring-2', 'ring-telegram-blue');
      }
    });
  });

  describe('Загрузка данных', () => {
    it('должен показывать состояние загрузки', async () => {
      const mockOnSelectSession = vi.fn();

      global.fetch = vi.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () =>
                    Promise.resolve({
                      sessions: [createTestSession()],
                    }),
                } as any),
              100
            )
          )
      ) as any;

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      // Проверяем наличие индикатора загрузки
      expect(screen.getByText('...')).toBeInTheDocument();
    });

    it('должен загружать сессии при монтировании', async () => {
      const mockOnSelectSession = vi.fn();

      render(
        <Sidebar onSelectSession={mockOnSelectSession} selectedSessionId={1} />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/support/sessions')
        );
      });
    });
  });
});
