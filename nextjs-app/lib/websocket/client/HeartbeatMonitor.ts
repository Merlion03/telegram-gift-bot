/**
 * HeartbeatMonitor - Мониторинг активности WebSocket соединения на стороне клиента
 * 
 * Отслеживает время последнего полученного сообщения и обнаруживает "мёртвые" соединения.
 * Проверяет активность каждые 10 секунд и считает соединение мёртвым если нет сообщений 90 секунд.
 * 
 * Требования: 3.3, 3.6
 */

import { TIMEOUTS } from '../constants';
import type { DeadConnectionCallback } from '../types';

/**
 * Класс для мониторинга активности WebSocket соединения
 */
export class HeartbeatMonitor {
  private lastMessageAt: Date | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private deadCallback: DeadConnectionCallback | null = null;
  private isRunning: boolean = false;

  /**
   * Запуск мониторинга heartbeat
   * Начинает периодическую проверку активности соединения
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastMessageAt = new Date();

    // Проверка активности каждые 10 секунд
    this.checkInterval = setInterval(() => {
      this.checkActivity();
    }, TIMEOUTS.CLIENT_HEARTBEAT_CHECK);
  }

  /**
   * Остановка мониторинга heartbeat
   * Очищает все таймеры и сбрасывает состояние
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.lastMessageAt = null;
  }

  /**
   * Обновление timestamp последнего полученного сообщения
   * Должен вызываться при получении любого сообщения от сервера
   */
  updateLastMessageTime(): void {
    this.lastMessageAt = new Date();
  }

  /**
   * Проверка активности соединения
   * Возвращает true если соединение активно, false если мёртвое
   */
  isAlive(): boolean {
    if (!this.lastMessageAt) {
      return false;
    }

    const now = new Date();
    const timeSinceLastMessage = now.getTime() - this.lastMessageAt.getTime();

    return timeSinceLastMessage < TIMEOUTS.CLIENT_DEAD_CONNECTION;
  }

  /**
   * Регистрация callback для уведомления о мёртвом соединении
   * @param handler - Функция, которая будет вызвана при обнаружении мёртвого соединения
   */
  onDead(handler: DeadConnectionCallback): void {
    this.deadCallback = handler;
  }

  /**
   * Проверка активности и вызов callback если соединение мёртвое
   * @private
   */
  private checkActivity(): void {
    if (!this.isAlive() && this.deadCallback) {
      this.deadCallback();
    }
  }

  /**
   * Получение времени последнего сообщения (для тестирования)
   * @internal
   */
  getLastMessageTime(): Date | null {
    return this.lastMessageAt;
  }

  /**
   * Проверка, запущен ли мониторинг (для тестирования)
   * @internal
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}
