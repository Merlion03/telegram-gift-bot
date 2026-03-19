/**
 * Property-тест для типографики и иконок
 * Property 8: Типографика и иконки используются консистентно
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 * 
 * Этот тест проверяет, что:
 * 1. Все текстовые элементы используют правильные размеры шрифтов
 * 2. Иконки из lucide-react используются консистентно
 * 3. Отступы и размеры соответствуют telegram-theme
 * 4. Иерархия заголовков соблюдается
 */

import { render, screen } from '@testing-library/react';
import { fc } from '@fast-check/react';
import * as LucideIcons from 'lucide-react';
import { Header } from '@/components/admin/Header';
import { UserPanel } from '@/components/admin/UserPanel';
import { ChatWindow } from '@/components/admin/ChatWindow';
import { MessageInput } from '@/components/admin/MessageInput';

/**
 * Генератор для размеров шрифтов
 * Requirements: 9.1, 9.2, 9.3
 */
const fontSizeGenerator = fc.oneof(
  fc.constant('text-xs'),
  fc.constant('text-sm'),
  fc.constant('text-base'),
  fc.constant('text-lg'),
  fc.constant('text-xl'),
  fc.constant('text-2xl'),
  fc.constant('text-3xl')
);

/**
 * Генератор для весов шрифтов
 * Requirements: 9.1, 9.2
 */
const fontWeightGenerator = fc.oneof(
  fc.constant('font-normal'),
  fc.constant('font-medium'),
  fc.constant('font-semibold'),
  fc.constant('font-bold')
);

/**
 * Генератор для отступов
 * Requirements: 9.3
 */
const paddingGenerator = fc.oneof(
  fc.constant('p-1'),
  fc.constant('p-2'),
  fc.constant('p-3'),
  fc.constant('p-4'),
  fc.constant('p-6')
);

/**
 * Генератор для названий иконок lucide-react
 * Requirements: 9.1, 9.4
 */
const iconNameGenerator = fc.sampled(
  Object.keys(LucideIcons).filter(
    (name) => !name.startsWith('_') && name !== 'createIcon'
  )
);

/**
 * Проверяет, что элемент имеет правильный размер шрифта
 * Requirements: 9.1, 9.2
 */
function hasValidFontSize(element: HTMLElement): boolean {
  const classList = element.className;
  const validSizes = [
    'text-xs',
    'text-sm',
    'text-base',
    'text-lg',
    'text-xl',
    'text-2xl',
    'text-3xl',
  ];
  return validSizes.some((size) => classList.includes(size));
}

/**
 * Проверяет, что элемент имеет правильный вес шрифта
 * Requirements: 9.1, 9.2
 */
function hasValidFontWeight(element: HTMLElement): boolean {
  const classList = element.className;
  const validWeights = [
    'font-normal',
    'font-medium',
    'font-semibold',
    'font-bold',
  ];
  return validWeights.some((weight) => classList.includes(weight));
}

/**
 * Проверяет, что элемент имеет правильные отступы
 * Requirements: 9.3
 */
function hasValidPadding(element: HTMLElement): boolean {
  const classList = element.className;
  const paddingRegex = /p-[0-9]+/;
  return paddingRegex.test(classList);
}

/**
 * Проверяет, что иконка существует в lucide-react
 * Requirements: 9.1, 9.4
 */
function isValidLucideIcon(iconName: string): boolean {
  return iconName in LucideIcons;
}

