import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ChatWindow } from '../../../components/admin/ChatWindow';
import type { SupportSession, SupportMessage } from '../../../types/support';

// Mock для getRealtimeClient
vi.mock('@/lib/database/realtimeClient', () => ({
  getRealtimeClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    subscribeToSessionMessages: vi.fn(() => vi.fn()),
  })),
}));

// Mock для fetch
global.fetch = vi.fn();

describe('ChatWindow Component', () => {
  const defaultSession: SupportSession = {
    id: 1,
    telegram_id: 12345,
    status: 'active',
    session_type: 'support',
    created_at: new Date().toISOString(),
  };

  const mockMessages: SupportMessage[] = [
    {
      id: 1,
      session_id: 1,
      telegram_id: 12345,
      message_type: 'from_user',
      message_text: 'Привет, это первое сообщение',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      delivered: true,
    },
    {
      id: 2,
      session_id: 1,
      telegram_id: 12345,
      message_type: 'from_support',
      message_text: 'Привет! Как дела?',
      created_at: new Date(Date.now() - 1800000).toISOString(),
      delivered: true,
    },
    {
      id: 3,
      session_id: 1,
      telegram_id: 12345,
      message_type: 'from_bot',
      message_text: 'Это автоматическое сообщение',
      created_at: new Date().toISOString(),
      delivered: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: mockMessages,
        total: mockMessages.length,
        has_more: false,
        session: defaultSession,
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Message Display', () => {
    it('должен отображать сообщения от пользователя слева', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      const userMessage = screen.getByText('Привет, это первое сообщение').closest('div');
      expect(userMessage).toHaveClass('justify-start');
    });

    it('должен отображать сообщения от поддержки справа', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет! Как дела?')).toBeInTheDocument();
      });

      const supportMessage = screen.getByText('Привет! Как дела?').closest('div');
      expect(supportMessage).toHaveClass('justify-end');
    });

    it('должен отображать сообщения от бота с фиолетовым фоном', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Это автоматическое сообщение')).toBeInTheDocument();
      });

      const botMessage = screen.getByText('Это автоматическое сообщение').closest('div');
      expect(botMessage).toHaveClass('justify-start');
    });

    it('должен отображать метку "🤖 Бот" для сообщений бота', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('🤖 Бот')).toBeInTheDocument();
      });
    });

    it('должен отображать время сообщения', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        // Проверяем, что время отображается (формат HH:MM)
        const timeElements = screen.getAllByText(/\d{2}:\d{2}/);
        expect(timeElements.length).toBeGreaterThan(0);
      });
    });

    it('должен отображать индикатор доставки для сообщений от поддержки', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет! Как дела?')).toBeInTheDocument();
      });

      // Проверяем наличие индикатора доставки (✓✓)
      const supportMessage = screen.getByText('Привет! Как дела?').closest('div');
      expect(supportMessage?.textContent).toContain('✓');
    });
  });

  describe('Message Grouping by Date', () => {
    it('должен группировать сообщения по датам', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        // Проверяем наличие разделителя даты
        const dateElements = screen.queryAllByText(/Сегодня|Вчера|\d{2}\.\d{2}\.\d{4}/);
        expect(dateElements.length).toBeGreaterThan(0);
      });
    });

    it('должен отображать "Сегодня" для сообщений сегодня', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Сегодня')).toBeInTheDocument();
      });
    });

    it('должен не дублировать разделители дат', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        const todayElements = screen.getAllByText('Сегодня');
        // Должно быть только одно "Сегодня" для всех сообщений сегодня
        expect(todayElements.length).toBe(1);
      });
    });
  });

  describe('Avatar Display', () => {
    it('должен отображать аватар для первого сообщения от пользователя', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      // Проверяем наличие аватара (первая буква ID)
      const avatars = screen.getAllByText(/\d|👤|🤖/);
      expect(avatars.length).toBeGreaterThan(0);
    });

    it('должен отображать аватар администратора для сообщений от поддержки', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет! Как дела?')).toBeInTheDocument();
      });

      // Проверяем наличие аватара администратора
      const adminAvatars = screen.getAllByText('👤');
      expect(adminAvatars.length).toBeGreaterThan(0);
    });

    it('должен отображать аватар бота для сообщений от бота', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Это автоматическое сообщение')).toBeInTheDocument();
      });

      // Проверяем наличие аватара бота
      const botAvatars = screen.getAllByText('🤖');
      expect(botAvatars.length).toBeGreaterThan(0);
    });
  });

  describe('Session Information', () => {
    it('должен отображать ID пользователя', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText(`Пользователь: ${defaultSession.telegram_id}`)).toBeInTheDocument();
      });
    });

    it('должен отображать ID сессии', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText(`Сессия #${defaultSession.id}`)).toBeInTheDocument();
      });
    });

    it('должен отображать тип сессии "Поддержка"', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Поддержка')).toBeInTheDocument();
      });
    });

    it('должен отображать статус "Активна"', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Активна')).toBeInTheDocument();
      });
    });

    it('должен отображать статус "Завершена" для закрытой сессии', async () => {
      const closedSession: SupportSession = {
        ...defaultSession,
        status: 'closed',
      };

      render(<ChatWindow session={closedSession} />);

      await waitFor(() => {
        expect(screen.getByText('Завершена')).toBeInTheDocument();
      });
    });
  });

  describe('Message Input', () => {
    it('должен отображать поле ввода сообщения для активной сессии', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        const input = screen.getByPlaceholderText('Введите сообщение...');
        expect(input).toBeInTheDocument();
      });
    });

    it('должен отображать кнопку отправки', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Отправить')).toBeInTheDocument();
      });
    });

    it('должен отображать счётчик символов', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('0 / 4000')).toBeInTheDocument();
      });
    });

    it('должен обновлять счётчик символов при вводе', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        const input = screen.getByPlaceholderText('Введите сообщение...') as HTMLInputElement;
        expect(input).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Введите сообщение...') as HTMLInputElement;
      await userEvent.type(input, 'test');

      await waitFor(() => {
        expect(screen.getByText('4 / 4000')).toBeInTheDocument();
      });
    });

    it('должен скрывать поле ввода для закрытой сессии', async () => {
      const closedSession: SupportSession = {
        ...defaultSession,
        status: 'closed',
      };

      render(<ChatWindow session={closedSession} />);

      await waitFor(() => {
        const input = screen.queryByPlaceholderText('Введите сообщение...');
        expect(input).not.toBeInTheDocument();
      });
    });

    it('должен отображать сообщение о завершённой сессии', async () => {
      const closedSession: SupportSession = {
        ...defaultSession,
        status: 'closed',
      };

      render(<ChatWindow session={closedSession} />);

      await waitFor(() => {
        expect(screen.getByText('Сессия завершена. Отправка сообщений недоступна.')).toBeInTheDocument();
      });
    });
  });

  describe('Chat Type Handling', () => {
    it('должен отображать кнопку подключения для Chat_Session', async () => {
      const chatSession: SupportSession = {
        ...defaultSession,
        session_type: 'chat',
      };

      render(<ChatWindow session={chatSession} />);

      await waitFor(() => {
        expect(screen.getByText('Подключиться к диалогу')).toBeInTheDocument();
      });
    });

    it('должен отображать тип сессии "Обычный диалог" для Chat_Session', async () => {
      const chatSession: SupportSession = {
        ...defaultSession,
        session_type: 'chat',
      };

      render(<ChatWindow session={chatSession} />);

      await waitFor(() => {
        expect(screen.getByText('Обычный диалог')).toBeInTheDocument();
      });
    });

    it('должен не отображать кнопку подключения для Support_Session', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        const connectButton = screen.queryByText('Подключиться к диалогу');
        expect(connectButton).not.toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('должен отображать индикатор загрузки при первой загрузке', async () => {
      (global.fetch as any).mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow session={defaultSession} />);

      expect(screen.getByText('Загрузка сообщений...')).toBeInTheDocument();
    });

    it('должен скрывать индикатор загрузки после загрузки', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('должен отображать сообщение об отсутствии сообщений', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [],
          total: 0,
          has_more: false,
          session: defaultSession,
        }),
      });

      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Нет сообщений')).toBeInTheDocument();
      });
    });

    it('должен отображать подсказку для пустого чата', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [],
          total: 0,
          has_more: false,
          session: defaultSession,
        }),
      });

      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Сообщения появятся здесь, когда пользователь напишет')).toBeInTheDocument();
      });
    });
  });

  describe('Message Design', () => {
    it('должен применять telegram-shadow-sm к пузырям сообщений', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      const messageBubble = screen.getByText('Привет, это первое сообщение').closest('div');
      expect(messageBubble).toHaveClass('telegram-shadow-sm');
    });

    it('должен применять правильные цвета для разных типов сообщений', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      // Проверяем цвета для сообщения от пользователя
      const userMessage = screen.getByText('Привет, это первое сообщение').closest('div');
      expect(userMessage).toHaveClass('bg-white');

      // Проверяем цвета для сообщения от поддержки
      const supportMessage = screen.getByText('Привет! Как дела?').closest('div');
      expect(supportMessage).toHaveClass('bg-telegram-blue');

      // Проверяем цвета для сообщения от бота
      const botMessage = screen.getByText('Это автоматическое сообщение').closest('div');
      expect(botMessage).toHaveClass('bg-purple-100');
    });

    it('должен применять скругления к пузырям сообщений', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      const messageBubble = screen.getByText('Привет, это первое сообщение').closest('div');
      expect(messageBubble).toHaveClass('rounded-2xl');
    });
  });

  describe('Animations', () => {
    it('должен применять анимационные классы к сообщениям', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      // Проверяем наличие анимационных классов
      const animatedElements = screen.getByText('Привет, это первое сообщение').closest('div');
      expect(animatedElements?.className).toMatch(/animate-slide-in/);
    });
  });

  describe('Responsive Design', () => {
    it('должен применять правильные классы для адаптивности', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      // Проверяем наличие контейнера с правильными классами
      const container = screen.getByText('Привет, это первое сообщение').closest('[class*="flex"]');
      expect(container).toBeTruthy();
    });
  });

  describe('Telegram Theme Styles', () => {
    it('должен применять telegram-theme стили к заголовку', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        const header = screen.getByText(`Пользователь: ${defaultSession.telegram_id}`).closest('div');
        expect(header?.parentElement).toHaveClass('bg-white');
      });
    });

    it('должен применять telegram-theme стили к контейнеру сообщений', async () => {
      render(<ChatWindow session={defaultSession} />);

      await waitFor(() => {
        expect(screen.getByText('Привет, это первое сообщение')).toBeInTheDocument();
      });

      // Проверяем наличие контейнера с правильными классами
      const container = screen.getByText('Привет, это первое сообщение').closest('[class*="overflow-y-auto"]');
      expect(container).toHaveClass('p-4');
    });
  });
});
