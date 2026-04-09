/**
 * Страница админки службы поддержки
 * Интегрирует Header, Sidebar, ChatWindow и UserPanel для управления сессиями поддержки
 * Requirements: 6.1, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTelegramUserId, isTelegramWebApp, initTelegramWebApp } from '@/lib/utils/telegramWebApp';
import { Header } from '@/components/admin/Header';
import { Sidebar } from '@/components/admin/Sidebar';
import { ChatWindow } from '@/components/admin/ChatWindow';
import { UserPanel } from '@/components/admin/UserPanel';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import type { SupportSession } from '@/types/support';

/**
 * Главная страница админки с интегрированными компонентами
 * Requirements: 6.1, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */
export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SupportSession | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserPanel, setShowUserPanel] = useState(true);

  /**
   * Проверка аутентификации при загрузке страницы
   */
  useEffect(() => {
    checkAuth();
  }, []);

  /**
   * Запуск админки в полноэкранном режиме
   */
  useEffect(() => {
    // Ждём инициализации Telegram WebApp
    const initFullscreen = async () => {
      // Ждём загрузки Telegram WebApp SDK
      let attempts = 0;
      const maxAttempts = 30;
      
      while (!window.Telegram?.WebApp && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      const WebApp = window.Telegram?.WebApp;
      
      if (WebApp) {
        // Устанавливаем цвет заголовка для полноэкранного режима
        // Используем setBackgroundColor вместо setHeaderColor
        if (typeof (WebApp as any).setBackgroundColor === 'function') {
          try {
            (WebApp as any).setBackgroundColor('secondary_bg_color');
          } catch (error) {
            console.warn('Ошибка установки цвета фона:', error);
          }
        }
        
        // Запрашиваем полноэкранный режим
        if (typeof (WebApp as any).requestFullscreen === 'function') {
          try {
            (WebApp as any).requestFullscreen();
            console.log('Полноэкранный режим активирован');
          } catch (error) {
            console.error('Ошибка активации полноэкранного режима:', error);
          }
        } else {
          console.warn('requestFullscreen не поддерживается в этой версии Telegram');
        }

        // Разворачиваем WebApp на весь экран
        if (WebApp.expand) {
          WebApp.expand();
        }

        // Включаем вертикальные свайпы для закрытия
        if (typeof (WebApp as any).enableVerticalSwipes === 'function') {
          (WebApp as any).enableVerticalSwipes();
        }
        
        // Добавляем обработчик для кнопки "Назад" для выхода из полноэкранного режима
        const backButton = (WebApp as any).BackButton;
        if (backButton) {
          backButton.onClick(() => {
            if (typeof (WebApp as any).exitFullscreen === 'function') {
              try {
                (WebApp as any).exitFullscreen();
                console.log('Выход из полноэкранного режима');
              } catch (error) {
                console.error('Ошибка выхода из полноэкранного режима:', error);
              }
            }
          });
          
          // Показываем кнопку "Назад"
          backButton.show();
        }
      }
    };

    initFullscreen();
    
    // Cleanup при размонтировании
    return () => {
      const WebApp = window.Telegram?.WebApp;
      const backButton = (WebApp as any)?.BackButton;
      if (backButton) {
        backButton.hide();
      }
    };
  }, []);

  /**
   * Проверяет аутентификацию и Telegram WebApp контекст
   */
  const checkAuth = async () => {
    // Ждём загрузки Telegram WebApp SDK (максимум 3 секунды)
    let attempts = 0;
    const maxAttempts = 30; // 30 попыток по 100ms = 3 секунды
    
    while (!isTelegramWebApp() && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Инициализируем Telegram WebApp API
    initTelegramWebApp();

    // Проверяем, что приложение открыто в Telegram
    if (!isTelegramWebApp()) {
      setError('Доступ разрешён только через Telegram WebApp');
      setIsAuthenticated(false);
      return;
    }

    // Логируем данные для диагностики
    console.log('Telegram WebApp initDataUnsafe:', window.Telegram?.WebApp?.initDataUnsafe);
    console.log('Telegram WebApp initData:', window.Telegram?.WebApp?.initData);

    // Извлекаем tg_id из Telegram WebApp контекста
    const tgId = getTelegramUserId();
    
    if (!tgId) {
      setError('Не удалось получить Telegram User ID');
      setIsAuthenticated(false);
      return;
    }

    // Проверяем наличие JWT токена в cookie
    const hasToken = document.cookie.split('; ').some(cookie => cookie.startsWith('admin-token='));
    
    if (!hasToken) {
      // Нет токена - редиректим на логин
      console.log('Токен не найден, редирект на /login');
      setIsAuthenticated(false);
      router.replace('/login?callbackUrl=/admin');
      return;
    }
    
    // Токен есть - проверяем его валидность через API
    try {
      const response = await fetch('/api/admin/check-auth', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setUserRole(data.role); // Сохраняем роль пользователя
      } else {
        // Токен невалиден - редирект на логин
        console.log('Токен невалиден, редирект на /login');
        setIsAuthenticated(false);
        router.replace('/login?callbackUrl=/admin');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setError('Ошибка проверки аутентификации');
      setIsAuthenticated(false);
    }
  };

  /**
   * Обработчик выбора сессии
   */
  const handleSelectSession = (session: SupportSession) => {
    setSelectedSession(session);
  };

  /**
   * Обработчик изменения поиска в Header
   */
  const handleHeaderSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  /**
   * Обработчик действий меню пользователя
   */
  const handleUserMenuAction = (action: string) => {
    console.log('Действие меню:', action);
    
    if (action === 'logout') {
      // Удаляем токен и редиректим на логин
      document.cookie = 'admin-token=; path=/; max-age=0';
      router.push('/login');
    }
  };

  /**
   * Обработчик добавления заметки
   */
  const handleAddNote = async (note: string) => {
    console.log('Добавление заметки:', note);
    // Здесь можно добавить логику для сохранения заметки на сервер
  };

  /**
   * Обработчик переключения уведомлений
   */
  const handleToggleNotifications = (enabled: boolean) => {
    console.log('Уведомления:', enabled ? 'включены' : 'отключены');
    // Здесь можно добавить логику для сохранения настроек
  };

  /**
   * Обработчик открытия профиля в Telegram
   */
  const handleOpenTelegramProfile = () => {
    if (selectedSession?.telegram_id) {
      window.open(`https://t.me/${selectedSession.telegram_id}`, '_blank');
    }
  };

  /**
   * Получить статистику сессий
   */
  const stats = useMemo(() => {
    // Здесь должна быть логика получения статистики из реальных данных
    return {
      total: 42,
      new: 5,
      active: 12,
    };
  }, []);

  /**
   * Получить информацию о пользователе для UserPanel
   */
  const userInfo = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    return {
      telegramId: selectedSession.telegram_id,
      username: selectedSession.user_username,
      name: selectedSession.user_name || `User ${selectedSession.telegram_id}`,
      avatar: selectedSession.user_avatar,
      online: selectedSession.user_online ?? false,
      lastSeen: selectedSession.last_message_at,
      firstContact: selectedSession.created_at,
      totalMessages: 0,
      email: undefined,
      phone: undefined,
      notes: [],
      preferences: {
        notifications: true,
        language: 'ru',
        timezone: 'UTC',
      },
    };
  }, [selectedSession]);

  // Показываем загрузку пока проверяем аутентификацию
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
        <div style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>Проверка доступа...</div>
      </div>
    );
  }

  // Если не аутентифицирован, показываем загрузку (редирект в процессе)
  if (isAuthenticated === false) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
        <div style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>Перенаправление...</div>
      </div>
    );
  }

  // Показываем ошибку если есть
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
        <div className="max-w-md w-full rounded-lg shadow-md p-8" style={{ backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))' }}>
          <div className="px-4 py-3 rounded" style={{ 
            backgroundColor: '#ff3b3020',
            border: '1px solid #ff3b30',
            color: '#ff3b30',
          }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
        {/* Заголовок приложения */}
        <ErrorBoundary
          fallback={
            <div className="px-4 py-3" style={{ 
              backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
              borderBottom: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
            }}>
              <h1 className="text-lg font-medium" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                Админка поддержки
              </h1>
            </div>
          }
        >
          <Header
            stats={stats}
            searchQuery={searchQuery}
            onSearchChange={handleHeaderSearchChange}
            onUserMenuAction={handleUserMenuAction}
            userName="Администратор"
          />
        </ErrorBoundary>

        {/* Основная область с боковой панелью, чатом и панелью пользователя */}
        <div className="flex flex-1 overflow-hidden">
          {/* Боковая панель со списком сессий */}
          <ErrorBoundary
            fallback={
              <div className="w-80 p-4 text-center" style={{ 
                backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
                borderRight: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
                color: 'var(--tg-theme-destructive-text-color, #ff3b30)',
              }}>
                <p className="text-sm">Ошибка загрузки списка сессий</p>
              </div>
            }
          >
            <Sidebar
              onSelectSession={handleSelectSession}
              selectedSessionId={selectedSession?.id}
            />
          </ErrorBoundary>

          {/* Основная область с чатом */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {selectedSession ? (
              <ErrorBoundary
                fallback={
                  <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
                    <div className="text-center" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
                      <p className="text-lg font-medium">Ошибка загрузки чата</p>
                      <p className="text-sm mt-2">Попробуйте выбрать другую сессию</p>
                    </div>
                  </div>
                }
              >
                <ChatWindow session={selectedSession} userRole={userRole} />
              </ErrorBoundary>
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12"
                    style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                    Выберите сессию
                  </h3>
                  <p className="mt-2 text-sm" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                    Выберите сессию из списка слева, чтобы начать переписку
                  </p>
                </div>
              </div>
            )}
          </main>

          {/* Панель информации о пользователе (скрыта на мобильных) */}
          {showUserPanel && userInfo && (
            <ErrorBoundary
              fallback={
                <div className="hidden md:flex w-80 p-4 text-center" style={{ 
                  backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
                  borderLeft: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
                  color: 'var(--tg-theme-destructive-text-color, #ff3b30)',
                }}>
                  <p className="text-sm">Ошибка загрузки информации о пользователе</p>
                </div>
              }
            >
              <div className="hidden md:flex">
                <UserPanel
                  user={userInfo}
                  onAddNote={handleAddNote}
                  onToggleNotifications={handleToggleNotifications}
                  onOpenTelegramProfile={handleOpenTelegramProfile}
                  onClose={() => setShowUserPanel(false)}
                />
              </div>
            </ErrorBoundary>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
