/**
 * Модель JWT сессии администратора
 * Представляет claims, хранящиеся в JWT токене
 */

export interface SessionClaims {
  /** Telegram ID администратора */
  tgId: number;
  
  /** Уровень роли администратора */
  role: number;
  
  /** Время выдачи токена (Unix timestamp в секундах) */
  iat: number;
  
  /** Время истечения токена (Unix timestamp в секундах) */
  exp: number;
}

/**
 * Проверяет, истёк ли токен
 * @param claims - JWT claims
 * @returns true если токен истёк
 */
export function isTokenExpired(claims: SessionClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  return claims.exp < now;
}

/**
 * Получает оставшееся время жизни токена в секундах
 * @param claims - JWT claims
 * @returns Количество секунд до истечения (0 если уже истёк)
 */
export function getTokenRemainingTime(claims: SessionClaims): number {
  const now = Math.floor(Date.now() / 1000);
  const remaining = claims.exp - now;
  return remaining > 0 ? remaining : 0;
}

/**
 * Форматирует время истечения токена в читаемый вид
 * @param claims - JWT claims
 * @returns Дата и время истечения в формате ISO
 */
export function formatExpirationTime(claims: SessionClaims): string {
  return new Date(claims.exp * 1000).toISOString();
}
