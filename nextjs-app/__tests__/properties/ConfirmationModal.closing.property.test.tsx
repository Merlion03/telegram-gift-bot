/**
 * Property-тест для способов закрытия модального окна
 * 
 * Property 10: Способы закрытия модального окна
 * Validates: Requirements 6.1, 6.2, 6.4
 * 
 * Для любого открытого модального окна, пользователь должен иметь возможность 
 * закрыть его четырьмя способами: кнопка "Изменить", кнопка закрытия (крестик), 
 * клик вне модального окна, клавиша Escape - и во всех случаях данные должны сохраниться.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import { ConfirmationModal } from '@/components/webapp/ConfirmationModal';
import { DeliveryData } from '@/types/delivery';

// Генератор валидных данных доставки
// Используем alphanumeric для генерации читаемых строк без пробелов
const deliveryDataArbitrary = fc.record({
  last_name: fc.stringMatching(/^[A-Za-zА-Яа-я]{2,50}$/),
  first_name: fc.stringMatching(/^[A-Za-zА-Яа-я]{2,50}$/),
  patronymic: fc.option(fc.stringMatching(/^[A-Za-zА-Яа-я]{2,50}$/), { nil: undefined }),
  country: fc.stringMatching(/^[A-Za-zА-Яа-я]{2,100}$/),
  postal_code: fc.stringMatching(/^[0-9]{3,20}$/),
  city: fc.stringMatching(/^[A-Za-zА-Яа-я]{2,100}$/),
  street: fc.stringMatching(/^[A-Za-zА-Яа-я0-9]{2,200}$/),
  house: fc.stringMatching(/^[0-9A-Za-zА-Яа-я]{1,20}$/),
  apartment: fc.option(fc.stringMatching(/^[0-9A-Za-zА-Яа-я]{1,20}$/), { nil: undefined }),
  phone: fc.stringMatching(/^\+[0-9]{10,15}$/),
  comment: fc.option(fc.stringMatching(/^[A-Za-zА-Яа-я0-9\s]{1,500}$/), { nil: undefined }),
});

describe('Property 10: Способы закрытия модального окна', () => {
  beforeEach(() => {
    // Сбрасываем overflow body перед каждым тестом
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Восстанавливаем overflow после каждого теста
    document.body.style.overflow = '';
  });

  it('должен закрываться через кнопку "Изменить" для любых валидных данных', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data: DeliveryData) => {
        const mockOnClose = vi.fn();
        const mockOnConfirm = vi.fn();

        const { unmount } = render(
          <ConfirmationModal
            isOpen={true}
            onClose={mockOnClose}
            onConfirm={mockOnConfirm}
            deliveryData={data}
            isSubmitting={false}
          />
        );

        // Нажимаем кнопку "Изменить"
        const editButton = screen.getByRole('button', { name: 'Изменить' });
        fireEvent.click(editButton);

        // Проверяем, что onClose был вызван
        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(mockOnConfirm).not.toHaveBeenCalled();

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('должен закрываться через кнопку закрытия (крестик) для любых валидных данных', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data: DeliveryData) => {
        const mockOnClose = vi.fn();
        const mockOnConfirm = vi.fn();

        const { unmount } = render(
          <ConfirmationModal
            isOpen={true}
            onClose={mockOnClose}
            onConfirm={mockOnConfirm}
            deliveryData={data}
            isSubmitting={false}
          />
        );

        // Нажимаем кнопку закрытия (крестик)
        const closeButton = screen.getByRole('button', { name: 'Закрыть' });
        fireEvent.click(closeButton);

        // Проверяем, что onClose был вызван
        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(mockOnConfirm).not.toHaveBeenCalled();

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('должен закрываться через клик вне модального окна для любых валидных данных', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data: DeliveryData) => {
        const mockOnClose = vi.fn();
        const mockOnConfirm = vi.fn();

        const { unmount } = render(
          <ConfirmationModal
            isOpen={true}
            onClose={mockOnClose}
            onConfirm={mockOnConfirm}
            deliveryData={data}
            isSubmitting={false}
          />
        );

        // Кликаем на overlay (вне модального окна)
        const overlay = screen.getByRole('dialog');
        fireEvent.click(overlay);

        // Проверяем, что onClose был вызван
        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(mockOnConfirm).not.toHaveBeenCalled();

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('должен закрываться через клавишу Escape для любых валидных данных', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data: DeliveryData) => {
        const mockOnClose = vi.fn();
        const mockOnConfirm = vi.fn();

        const { unmount } = render(
          <ConfirmationModal
            isOpen={true}
            onClose={mockOnClose}
            onConfirm={mockOnConfirm}
            deliveryData={data}
            isSubmitting={false}
          />
        );

        // Нажимаем клавишу Escape
        fireEvent.keyDown(document, { key: 'Escape' });

        // Проверяем, что onClose был вызван
        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(mockOnConfirm).not.toHaveBeenCalled();

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('должен сохранять данные при закрытии любым способом', () => {
    fc.assert(
      fc.property(
        deliveryDataArbitrary,
        fc.constantFrom('edit', 'close', 'overlay', 'escape'),
        (data: DeliveryData, closeMethod: string) => {
          const mockOnClose = vi.fn();
          const mockOnConfirm = vi.fn();

          const { unmount } = render(
            <ConfirmationModal
              isOpen={true}
              onClose={mockOnClose}
              onConfirm={mockOnConfirm}
              deliveryData={data}
              isSubmitting={false}
            />
          );

          // Проверяем, что данные отображаются перед закрытием
          expect(screen.getByText(data.last_name)).toBeInTheDocument();
          expect(screen.getByText(data.first_name)).toBeInTheDocument();

          // Закрываем модальное окно выбранным способом
          switch (closeMethod) {
            case 'edit':
              fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
              break;
            case 'close':
              fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
              break;
            case 'overlay':
              fireEvent.click(screen.getByRole('dialog'));
              break;
            case 'escape':
              fireEvent.keyDown(document, { key: 'Escape' });
              break;
          }

          // Проверяем, что onClose был вызван (данные сохраняются через callback)
          expect(mockOnClose).toHaveBeenCalledTimes(1);
          
          // Проверяем, что onConfirm НЕ был вызван (данные не отправлены)
          expect(mockOnConfirm).not.toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('не должен закрываться ни одним способом когда isSubmitting=true', () => {
    fc.assert(
      fc.property(
        deliveryDataArbitrary,
        fc.constantFrom('edit', 'close', 'overlay', 'escape'),
        (data: DeliveryData, closeMethod: string) => {
          const mockOnClose = vi.fn();
          const mockOnConfirm = vi.fn();

          const { unmount } = render(
            <ConfirmationModal
              isOpen={true}
              onClose={mockOnClose}
              onConfirm={mockOnConfirm}
              deliveryData={data}
              isSubmitting={true}
            />
          );

          // Пытаемся закрыть модальное окно выбранным способом
          switch (closeMethod) {
            case 'edit':
            case 'close':
              // Кнопки должны быть disabled, но попробуем кликнуть
              const buttons = screen.getAllByRole('button');
              buttons.forEach(button => {
                if (!button.hasAttribute('disabled')) {
                  fireEvent.click(button);
                }
              });
              break;
            case 'overlay':
              fireEvent.click(screen.getByRole('dialog'));
              break;
            case 'escape':
              fireEvent.keyDown(document, { key: 'Escape' });
              break;
          }

          // Проверяем, что onClose НЕ был вызван
          expect(mockOnClose).not.toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
