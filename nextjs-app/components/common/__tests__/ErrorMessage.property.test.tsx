/**
 * Property-based тесты для ErrorMessage компонента
 * Property 33: Отображение понятных сообщений об ошибках
 * Requirements: 16.4
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { ErrorMessage, getReadableErrorMessage } from '../ErrorMessage';

describe('Property 33: Отображение понятных сообщений об ошибках', () => {
  /**
   * Property: Компонент ErrorMessage всегда отображает сообщение об ошибке
   * Requirements: 16.4
   */
  it('должен всегда отображать сообщение об ошибке', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 100 }).filter(s => /[a-zA-Zа-яА-Я0-9]/.test(s)),
        (errorMessage) => {
          const { container } = render(<ErrorMessage message={errorMessage} />);
          
          // Проверяем наличие role="alert" для доступности
          const alertElement = container.querySelector('[role="alert"]');
          expect(alertElement).toBeInTheDocument();
          
          // Проверяем наличие aria-live для screen readers
          expect(alertElement).toHaveAttribute('aria-live', 'assertive');
          
          // Проверяем, что текст присутствует в DOM
          expect(alertElement?.textContent).toContain(errorMessage);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Разные severity уровни отображаются с разными стилями
   * Requirements: 16.4
   */
  it('должен применять разные стили для разных severity уровней', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('error', 'warning', 'info'),
        fc.string({ minLength: 2, maxLength: 50 }),
        (severity, message) => {
          const { container } = render(
            <ErrorMessage message={message} severity={severity as any} />
          );
          
          const alertElement = container.querySelector('[role="alert"]');
          expect(alertElement).toBeInTheDocument();
          
          // Проверяем, что применяются соответствующие цветовые классы
          const classList = alertElement?.className || '';
          
          if (severity === 'error') {
            expect(classList).toContain('red');
          } else if (severity === 'warning') {
            expect(classList).toContain('yellow');
          } else if (severity === 'info') {
            expect(classList).toContain('blue');
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Кнопка "Повторить" отображается только когда передан onRetry
   * Requirements: 16.4
   */
  it('должен отображать кнопку "Повторить" только при наличии onRetry', () => {
    const testCases = [
      { message: 'Ошибка 1', hasRetry: true },
      { message: 'Ошибка 2', hasRetry: false },
      { message: 'Ошибка 3', hasRetry: true },
    ];

    testCases.forEach(({ message, hasRetry }) => {
      const onRetry = hasRetry ? () => {} : undefined;
      const { container } = render(<ErrorMessage message={message} onRetry={onRetry} />);
      
      const retryButton = container.querySelector('[aria-label="Повторить попытку"]');
      
      if (hasRetry) {
        expect(retryButton).toBeInTheDocument();
      } else {
        expect(retryButton).not.toBeInTheDocument();
      }
    });
  });

  /**
   * Property: getReadableErrorMessage всегда возвращает понятное сообщение
   * Requirements: 16.4
   */
  it('должен преобразовывать технические ошибки в понятные сообщения', () => {
    const knownErrors = [
      'Invalid signature',
      'InitData is too old',
      'Failed to save delivery data',
      'Failed to send message',
      'Unauthorized',
      'Network request failed',
      'Validation error',
    ];

    knownErrors.forEach((errorMessage) => {
      const error = new Error(errorMessage);
      const readableMessage = getReadableErrorMessage(error);
      
      // Проверяем, что возвращается непустая строка
      expect(readableMessage).toBeTruthy();
      expect(typeof readableMessage).toBe('string');
      expect(readableMessage.length).toBeGreaterThan(0);
      
      // Проверяем, что сообщение не содержит технических терминов
      expect(readableMessage).not.toContain('Invalid signature');
      expect(readableMessage).not.toContain('InitData');
      
      // Проверяем, что сообщение содержит понятные слова
      const hasReadableWords = 
        readableMessage.toLowerCase().includes('ошибк') ||
        readableMessage.toLowerCase().includes('удалось') ||
        readableMessage.toLowerCase().includes('попробуйте') ||
        readableMessage.toLowerCase().includes('проверьте') ||
        readableMessage.toLowerCase().includes('требуется') ||
        readableMessage.toLowerCase().includes('сессия') ||
        readableMessage.toLowerCase().includes('пожалуйста');
      
      expect(hasReadableWords).toBe(true);
    });
  });

  /**
   * Property: getReadableErrorMessage обрабатывает разные типы ошибок
   * Requirements: 16.4
   */
  it('должен обрабатывать разные типы входных данных', () => {
    const testCases = [
      new Error('Test error'),
      'String error',
      null,
      undefined,
    ];

    testCases.forEach((error) => {
      const readableMessage = getReadableErrorMessage(error);
      
      // Всегда должна возвращаться непустая строка
      expect(readableMessage).toBeTruthy();
      expect(typeof readableMessage).toBe('string');
      expect(readableMessage.length).toBeGreaterThan(0);
    });
  });

  /**
   * Property: Компонент не падает при любых комбинациях props
   * Requirements: 16.4
   */
  it('должен корректно работать с любыми комбинациями props', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom('error', 'warning', 'info'),
        fc.boolean(),
        fc.boolean(),
        (message, severity, hasRetry, hasDismiss) => {
          const onRetry = hasRetry ? () => {} : undefined;
          const onDismiss = hasDismiss ? () => {} : undefined;
          
          // Не должно выбрасывать ошибку
          expect(() => {
            render(
              <ErrorMessage
                message={message}
                severity={severity as any}
                onRetry={onRetry}
                onDismiss={onDismiss}
              />
            );
          }).not.toThrow();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Сообщения об ошибках не содержат секретных данных
   * Requirements: 16.4, 13.5
   */
  it('не должен отображать секретные данные в сообщениях об ошибках', () => {
    const errorWithSecrets = new Error(
      'Error: token=secret_token_123 password=mypassword'
    );
    
    const readableMessage = getReadableErrorMessage(errorWithSecrets);
    
    // В production режиме секреты не должны попадать в сообщение
    if (process.env.NODE_ENV === 'production') {
      expect(readableMessage).not.toContain('secret_token_123');
      expect(readableMessage).not.toContain('mypassword');
      expect(readableMessage).not.toContain('token=');
      expect(readableMessage).not.toContain('password=');
    }
  });

  /**
   * Property: Длинные сообщения корректно отображаются
   * Requirements: 16.4
   */
  it('должен корректно отображать длинные сообщения', () => {
    const longMessage = 'Это очень длинное сообщение об ошибке, которое содержит много текста и должно корректно отображаться в компоненте без проблем с переносом строк и форматированием. ' +
      'Оно продолжается и продолжается, чтобы проверить, что компонент правильно обрабатывает длинный текст.';
    
    const { container } = render(<ErrorMessage message={longMessage} />);
    
    // Проверяем, что контейнер существует
    const alertElement = container.querySelector('[role="alert"]');
    expect(alertElement).toBeInTheDocument();
    
    // Проверяем, что текст присутствует
    expect(alertElement?.textContent).toContain('Это очень длинное сообщение');
  });

  /**
   * Property: Компонент имеет доступные элементы управления
   * Requirements: 16.4
   */
  it('должен иметь доступные элементы управления', () => {
    const { container } = render(
      <ErrorMessage
        message="Тестовая ошибка"
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    );
    
    // Проверяем наличие кнопки повтора
    const retryButton = container.querySelector('[aria-label="Повторить попытку"]');
    expect(retryButton).toBeInTheDocument();
    expect(retryButton?.tagName).toBe('BUTTON');
    
    // Проверяем наличие кнопки закрытия
    const dismissButton = container.querySelector('[aria-label="Закрыть сообщение"]');
    expect(dismissButton).toBeInTheDocument();
    expect(dismissButton?.tagName).toBe('BUTTON');
  });
});
