/**
 * SessionList - компонент списка всех сессий (chat и support)
 * Отображает список сессий с автообновлением каждые 10 секунд
 * Показывает количество непрочитанных сообщений для каждой сессии
 * Поддерживает фильтрацию по типу сессии и статусу
 * Requirements: 3.1, 3.2, 3.3, 3.5, 5.3
 */

'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/database/supabaseClient';
import type { SupportSession, SupportSessionStatus, SessionType } from '@/types/support';

interface SessionListProps {
  onSelectSession: (session: SupportSession) => void;
  selectedSessionId?: number;
}

/**
 * Компонент списка сессий поддержки с фильтрацией
 * Requirements: 3.1, 3.2, 3.3, 3.5, 5.3, 7.4, 9.5
 */
export function SessionList({ onSelectSession, selectedSessionId }: SessionListProps) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  
  // Фильтры
  const [statusFilter, setStatusFilter] = useState<SupportSessionStatus | 'all'>('active');
  const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionType | 'all'>('all');

  // Настройки обновления
  const UPDATE_INTERVAL = 5000; // 5 секунд для активных сессий
  const IDLE_UPDATE_INTERVAL = 30000; // 30 секунд для неактивных

  // Загрузка сессий при монтировании и умное автообновление
  useEffect(() => {
    loadSessions(false);

    // Адаптивное автообновление: чаще для активных сессий, реже для закрытых
    const interval = statusFilter === 'active' ? UPDATE_INTERVAL : IDLE_UPDATE_INTERVAL;
    const updateInterval = setInterval(() => loadSessions(true), interval);
    
    return () => clearInterval(updateInterval);
  }, [statusFilter, sessionTypeFilter]); // Перезагружаем при изменении фильтров

  // Подписка на real-time обновления статусов сессий
  useEffect(() => {
    const supabaseClient = getSupabaseClient();

    // Подписываемся на изменения статусов сессий
    const unsubscribe = supabaseClient.subscribeToSessionStatusChanges(
      (sessionId, status) => {
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
      (error) => {
        console.error('Real-time subscription error:', error);
      }
    );

    // Отписываемся при размонтировании
    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Загружает список сессий с сервера с учётом фильтров
   * Поддерживает инкрементальное обновление для оптимизации
   * Requirements: 3.1, 5.3, 7.5
   */
  const loadSessions = async (isUpdate: boolean = false) => {
    try {
      // Формируем query параметры
      const params = new URLSearchParams();
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      if (sessionTypeFilter !== 'all') {
        params.append('session_type', sessionTypeFilter);
      }
      
      const response = await fetch(`/api/support/sessions?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const newSessions = data.sessions || [];
      
      if (isUpdate && sessions.length > 0) {
        // Инкрементальное обновление: обновляем только изменившиеся сессии
        // Requirements: 7.5
        setSessions(prevSessions => {
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
      
      setLastUpdateTime(new Date().toISOString());
      setError(null);
    } catch (err) {
      console.error('Ошибка загрузки сессий:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сессии');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Форматирует дату в читаемый формат
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Возвращает иконку и цвет для типа сессии
   * Requirements: 3.2, 3.3
   */
  const getSessionTypeDisplay = (sessionType: SessionType) => {
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
  };

  /**
   * Форматирует время последнего сообщения в относительный формат
   * Requirements: 3.1
   */
  const formatLastMessageTime = (dateString: string): string => {
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
  };

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

  // Пустой список
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Фильтры */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="space-y-3">
            {/* Фильтр по статусу */}
            <div>
              <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Статус
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SupportSessionStatus | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Все</option>
                <option value="active">Активные</option>
                <option value="closed">Закрытые</option>
              </select>
            </div>

            {/* Фильтр по типу сессии */}
            <div>
              <label htmlFor="session-type-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Тип сессии
              </label>
              <select
                id="session-type-filter"
                value={sessionTypeFilter}
                onChange={(e) => setSessionTypeFilter(e.target.value as SessionType | 'all')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Все</option>
                <option value="chat">💬 Диалоги</option>
                <option value="support">👤 Поддержка</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-500">
          <div>
            <p>Нет сессий</p>
            <p className="text-sm mt-2">
              {statusFilter === 'active' && sessionTypeFilter === 'all' 
                ? 'Сессии появятся здесь, когда пользователи обратятся в поддержку'
                : 'Попробуйте изменить фильтры'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Список сессий
  return (
    <div className="flex flex-col h-full">
      {/* Фильтры */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="space-y-3">
          {/* Фильтр по статусу */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Статус
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SupportSessionStatus | 'all')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="closed">Закрытые</option>
            </select>
          </div>

          {/* Фильтр по типу сессии */}
          <div>
            <label htmlFor="session-type-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Тип сессии
            </label>
            <select
              id="session-type-filter"
              value={sessionTypeFilter}
              onChange={(e) => setSessionTypeFilter(e.target.value as SessionType | 'all')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все</option>
              <option value="chat">💬 Диалоги</option>
              <option value="support">👤 Поддержка</option>
            </select>
          </div>
        </div>
      </div>

      {/* Список сессий */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
        {sessions.map((session) => {
          const typeDisplay = getSessionTypeDisplay(session.session_type);
          
          return (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                selectedSessionId === session.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Заголовок с типом сессии */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{typeDisplay.icon}</span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${typeDisplay.bgColor} ${typeDisplay.textColor} ${typeDisplay.borderColor}`}>
                      {typeDisplay.label}
                    </span>
                    {session.status === 'closed' && (
                      <span className="text-xs px-2 py-1 rounded-full border bg-gray-100 text-gray-600 border-gray-300">
                        Закрыта
                      </span>
                    )}
                  </div>

                  {/* Telegram ID пользователя */}
                  <p className="font-medium text-gray-900">
                    Пользователь: {session.telegram_id}
                  </p>
                  
                  {/* Время последнего сообщения или создания */}
                  <p className="text-sm text-gray-500 mt-1">
                    {session.last_message_at 
                      ? `Последнее сообщение: ${formatLastMessageTime(session.last_message_at)}`
                      : `Создана: ${formatDate(session.created_at)}`
                    }
                  </p>

                  {/* Последнее сообщение (если есть) */}
                  {session.last_message && (
                    <p className="text-sm text-gray-600 mt-2 truncate">
                      {session.last_message}
                    </p>
                  )}
                </div>

                {/* Счётчик непрочитанных сообщений */}
                {session.unread_count !== undefined && session.unread_count > 0 && (
                  <span className="flex-shrink-0 bg-red-500 text-white text-xs font-bold rounded-full px-2 py-1 min-w-[24px] text-center">
                    {session.unread_count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
