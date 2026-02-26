/**
 * ChatWindow - компонент окна переписки с пользователем
 * Отображает историю сообщений с real-time обновлениями
 * Позволяет отправлять ответы пользователю
 * Requirements: 7.2, 7.3, 7.5, 8.1
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { getSupabaseClient } from '@/lib/database/supabaseClient';
import type { SupportMessage, SupportSession } from '@/types/support';
import { ErrorMessage, getReadableErrorMessage } from '@/components/common/ErrorMessage';

interface ChatWindowProps {
  session: SupportSession;
}

/**
 * Компонент окна чата с пользователем
 * Requirements: 7.2, 7.3, 7.5, 8.1
 */
export function ChatWindow({ session }: ChatWindowProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Загрузка истории сообщений при изменении сессии
  useEffect(() => {
    loadMessages();
  }, [session.id]);

  // Подписка на real-time обновления
  useEffect(() => {
    const supabaseClient = getSupabaseClient();

    // Подписываемся на новые сообщения для текущей сессии
    const unsubscribe = supabaseClient.subscribeToSessionMessages(
      session.id,
      (message) => {
        // Добавляем новое сообщение в список
        setMessages((prev) => {
          // Проверяем, не добавлено ли уже это сообщение
          if (prev.some((m) => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
        
        // Автоскролл к новому сообщению
        scrollToBottom();
      },
      (error) => {
        console.error('Real-time subscription error:', error);
      }
    );

    // Отписываемся при размонтировании или изменении сессии
    return () => {
      unsubscribe();
    };
  }, [session.id]);

  /**
   * Загружает историю сообщений с сервера
   * Requirements: 7.5
   */
  const loadMessages = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/support/messages?session_id=${session.id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
      
      // Скроллим к последнему сообщению после загрузки
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
      setError(getReadableErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Скроллит к последнему сообщению
   * Requirements: 7.2
   */
  const scrollToBottom = () => {
    // Проверка на существование метода (для совместимости с тестовым окружением)
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  /**
   * Отправляет ответ пользователю
   * Requirements: 8.1
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/support/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: session.id,
          telegram_id: session.telegram_id,
          message_text: newMessage.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не удалось отправить сообщение');
      }

      const data = await response.json();

      // Добавляем отправленное сообщение в список
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        scrollToBottom();
      }

      // Очищаем поле ввода
      setNewMessage('');
    } catch (err) {
      console.error('Ошибка отправки сообщения:', err);
      setError(getReadableErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Форматирует время сообщения
   */
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Форматирует дату сообщения
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  };

  /**
   * Группирует сообщения по датам
   */
  const groupMessagesByDate = (messages: SupportMessage[]) => {
    const groups: { date: string; messages: SupportMessage[] }[] = [];
    let currentDate = '';

    messages.forEach((message) => {
      const messageDate = new Date(message.created_at).toDateString();

      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({
          date: formatDate(message.created_at),
          messages: [message],
        });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });

    return groups;
  };

  // Состояние загрузки
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <div className="animate-pulse">Загрузка сообщений...</div>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Заголовок чата */}
      <div className="bg-white border-b px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              Пользователь: {session.telegram_id}
            </h2>
            <p className="text-sm text-gray-500">
              Сессия #{session.id} • {session.status === 'active' ? 'Активна' : 'Завершена'}
            </p>
          </div>
          {session.status === 'active' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Онлайн
            </span>
          )}
        </div>
      </div>

      {/* Список сообщений */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messageGroups.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p>Нет сообщений</p>
            <p className="text-sm mt-2">Сообщения появятся здесь, когда пользователь напишет</p>
          </div>
        ) : (
          messageGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Разделитель с датой */}
              <div className="flex items-center justify-center my-4">
                <div className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                  {group.date}
                </div>
              </div>

              {/* Сообщения группы */}
              {group.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex mb-3 ${
                    message.message_type === 'from_support' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      message.message_type === 'from_support'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-900 shadow-sm'
                    }`}
                  >
                    {/* Текст сообщения */}
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.message_text}
                    </p>

                    {/* Метаданные сообщения */}
                    <div
                      className={`flex items-center justify-end gap-2 mt-1 text-xs ${
                        message.message_type === 'from_support'
                          ? 'text-blue-100'
                          : 'text-gray-500'
                      }`}
                    >
                      <span>{formatTime(message.created_at)}</span>
                      
                      {/* Индикатор доставки для сообщений от поддержки */}
                      {message.message_type === 'from_support' && (
                        <span className="ml-1">
                          {message.delivered ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        
        {/* Якорь для автоскролла */}
        <div ref={messagesEndRef} />
      </div>

      {/* Отображение ошибки */}
      {error && (
        <div className="px-4 py-2">
          <ErrorMessage
            message={error}
            severity="error"
            onRetry={() => {
              setError(null);
              if (messages.length === 0) {
                loadMessages();
              }
            }}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      {/* Форма отправки сообщения */}
      {session.status === 'active' && (
        <form onSubmit={handleSendMessage} className="bg-white border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Введите сообщение..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSending}
              maxLength={4000}
            />
            <button
              type="submit"
              disabled={isSending || !newMessage.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
          
          {/* Счётчик символов */}
          <div className="mt-2 text-xs text-gray-500 text-right">
            {newMessage.length} / 4000
          </div>
        </form>
      )}

      {/* Сообщение о завершённой сессии */}
      {session.status === 'closed' && (
        <div className="bg-gray-100 border-t p-4 text-center">
          <p className="text-sm text-gray-600">
            Сессия завершена. Отправка сообщений недоступна.
          </p>
        </div>
      )}
    </div>
  );
}
