/**
 * ConnectionManager - Управление WebSocket соединением
 * 
 * Ответственность:
 * - Установка и закрытие WebSocket соединения
 * - Отправка сообщений
 * - Обработка событий WebSocket (open, close, error, message)
 * - Интеграция с StateManager для управления состоянием
 * 
 * Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 12.1
 */

import type { ClientMessage, ErrorCallback, MessageCallback } from '../types';
import { CLOSE_CODES, TIMEOUTS } from '../constants';
import { StateManager } from './StateManager';

/**
 * Обработчики событий WebSocket
 */
interface ConnectionEventHandlers {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: ErrorCallback;
  onMessage?: MessageCallback;
}

/**
 * Менеджер WebSocket соединения
 */
export class ConnectionManager {
  /** WebSocket instance */
  private ws: WebSocket | null = null;
  
  /** Менеджер состояния */
  private stateManager: StateManager;
  
  /** Обработчики событий */
  private handlers: ConnectionEventHandlers = {};
  
  /** URL для подключения */
  private url: string | null = null;

  /**
   * Создать ConnectionManager
   * 
   * @param stateManager - Менеджер состояния соединения
   */
  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Установить WebSocket соединение
   * 
   * Процесс:
   * 1. Создать WebSocket с токеном в URL
   * 2. Установить обработчики событий
   * 3. Дождаться открытия соединения
   * 4. Задержка 50ms для стабилизации прокси
   * 5. Отправить init сообщение для начала handshake
   * 
   * @param url - WebSocket URL
   * @param token - JWT токен для аутентификации
   * 
   * Requirements:
   * - 2.1, 2.2: Client speaks first - клиент отправляет init первым
   * - 12.1: Задержка 50ms после HTTP Upgrade для стабилизации прокси
   */
  async connect(url: string, token: string): Promise<void> {
    // Если уже есть активное соединение, закрываем его
    if (this.ws) {
      console.log('[ConnectionManager] ⚠️ Обнаружено существующее соединение, закрываем его перед новым подключением');
      this.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Reconnecting');
    }

    this.url = url;
    
    // Добавляем токен в query параметры
    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
    
    // ВАЖНО: Состояние connecting должно быть установлено ДО вызова этого метода
    // в PostgresRealtimeClient.connect() для предотвращения race condition
    
    return new Promise((resolve, reject) => {
      try {
        // Создаём WebSocket соединение
        this.ws = new WebSocket(wsUrl);
        
        // Синхронизируем с StateManager
        this.stateManager.setWebSocket(this.ws);
        
        // Обработчик успешного открытия соединения
        const handleOpen = async () => {
          console.log('[ConnectionManager] ✅ WebSocket соединение открыто');
          
          // Requirement 2.1: Захватываем локальную ссылку на WebSocket instance
          // для избежания race condition с handleClose
          const wsInstance = this.ws!;
          console.log('[ConnectionManager] 🔒 Захвачена локальная ссылка на WebSocket instance');
          
          // Вызываем пользовательский обработчик СРАЗУ
          console.log('[ConnectionManager] 📞 Вызов onOpen callback...');
          if (this.handlers.onOpen) {
            this.handlers.onOpen();
          }
          console.log('[ConnectionManager] ✅ onOpen callback завершён');
          
          // Requirement 2.1, 2.2: Client speaks first
          // Отправляем init сообщение СРАЗУ, без задержки
          console.log('[ConnectionManager] 🔍 Проверка readyState перед отправкой init:', {
            readyState: wsInstance.readyState,
            readyStateText: wsInstance.readyState === WebSocket.OPEN ? 'OPEN' : 
                            wsInstance.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
                            wsInstance.readyState === WebSocket.CLOSING ? 'CLOSING' :
                            wsInstance.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN',
            thisWsStillSame: this.ws === wsInstance
          });
          
          if (wsInstance.readyState === WebSocket.OPEN) {
            const initMessage: ClientMessage = { type: 'init' };
            console.log('[ConnectionManager] 📤 Отправка init сообщения СРАЗУ (без задержки)...', initMessage);
            const sent = this.send(initMessage, wsInstance);
            console.log('[ConnectionManager] 📤 Init сообщение отправлено:', sent);
            
            if (!sent) {
              console.error('[ConnectionManager] ❌ Не удалось отправить init сообщение!');
            }
          } else {
            console.warn('[ConnectionManager] ⚠️ Захваченный WebSocket не в состоянии OPEN, пропускаем отправку init');
          }
          
          resolve();
        };
        
        // Обработчик закрытия соединения
        const handleClose = (event: CloseEvent) => {
          // Requirement 2.6: Проверяем, что закрывается именно текущий активный сокет
          // Это предотвращает очистку this.ws, если уже создан новый WebSocket instance
          if (this.ws !== event.target) {
            console.log('[ConnectionManager] 🔍 Закрывается старый WebSocket instance, игнорируем');
            return;
          }
          
          // ДИАГНОСТИКА: Логируем stack trace для понимания, кто закрыл соединение
          console.log(`[ConnectionManager] ❌ WebSocket закрыт: код=${event.code}, причина="${event.reason}"`);
          console.log('[ConnectionManager] 📍 Stack trace закрытия:', new Error().stack);
          console.log('[ConnectionManager] 🔍 Детали события:', {
            wasClean: event.wasClean,
            code: event.code,
            reason: event.reason,
            timeStamp: event.timeStamp,
            type: event.type
          });
          
          // Обновляем состояние
          this.stateManager.setState('disconnected');
          this.stateManager.setWebSocket(null);
          
          // Очищаем ссылку на WebSocket только если это текущий активный сокет
          this.ws = null;
          
          // Вызываем пользовательский обработчик
          if (this.handlers.onClose) {
            this.handlers.onClose(event.code, event.reason);
          }
        };
        
        // Обработчик ошибок
        const handleError = (event: Event) => {
          console.error('[ConnectionManager] ⚠️ WebSocket ошибка:', event);
          console.log('[ConnectionManager] 📍 Stack trace ошибки:', new Error().stack);
          console.log('[ConnectionManager] 🔍 Детали ошибки:', {
            type: event.type,
            timeStamp: event.timeStamp,
            target: event.target,
            currentTarget: event.currentTarget
          });
          
          const error = new Error('WebSocket connection error');
          
          // Вызываем пользовательский обработчик
          if (this.handlers.onError) {
            this.handlers.onError(error);
          }
          
          // Если ошибка произошла до открытия соединения, отклоняем Promise
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            reject(error);
          }
        };
        
        // Обработчик входящих сообщений
        const handleMessage = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data);
            
            // Вызываем пользовательский обработчик
            if (this.handlers.onMessage) {
              this.handlers.onMessage(message);
            }
          } catch (error) {
            console.error('[ConnectionManager] Ошибка парсинга сообщения:', error);
            
            if (this.handlers.onError) {
              this.handlers.onError(error as Error);
            }
          }
        };
        
