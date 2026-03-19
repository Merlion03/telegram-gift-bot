import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageInput } from '../../../components/admin/MessageInput';
import { DEFAULT_MESSAGE_TEMPLATES } from '../../../lib/constants/message-templates';

describe('MessageInput Component', () => {
  const defaultProps = {
    onSend: vi.fn().mockResolvedValue(undefined),
    disabled: false,
    placeholder: 'Введите сообщение...',
    maxLength: 4096,
    templates: DEFAULT_MESSAGE_TEMPLATES,
    onTemplatesChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Дизайн и стили', () => {
    it('должен применять telegram-стили к компоненту', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const form = container.querySelector('form');
      expect(form).toHaveClass('space-y-2');

      const textarea = container.querySelector('textarea');
      expect(textarea).toHaveClass('bg-telegram-bg');
      expect(textarea).toHaveClass('text-telegram-text');
      expect(textarea).toHaveClass('placeholder-telegram-secondary');
    });

    it('должен отображать кнопки действий с правильными иконками', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);

      // Проверяем наличие SVG иконок
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('должен применять правильные классы к кнопке отправки', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const buttons = Array.from(container.querySelectorAll('button'));
      const sendButton = buttons.find((btn) =>
        btn.textContent?.includes('Отправить')
      );

      expect(sendButton).toHaveClass('bg-telegram-blue');
      expect(sendButton).toHaveClass('text-white');
      expect(sendButton).toHaveClass('rounded-lg');
    });
  });

  describe('Поле ввода', () => {
    it('должен отображать textarea с плейсхолдером', () => {
      render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText('Введите сообщение...');
      expect(textarea).toBeInTheDocument();
    });

    it('должен обновлять значение при вводе текста', async () => {
      render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Тестовое сообщение');

      expect(textarea.value).toBe('Тестовое сообщение');
    });

    it('должен ограничивать длину сообщения', async () => {
      const props = { ...defaultProps, maxLength: 10 };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Это очень длинное сообщение');

      expect(textarea.value.length).toBeLessThanOrEqual(10);
    });

    it('должен отображать счетчик символов', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const counter = container.querySelector('.text-xs');
      expect(counter).toBeInTheDocument();
      expect(counter?.textContent).toMatch(/\d+ \/ \d+/);
    });

    it('должен менять цвет счетчика при приближении к лимиту', async () => {
      const props = { ...defaultProps, maxLength: 20 };
      const { container } = render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      // Заполняем на 90%
      await userEvent.type(textarea, '12345678901234567890');

      const counter = container.querySelector('.text-telegram-red');
      expect(counter).toBeInTheDocument();
    });

    it('должен быть отключен при disabled=true', () => {
      const props = { ...defaultProps, disabled: true };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      expect(textarea).toBeDisabled();
    });

    it('должен быть отключен во время отправки', async () => {
      const onSend = vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 100);
          })
      );
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, 'Тест');
      await userEvent.click(sendButton);

      expect(textarea).toBeDisabled();
    });
  });

  describe('Отправка сообщения', () => {
    it('должен отправлять сообщение при клике на кнопку', async () => {
      const onSend = vi.fn().mockResolvedValue(undefined);
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, 'Тестовое сообщение');
      await userEvent.click(sendButton);

      expect(onSend).toHaveBeenCalledWith('Тестовое сообщение');
    });

    it('должен отправлять сообщение при нажатии Enter', async () => {
      const onSend = vi.fn().mockResolvedValue(undefined);
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Тестовое сообщение');
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSend).toHaveBeenCalledWith('Тестовое сообщение');
    });

    it('должен добавлять новую строку при Shift+Enter', async () => {
      const onSend = vi.fn().mockResolvedValue(undefined);
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Первая строка');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      // Shift+Enter не должен отправлять
      expect(onSend).not.toHaveBeenCalled();
    });

    it('должен очищать поле после успешной отправки', async () => {
      const onSend = vi.fn().mockResolvedValue(undefined);
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, 'Тестовое сообщение');
      await userEvent.click(sendButton);

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    it('должен показывать ошибку при пустом сообщении', async () => {
      render(<MessageInput {...defaultProps} />);

      const sendButton = screen.getByText('Отправить');
      await userEvent.click(sendButton);

      expect(
        screen.getByText('Сообщение не может быть пустым')
      ).toBeInTheDocument();
    });

    it('должен показывать ошибку при ошибке отправки', async () => {
      const onSend = vi
        .fn()
        .mockRejectedValue(new Error('Ошибка сети'));
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, 'Тестовое сообщение');
      await userEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Ошибка сети')).toBeInTheDocument();
      });
    });

    it('должен показывать спиннер во время отправки', async () => {
      const onSend = vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 100);
          })
      );
      const props = { ...defaultProps, onSend };
      const { container } = render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, 'Тест');
      await userEvent.click(sendButton);

      expect(screen.getByText('Отправка...')).toBeInTheDocument();

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Кнопка очистки', () => {
    it('должен отображать кнопку очистки при наличии текста', async () => {
      render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Тестовое сообщение');

      expect(screen.getByText('Очистить')).toBeInTheDocument();
    });

    it('должен скрывать кнопку очистки при пустом поле', () => {
      render(<MessageInput {...defaultProps} />);

      expect(screen.queryByText('Очистить')).not.toBeInTheDocument();
    });

    it('должен очищать поле при клике на кнопку очистки', async () => {
      render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      await userEvent.type(textarea, 'Тестовое сообщение');
      const clearButton = screen.getByText('Очистить');
      await userEvent.click(clearButton);

      expect(textarea.value).toBe('');
    });
  });

  describe('Шаблоны сообщений', () => {
    it('должен отображать кнопку шаблонов', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const templateButton = container.querySelector(
        'button[aria-label="Открыть шаблоны"]'
      );
      expect(templateButton).toBeInTheDocument();
    });

    it('должен открывать выпадающий список шаблонов', async () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const templateButton = container.querySelector(
        'button[aria-label="Открыть шаблоны"]'
      ) as HTMLButtonElement;

      await userEvent.click(templateButton);

      await waitFor(() => {
        expect(screen.getByText('Шаблоны сообщений')).toBeInTheDocument();
      });
    });

    it('должен вставлять текст шаблона при выборе', async () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const templateButton = container.querySelector(
        'button[aria-label="Открыть шаблоны"]'
      ) as HTMLButtonElement;

      await userEvent.click(templateButton);

      await waitFor(() => {
        expect(screen.getByText('Шаблоны сообщений')).toBeInTheDocument();
      });

      const firstTemplate = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.includes('Здравствуйте')
      );

      if (firstTemplate) {
        await userEvent.click(firstTemplate);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;

        expect(textarea.value).toContain('Здравствуйте');
      }
    });

    it('должен обновлять счетчик использования шаблона', async () => {
      const onTemplatesChange = vi.fn();
      const props = { ...defaultProps, onTemplatesChange };
      const { container } = render(<MessageInput {...props} />);

      const templateButton = container.querySelector(
        'button[aria-label="Открыть шаблоны"]'
      ) as HTMLButtonElement;

      await userEvent.click(templateButton);

      await waitFor(() => {
        expect(screen.getByText('Шаблоны сообщений')).toBeInTheDocument();
      });

      const firstTemplate = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.includes('Здравствуйте')
      );

      if (firstTemplate) {
        await userEvent.click(firstTemplate);

        expect(onTemplatesChange).toHaveBeenCalled();
      }
    });
  });

  describe('Кнопки действий', () => {
    it('должен отображать кнопку прикрепления файлов', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const attachButton = container.querySelector(
        'button[aria-label="Прикрепить файл"]'
      );
      expect(attachButton).toBeInTheDocument();
    });

    it('должен отображать кнопку эмодзи', () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const emojiButton = container.querySelector(
        'button[aria-label="Вставить эмодзи"]'
      );
      expect(emojiButton).toBeInTheDocument();
    });

    it('должен отключать кнопки действий при disabled=true', () => {
      const props = { ...defaultProps, disabled: true };
      const { container } = render(<MessageInput {...props} />);

      const buttons = container.querySelectorAll(
        'button[aria-label="Прикрепить файл"], button[aria-label="Вставить эмодзи"]'
      );

      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Подсказка о горячих клавишах', () => {
    it('должен отображать подсказку о горячих клавишах', () => {
      render(<MessageInput {...defaultProps} />);

      expect(screen.getByText(/Enter/)).toBeInTheDocument();
      expect(screen.getByText(/Shift\+Enter/)).toBeInTheDocument();
    });

    it('должен показывать правильный текст подсказки', () => {
      render(<MessageInput {...defaultProps} />);

      expect(screen.getByText(/отправить/)).toBeInTheDocument();
      expect(screen.getByText(/новая строка/)).toBeInTheDocument();
    });
  });

  describe('Автоизменение размера', () => {
    it('должен увеличивать высоту при добавлении текста', async () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      const initialHeight = textarea.style.height;

      // Добавляем много текста
      await userEvent.type(
        textarea,
        'Строка 1\nСтрока 2\nСтрока 3\nСтрока 4\nСтрока 5'
      );

      // Высота должна измениться
      expect(textarea.style.height).not.toBe(initialHeight);
    });

    it('должен уменьшать высоту при удалении текста', async () => {
      const { container } = render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;

      // Добавляем текст
      await userEvent.type(
        textarea,
        'Строка 1\nСтрока 2\nСтрока 3\nСтрока 4\nСтрока 5'
      );

      const heightWithText = textarea.style.height;

      // Удаляем текст
      await userEvent.clear(textarea);

      // Высота должна вернуться к минимальной
      expect(textarea.style.height).not.toBe(heightWithText);
    });
  });

  describe('Валидация', () => {
    it('должен не отправлять пустое сообщение', async () => {
      const onSend = vi.fn();
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const sendButton = screen.getByText('Отправить');
      await userEvent.click(sendButton);

      expect(onSend).not.toHaveBeenCalled();
    });

    it('должен не отправлять сообщение только с пробелами', async () => {
      const onSend = vi.fn();
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, '   ');
      await userEvent.click(sendButton);

      expect(onSend).not.toHaveBeenCalled();
    });

    it('должен отправлять сообщение с пробелами в начале/конце', async () => {
      const onSend = vi.fn().mockResolvedValue(undefined);
      const props = { ...defaultProps, onSend };
      render(<MessageInput {...props} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить');

      await userEvent.type(textarea, '  Тестовое сообщение  ');
      await userEvent.click(sendButton);

      expect(onSend).toHaveBeenCalledWith('Тестовое сообщение');
    });
  });

  describe('Состояния кнопки отправки', () => {
    it('должен отключать кнопку отправки при пустом поле', () => {
      render(<MessageInput {...defaultProps} />);

      const sendButton = screen.getByText('Отправить') as HTMLButtonElement;
      expect(sendButton).toBeDisabled();
    });

    it('должен включать кнопку отправки при наличии текста', async () => {
      render(<MessageInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(
        'Введите сообщение...'
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByText('Отправить') as HTMLButtonElement;

      await userEvent.type(textarea, 'Тестовое сообщение');

      expect(sendButton).not.toBeDisabled();
    });

    it('должен отключать кнопку отправки при disabled=true', () => {
      const props = { ...defaultProps, disabled: true };
      render(<MessageInput {...props} />);

      const sendButton = screen.getByText('Отправить') as HTMLButtonElement;
      expect(sendButton).toBeDisabled();
    });
  });
});
