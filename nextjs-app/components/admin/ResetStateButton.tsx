/**
 * ResetStateButton - компонент кнопки сброса состояния пользователя
 * Позволяет операторам и администраторам сбросить FSM состояние пользователя
 * и отправить команду /start, возвращая пользователя в главное меню бота
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 8.6
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ConfirmationModal } from './ConfirmationModal';

interface ResetStateButtonProps {
  sessionId: number;
  telegramId: number;
  userRole: number; // 2 = admin, 3 = operator
  sessionStatus: 'active' | 'closed';
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Компонент кнопки сброса состояния пользователя
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.1, 7.2
 */
export function ResetStateButton({
  sessionId,
  telegramId,
  userRole,
  sessionStatus,
  onSuccess,
  onError,
}: ResetStateButtonProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutWarningRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      if (timeoutWarningRef.current) {
        clearTimeout(timeoutWarningRef.current);
      }
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
      }
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Возвращает текст кнопки в зависимости от роли пользователя
   * Requirements: 1.3, 1.4, 2.3
   */
  const getButtonText = useCallback((): string => {
    // Роли 0 (Developer) и 2 (Administrator) видят "Вызвать главное меню"
    if (userRole === 0 || userRole === 2) {
      return '🔄 Вызвать главное меню';
    }
    // Роли 1 (Assistant) и 3 (Operator) видят "Сбросить состояние"
    return '🔄 Сбросить состояние';
  }, [userRole]);

  /**
   * Обработчик сброса состояния пользователя
   * Requirements: 3.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.6
   */
  const handleResetState = useCallback(async () => {
    // Сброс предыдущих ошибок
    setError(null);
    setShowTimeoutWarning(false);
    setIsResetting(true);

    // Создаём новый AbortController для этого запроса
    abortControllerRef.current = new AbortController();

    // Устанавливаем таймер предупреждения (5 секунд)
    timeoutWarningRef.current = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, 5000);

    // Устанавливаем жёсткий таймаут (30 секунд)
    hardTimeoutRef.current = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }, 30000);

    try {
      const response = await fetch(`/api/support/sessions/${sessionId}/reset-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
      });

      // Очищаем таймеры после получения ответа
      if (timeoutWarningRef.current) {
        clearTimeout(timeoutWarningRef.current);
        timeoutWarningRef.current = null;
      }
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
        hardTimeoutRef.current = null;
      }
      setShowTimeoutWarning(false);

      if (!response.ok) {
        const errorData = await response.json();
        
        // Маппинг ошибок на понятные сообщения
        const errorMessages: Record<number, string> = {
          401: 'Требуется авторизация. Пожалуйста, войдите снова.',
          403: 'У вас недостаточно прав для выполнения этой операции.',
          404: 'Сессия не найдена.',
          400: 'Сессия уже завершена.',
          503: 'Бот временно недоступен. Попробуйте позже.',
          500: 'Произошла внутренняя ошибка. Попробуйте позже.',
        };

        const errorMessage = errorMessages[response.status] || errorData.message || 'Не удалось сбросить состояние пользователя';
        throw new Error(errorMessage);
      }

      // Успешный сброс состояния
      setShowSuccessNotification(true);
      
      // Вызываем callback onSuccess
      if (onSuccess) {
        onSuccess();
      }

      // Автоматически скрываем уведомление через 3 секунды
      successTimeoutRef.current = setTimeout(() => {
        setShowSuccessNotification(false);
      }, 3000);

    } catch (err) {
      console.error('Ошибка сброса состояния:', err);

      // Очищаем таймеры при ошибке
      if (timeoutWarningRef.current) {
        clearTimeout(timeoutWarningRef.current);
        timeoutWarningRef.current = null;
      }
      if (hardTimeoutRef.current) {
        clearTimeout(hardTimeoutRef.current);
        hardTimeoutRef.current = null;
      }
      setShowTimeoutWarning(false);

      let errorMessage: string;

      // Проверяем AbortError (может быть DOMException, а не Error)
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        errorMessage = 'Операция заняла слишком много времени и была отменена. Попробуйте позже.';
      } else if (err instanceof Error) {
        if (err.message.includes('fetch')) {
          errorMessage = 'Не удалось подключиться к серверу. Проверьте соединение.';
        } else {
          errorMessage = err.message;
        }
      } else {
        errorMessage = 'Произошла неизвестная ошибка';
      }

      setError(errorMessage);

      // Вызываем callback onError
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsResetting(false);
    }
  }, [sessionId, onSuccess, onError]);

  /**
   * Обработчик повторной попытки
   * Requirements: 6.6, 8.6
   */
  const handleRetry = useCallback(() => {
    setError(null);
    handleResetState();
  }, [handleResetState]);

  /**
   * Обработчик нажатия кнопки - показывает модальное окно подтверждения
   */
  const handleButtonClick = useCallback(() => {
    setShowConfirmModal(true);
  }, []);

  /**
   * Обработчик подтверждения в модальном окне
   */
  const handleConfirm = useCallback(() => {
    setShowConfirmModal(false);
    handleResetState();
  }, [handleResetState]);

  /**
   * Обработчик отмены в модальном окне
   */
  const handleCancel = useCallback(() => {
    setShowConfirmModal(false);
  }, []);

  // Условный рендеринг: отображать кнопку только для активных сессий и авторизованных пользователей
  // Requirements: 1.5, 1.6, 7.1, 7.2
  if (sessionStatus !== 'active' || userRole < 0 || userRole > 3) {
    return null;
  }

  return (
    <div className="mx-4 mb-4">
      <style jsx>{`
        .tg-section {
          background-color: var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff));
          border-radius: 12px;
          overflow: hidden;
        }
      `}</style>

      <div className="tg-section">
        <div className="px-4 py-3">
          {/* Кнопка сброса состояния */}
          {/* Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 */}
          <button
            onClick={handleButtonClick}
            disabled={isResetting}
            className="w-full px-6 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border-2"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'var(--tg-theme-button-color, #3390ec)',
              color: 'var(--tg-theme-button-color, #3390ec)',
            }}
          >
            {isResetting ? 'Сброс состояния...' : getButtonText()}
          </button>

          {/* Предупреждение о задержке */}
          {/* Requirements: 6.3 */}
          {showTimeoutWarning && (
            <div className="mt-3 p-3 rounded-lg" style={{
              backgroundColor: '#ff980020',
              borderLeft: '4px solid #ff9800',
            }}>
              <p className="text-sm" style={{ color: '#ff9800' }}>
                ⚠️ Операция занимает больше времени, чем обычно. Пожалуйста, подождите...
              </p>
            </div>
          )}

          {/* Уведомление об успехе */}
          {/* Requirements: 6.1, 6.4 */}
          {showSuccessNotification && (
            <div className="mt-3 p-3 rounded-lg" style={{
              backgroundColor: '#34c75920',
              borderLeft: '4px solid #34c759',
            }}>
              <p className="text-sm font-medium" style={{ color: '#34c759' }}>
                ✓ Состояние пользователя успешно сброшено
              </p>
            </div>
          )}

          {/* Сообщение об ошибке */}
          {/* Requirements: 6.5, 6.6, 8.6 */}
          {error && (
            <div className="mt-3 p-3 rounded-lg" style={{
              backgroundColor: '#ff3b3020',
              borderLeft: '4px solid #ff3b30',
            }}>
              <p className="text-sm font-medium mb-2" style={{ color: '#ff3b30' }}>
                ✕ {error}
              </p>
              {/* Кнопка "Повторить попытку" (не показываем для 403 Forbidden) */}
              {!error.includes('недостаточно прав') && (
                <button
                  onClick={handleRetry}
                  className="text-sm font-medium underline"
                  style={{ color: '#ff3b30' }}
                >
                  Повторить попытку
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно подтверждения */}
      <ConfirmationModal
        isOpen={showConfirmModal}
        title="Вы точно уверены?"
        message="Это действие вызовет главное меню у пользователя"
        confirmText="Да"
        cancelText="Нет"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
