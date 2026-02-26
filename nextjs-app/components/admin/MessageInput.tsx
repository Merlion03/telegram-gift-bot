/**
 * MessageInput - компонент поля ввода сообщения
 * Переиспользуемый компонент для отправки сообщений пользователю
 * Requirements: 8.1
 */

'use client';

import { useState, FormEvent, ChangeEvent } from 'react';

interface MessageInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * Компонент поля ввода с валидацией и отправкой
 * Requirements: 8.1
 */
export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Введите сообщение...',
  maxLength = 4000,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Обработчик изменения текста
   */
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    
    // Ограничиваем длину
    if (value.length <= maxLength) {
      setMessage(value);
      setError(null);
    }
  };

  /**
   * Обработчик отправки сообщения
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Валидация
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage) {
      setError('Сообщение не может быть пустым');
      return;
    }

    if (trimmedMessage.length < 1) {
      setError('Сообщение слишком короткое');
      return;
    }

    if (isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await onSend(trimmedMessage);
      
      // Очищаем поле после успешной отправки
      setMessage('');
    } catch (err) {
      console.error('Ошибка отправки сообщения:', err);
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Обработчик нажатия клавиш
   * Ctrl+Enter или Cmd+Enter для отправки
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  /**
   * Вычисляет цвет счётчика символов
   */
  const getCounterColor = (): string => {
    const percentage = (message.length / maxLength) * 100;
    
    if (percentage >= 95) {
      return 'text-red-600';
    } else if (percentage >= 80) {
      return 'text-orange-600';
    } else {
      return 'text-gray-500';
    }
  };

  const isDisabled = disabled || isSending;
  const canSend = message.trim().length > 0 && !isDisabled;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Поле ввода */}
      <div className="relative">
        <textarea
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        
        {/* Счётчик символов */}
        <div className={`absolute bottom-2 right-2 text-xs ${getCounterColor()}`}>
          {message.length} / {maxLength}
        </div>
      </div>

      {/* Отображение ошибки */}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Кнопки управления */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Подсказка: Ctrl+Enter для отправки
        </div>
        
        <div className="flex gap-2">
          {/* Кнопка очистки */}
          {message.length > 0 && (
            <button
              type="button"
              onClick={() => setMessage('')}
              disabled={isDisabled}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Очистить
            </button>
          )}
          
          {/* Кнопка отправки */}
          <button
            type="submit"
            disabled={!canSend}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Отправка...
              </span>
            ) : (
              'Отправить'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
