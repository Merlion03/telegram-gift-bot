/**
 * Утилиты для тестирования API routes
 */

/**
 * Создаёт объект params для Next.js 15 route handlers
 * В Next.js 15 params стал Promise
 */
export function createRouteParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return {
    params: Promise.resolve(params),
  };
}
