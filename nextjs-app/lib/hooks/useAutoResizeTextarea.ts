/**
 * Хук для автоматического изменения высоты textarea
 */

import { useEffect, useRef } from 'react';

interface UseAutoResizeTextareaOptions {
  minRows?: number;
  maxRows?: number;
}

/**
 * Хук для управления автоматическим изменением высоты textarea
 * Увеличивает высоту при добавлении текста и уменьшает при удалении
 */
export const useAutoResizeTextarea = (
  value: string,
  options: UseAutoResizeTextareaOptions = {}
) => {
  const { minRows = 3, maxRows = 10 } = options;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Сбрасываем высоту для корректного расчета
    textarea.style.height = 'auto';

    // Получаем высоту содержимого
    const scrollHeight = textarea.scrollHeight;

    // Вычисляем высоту одной строки
    const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight);
    const minHeight = lineHeight * minRows;
    const maxHeight = lineHeight * maxRows;

    // Устанавливаем новую высоту
    let newHeight = Math.max(scrollHeight, minHeight);
    newHeight = Math.min(newHeight, maxHeight);

    textarea.style.height = `${newHeight}px`;

    // Показываем/скрываем скролл в зависимости от maxHeight
    if (scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }, [value, minRows, maxRows]);

  return textareaRef;
};
