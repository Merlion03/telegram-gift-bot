/**
 * MessageInput - компонент поля ввода сообщения
 * Переиспользуемый компонент для отправки сообщений пользователю
 * с поддержкой telegram-стилей, шаблонов и автоизменения размера
 * Requirements: 3.6
 */

'use client';

import { useState, FormEvent, ChangeEvent, useCallback } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import { useAutoResizeTextarea } from '@/lib/hooks/useAutoResizeTextarea';
import { TemplateDropdown } from './TemplateDropdown';
import {
  MessageTemplate,
  DEFAULT_MESSAGE_TEMPLATES,
  updateTemplateUsage,
  findTemplateByShortcut,
} from '@/lib/constants/message-templates';
import { MAX_SIZES } from '@/lib/constants/telegram-constants';

interface MessageInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  templates?: MessageTemplate[];
  onTemplatesChange?: (templates: MessageTemplate[]) => void;
}

/**
 * Компонент поля ввода с telegram-стилями, шаблонами и автоизменением размера
 * Requirements: 3.6
 */
export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Введите сообщение...',
  maxLength = MAX_SIZES.MESSAGE_LENGTH,
  templates = DEFAULT_MESSAGE_TEMPLATES,
  onTemplatesChange,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [localTemplates, setLocalTemplates] = useState(templates);

  // Хук для автоизменения размера textarea
  const textareaRef = useAutoResizeTextarea(message, {
    minRows: 3,
    maxRows: 10,
  });

  /**
   * Обработчик изменения текста
   */
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    // Ограничиваем длину
    if (value.length <= maxLength) {
      setMessage(value);
      setError(null);

      // Проверяем shortcut для шаблонов
      const words = value.split(/\s+/);
      const lastWord = words[words.length - 1];

      if (lastWord.startsWith('/')) {
        const template = findTemplateByShortcut(localTemplates, lastWord);
        if (template) {
          // Заменяем shortcut на текст шаблона
          const beforeShortcut = value.slice(0, value.lastIndexOf(lastWord));
          setMessage(beforeShortcut + template.text);

          // Обновляем счетчик использования
          const updatedTemplates = updateTemplateUsage(
            localTemplates,
            template.id
          );
          setLocalTemplates(updatedTemplates);
          onTemplatesChange?.(updatedTemplates);
        }
      }
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
      setError(
        err instanceof Error ? err.message : 'Не удалось отправить сообщение'
      );
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Обработчик нажатия клавиш
   * Enter для отправки, Shift+Enter для новой строки
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter без Shift - отправить
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
    // Shift+Enter - новая строка (по умолчанию)
  };

  /**
   * Обработчик выбора шаблона
   */
  const handleSelectTemplate = useCallback(
    (template: MessageTemplate) => {
      setMessage(template.text);

      // Обновляем счетчик использования
      const updatedTemplates = updateTemplateUsage(
        localTemplates,
        template.id
      );
      setLocalTemplates(updatedTemplates);
      onTemplatesChange?.(updatedTemplates);
    },
    [localTemplates, onTemplatesChange]
  );

  /**
   * Вычисляет цвет счётчика символов
   */
  const getCounterColor = (): string => {
    const percentage = (message.length / maxLength) * 100;

    if (percentage >= 95) {
      return 'text-telegram-red';
    } else if (percentage >= 80) {
      return 'text-telegram-yellow';
    } else {
      return 'text-telegram-secondary';
    }
  };

  const isDisabled = disabled || isSending;
  const canSend = message.trim().length > 0 && !isDisabled;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Поле ввода с telegram-стилями */}
      <div className="relative bg-telegram-bg rounded-lg border border-telegram-border telegram-shadow-sm overflow-hidden">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          className="w-full px-4 py-3 bg-telegram-bg text-telegram-text placeholder-telegram-secondary focus:outline-none resize-none disabled:bg-telegram-sidebar disabled:cursor-not-allowed transition-colors"
        />

        {/* Счётчик символов */}
        <div
          className={`absolute bottom-3 right-3 text-xs font-medium ${getCounterColor()}`}
        >
          {message.length} / {maxLength}
        </div>
      </div>

      {/* Отображение ошибки */}
      {error && (
        <div className="rounded-lg bg-telegram-red/10 px-3 py-2 border border-telegram-red/20">
          <p className="text-sm text-telegram-red">{error}</p>
        </div>
      )}

      {/* Подсказка о горячих клавишах */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-telegram-secondary">
          <span className="inline-block px-2 py-1 bg-telegram-sidebar rounded text-telegram-text font-medium">
            Enter
          </span>
          <span className="ml-2">— отправить,</span>
          <span className="inline-block ml-2 px-2 py-1 bg-telegram-sidebar rounded text-telegram-text font-medium">
            Shift+Enter
          </span>
          <span className="ml-2">— новая строка</span>
        </div>
      </div>

      {/* Кнопки управления */}
      <div className="flex items-center justify-between gap-2">
        {/* Левая группа - кнопки действий */}
        <div className="flex items-center gap-1">
          {/* Кнопка прикрепления файлов */}
          <button
            type="button"
            disabled={isDisabled}
            className="inline-flex items-center justify-center w-10 h-10 text-telegram-secondary hover:text-telegram-text hover:bg-telegram-sidebar rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
          >
            <Paperclip size={20} />
          </button>

          {/* Кнопка эмодзи */}
          <button
            type="button"
            disabled={isDisabled}
            className="inline-flex items-center justify-center w-10 h-10 text-telegram-secondary hover:text-telegram-text hover:bg-telegram-sidebar rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Вставить эмодзи"
            aria-label="Вставить эмодзи"
          >
            <Smile size={20} />
          </button>

          {/* Выпадающий список шаблонов */}
          <TemplateDropdown
            templates={localTemplates}
            onSelectTemplate={handleSelectTemplate}
            isOpen={isTemplateDropdownOpen}
            onToggle={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
          />
        </div>

        {/* Правая группа - кнопка отправки */}
        <div className="flex items-center gap-2">
          {/* Кнопка очистки */}
          {message.length > 0 && (
            <button
              type="button"
              onClick={() => setMessage('')}
              disabled={isDisabled}
              className="px-3 py-2 text-sm text-telegram-secondary hover:text-telegram-text hover:bg-telegram-sidebar rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Очистить
            </button>
          )}

          {/* Кнопка отправки с анимацией */}
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-telegram-blue text-white rounded-lg hover:bg-telegram-dark-blue focus:outline-none focus:ring-2 focus:ring-telegram-blue/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
          >
            {isSending ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-sm font-medium">Отправка...</span>
              </>
            ) : (
              <>
                <Send size={18} />
                <span className="text-sm font-medium">Отправить</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
