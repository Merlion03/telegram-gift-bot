import React, { useState, useEffect } from 'react'
import { Users, Search, ChevronDown, Settings, LogOut, User, Bell, Smartphone, TestTube } from 'lucide-react'
import TelegramInfo from './TelegramInfo'
import TelegramTestPanel from './TelegramTestPanel'

const Header = ({ stats, searchQuery, onSearchChange }) => {
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showTelegramInfo, setShowTelegramInfo] = useState(false)
  const [showTelegramTest, setShowTelegramTest] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const handleMenuToggle = () => {
    if (showUserMenu) {
      // Закрытие меню
      setIsAnimating(true)
      setTimeout(() => {
        setShowUserMenu(false)
        setIsAnimating(false)
      }, 150)
    } else {
      // Открытие меню
      setShowUserMenu(true)
    }
  }

  return (
    <header className="bg-telegram-bg border-b border-telegram-border px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-telegram-blue rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base font-medium text-telegram-text">
            Inbox Desk
          </h1>
        </div>
        
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-secondary" />
            <input
              type="text"
              placeholder="Поиск по ID, username..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-telegram-chat border-0 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-telegram-blue text-telegram-text placeholder-telegram-secondary"
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Кнопка информации о Telegram */}
        <button
          onClick={() => setShowTelegramInfo(!showTelegramInfo)}
          className="p-2 hover:bg-telegram-sidebar rounded-lg transition-all duration-200 hover:scale-105"
          title="Информация о Telegram WebApp"
        >
          <Smartphone className="w-5 h-5 text-telegram-secondary" />
        </button>

        {/* Кнопка тестирования Telegram */}
        <button
          onClick={() => setShowTelegramTest(!showTelegramTest)}
          className="p-2 hover:bg-telegram-sidebar rounded-lg transition-all duration-200 hover:scale-105"
          title="Тестирование Telegram WebApp"
        >
          <TestTube className="w-5 h-5 text-telegram-secondary" />
        </button>
        
        <div className="relative">
          <button 
            onClick={handleMenuToggle}
            className="flex items-center gap-2 p-1 hover:bg-telegram-sidebar rounded-lg transition-all duration-200 hover:scale-105"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center text-white font-medium text-sm telegram-shadow">
              И
            </div>
            <ChevronDown className={`w-4 h-4 text-telegram-secondary transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>
          
          {(showUserMenu || isAnimating) && (
            <div className={`absolute right-0 top-full mt-2 w-64 bg-telegram-bg border border-telegram-border rounded-xl telegram-shadow-lg z-50 ${
              showUserMenu && !isAnimating ? 'menu-enter' : 'menu-exit'
            }`}>
              {/* User Info */}
              <div className="p-4 border-b border-telegram-border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center text-white font-medium">
                    И
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-telegram-text">Иван Операторов</h3>
                    <p className="text-xs text-telegram-secondary">@ivan_operator</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-2 h-2 bg-telegram-green rounded-full"></div>
                      <span className="text-xs text-telegram-green">Online</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Menu Items */}
              <div className="py-2">
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-telegram-sidebar transition-all duration-200 text-left menu-item-enter" style={{ animationDelay: '0.05s' }}>
                  <User className="w-4 h-4 text-telegram-secondary" />
                  <span className="text-sm text-telegram-text">Мой профиль</span>
                </button>
                
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-telegram-sidebar transition-all duration-200 text-left menu-item-enter" style={{ animationDelay: '0.1s' }}>
                  <Bell className="w-4 h-4 text-telegram-secondary" />
                  <span className="text-sm text-telegram-text">Уведомления</span>
                </button>
                
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-telegram-sidebar transition-all duration-200 text-left menu-item-enter" style={{ animationDelay: '0.15s' }}>
                  <Settings className="w-4 h-4 text-telegram-secondary" />
                  <span className="text-sm text-telegram-text">Настройки</span>
                </button>
                
                <div className="border-t border-telegram-border my-2"></div>
                
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-telegram-sidebar transition-all duration-200 text-left menu-item-enter" style={{ animationDelay: '0.2s' }}>
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-500">Выйти</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Overlay to close menu */}
      {(showUserMenu || isAnimating) && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={handleMenuToggle}
        />
      )}

      {/* Telegram Test Panel Modal */}
      {showTelegramTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-telegram-bg rounded-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-telegram-bg border-b border-telegram-border p-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-telegram-text">Тестирование Telegram WebApp</h2>
              <button
                onClick={() => setShowTelegramTest(false)}
                className="p-2 hover:bg-telegram-sidebar rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5 text-telegram-secondary" />
              </button>
            </div>
            <TelegramTestPanel />
          </div>
        </div>
      )}

      {/* Telegram Info Modal */}
      {showTelegramInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-telegram-bg rounded-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-telegram-bg border-b border-telegram-border p-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-telegram-text">Telegram WebApp</h2>
              <button
                onClick={() => setShowTelegramInfo(false)}
                className="p-2 hover:bg-telegram-sidebar rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5 text-telegram-secondary" />
              </button>
            </div>
            <div className="p-4">
              <TelegramInfo />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export default Header