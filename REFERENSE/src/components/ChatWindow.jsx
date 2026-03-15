import React, { useState } from 'react'
import { Send, Paperclip, Smile, FileText, X, Copy, Share } from 'lucide-react'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const ChatWindow = ({ dialog, messages }) => {
  const [messageText, setMessageText] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  
  const { 
    hapticFeedback, 
    showAlert, 
    showConfirm, 
    sendData, 
    readTextFromClipboard,
    isReady: tgReady 
  } = useTelegramWebApp()

  const templates = [
    'Здравствуйте! Чем могу помочь?',
    'Спасибо за обращение! Уточните, пожалуйста...',
    'Ваш вопрос передан специалисту',
    'Проблема решена. Обращайтесь!'
  ]

  const handleSend = () => {
    if (messageText.trim()) {
      console.log('Отправка:', messageText)
      
      // Тактильная обратная связь
      hapticFeedback('impact', 'medium')
      
      // Отправляем данные в Telegram
      if (tgReady) {
        sendData({
          action: 'message_sent',
          dialog_id: dialog.id,
          message: messageText,
          timestamp: Date.now()
        })
      }
      
      setMessageText('')
      showAlert('Сообщение отправлено!')
    }
  }

  const handlePasteFromClipboard = () => {
    readTextFromClipboard((text) => {
      if (text) {
        setMessageText(prev => prev + text)
        hapticFeedback('selection')
      }
    })
  }

  const handleCopyMessage = (messageText) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(messageText).then(() => {
        showAlert('Сообщение скопировано')
        hapticFeedback('notification', 'success')
      })
    }
  }

  const handleShareMessage = (messageText) => {
    if (tgReady) {
      sendData({
        action: 'share_message',
        message: messageText,
        dialog_id: dialog.id,
        timestamp: Date.now()
      })
      showAlert('Сообщение подготовлено для отправки')
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-telegram-chat">
      <div className="bg-telegram-bg border-b border-telegram-border px-4 py-3 sticky top-0 z-10 telegram-shadow backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center text-white font-medium text-sm telegram-shadow">
                {dialog.avatar}
              </div>
              {dialog.online && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-telegram-green border-2 border-telegram-bg rounded-full animate-pulse"></div>
              )}
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium text-telegram-text">
                  {dialog.name}
                </h2>
                <span className="text-sm text-telegram-secondary">
                  {dialog.username}
                </span>
                {dialog.priority && (
                  <span className="px-2 py-0.5 bg-telegram-red/20 text-telegram-red text-xs font-medium rounded">
                    VIP
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm text-telegram-secondary">
                  {dialog.online ? 'онлайн' : 'был недавно'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex justify-center">
            <span className="text-xs text-telegram-secondary bg-telegram-sidebar px-3 py-1 rounded-full">
              Сегодня
            </span>
          </div>
          
          {messages.map(message => {
            if (message.type === 'system') {
              return (
                <div key={message.id} className="flex justify-center">
                  <span className="text-xs text-telegram-secondary bg-telegram-sidebar px-3 py-1 rounded-full">
                    {message.text}
                  </span>
                </div>
              )
            }
            
            if (message.type === 'note') {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2 max-w-2xl">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-telegram-text">
                          {message.text}
                        </p>
                        <p className="text-xs text-telegram-secondary mt-1">
                          Внутренняя заметка • {message.author} • {message.time}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
            
            const isOutgoing = message.type === 'outgoing'
            
            return (
              <div key={message.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-md ${isOutgoing ? 'order-2 message-outgoing' : 'order-1 message-incoming'} group`}>
                  <div className={`rounded-2xl px-4 py-2.5 telegram-shadow transition-all duration-200 hover:scale-[1.02] ${
                    isOutgoing
                      ? 'bg-telegram-blue text-white'
                      : 'bg-telegram-bg text-telegram-text'
                  }`}>
                    {message.template && (
                      <div className="flex items-center gap-1 mb-1 opacity-75">
                        <FileText className="w-3 h-3" />
                        <span className="text-xs">Шаблон</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    
                    {/* Кнопки действий для сообщений */}
                    <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopyMessage(message.text)}
                        className="p-1 rounded hover:bg-black/10 transition-colors"
                        title="Копировать"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleShareMessage(message.text)}
                        className="p-1 rounded hover:bg-black/10 transition-colors"
                        title="Поделиться"
                      >
                        <Share className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 mt-1 px-1 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-telegram-secondary">
                      {message.time}
                    </span>
                    {isOutgoing && message.operatorName && (
                      <>
                        <span className="text-telegram-border">•</span>
                        <span className="text-xs text-telegram-secondary">
                          {message.operatorName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="bg-telegram-bg border-t border-telegram-border px-4 py-3 telegram-shadow backdrop-blur-sm">
        <div className="max-w-4xl mx-auto">
          {showTemplates && (
            <div className="mb-3 p-3 bg-telegram-sidebar rounded-xl telegram-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-telegram-text">
                  Быстрые ответы
                </span>
                <button 
                  onClick={() => setShowTemplates(false)}
                  className="text-telegram-secondary hover:text-telegram-text transition-all duration-200 hover:scale-110"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {templates.map((template, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setMessageText(template)
                      setShowTemplates(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-telegram-secondary hover:bg-telegram-chat rounded-lg transition-all duration-200 hover:scale-[1.02] hover:text-telegram-text"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-3">
            <div className="flex gap-2">
              <button 
                onClick={handlePasteFromClipboard}
                className="p-2 hover:bg-telegram-sidebar rounded-lg transition-all duration-200 hover:scale-110"
                title="Вставить из буфера"
              >
                <Paperclip className="w-5 h-5 text-telegram-secondary" />
              </button>
              <button 
                onClick={() => setShowTemplates(!showTemplates)}
                className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                  showTemplates 
                    ? 'bg-telegram-blue text-white shadow-lg shadow-telegram-blue/25' 
                    : 'hover:bg-telegram-sidebar text-telegram-secondary'
                }`}
                title="Быстрые ответы"
              >
                <FileText className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 relative">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Введите сообщение..."
                rows="1"
                className="telegram-input w-full px-4 py-3 rounded-xl text-sm resize-none telegram-shadow"
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
            </div>
            
            <button className="p-2 hover:bg-telegram-sidebar rounded-lg transition-all duration-200 hover:scale-110">
              <Smile className="w-5 h-5 text-telegram-secondary" />
            </button>
            
            <button 
              onClick={handleSend}
              disabled={!messageText.trim()}
              className="telegram-button px-4 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 mt-2 px-1">
            <button className="text-xs text-telegram-secondary hover:text-telegram-blue transition-all duration-200 hover:scale-105">
              + Внутренняя заметка
            </button>
            <span className="text-xs text-telegram-secondary/70">
              Enter — отправить, Shift+Enter — новая строка
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatWindow