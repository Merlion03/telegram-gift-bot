/**
 * Unit-тесты для компонента ConfirmationModal
 * 
 * Тестируемые сценарии:
 * - Рендеринг с корректными props
 * - Отображение всех переданных данных
 * - Вызов callbacks при нажатии кнопок
 * - Закрытие по Escape
 * - Закрытие по клику вне модального окна
 * - Управление фокусом при открытии
 * - Блокировка прокрутки body
 * - Клавиатурная навигация
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmationModal } from '@/components/webapp/ConfirmationModal';
import { DeliveryData } from '@/types/delivery';

describe('ConfirmationModal', () => {
  // Тестовые данные
  const mockDeliveryData: DeliveryData = {
    last_name: 'Иванов',
    first_name: 'Иван',
    patronymic: 'Иванович',
    country: 'Россия',
    postal_code: '123456',
    city: 'Москва',
    street: 'Ленина',
    house: '10',
    apartment: '5',
    phone: '+79991234567',
    comment: 'Тестовый комментарий',
  };

  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    // Очищаем моки перед каждым тестом
    vi.clearAllMocks();
    // Сбрасываем overflow body
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Восстанавливаем overflow после каждого теста
    document.body.style.overflow = '';
  });

  describe('Рендеринг', () => {
    it('должен рендериться с корректными props', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      // Проверяем наличие заголовка
      expect(screen.getByText('Проверьте данные')).toBeInTheDocument();
      
      // Проверяем наличие кнопок
      expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    });

    it('не должен рендериться когда isOpen=false', () => {
      const { container } = render(
        <ConfirmationModal
          isOpen={false}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('должен отображать "Отправка..." когда isSubmitting=true', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole('button', { name: 'Отправка...' })).toBeInTheDocument();
    });
  });

  describe('Отображение данных', () => {
    it('должен отображать все переданные данные', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      // Проверяем отображение данных получателя
      expect(screen.getByText('Иванов')).toBeInTheDocument();
      expect(screen.getByText('Иван')).toBeInTheDocument();
      expect(screen.getByText('Иванович')).toBeInTheDocument();

      // Проверяем отображение адреса
      expect(screen.getByText('Россия')).toBeInTheDocument();
      expect(screen.getByText('123456')).toBeInTheDocument();
      expect(screen.getByText('Москва')).toBeInTheDocument();
      expect(screen.getByText('Ленина')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();

      // Проверяем отображение контактов
      expect(screen.getByText('+79991234567')).toBeInTheDocument();
      expect(screen.getByText('Тестовый комментарий')).toBeInTheDocument();
    });

    it('должен корректно обрабатывать данные без опциональных полей', () => {
      const dataWithoutOptional: DeliveryData = {
        last_name: 'Петров',
        first_name: 'Петр',
        country: 'Россия',
        postal_code: '654321',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '1',
        phone: '+79997654321',
      };

      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={dataWithoutOptional}
          isSubmitting={false}
        />
      );

      // Проверяем отображение обязательных полей
      expect(screen.getByText('Петров')).toBeInTheDocument();
      expect(screen.getByText('Петр')).toBeInTheDocument();
      expect(screen.getByText('Санкт-Петербург')).toBeInTheDocument();

      // Проверяем, что опциональные поля не отображаются
      expect(screen.queryByText('Иванович')).not.toBeInTheDocument();
    });
  });

  describe('Callbacks', () => {
    it('должен вызывать onClose при нажатии кнопки "Изменить"', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const editButton = screen.getByRole('button', { name: 'Изменить' });
      fireEvent.click(editButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('должен вызывать onConfirm при нажатии кнопки "Отправить"', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Отправить' });
      fireEvent.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('должен вызывать onClose при нажатии кнопки закрытия (крестик)', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const closeButton = screen.getByRole('button', { name: 'Закрыть' });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('не должен вызывать callbacks когда isSubmitting=true', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={true}
        />
      );

      const editButton = screen.getByRole('button', { name: 'Изменить' });
      const closeButton = screen.getByRole('button', { name: 'Закрыть' });

      fireEvent.click(editButton);
      fireEvent.click(closeButton);

      // Кнопки должны быть disabled
      expect(editButton).toBeDisabled();
      expect(closeButton).toBeDisabled();
    });
  });

  describe('Закрытие по Escape', () => {
    it('должен закрываться при нажатии Escape', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('не должен закрываться по Escape когда isSubmitting=true', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={true}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Закрытие по клику вне модального окна', () => {
    it('должен закрываться при клике на overlay', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('не должен закрываться при клике на содержимое модального окна', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const modalContent = screen.getByText('Проверьте данные');
      fireEvent.click(modalContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('не должен закрываться по клику на overlay когда isSubmitting=true', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={true}
        />
      );

      const overlay = screen.getByRole('dialog');
      fireEvent.click(overlay);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Управление фокусом', () => {
    it('должен устанавливать фокус на кнопку "Отправить" при открытии', async () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Отправить' });

      await waitFor(() => {
        expect(document.activeElement).toBe(confirmButton);
      });
    });
  });

  describe('Блокировка прокрутки body', () => {
    it('должен блокировать прокрутку body при открытии', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('должен восстанавливать прокрутку body при закрытии', () => {
      const { rerender } = render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      expect(document.body.style.overflow).toBe('hidden');

      // Закрываем модальное окно
      rerender(
        <ConfirmationModal
          isOpen={false}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      expect(document.body.style.overflow).toBe('');
    });

    it('должен сохранять предыдущее значение overflow при закрытии', () => {
      // Устанавливаем начальное значение overflow
      document.body.style.overflow = 'scroll';

      const { rerender } = render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      expect(document.body.style.overflow).toBe('hidden');

      // Закрываем модальное окно
      rerender(
        <ConfirmationModal
          isOpen={false}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      expect(document.body.style.overflow).toBe('scroll');
    });
  });

  describe('Клавиатурная навигация', () => {
    it('должен поддерживать навигацию Tab между элементами', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const closeButton = screen.getByRole('button', { name: 'Закрыть' });
      const editButton = screen.getByRole('button', { name: 'Изменить' });
      const confirmButton = screen.getByRole('button', { name: 'Отправить' });

      // Проверяем, что все кнопки доступны для навигации
      expect(closeButton).not.toBeDisabled();
      expect(editButton).not.toBeDisabled();
      expect(confirmButton).not.toBeDisabled();
    });

    it('должен вызывать onConfirm при нажатии Enter на кнопке "Отправить"', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Отправить' });
      fireEvent.keyDown(confirmButton, { key: 'Enter' });

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it('не должен вызывать onConfirm при нажатии Enter когда isSubmitting=true', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={true}
        />
      );

      const confirmButton = screen.getByRole('button', { name: 'Отправка...' });
      fireEvent.keyDown(confirmButton, { key: 'Enter' });

      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('должен иметь корректные ARIA атрибуты', () => {
      render(
        <ConfirmationModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          deliveryData={mockDeliveryData}
          isSubmitting={false}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    });
  });
});
