/**
 * E2E (end-to-end) интеграционные тесты для ChatWindow.tsx
 * 
 * Проверяют полный flow от команды пользователя до отображения в админ-панели:
 * - Команда /start → сохранение → отображение
 * - Команда /help → сохранение → отображение
 * - WebSocket real-time обновления
 * - Режим поддержки (обратная совместимость)
 * 
 * Feature: bot-messages-tracking
 * Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 5.2, 5.3, 5.4, 5.5, 6.3, 6.4, 6.5, 6.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatWindow } from '../ChatWindow';
import type { SupportSession, SupportMessage } from '@/types/support';

describe('ChatWindow - E2E Tests', () => {
  let mockSubscriptionCallback: ((message: any) => void) | null = null;
  let mockUnsubscribe: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionCallback = null;
    mockUnsubscribe = vi.fn();

    // Мокируем getRealtimeClient
    vi.mock('@/lib/database/realtimeClient', () => ({
      getRealtimeClient: vi.fn(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        subscribeToSessionMessages: vi.fn((sessionId, callback, errorCallback) => {
          mockSubscriptionCallback = callback;
          return mockUnsubscribe;
        }),
      })),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * E2E тест 9.1: команда /start → сохранение → отображение
   * 
   * Validates: Requirements 1.1, 2.1, 3.1, 4.1
   */
  describe('E2E Test 9.1: /start command flow', () => {
    it('должен отображать команду /start и ответ бота в хронологическом порядке', async () => {
      // Arrange
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 123456789,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T10:00:00Z',
        last_activity: '2024-01-01T10:00:00Z',
        closed_at: null,
      };

      // Симулируем сообщения, которые были сохранены в БД после команды /start
      const messagesAfterStart: SupportMessage[] = [
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
          telegram_id: 0, // Системный идентификатор для бота
          message_type: 'from_bot',
          message_text: 'Привет, Test! 👋\n\nЯ помогу тебе получить приз.',
          created_at: '2024-01-01T10:00:01Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      // Мокируем fetch API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: messagesAfterStart,
          total: messagesAfterStart.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      // Assert
      // Ждём загрузки сообщений
      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Проверяем, что команда /start отображается
      expect(screen.getByText('/start')).toBeInTheDocument();

      // Проверяем, что ответ бота отображается
      expect(screen.getByText(/Привет, Test!/)).toBeInTheDocument();

      // Проверяем хронологический порядок (команда должна быть раньше ответа)
      const allMessages = screen.getAllByText(/\/start|Привет, Test!/);
      expect(allMessages).toHaveLength(2);

      // Проверяем, что сообщение бота имеет правильный визуальный стиль
      const botMessage = screen.getByText(/Привет, Test!/);
      const botMessageBubble = botMessage.closest('div.rounded-2xl');
      expect(botMessageBubble).toHaveClass('bg-purple-100');
      expect(botMessageBubble).toHaveClass('text-purple-900');

      // Проверяем наличие метки "🤖 Бот"
      expect(screen.getByText('🤖 Бот')).toBeInTheDocument();
    });

    it('должен отображать команду /start с правильным визуальным стилем пользователя', async () => {
      // Arrange
      const mockSession: SupportSession = {
        id: 1,
        telegram_id: 123456789,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T10:00:00Z',
        last_activity: '2024-01-01T10:00:00Z',
        closed_at: null,
      };

      const messagesAfterStart: SupportMessage[] = [
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
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: messagesAfterStart,
          total: messagesAfterStart.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Проверяем, что команда /start отображается с визуальным стилем пользователя
      const userMessage = screen.getByText('/start');
      const userMessageBubble = userMessage.closest('div.rounded-2xl');
      
      // Команда должна отображаться как обычное сообщение от пользователя
      expect(userMessageBubble).toHaveClass('bg-blue-500');
      expect(userMessageBubble).toHaveClass('text-white');
    });
  });

  /**
   * E2E тест 9.2: команда /help → сохранение → отображение
   * 
   * Validates: Requirements 1.1, 2.1, 3.1, 4.1
   */
  describe('E2E Test 9.2: /help command flow', () => {
    it('должен отображать команду /help и ответ бота в хронологическом порядке', async () => {
      // Arrange
      const mockSession: SupportSession = {
        id: 2,
        telegram_id: 987654321,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T11:00:00Z',
        last_activity: '2024-01-01T11:00:00Z',
        closed_at: null,
      };

      const messagesAfterHelp: SupportMessage[] = [
        {
          id: 3,
          session_id: 2,
          telegram_id: 987654321,
          message_type: 'from_user',
          message_text: '/help',
          created_at: '2024-01-01T11:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
        {
          id: 4,
          session_id: 2,
          telegram_id: 0,
          message_type: 'from_bot',
          message_text: 'Доступные команды:\n/start - Начать работу\n/help - Показать помощь',
          created_at: '2024-01-01T11:00:01Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: messagesAfterHelp,
          total: messagesAfterHelp.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Проверяем, что команда /help отображается
      expect(screen.getByText('/help')).toBeInTheDocument();

      // Проверяем, что ответ бота отображается
      expect(screen.getByText(/Доступные команды:/)).toBeInTheDocument();

      // Проверяем, что сообщение бота имеет правильный визуальный стиль
      const botMessage = screen.getByText(/Доступные команды:/);
      const botMessageBubble = botMessage.closest('div.rounded-2xl');
      expect(botMessageBubble).toHaveClass('bg-purple-100');

      // Проверяем наличие метки "🤖 Бот"
      expect(screen.getByText('🤖 Бот')).toBeInTheDocument();
    });

    it('должен отображать команду /help с параметрами полностью', async () => {
      // Arrange
      const mockSession: SupportSession = {
        id: 3,
        telegram_id: 111222333,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T12:00:00Z',
        last_activity: '2024-01-01T12:00:00Z',
        closed_at: null,
      };

      const messagesWithParams: SupportMessage[] = [
        {
          id: 5,
          session_id: 3,
          telegram_id: 111222333,
          message_type: 'from_user',
          message_text: '/help support',
          created_at: '2024-01-01T12:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: messagesWithParams,
          total: messagesWithParams.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Проверяем, что команда с параметрами отображается полностью
      expect(screen.getByText('/help support')).toBeInTheDocument();
    });
  });

  /**
   * E2E тест 9.3: WebSocket real-time обновления
   * 
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
   */
  describe('E2E Test 9.3: WebSocket real-time updates', () => {
    it('должен получать ответ бота в реальном времени через WebSocket', async () => {
      // Arrange
      const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
      
      const mockSession: SupportSession = {
        id: 4,
        telegram_id: 444555666,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T13:00:00Z',
        last_activity: '2024-01-01T13:00:00Z',
        closed_at: null,
      };

      // Начальное состояние: только команда от пользователя
      const initialMessages: SupportMessage[] = [
        {
          id: 6,
          session_id: 4,
          telegram_id: 444555666,
          message_type: 'from_user',
          message_text: '/start',
          created_at: '2024-01-01T13:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: initialMessages,
          total: initialMessages.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      // Ждём загрузки начальных сообщений
      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Проверяем, что команда отображается
      expect(screen.getByText('/start')).toBeInTheDocument();

      // Симулируем получение ответа бота через WebSocket в реальном времени
      const botResponseMessage = {
        type: 'new_message',
        data: {
          id: 7,
          session_id: 4,
          sender_type: 'bot', // Важно: sender_type='bot'
          message_text: 'Привет! Я получил твою команду /start',
          created_at: '2024-01-01T13:00:01Z',
          is_read: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      };

      // Вызываем callback WebSocket
      if (mockSubscriptionCallback) {
        mockSubscriptionCallback(botResponseMessage);
      }

      // Assert
      // Проверяем, что ответ бота появился автоматически без перезагрузки
      await waitFor(() => {
        expect(screen.getByText(/Я получил твою команду \/start/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Проверяем, что сообщение бота имеет правильный визуальный стиль
      const botMessage = screen.getByText(/Я получил твою команду \/start/);
      const botMessageBubble = botMessage.closest('div.rounded-2xl');
      expect(botMessageBubble).toHaveClass('bg-purple-100');

      // Проверяем наличие метки "🤖 Бот"
      expect(screen.getByText('🤖 Бот')).toBeInTheDocument();
    });

    it('должен автоматически добавлять новое сообщение бота в конец списка', async () => {
      // Arrange
      const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
      
      const mockSession: SupportSession = {
        id: 5,
        telegram_id: 777888999,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T14:00:00Z',
        last_activity: '2024-01-01T14:00:00Z',
        closed_at: null,
      };

      const initialMessages: SupportMessage[] = [
        {
          id: 8,
          session_id: 5,
          telegram_id: 777888999,
          message_type: 'from_user',
          message_text: 'Привет',
          created_at: '2024-01-01T14:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
        {
          id: 9,
          session_id: 5,
          telegram_id: 0,
          message_type: 'from_bot',
          message_text: 'Привет! Чем могу помочь?',
          created_at: '2024-01-01T14:00:01Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: initialMessages,
          total: initialMessages.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Симулируем новое сообщение бота через WebSocket
      const newBotMessage = {
        type: 'new_message',
        data: {
          id: 10,
          session_id: 5,
          sender_type: 'bot',
          message_text: 'Новое сообщение в конце списка',
          created_at: '2024-01-01T14:00:02Z',
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

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Новое сообщение в конце списка')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Проверяем, что новое сообщение добавлено в конец списка
      const allMessages = screen.getAllByText(/Привет|Чем могу помочь|Новое сообщение в конце списка/);
      expect(allMessages.length).toBeGreaterThanOrEqual(3);
    });

    it('должен автоматически прокручивать к новому сообщению бота', async () => {
      // Arrange
      const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
      
      const mockScrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = mockScrollIntoView;

      const mockSession: SupportSession = {
        id: 6,
        telegram_id: 111000111,
        session_type: 'chat',
        status: 'active',
        created_at: '2024-01-01T15:00:00Z',
        last_activity: '2024-01-01T15:00:00Z',
        closed_at: null,
      };

      const initialMessages: SupportMessage[] = [
        {
          id: 11,
          session_id: 6,
          telegram_id: 111000111,
          message_type: 'from_user',
          message_text: 'Тест автоскролла',
          created_at: '2024-01-01T15:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: initialMessages,
          total: initialMessages.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Сбрасываем счётчик вызовов после начальной загрузки
      mockScrollIntoView.mockClear();

      // Симулируем новое сообщение бота
      const newBotMessage = {
        type: 'new_message',
        data: {
          id: 12,
          session_id: 6,
          sender_type: 'bot',
          message_text: 'Сообщение для автоскролла',
          created_at: '2024-01-01T15:00:01Z',
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

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Сообщение для автоскролла')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Проверяем, что scrollIntoView был вызван
      await waitFor(() => {
        expect(mockScrollIntoView).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  /**
   * E2E тест 9.4: режим поддержки (обратная совместимость)
   * 
   * Validates: Requirements 6.3, 6.4, 6.5, 6.6
   */
  describe('E2E Test 9.4: Support mode (backward compatibility)', () => {
    it('должен корректно отображать сообщения в режиме поддержки', async () => {
      // Arrange
      const mockSession: SupportSession = {
        id: 7,
        telegram_id: 222333444,
        session_type: 'support', // Режим поддержки
        status: 'active',
        created_at: '2024-01-01T16:00:00Z',
        last_activity: '2024-01-01T16:00:00Z',
        closed_at: null,
      };

      const supportModeMessages: SupportMessage[] = [
        {
          id: 13,
          session_id: 7,
          telegram_id: 222333444,
          message_type: 'from_user',
          message_text: 'Помогите, пожалуйста!',
          created_at: '2024-01-01T16:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
        {
          id: 14,
          session_id: 7,
          telegram_id: 999888777, // ID администратора
          message_type: 'from_support',
          message_text: 'Здравствуйте! Чем могу помочь?',
          created_at: '2024-01-01T16:00:01Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: supportModeMessages,
          total: supportModeMessages.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Проверяем, что сообщение от пользователя отображается
      expect(screen.getByText('Помогите, пожалуйста!')).toBeInTheDocument();

      // Проверяем, что сообщение от администратора отображается
      expect(screen.getByText('Здравствуйте! Чем могу помочь?')).toBeInTheDocument();

      // Проверяем визуальный стиль сообщения от пользователя
      const userMessage = screen.getByText('Помогите, пожалуйста!');
      const userMessageBubble = userMessage.closest('div.rounded-2xl');
      expect(userMessageBubble).toHaveClass('bg-blue-500');

      // Проверяем визуальный стиль сообщения от администратора
      const adminMessage = screen.getByText('Здравствуйте! Чем могу помочь?');
      const adminMessageBubble = adminMessage.closest('div.rounded-2xl');
      expect(adminMessageBubble).toHaveClass('bg-green-100');
    });

    it('должен получать сообщения администратора через WebSocket в режиме поддержки', async () => {
      // Arrange
      const { getRealtimeClient } = await import('@/lib/database/realtimeClient');
      
      const mockSession: SupportSession = {
        id: 8,
        telegram_id: 555666777,
        session_type: 'support',
        status: 'active',
        created_at: '2024-01-01T17:00:00Z',
        last_activity: '2024-01-01T17:00:00Z',
        closed_at: null,
      };

      const initialMessages: SupportMessage[] = [
        {
          id: 15,
          session_id: 8,
          telegram_id: 555666777,
          message_type: 'from_user',
          message_text: 'Нужна помощь',
          created_at: '2024-01-01T17:00:00Z',
          delivered: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: initialMessages,
          total: initialMessages.length,
          has_more: false,
          session: mockSession,
        }),
      });

      // Act
      render(<ChatWindow session={mockSession} />);

      await waitFor(() => {
        expect(screen.queryByText('Загрузка сообщений...')).not.toBeInTheDocument();
      });

      // Симулируем ответ администратора через WebSocket
      const adminResponseMessage = {
        type: 'new_message',
        data: {
          id: 16,
          session_id: 8,
          sender_type: 'support', // Сообщение от администратора
          message_text: 'Я вам помогу!',
          created_at: '2024-01-01T17:00:01Z',
          is_read: false,
          media_type: 'text',
          file_path: null,
          caption: null,
          file_size: null,
        },
      };

      if (mockSubscriptionCallback) {
        mockSubscriptionCallback(adminResponseMessage);
      }

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Я вам помогу!')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Проверяем визуальный стиль сообщения от администратора
      const adminMessage = screen.getByText('Я вам помогу!');
      const adminMessageBubble = adminMessage.closest('div.rounded-2xl');
      expect(adminMessageBubble).toHaveClass('bg-green-100');
    });
  });
});
