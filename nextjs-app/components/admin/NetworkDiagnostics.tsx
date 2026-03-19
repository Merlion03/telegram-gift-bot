/**
 * Компонент диагностики сетевых проблем
 * Отображает состояние подключения к Telegram API и рекомендации по устранению проблем
 */

'use client';

import { useState } from 'react';

interface DiagnosticsData {
  timestamp: string;
  diagnostics: {
    generalConnectivity: {
      success: boolean;
      details?: any;
      error?: string;
    };
    telegramApiAccess: {
      reachable: boolean;
      responseTime?: number;
      error?: string;
    };
    recommendations: string[];
  };
  botStatus: {
    connected: boolean;
    botInfo?: any;
    error?: string;
  };
  environment: {
    nodeEnv: string;
    hasProxy: boolean;
    userAgent: string;
  };
}

export function NetworkDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/support/diagnostics');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка при выполнении диагностики');
      }

      const data = await response.json();
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? '✅' : '❌';
  };

  const getStatusBadge = (success: boolean, label: string) => {
    const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    const statusClasses = success 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
    
    return (
      <span className={`${baseClasses} ${statusClasses}`}>
        {success ? '✓' : '✗'} {label}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Диагностика сети</h2>
          <p className="text-gray-600 mt-1">
            Проверка подключения к Telegram API и диагностика сетевых проблем
          </p>
        </div>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Выполняется...
            </>
          ) : (
            <>
              🔄 Запустить диагностику
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-400">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {diagnostics && (
        <div className="space-y-6">
          {/* Общий статус */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <span className="text-2xl mr-3">
                  {getStatusIcon(diagnostics.botStatus.connected)}
                </span>
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Статус Telegram Bot
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Последняя проверка: {new Date(diagnostics.timestamp).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  {getStatusBadge(diagnostics.botStatus.connected, 'Подключение к боту')}
                  {getStatusBadge(diagnostics.diagnostics.generalConnectivity.success, 'Общая связность')}
                  {getStatusBadge(diagnostics.diagnostics.telegramApiAccess.reachable, 'Telegram API')}
                </div>

                {diagnostics.botStatus.connected && diagnostics.botStatus.botInfo && (
                  <div className="mt-4 bg-green-50 p-4 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-2">Информация о боте:</h4>
                    <div className="text-sm text-green-700 space-y-1">
                      <p><strong>Имя:</strong> {diagnostics.botStatus.botInfo.first_name}</p>
                      <p><strong>Username:</strong> @{diagnostics.botStatus.botInfo.username}</p>
                      <p><strong>ID:</strong> {diagnostics.botStatus.botInfo.id}</p>
                    </div>
                  </div>
                )}

                {!diagnostics.botStatus.connected && (
                  <div className="mt-4 bg-red-50 p-4 rounded-lg">
                    <h4 className="font-medium text-red-800 mb-2">Ошибка подключения:</h4>
                    <p className="text-sm text-red-700">
                      {diagnostics.botStatus.error || 'Неизвестная ошибка'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Детальная диагностика */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Детальная диагностика
              </h3>
              
              <div className="space-y-4">
                {/* Общая связность */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span>{getStatusIcon(diagnostics.diagnostics.generalConnectivity.success)}</span>
                    Общая сетевая связность
                  </h4>
                  {diagnostics.diagnostics.generalConnectivity.details && (
                    <div className="text-sm text-gray-600 ml-7">
                      Успешных тестов: {diagnostics.diagnostics.generalConnectivity.details.successfulTests} из {diagnostics.diagnostics.generalConnectivity.details.totalTests}
                    </div>
                  )}
                </div>

                {/* Telegram API */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span>{getStatusIcon(diagnostics.diagnostics.telegramApiAccess.reachable)}</span>
                    Доступность Telegram API
                  </h4>
                  <div className="text-sm text-gray-600 ml-7">
                    {diagnostics.diagnostics.telegramApiAccess.reachable ? (
                      <span>
                        Время ответа: {diagnostics.diagnostics.telegramApiAccess.responseTime}мс
                      </span>
                    ) : (
                      <span className="text-red-600">
                        {diagnostics.diagnostics.telegramApiAccess.error}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Рекомендации */}
          {diagnostics.diagnostics.recommendations.length > 0 && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-yellow-500">⚠️</span>
                  Рекомендации по устранению проблем
                </h3>
                
                <ul className="space-y-2">
                  {diagnostics.diagnostics.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-yellow-500 mt-1">•</span>
                      <span className="text-sm">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Информация об окружении */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Информация об окружении
              </h3>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Режим:</span> {diagnostics.environment.nodeEnv}
                </div>
                <div>
                  <span className="font-medium">Прокси:</span> {diagnostics.environment.hasProxy ? 'Настроен' : 'Не настроен'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!diagnostics && !loading && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="text-center text-gray-500">
              <span className="text-4xl mb-4 block">⚠️</span>
              <p>Нажмите "Запустить диагностику" для проверки состояния сети</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}