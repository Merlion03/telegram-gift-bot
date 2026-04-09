/**
 * SessionList - компонент списка всех сессий (chat и support)
 * Отображает список сессий с автообновлением каждые 10 секунд
 * Показывает количество непрочитанных сообщений для каждой сессии
 * Поддерживает фильтрацию по типу сессии и статусу
 * Использует telegram-дизайн с градиентными аватарами и современными индикаторами
 * Оптимизирован для производительности с использованием React.memo и useCallback
 * Requirements: 2.1, 2.5, 2.6, 3.1, 3.2, 3.3, 3.5, 5.3, 10.1, 10.2, 10.3
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { getRealtimeClient } from '@/lib/database/realtimeClient';
import {
  createTelegramGradient,
  generateAvatarLetter,
  truncateText,
} from '@/lib/telegram-utils';
import { SessionFilters } from './SessionFilters';
import type { SupportSession, SupportSessionStatus, SessionType } from '@/types/support';

interface SessionListProps {
  onSelectSession: (session: SupportSession) => void;
  selectedSessionId?: number;
}

interface SessionFilterState {
  status: SupportSessionStatus | 'all';
  type: SessionType | 'all';
  search: string;
}

/**
 * Компонент списка сессий поддержки с фильтрацией и telegram-дизайном
 * Requirements: 2.1, 2.5, 2.6, 3.1, 3.2, 3.3, 3.5, 5.3, 7.4, 9.5, 10.1, 10.2, 10.3
 */
