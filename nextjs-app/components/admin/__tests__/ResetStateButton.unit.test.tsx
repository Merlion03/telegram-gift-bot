/**
 * Unit тесты для ResetStateButton
 * Проверяют отображение, поведение и обработку ошибок компонента
 * Requirements: 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 6.1, 6.2, 6.3, 6.5, 7.1, 7.2
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResetStateButton } from '../ResetStateButton';

// Mock fetch API
global.fetch = vi.fn();

describe('ResetStateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  /**
   * Тест отображения кнопки для активной сессии
   * Requirements: 1.5
   */
  test('отображает кнопку для активной сессии и администратора', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  /**
   * Тест скрытия кнопки для закрытой сессии
   * Requirements: 1.6
   */
  test('НЕ отображает кнопку для закрытой сессии', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="closed"
      />
    );

    const button = screen.queryByRole('button');
    expect(button).not.toBeInTheDocument();
  });

  /**
   * Тест скрытия кнопки для пользователей без прав
   * Requirements: 7.1, 7.2
   */
  test('НЕ отображает кнопку для пользователей без прав (role = 0)', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={0}
        sessionStatus="active"
      />
    );

    const button = screen.queryByRole('button');
    expect(button).not.toBeInTheDocument();
  });

  test('НЕ отображает кнопку для пользователей без прав (role = 1)', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={1}
        sessionStatus="active"
      />
    );

    const button = screen.queryByRole('button');
    expect(button).not.toBeInTheDocument();
  });

  test('НЕ отображает кнопку для пользователей без прав (role = 4)', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={4}
        sessionStatus="active"
      />
    );

    const button = screen.queryByRole('button');
    expect(button).not.toBeInTheDocument();
  });

  /**
   * Тест текста кнопки для администратора
   * Requirements: 1.3, 2.3
   */
  test('отображает текст "🔄 Вызвать главное меню" для администратора (role = 2)', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('🔄 Вызвать главное меню');
  });

  /**
   * Тест текста кнопки для оператора
   * Requirements: 1.4, 2.3
   */
  test('отображает текст "🔄 Сбросить состояние" для оператора (role = 3)', () => {
    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={3}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('🔄 Сбросить состояние');
  });

  /**
   * Тест состояния кнопки во время сброса
   * Requirements: 2.1, 2.2, 6.2
   */
  test('кнопка неактивна и показывает "Сброс состояния..." во время операции', async () => {
    let resolvePromise: any;
    (global.fetch as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
    );

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Проверяем, что кнопка неактивна и текст изменился
    await vi.waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Сброс состояния...');
    }, { timeout: 1000 });

    // Завершаем операцию
    await act(async () => {
      resolvePromise({
        ok: true,
        json: async () => ({ success: true }),
      });
    });

    await vi.waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent('🔄 Вызвать главное меню');
    }, { timeout: 1000 });
  });

  /**
   * Тест отображения уведомления об успехе
   * Requirements: 6.1, 6.4
   */
  test('отображает уведомление об успехе после сброса состояния', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Состояние сброшено' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await screen.findByText(/Состояние пользователя успешно сброшено/i);
  });

  /**
   * Тест автоматического скрытия уведомления через 3 секунды
   * Requirements: 6.4
   */
  test('автоматически скрывает уведомление об успехе через 3 секунды', async () => {
    vi.useFakeTimers();
    
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Ждём завершения fetch
    await vi.waitFor(() => {
      expect(screen.getByText(/Состояние пользователя успешно сброшено/i)).toBeInTheDocument();
    }, { timeout: 1000 });

    // Проматываем время на 3 секунды
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Уведомление исчезает
    expect(screen.queryByText(/Состояние пользователя успешно сброшено/i)).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });

  /**
   * Тест отображения сообщения об ошибке
   * Requirements: 6.5
   */
  test('отображает сообщение об ошибке при неудачном сбросе', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error', message: 'Произошла ошибка' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Используем findBy для асинхронного ожидания
    const errorMessage = await screen.findByText(/Произошла внутренняя ошибка/i);
    expect(errorMessage).toBeInTheDocument();
  });

  /**
   * Тест кнопки "Повторить попытку"
   * Requirements: 6.6
   */
  test('отображает кнопку "Повторить попытку" при ошибке', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Service unavailable' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Используем findBy для асинхронного ожидания
    const retryButton = await screen.findByText(/Повторить попытку/i);
    expect(retryButton).toBeInTheDocument();
  });

  test('НЕ отображает кнопку "Повторить попытку" для ошибки 403', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Ждём появления сообщения об ошибке
    await screen.findByText(/недостаточно прав/i);

    expect(screen.queryByText(/Повторить попытку/i)).not.toBeInTheDocument();
  });

  test('повторная попытка вызывает fetch снова', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Ждём ошибки
    await screen.findByText(/Бот временно недоступен/i);

    // Нажимаем "Повторить попытку"
    const retryButton = screen.getByText(/Повторить попытку/i);
    fireEvent.click(retryButton);

    // Проверяем успешное выполнение
    await screen.findByText(/Состояние пользователя успешно сброшено/i);
    
    // Проверяем, что fetch был вызван второй раз
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  /**
   * Тест вызова callback onSuccess
   * Requirements: 6.1
   */
  test('вызывает callback onSuccess при успешном сбросе', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const onSuccess = vi.fn();

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
        onSuccess={onSuccess}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Ждём вызова callback
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    }, { timeout: 1000 });
  });

  /**
   * Тест вызова callback onError
   * Requirements: 6.5
   */
  test('вызывает callback onError при ошибке', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });

    const onError = vi.fn();

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
        onError={onError}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Ждём вызова callback
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Произошла внутренняя ошибка'));
    }, { timeout: 1000 });
  });

  /**
   * Тест обработки timeout предупреждения
   * Requirements: 6.3
   */
  test('отображает предупреждение о задержке через 5 секунд', async () => {
    vi.useFakeTimers();
    
    let resolvePromise: any;
    (global.fetch as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
    );

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Проматываем время на 5 секунд
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Проверяем предупреждение
    expect(screen.getByText(/Операция занимает больше времени/i)).toBeInTheDocument();

    // Завершаем операцию
    await act(async () => {
      resolvePromise({
        ok: true,
        json: async () => ({ success: true }),
      });
    });

    // Ждём обновления состояния
    await vi.waitFor(() => {
      expect(screen.queryByText(/Операция занимает больше времени/i)).not.toBeInTheDocument();
    }, { timeout: 1000 });
    
    vi.useRealTimers();
  });

  /**
   * Тест abort через 30 секунд
   * Requirements: 6.3
   */
  test('отменяет запрос через 30 секунд', async () => {
    vi.useFakeTimers();
    
    let rejectPromise: any;
    (global.fetch as any).mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          rejectPromise = reject;
        })
    );

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Проматываем время на 30 секунд и отменяем запрос
    await act(async () => {
      vi.advanceTimersByTime(30000);
      rejectPromise(new DOMException('The user aborted a request.', 'AbortError'));
    });

    // Ждём обновления состояния
    await vi.waitFor(() => {
      expect(screen.getByText(/Операция заняла слишком много времени/i)).toBeInTheDocument();
    }, { timeout: 1000 });
    
    vi.useRealTimers();
  });

  /**
   * Тест маппинга ошибок
   * Requirements: 6.5
   */
  test('отображает правильное сообщение для ошибки 401', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await screen.findByText(/Требуется авторизация/i, {}, { timeout: 3000 });
  });

  test('отображает правильное сообщение для ошибки 404', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await screen.findByText(/Сессия не найдена/i, {}, { timeout: 3000 });
  });

  test('отображает правильное сообщение для ошибки 400', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    });

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await screen.findByText(/Сессия уже завершена/i, {}, { timeout: 3000 });
  });

  /**
   * Тест обработки network ошибок
   * Requirements: 6.5
   */
  test('отображает сообщение о проблемах с соединением при network ошибке', async () => {
    (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <ResetStateButton
        sessionId={1}
        telegramId={123456}
        userRole={2}
        sessionStatus="active"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await screen.findByText(/Не удалось подключиться к серверу/i, {}, { timeout: 3000 });
  });

  /**
   * Тесты модального окна подтверждения
   */
  describe('Модальное окно подтверждения', () => {
    test('показывает модальное окно при клике на кнопку', async () => {
      render(
        <ResetStateButton
          sessionId={1}
          telegramId={123456}
          userRole={2}
          sessionStatus="active"
        />
      );

      const button = screen.getByRole('button', { name: /Вызвать главное меню/i });
      fireEvent.click(button);

      // Проверяем, что модальное окно появилось
      await screen.findByText('Вы точно уверены?');
      expect(screen.getByText('Это действие вызовет главное меню у пользователя')).toBeInTheDocument();
    });

    test('закрывает модальное окно при клике на "Нет"', async () => {
      render(
        <ResetStateButton
          sessionId={1}
          telegramId={123456}
          userRole={2}
          sessionStatus="active"
        />
      );

      const button = screen.getByRole('button', { name: /Вызвать главное меню/i });
      fireEvent.click(button);

      // Ждём появления модального окна
      await screen.findByText('Вы точно уверены?');

      // Кликаем "Нет"
      const cancelButton = screen.getByText('Нет');
      fireEvent.click(cancelButton);

      // Проверяем, что модальное окно закрылось
      await vi.waitFor(() => {
        expect(screen.queryByText('Вы точно уверены?')).not.toBeInTheDocument();
      }, { timeout: 1000 });

      // Проверяем, что fetch НЕ был вызван
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('выполняет сброс состояния при клике на "Да"', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(
        <ResetStateButton
          sessionId={1}
          telegramId={123456}
          userRole={2}
          sessionStatus="active"
        />
      );

      const button = screen.getByRole('button', { name: /Вызвать главное меню/i });
      fireEvent.click(button);

      // Ждём появления модального окна
      await screen.findByText('Вы точно уверены?');

      // Кликаем "Да"
      const confirmButton = screen.getByText('Да');
      fireEvent.click(confirmButton);

      // Проверяем, что модальное окно закрылось
      await vi.waitFor(() => {
        expect(screen.queryByText('Вы точно уверены?')).not.toBeInTheDocument();
      }, { timeout: 1000 });

      // Проверяем, что fetch был вызван
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/support/sessions/1/reset-state',
        expect.objectContaining({
          method: 'POST',
        })
      );

      // Проверяем успешное уведомление
      await screen.findByText(/Состояние пользователя успешно сброшено/i);
    });

    test('НЕ показывает модальное окно во время выполнения операции', async () => {
      let resolvePromise: any;
      (global.fetch as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
      );

      render(
        <ResetStateButton
          sessionId={1}
          telegramId={123456}
          userRole={2}
          sessionStatus="active"
        />
      );

      const button = screen.getByRole('button', { name: /Вызвать главное меню/i });
      
      // Первый клик - открываем модальное окно
      fireEvent.click(button);
      await screen.findByText('Вы точно уверены?');

      // Подтверждаем
      const confirmButton = screen.getByText('Да');
      fireEvent.click(confirmButton);

      // Ждём начала операции
      await vi.waitFor(() => {
        expect(button).toBeDisabled();
      }, { timeout: 1000 });

      // Пытаемся кликнуть снова (кнопка должна быть неактивна)
      fireEvent.click(button);

      // Модальное окно НЕ должно появиться снова
      expect(screen.queryByText('Вы точно уверены?')).not.toBeInTheDocument();

      // Завершаем операцию
      await act(async () => {
        resolvePromise({
          ok: true,
          json: async () => ({ success: true }),
        });
      });
    });
  });
});
