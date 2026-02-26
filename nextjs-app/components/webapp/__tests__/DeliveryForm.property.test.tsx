/**
 * Property-based тесты для компонента DeliveryForm
 * 
 * Property 9: Закрытие WebApp после успешного сохранения
 * 
 * Validates: Requirements 3.5, 4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { fc, test } from '@fast-check/vitest';
import { DeliveryForm } from '../DeliveryForm';

// Мок для @telegram-apps/sdk-react
vi.mock('@telegram-apps/sdk-react', () => ({
  useInitData: vi.fn(),
  useWebApp: vi.fn(),
}));

import { useInitData, useWebApp } from '@telegram-apps/sdk-react';

describe('DeliveryForm - Property-Based Tests', () => {
  const mockInitData = {
    raw: 'auth_date=1234567890&user=%7B%22id%22%3A12345%7D&hash=test_hash',
  };

  const mockWebApp = {
    showAlert: vi.fn((message: string, callback?: () => void) => {
      if (callback) callback();
    }),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Настройка моков
    (useInitData as any).mockReturnValue(mockInitData);
    (useWebApp as any).mockReturnValue(mockWebApp);
    
    // Мок для fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    // Очистка DOM после каждого теста
    cleanup();
  });

  /**
   * Property 9: Закрытие WebApp после успешного сохранения
   * 
   * Requirement 4.6: WHEN данные успешно сохранены, THE WebApp SHALL отобразить 
   * сообщение об успехе и закрыться
   * 
   * Requirement 3.5: THE WebApp SHALL запрашивать следующие поля: ФИО, адрес доставки, 
   * номер телефона, комментарий (опционально)
   * 
   * Свойство: Для любых валидных данных формы, при успешном ответе от API (200 OK),
   * WebApp должен:
   * 1. Вызвать webApp.showAlert с сообщением об успехе
   * 2. Вызвать webApp.close() для закрытия WebApp
   * 3. Не показывать сообщение об ошибке
   */
  describe('Property 9: Закрытие WebApp после успешного сохранения', () => {
    // Генератор валидных данных формы
    const validFormDataArbitrary = fc.record({
      full_name: fc.string({ minLength: 2, maxLength: 50 })
        .map(s => s.trim())
        .filter(s => s.length >= 2),
      address: fc.string({ minLength: 10, maxLength: 100 })
        .map(s => s.trim())
        .filter(s => s.length >= 10),
      phone: fc.oneof(
        // С плюсом
        fc.integer({ min: 1000000000, max: 999999999999999 }).map(n => `+${n}`),
        // Без плюса
        fc.integer({ min: 1000000000, max: 999999999999999 }).map(n => `${n}`)
      ),
      comment: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      prize_id: fc.integer({ min: 1, max: 1000 }),
    });

    test.prop([validFormDataArbitrary], { numRuns: 50, timeout: 10000 })(
      'должен закрыть WebApp после успешной отправки валидных данных',
      async (formData) => {
        // Очистка DOM перед каждой итерацией
        cleanup();
        
        // Восстановление моков
        (useInitData as any).mockReturnValue(mockInitData);
        (useWebApp as any).mockReturnValue(mockWebApp);
        vi.clearAllMocks();
        
        // Мок успешного ответа от API
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

        const { container } = render(<DeliveryForm prizeId={formData.prize_id} />);

        // Заполняем форму напрямую через fireEvent для скорости
        const fullNameInput = container.querySelector('#full_name') as HTMLInputElement;
        const addressInput = container.querySelector('#address') as HTMLTextAreaElement;
        const phoneInput = container.querySelector('#phone') as HTMLInputElement;
        const commentInput = container.querySelector('#comment') as HTMLTextAreaElement;
        const form = container.querySelector('form') as HTMLFormElement;

        fireEvent.change(fullNameInput, { target: { value: formData.full_name } });
        fireEvent.change(addressInput, { target: { value: formData.address } });
        fireEvent.change(phoneInput, { target: { value: formData.phone } });
        
        if (formData.comment) {
          fireEvent.change(commentInput, { target: { value: formData.comment } });
        }

        // Отправляем форму
        fireEvent.submit(form);

        // Проверяем, что fetch был вызван с правильными данными
        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/delivery',
            expect.objectContaining({
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            })
          );
        }, { timeout: 3000 });

        // Проверяем тело запроса
        const fetchCall = (global.fetch as any).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        
        expect(requestBody.full_name).toBe(formData.full_name);
        expect(requestBody.address).toBe(formData.address);
        expect(requestBody.phone).toBe(formData.phone);
        expect(requestBody.prize_id).toBe(formData.prize_id);
        expect(requestBody.initData).toBe(mockInitData.raw);
        
        if (formData.comment) {
          expect(requestBody.comment).toBe(formData.comment);
        }

        // Проверяем, что webApp.showAlert был вызван с сообщением об успехе
        await waitFor(() => {
          expect(mockWebApp.showAlert).toHaveBeenCalledWith(
            'Данные успешно сохранены!',
            expect.any(Function)
          );
        }, { timeout: 3000 });

        // Проверяем, что webApp.close был вызван
        await waitFor(() => {
          expect(mockWebApp.close).toHaveBeenCalled();
        }, { timeout: 3000 });

        // Проверяем, что сообщение об ошибке не отображается
        const errorMessage = screen.queryByText(/Произошла ошибка/);
        expect(errorMessage).not.toBeInTheDocument();
      }
    );

    test.prop([validFormDataArbitrary], { numRuns: 30, timeout: 15000 })(
      'должен показать ошибку и НЕ закрыть WebApp при неуспешном ответе API',
      async (formData) => {
        // Очистка DOM перед каждой итерацией
        cleanup();
        
        // Восстановление моков
        (useInitData as any).mockReturnValue(mockInitData);
        (useWebApp as any).mockReturnValue(mockWebApp);
        vi.clearAllMocks();
        
        // Мок неуспешного ответа от API
        (global.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' }),
        });

        const { container } = render(<DeliveryForm prizeId={formData.prize_id} />);

        // Заполняем форму напрямую через fireEvent для скорости
        const fullNameInput = container.querySelector('#full_name') as HTMLInputElement;
        const addressInput = container.querySelector('#address') as HTMLTextAreaElement;
        const phoneInput = container.querySelector('#phone') as HTMLInputElement;
        const form = container.querySelector('form') as HTMLFormElement;

        fireEvent.change(fullNameInput, { target: { value: formData.full_name } });
        fireEvent.change(addressInput, { target: { value: formData.address } });
        fireEvent.change(phoneInput, { target: { value: formData.phone } });

        // Отправляем форму
        fireEvent.submit(form);

        // Проверяем, что fetch был вызван
        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalled();
        }, { timeout: 3000 });

        // Проверяем, что webApp.close НЕ был вызван
        await waitFor(() => {
          expect(mockWebApp.close).not.toHaveBeenCalled();
        }, { timeout: 3000 });

        // Проверяем, что отображается сообщение об ошибке
        await waitFor(() => {
          const errorMessage = screen.getByText(/Internal server error/);
          expect(errorMessage).toBeInTheDocument();
        }, { timeout: 3000 });
      }
    );

    test.prop([fc.integer({ min: 1, max: 1000 })], { numRuns: 30, timeout: 15000 })(
      'должен показать ошибку если InitData недоступны',
      async (prizeId) => {
        // Очистка DOM перед каждой итерацией
        cleanup();
        
        // Мок отсутствия InitData
        (useInitData as any).mockReturnValue(null);
        (useWebApp as any).mockReturnValue(mockWebApp);
        vi.clearAllMocks();

        const { container } = render(<DeliveryForm prizeId={prizeId} />);

        // Заполняем форму валидными данными
        const fullNameInput = container.querySelector('#full_name') as HTMLInputElement;
        const addressInput = container.querySelector('#address') as HTMLTextAreaElement;
        const phoneInput = container.querySelector('#phone') as HTMLInputElement;
        const form = container.querySelector('form') as HTMLFormElement;

        fireEvent.change(fullNameInput, { target: { value: 'Иван Иванов' } });
        fireEvent.change(addressInput, { target: { value: 'г. Москва, ул. Ленина, д. 1, кв. 1' } });
        fireEvent.change(phoneInput, { target: { value: '+79991234567' } });

        // Отправляем форму
        fireEvent.submit(form);

        // Проверяем, что fetch НЕ был вызван
        await waitFor(() => {
          expect(global.fetch).not.toHaveBeenCalled();
        }, { timeout: 1000 });

        // Проверяем, что отображается сообщение об ошибке
        await waitFor(() => {
          // Ищем сообщение об ошибке, которое содержит текст про InitData
          const errorMessage = screen.getByText(/InitData недоступны/i);
          expect(errorMessage).toBeInTheDocument();
        }, { timeout: 3000 });

        // Проверяем, что webApp.close НЕ был вызван
        expect(mockWebApp.close).not.toHaveBeenCalled();
      }
    );
  });
});
