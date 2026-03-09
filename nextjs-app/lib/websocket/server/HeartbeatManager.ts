/**
 * Модуль управления heartbeat механизмом на сервере
 * Отвечает за отправку ping frames и проверку активности соединений
 * 
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5
 */

import type { ConnectionHandler } from './ConnectionHandler';
import { TIMEOUTS, CUSTOM_CLOSE_CODES } from '../constants';

/**
 * Класс для управления heartbeat механизмом на сервере
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5
 */
export class HeartbeatManager {
  /** Обработчик соединений */
  private connectionHandler: ConnectionHandler;
  
  /** Интервал для отправки ping frames */
  private pingInterval: NodeJS.Timeout | null = null;
  
  /** Интервал для проверки "мёртвых" соединений */
  private checkInterval: NodeJS.Timeout | null = null;
  
  /** Флаг активности heartbeat */
  private isActive: boolean = false;
  
  /**
   * Создаёт экземпляр HeartbeatManager
   * @param connectionHandler - Обработчик соединений для доступа к клиентам
   */
  constructor(connectionHandler: ConnectionHandler) {
    this.connectionHandler = connectionHandler;
  }
  
  /**
   * Запуск heartbeat механизма
   * Validates: Requirements 3.2, 3.5
   * 
   * Запускает два интервала:
   * 1. Отправка ping frames каждые 30 секунд
   * 2. Проверка "мёртвых" соединений каждые 30 секунд
   */
  start(): void {
    if (this.isActive) {
      console.log('[HeartbeatManager] ⚠️ Heartbeat уже запущен');
      return;
    }
    
    console.log('[HeartbeatManager] ▶️ Запуск heartbeat механизма...');
    console.log(`[HeartbeatManager] Ping интервал: ${TIMEOUTS.SERVER_PING_INTERVAL}ms`);
    console.log(`[HeartbeatManager] Pong таймаут: ${TIMEOUTS.SERVER_PONG_TIMEOUT}ms`);
    
    this.isActive = true;
    
    // Интервал отправки ping frames каждые 30 секунд
    this.pingInterval = setInterval(() => {
      this.sendPingToAll();
    }, TIMEOUTS.SERVER_PING_INTERVAL);
    
    // Интервал проверки "мёртвых" соединений каждые 30 секунд
    this.checkInterval = setInterval(() => {
      this.checkDeadConnections();
    }, TIMEOUTS.SERVER_PING_INTERVAL);
    
    console.log('[HeartbeatManager] ✅ Heartbeat механизм запущен');
  }
  
  /**
   * Остановка heartbeat механизма
   * Validates: Requirements 3.6
   * 
   * Останавливает все интервалы и очищает ресурсы
   */
  stop(): void {
    if (!this.isActive) {
      console.log('[HeartbeatManager] ⚠️ Heartbeat уже остановлен');
      return;
    }
    
    console.log('[HeartbeatManager] ⏹️ Остановка heartbeat механизма...');
    
    // Очищаем интервалы
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    this.isActive = false;
    
    console.log('[HeartbeatManager] ✅ Heartbeat механизм остановлен');
  }
  
  /**
   * Отправка ping frames всем активным клиентам
   * Validates: Requirements 3.1, 3.2
   * 
   * Отправляет WebSocket ping frame (не JSON сообщение) каждому клиенту
   */
  sendPingToAll(): void {
    const connections = this.connectionHandler.getAllConnections();
    const activeCount = connections.size;
    
    if (activeCount === 0) {
      console.log('[HeartbeatManager] 🏓 Нет активных соединений для отправки ping');
      return;
    }
    
    console.log(`[HeartbeatManager] 🏓 Отправка ping frames ${activeCount} клиентам...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    connections.forEach((connection, clientId) => {
      try {
        // Проверяем, что WebSocket в состоянии OPEN
        if (connection.ws.readyState === 1) { // 1 = OPEN
          // Отправляем WebSocket ping frame (не JSON сообщение)
          connection.ws.ping();
          successCount++;
          
          console.log(`[HeartbeatManager][${clientId}] 🏓 Ping отправлен`);
        } else {
          console.warn(
            `[HeartbeatManager][${clientId}] ⚠️ WebSocket не в состоянии OPEN (${connection.ws.readyState})`
          );
          errorCount++;
        }
      } catch (error) {
        console.error(`[HeartbeatManager][${clientId}] ❌ Ошибка отправки ping:`, error);
        errorCount++;
      }
    });
    
    console.log(
      `[HeartbeatManager] 🏓 Ping отправлен: успешно=${successCount}, ошибок=${errorCount}`
    );
  }
  
  /**
   * Обработка pong ответа от клиента
   * Validates: Requirements 3.3
   * 
   * Обновляет время последнего pong для отслеживания активности
   * @param clientId - ID клиента, от которого получен pong
   */
  handlePong(clientId: string): void {
    // Обновляем lastPongAt через ConnectionHandler
    this.connectionHandler.updateLastPong(clientId);
  }
  
  /**
   * Проверка "мёртвых" соединений
   * Validates: Requirements 3.4
   * 
   * Закрывает соединения, от которых не получен pong в течение 60 секунд
   */
  checkDeadConnections(): void {
    const connections = this.connectionHandler.getAllConnections();
    const now = new Date();
    const timeoutMs = TIMEOUTS.SERVER_PONG_TIMEOUT;
    
    console.log(`[HeartbeatManager] 🔍 Проверка "мёртвых" соединений (${connections.size} активных)...`);
    
    let deadCount = 0;
    
    connections.forEach((connection, clientId) => {
      const timeSinceLastPong = now.getTime() - connection.lastPongAt.getTime();
      
      // Если прошло больше 60 секунд с последнего pong
      if (timeSinceLastPong > timeoutMs) {
        console.warn(
          `[HeartbeatManager][${clientId}] ⚠️ Соединение "мёртвое": ` +
          `${Math.round(timeSinceLastPong / 1000)}s с последнего pong (лимит: ${timeoutMs / 1000}s)`
        );
        
        // Закрываем соединение с кодом 4408 (HEARTBEAT_TIMEOUT)
        this.connectionHandler.closeConnection(
          clientId,
          CUSTOM_CLOSE_CODES.HEARTBEAT_TIMEOUT,
          'Heartbeat timeout: no pong received'
        );
        
        deadCount++;
      }
    });
    
    if (deadCount > 0) {
      console.log(`[HeartbeatManager] 🔍 Закрыто "мёртвых" соединений: ${deadCount}`);
    } else {
      console.log('[HeartbeatManager] 🔍 Все соединения активны');
    }
  }
  
  /**
   * Проверка, запущен ли heartbeat
   * @returns true если heartbeat активен
   */
  isRunning(): boolean {
    return this.isActive;
  }
}
