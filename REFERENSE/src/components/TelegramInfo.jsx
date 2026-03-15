import React from 'react'
import { Smartphone, Monitor, Palette, Info } from 'lucide-react'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const TelegramInfo = () => {
  const { 
    user, 
    platform, 
    version, 
    colorScheme, 
    themeParams, 
    viewportHeight,
    isReady 
  } = useTelegramWebApp()

  if (!isReady) {
    return (
      <div className="p-4 bg-telegram-sidebar rounded-lg">
        <p className="text-sm text-telegram-secondary">Загрузка Telegram WebApp...</p>
      </div>
    )
  }

  return (
    <div className="p-4 bg-telegram-sidebar rounded-lg space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-5 h-5 text-telegram-blue" />
        <h3 className="text-lg font-medium text-telegram-text">Telegram WebApp Info</h3>
      </div>

      {/* Информация о пользователе */}
      {user && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-telegram-text">Пользователь:</h4>
          <div className="pl-4 space-y-1 text-sm text-telegram-secondary">
            <p>ID: {user.id}</p>
            <p>Имя: {user.first_name} {user.last_name}</p>
            {user.username && <p>Username: @{user.username}</p>}
            <p>Язык: {user.language_code}</p>
            {user.is_premium && <p className="text-telegram-blue">Premium пользователь</p>}
          </div>
        </div>
      )}

      {/* Информация о платформе */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-telegram-text flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          Платформа:
        </h4>
        <div className="pl-6 space-y-1 text-sm text-telegram-secondary">
          <p>Тип: {platform}</p>
          <p>Версия: {version}</p>
          <p>Цветовая схема: {colorScheme}</p>
          <p>Высота экрана: {viewportHeight}px</p>
        </div>
      </div>

      {/* Параметры темы */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-telegram-text flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Тема:
        </h4>
        <div className="pl-6 space-y-1 text-sm text-telegram-secondary">
          {Object.entries(themeParams).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="capitalize">{key.replace('_', ' ')}:</span>
              <div 
                className="w-4 h-4 rounded border border-telegram-border"
                style={{ backgroundColor: value }}
                title={value}
              />
              <span className="font-mono text-xs">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Статус интеграции */}
      <div className="pt-3 border-t border-telegram-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-telegram-text">
            Telegram WebApp активен
          </span>
        </div>
      </div>
    </div>
  )
}

export default TelegramInfo