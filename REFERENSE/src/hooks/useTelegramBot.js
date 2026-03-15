import { useState, useCallback } from 'react'

export const useTelegramBot = (botToken) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const apiCall = useCallback(async (method, params = {}) => {
    if (!botToken) {
      throw new Error('Bot token не установлен')
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })

      const data = await response.json()

      if (!data.ok) {
        throw new Error(data.description || 'Ошибка API Telegram')
      }

      return data.result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [botToken])

  const sendMessage = useCallback(async (chatId, text, options = {}) => {
    return apiCall('sendMessage', {
      chat_id: chatId,
      text,
      ...options
    })
  }, [apiCall])

  const sendPhoto = useCallback(async (chatId, photo, options = {}) => {
    return apiCall('sendPhoto', {
      chat_id: chatId,
      photo,
      ...options
    })
  }, [apiCall])

  const sendDocument = useCallback(async (chatId, document, options = {}) => {
    return apiCall('sendDocument', {
      chat_id: chatId,
      document,
      ...options
    })
  }, [apiCall])

  const editMessage = useCallback(async (chatId, messageId, text, options = {}) => {
    return apiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options
    })
  }, [apiCall])

  const deleteMessage = useCallback(async (chatId, messageId) => {
    return apiCall('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    })
  }, [apiCall])

  const getChat = useCallback(async (chatId) => {
    return apiCall('getChat', { chat_id: chatId })
  }, [apiCall])

  const getChatMember = useCallback(async (chatId, userId) => {
    return apiCall('getChatMember', {
      chat_id: chatId,
      user_id: userId
    })
  }, [apiCall])

  const setWebhook = useCallback(async (url, options = {}) => {
    return apiCall('setWebhook', {
      url,
      ...options
    })
  }, [apiCall])

  const deleteWebhook = useCallback(async () => {
    return apiCall('deleteWebhook')
  }, [apiCall])

  const getWebhookInfo = useCallback(async () => {
    return apiCall('getWebhookInfo')
  }, [apiCall])

  const getMe = useCallback(async () => {
    return apiCall('getMe')
  }, [apiCall])

  const getUpdates = useCallback(async (options = {}) => {
    return apiCall('getUpdates', options)
  }, [apiCall])

  const answerCallbackQuery = useCallback(async (callbackQueryId, options = {}) => {
    return apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...options
    })
  }, [apiCall])

  const sendChatAction = useCallback(async (chatId, action) => {
    return apiCall('sendChatAction', {
      chat_id: chatId,
      action
    })
  }, [apiCall])

  const forwardMessage = useCallback(async (chatId, fromChatId, messageId, options = {}) => {
    return apiCall('forwardMessage', {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      ...options
    })
  }, [apiCall])

  const copyMessage = useCallback(async (chatId, fromChatId, messageId, options = {}) => {
    return apiCall('copyMessage', {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      ...options
    })
  }, [apiCall])

  const pinChatMessage = useCallback(async (chatId, messageId, options = {}) => {
    return apiCall('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      ...options
    })
  }, [apiCall])

  const unpinChatMessage = useCallback(async (chatId, messageId) => {
    return apiCall('unpinChatMessage', {
      chat_id: chatId,
      message_id: messageId
    })
  }, [apiCall])

  const restrictChatMember = useCallback(async (chatId, userId, permissions, options = {}) => {
    return apiCall('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      ...options
    })
  }, [apiCall])

  const banChatMember = useCallback(async (chatId, userId, options = {}) => {
    return apiCall('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      ...options
    })
  }, [apiCall])

  const unbanChatMember = useCallback(async (chatId, userId, options = {}) => {
    return apiCall('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      ...options
    })
  }, [apiCall])

  return {
    isLoading,
    error,
    sendMessage,
    sendPhoto,
    sendDocument,
    editMessage,
    deleteMessage,
    getChat,
    getChatMember,
    setWebhook,
    deleteWebhook,
    getWebhookInfo,
    getMe,
    getUpdates,
    answerCallbackQuery,
    sendChatAction,
    forwardMessage,
    copyMessage,
    pinChatMessage,
    unpinChatMessage,
    restrictChatMember,
    banChatMember,
    unbanChatMember,
    apiCall
  }
}