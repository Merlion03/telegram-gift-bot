/**
 * MessageQueue - Очередь сообщений для буферизации при разрыве соединения
 * 
 * Ответственность:
 * - Буферизация исходящих сообщений при разрыве соединения
 * - FIFO порядок обработки с максимальным размером 100 сообщений
 * - Фильтрация subscribe/unsubscribe сообщений (они восстанавливаются через SubscriptionManager)
 * - Удаление старых сообщений при переполнении
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.5, 6.6
 */

import { LIMITS } from '../constants';
import type { ClientMessage } from '../types';

export class MessageQueue {
  private queue: ClientMessage[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = LIMITS.MESSAGE_QUEUE_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Добавляет сообщение в очередь
   * Фильтрует subscribe/unsubscribe сообщения (Requirement 6.5)
   * Удаляет старые сообщения при переполнении (Requirement 6.3)
   * 
   * @param message - Сообщение для добавления в очередь
   */
  enqueue(message: ClientMessage): void {
    // Requirement 6.5: НЕ сохранять subscribe/unsubscribe сообщения
    if (message.type === 'subscribe' || message.type === 'unsubscribe') {
      return;
    }

    // Requirement 6.3: Удалять самые старые сообщения при переполнении (FIFO)
    if (this.queue.length >= this.maxSize) {
      this.queue.shift(); // Удаляем самое старое сообщение
    }

    // Requirement 6.1: Сохранять исходящие сообщения
    this.queue.push(message);
  }

  /**
   * Отправляет все сообщения из очереди и очищает её
   * Requirement 6.6: Удаление сообщения из очереди после отправки
   * 
   * @param sendFn - Функция для отправки сообщения, возвращает true при успехе
   * @returns Количество успешно отправленных сообщений
   */
  flush(sendFn: (message: ClientMessage) => boolean): number {
    let sentCount = 0;
    const failedMessages: ClientMessage[] = [];

    // Пытаемся отправить все сообщения
    for (const message of this.queue) {
      const success = sendFn(message);
      
      if (success) {
        sentCount++;
        // Requirement 6.6: Сообщение удаляется из очереди после успешной отправки
      } else {
        // Если отправка не удалась, сохраняем сообщение для повторной попытки
        failedMessages.push(message);
      }
    }

    // Очищаем очередь и оставляем только неотправленные сообщения
    this.queue = failedMessages;

    return sentCount;
  }

  /**
   * Возвращает текущий размер очереди
   * 
   * @returns Количество сообщений в очереди
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Очищает очередь
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Проверяет, заполнена ли очередь
   * Requirement 6.2: Максимальный размер 100 сообщений
   * 
   * @returns true если очередь заполнена
   */
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Возвращает копию всех сообщений в очереди (для тестирования)
   * 
   * @returns Массив сообщений
   */
  getAll(): ClientMessage[] {
    return [...this.queue];
  }
}
