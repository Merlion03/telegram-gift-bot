/**
 * SessionList - компонент списка активных сессий поддержки
 * Отображает список сессий с автообновлением каждые 10 секунд
 * Показывает количество непрочитанных сообщений для каждой сессии
 */

'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/database/supabaseClient';
import type { SupportSession, SupportSessionStatus } from '@/types/support';

interface SessionListProps {
  onSelectSession: (session: SupportSession) => void;
  selectedSessionId?: number;
}

/**
 * Компонент списка сессий поддержки
 * Requirements: 7.4, 9.5
 */
export function SessionList({ onSelectSession, selectedSessionId }: SessionListProps) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Загрузка сессий при монтировании и автообновление каждые 10 секунд
  useEffect(() => {
    loadSessions();

    // Автообновление каждые 10 секунд
    const interval = setInterval(loadSessions, 10000);
    
    return () => clearInterval(interval);
  }, []);

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
   * Загружает список активных сессий с сервера
   */
  const loadSessions = async () => {
    try {
      const response = await fetch('/api/support/sessions?status=active');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setSessions(data.sessions || []);
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
            onClick={loadSessions}
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
      <div className="p-4 text-center text-gray-500">
        <p>Нет активных сессий</p>
        <p className="text-sm mt-2">Сессии появятся здесь, когда пользователи обратятся в поддержку</p>
      </div>
    );
  }

  // Список сессий
  return (
    <div className="divide-y divide-gray-200">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => onSelectSession(session)}
          className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
            selectedSessionId === session.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
          }`}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {/* Telegram ID пользователя */}
              <p className="font-medium text-gray-900">
                Пользователь: {session.telegram_id}
              </p>
              
              {/* Время создания сессии */}
              <p className="text-sm text-gray-500 mt-1">
                Начало: {formatDate(session.created_at)}
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
              <span className="ml-3 flex-shrink-0 bg-red-500 text-white text-xs font-bold rounded-full px-2 py-1 min-w-[24px] text-center">
                {session.unread_count}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
