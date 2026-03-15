// Конфигурация Telegram бота
export const BOT_CONFIG = {
  token: '8750818318:AAFVbrHcTQR4nPrHA9fwZ8vY261_1HzaOCY',
  apiUrl: 'https://api.telegram.org',
  webhookUrl: 'https://tomasa-nonscoring-bo.ngrok-free.dev/webhook',
  
  // Настройки для разных режимов
  modes: {
    development: {
      polling: true,
      webhook: false,
      debug: true
    },
    production: {
      polling: false,
      webhook: true,
      debug: false
    }
  },
  
  // Команды бота
  commands: [
    { command: 'start', description: 'Запустить бота' },
    { command: 'help', description: 'Показать справку' },
    { command: 'panel', description: 'Открыть панель оператора' },
    { command: 'stats', description: 'Показать статистику' },
    { command: 'settings', description: 'Настройки' }
  ],
  
  // Настройки Mini App
  miniApp: {
    url: 'https://tomasa-nonscoring-bo.ngrok-free.dev',
    shortName: 'operator_panel',
    title: 'Панель оператора',
    description: 'Панель управления для операторов поддержки'
  }
}

// Получить токен бота
export const getBotToken = () => BOT_CONFIG.token

// Получить URL API
export const getApiUrl = () => `${BOT_CONFIG.apiUrl}/bot${BOT_CONFIG.token}`

// Проверить, что бот настроен
export const isBotConfigured = () => Boolean(BOT_CONFIG.token)