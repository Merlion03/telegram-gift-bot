/**
 * MetricsCollector - Сбор и логирование метрик WebSocket сервера
 * 
 * Ответственность:
 * - Отслеживание метрик: totalConnections, activeConnections, totalNotifications, totalErrors, totalPongsReceived
 * - Логирование метрик каждые 60 секунд
 * - Предоставление API для получения текущих метрик
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

/**
 * Интерфейс метрик WebSocket сервера
 */
export interface Metrics {
  totalConnections: number        // Общее количество подключений за всё время
  activeConnections: number       // Текущее количество активных подключений
  totalNotifications: number      // Общее количество отправленных уведомлений
  totalErrors: number             // Общее количество ошибок
  totalPongsReceived: number      // Общее количество полученных pong ответов
  lastNotificationAt: Date | null // Timestamp последнего уведомления
}

/**
 * Класс для сбора и логирования метрик WebSocket сервера
 */
export class MetricsCollector {
  private metrics: Metrics
  private loggingInterval: NodeJS.Timeout | null = null

  constructor() {
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      totalNotifications: 0,
      totalErrors: 0,
      totalPongsReceived: 0,
      lastNotificationAt: null,
    }
  }

  /**
   * Инкремент метрики
   * @param metric - Название метрики для инкремента
   */
  increment(metric: keyof Omit<Metrics, 'lastNotificationAt'>): void {
    this.metrics[metric]++
  }

  /**
   * Декремент метрики
   * @param metric - Название метрики для декремента
   */
  decrement(metric: keyof Omit<Metrics, 'lastNotificationAt'>): void {
    if (this.metrics[metric] > 0) {
      this.metrics[metric]--
    }
  }

  /**
   * Установка значения метрики
   * @param metric - Название метрики
   * @param value - Новое значение
   */
  set(metric: keyof Metrics, value: number | Date | null): void {
    if (metric === 'lastNotificationAt') {
      if (value !== null && !(value instanceof Date)) {
        throw new Error('lastNotificationAt must be a Date or null')
      }
      this.metrics.lastNotificationAt = value as Date | null
    } else {
      if (typeof value !== 'number') {
        throw new Error(`${metric} must be a number`)
      }
      this.metrics[metric] = value
    }
  }

  /**
   * Получение всех метрик
   * @returns Копия объекта метрик
   */
  getAll(): Metrics {
    return { ...this.metrics }
  }

  /**
   * Логирование метрик
   * Выводит текущие метрики в лог с полным контекстом
   */
  logMetrics(): void {
    console.log('[MetricsCollector] WebSocket Server Metrics:', {
      totalConnections: this.metrics.totalConnections,
      activeConnections: this.metrics.activeConnections,
      totalNotifications: this.metrics.totalNotifications,
      totalErrors: this.metrics.totalErrors,
      totalPongsReceived: this.metrics.totalPongsReceived,
      lastNotificationAt: this.metrics.lastNotificationAt?.toISOString() || null,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Запуск автоматического логирования метрик каждые 60 секунд
   * Requirements: 11.2
   */
  startLogging(): void {
    if (this.loggingInterval) {
      console.warn('[MetricsCollector] Metrics logging already started');
      return
    }

    // Логируем сразу при старте
    this.logMetrics()

    // Затем каждые 60 секунд
    this.loggingInterval = setInterval(() => {
      this.logMetrics()
    }, 60000) // 60 секунд

    console.log('[MetricsCollector] Metrics logging started (interval: 60 seconds)');
  }

  /**
   * Остановка автоматического логирования метрик
   */
  stopLogging(): void {
    if (this.loggingInterval) {
      clearInterval(this.loggingInterval)
      this.loggingInterval = null

      // Финальное логирование перед остановкой
      this.logMetrics()

      console.log('[MetricsCollector] Metrics logging stopped');
    }
  }

  /**
   * Сброс всех метрик (для тестирования)
   */
  reset(): void {
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      totalNotifications: 0,
      totalErrors: 0,
      totalPongsReceived: 0,
      lastNotificationAt: null,
    }
  }
}
