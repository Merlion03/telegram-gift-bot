/**
 * Property-based тесты для ResetStateButton
 * Проверяют универсальные свойства корректности компонента
 * Requirements: 1.3, 1.4, 1.5, 1.6, 2.3, 7.1, 7.2
 */

import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ResetStateButton } from '../ResetStateButton';

// Mock fetch API
global.fetch = vi.fn();

describe('ResetStateButton - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 1: Текст кнопки зависит от роли пользователя
   * Requirements: 1.3, 1.4, 2.3
   */
  test('Property 1: текст кнопки соответствует роли пользователя', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // sessionId
        fc.integer({ min: 100000, max: 999999 }), // telegramId
        fc.constantFrom(2, 3), // userRole (только 2 или 3)
        (sessionId, telegramId, userRole) => {
          const { container } = render(
            <ResetStateButton
              sessionId={sessionId}
              telegramId={telegramId}
              userRole={userRole}
              sessionStatus="active"
            />
          );

          const button = screen.queryByRole('button');
          
          // Кнопка должна отображаться
          expect(button).toBeInTheDocument();

          // Проверяем текст кнопки в зависимости от роли
          if (userRole === 2) {
            expect(button).toHaveTextContent('🔄 Вызвать главное меню');
          } else if (userRole === 3) {
            expect(button).toHaveTextContent('🔄 Сбросить состояние');
          }

          // Cleanup
          container.remove();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Кнопка отображается только для активных сессий
   * Requirements: 1.5, 1.6
   */
  test('Property 2: кнопка видна только для активных сессий', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // sessionId
        fc.integer({ min: 100000, max: 999999 }), // telegramId
        fc.constantFrom(2, 3), // userRole
        fc.constantFrom('active', 'closed'), // sessionStatus
        (sessionId, telegramId, userRole, sessionStatus) => {
          const { container } = render(
            <ResetStateButton
              sessionId={sessionId}
              telegramId={telegramId}
              userRole={userRole}
              sessionStatus={sessionStatus as 'active' | 'closed'}
            />
          );

          const button = screen.queryByRole('button');

          // Кнопка должна отображаться только для активных сессий
          if (sessionStatus === 'active') {
            expect(button).toBeInTheDocument();
          } else {
            expect(button).not.toBeInTheDocument();
          }

          // Cleanup
          container.remove();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Кнопка отображается только для администраторов и операторов
   * Requirements: 7.1, 7.2
   */
  test('Property 3: кнопка видна только для администраторов и операторов', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // sessionId
        fc.integer({ min: 100000, max: 999999 }), // telegramId
        fc.integer({ min: 0, max: 4 }), // userRole (0-4)
        (sessionId, telegramId, userRole) => {
          const { container } = render(
            <ResetStateButton
              sessionId={sessionId}
              telegramId={telegramId}
              userRole={userRole}
              sessionStatus="active"
            />
          );

          const button = screen.queryByRole('button');

          // Кнопка должна отображаться только для role = 2 или role = 3
          if (userRole === 2 || userRole === 3) {
            expect(button).toBeInTheDocument();
          } else {
            expect(button).not.toBeInTheDocument();
          }

          // Cleanup
          container.remove();
        }
      ),
      { numRuns: 100 }
    );
  });
});
