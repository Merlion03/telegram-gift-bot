/**
 * Sidebar - компонент боковой панели с функциональностью сворачивания
 * Оборачивает SessionList и добавляет возможность сворачивания/разворачивания
 * В свернутом состоянии показывает только аватары пользователей
 * Requirements: 2.2, 2.3, 2.8
 */

'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SessionList } from './SessionList';
import type { SupportSession } from '@/types/support';

interface SidebarProps {
  onSelectSession: (session: SupportSession) => void;
  selectedSessionId?: number;
}

/**
 * Компонент Sidebar с поддержкой сворачивания
 * Requirements: 2.2, 2.3, 2.8
 */
export function Sidebar({ onSelectSession, selectedSessionId }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Проверяем размер экрана при монтировании и при изменении размера
  useEffect(() => {
    const checkMobileScreen = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobileScreen();
    window.addEventListener('resize', checkMobileScreen);
    return () => window.removeEventListener('resize', checkMobileScreen);
  }, []);

  // На мобильных устройствах сворачиваем по умолчанию
  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(true);
    }
  }, [isMobile]);

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))' }}>
      {/* Основная панель */}
      <div
        className={`transition-all duration-300 ease-out flex flex-col ${
          isCollapsed ? 'w-20' : 'w-80'
        }`}
        style={{ 
          borderRight: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
        }}
      >
        {/* Кнопка сворачивания */}
        <div className="flex items-center justify-between p-2" style={{ 
          borderBottom: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
        }}>
          {!isCollapsed && (
            <div className="px-2 py-1 text-sm font-semibold" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
              Сессии
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg transition-all duration-200 ml-auto"
            style={{
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title={isCollapsed ? 'Развернуть' : 'Свернуть'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" style={{ color: 'var(--tg-theme-link-color, #3390ec)' }} />
            ) : (
              <ChevronLeft className="w-5 h-5" style={{ color: 'var(--tg-theme-link-color, #3390ec)' }} />
            )}
          </button>
        </div>

        {/* Содержимое */}
        <div className="flex-1 overflow-hidden">
          {isCollapsed ? (
            // Свернутое состояние - показываем только аватары
            <CollapsedSessionList
              onSelectSession={onSelectSession}
              selectedSessionId={selectedSessionId}
            />
          ) : (
            // Развернутое состояние - полный список
            <SessionList
              onSelectSession={onSelectSession}
              selectedSessionId={selectedSessionId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Компонент для отображения свернутого списка сессий (только аватары)
 * Requirements: 2.2, 2.3
 */
function CollapsedSessionList({
  onSelectSession,
  selectedSessionId,
}: {
  onSelectSession: (session: SupportSession) => void;
  selectedSessionId?: number;
}) {
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => loadSessions(), 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/support/sessions?status=active');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Ошибка загрузки сессий:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 p-2 overflow-y-auto">
      {sessions.map((session) => (
        <CollapsedSessionItem
          key={session.id}
          session={session}
          isSelected={selectedSessionId === session.id}
          onSelect={() => onSelectSession(session)}
        />
      ))}
    </div>
  );
}

/**
 * Элемент свернутого списка сессий (аватар)
 * Requirements: 2.2, 2.3
 */
function CollapsedSessionItem({
  session,
  isSelected,
  onSelect,
}: {
  session: SupportSession;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { createTelegramGradient, generateAvatarLetter } = require('@/lib/telegram-utils');
  
  const avatarGradient = createTelegramGradient(session.telegram_id.toString());
  const avatarLetter = generateAvatarLetter(session.user_name || `User${session.telegram_id}`);

  return (
    <button
      onClick={onSelect}
      className="relative w-14 h-14 rounded-full flex items-center justify-center text-white font-semibold transition-all duration-200 hover:scale-110"
      style={{ 
        background: avatarGradient,
        boxShadow: isSelected ? '0 0 0 2px var(--tg-theme-link-color, #3390ec)' : 'none',
      }}
      title={session.user_name || `Пользователь ${session.telegram_id}`}
    >
      {avatarLetter}

      {/* Индикатор непрочитанных сообщений */}
      {session.unread_count !== undefined && session.unread_count > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center text-xs font-bold rounded-full w-5 h-5" style={{
          backgroundColor: '#ff3b30',
          color: '#ffffff',
        }}>
          {session.unread_count > 9 ? '9+' : session.unread_count}
        </span>
      )}

      {/* Индикатор статуса онлайн */}
      {session.user_online && (
        <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2" style={{
          backgroundColor: '#34c759',
          borderColor: 'var(--tg-theme-section-bg-color, #ffffff)',
        }} />
      )}
    </button>
  );
}
