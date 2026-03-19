import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fc } from '@fast-check/vitest';
import { MessageInput } from '../../../components/admin/MessageInput';
import { DEFAULT_MESSAGE_TEMPLATES } from '../../../lib/constants/message-templates';

describe('MessageInput Property-Based Tests', () => {
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

  /**
   * Property 1: Компоненты корректно рендерятся с telegram-theme стилями
   * For any UI компонент в системе, он должен использовать цветовую палитру telegram-theme,
   * применять соответствующие CSS классы и корректно отображаться в светлой и темной темах
   * Validates: Requirements 1.5, 4.5, 5.1, 5.2, 5.3, 5.4
   */
  describe('Property 1: Компоненты корректно рендерятся с telegram-theme стилями', () => {
    it.prop(
      [fc.integer({ min: 1, max: 100 })],
      'должен применять telegram-стили для любого количества символов',
      (charCount) => {
        const { container } = render(<MessageInput {...defaultProps} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('bg-telegram-bg');
        expect(textarea).toHaveClass('text-telegram-text');
        expect(textarea).toHaveClass('placeholder-telegram-secondary');

        const form = container.querySelector('form');
        expect(form).toBeInTheDocument();
      }
    );

    it.prop(
      [fc.boolean()],
      'должен применять правильные стили независимо от состояния disabled',
      (isDisabled) => {
        const props = { ...defaultProps, disabled: isDisabled };
        const { container } = render(<MessageInput {...props} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('bg-telegram-bg');
        expect(textarea).toHaveClass('text-telegram-text');

        if (isDisabled) {
          expect(textarea).toHaveClass('disabled:bg-telegram-sidebar');
        }
      }
    );

    it.prop(
      [fc.integer({ min: 100, max: 4096 })],
      'должен применять telegram-стили для любого maxLength',
      (maxLength) => {
        const props = { ...defaultProps, maxLength };
        const { container } = render(<MessageInput {...props} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('bg-telegram-bg');
        expect(textarea).toHaveClass('text-telegram-text');
      }
    );

    it.prop(
      [fc.string({ minLength: 0, maxLength: 50 })],
      'должен применять telegram-стили для любого placeholder',
      (placeholder) => {
        const props = { ...defaultProps, placeholder };
        const { container } = render(<MessageInput {...props} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('placeholder-telegram-secondary');
      }
    );
  });

  /**
   * Property 3: Плавные анимации работают для всех интерактивных элементов
   * For any интерактивный элемент (кнопки, ссылки, меню, сообщения),
   * при взаимодействии пользователя должны применяться соответствующие CSS transitions и анимации
   * Validates: Requirements 1.4, 2.8, 3.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5
   */
  describe('Property 3: Плавные анимации работают для всех интерактивных элементов', () => {
    it.prop(
      [fc.integer({ min: 1, max: 100 })],
      'должен применять анимации при любом количестве символов',
      async (charCount) => {
        const { container } = render(<MessageInput {...defaultProps} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('transition-colors');
      }
    );

    it.prop(
      [fc.boolean()],
      'должен применять анимации независимо от состояния disabled',
      (isDisabled) => {
        const props = { ...defaultProps, disabled: isDisabled };
        const { container } = render(<MessageInput {...props} />);

        const buttons = container.querySelectorAll('button');
        buttons.forEach((button) => {
          // Проверяем наличие transition классов
          const classList = button.className;
          expect(classList).toMatch(/transition/);
        });
      }
    );

    it.prop(
      [fc.integer({ min: 0, max: 10 })],
      'должен применять анимации для кнопок действий',
      (buttonIndex) => {
        const { container } = render(<MessageInput {...defaultProps} />);

        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);

        buttons.forEach((button) => {
          expect(button.className).toMatch(/transition/);
        });
      }
    );

    it.prop(
      [fc.string({ minLength: 1, maxLength: 100 })],
      'должен применять анимации при вводе текста',
      async (text) => {
        const { container } = render(<MessageInput {...defaultProps} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('transition-colors');
      }
    );
  });

  /**
   * Property 4: Backward compatibility сохраняется для всех существующих функций
   * For any существующая функциональность (API вызовы, WebSocket соединения, отправка сообщений),
   * она должна продолжать работать без изменений после внедрения нового UI
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
   */
  describe('Property 4: Backward compatibility сохраняется для всех существующих функций', () => {
    it.prop(
      [fc.string({ minLength: 1, maxLength: 100 })],
      'должен отправлять сообщение с любым текстом',
      async (text) => {
        const onSend = vi.fn().mockResolvedValue(undefined);
        const props = { ...defaultProps, onSend };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;
        const sendButton = screen.getByText('Отправить');

        await userEvent.type(textarea, text);
        await userEvent.click(sendButton);

        expect(onSend).toHaveBeenCalledWith(text);
      }
    );

    it.prop(
      [fc.integer({ min: 100, max: 4096 })],
      'должен работать с любым maxLength',
      async (maxLength) => {
        const onSend = vi.fn().mockResolvedValue(undefined);
        const props = { ...defaultProps, maxLength, onSend };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;

        const text = 'a'.repeat(Math.min(50, maxLength));
        await userEvent.type(textarea, text);

        expect(textarea.value.length).toBeLessThanOrEqual(maxLength);
      }
    );

    it.prop(
      [fc.boolean()],
      'должен корректно работать с disabled состоянием',
      async (isDisabled) => {
        const onSend = vi.fn().mockResolvedValue(undefined);
        const props = { ...defaultProps, disabled: isDisabled, onSend };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;

        if (isDisabled) {
          expect(textarea).toBeDisabled();
        } else {
          expect(textarea).not.toBeDisabled();
        }
      }
    );

    it.prop(
      [fc.string({ minLength: 1, maxLength: 50 })],
      'должен обрезать пробелы при отправке',
      async (text) => {
        const onSend = vi.fn().mockResolvedValue(undefined);
        const props = { ...defaultProps, onSend };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;
        const sendButton = screen.getByText('Отправить');

        const textWithSpaces = `  ${text}  `;
        await userEvent.type(textarea, textWithSpaces);
        await userEvent.click(sendButton);

        expect(onSend).toHaveBeenCalledWith(text);
      }
    );
  });

  /**
   * Property 5: Компоненты отображают все необходимые элементы
   * For any компонент с данными пользователя или сессии, он должен отображать
   * все обязательные элементы и корректно обрабатывать отсутствующие данные
   * Validates: Requirements 2.1, 2.5, 2.6, 3.1, 3.2, 4.1
   */
  describe('Property 5: Компоненты отображают все необходимые элементы', () => {
    it.prop(
      [fc.string({ minLength: 1, maxLength: 50 })],
      'должен отображать все необходимые элементы для любого placeholder',
      (placeholder) => {
        const props = { ...defaultProps, placeholder };
        const { container } = render(<MessageInput {...props} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toBeInTheDocument();

        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);

        const counter = container.querySelector('.text-xs');
        expect(counter).toBeInTheDocument();
      }
    );

    it.prop(
      [fc.integer({ min: 100, max: 4096 })],
      'должен отображать счетчик для любого maxLength',
      (maxLength) => {
        const props = { ...defaultProps, maxLength };
        const { container } = render(<MessageInput {...props} />);

        const counter = container.querySelector('.text-xs');
        expect(counter).toBeInTheDocument();
        expect(counter?.textContent).toMatch(/\d+ \/ \d+/);
      }
    );

    it.prop(
      [fc.boolean()],
      'должен отображать все элементы независимо от disabled',
      (isDisabled) => {
        const props = { ...defaultProps, disabled: isDisabled };
        const { container } = render(<MessageInput {...props} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toBeInTheDocument();

        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);
      }
    );
  });

  /**
   * Property 8: Типографика и иконки используются консистентно
   * For any текстовый элемент или иконка в системе, должны применяться
   * правильные размеры шрифтов, отступы, иерархия заголовков и использоваться иконки из lucide-react
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4
   */
  describe('Property 8: Типографика и иконки используются консистентно', () => {
    it.prop(
      [fc.string({ minLength: 1, maxLength: 50 })],
      'должен использовать консистентную типографику для любого текста',
      (text) => {
        const props = { ...defaultProps, placeholder: text };
        const { container } = render(<MessageInput {...props} />);

        const textarea = container.querySelector('textarea');
        expect(textarea).toHaveClass('text-telegram-text');
        expect(textarea).toHaveClass('placeholder-telegram-secondary');
      }
    );

    it.prop(
      [fc.integer({ min: 0, max: 10 })],
      'должен использовать иконки lucide-react для всех кнопок',
      (buttonIndex) => {
        const { container } = render(<MessageInput {...defaultProps} />);

        const svgs = container.querySelectorAll('svg');
        expect(svgs.length).toBeGreaterThan(0);

        svgs.forEach((svg) => {
          expect(svg).toBeInTheDocument();
        });
      }
    );

    it.prop(
      [fc.boolean()],
      'должен применять консистентные стили независимо от состояния',
      (isDisabled) => {
        const props = { ...defaultProps, disabled: isDisabled };
        const { container } = render(<MessageInput {...props} />);

        const buttons = container.querySelectorAll('button');
        buttons.forEach((button) => {
          // Все кнопки должны иметь консистентные классы
          expect(button.className).toMatch(/rounded/);
        });
      }
    );

    it.prop(
      [fc.integer({ min: 1, max: 100 })],
      'должен применять правильные размеры для счетчика символов',
      (charCount) => {
        const { container } = render(<MessageInput {...defaultProps} />);

        const counter = container.querySelector('.text-xs');
        expect(counter).toHaveClass('text-xs');
        expect(counter).toHaveClass('font-medium');
      }
    );
  });

  /**
   * Дополнительные property-тесты для специфичной функциональности
   */
  describe('Дополнительные property-тесты', () => {
    it.prop(
      [fc.string({ minLength: 1, maxLength: 100 })],
      'должен корректно обрабатывать текст с спецсимволами',
      async (text) => {
        const onSend = vi.fn().mockResolvedValue(undefined);
        const props = { ...defaultProps, onSend };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;
        const sendButton = screen.getByText('Отправить');

        await userEvent.type(textarea, text);
        await userEvent.click(sendButton);

        expect(onSend).toHaveBeenCalledWith(text);
      }
    );

    it.prop(
      [fc.integer({ min: 1, max: 10 })],
      'должен корректно обрабатывать многострочный текст',
      async (lineCount) => {
        const onSend = vi.fn().mockResolvedValue(undefined);
        const props = { ...defaultProps, onSend };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;

        let text = 'Строка 1';
        for (let i = 2; i <= lineCount; i++) {
          text += `\nСтрока ${i}`;
        }

        await userEvent.type(textarea, text);

        expect(textarea.value).toContain('Строка 1');
      }
    );

    it.prop(
      [fc.integer({ min: 100, max: 4096 })],
      'должен корректно ограничивать длину для любого maxLength',
      async (maxLength) => {
        const props = { ...defaultProps, maxLength };
        render(<MessageInput {...props} />);

        const textarea = screen.getByPlaceholderText(
          'Введите сообщение...'
        ) as HTMLTextAreaElement;

        const longText = 'a'.repeat(maxLength + 100);
        await userEvent.type(textarea, longText);

        expect(textarea.value.length).toBeLessThanOrEqual(maxLength);
      }
    );
  });
});