        // Устанавливаем обработчики событий
        this.ws.addEventListener('open', handleOpen);
        this.ws.addEventListener('close', handleClose);
        this.ws.addEventListener('error', handleError);
        this.ws.addEventListener('message', handleMessage);
        
      } catch (error) {
        console.error('[ConnectionManager] Ошибка создания WebSocket:', error);
        this.stateManager.setState('disconnected');
        reject(error);
      }
    });
  }

  /**
   * Закрыть WebSocket соединение
   * 
   * @param code - Код закрытия (по умолчанию 1000 - нормальное закрытие)
   * @param reason - Причина закрытия
   * 
   * Requirements:
   * - 1.4: Использование кода 1000 при нормальном закрытии
   * - 1.5: Использование правильных кодов при ошибках
   */
  disconnect(code: number = CLOSE_CODES.NORMAL_CLOSURE, reason: string = 'Normal closure'): void {
    if (!this.ws) {
      console.warn('[ConnectionManager] Попытка закрыть несуществующее соединение');
      return;
    }

    console.log(`[ConnectionManager] Закрытие соединения: код=${code}, причина="${reason}"`);
    
    try {
      // Requirement 1.4, 1.5: Используем правильный код закрытия
      this.ws.close(code, reason);
    } catch (error) {
      console.error('[ConnectionManager] Ошибка при закрытии соединения:', error);
    }
    
    // Обновляем состояние
    this.stateManager.setState('disconnected');
    this.stateManager.setWebSocket(null);
    this.ws = null;
  }

  /**
   * Отправить сообщение через WebSocket
   * 
   * @param message - Сообщение для отправки
   * @param ws - Опциональный WebSocket instance для отправки (если не передан, используется this.ws)
   * @returns true если сообщение отправлено, false если соединение не активно
   * 
   * Requirements: 1.1 - Стабильная отправка сообщений
   * Requirements: 2.5 - Поддержка прямой передачи WebSocket instance для избежания race conditions
   */
  send(message: ClientMessage | any, ws?: WebSocket): boolean {
    // Используем переданный instance или this.ws для обратной совместимости
    const wsInstance = ws || this.ws;
    
    const diagnostics = {
      hasWs: !!wsInstance,
      readyState: wsInstance?.readyState,
      readyStateText: wsInstance?.readyState === WebSocket.OPEN ? 'OPEN' : 
                      wsInstance?.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
                      wsInstance?.readyState === WebSocket.CLOSING ? 'CLOSING' :
                      wsInstance?.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN',
      usingCapturedRef: !!ws,
      thisWsExists: !!this.ws,
      sameInstance: ws ? (this.ws === ws) : true,
      messageType: message?.type || 'unknown'
    };
    
    console.log('[ConnectionManager] 🔍 Попытка отправки сообщения:', diagnostics);
    
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
      console.warn('[ConnectionManager] ⚠️ Невозможно отправить сообщение: соединение не активно', diagnostics);
      return false;
    }

    try {
      const data = JSON.stringify(message);
      wsInstance.send(data);
      console.log('[ConnectionManager] ✅ Сообщение отправлено успешно:', message.type || 'unknown');
      return true;
    } catch (error) {
      console.error('[ConnectionManager] ❌ Ошибка отправки сообщения:', error, diagnostics);
      
      if (this.handlers.onError) {
        this.handlers.onError(error as Error);
      }
      
      return false;
    }
  }

  /**
   * Получить WebSocket instance
   * Используется для прямого доступа к WebSocket API (например, для heartbeat)
   * 
   * @returns WebSocket instance или null
   */
  getWebSocket(): WebSocket | null {
    return this.ws;
  }

  /**
   * Проверить, открыто ли соединение
   * 
   * @returns true если WebSocket в состоянии OPEN
   */
  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Установить обработчики событий
   * 
   * @param handlers - Объект с обработчиками событий
   */
  setHandlers(handlers: ConnectionEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Установить обработчик конкретного события
   * 
   * @param event - Тип события
   * @param handler - Функция-обработчик
   */
  on(event: keyof ConnectionEventHandlers, handler: Function): void {
    this.handlers[event] = handler as any;
  }

  /**
   * Получить текущий URL соединения
   * 
   * @returns URL или null
   */
  getUrl(): string | null {
    return this.url;
  }

  /**
   * Очистить все обработчики
   * Используется при уничтожении клиента
   */
  clear(): void {
    this.handlers = {};
    
    if (this.ws) {
      this.disconnect(CLOSE_CODES.NORMAL_CLOSURE, 'Client destroyed');
    }
  }
}
