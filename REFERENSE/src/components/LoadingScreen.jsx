import React from 'react'
import { Users } from 'lucide-react'

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 bg-telegram-bg flex items-center justify-center z-50">
      <div className="text-center">
        <div className="relative mb-8">
          <div className="w-32 h-32 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center shadow-2xl animate-pulse">
            <Users className="w-16 h-16 text-white" />
          </div>
          <div className="absolute inset-0 w-32 h-32 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full opacity-30 animate-ping"></div>
        </div>
        
        <h1 className="text-2xl font-medium text-telegram-text mb-2">
          Inbox Desk
        </h1>
        <p className="text-telegram-secondary text-sm">
          Загрузка...
        </p>
        
        <div className="mt-8 flex justify-center">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-telegram-blue rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-telegram-blue rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-telegram-blue rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen