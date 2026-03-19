import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserPanel } from '@/components/admin/UserPanel';

/**
 * Тестовые данные пользователя
 */
const mockUser = {
  telegramId: 123456789,
  username: 'testuser',
  phone: '+7 (999) 123-45-67',
  email: 'test@example.com',
  avatar: 'https://example.com/avatar.jpg',
  name: 'Test User',
  online: true,
  lastSeen: new Date().toISOString(),
  firstContact: new Date('2024-01-01').toISOString(),
  totalMessages: 42,
  notes: [
    {
      id: '1',
      text: 'Первая заметка',
      author: 'Admin',
      createdAt: new Date('2024-01-15').toISOString(),
      category: 'important',
    },
    {
      id: '2',
      text: 'Вторая заметка',
      author: 'Support',
      createdAt: new Date('2024-01-20').toISOString(),
    },
  ],
  preferences: {
    notifications: true,
    language: 'ru',
    timezone: 'Europe/Moscow',
  },
};

describe('UserPanel - Unit Tests', () => {
  describe('Отображение информации пользователя', () => {
    /**
     * Тест 1.1: Компонент отображает основную информацию
     */
    it('должен отображать имя, ID и статус пользователя', () => {
      render(<UserPanel user={mockUser} />);

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('123456789')).toBeInTheDocument();
      expect(screen.getByText('Онлайн')).toBeInTheDocument();
    });

    /**
     * Тест 1.2: Компонент отображает опциональные поля
     */
    it('должен отображать username, телефон и email', () => {
      render(<UserPanel user={mockUser} />);

      expect(screen.getByText('@testuser')).toBeInTheDocument();
      expect(screen.getByText('+7 (999) 123-45-67')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    /**
     * Тест 1.3: Компонент не отображает отсутствующие опциональные поля
     */
    it('не должен отображать отсутствующие опциональные поля', () => {
      const userWithoutOptional = {
        ...mockUser,
        username: undefined,
        phone: undefined,
        email: undefined,
      };

      render(<UserPanel user={userWithoutOptional} />);

      expect(screen.queryByText(/@/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\+7/)).not.toBeInTheDocument();
      expect(screen.queryByText(/@example.com/)).not.toBeInTheDocument();
    });

    /**
     * Тест 1.4: Компонент отображает счётчик сообщений
     */
    it('должен отображать количество сообщений', () => {
      render(<UserPanel user={mockUser} />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    /**
     * Тест 1.5: Компонент отображает дату первого контакта
     */
    it('должен отображать дату первого контакта в правильном формате', () => {
      render(<UserPanel user={mockUser} />);

      const expectedDate = new Date('2024-01-01').toLocaleDateString('ru-RU');
      expect(screen.getByText(expectedDate)).toBeInTheDocument();
    });

    /**
     * Тест 1.6: Компонент отображает правильный статус онлайн
     */
    it('должен отображать "Онлайн" для онлайн пользователя', () => {
      render(<UserPanel user={mockUser} />);

      expect(screen.getByText('Онлайн')).toBeInTheDocument();
    });

    /**
     * Тест 1.7: Компонент отображает статус офлайн
     */
    it('должен отображать "Был в сети" для офлайн пользователя', () => {
      const offlineUser = { ...mockUser, online: false };
      render(<UserPanel user={offlineUser} />);

      expect(screen.getByText(/Был в сети:/)).toBeInTheDocument();
    });

    /**
     * Тест 1.8: Компонент отображает аватар пользователя
     */
    it('должен отображать аватар пользователя', () => {
      render(<UserPanel user={mockUser} />);

      const avatar = screen.getByAltText('Test User');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    /**
     * Тест 1.9: Компонент отображает инициал при отсутствии аватара
     */
    it('должен отображать инициал пользователя при отсутствии аватара', () => {
      const userWithoutAvatar = { ...mockUser, avatar: undefined };
      const { container } = render(<UserPanel user={userWithoutAvatar} />);

      const avatarDiv = container.querySelector('.w-24.h-24.rounded-full');
      expect(avatarDiv).toBeInTheDocument();
      expect(avatarDiv).toHaveTextContent('T');
    });

    /**
     * Тест 1.10: Компонент отображает индикатор онлайн статуса
     */
    it('должен отображать зелёный индикатор для онлайн пользователя', () => {
      const { container } = render(<UserPanel user={mockUser} />);

      const indicator = container.querySelector('.bg-telegram-green');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('Функциональность табов', () => {
    /**
     * Тест 2.1: Компонент отображает все табы
     */
    it('должен отображать все пять табов', () => {
      render(<UserPanel user={mockUser} />);

      expect(screen.getByText('Посты')).toBeInTheDocument();
      expect(screen.getByText('Медиа')).toBeInTheDocument();
      expect(screen.getByText('Файлы')).toBeInTheDocument();
      expect(screen.getByText('Ссылки')).toBeInTheDocument();
      expect(screen.getByText('Заметки')).toBeInTheDocument();
    });

    /**
     * Тест 2.2: Компонент переключается между табами
     */
    it('должен переключаться между табами при клике', async () => {
      render(<UserPanel user={mockUser} />);

      // По умолчанию активен таб "Посты"
      expect(screen.getByText('Нет постов')).toBeInTheDocument();

      // Кликаем на таб "Медиа"
      const mediaTab = screen.getByText('Медиа');
      fireEvent.click(mediaTab);

      // Проверяем, что таб переключился
      expect(screen.getByText('Нет медиа')).toBeInTheDocument();
    });

    /**
     * Тест 2.3: Таб "Заметки" отображает форму добавления заметки
     */
    it('должен отображать форму добавления заметки в табе "Заметки"', () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Проверяем наличие формы
      expect(screen.getByPlaceholderText('Введите заметку...')).toBeInTheDocument();
      expect(screen.getByText('Добавить')).toBeInTheDocument();
    });

    /**
     * Тест 2.4: Таб "Заметки" отображает существующие заметки
     */
    it('должен отображать существующие заметки в табе "Заметки"', () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Проверяем наличие заметок
      expect(screen.getByText('Первая заметка')).toBeInTheDocument();
      expect(screen.getByText('Вторая заметка')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Support')).toBeInTheDocument();
    });

    /**
     * Тест 2.5: Таб "Заметки" показывает сообщение при отсутствии заметок
     */
    it('должен показывать "Нет заметок" при отсутствии заметок', () => {
      const userWithoutNotes = { ...mockUser, notes: [] };
      render(<UserPanel user={userWithoutNotes} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Проверяем сообщение
      expect(screen.getByText('Нет заметок')).toBeInTheDocument();
    });

    /**
     * Тест 2.6: Таб "Заметки" отображает количество заметок
     */
    it('должен отображать количество заметок', () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Проверяем количество
      expect(screen.getByText('Заметки (2)')).toBeInTheDocument();
    });

    /**
     * Тест 2.7: Таб "Заметки" отображает категорию заметки
     */
    it('должен отображать категорию заметки если она есть', () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Проверяем категорию
      expect(screen.getByText('important')).toBeInTheDocument();
    });
  });

  describe('Функциональность заметок', () => {
    /**
     * Тест 3.1: Кнопка "Добавить" отключена при пустом тексте
     */
    it('кнопка "Добавить" должна быть отключена при пустом тексте', () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Проверяем, что кнопка отключена
      const addButton = screen.getByText('Добавить');
      expect(addButton).toBeDisabled();
    });

    /**
     * Тест 3.2: Кнопка "Добавить" включена при наличии текста
     */
    it('кнопка "Добавить" должна быть включена при наличии текста', async () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Вводим текст
      const textarea = screen.getByPlaceholderText('Введите заметку...');
      await userEvent.type(textarea, 'Новая заметка');

      // Проверяем, что кнопка включена
      const addButton = screen.getByText('Добавить');
      expect(addButton).not.toBeDisabled();
    });

    /**
     * Тест 3.3: Счётчик символов обновляется при вводе
     */
    it('должен обновлять счётчик символов при вводе', async () => {
      render(<UserPanel user={mockUser} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Вводим текст
      const textarea = screen.getByPlaceholderText('Введите заметку...');
      await userEvent.type(textarea, 'Test');

      // Проверяем счётчик
      expect(screen.getByText('4/1000')).toBeInTheDocument();
    });

    /**
     * Тест 3.4: Вызывается callback при добавлении заметки
     */
    it('должен вызывать onAddNote при клике на кнопку "Добавить"', async () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      render(<UserPanel user={mockUser} onAddNote={onAddNote} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Вводим текст
      const textarea = screen.getByPlaceholderText('Введите заметку...');
      await userEvent.type(textarea, 'Новая заметка');

      // Кликаем кнопку
      const addButton = screen.getByText('Добавить');
      fireEvent.click(addButton);

      // Проверяем, что callback был вызван
      await waitFor(() => {
        expect(onAddNote).toHaveBeenCalledWith('Новая заметка');
      });
    });

    /**
     * Тест 3.5: Текст очищается после добавления заметки
     */
    it('должен очищать текст после успешного добавления заметки', async () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      render(<UserPanel user={mockUser} onAddNote={onAddNote} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Вводим текст
      const textarea = screen.getByPlaceholderText('Введите заметку...') as HTMLTextAreaElement;
      await userEvent.type(textarea, 'Новая заметка');

      // Кликаем кнопку
      const addButton = screen.getByText('Добавить');
      fireEvent.click(addButton);

      // Проверяем, что текст очищен
      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    /**
     * Тест 3.6: Кнопка показывает "Добавление..." во время добавления
     */
    it('должен показывать "Добавление..." во время добавления заметки', async () => {
      const onAddNote = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      render(<UserPanel user={mockUser} onAddNote={onAddNote} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Вводим текст
      const textarea = screen.getByPlaceholderText('Введите заметку...');
      await userEvent.type(textarea, 'Новая заметка');

      // Кликаем кнопку
      const addButton = screen.getByText('Добавить');
      fireEvent.click(addButton);

      // Проверяем, что кнопка показывает "Добавление..."
      expect(screen.getByText('Добавление...')).toBeInTheDocument();
    });
  });

  describe('Функциональность уведомлений', () => {
    /**
     * Тест 4.1: Кнопка уведомлений отображает правильное состояние
     */
    it('должен отображать правильное состояние кнопки уведомлений', () => {
      render(<UserPanel user={mockUser} />);

      // Проверяем, что кнопка показывает "Уведомления"
      expect(screen.getByText('Уведомления')).toBeInTheDocument();
    });

    /**
     * Тест 4.2: Кнопка уведомлений показывает "Без уведомлений" при отключении
     */
    it('должен показывать "Без уведомлений" при отключении уведомлений', () => {
      const userWithoutNotifications = {
        ...mockUser,
        preferences: { ...mockUser.preferences, notifications: false },
      };
      render(<UserPanel user={userWithoutNotifications} />);

      expect(screen.getByText('Без уведомлений')).toBeInTheDocument();
    });

    /**
     * Тест 4.3: Вызывается callback при переключении уведомлений
     */
    it('должен вызывать onToggleNotifications при клике на кнопку', async () => {
      const onToggleNotifications = vi.fn();
      render(
        <UserPanel user={mockUser} onToggleNotifications={onToggleNotifications} />
      );

      // Кликаем кнопку уведомлений
      const notificationButton = screen.getByText('Уведомления');
      fireEvent.click(notificationButton);

      // Проверяем, что callback был вызван с false (отключение)
      expect(onToggleNotifications).toHaveBeenCalledWith(false);
    });

    /**
     * Тест 4.4: Состояние уведомлений обновляется при клике
     */
    it('должен обновлять состояние уведомлений при клике', async () => {
      const onToggleNotifications = vi.fn();
      render(
        <UserPanel user={mockUser} onToggleNotifications={onToggleNotifications} />
      );

      // Кликаем кнопку уведомлений
      const notificationButton = screen.getByText('Уведомления');
      fireEvent.click(notificationButton);

      // Проверяем, что кнопка изменилась
      await waitFor(() => {
        expect(screen.getByText('Без уведомлений')).toBeInTheDocument();
      });
    });
  });

  describe('Функциональность кнопок действий', () => {
    /**
     * Тест 5.1: Кнопка профиля вызывает callback
     */
    it('должен вызывать onOpenTelegramProfile при клике на кнопку профиля', () => {
      const onOpenTelegramProfile = vi.fn();
      render(
        <UserPanel user={mockUser} onOpenTelegramProfile={onOpenTelegramProfile} />
      );

      // Кликаем кнопку профиля
      const profileButton = screen.getByText('Профиль');
      fireEvent.click(profileButton);

      // Проверяем, что callback был вызван
      expect(onOpenTelegramProfile).toHaveBeenCalled();
    });

    /**
     * Тест 5.2: Кнопка закрытия вызывает callback
     */
    it('должен вызывать onClose при клике на кнопку закрытия', () => {
      const onClose = vi.fn();
      render(<UserPanel user={mockUser} onClose={onClose} />);

      // Ищем кнопку закрытия
      const closeButton = screen.getByLabelText('Закрыть панель');
      fireEvent.click(closeButton);

      // Проверяем, что callback был вызван
      expect(onClose).toHaveBeenCalled();
    });

    /**
     * Тест 5.3: Кнопка закрытия не отображается если onClose не передан
     */
    it('не должен отображать кнопку закрытия если onClose не передан', () => {
      render(<UserPanel user={mockUser} />);

      // Проверяем, что кнопка закрытия не отображается
      expect(screen.queryByLabelText('Закрыть панель')).not.toBeInTheDocument();
    });
  });

  describe('Адаптивность и стили', () => {
    /**
     * Тест 6.1: Компонент имеет правильные классы для адаптивности
     */
    it('должен иметь адаптивные классы', () => {
      const { container } = render(<UserPanel user={mockUser} />);

      const panel = container.querySelector('.w-full');
      expect(panel).toHaveClass('md:w-80');
      expect(panel).toHaveClass('bg-telegram-bg');
      expect(panel).toHaveClass('border-l');
      expect(panel).toHaveClass('border-telegram-border');
    });

    /**
     * Тест 6.2: Компонент использует telegram-theme стили
     */
    it('должен использовать telegram-theme стили', () => {
      const { container } = render(<UserPanel user={mockUser} />);

      // Проверяем наличие telegram-стилей
      const elements = container.querySelectorAll('[class*="telegram-"]');
      expect(elements.length).toBeGreaterThan(0);
    });

    /**
     * Тест 6.3: Кнопки имеют правильные стили
     */
    it('кнопки должны иметь правильные стили', () => {
      const { container } = render(<UserPanel user={mockUser} />);

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);

      buttons.forEach((button) => {
        const classes = button.className;
        expect(
          classes.includes('transition-telegram') ||
          classes.includes('rounded-lg') ||
          classes.includes('font-medium')
        ).toBe(true);
      });
    });
  });

  describe('Обработка ошибок', () => {
    /**
     * Тест 7.1: Компонент обрабатывает ошибку при добавлении заметки
     */
    it('должен обрабатывать ошибку при добавлении заметки', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onAddNote = vi.fn().mockRejectedValue(new Error('Network error'));

      render(<UserPanel user={mockUser} onAddNote={onAddNote} />);

      // Переходим на таб "Заметки"
      const notesTab = screen.getByText('Заметки');
      fireEvent.click(notesTab);

      // Вводим текст
      const textarea = screen.getByPlaceholderText('Введите заметку...');
      await userEvent.type(textarea, 'Новая заметка');

      // Кликаем кнопку
      const addButton = screen.getByText('Добавить');
      fireEvent.click(addButton);

      // Проверяем, что ошибка была залогирована
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    /**
     * Тест 7.2: Компонент не падает при отсутствии callback'ов
     */
    it('должен работать без callback функций', () => {
      const { container } = render(<UserPanel user={mockUser} />);

      // Проверяем, что компонент отрендерился
      expect(container.querySelector('.w-full')).toBeInTheDocument();
    });
  });
});
