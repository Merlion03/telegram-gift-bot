'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Users, Search, ChevronDown, LogOut, Settings, User } from 'lucide-react';
import { WebSocketStatus } from './WebSocketStatus';

/**
 * Интерфейс для пропсов компонента Header
 */
interface HeaderProps {
  stats?: {
    total: number;
    new: number;
    active: number;
  };
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onUserMenuAction?: (action: string) => void;
  userName?: string;
  userAvatar?: string;
}

/**
 * Компонент Header - заголовок приложения с логотипом, поиском и меню пользователя
 */
export const Header: React.FC<HeaderProps> = ({
  stats = { total: 0, new: 0, active: 0 },
  searchQuery = '',
  onSearchChange,
  onUserMenuAction,
  userName = 'Администратор',
  userAvatar,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  const handleMenuAction = (action: string) => {
    setIsMenuOpen(false);
    onUserMenuAction?.(action);
  };

  return (
    <header className="bg-telegram-bg border-b border-telegram-border telegram-shadow-sm">
      <div className="px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Логотип и название */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 bg-telegram-blue rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div className="hidden sm:block min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-telegram-text truncate">
                Admin Support
              </h1>
              <p className="text-xs md:text-sm text-telegram-secondary truncate">
                Session Management
              </p>
            </div>
          </div>

          {/* Поле поиска */}
          <div className="flex-1 max-w-md hidden md:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-telegram-secondary" />
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="telegram-input w-full pl-10 pr-4"
              />
            </div>
          </div>

          {/* Статистика и WebSocket статус */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="text-center">
              <div className="text-sm font-semibold text-telegram-text">
                {stats.total}
              </div>
              <div className="text-xs text-telegram-secondary">Total</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-telegram-blue">
                {stats.new}
              </div>
              <div className="text-xs text-telegram-secondary">New</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-telegram-green">
                {stats.active}
              </div>
              <div className="text-xs text-telegram-secondary">Active</div>
            </div>
            
            {/* WebSocket статус для диагностики */}
            <div className="border-l border-telegram-border pl-4">
              <WebSocketStatus />
            </div>
          </div>

          {/* Меню пользователя */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-telegram-sidebar transition-telegram"
              aria-label="Menu"
              aria-expanded={isMenuOpen}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-telegram-blue flex items-center justify-center text-white text-sm font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <ChevronDown
                className={`w-4 h-4 text-telegram-secondary transition-transform ${
                  isMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Выпадающее меню */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-telegram-bg rounded-lg telegram-shadow-lg border border-telegram-border animate-menu-slide-in z-50">
                <div className="p-3 border-b border-telegram-border">
                  <p className="text-sm font-semibold text-telegram-text">
                    {userName}
                  </p>
                  <p className="text-xs text-telegram-secondary">
                    Administrator
                  </p>
                </div>

                <div className="py-2">
                  <button
                    onClick={() => handleMenuAction('profile')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-telegram-text hover:bg-telegram-sidebar transition-telegram"
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </button>
                  <button
                    onClick={() => handleMenuAction('settings')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-telegram-text hover:bg-telegram-sidebar transition-telegram"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                </div>

                <div className="border-t border-telegram-border p-2">
                  <button
                    onClick={() => handleMenuAction('logout')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-telegram-red hover:bg-telegram-sidebar transition-telegram"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Мобильная статистика */}
        <div className="lg:hidden mt-3 flex items-center justify-between gap-4 text-center">
          <div>
            <div className="text-sm font-semibold text-telegram-text">
              {stats.total}
            </div>
            <div className="text-xs text-telegram-secondary">Total</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-telegram-blue">
              {stats.new}
            </div>
            <div className="text-xs text-telegram-secondary">New</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-telegram-green">
              {stats.active}
            </div>
            <div className="text-xs text-telegram-secondary">Active</div>
          </div>
        </div>

        {/* Мобильное поле поиска */}
        <div className="md:hidden mt-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-telegram-secondary" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="telegram-input w-full pl-10 pr-4"
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
