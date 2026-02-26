'use client';

import React from 'react';

export type ErrorSeverity = 'error' | 'warning' | 'info';

interface ErrorMessageProps {
  message: string;
  severity?: ErrorSeverity;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * ErrorMessage компонент для отображения понятных сообщений об ошибках
 * Поддерживает разные уровни серьезности и действия (повтор, закрытие)
 */
export function ErrorMessage({
  message,
  severity = 'error',
  onRetry,
  onDismiss,
  className = '',
}: ErrorMessageProps) {
  // Определяем стили в зависимости от severity
  const severityStyles = {
    error: {
      container: 'bg-red-50 border-red-200',
      icon: 'text-red-500',
      text: 'text-red-800',
      button: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200',
      icon: 'text-yellow-500',
      text: 'text-yellow-800',
      button: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      container: 'bg-blue-50 border-blue-200',
      icon: 'text-blue-500',
      text: 'text-blue-800',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
  };

  const styles = severityStyles[severity];

  // Иконки для разных severity
  const icons = {
    error: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
    warning: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    ),
    info: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  };

  return (
    <div
      className={`rounded-lg border p-4 ${styles.container} ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className={`h-5 w-5 ${styles.icon}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            {icons[severity]}
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className={`text-sm font-medium ${styles.text}`}>{message}</p>
        </div>
        <div className="ml-auto flex gap-2 pl-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className={`rounded px-3 py-1 text-xs font-medium text-white ${styles.button} focus:outline-none focus:ring-2 focus:ring-offset-2`}
              aria-label="Повторить попытку"
            >
              Повторить
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`rounded p-1 ${styles.icon} hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2`}
              aria-label="Закрыть сообщение"
            >
              <svg
                className="h-4 w-4"
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
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Утилита для преобразования технических ошибок в понятные сообщения
 */
export function getReadableErrorMessage(error: unknown): string {
  // Если это Error объект
  if (error instanceof Error) {
    // Маппинг известных ошибок на понятные сообщения
    const errorMessages: Record<string, string> = {
      'Invalid signature': 'Ошибка проверки подлинности. Попробуйте открыть форму заново.',
      'InitData is too old': 'Сессия устарела. Пожалуйста, откройте форму заново.',
      'InitData недоступны': 'InitData недоступны. Откройте форму через Telegram.',
      'Failed to save delivery data': 'Не удалось сохранить данные доставки. Попробуйте ещё раз.',
      'Failed to send message': 'Не удалось отправить сообщение. Проверьте подключение к интернету.',
      'Unauthorized': 'Требуется авторизация. Пожалуйста, войдите в систему.',
      'Network request failed': 'Ошибка сети. Проверьте подключение к интернету.',
      'Validation error': 'Проверьте правильность заполнения всех полей.',
    };

    const message = error.message || '';

    // Проверяем точное совпадение
    if (errorMessages[message]) {
      return errorMessages[message];
    }

    // Проверяем частичное совпадение
    for (const [key, value] of Object.entries(errorMessages)) {
      if (message.includes(key)) {
        return value;
      }
    }

    // Если в development или test режиме, показываем оригинальное сообщение
    if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && message) {
      return message;
    }

    // Дефолтное сообщение
    return 'Произошла ошибка. Пожалуйста, попробуйте ещё раз.';
  }

  // Если это строка
  if (typeof error === 'string') {
    return error || 'Произошла ошибка. Пожалуйста, попробуйте ещё раз.';
  }

  // Дефолтное сообщение для неизвестных ошибок
  return 'Произошла неизвестная ошибка. Пожалуйста, попробуйте ещё раз.';
}
