/**
 * Утилиты для работы с Telegram WebApp API
 * 
 * Предоставляет функции для извлечения данных пользователя из Telegram WebApp контекста.
 * Используется для автоматической передачи tg_id при открытии WebApp из Telegram.
 * 
 * Референс: lib/telegram/initDataValidator.ts
 */

/**
 * Интерфейс для глобального объекта Telegram WebApp
 */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Проверяет, запущено ли приложение в контексте Telegram WebApp
 * 
 * @returns true если доступен Telegram WebApp API
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return !!(window.Telegram?.WebApp);
}

/**
 * Извлекает Telegram User ID из WebApp контекста
 * 
 * Автоматически получает tg_id из window.Telegram.WebApp.initDataUnsafe.user.id
 * Используется для автоматической идентификации администратора при входе.
 * 
 * @returns Telegram User ID или null если недоступен
 */
export function getTelegramUserId(): number | null {
  if (!isTelegramWebApp()) {
    return null;
  }

  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

  if (typeof userId === 'number' && userId > 0) {
    return userId;
  }

  return null;
}

/**
 * Получает строку initData для серверной валидации
 * 
 * InitData содержит подписанные данные от Telegram, которые можно
 * валидировать на сервере для дополнительной безопасности.
 * 
 * @returns Строка initData или null если недоступна
 */
export function getInitData(): string | null {
  if (!isTelegramWebApp()) {
    return null;
  }

  const initData = window.Telegram?.WebApp?.initData;

  if (typeof initData === 'string' && initData.length > 0) {
    return initData;
  }

  return null;
}

/**
 * Извлекает данные пользователя из WebApp контекста
 * 
 * @returns Объект с данными пользователя или null если недоступен
 */
export function getTelegramUser(): TelegramWebApp['initDataUnsafe']['user'] | null {
  if (!isTelegramWebApp()) {
    return null;
  }

  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
}

/**
 * Инициализирует Telegram WebApp (вызывает ready())
 * 
 * Должна быть вызвана при загрузке приложения для корректной работы WebApp API.
 */
export function initTelegramWebApp(): void {
  if (isTelegramWebApp()) {
    window.Telegram?.WebApp?.ready();
  }
}