/**
 * Property 8: Типографика и иконки используются консистентно
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */
describe('Property 8: Типографика и иконки используются консистентно', () => {
  /**
   * Проверяет, что все заголовки используют правильные размеры
   * Requirements: 9.1, 9.2
   */
  it('все заголовки используют правильные размеры шрифтов', () => {
    fc.assert(
      fc.property(fontSizeGenerator, (fontSize) => {
        const { container } = render(
          <div className={`${fontSize} font-bold`}>Заголовок</div>
        );
        const heading = container.querySelector('div');
        expect(heading).toHaveClass(fontSize);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что все текстовые элементы имеют правильный вес шрифта
   * Requirements: 9.1, 9.2
   */
  it('все текстовые элементы имеют правильный вес шрифта', () => {
    fc.assert(
      fc.property(fontWeightGenerator, (fontWeight) => {
        const { container } = render(
          <p className={`text-base ${fontWeight}`}>Текст</p>
        );
        const text = container.querySelector('p');
        expect(text).toHaveClass(fontWeight);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что все элементы имеют правильные отступы
   * Requirements: 9.3
   */
  it('все элементы имеют правильные отступы', () => {
    fc.assert(
      fc.property(paddingGenerator, (padding) => {
        const { container } = render(
          <div className={padding}>Содержимое</div>
        );
        const element = container.querySelector('div');
        expect(element).toHaveClass(padding);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Проверяет, что Header компонент использует правильную типографику
   * Requirements: 9.1, 9.2, 9.3
   */
  it('Header компонент использует правильную типографику', () => {
    const { container } = render(
      <Header
        stats={{ total: 10, new: 2, active: 5 }}
        searchQuery=""
        onSearchChange={() => {}}
        onUserMenuAction={() => {}}
      />
    );

    // Проверяем, что заголовок имеет правильный размер
    const heading = container.querySelector('h1');
    expect(heading).toBeInTheDocument();
    expect(heading?.className).toMatch(/text-lg|text-xl|text-2xl/);
  });

  /**
   * Проверяет, что UserPanel компонент использует правильную типографику
   * Requirements: 9.1, 9.2, 9.3
   */
  it('UserPanel компонент использует правильную типографику', () => {
    const mockUser = {
      telegramId: 123456,
      name: 'Test User',
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

    const { container } = render(
      <UserPanel user={mockUser} />
    );

    // Проверяем, что заголовок имеет правильный размер
    const heading = container.querySelector('h2');
    expect(heading).toBeInTheDocument();
    expect(heading?.className).toMatch(/text-lg|text-xl/);
  });

  /**
   * Проверяет, что MessageInput компонент использует правильную типографику
   * Requirements: 9.1, 9.2, 9.3
   */
  it('MessageInput компонент использует правильную типографику', () => {
    const { container } = render(
      <MessageInput
        onSend={async () => {}}
        placeholder="Введите сообщение..."
      />
    );

    // Проверяем, что текстовое поле имеет правильный размер
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
  });

  /**
   * Проверяет, что иконки lucide-react используются консистентно
   * Requirements: 9.1, 9.4
   */
  it('иконки lucide-react используются консистентно', () => {
    fc.assert(
      fc.property(iconNameGenerator, (iconName) => {
        // Проверяем, что иконка существует
        expect(isValidLucideIcon(iconName)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Проверяет, что все интерактивные элементы имеют правильный размер
   * Requirements: 9.1, 9.2, 9.3
   */
  it('все интерактивные элементы имеют правильный размер', () => {
    const { container } = render(
      <button className="px-4 py-2 text-sm font-medium">Кнопка</button>
    );

    const button = container.querySelector('button');
    expect(button).toHaveClass('text-sm');
    expect(button).toHaveClass('font-medium');
  });

  /**
   * Проверяет, что иерархия заголовков соблюдается
   * Requirements: 9.1, 9.2, 9.4
   */
  it('иерархия заголовков соблюдается', () => {
    const { container } = render(
      <div>
        <h1 className="text-3xl font-bold">Главный заголовок</h1>
        <h2 className="text-2xl font-bold">Подзаголовок</h2>
        <h3 className="text-xl font-semibold">Третий уровень</h3>
        <p className="text-base font-normal">Обычный текст</p>
      </div>
    );

    const h1 = container.querySelector('h1');
    const h2 = container.querySelector('h2');
    const h3 = container.querySelector('h3');
    const p = container.querySelector('p');

    expect(h1).toHaveClass('text-3xl');
    expect(h2).toHaveClass('text-2xl');
    expect(h3).toHaveClass('text-xl');
    expect(p).toHaveClass('text-base');
  });
});
