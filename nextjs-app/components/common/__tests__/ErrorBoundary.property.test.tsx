/**
 * Property-based тесты для ErrorBoundary компонента
 * Property 33: Отображение понятных сообщений об ошибках (часть 2)
 * Requirements: 16.4
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { ErrorBoundary } from '../ErrorBoundary';
import { Component } from 'react';

/**
 * Компонент, который выбрасывает ошибку
 */
class ThrowError extends Component<{ error: Error; shouldThrow: boolean }> {
  render() {
    if (this.props.shouldThrow) {
      throw this.props.error;
    }
    return <div>Нет ошибки</div>;
  }
}

describe('Property 33: ErrorBoundary - Перехват и отображение ошибок', () => {
  /**
   * Property: ErrorBoundary перехватывает любую ошибку в дочерних компонентах
   * Requirements: 16.4
   */
  it('должен перехватывать любую ошибку в дочерних компонентах', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (errorMessage) => {
          const error = new Error(errorMessage);
          
          // Подавляем console.error для чистоты вывода тестов
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          // Рендерим компонент с ошибкой
          const { container } = render(
            <ErrorBoundary>
              <ThrowError error={error} shouldThrow={true} />
            </ErrorBoundary>
          );
          
          // Проверяем, что отображается fallback UI
          expect(container.textContent).toContain('Произошла ошибка');
          
          // Проверяем, что есть кнопка перезагрузки
          expect(container.textContent).toContain('Перезагрузить страницу');
          
          // Проверяем, что дочерний компонент не отображается
          expect(container.textContent).not.toContain('Нет ошибки');
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: ErrorBoundary отображает дочерние компоненты если ошибок нет
   * Requirements: 16.4
   */
  it('должен отображать дочерние компоненты при отсутствии ошибок', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage) => {
          const error = new Error(errorMessage);
          
          // Рендерим компонент БЕЗ ошибки
          const { container } = render(
            <ErrorBoundary>
              <ThrowError error={error} shouldThrow={false} />
            </ErrorBoundary>
          );
          
          // Проверяем, что дочерний компонент отображается
          expect(container.textContent).toContain('Нет ошибки');
          
          // Проверяем, что fallback UI НЕ отображается
          expect(container.textContent).not.toContain('Произошла ошибка');
          
          cleanup();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: ErrorBoundary использует кастомный fallback если передан
   * Requirements: 16.4
   */
  it('должен использовать кастомный fallback UI', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage, customFallbackText) => {
          const error = new Error(errorMessage);
          const customFallback = <div>{customFallbackText}</div>;
          
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          const { container } = render(
            <ErrorBoundary fallback={customFallback}>
              <ThrowError error={error} shouldThrow={true} />
            </ErrorBoundary>
          );
          
          // Проверяем, что отображается кастомный fallback
          expect(container.textContent).toContain(customFallbackText);
          
          // Проверяем, что дефолтный fallback НЕ отображается
          expect(container.textContent).not.toContain('Произошла ошибка');
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: ErrorBoundary вызывает onError callback при ошибке
   * Requirements: 16.4
   */
  it('должен вызывать onError callback при возникновении ошибки', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage) => {
          const error = new Error(errorMessage);
          const onError = vi.fn();
          
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          render(
            <ErrorBoundary onError={onError}>
              <ThrowError error={error} shouldThrow={true} />
            </ErrorBoundary>
          );
          
          // Проверяем, что callback был вызван
          expect(onError).toHaveBeenCalledTimes(1);
          
          // Проверяем, что callback получил правильные аргументы
          expect(onError).toHaveBeenCalledWith(
            error,
            expect.objectContaining({
              componentStack: expect.any(String),
            })
          );
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: ErrorBoundary отображает сообщение об ошибке в development режиме
   * Requirements: 16.4
   */
  it('должен показывать детали ошибки в development режиме', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 }),
        (errorMessage) => {
          const error = new Error(errorMessage);
          
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          const { container } = render(
            <ErrorBoundary>
              <ThrowError error={error} shouldThrow={true} />
            </ErrorBoundary>
          );
          
          // В development режиме должно отображаться сообщение об ошибке
          expect(container.textContent).toContain(errorMessage);
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 30 }
    );
    
    process.env.NODE_ENV = originalEnv;
  });

  /**
   * Property: ErrorBoundary НЕ показывает детали ошибки в production режиме
   * Requirements: 16.4, 13.5
   */
  it('не должен показывать детали ошибки в production режиме', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 }),
        (errorMessage) => {
          const error = new Error(errorMessage);
          
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          const { container } = render(
            <ErrorBoundary>
              <ThrowError error={error} shouldThrow={true} />
            </ErrorBoundary>
          );
          
          // В production режиме НЕ должно отображаться техническое сообщение
          expect(container.textContent).not.toContain(errorMessage);
          
          // Но должно быть общее сообщение
          expect(container.textContent).toContain('Произошла ошибка');
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 30 }
    );
    
    process.env.NODE_ENV = originalEnv;
  });

  /**
   * Property: ErrorBoundary корректно работает с вложенными компонентами
   * Requirements: 16.4
   */
  it('должен перехватывать ошибки из глубоко вложенных компонентов', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 5 }),
        (errorMessage, nestingLevel) => {
          const error = new Error(errorMessage);
          
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          // Создаём вложенную структуру
          let component = <ThrowError error={error} shouldThrow={true} />;
          for (let i = 0; i < nestingLevel; i++) {
            component = <div>{component}</div>;
          }
          
          const { container } = render(<ErrorBoundary>{component}</ErrorBoundary>);
          
          // Проверяем, что ошибка перехвачена независимо от уровня вложенности
          expect(container.textContent).toContain('Произошла ошибка');
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: ErrorBoundary имеет доступные элементы управления
   * Requirements: 16.4
   */
  it('должен иметь доступные элементы управления', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage) => {
          const error = new Error(errorMessage);
          
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          const { container } = render(
            <ErrorBoundary>
              <ThrowError error={error} shouldThrow={true} />
            </ErrorBoundary>
          );
          
          // Проверяем наличие кнопки перезагрузки
          const reloadButton = container.querySelector('button');
          expect(reloadButton).toBeTruthy();
          expect(reloadButton?.textContent).toContain('Перезагрузить страницу');
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: ErrorBoundary не падает при любых типах ошибок
   * Requirements: 16.4
   */
  it('должен обрабатывать любые типы ошибок', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string().map((msg) => new Error(msg)),
          fc.string().map((msg) => new TypeError(msg)),
          fc.string().map((msg) => new ReferenceError(msg)),
          fc.string().map((msg) => new SyntaxError(msg))
        ),
        (error) => {
          const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
          
          let container: HTMLElement | undefined;
          
          // Не должно выбрасывать ошибку
          expect(() => {
            const result = render(
              <ErrorBoundary>
                <ThrowError error={error} shouldThrow={true} />
              </ErrorBoundary>
            );
            container = result.container;
          }).not.toThrow();
          
          // Должен отображаться fallback UI
          expect(container?.textContent).toContain('Произошла ошибка');
          
          consoleError.mockRestore();
          cleanup();
        }
      ),
      { numRuns: 50 }
    );
  });
});
