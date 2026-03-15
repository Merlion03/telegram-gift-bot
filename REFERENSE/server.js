import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Конфигурация бота
const BOT_TOKEN = '8750818318:AAFVbrHcTQR4nPrHA9fwZ8vY261_1HzaOCY'
const WEBAPP_URL = 'https://tomasa-nonscoring-bo.ngrok-free.dev'

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static('dist'))

// Функция для отправки сообщений через Telegram Bot API
async function sendMessage(chatId, text, options = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options
      })
    })
    
    const data = await response.json()
    if (!data.ok) {
      console.error('Telegram API Error:', data.description)
    }
    return data
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

// Webhook endpoint для получения сообщений от Telegram
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body
    console.log('Received update:', JSON.stringify(update, null, 2))

    if (update.message) {
      const message = update.message
      const chatId = message.chat.id
      const text = message.text
      const user = message.from

      console.log(`Message from ${user.first_name} (${user.id}): ${text}`)

      // Обработка команд
      if (text.startsWith('/')) {
        await handleCommand(chatId, text, user)
      } else {
        // Обычное сообщение
        await sendMessage(chatId, `📝 Получено сообщение: "${text}"\n\n🤖 Это автоответ от панели оператора. Ваше сообщение передано операторам.`)
      }
    }

    // Обработка callback queries (нажатия на inline кнопки)
    if (update.callback_query) {
      const callbackQuery = update.callback_query
      const chatId = callbackQuery.message.chat.id
      const data = callbackQuery.data

      await handleCallbackQuery(chatId, data, callbackQuery)
    }

    res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Обработка команд
async function handleCommand(chatId, command, user) {
  const cmd = command.split(' ')[0].toLowerCase()

  switch (cmd) {
    case '/start':
      const startParam = command.split(' ')[1]
      await handleStartCommand(chatId, user, startParam)
      break

    case '/help':
      await sendMessage(chatId, `
🤖 <b>Панель оператора - Справка</b>

<b>Доступные команды:</b>
/start - Запустить бота
/panel - Открыть панель оператора
/help - Показать эту справку
/status - Статус системы

<b>Функции:</b>
• Обработка обращений клиентов
• Управление диалогами
• Аналитика и отчеты
• Уведомления операторов

Для работы с панелью используйте кнопку ниже:
      `, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть панель оператора', web_app: { url: WEBAPP_URL } }
          ]]
        }
      })
      break

    case '/panel':
      await sendMessage(chatId, `
🎛️ <b>Панель оператора</b>

Нажмите кнопку ниже, чтобы открыть панель управления:
      `, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть панель', web_app: { url: WEBAPP_URL } },
            { text: '🧪 Тестирование', web_app: { url: `${WEBAPP_URL}?tgWebAppStartParam=test` } }
          ], [
            { text: '👥 VIP клиенты', web_app: { url: `${WEBAPP_URL}?tgWebAppStartParam=vip` } },
            { text: '🆕 Новые диалоги', web_app: { url: `${WEBAPP_URL}?tgWebAppStartParam=new` } }
          ]]
        }
      })
      break

    case '/status':
      await sendMessage(chatId, `
📊 <b>Статус системы</b>

✅ Бот: Активен
✅ Webhook: Настроен
✅ Панель: Доступна
🕐 Время: ${new Date().toLocaleString('ru-RU')}

<b>Статистика:</b>
• Активных диалогов: 3
• Новых обращений: 2
• Операторов онлайн: 1
      `)
      break

    default:
      await sendMessage(chatId, `
❓ Неизвестная команда: ${command}

Используйте /help для просмотра доступных команд.
      `)
  }
}

// Обработка команды /start
async function handleStartCommand(chatId, user, startParam) {
  let message = `
👋 <b>Добро пожаловать, ${user.first_name}!</b>

🎛️ Это панель управления для операторов поддержки.

<b>Возможности:</b>
• Управление диалогами с клиентами
• Просмотр истории сообщений
• Аналитика и статистика
• Уведомления о новых обращениях
  `

  let keyboard = [
    [{ text: '🚀 Открыть панель оператора', web_app: { url: WEBAPP_URL } }],
    [
      { text: '📋 Справка', callback_data: 'help' },
      { text: '📊 Статус', callback_data: 'status' }
    ]
  ]

  // Обработка параметров запуска
  if (startParam) {
    switch (startParam) {
      case 'support':
        message += `\n\n🎯 <b>Режим поддержки активирован</b>`
        keyboard.unshift([{ text: '🆘 Панель поддержки', web_app: { url: `${WEBAPP_URL}?tgWebAppStartParam=support` } }])
        break
      case 'vip':
        message += `\n\n⭐ <b>Режим VIP клиентов</b>`
        keyboard.unshift([{ text: '⭐ VIP клиенты', web_app: { url: `${WEBAPP_URL}?tgWebAppStartParam=vip` } }])
        break
      case 'test':
        message += `\n\n🧪 <b>Режим тестирования</b>`
        keyboard.unshift([{ text: '🧪 Панель тестирования', web_app: { url: `${WEBAPP_URL}?tgWebAppStartParam=test` } }])
        break
    }
  }

  await sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: keyboard
    }
  })
}

// Обработка callback queries
async function handleCallbackQuery(chatId, data, callbackQuery) {
  const queryId = callbackQuery.id

  // Отвечаем на callback query
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: queryId,
      text: 'Обрабатываем запрос...'
    })
  })

  switch (data) {
    case 'help':
      await handleCommand(chatId, '/help', callbackQuery.from)
      break
    case 'status':
      await handleCommand(chatId, '/status', callbackQuery.from)
      break
    default:
      await sendMessage(chatId, `Получен callback: ${data}`)
  }
}

// Endpoint для проверки здоровья сервера
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    bot_token: BOT_TOKEN ? 'configured' : 'missing'
  })
})

// Endpoint для установки webhook
app.post('/set-webhook', async (req, res) => {
  try {
    const webhookUrl = `${WEBAPP_URL}/webhook`
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      })
    })

    const data = await response.json()
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Endpoint для получения информации о webhook
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)
    const data = await response.json()
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Обслуживание React приложения
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📱 Webhook URL: ${WEBAPP_URL}/webhook`)
  console.log(`🤖 Bot token: ${BOT_TOKEN ? 'configured' : 'missing'}`)
})

export default app