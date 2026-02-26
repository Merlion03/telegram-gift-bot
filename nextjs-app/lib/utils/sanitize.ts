/**
 * Утилиты для санитизации пользовательского ввода
 * 
 * Обеспечивает защиту от XSS-атак путём удаления потенциально опасного контента
 * 
 * Requirements: 12.1, 12.3
 */

import { sanitizeUrl as validateAndSanitizeUrl } from './urlValidator';

/**
 * Экранирует HTML-теги в строке
 * 
 * Преобразует специальные символы HTML в их entity-эквиваленты:
 * - < становится &lt;
 * - > становится &gt;
 * - & становится &amp;
 * - " становится &quot;
 * - ' становится &#x27;
 * 
 * @param text - Строка для экранирования
 * @returns Экранированная строка
 * 
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Возвращает: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
export function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Удаляет все HTML-теги из строки
 * 
 * Полностью удаляет все HTML-теги, оставляя только текстовое содержимое
 * 
 * @param text - Строка для очистки
 * @returns Строка без HTML-тегов
 * 
 * @example
 * stripHtmlTags('<p>Hello <b>World</b></p>')
 * // Возвращает: 'Hello World'
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Санитизирует строку для безопасного использования
 * 
 * Выполняет комплексную очистку:
 * 1. Удаляет HTML-теги
 * 2. Удаляет опасные протоколы (javascript:, data:, vbscript:)
 * 3. Экранирует оставшиеся специальные символы
 * 4. Удаляет управляющие символы
 * 5. Нормализует пробелы
 * 
 * @param text - Строка для санитизации
 * @returns Санитизированная строка
 * 
 * @example
 * sanitizeText('<script>alert("XSS")</script> Hello   World')
 * // Возвращает: 'alert(&quot;XSS&quot;) Hello World'
 */
export function sanitizeText(text: string): string {
  // Удаляем HTML-теги
  let sanitized = stripHtmlTags(text);
  
  // Удаляем опасные протоколы (case-insensitive)
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:/gi, '');
  sanitized = sanitized.replace(/vbscript:/gi, '');
  
  // Экранируем специальные символы
  sanitized = escapeHtml(sanitized);
  
  // Удаляем управляющие символы (кроме переносов строк и табуляции)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Нормализуем множественные пробелы
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

/**
 * Валидирует и санитизирует URL
 * 
 * Проверяет, что URL использует безопасный протокол (http или https)
 * и не содержит потенциально опасных конструкций
 * 
 * @param url - URL для валидации
 * @returns Санитизированный URL или null если URL небезопасен
 * 
 * @example
 * sanitizeUrl('https://example.com')
 * // Возвращает: 'https://example.com/'
 * 
 * sanitizeUrl('javascript:alert("XSS")')
 * // Возвращает: null
 */
export function sanitizeUrl(url: string): string | null {
  return validateAndSanitizeUrl(url);
}

/**
 * Санитизирует объект с данными доставки
 * 
 * Применяет санитизацию ко всем текстовым полям объекта
 * 
 * @param data - Объект с данными доставки
 * @returns Санитизированный объект
 */
export function sanitizeDeliveryData(data: {
  full_name: string;
  address: string;
  phone: string;
  comment?: string;
  telegram_id: number;
}): {
  full_name: string;
  address: string;
  phone: string;
  comment?: string;
  telegram_id: number;
} {
  return {
    full_name: sanitizeText(data.full_name),
    address: sanitizeText(data.address),
    phone: sanitizeText(data.phone),
    comment: data.comment ? sanitizeText(data.comment) : undefined,
    telegram_id: data.telegram_id,
  };
}

/**
 * Санитизирует сообщение поддержки
 * 
 * Применяет санитизацию к тексту сообщения, сохраняя переносы строк
 * 
 * @param messageText - Текст сообщения
 * @returns Санитизированный текст
 */
export function sanitizeSupportMessage(messageText: string): string {
  // Удаляем HTML-теги
  let sanitized = stripHtmlTags(messageText);
  
  // Экранируем специальные символы
  sanitized = escapeHtml(sanitized);
  
  // Удаляем управляющие символы (кроме переносов строк)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  return sanitized.trim();
}
