import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useConfirmationModal } from '@/hooks/webapp/useConfirmationModal';
import { DeliveryData } from '@/types/delivery';

describe('useConfirmationModal', () => {
  // Тестовые данные доставки
  const mockDeliveryData: DeliveryData = {
    last_name: 'Иванов',
    first_name: 'Иван',
    patronymic: 'Иванович',
    country: 'Россия',
    postal_code: '123456',
    city: 'Москва',
    street: 'Ленина',
    house: '10',
    apartment: '25',
    phone: '+79991234567',
    comment: 'Позвонить за час',
  };

  describe('Начальное состояние', () => {
    it('должен возвращать закрытое модальное окно', () => {
      const { result } = renderHook(() => useConfirmationModal());

      expect(result.current.isOpen).toBe(false);
    });

    it('должен возвращать null для deliveryData', () => {
      const { result } = renderHook(() => useConfirmationModal());

      expect(result.current.deliveryData).toBeNull();
    });

    it('должен предоставлять функции openModal и closeModal', () => {
      const { result } = renderHook(() => useConfirmationModal());

      expect(typeof result.current.openModal).toBe('function');
      expect(typeof result.current.closeModal).toBe('function');
    });
  });

  describe('Открытие модального окна', () => {
    it('должен открывать модальное окно при вызове openModal', () => {
      const { result } = renderHook(() => useConfirmationModal());

      act(() => {
        result.current.openModal(mockDeliveryData);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('должен сохранять переданные данные доставки', () => {
      const { result } = renderHook(() => useConfirmationModal());

      act(() => {
        result.current.openModal(mockDeliveryData);
      });

      expect(result.current.deliveryData).toEqual(mockDeliveryData);
    });

    it('должен обновлять данные при повторном вызове openModal', () => {
      const { result } = renderHook(() => useConfirmationModal());

      const updatedData: DeliveryData = {
        ...mockDeliveryData,
        last_name: 'Петров',
        first_name: 'Петр',
      };

      act(() => {
        result.current.openModal(mockDeliveryData);
      });

      act(() => {
        result.current.openModal(updatedData);
      });

      expect(result.current.deliveryData).toEqual(updatedData);
      expect(result.current.deliveryData?.last_name).toBe('Петров');
      expect(result.current.deliveryData?.first_name).toBe('Петр');
    });

    it('должен корректно обрабатывать данные без опциональных полей', () => {
      const { result } = renderHook(() => useConfirmationModal());

      const minimalData: DeliveryData = {
        last_name: 'Сидоров',
        first_name: 'Сидор',
        country: 'Россия',
        postal_code: '654321',
        city: 'Санкт-Петербург',
        street: 'Невский проспект',
        house: '1',
        phone: '+79001234567',
      };

      act(() => {
        result.current.openModal(minimalData);
      });

      expect(result.current.deliveryData).toEqual(minimalData);
      expect(result.current.deliveryData?.patronymic).toBeUndefined();
      expect(result.current.deliveryData?.apartment).toBeUndefined();
      expect(result.current.deliveryData?.comment).toBeUndefined();
    });
  });

  describe('Закрытие модального окна', () => {
    it('должен закрывать модальное окно при вызове closeModal', () => {
      const { result } = renderHook(() => useConfirmationModal());

      act(() => {
        result.current.openModal(mockDeliveryData);
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.closeModal();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('должен сохранять данные доставки после закрытия', () => {
      const { result } = renderHook(() => useConfirmationModal());

      act(() => {
        result.current.openModal(mockDeliveryData);
      });

      act(() => {
        result.current.closeModal();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.deliveryData).toEqual(mockDeliveryData);
    });

    it('должен корректно работать при множественных открытиях/закрытиях', () => {
      const { result } = renderHook(() => useConfirmationModal());

      // Первое открытие
      act(() => {
        result.current.openModal(mockDeliveryData);
      });
      expect(result.current.isOpen).toBe(true);

      // Первое закрытие
      act(() => {
        result.current.closeModal();
      });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.deliveryData).toEqual(mockDeliveryData);

      // Второе открытие с теми же данными
      act(() => {
        result.current.openModal(mockDeliveryData);
      });
      expect(result.current.isOpen).toBe(true);

      // Второе закрытие
      act(() => {
        result.current.closeModal();
      });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.deliveryData).toEqual(mockDeliveryData);
    });

    it('не должен вызывать ошибку при закрытии уже закрытого модального окна', () => {
      const { result } = renderHook(() => useConfirmationModal());

      expect(() => {
        act(() => {
          result.current.closeModal();
        });
      }).not.toThrow();

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('Стабильность функций', () => {
    it('openModal должен сохранять ссылку между рендерами', () => {
      const { result, rerender } = renderHook(() => useConfirmationModal());

      const firstOpenModal = result.current.openModal;
      
      rerender();

      expect(result.current.openModal).toBe(firstOpenModal);
    });

    it('closeModal должен сохранять ссылку между рендерами', () => {
      const { result, rerender } = renderHook(() => useConfirmationModal());

      const firstCloseModal = result.current.closeModal;
      
      rerender();

      expect(result.current.closeModal).toBe(firstCloseModal);
    });
  });
});
