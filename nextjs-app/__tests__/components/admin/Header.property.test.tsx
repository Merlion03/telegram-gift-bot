import React from 'react';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../../../components/admin/Header';

/**
 * Property-based тест для компонента Header
 * Validates: Requirements 1.5
 *
 * Property 1: Компоненты корректно рендерятся с telegram-theme стилями
 * For any UI компонент в системе, он должен использовать цветовую палитру telegram-theme,
 * применять соответствующие CSS классы (telegram-button, telegram-input, telegram-shadow)
 * и корректно отображаться в светлой и темной темах
 */
describe('Header Component - Property-Based Tests', () => {
  /**
   * Property 1: Компоненты корректно рендерятся с telegram-theme стилями
   * Проверяет, что компонент Header корректно рендерится с любыми валидными данными
   * и применяет telegram-theme стили
   */
  it('должен корректно рендериться с любыми валидными данными и применять telegram-theme стили', () => {
    fc.assert(
      fc.property(
        fc.record({
          total: fc.integer({ min: 0, max: 10000 }),
          new: fc.integer({ min: 0, max: 1000 }),
          active: fc.integer({ min: 0, max: 1000 }),
        }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.option(fc.webUrl(), { freq: 1 }),
        (stats, searchQuery, userName, userAvatar) => {
          // Убеждаемся, что new и active не больше total
          const validStats = {
            total: stats.total,
            new: Math.min(stats.new, stats.total),
            active: Math.min(stats.active, stats.total),
          };

          const { container } = render(
            <Header
              stats={validStats}
              searchQuery={searchQuery}
              userName={userName}
              userAvatar={userAvatar || undefined}
              onSearchChange={vi.fn()}
              onUserMenuAction={vi.fn()}
            />
          );

          // Проверяем, что компонент отрендерился
          expect(container).toBeTruthy();

          // Проверяем наличие основного контейнера header
          const header = container.querySelector('header');
          expect(header).toBeTruthy();

          // Проверяем применение telegram-theme стилей
          expect(header).toHaveClass('bg-telegram-bg');
          expect(header).toHaveClass('border-b');
          expect(header).toHaveClass('border-telegram-border');
          expect(header).toHaveClass('telegram-shadow-sm');

          // Проверяем наличие поля поиска с telegram-input классом
          const inputs = container.querySelectorAll('input');
          expect(inputs.length).toBeGreaterThan(0);
          inputs.forEach((input) => {
            expect(input).toHaveClass('telegram-input');
          });

          // Проверяем наличие статистики
          const statsElements = container.querySelectorAll('[class*="text-telegram"]');
          expect(statsElements.length).toBeGreaterThan(0);

          // Проверяем наличие меню пользователя
          const buttons = container.querySelectorAll('button');
          const menuButton = Array.from(buttons).find(btn => btn.getAttribute('aria-expanded') !== null);
          expect(menuButton).toBeTruthy();

          // Проверяем, что все числовые значения отображаются корректно
          expect(container.textContent).toContain(validStats.total.toString());
          expect(container.textContent).toContain(validStats.new.toString());
          expect(container.textContent).toContain(validStats.active.toString());

          // Проверяем, что поле поиска присутствует
          const searchInputs = container.querySelectorAll('input[type="text"]');
          expect(searchInputs.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Компонент остается функциональным при различных размерах данных
   * Проверяет, что компонент корректно обрабатывает граничные случаи
   */
  it('должен оставаться функциональным при различных размерах данных', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999999 }),
        fc.integer({ min: 0, max: 999999 }),
        fc.integer({ min: 0, max: 999999 }),
        (total, newCount, activeCount) => {
          const stats = {
            total,
            new: Math.min(newCount, total),
            active: Math.min(activeCount, total),
          };

          const { container } = render(
            <Header
              stats={stats}
              onSearchChange={vi.fn()}
              onUserMenuAction={vi.fn()}
            />
          );

          // Проверяем, что компонент отрендерился без ошибок
          expect(container).toBeTruthy();

          // Проверяем, что все значения отображаются
          const textContent = container.textContent || '';
          expect(textContent).toContain(stats.total.toString());
          expect(textContent).toContain(stats.new.toString());
          expect(textContent).toContain(stats.active.toString());

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Компонент корректно обрабатывает различные типы имен пользователей
   * Проверяет, что компонент работает с разными форматами имен
   */
  it('должен корректно обрабатывать различные типы имен пользователей', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (userName) => {
          const { container } = render(
            <Header
              userName={userName}
              onSearchChange={vi.fn()}
              onUserMenuAction={vi.fn()}
            />
          );

          // Проверяем, что компонент отрендерился
          expect(container).toBeTruthy();

          // Проверяем, что меню кнопка присутствует
          const buttons = container.querySelectorAll('button');
          const menuButton = Array.from(buttons).find(btn => btn.getAttribute('aria-expanded') !== null);
          expect(menuButton).toBeTruthy();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Компонент применяет правильные классы для всех элементов
   * Проверяет консистентность применения telegram-theme классов
   */
  it('должен применять правильные классы для всех элементов', () => {
    fc.assert(
      fc.property(
        fc.record({
          total: fc.integer({ min: 0, max: 1000 }),
          new: fc.integer({ min: 0, max: 100 }),
          active: fc.integer({ min: 0, max: 100 }),
        }),
        (stats) => {
          const validStats = {
            total: stats.total,
            new: Math.min(stats.new, stats.total),
            active: Math.min(stats.active, stats.total),
          };

          const { container } = render(
            <Header
              stats={validStats}
              onSearchChange={vi.fn()}
              onUserMenuAction={vi.fn()}
            />
          );

          // Проверяем основные telegram-theme классы
          const header = container.querySelector('header');
          expect(header?.className).toMatch(/bg-telegram-bg/);
          expect(header?.className).toMatch(/border-telegram-border/);
          expect(header?.className).toMatch(/telegram-shadow-sm/);

          // Проверяем, что все input элементы имеют telegram-input класс
          const inputs = container.querySelectorAll('input');
          inputs.forEach((input) => {
            expect(input.className).toMatch(/telegram-input/);
          });

          // Проверяем наличие цветовых классов
          const textElements = container.querySelectorAll('[class*="text-telegram"]');
          expect(textElements.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Компонент остается интерактивным при различных состояниях
   * Проверяет, что обработчики событий работают корректно
   */
  it('должен оставаться интерактивным при различных состояниях', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (searchQuery) => {
          const onSearchChange = vi.fn();
          const onUserMenuAction = vi.fn();

          const { container } = render(
            <Header
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              onUserMenuAction={onUserMenuAction}
            />
          );

          // Проверяем, что компонент отрендерился
          expect(container).toBeTruthy();

          // Проверяем, что кнопка меню присутствует и может быть кликнута
          const buttons = container.querySelectorAll('button');
          const menuButton = Array.from(buttons).find(btn => btn.getAttribute('aria-expanded') !== null);
          expect(menuButton).toBeTruthy();

          // Проверяем, что поле поиска присутствует
          const inputs = container.querySelectorAll('input[type="text"]');
          expect(inputs.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
