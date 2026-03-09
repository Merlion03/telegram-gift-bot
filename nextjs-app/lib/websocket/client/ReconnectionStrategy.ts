/**
 * ReconnectionStrategy - Стратегия автоматического переподключения
 * 
 * Ответственность:
 * - Автоматическое переподключение при аномальном закрытии соединения
 * - Экспоненциальная задержка между попытками
 * - Проверка кодов закрытия для определения необходимости переподключения
 * - Проверка авторизации пользователя перед переподключением
 * 
 * Requirements: 4.1, 4.2, 4.5, 4.6, 4.7
 */

import { NO_RECONNECT_CODES, RECONNECTION } from '../constants';

/**
 * Функция для проверки авторизации пользователя
 */
export type IsUserAuthorizedFn = () => boolean;

/**
 * Функция для выполнения переподключения
 */
export type ConnectFn = () => Promise<void>;

/**
 * Стратегия переподключения с экспоненциальной задержкой
 */
export class ReconnectionStrategy {
  /** Количество попыток переподключения */
  private attempts: number = 0;
  
  /** Таймер для отложенного переподключения */
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  /** Функция проверки авторизации пользователя */
  private isUserAuthorized: IsUserAuthorizedFn;

  /**
   * Создать ReconnectionStrategy
   * 
   * @param isUserAuthorized - Функция для проверки авторизации пользователя
   */
  constructor(isUserAuthorized: IsUserAuthorizedFn) {
    this.isUserAuthorized = isUserAuthorized;
  }

  /**
   * Проверить, нужно ли переподключаться при данном коде закрытия
   * 
   * НЕ переподключаемся при:
   * - 1000 (нормальное закрытие)
   * - 4401 (ошибка аутентификации)
   * - 4403 (нет прав доступа)
   * 
   * @param closeCode - Код закрытия WebSocket соединения
   * @returns true если нужно переподключаться
   * 
   * Requirements: 4.5, 4.6 - Не переподключаться при определённых кодах
   */
  shouldReconnect(closeCode: number): boolean {
    // Проверяем, не входит ли код в список "не переподключаться"
    return !NO_RECONNECT_CODES.includes(closeCode as any);
  }

  /**
   * Попытаться переподключиться с экспоненциальной задержкой
   * 
   * Процесс:
   * 1. Проверить авторизацию пользователя
   * 2. Вычислить задержку: delay = INITIAL_DELAY * (BACKOFF_MULTIPLIER ^ attempts)
   * 3. Ограничить задержку максимальным значением MAX_DELAY
   * 4. Подождать задержку
   * 5. Вызвать функцию переподключения
   * 6. Увеличить счётчик попыток
   * 
   * @param connectFn - Функция для выполнения переподключения
   * 
   * Requirements:
   * - 4.1: Автоматическое переподключение при аномальном закрытии
   * - 4.2: Экспоненциальная задержка (1s, 2s, 4s, 8s, 16s, 30s max)
   * - 4.7: Проверка авторизации перед переподключением
   */
  reconnect(connectFn: ConnectFn): void {
    // Requirement 4.7: Проверяем авторизацию пользователя
    if (!this.isUserAuthorized()) {
      console.log('[ReconnectionStrategy] Пользователь не авторизован, переподключение отменено');
      return;
    }

    // Отменяем предыдущую попытку, если она есть
    this.cancel();

    // Requirement 4.2: Вычисляем задержку с экспоненциальным ростом
    const delay = this.getCurrentDelay();
    
    console.log(`[ReconnectionStrategy] Попытка переподключения #${this.attempts + 1} через ${delay}ms`);

    // Устанавливаем таймер для переподключения
    this.reconnectTimer = setTimeout(async () => {
      try {
        // Requirement 4.1: Выполняем переподключение
        await connectFn();
        
        console.log('[ReconnectionStrategy] Переподключение успешно');
        
        // При успешном переподключении сбрасываем счётчик
        this.reset();
        
      } catch (error) {
        console.error('[ReconnectionStrategy] Ошибка переподключения:', error);
        
        // Увеличиваем счётчик попыток ПЕРЕД следующей попыткой
        this.attempts++;
        
        // Проверяем лимит попыток (если установлен)
        if (RECONNECTION.MAX_ATTEMPTS > 0 && this.attempts >= RECONNECTION.MAX_ATTEMPTS) {
          console.error('[ReconnectionStrategy] Достигнут лимит попыток переподключения');
          return;
        }
        
        // Пробуем снова (теперь с увеличенным счётчиком)
        this.reconnect(connectFn);
      }
    }, delay);
  }

  /**
   * Отменить текущую попытку переподключения
   * 
   * Requirements: 4.1 - Управление процессом переподключения
   */
  cancel(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      console.log('[ReconnectionStrategy] Попытка переподключения отменена');
    }
  }

  /**
   * Сбросить счётчик попыток
   * Вызывается после успешного переподключения
   * 
   * Requirements: 4.2 - Сброс задержки после успешного подключения
   */
  reset(): void {
    this.attempts = 0;
    this.cancel();
    console.log('[ReconnectionStrategy] Счётчик попыток сброшен');
  }

  /**
   * Получить текущую задержку для переподключения
   * 
   * Формула: delay = INITIAL_DELAY * (BACKOFF_MULTIPLIER ^ attempts)
   * Ограничение: min(delay, MAX_DELAY)
   * 
   * Примеры:
   * - Попытка 0: 1000ms (1s)
   * - Попытка 1: 2000ms (2s)
   * - Попытка 2: 4000ms (4s)
   * - Попытка 3: 8000ms (8s)
   * - Попытка 4: 16000ms (16s)
   * - Попытка 5+: 30000ms (30s max)
   * 
   * @returns Задержка в миллисекундах
   * 
   * Requirements: 4.2 - Экспоненциальная задержка
   */
  getCurrentDelay(): number {
    // Вычисляем экспоненциальную задержку
    const exponentialDelay = RECONNECTION.INITIAL_DELAY * Math.pow(
      RECONNECTION.BACKOFF_MULTIPLIER,
      this.attempts
    );
    
    // Ограничиваем максимальной задержкой
    return Math.min(exponentialDelay, RECONNECTION.MAX_DELAY);
  }

  /**
   * Получить количество попыток переподключения
   * Используется для тестирования и мониторинга
   * 
   * @returns Количество попыток
   */
  getAttempts(): number {
    return this.attempts;
  }

  /**
   * Проверить, активна ли попытка переподключения
   * 
   * @returns true если есть активный таймер
   */
  isActive(): boolean {
    return this.reconnectTimer !== null;
  }
}
