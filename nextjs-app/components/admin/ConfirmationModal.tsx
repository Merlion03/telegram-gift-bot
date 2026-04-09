/**
 * ConfirmationModal - модальное окно подтверждения действия
 * Используется для подтверждения критических операций
 */

'use client';

import { useEffect } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Компонент модального окна подтверждения
 */
export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Да',
  cancelText = 'Нет',
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  // Блокируем скролл при открытом модальном окне
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Обработка нажатия Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
        }}
      >
        {/* Заголовок */}
        <div className="px-6 pt-6 pb-4">
          <h3
            className="text-xl font-semibold text-center"
            style={{
              color: 'var(--tg-theme-text-color, #000000)',
            }}
          >
            {title}
          </h3>
        </div>

        {/* Сообщение */}
        <div className="px-6 pb-6">
          <p
            className="text-center"
            style={{
              color: 'var(--tg-theme-hint-color, #999999)',
            }}
          >
            {message}
          </p>
        </div>

        {/* Кнопки */}
        <div className="flex gap-2 px-4 pb-4">
          {/* Кнопка "Нет" */}
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 rounded-xl font-medium transition-all duration-200 border-2"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'var(--tg-theme-hint-color, #999999)',
              color: 'var(--tg-theme-hint-color, #999999)',
            }}
          >
            {cancelText}
          </button>

          {/* Кнопка "Да" */}
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-xl font-medium transition-all duration-200"
            style={{
              backgroundColor: 'var(--tg-theme-button-color, #3390ec)',
              color: 'var(--tg-theme-button-text-color, #ffffff)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
