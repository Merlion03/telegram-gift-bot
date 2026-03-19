/**
 * Модуль диагностики сетевых проблем для Telegram Bot API
 * Помогает выявить и решить проблемы с подключением к внешним API
 */

interface NetworkDiagnosticResult {
  success: boolean;
  error?: string;
  details?: any;
  timestamp: string;
}

interface TelegramApiStatus {
  reachable: boolean;
  responseTime?: number;
  error?: string;
}

export class NetworkDiagnostics {
  private static readonly TELEGRAM_API_BASE = 'https://api.telegram.org';
  private static readonly TIMEOUT_MS = 10000; // 10 секунд

  /**
   * Проверяет доступность Telegram API
   */
  static async checkTelegramApiAccess(): Promise<TelegramApiStatus> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(`${this.TELEGRAM_API_BASE}/bot123456789:test/getMe`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'TelegramBot/1.0',
        },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        reachable: true,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        reachable: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Проверяет общую сетевую доступность
   */
  static async checkGeneralConnectivity(): Promise<NetworkDiagnosticResult> {
    const timestamp = new Date().toISOString();
    
    try {
      // Проверяем доступность популярных DNS серверов
      const testUrls = [
        'https://1.1.1.1', // Cloudflare DNS
        'https://8.8.8.8', // Google DNS
        'https://httpbin.org/get', // Тестовый HTTP сервис
      ];

      const results = await Promise.allSettled(
        testUrls.map(async (url) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return { url, success: true, status: response.status };
          } catch (error) {
            clearTimeout(timeoutId);
            return { 
              url, 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            };
          }
        })
      );

      const successCount = results.filter(
        (result) => result.status === 'fulfilled' && result.value.success
      ).length;

      return {
        success: successCount > 0,
        details: {
          totalTests: testUrls.length,
          successfulTests: successCount,
          results: results.map((result) => 
            result.status === 'fulfilled' ? result.value : { error: result.reason }
          ),
        },
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp,
      };
    }
  }

  /**
   * Полная диагностика сетевых проблем
   */
  static async runFullDiagnostics(): Promise<{
    generalConnectivity: NetworkDiagnosticResult;
    telegramApiAccess: TelegramApiStatus;
    recommendations: string[];
  }> {
    const [generalConnectivity, telegramApiAccess] = await Promise.all([
      this.checkGeneralConnectivity(),
      this.checkTelegramApiAccess(),
    ]);

    const recommendations: string[] = [];

    if (!generalConnectivity.success) {
      recommendations.push(
        'Проблемы с общим сетевым подключением. Проверьте настройки Docker и сети.'
      );
      recommendations.push(
        'Убедитесь, что контейнер имеет доступ к внешним сетям.'
      );
    }

    if (!telegramApiAccess.reachable) {
      recommendations.push(
        'Telegram API недоступен. Возможные причины:'
      );
      recommendations.push(
        '- Блокировка Telegram в вашей стране/сети'
      );
      recommendations.push(
        '- Проблемы с DNS разрешением'
      );
      recommendations.push(
        '- Настройки прокси или файрвола'
      );
    }

    if (telegramApiAccess.responseTime && telegramApiAccess.responseTime > 5000) {
      recommendations.push(
        'Медленное соединение с Telegram API. Рассмотрите использование прокси.'
      );
    }

    return {
      generalConnectivity,
      telegramApiAccess,
      recommendations,
    };
  }
}