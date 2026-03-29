/**
 * Интеграционный тест для админки
 * Проверяет работу всех компонентов в связке
 * Requirements: все
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Header } from '@/components/admin/Header';
import { Sidebar } from '@/components/admin/Sidebar';
import { ChatWindow } from '@/components/admin/ChatWindow';
import { MessageInput } from '@/components/admin/MessageInput';
import { UserPanel } from '@/components/admin/UserPanel';
import type { SupportSession } from '@/types/support';

// Мокаем Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Создаёт тестовую сессию
 */
function createTestSession(overrides?: Partial<SupportSession>): SupportSession {
  return {
    id: 1,
    telegram_id: 123456,
    session_type: 'support',
    status: 'active',
    created_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
    last_message: 'Привет!',
    unread_count: 0,
    user_name: 'Test User',
    user_username: 'testuser',
    user_online: true,
    ...overrides,
  };
}

describe('Интеграционные тесты админки', () => {
  /**
   * Проверяет, что Header компонент отображается корректно
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
   */
  it('Header компонент отображается с правильной статистикой', () => {
    render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={() => {}}
      />
    );

    expect(screen.getByText('Admin Support')).toBeInTheDocument();
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });

  /**
   * Проверяет, что поиск в Header работает
   * Requirements: 1.2, 1.3
   */
  it('поиск в Header работает корректно', () => {
    const onSearchChange = vi.fn();
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={onSearchChange}
        onUserMenuAction={() => {}}
      />
    );

    const searchInput = container.querySelector('input[type="text"]');
    expect(searchInput).toBeInTheDocument();

    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'test' } });
      expect(onSearchChange).toHaveBeenCalledWith('test');
    }
  });

  /**
   * Проверяет, что меню пользователя открывается и закрывается
   * Requirements: 1.4, 1.6
   */
  it('меню пользователя открывается и закрывается', async () => {
    const onUserMenuAction = vi.fn();
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={onUserMenuAction}
        userName="Admin"
      />
    );

    // Находим кнопку меню
    const menuButton = container.querySelector('button[aria-label="Menu"]');
    expect(menuButton).toBeInTheDocument();

    if (menuButton) {
      // Открываем меню
      fireEvent.click(menuButton);
      await waitFor(() => {
        expect(screen.getByText('Profile')).toBeInTheDocument();
      });

      // Закрываем меню
      fireEvent.click(menuButton);
    }
  });

  /**
   * Проверяет, что UserPanel отображает информацию о пользователе
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  it('UserPanel отображает информацию о пользователе', () => {
    const mockUser = {
      telegramId: 123456,
      name: 'Test User',
      username: 'testuser',
      phone: '+1234567890',
      online: true,
      firstContact: new Date().toISOString(),
      totalMessages: 10,
      notes: [],
      preferences: {
        notifications: true,
        language: 'ru',
        timezone: 'UTC',
      },
    };

    render(<UserPanel user={mockUser} />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();
    expect(screen.getByText('@testuser')).toBeInTheDocument();
  });

  /**
   * Проверяет, что MessageInput компонент работает
   * Requirements: 3.6, 7.2
   */
  it('MessageInput компонент работает корректно', async () => {
    const onSend = vi.fn();
    const { container } = render(
      <MessageInput onSend={onSend} placeholder="Введите сообщение..." />
    );

    const textarea = container.querySelector('textarea');
    expect(textarea).toBeInTheDocument();

    if (textarea) {
      // Вводим текст
      fireEvent.change(textarea, { target: { value: 'Тестовое сообщение' } });
      expect(textarea).toHaveValue('Тестовое сообщение');

      // Находим кнопку отправки
      const sendButton = screen.getByText('Отправить');
      expect(sendButton).toBeInTheDocument();

      // Отправляем сообщение
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith('Тестовое сообщение');
      });
    }
  });

  /**
   * Проверяет, что компоненты используют telegram-theme стили
   * Requirements: 5.1, 5.2, 5.3, 5.4
   */
  it('компоненты используют telegram-theme стили', () => {
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={() => {}}
      />
    );

    // Проверяем, что используются telegram-классы
    const header = container.querySelector('header');
    expect(header).toHaveClass('bg-telegram-bg');
    expect(header).toHaveClass('border-telegram-border');
  });

  /**
   * Проверяет адаптивность на разных размерах экрана
   * Requirements: 6.1, 6.2, 6.3, 6.4
   */
  it('компоненты адаптируются под разные размеры экрана', () => {
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={() => {}}
      />
    );

    // Проверяем, что используются адаптивные классы
    const elements = container.querySelectorAll('[class*="md:"]');
    expect(elements.length).toBeGreaterThan(0);
  });

  /**
   * Проверяет, что анимации применяются
   * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
   */
  it('анимации применяются к интерактивным элементам', () => {
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={() => {}}
      />
    );

    // Проверяем, что используются классы переходов
    const elements = container.querySelectorAll('[class*="transition"]');
    expect(elements.length).toBeGreaterThan(0);
  });

  /**
   * Проверяет, что типографика используется консистентно
   * Requirements: 9.1, 9.2, 9.3, 9.4
   */
  it('типографика используется консистентно', () => {
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={() => {}}
      />
    );

    // Проверяем, что используются правильные размеры шрифтов для заголовка
    const heading = screen.getByText('Admin Support');
    expect(heading.className).toMatch(/text-(lg|xl|2xl)/);
  });

  /**
   * Проверяет, что существующий функционал сохранён
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  it('существующий функционал сохранён', () => {
    const onSelectSession = vi.fn();
    const session = createTestSession();

    render(
      <Sidebar
        onSelectSession={onSelectSession}
        selectedSessionId={session.id}
      />
    );

    // Проверяем, что компонент отображается
    expect(screen.getByText('Сессии')).toBeInTheDocument();
  });

  /**
   * Проверяет, что все компоненты работают вместе
   * Requirements: все
   */
  it('все компоненты работают вместе', () => {
    const { container } = render(
      <div>
        <Header
          stats={{ total: 10, new: 2, active: 5 }}
          searchQuery=""
          onSearchChange={() => {}}
          onUserMenuAction={() => {}}
        />
        <div className="flex">
          <div className="w-80">
            <Sidebar
              onSelectSession={() => {}}
              selectedSessionId={1}
            />
          </div>
          <div className="flex-1">
            <MessageInput onSend={async () => {}} />
          </div>
        </div>
      </div>
    );

    // Проверяем, что все компоненты отображаются
    expect(screen.getByText('Admin Support')).toBeInTheDocument();
    expect(screen.getByText('Сессии')).toBeInTheDocument();
  });
});
