/**
 * Property-based тест для перехвата отправки формы
 * 
 * Feature: gift-form-confirmation-modal
 * Property 1: Перехват отправки формы
 * Validates: Requirements 1.1, 1.2
 * 
 * Проверяет, что при нажатии кнопки "Отправить данные" форма:
 * 1. НЕ отправляет HTTP запрос немедленно
 * 2. Открывает модальное окно подтверждения
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import { DeliveryForm } from '@/components/webapp/DeliveryForm';
import { deliveryDataArbitrary } from '../arbitraries/deliveryData.arbitrary';
import { fillDeliveryForm } from '../helpers/fillDeliveryForm';

// Мокируем Telegram WebApp SDK
vi.mock('@twa-dev/sdk', () => ({
  default: {
    initData: 'mock_init_data',
    showAlert: vi.fn(),
    close: vi.fn(),
  },
}));

describe('Property 1: Перехват отправки формы', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Создаём spy для отслеживания вызовов fetch
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('должен перехватывать отправку формы и открывать модальное окно вместо немедленной отправки HTTP запроса', async () => {
    await fc.assert(
      fc.asyncProperty(deliveryDataArbitrary, async (data) => {
        // Очищаем spy перед каждой итерацией
        fetchSpy.mockClear();
        
        const user = userEvent.setup();
        
        // Рендерим форму
        const { unmount } = render(<DeliveryForm prizeId={1} />);
        
        try {
          // Заполняем форму сгенерированными данными
          await fillDeliveryForm(data);
          
          // Нажимаем кнопку отправки
          const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
          await user.click(submitButton);
          
          // Проверяем, что HTTP запрос НЕ был отправлен
          expect(fetchSpy).not.toHaveBeenCalled();
          
          // Проверяем, что модальное окно открылось
          await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
          }, { timeout: 2000 });
          
          // Проверяем, что в модальном окне есть кнопки "Отправить" и "Изменить"
          expect(screen.getByRole('button', { name: /^Отправить$/i })).toBeInTheDocument();
          expect(screen.getByRole('button', { name: /Изменить/i })).toBeInTheDocument();
        } finally {
          unmount();
        }
      }),
      { numRuns: 50 } // 50 итераций для баланса между покрытием и скоростью
    );
  }, 60000); // Увеличиваем таймаут теста
});
