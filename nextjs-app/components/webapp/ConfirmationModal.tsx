'use client';

import { useEffect, useRef } from 'react';
import { DeliveryData } from '@/types/delivery';
import { DeliveryDataDisplay } from './DeliveryDataDisplay';

/**
 * Props для компонента ConfirmationModal
 */
export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  deliveryData: DeliveryData;
  isSubmitting: boolean;
}

/**
 * Модальное окно подтверждения данных доставки.
 * 
 * Функциональность:
 * - Отображение overlay с блокировкой прокрутки страницы
 * - Рендеринг данных доставки через DeliveryDataDisplay
 * - Кнопки "Отправить" и "Изменить"
 * - Кнопка закрытия (крестик) в правом верхнем углу
 * - Закрытие по клику вне модального окна
 * - Закрытие по нажатию Escape
 * - Управление фокусом (фокус на кнопку "Отправить" при открытии)
 * - Поддержка клавиатурной навигации (Tab, Enter, Escape)
 * - Адаптивный дизайн для мобильных устройств
 * - Использование Telegram темизации
 * 
 * @param isOpen - Состояние открытия модального окна
 * @param onClose - Callback для закрытия без подтверждения
 * @param onConfirm - Callback для подтверждения отправки
 * @param deliveryData - Данные для отображения
 * @param isSubmitting - Состояние процесса отправки
 */
export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  deliveryData,
  isSubmitting,
}: ConfirmationModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Управление фокусом при открытии модального окна
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      // Устанавливаем фокус на кнопку "Отправить"
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  // Блокировка прокрутки body при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      // Сохраняем текущее значение overflow
      const originalOverflow = document.body.style.overflow;
      // Блокируем прокрутку
      document.body.style.overflow = 'hidden';

      // Восстанавливаем overflow при закрытии
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Обработка нажатия Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isSubmitting, onClose]);

  // Обработка клика вне модального окна
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  // Обработка Enter на кнопке подтверждения
  const handleConfirmKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' && !isSubmitting) {
      onConfirm();
    }
  };

  // Если модальное окно закрыто, не рендерим ничего
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg shadow-xl"
        style={{
          backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
        }}
      >
        {/* Кнопка закрытия (крестик) */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-opacity-10 transition-colors"
          style={{
            color: 'var(--tg-theme-hint-color, #8e8e93)',
          }}
          aria-label="Закрыть"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Заголовок */}
        <div className="p-6 pb-4">
          <h3
            id="modal-title"
            className="text-xl font-semibold"
            style={{
              color: 'var(--tg-theme-text-color, #000000)',
            }}
          >
            Проверьте данные
          </h3>
        </div>

        {/* Содержимое: данные доставки */}
        <div className="px-6 pb-6">
          <DeliveryDataDisplay data={deliveryData} />
        </div>

        {/* Кнопки действий */}
        <div className="flex gap-3 p-6 pt-4 border-t" style={{
          borderColor: 'var(--tg-theme-hint-color, #e5e5ea)',
        }}>
          {/* Кнопка "Изменить" */}
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--tg-theme-secondary-bg-color, #f2f2f7)',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
          >
            Изменить
          </button>

          {/* Кнопка "Отправить" */}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            onKeyDown={handleConfirmKeyDown}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--tg-theme-button-color, #007aff)',
              color: 'var(--tg-theme-button-text-color, #ffffff)',
            }}
          >
            {isSubmitting ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  );
}
