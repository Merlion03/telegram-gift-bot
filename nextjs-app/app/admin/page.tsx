/**
 * Страница админки службы поддержки
 * Интегрирует SessionList и ChatWindow для управления сессиями поддержки
 * Requirements: 7.4, 7.5
 */

'use client';

import { useState } from 'react';
import { SessionList } from '@/components/admin/SessionList';
import { ChatWindow } from '@/components/admin/ChatWindow';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import type { SupportSession } from '@/types/support';

/**
 * Главная страница админки
 * Requirements: 7.4, 7.5
 */
export default function AdminPage() {
  const [selectedSession, setSelectedSession] = useState<SupportSession | null>(null);

  /**
   * Обработчик выбора сессии
   */
  const handleSelectSession = (session: SupportSession) => {
    setSelectedSession(session);
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-100">
        {/* Боковая панель со списком сессий */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Заголовок панели */}
          <div className="px-4 py-4 border-b border-gray-200 bg-gray-50">
            <h1 className="text-xl font-bold text-gray-900">Служба поддержки</h1>
            <p className="text-sm text-gray-600 mt-1">Активные сессии</p>
          </div>

          {/* Список сессий */}
          <div className="flex-1 overflow-y-auto">
            <ErrorBoundary
              fallback={
                <div className="p-4 text-center text-red-600">
                  <p className="text-sm">Ошибка загрузки списка сессий</p>
                </div>
              }
            >
              <SessionList
                onSelectSession={handleSelectSession}
                selectedSessionId={selectedSession?.id}
              />
            </ErrorBoundary>
          </div>

          {/* Футер панели */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Обновление каждые 10 сек</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Онлайн
              </span>
            </div>
          </div>
        </aside>

        {/* Основная область с чатом */}
        <main className="flex-1 flex flex-col">
          {selectedSession ? (
            <ErrorBoundary
              fallback={
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center text-red-600">
                    <p className="text-lg font-medium">Ошибка загрузки чата</p>
                    <p className="text-sm mt-2">Попробуйте выбрать другую сессию</p>
                  </div>
                </div>
              }
            >
              <ChatWindow session={selectedSession} />
            </ErrorBoundary>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
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
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Выберите сессию
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Выберите сессию из списка слева, чтобы начать переписку
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
