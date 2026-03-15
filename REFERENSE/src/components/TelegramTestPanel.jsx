import React, { useState, useEffect } from 'react'
import { useTelegramBot } from '../hooks/useTelegramBot'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'
import { BOT_CONFIG, getBotToken } from '../config/bot'

const TelegramTestPanel = () => {
  const [testResults, setTestResults] = useState([])
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [botInfo, setBotInfo] = useState(null)
  
  const botToken = getBotToken()
  const bot = useTelegramBot(botToken)
  const { user: tgUser, webApp, isReady, startParam } = useTelegramWebApp()

  const addTestResult = (test, status, message, data = null) => {
    setTestResults(prev => [...prev, {
      id: Date.now(),
      test,
      status,
      message,
      data,
      timestamp: new Date().toLocaleTimeString()
    }])
  }

  const runBotTests = async () => {
    setIsRunningTests(true)
    setTestResults([])

    try {
      // Тест 1: Получение информации о боте
      addTestResult('Подключение к боту', 'running', 'Получаем информацию о боте...')
      const botData = await bot.getMe()
      setBotInfo(botData)
      addTestResult('Подключение к боту', 'success', `Бот подключен: @${botData.username}`, botData)

      // Тест 2: Проверка webhook
      addTestResult('Webhook', 'running', 'Проверяем настройки webhook...')
      try {
        const webhookResponse = await fetch('/webhook-info')
        const webhookInfo = await webhookResponse.json()
        
        if (webhookInfo.ok) {
          addTestResult('Webhook', webhookInfo.result.url ? 'success' : 'warning', 
            webhookInfo.result.url ? `Webhook установлен: ${webhookInfo.result.url}` : 'Webhook не установлен', webhookInfo.result)
        } else {
          addTestResult('Webhook', 'error', 'Ошибка получения информации о webhook')
        }
      } catch (error) {
        addTestResult('Webhook', 'error', `Ошибка проверки webhook: ${error.message}`)
      }

      // Тест 3: Отправка тестового сообщения (если есть пользователь)
      if (tgUser) {
        addTestResult('Отправка сообщения', 'running', 'Отправляем тестовое сообщение...')
        try {
          await bot.sendMessage(tgUser.id, `🤖 Тестовое сообщение от панели оператора\n\nВремя: ${new Date().toLocaleString()}\nПараметр запуска: ${startParam || 'не указан'}`)
          addTestResult('Отправка сообщения', 'success', 'Тестовое сообщение отправлено')
        } catch (error) {
          addTestResult('Отправка сообщения', 'error', `Ошибка отправки: ${error.message}`)
        }
      }

    } catch (error) {
      addTestResult('Общая ошибка', 'error', error.message)
    }

    setIsRunningTests(false)
  }

  const setupWebhook = async () => {
    try {
      addTestResult('Установка webhook', 'running', 'Устанавливаем webhook...')
      
      // Используем наш локальный endpoint
      const response = await fetch('/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const data = await response.json()
      
      if (data.ok) {
        addTestResult('Установка webhook', 'success', `Webhook установлен: ${BOT_CONFIG.webhookUrl}`)
      } else {
        addTestResult('Установка webhook', 'error', `Ошибка: ${data.description}`)
      }
    } catch (error) {
      addTestResult('Установка webhook', 'error', `Ошибка установки webhook: ${error.message}`)
    }
  }

  const deleteWebhook = async () => {
    try {
      addTestResult('Удаление webhook', 'running', 'Удаляем webhook...')
      await bot.deleteWebhook()
      addTestResult('Удаление webhook', 'success', 'Webhook удален')
    } catch (error) {
      addTestResult('Удаление webhook', 'error', `Ошибка удаления webhook: ${error.message}`)
    }
  }

  const sendNotification = async () => {
    if (!tgUser) {
      addTestResult('Уведомление', 'error', 'Пользователь не найден')
      return
    }

    try {
      addTestResult('Уведомление', 'running', 'Отправляем уведомление...')
      await bot.sendMessage(tgUser.id, `📢 Уведомление от панели оператора\n\n✅ Система работает нормально\n🕐 ${new Date().toLocaleString()}\n👤 Пользователь: ${tgUser.first_name}`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть панель', web_app: { url: BOT_CONFIG.miniApp.url } }
          ]]
        }
      })
      addTestResult('Уведомление', 'success', 'Уведомление отправлено')
    } catch (error) {
      addTestResult('Уведомление', 'error', `Ошибка отправки уведомления: ${error.message}`)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'warning': return '⚠️'
      case 'running': return '🔄'
      default: return 'ℹ️'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'text-green-600 dark:text-green-400'
      case 'error': return 'text-red-600 dark:text-red-400'
      case 'warning': return 'text-yellow-600 dark:text-yellow-400'
      case 'running': return 'text-blue-600 dark:text-blue-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          🤖 Тестирование Telegram бота
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Панель для тестирования интеграции с Telegram Bot API
        </p>
      </div>

      {/* Информация о боте */}
      {botInfo && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Информация о боте</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-700 dark:text-blue-300">Имя:</span> {botInfo.first_name}
            </div>
            <div>
              <span className="text-blue-700 dark:text-blue-300">Username:</span> @{botInfo.username}
            </div>
            <div>
              <span className="text-blue-700 dark:text-blue-300">ID:</span> {botInfo.id}
            </div>
            <div>
              <span className="text-blue-700 dark:text-blue-300">Может присоединяться к группам:</span> {botInfo.can_join_groups ? 'Да' : 'Нет'}
            </div>
          </div>
        </div>
      )}

      {/* Информация о пользователе */}
      {tgUser && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">Текущий пользователь</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-green-700 dark:text-green-300">Имя:</span> {tgUser.first_name} {tgUser.last_name}
            </div>
            <div>
              <span className="text-green-700 dark:text-green-300">Username:</span> @{tgUser.username}
            </div>
            <div>
              <span className="text-green-700 dark:text-green-300">ID:</span> {tgUser.id}
            </div>
            <div>
              <span className="text-green-700 dark:text-green-300">Язык:</span> {tgUser.language_code}
            </div>
          </div>
          {startParam && (
            <div className="mt-2">
              <span className="text-green-700 dark:text-green-300">Параметр запуска:</span> {startParam}
            </div>
          )}
        </div>
      )}

      {/* Кнопки управления */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={runBotTests}
          disabled={isRunningTests}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
        >
          {isRunningTests ? '🔄 Тестирование...' : '🧪 Запустить тесты'}
        </button>
        
        <button
          onClick={setupWebhook}
          disabled={bot.isLoading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors"
        >
          🔗 Установить Webhook
        </button>
        
        <button
          onClick={deleteWebhook}
          disabled={bot.isLoading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
        >
          🗑️ Удалить Webhook
        </button>
        
        <button
          onClick={sendNotification}
          disabled={bot.isLoading || !tgUser}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg font-medium transition-colors"
        >
          📢 Отправить уведомление
        </button>
      </div>

      {/* Результаты тестов */}
      {testResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Результаты тестов</h3>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {testResults.map((result) => (
              <div
                key={result.id}
                className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border-l-4 border-gray-300 dark:border-gray-600"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{getStatusIcon(result.status)}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {result.test}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {result.timestamp}
                  </span>
                </div>
                <p className={`text-sm ${getStatusColor(result.status)}`}>
                  {result.message}
                </p>
                {result.data && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                      Подробности
                    </summary>
                    <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Конфигурация */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Конфигурация</h3>
        <div className="text-sm space-y-1">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Bot Token:</span> {botToken.substring(0, 20)}...
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Webhook URL:</span> {BOT_CONFIG.webhookUrl}
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Mini App URL:</span> {BOT_CONFIG.miniApp.url}
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">WebApp Ready:</span> {isReady ? '✅' : '❌'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TelegramTestPanel