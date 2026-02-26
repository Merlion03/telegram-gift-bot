/**
 * Утилита для валидации URL
 * 
 * Проверяет безопасность URL перед использованием
 * 
 * Requirements: 12.5
 */

/**
 * Список разрешённых протоколов
 * 
 * Requirement 12.5: Разрешены только http и https
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * Список опасных протоколов, которые должны быть отклонены
 */
const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'about:',
] as const;

/**
 * Результат валидации URL
 */
export interface UrlValidationResult {
  isValid: boolean;
  url: string | null;
  error?: string;
}

/**
 * Валидирует URL и проверяет протокол
 * 
 * Requirement 12.5: Система должна проверять протокол URL
 * и разрешать только http и https
 * 
 * @param url - URL для валидации
 * @returns Результат валидации с нормализованным URL или ошибкой
 * 
 * @example
 * validateUrl('https://example.com')
 * // { isValid: true, url: 'https://example.com/' }
 * 
 * validateUrl('javascript:alert("XSS")')
 * // { isValid: false, url: null, error: 'Опасный протокол: javascript:' }
 */
export function validateUrl(url: string): UrlValidationResult {
  // Проверка на пустую строку
  if (!url || url.trim().length === 0) {
    return {
      isValid: false,
      url: null,
      error: 'URL не может быть пустым',
    };
  }

  // Проверка на опасные протоколы (case-insensitive)
  const lowerUrl = url.toLowerCase().trim();
  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (lowerUrl.startsWith(protocol)) {
      return {
        isValid: false,
        url: null,
        error: `Опасный протокол: ${protocol}`,
      };
    }
  }

  // Попытка парсинга URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return {
      isValid: false,
      url: null,
      error: 'Невалидный формат URL',
    };
  }

  // Проверка протокола
  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol as any)) {
    return {
      isValid: false,
      url: null,
      error: `Недопустимый протокол: ${parsedUrl.protocol}. Разрешены только http и https`,
    };
  }

  // URL валиден
  return {
    isValid: true,
    url: parsedUrl.toString(),
  };
}

/**
 * Проверяет, является ли URL безопасным
 * 
 * Упрощённая версия validateUrl, возвращающая только boolean
 * 
 * @param url - URL для проверки
 * @returns true если URL безопасен, false в противном случае
 * 
 * @example
 * isUrlSafe('https://example.com') // true
 * isUrlSafe('javascript:alert("XSS")') // false
 */
export function isUrlSafe(url: string): boolean {
  const result = validateUrl(url);
  return result.isValid;
}

/**
 * Валидирует и нормализует URL
 * 
 * Возвращает нормализованный URL если он валиден, null в противном случае
 * 
 * @param url - URL для валидации
 * @returns Нормализованный URL или null
 * 
 * @example
 * sanitizeUrl('https://example.com')
 * // 'https://example.com/'
 * 
 * sanitizeUrl('javascript:alert("XSS")')
 * // null
 */
export function sanitizeUrl(url: string): string | null {
  const result = validateUrl(url);
  return result.url;
}

/**
 * Валидирует массив URL
 * 
 * Проверяет все URL в массиве и возвращает результаты валидации
 * 
 * @param urls - Массив URL для валидации
 * @returns Массив результатов валидации
 * 
 * @example
 * validateUrls(['https://example.com', 'javascript:alert("XSS")'])
 * // [
 * //   { isValid: true, url: 'https://example.com/' },
 * //   { isValid: false, url: null, error: 'Опасный протокол: javascript:' }
 * // ]
 */
export function validateUrls(urls: string[]): UrlValidationResult[] {
  return urls.map((url) => validateUrl(url));
}

/**
 * Фильтрует массив URL, оставляя только безопасные
 * 
 * @param urls - Массив URL для фильтрации
 * @returns Массив только безопасных URL
 * 
 * @example
 * filterSafeUrls(['https://example.com', 'javascript:alert("XSS")'])
 * // ['https://example.com/']
 */
export function filterSafeUrls(urls: string[]): string[] {
  return urls
    .map((url) => sanitizeUrl(url))
    .filter((url): url is string => url !== null);
}