export function SessionList({ onSelectSession, selectedSessionId }: SessionListProps) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Фильтры
  const [filters, setFilters] = useState<SessionFilterState>({
    status: 'active',
    type: 'all',
    search: '',
  });

  // Настройки обновления
  const UPDATE_INTERVAL = 5000; // 5 секунд для активных сессий
  const IDLE_UPDATE_INTERVAL = 30000; // 30 секунд для неактивных

  /**
   * Загружает список сессий с сервера с учётом фильтров
   * Поддерживает инкрементальное обновление для оптимизации
   * Requirements: 2.1, 2.4, 2.7, 3.1, 5.3, 7.5, 10.2
   */
  const loadSessions = useCallback(async (isUpdate: boolean = false) => {
    try {
      // Формируем query параметры
      const params = new URLSearchParams();
      
      if (filters.status !== 'all') {
        params.append('status', filters.status);
      }
      
      if (filters.type !== 'all') {
        params.append('session_type', filters.type);
      }
      
      if (filters.search) {
        params.append('search', filters.search);
      }
      
      const response = await fetch(`/api/support/sessions?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const newSessions = data.sessions || [];
      
      if (isUpdate) {
        // Инкрементальное обновление: обновляем только изменившиеся сессии
        // Requirements: 7.5, 10.2
        setSessions(prevSessions => {
          if (prevSessions.length === 0) {
            return newSessions;
          }
          
          const updatedSessions = [...prevSessions];
          const sessionMap = new Map(prevSessions.map(s => [s.id, s]));
          
          newSessions.forEach((newSession: SupportSession) => {
            const existingSession = sessionMap.get(newSession.id);
            
            if (!existingSession) {
              // Новая сессия - добавляем в начало
              updatedSessions.unshift(newSession);
            } else {
              // Проверяем, изменилась ли сессия
              const hasChanged = 
                existingSession.status !== newSession.status ||
                existingSession.session_type !== newSession.session_type ||
                existingSession.last_message_at !== newSession.last_message_at ||
                existingSession.unread_count !== newSession.unread_count;
              
              if (hasChanged) {
                // Обновляем существующую сессию
                const index = updatedSessions.findIndex(s => s.id === newSession.id);
                if (index !== -1) {
                  updatedSessions[index] = newSession;
                }
              }
            }
          });
          
          // Удаляем сессии, которых больше нет в новом списке
          const newSessionIds = new Set(newSessions.map((s: SupportSession) => s.id));
          return updatedSessions.filter(s => newSessionIds.has(s.id));
        });
      } else {
        // Полная загрузка
        setSessions(newSessions);
      }
      
      setError(null);
    } catch (err) {
      console.error('Ошибка загрузки сессий:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сессии');
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.type, filters.search]);

  // Загрузка сессий при монтировании и умное автообновление
  useEffect(() => {
    loadSessions(false);

    // Адаптивное автообновление: чаще для активных сессий, реже для закрытых
    const interval = filters.status === 'active' ? UPDATE_INTERVAL : IDLE_UPDATE_INTERVAL;
    const updateInterval = setInterval(() => loadSessions(true), interval);
    
    return () => clearInterval(updateInterval);
  }, [filters.status, filters.type, loadSessions]);

  // Подписка на real-time обновления статусов сессий и новых сообщений через WebSocket
  useEffect(() => {
    let unsubscribeStatus: (() => void) | null = null;
    let unsubscribeMessages: (() => void) | null = null;

    // Асинхронная инициализация подписки
    const initSubscription = async () => {
      const client = getRealtimeClient();

      try {
        // Подключаемся к WebSocket
        await client.connect();
        
        // Подписываемся на канал status (изменения статусов сессий)
        unsubscribeStatus = client.subscribeToSessionStatusChanges(
          (sessionId: number, status: string) => {
            console.log(`[SessionList] Изменение статуса сессии ${sessionId}: ${status}`);
            
            // Обновляем статус сессии в локальном состоянии
            setSessions((prevSessions) => {
              // Если сессия закрыта, удаляем её из списка активных
              if (status === 'closed') {
                return prevSessions.filter((s) => s.id !== sessionId);
              }

              // Обновляем статус существующей сессии
              return prevSessions.map((s) =>
                s.id === sessionId ? { ...s, status: status as SupportSessionStatus } : s
              );
            });
          },
          (error: Error) => {
            console.error('[SessionList] Ошибка WebSocket подписки на статусы:', error);
          }
        );
        
        // Подписываемся на канал all (новые сообщения во всех сессиях)
        // Это позволит обновлять список сессий при получении новых сообщений
        const allMessagesSubscriptionId = client.subscribe({
          channel: 'all',
          onMessage: (message: any) => {
            console.log('[SessionList] Получено уведомление о новом сообщении:', message);
            
            // Перезагружаем список сессий для обновления счётчиков и последних сообщений
            loadSessions(true);
          },
          onError: (error: Error) => {
            console.error('[SessionList] Ошибка WebSocket подписки на сообщения:', error);
          }
        });
        
        unsubscribeMessages = () => {
          client.unsubscribe(allMessagesSubscriptionId);
        };
        
        console.log('[SessionList] Подписки на изменения статусов и новые сообщения созданы');
      } catch (error) {
        console.error('[SessionList] Ошибка подключения к WebSocket:', error);
      }
    };

    initSubscription();

    // Отписываемся при размонтировании
    return () => {
      if (unsubscribeStatus) {
        unsubscribeStatus();
        console.log('[SessionList] Отписка от изменений статусов');
      }
      if (unsubscribeMessages) {
        unsubscribeMessages();
        console.log('[SessionList] Отписка от новых сообщений');
      }
    };
  }, [loadSessions]);

  /**
   * Форматирует дату в читаемый формат
   * Requirements: 10.2
   */
  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  /**
   * Возвращает иконку и цвет для типа сессии
   * Requirements: 2.1, 2.5, 2.6, 3.2, 3.3, 10.2
   */
  const getSessionTypeDisplay = useCallback((sessionType: SessionType) => {
    if (sessionType === 'support') {
      return {
        icon: '👤',
        label: 'Поддержка',
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-800',
        borderColor: 'border-purple-300',
      };
    }
    return {
      icon: '💬',
      label: 'Диалог',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300',
    };
  }, []);

  /**
   * Возвращает индикатор статуса сессии
   * Requirements: 2.1, 2.5, 2.6, 10.2
   */
  const getStatusIndicator = useCallback((status: SupportSessionStatus) => {
    switch (status) {
      case 'active':
        return {
          color: 'bg-telegram-green',
          label: 'Активная',
          className: 'telegram-status-online',
        };
      case 'closed':
        return {
          color: 'bg-telegram-secondary',
          label: 'Закрыта',
          className: 'telegram-status-offline',
        };
      default:
        return {
          color: 'bg-telegram-secondary',
          label: status,
          className: 'telegram-status-offline',
        };
    }
  }, []);

  /**
   * Фильтрует сессии по поисковому запросу
   * Requirements: 2.4, 2.7, 10.2
   */
  const filterSessionsBySearch = useCallback((sessions: SupportSession[]): SupportSession[] => {
    if (!filters.search.trim()) return sessions;
    
    const query = filters.search.toLowerCase();
    return sessions.filter(session => {
      const telegramId = session.telegram_id.toString();
      const userName = session.user_name?.toLowerCase() || '';
      const userUsername = session.user_username?.toLowerCase() || '';
      const lastMessage = session.last_message?.toLowerCase() || '';
      
      return (
        telegramId.includes(query) ||
        userName.includes(query) ||
        userUsername.includes(query) ||
        lastMessage.includes(query)
      );
    });
  }, [filters.search]);

  /**
   * Форматирует время последнего сообщения в относительный формат
   * Requirements: 2.1, 2.5, 10.2
   */
  const formatLastMessageTime = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} дн назад`;
    
    return formatDate(dateString);
  }, [formatDate]);

  // Состояние загрузки
  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-pulse">Загрузка сессий...</div>
      </div>
    );
  }

  // Состояние ошибки
  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">Ошибка: {error}</p>
          <button
            onClick={() => loadSessions(false)}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // Фильтруем сессии по поиску
  const filteredSessions = filterSessionsBySearch(sessions);

  // Пустой список
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
        <style jsx>{`
          .tg-section {
            background-color: var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff));
            border-radius: 12px;
            overflow: hidden;
          }
        `}</style>
        
        {/* Заголовок и поиск */}
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
            Сессии
          </h2>
          
          {/* Фильтры */}
          <SessionFilters
            statusFilter={filters.status}
            typeFilter={filters.type}
            searchQuery={filters.search}
            onStatusChange={(status) => setFilters({ ...filters, status })}
            onTypeChange={(type) => setFilters({ ...filters, type })}
            onSearchChange={(search) => setFilters({ ...filters, search })}
          />
        </div>

        <div className="flex-1 flex items-center justify-center px-4">
          <div className="tg-section w-full">
            <div className="p-8 text-center">
              <p className="text-base" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                Нет сессий
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                {filters.status === 'active' && filters.type === 'all' 
                  ? 'Сессии появятся здесь, когда пользователи обратятся в поддержку'
                  : 'Попробуйте изменить фильтры'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Список сессий
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
      <style jsx>{`
        .tg-section {
          background-color: var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff));
          border-radius: 12px;
          overflow: hidden;
        }
        
        .tg-separator {
          height: 1px;
          background-color: var(--tg-theme-section-separator-color, #c8c7cc);
        }
        
        .tg-session-item {
          transition: background-color 0.2s ease;
        }
        
        .tg-session-item:hover {
          background-color: var(--tg-theme-secondary-bg-color, #efeff4);
        }
      `}</style>
      
      {/* Заголовок и поиск */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
          Сессии
        </h2>
        
        {/* Фильтры */}
        <SessionFilters
          statusFilter={filters.status}
          typeFilter={filters.type}
          searchQuery={filters.search}
          onStatusChange={(status) => setFilters({ ...filters, status })}
          onTypeChange={(type) => setFilters({ ...filters, type })}
          onSearchChange={(search) => setFilters({ ...filters, search })}
        />
      </div>

      {/* Список сессий с telegram-дизайном */}
      <div className="flex-1 overflow-y-auto px-4">
        {filteredSessions.length === 0 ? (
          <div className="tg-section">
            <div className="flex items-center justify-center p-8 text-center">
              <div>
                <p className="text-base" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                  Сессии не найдены
                </p>
                <p className="text-sm mt-2" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                  Попробуйте изменить параметры поиска или фильтры
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="tg-section mb-4">
            {filteredSessions.map((session, index) => {
              const typeDisplay = getSessionTypeDisplay(session.session_type);
              const statusIndicator = getStatusIndicator(session.status);
              const avatarGradient = createTelegramGradient(session.telegram_id.toString());
              const avatarLetter = generateAvatarLetter(session.user_name || `User${session.telegram_id}`);
              
              return (
                <div key={session.id}>
                  {index > 0 && <div className="tg-separator"></div>}
                  <button
                    onClick={() => onSelectSession(session)}
                    className={`w-full p-3 text-left tg-session-item ${
                      selectedSessionId === session.id 
                        ? 'border-l-4' 
                        : ''
                    }`}
                    style={{
                      borderLeftColor: selectedSessionId === session.id 
                        ? 'var(--tg-theme-link-color, #3390ec)' 
                        : 'transparent',
                      backgroundColor: selectedSessionId === session.id 
                        ? 'var(--tg-theme-secondary-bg-color, #efeff4)' 
                        : 'transparent',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Аватар с градиентом */}
                      <div className="flex-shrink-0 relative">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-md transition-transform duration-200 hover:scale-105"
                          style={{ background: avatarGradient }}
                        >
                          {avatarLetter}
                        </div>
                        
                        {/* Индикатор статуса онлайн */}
                        {session.user_online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2" style={{
                            backgroundColor: statusIndicator.color === 'bg-telegram-green' ? '#34c759' : '#8e8e93',
                            borderColor: 'var(--tg-theme-section-bg-color, #ffffff)',
                          }} />
                        )}
                      </div>

                      {/* Информация о сессии */}
                      <div className="flex-1 min-w-0">
                        {/* Заголовок с типом и статусом */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                            {session.user_name || `Пользователь ${session.telegram_id}`}
                          </span>
                          
                          {/* Бейдж типа сессии */}
                          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{
                            backgroundColor: typeDisplay.bgColor === 'bg-purple-100' ? '#9013fe20' : '#3390ec20',
                            color: typeDisplay.bgColor === 'bg-purple-100' ? '#9013fe' : '#3390ec',
                          }}>
                            {typeDisplay.icon} {typeDisplay.label}
                          </span>
                        </div>

                        {/* Username и ID */}
                        <p className="text-xs mb-1" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                          {session.user_username ? `@${session.user_username}` : session.user_name ? `${session.user_name}` : `ID: ${session.telegram_id}`}
                        </p>

                        {/* Время последнего сообщения или создания */}
                        <p className="text-xs mb-1" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                          {session.last_message_at 
                            ? formatLastMessageTime(session.last_message_at)
                            : `Создана: ${formatDate(session.created_at)}`
                          }
                        </p>

                        {/* Последнее сообщение (если есть) */}
                        {session.last_message && (
                          <p className="text-xs truncate" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                            {truncateText(session.last_message, 50)}
                          </p>
                        )}
                      </div>

                      {/* Счётчик непрочитанных сообщений */}
                      {session.unread_count !== undefined && session.unread_count > 0 && (
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {(() => {
                            // Зелёный цвет для "Нужна помощь", красный для обычных непрочитанных
                            const counterColor = session.help_needed && session.unread_count > 0 ? '#34c759' : '#ff3b30';
                            
                            return (
                              <span className="flex items-center justify-center text-xs font-bold rounded-full w-6 h-6 min-w-[24px]" style={{
                                backgroundColor: counterColor,
                                color: '#ffffff',
                              }}>
                                {session.unread_count > 99 ? '99+' : session.unread_count}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
