/**
 * StateManager - Управление состоянием WebSocket соединения
 * 
 * Ответственность:
 * - Управление состояниями: disconnected, connecting, connected, reconnecting
 * - Уведомление подписчиков об изменениях состояния
 * - Проверка активности соединения
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import type { ConnectionState, StateChangeCallback } from '../types';

/**
 * Менеджер состояния WebSocket соединения
 */
export class StateManager {
  /** Текущее состояние соединения */
  private state: ConnectionState = 'disconnected';
  
  /** Подписчики на изменения состояния */
  private listeners: Set<StateChangeCallback> = new Set();
  
  /** WebSocket instance для проверки readyState */
  private ws: WebSocket | null = null;

  /**
   * Получить текущее состояние соединения
   * @returns Текущее состояние
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Установить новое состояние соединения
   * Уведомляет всех подписчиков об изменении
   * 
   * @param newState - Новое состояние
   * 
   * Requirements: 7.2 - Уведомление при изменении состояния
   */
  setState(newState: ConnectionState): void {
    const oldState = this.state;
    
    // Если состояние не изменилось, не уведомляем
    if (oldState === newState) {
      return;
    }
    
    this.state = newState;
    
    // Уведомляем всех подписчиков
    this.listeners.forEach(listener => {
      try {
        listener(newState);
      } catch (error) {
        console.error('[StateManager] Ошибка в listener:', error);
      }
    });
  }

  /**
   * Проверить, активно ли соединение
   * Возвращает true только если:
   * - Внутреннее состояние === 'connected'
   * - WebSocket readyState === OPEN
   * 
   * @returns true если соединение активно
   * 
   * Requirements: 7.5, 7.6 - Согласованность isConnected() с WebSocket readyState
   */
  isConnected(): boolean {
    // Проверяем внутреннее состояние
    if (this.state !== 'connected') {
      return false;
    }
    
    // Проверяем WebSocket readyState
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    return true;
  }

  /**
   * Установить WebSocket instance для синхронизации состояния
   * 
   * @param ws - WebSocket instance или null
   * 
   * Requirements: 7.6 - Синхронизация с WebSocket readyState
   */
  setWebSocket(ws: WebSocket | null): void {
    this.ws = ws;
  }

  /**
   * Подписаться на изменения состояния
   * 
   * @param callback - Функция, вызываемая при изменении состояния
   * @returns Функция для отписки
   * 
   * Requirements: 7.2 - Механизм подписки на изменения
   */
  onChange(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    
    // Возвращаем функцию для отписки
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Очистить все подписки
   * Используется при уничтожении клиента
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Получить количество активных подписчиков
   * Используется для тестирования
   */
  getListenerCount(): number {
    return this.listeners.size;
  }
}
