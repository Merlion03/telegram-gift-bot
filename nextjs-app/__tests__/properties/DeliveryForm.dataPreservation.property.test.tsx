/**
 * Property-based тест для сохранения данных формы
 * 
 * Feature: gift-form-confirmation-modal
 * Property 2: Сохранение данных формы
 * Validates: Requirements 1.3, 4.3, 6.3
 * 
 * Проверяет, что при любых операциях с модальным окном (открытие, закрытие через "Изменить",
 * закрытие через Escape, закрытие кликом вне окна) данные сохраняются в полях формы
 * до момента успешной отправки.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('Property 2: Сохранение данных формы', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('должен сохранять данные формы при закрытии модального окна через кнопку "Изменить"', async () => {
    await fc.assert(
      fc.asyncProperty(deliveryDataArbitrary, async (data) => {
        const user = userEvent.setup();
        
        const { unmount } = render(<DeliveryForm prizeId={1} />);
        
        try {
          // Заполняем форму
          await fillDeliveryForm(data);
          
          // Открываем модальное окно
          const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
          await user.click(submitButton);
          
          await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
          });
          
          // Закрываем через кнопку "Изменить"
          const editButton = screen.getByRole('button', { name: /Изменить/i });
          await user.click(editButton);
          
          // Ждём закрытия модального окна
          await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          });
          
          // Проверяем, что все данные остались в полях формы
          expect((screen.getByLabelText(/Фамилия/i) as HTMLInputElement).value).toBe(data.last_name);
          expect((screen.getByLabelText(/Имя/i) as HTMLInputElement).value).toBe(data.first_name);
          expect((screen.getByLabelText(/Страна/i) as HTMLInputElement).value).toBe(data.country);
          expect((screen.getByLabelText(/Почтовый индекс/i) as HTMLInputElement).value).toBe(data.postal_code);
          expect((screen.getByLabelText(/Город/i) as HTMLInputElement).value).toBe(data.city);
          expect((screen.getByLabelText(/Улица/i) as HTMLInputElement).value).toBe(data.street);
          expect((screen.getByLabelText(/Дом/i) as HTMLInputElement).value).toBe(data.house);
          expect((screen.getByLabelText(/Номер телефона/i) as HTMLInputElement).value).toBe(data.phone);
          
          if (data.patronymic) {
            expect((screen.getByLabelText(/Отчество/i) as HTMLInputElement).value).toBe(data.patronymic);
          }
          
          if (data.apartment) {
            expect((screen.getByLabelText(/Квартира/i) as HTMLInputElement).value).toBe(data.apartment);
          }
          
          if (data.comment) {
            expect((screen.getByLabelText(/Комментарий/i) as HTMLTextAreaElement).value).toBe(data.comment);
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 50 }
    );
  }, 60000);

  it('должен сохранять данные формы при закрытии модального окна через Escape', async () => {
    await fc.assert(
      fc.asyncProperty(deliveryDataArbitrary, async (data) => {
        const user = userEvent.setup();
        
        const { unmount } = render(<DeliveryForm prizeId={1} />);
        
        try {
          // Заполняем форму
          await fillDeliveryForm(data);
          
          // Открываем модальное окно
          const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
          await user.click(submitButton);
          
          await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
          });
          
          // Закрываем через Escape
          await user.keyboard('{Escape}');
          
          // Ждём закрытия модального окна
          await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          });
          
          // Проверяем, что все данные остались в полях формы
          expect((screen.getByLabelText(/Фамилия/i) as HTMLInputElement).value).toBe(data.last_name);
          expect((screen.getByLabelText(/Имя/i) as HTMLInputElement).value).toBe(data.first_name);
          expect((screen.getByLabelText(/Номер телефона/i) as HTMLInputElement).value).toBe(data.phone);
        } finally {
          unmount();
        }
      }),
      { numRuns: 50 }
    );
  }, 60000);

  it('должен сохранять данные формы при закрытии модального окна кликом вне окна', async () => {
    await fc.assert(
      fc.asyncProperty(deliveryDataArbitrary, async (data) => {
        const user = userEvent.setup();
        
        const { unmount, container } = render(<DeliveryForm prizeId={1} />);
        
        try {
          // Заполняем форму
          await fillDeliveryForm(data);
          
          // Открываем модальное окно
          const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
          await user.click(submitButton);
          
          await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
          });
          
          // Находим overlay (родитель dialog)
          const dialog = screen.getByRole('dialog');
          const overlay = dialog.parentElement;
          
          if (overlay) {
            // Кликаем на overlay (вне модального окна)
            await user.click(overlay);
          }
          
          // Ждём закрытия модального окна
          await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          });
          
          // Проверяем, что все данные остались в полях формы
          expect((screen.getByLabelText(/Фамилия/i) as HTMLInputElement).value).toBe(data.last_name);
          expect((screen.getByLabelText(/Имя/i) as HTMLInputElement).value).toBe(data.first_name);
          expect((screen.getByLabelText(/Номер телефона/i) as HTMLInputElement).value).toBe(data.phone);
        } finally {
          unmount();
        }
      }),
      { numRuns: 50 }
    );
  }, 60000);
});
