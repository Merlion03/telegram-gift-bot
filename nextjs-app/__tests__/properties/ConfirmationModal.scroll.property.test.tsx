/**
 * Property-тесты для управления фокусом и блокировки прокрутки
 * 
 * Property 13: Управление фокусом
 * Property 14: Блокировка прокрутки
 * Validates: Requirements 8.3, 8.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { ConfirmationModal } from '@/components/webapp/ConfirmationModal';
import { DeliveryData } from '@/types/delivery';

// Генератор валидных данных доставки
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

describe('Property 14: Блокировка прокрутки', () => {
  beforeEach(() => {
    // Сбрасываем overflow body перед каждым тестом
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Восстанавливаем overflow после каждого теста
    document.body.style.overflow = '';
  });

  it('должен блокировать прокрутку body при открытии для любых валидных данных', () => {
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

        // Проверяем, что overflow установлен в hidden
        expect(document.body.style.overflow).toBe('hidden');

        unmount();
        cleanup();
      }),
      { numRuns: 100 }
    );
  });

  it('должен восстанавливать прокрутку body при закрытии для любых валидных данных', () => {
    fc.assert(
      fc.property(deliveryDataArbitrary, (data: DeliveryData) => {
        const mockOnClose = vi.fn();
        const mockOnConfirm = vi.fn();

        // Сохраняем начальное значение overflow
        const initialOverflow = document.body.style.overflow;

        const { unmount } = render(
          <ConfirmationModal
            isOpen={true}
            onClose={mockOnClose}
            onConfirm={mockOnConfirm}
            deliveryData={data}
            isSubmitting={false}
          />
        );

        // Проверяем, что overflow установлен в hidden
        expect(document.body.style.overflow).toBe('hidden');

        // Размонтируем компонент (эквивалент закрытия)
        unmount();

        // Проверяем, что overflow восстановлен
        expect(document.body.style.overflow).toBe(initialOverflow);

        cleanup();
      }),
      { numRuns: 100 }
    );
  });

  it('должен сохранять предыдущее значение overflow при закрытии', () => {
    fc.assert(
      fc.property(
        deliveryDataArbitrary,
        fc.constantFrom('scroll', 'auto', 'visible', ''),
        (data: DeliveryData, initialOverflow: string) => {
          const mockOnClose = vi.fn();
          const mockOnConfirm = vi.fn();

          // Устанавливаем начальное значение overflow
          document.body.style.overflow = initialOverflow;

          const { unmount } = render(
            <ConfirmationModal
              isOpen={true}
              onClose={mockOnClose}
              onConfirm={mockOnConfirm}
              deliveryData={data}
              isSubmitting={false}
            />
          );

          // Проверяем, что overflow установлен в hidden
          expect(document.body.style.overflow).toBe('hidden');

          // Размонтируем компонент
          unmount();

          // Проверяем, что overflow восстановлен к начальному значению
          expect(document.body.style.overflow).toBe(initialOverflow);

          cleanup();
        }
      ),
      { numRuns: 100 }
    );
  });
});
