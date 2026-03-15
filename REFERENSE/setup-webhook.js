// Скрипт для установки webhook
const BOT_TOKEN = '8750818318:AAFVbrHcTQR4nPrHA9fwZ8vY261_1HzaOCY'
const WEBHOOK_URL = 'https://tomasa-nonscoring-bo.ngrok-free.dev/webhook'

async function setupWebhook() {
  try {
    console.log('🔧 Настройка webhook...')
    
    // Устанавливаем webhook
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true
      })
    })

    const data = await response.json()
    
    if (data.ok) {
      console.log('✅ Webhook установлен успешно!')
      console.log(`📱 URL: ${WEBHOOK_URL}`)
    } else {
      console.error('❌ Ошибка установки webhook:', data.description)
    }

    // Проверяем информацию о webhook
    console.log('\n📋 Информация о webhook:')
    const infoResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)
    const infoData = await infoResponse.json()
    
    if (infoData.ok) {
      console.log('URL:', infoData.result.url || 'не установлен')
      console.log('Pending updates:', infoData.result.pending_update_count || 0)
      console.log('Last error:', infoData.result.last_error_message || 'нет ошибок')
    }

    // Получаем информацию о боте
    console.log('\n🤖 Информация о боте:')
    const botResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`)
    const botData = await botResponse.json()
    
    if (botData.ok) {
      console.log('Имя:', botData.result.first_name)
      console.log('Username:', `@${botData.result.username}`)
      console.log('ID:', botData.result.id)
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message)
  }
}

setupWebhook()