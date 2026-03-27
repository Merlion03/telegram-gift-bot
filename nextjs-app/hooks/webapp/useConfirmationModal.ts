import { useState, useCallback } from 'react';
import { DeliveryData } from '@/types/delivery';

/**
 * Состояние модального окна подтверждения
 */
interface ModalState {
  isOpen: boolean;
  deliveryData: DeliveryData | null;
}

/**
 * Возвращаемое значение хука useConfirmationModal
 */
export interface UseConfirmationModalReturn {
  isOpen: boolean;
  deliveryData: DeliveryData | null;
  openModal: (data: DeliveryData) => void;
  closeModal: () => void;
}

/**
 * Хук для управления состоянием модального окна подтверждения данных доставки
 * 
 * Отвечает за:
 * - Управление состоянием открытия/закрытия модального окна
 * - Сохранение данных доставки для отображения
 * - Предоставление функций для открытия и закрытия модального окна
 * 
 * @returns {UseConfirmationModalReturn} Объект с состоянием и функциями управления
 * 
 * @example
 * ```tsx
 * const { isOpen, deliveryData, openModal, closeModal } = useConfirmationModal();
 * 
 * // Открыть модальное окно с данными
 * openModal(formData);
 * 
 * // Закрыть модальное окно
 * closeModal();
 * ```
 */
export function useConfirmationModal(): UseConfirmationModalReturn {
  // Состояние модального окна
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    deliveryData: null,
  });

  /**
   * Открывает модальное окно с переданными данными доставки
   * 
   * @param {DeliveryData} data - Данные доставки для отображения
   */
  const openModal = useCallback((data: DeliveryData) => {
    setModalState({
      isOpen: true,
      deliveryData: data,
    });
  }, []);

  /**
   * Закрывает модальное окно, сохраняя данные доставки
   * 
   * Данные сохраняются для возможности повторного открытия
   * модального окна с теми же данными после редактирования формы
   */
  const closeModal = useCallback(() => {
    setModalState((prevState) => ({
      ...prevState,
      isOpen: false,
    }));
  }, []);

  return {
    isOpen: modalState.isOpen,
    deliveryData: modalState.deliveryData,
    openModal,
    closeModal,
  };
}
