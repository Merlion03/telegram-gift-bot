import React from 'react';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { UserPanel } from '@/components/admin/UserPanel';

/**
 * Генератор для UserInfo
 */
const userInfoArbitrary = fc.record({
  telegramId: fc.integer({ min: 1, max: 999999999 }),
  username: fc.option(fc.string({ minLength: 1, maxLength: 32 })),
  phone: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
  email: fc.option(fc.string({ minLength: 5, maxLength: 100 })),
  avatar: fc.option(fc.string({ minLength: 1, maxLength: 500 })),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  online: fc.boolean(),
  lastSeen: fc.option(fc.string()),
  firstContact: fc.string().map(() => new Date().toISOString()),
  totalMessages: fc.integer({ min: 0, max: 100000 }),
  notes: fc.array(
    fc.record({
      id: fc.string(),
      text: fc.string({ minLength: 1, maxLength: 500 }),
      author: fc.string({ minLength: 1, maxLength: 50 }),
      createdAt: fc.string().map(() => new Date().toISOString()),
      category: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    }),
    { maxLength: 10 }
  ),
  preferences: fc.record({
    notifications: fc.boolean(),
    language: fc.constantFrom('ru', 'en'),
    timezone: fc.constantFrom('UTC', 'Europe/Moscow', 'Europe/London'),
  }),
});

describe('UserPanel - Property Tests', () => {
  /**
   * Property 1: Компонент всегда отображает основную информацию
   */
  it('должен отображать основную информацию пользователя для любых валидных данных', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(
          <UserPanel user={userInfo} />
        );

        // Проверяем, что имя отображается
        expect(container.textContent).toContain(userInfo.name);

        // Проверяем, что ID отображается
        expect(container.textContent).toContain(userInfo.telegramId.toString());

        // Проверяем, что контейнер имеет правильные классы
        const panel = container.querySelector('.w-full');
        expect(panel).toHaveClass('bg-telegram-bg');
        expect(panel).toHaveClass('border-l');
        expect(panel).toHaveClass('border-telegram-border');
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: Компонент корректно отображает опциональные поля
   */
  it('должен корректно отображать опциональные поля пользователя', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(<UserPanel user={userInfo} />);

        // Проверяем username
        if (userInfo.username) {
          expect(container.textContent).toContain(`@${userInfo.username}`);
        }

        // Проверяем phone
        if (userInfo.phone) {
          expect(container.textContent).toContain(userInfo.phone);
        }

        // Проверяем email
        if (userInfo.email) {
          expect(container.textContent).toContain(userInfo.email);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 3: Компонент отображает все табы
   */
  it('должен отображать все табы независимо от данных пользователя', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(<UserPanel user={userInfo} />);

        // Проверяем наличие всех табов
        expect(container.textContent).toContain('Посты');
        expect(container.textContent).toContain('Медиа');
        expect(container.textContent).toContain('Файлы');
        expect(container.textContent).toContain('Ссылки');
        expect(container.textContent).toContain('Заметки');
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: Компонент использует telegram-theme стили
   */
  it('должен использовать telegram-theme стили для всех элементов', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(
          <UserPanel user={userInfo} />
        );

        // Проверяем основной контейнер
        const mainContainer = container.querySelector('.w-full');
        expect(mainContainer).toHaveClass('bg-telegram-bg');
        expect(mainContainer).toHaveClass('border-telegram-border');

        // Проверяем наличие кнопок с telegram-стилями
        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);

        // Проверяем, что кнопки имеют правильные классы
        buttons.forEach((button) => {
          const classes = button.className;
          expect(
            classes.includes('bg-telegram-') ||
            classes.includes('hover:bg-telegram-') ||
            classes.includes('text-telegram-') ||
            classes.includes('rounded-lg')
          ).toBe(true);
        });
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 5: Компонент адаптируется под разные размеры экрана
   */
  it('должен иметь адаптивные классы для разных размеров экрана', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(
          <UserPanel user={userInfo} />
        );

        // Проверяем основной контейнер на адаптивность
        const mainContainer = container.querySelector('.w-full');
        expect(mainContainer).toHaveClass('md:w-80');

        // Проверяем наличие адаптивных отступов
        const paddedElements = container.querySelectorAll('[class*="px-"]');
        expect(paddedElements.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: Компонент отображает индикатор онлайн статуса
   */
  it('должен отображать правильный индикатор онлайн статуса', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(
          <UserPanel user={userInfo} />
        );

        // Ищем индикатор статуса
        const statusIndicator = container.querySelector(
          '.absolute.bottom-0.right-0.w-6.h-6.rounded-full'
        );
        expect(statusIndicator).toBeInTheDocument();

        // Проверяем правильный цвет
        if (userInfo.online) {
          expect(statusIndicator).toHaveClass('bg-telegram-green');
        } else {
          expect(statusIndicator).toHaveClass('bg-telegram-tertiary');
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7: Компонент корректно обрабатывает пустые данные
   */
  it('должен корректно обрабатывать пользователя с минимальными данными', () => {
    const minimalUser = {
      telegramId: 123,
      name: 'User',
      online: false,
      firstContact: new Date().toISOString(),
      totalMessages: 0,
      notes: [],
      preferences: {
        notifications: true,
        language: 'ru',
        timezone: 'UTC',
      },
    };

    const { container } = render(<UserPanel user={minimalUser} />);

    // Проверяем, что компонент отрендерился
    expect(container.querySelector('.w-full')).toBeInTheDocument();

    // Проверяем обязательные элементы
    expect(container.textContent).toContain('User');
    expect(container.textContent).toContain('123');
  });

  /**
   * Property 8: Компонент отображает информацию о пользователе в правильном формате
   */
  it('должен отображать информацию в правильном формате для любых данных', () => {
    fc.assert(
      fc.property(userInfoArbitrary, (userInfo) => {
        const { container } = render(
          <UserPanel user={userInfo} />
        );

        // Проверяем, что заголовок присутствует
        const header = container.querySelector('h2');
        expect(header?.textContent).toContain('Информация о пользователе');

        // Проверяем, что есть кнопка профиля
        expect(container.textContent).toContain('Профиль');

        // Проверяем, что есть кнопка уведомлений
        expect(
          container.textContent.includes('Уведомления') ||
          container.textContent.includes('Без уведомлений')
        ).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});
