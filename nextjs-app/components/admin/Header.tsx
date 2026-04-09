'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Users, Search, ChevronDown, LogOut, Settings, User, Maximize, Minimize } from 'lucide-react';
import { WebSocketStatus } from './WebSocketStatus';
import { useRouter } from 'next/navigation';

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
  userRole?: number; // Роль администратора (0-3)
}

/**
 * Получает название роли администратора на русском языке
 * 
 * @param role - Уровень роли (0-3)
 * @returns Название роли
 */
const getRoleName = (role?: number): string => {
  switch (role) {
    case 0:
      return 'Разработчик';
    case 1:
      return 'Помощник';
    case 2:
      return 'Администратор';
    case 3:
      return 'Оператор';
    default:
      return 'Администратор';
  }
};

/**
 * Компонент Header - заголовок приложения с логотипом, поиском и меню пользователя
 * 
 * Отображает роль администратора и обрабатывает выход из системы.
 */
export const Header: React.FC<HeaderProps> = ({
  stats = { total: 0, new: 0, active: 0 },
  searchQuery = '',
  onSearchChange,
  onUserMenuAction,
  userName = 'Администратор',
  userAvatar,
  userRole,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Проверяем текущий режим при монтировании
  useEffect(() => {
    const checkFullscreenStatus = () => {
      const WebApp = window.Telegram?.WebApp;
      if (WebApp && typeof (WebApp as any).isFullscreen !== 'undefined') {
        setIsFullscreen((WebApp as any).isFullscreen);
      }
    };
    
    checkFullscreenStatus();
    
    // Проверяем статус каждую секунду
    const interval = setInterval(checkFullscreenStatus, 1000);
    
    return () => clearInterval(interval);
  }, []);

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
    
    // Обработка выхода из системы
    if (action === 'logout') {
      // Очищаем JWT cookie
      document.cookie = 'admin-token=; path=/; max-age=0; SameSite=Strict';
      
      // Редирект на страницу входа
      router.push('/login');
      router.refresh();
      return;
    }
    
    // Остальные действия передаём родительскому компоненту
    onUserMenuAction?.(action);
  };
  
  // Переключение полноэкранного режима
  const toggleFullscreen = () => {
    const WebApp = window.Telegram?.WebApp;
    
    if (!WebApp) {
      console.warn('Telegram WebApp недоступен');
      return;
    }
    
    if (isFullscreen) {
      // Выход из полноэкранного режима
      if (typeof (WebApp as any).exitFullscreen === 'function') {
        try {
          (WebApp as any).exitFullscreen();
          setIsFullscreen(false);
          console.log('Выход из полноэкранного режима');
        } catch (error) {
          console.error('Ошибка выхода из полноэкранного режима:', error);
        }
      }
    } else {
      // Вход в полноэкранный режим
      if (typeof (WebApp as any).requestFullscreen === 'function') {
        try {
          (WebApp as any).requestFullscreen();
          setIsFullscreen(true);
          console.log('Вход в полноэкранный режим');
        } catch (error) {
          console.error('Ошибка входа в полноэкранный режим:', error);
        }
      } else {
        console.warn('requestFullscreen не поддерживается');
      }
    }
  };

  return (
    <header style={{ 
      backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
      borderBottom: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
    }}>
      <style jsx>{`
        .tg-input {
          background-color: var(--tg-theme-secondary-bg-color, #efeff4);
          color: var(--tg-theme-text-color, #000000);
          border: none;
          border-radius: 10px;
          padding: 8px 12px;
          transition: background-color 0.2s ease;
        }
        
        .tg-input:focus {
          outline: none;
          background-color: var(--tg-theme-section-separator-color, #c8c7cc);
        }
        
        .tg-input::placeholder {
          color: var(--tg-theme-hint-color, #8e8e93);
        }
      `}</style>
      
      <div className="px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Логотип и название */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center" style={{
              backgroundColor: 'var(--tg-theme-button-color, #3390ec)',
            }}>
              <Users className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div className="hidden sm:block min-w-0">
              <h1 className="text-lg md:text-xl font-bold truncate" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                Admin Support
              </h1>
              <p className="text-xs md:text-sm truncate" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                Session Management
              </p>
            </div>
          </div>

          {/* Поле поиска */}
          <div className="flex-1 max-w-md hidden md:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }} />
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="tg-input w-full pl-10 pr-4"
              />
            </div>
          </div>

          {/* Статистика и WebSocket статус */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                {stats.total}
              </div>
              <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>Total</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: 'var(--tg-theme-link-color, #3390ec)' }}>
                {stats.new}
              </div>
              <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>New</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: '#34c759' }}>
                {stats.active}
              </div>
              <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>Active</div>
            </div>
            
            {/* WebSocket статус для диагностики */}
            <div style={{ 
              borderLeft: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
              paddingLeft: '1rem',
            }}>
              <WebSocketStatus />
            </div>
            
            {/* Кнопка переключения полноэкранного режима */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg transition-all duration-200"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" style={{ color: 'var(--tg-theme-link-color, #3390ec)' }} />
              ) : (
                <Maximize className="w-5 h-5" style={{ color: 'var(--tg-theme-link-color, #3390ec)' }} />
              )}
            </button>
          </div>

          {/* Меню пользователя */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: isMenuOpen ? 'var(--tg-theme-secondary-bg-color, #efeff4)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
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
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{
                  backgroundColor: 'var(--tg-theme-button-color, #3390ec)',
                }}>
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  isMenuOpen ? 'rotate-180' : ''
                }`}
                style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
              />
            </button>

            {/* Выпадающее меню */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg border z-50" style={{
                backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
                borderColor: 'var(--tg-theme-section-separator-color, #c8c7cc)',
              }}>
                <div className="p-3" style={{ 
                  borderBottom: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
                }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                    {userName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                    {getRoleName(userRole)}
                  </p>
                </div>

                <div className="py-2">
                  <button
                    onClick={() => handleMenuAction('profile')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-all duration-200"
                    style={{ color: 'var(--tg-theme-text-color, #000000)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </button>
                  <button
                    onClick={() => handleMenuAction('settings')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-all duration-200"
                    style={{ color: 'var(--tg-theme-text-color, #000000)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                </div>

                <div style={{ 
                  borderTop: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
                  padding: '0.5rem',
                }}>
                  <button
                    onClick={() => handleMenuAction('logout')}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm transition-all duration-200"
                    style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
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
            <div className="text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
              {stats.total}
            </div>
            <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>Total</div>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--tg-theme-link-color, #3390ec)' }}>
              {stats.new}
            </div>
            <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>New</div>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: '#34c759' }}>
              {stats.active}
            </div>
            <div className="text-xs" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>Active</div>
          </div>
        </div>

        {/* Мобильное поле поиска */}
        <div className="md:hidden mt-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="tg-input w-full pl-10 pr-4"
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
