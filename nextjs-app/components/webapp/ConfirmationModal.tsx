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

  // Управление фокусом и прокруткой при открытии модального окна
  useEffect(() => {
    if (isOpen && modalRef.current) {
      // Прокручиваем модальное окно в самый верх
      modalRef.current.scrollTop = 0;
      
      // Устанавливаем фокус на само модальное окно, а не на кнопку
      // Это позволяет пользователю начать с верха и прокрутить вниз
      modalRef.current.focus();
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .modal-content {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
      
      <div
        ref={modalRef}
        className="modal-content relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto sm:rounded-2xl rounded-t-2xl shadow-2xl"
        style={{
          backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
        }}
        tabIndex={-1}
      >
        {/* Индикатор свайпа (только на мобильных) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div 
            className="w-10 h-1 rounded-full"
            style={{
              backgroundColor: 'var(--tg-theme-hint-color, #c7c7cc)',
              opacity: 0.5,
            }}
          />
        </div>

        {/* Заголовок */}
        <div className="px-4 pt-4 pb-3">
          <h3
            id="modal-title"
            className="text-lg font-semibold text-center"
            style={{
              color: 'var(--tg-theme-text-color, #000000)',
            }}
          >
            Проверьте данные
          </h3>
          <p 
            className="text-sm text-center mt-1"
            style={{
              color: 'var(--tg-theme-subtitle-text-color, var(--tg-theme-hint-color, #8e8e93))',
            }}
          >
            Убедитесь, что все данные указаны верно
          </p>
        </div>

        {/* Содержимое: данные доставки */}
        <div className="px-4 pb-4">
          <DeliveryDataDisplay data={deliveryData} />
        </div>

        {/* Кнопки действий */}
        <div 
          className="flex gap-3 p-4 border-t" 
          style={{
            borderColor: 'var(--tg-theme-section-separator-color, var(--tg-theme-hint-color, #e5e5ea))',
            backgroundColor: 'var(--tg-theme-secondary-bg-color, var(--tg-theme-bg-color, #ffffff))',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
          }}
        >
          {/* Кнопка "Изменить" */}
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--tg-theme-section-bg-color, #f2f2f7)',
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
            className="flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
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
