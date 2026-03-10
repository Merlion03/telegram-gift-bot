/**
 * ChatWindow - компонент окна переписки с пользователем
 * Отображает историю сообщений с real-time обновлениями
 * Позволяет отправлять ответы пользователю
 * Поддерживает работу с Chat_Session и Support_Session
 * Requirements: 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { getRealtimeClient } from '@/lib/database/realtimeClient';
import type { SupportMessage, SupportSession } from '@/types/support';
import { ErrorMessage, getReadableErrorMessage } from '@/components/common/ErrorMessage';

interface ChatWindowProps {
  session: SupportSession;
}

/**
 * Компонент окна чата с пользователем
 * Поддерживает работу с Chat_Session и Support_Session
 * Requirements: 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1
 */
export function ChatWindow({ session }: ChatWindowProps) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentSessionType, setCurrentSessionType] = useState<'chat' | 'support'>(session.session_type);
  const [hasMore, setHasMore] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const MESSAGES_PER_PAGE = 50;

  // Загрузка истории сообщений при изменении сессии
  useEffect(() => {
    loadMessages();
  }, [session.id]);

  // Подписка на real-time обновления
  useEffect(() => {
    // Асинхронная инициализация подписки
    const initSubscription = async () => {
      const realtimeClient = getRealtimeClient();

      // ИСПРАВЛЕНИЕ: Явно подключаемся перед подпиской
      // Это гарантирует, что после обновления страницы клиент переподключится
      try {
        await realtimeClient.connect();
      } catch (error) {
        console.error('[ChatWindow] Ошибка подключения к WebSocket:', error);
      }

      // Подписываемся на новые сообщения для текущей сессии
      unsubscribeRef.current = realtimeClient.subscribeToSessionMessages(
        session.id,
        (serverMessage) => {
          // Проверяем, что компонент всё ещё смонтирован
          if (!isMountedRef.current) return;
          
          // Обрабатываем только new_message события
          if (serverMessage.type !== 'new_message') return;
          
          // Преобразуем данные сервера в SupportMessage
          // Явное преобразование всех типов отправителей:
          // - 'user' -> 'from_user' (сообщения от пользователя, отображаются слева)
          // - 'bot' -> 'from_bot' (автоматические сообщения бота, фиолетовый фон)
          // - 'admin' -> 'from_support' (сообщения от администратора, отображаются справа)
          // - неизвестные типы -> 'from_support' (fallback для безопасности)
          const message: SupportMessage = {
            id: serverMessage.data.id,
            session_id: serverMessage.data.session_id,
            telegram_id: session.telegram_id,
            message_type: 
              serverMessage.data.sender_type === 'user' ? 'from_user' :
              serverMessage.data.sender_type === 'bot' ? 'from_bot' :
              'from_support',
            message_text: serverMessage.data.message_text,
            created_at: serverMessage.data.created_at,
            delivered: serverMessage.data.is_read || false,
          };
          
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
        (error: Error) => {
          console.error('Real-time subscription error:', error);
        }
      );
    };

    initSubscription();

    // Отписываемся при размонтировании или изменении сессии
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [session.id]);

  /**
   * Загружает историю сообщений с сервера
   * Использует новый API endpoint для получения истории с пагинацией
   * Requirements: 3.4, 7.3, 7.5
   */
  const loadMessages = async (offset: number = 0, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const url = `/api/support/sessions/${session.id}/messages?limit=${MESSAGES_PER_PAGE}&offset=${offset}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (append) {
        // Добавляем новые сообщения к существующим (для infinite scroll)
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        // Заменяем все сообщения (первая загрузка)
        setMessages(data.messages || []);
      }
      
      setTotalMessages(data.total || 0);
      setHasMore(data.has_more || false);
      
      // Обновляем текущий тип сессии, если он изменился
      if (data.session && data.session.session_type) {
        setCurrentSessionType(data.session.session_type);
      }
      
      // Скроллим к последнему сообщению после первой загрузки
      if (!append) {
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
      setError(getReadableErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
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
   * Загружает предыдущие сообщения при скролле вверх
   * Requirements: 7.3
   */
  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    const currentOffset = messages.length;
    await loadMessages(currentOffset, true);
  };

  /**
   * Обработчик скролла для infinite scroll
   * Requirements: 7.3
   */
  const handleScroll = () => {
    if (!messagesContainerRef.current || isLoadingMore || !hasMore) {
      return;
    }

    const container = messagesContainerRef.current;
    // Проверяем, достиг ли пользователь верха контейнера
    if (container.scrollTop === 0) {
      loadMoreMessages();
    }
  };

  // Добавляем обработчик скролла
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [messages.length, hasMore, isLoadingMore]);

  /**
   * Подключается к Chat_Session, преобразуя её в Support_Session
   * Requirements: 4.1, 4.3
   */
  const handleConnectToChat = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`/api/support/sessions/${session.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не удалось подключиться к диалогу');
      }

      const data = await response.json();

      // Обновляем тип сессии
      if (data.session && data.session.session_type) {
        setCurrentSessionType(data.session.session_type);
      }

      // Перезагружаем сообщения
      await loadMessages();
    } catch (err) {
      console.error('Ошибка подключения к диалогу:', err);
      setError(getReadableErrorMessage(err));
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Отправляет ответ пользователю через новый API endpoint
   * Автоматически преобразует Chat_Session в Support_Session при первом сообщении
   * Requirements: 4.2, 4.3, 8.1
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/support/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message_text: newMessage.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не удалось отправить сообщение');
      }

      const data = await response.json();

      // Обновляем тип сессии, если произошло автоматическое преобразование
      if (data.session && data.session.session_type) {
        setCurrentSessionType(data.session.session_type);
      }

      // НЕ добавляем сообщение вручную - оно придёт через WebSocket!
      // Триггер PostgreSQL автоматически отправит уведомление через new_message канал
      // и WebSocket подписка добавит сообщение в список
      // Это предотвращает дублирование и гарантирует консистентность

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
   * 
   * ИСПРАВЛЕНИЕ: Используем Map для отслеживания уже созданных групп по датам.
   * Это предотвращает дублирование разделителей дат после перезагрузки страницы.
   * 
   * Проблема старой реализации: последовательное сравнение с currentDate создавало
   * новую группу каждый раз, когда дата менялась, даже если группа для этой даты
   * уже существовала ранее в массиве. При перезагрузке или асинхронной загрузке
   * сообщений это приводило к дублированию разделителей "Сегодня", "Вчера" и т.д.
   * 
   * Новая реализация: Map гарантирует, что для каждой уникальной даты (toDateString)
   * существует только одна группа, и все сообщения этой даты попадают в неё.
   */
  const groupMessagesByDate = (messages: SupportMessage[]) => {
    // Map для отслеживания групп по датам (ключ - toDateString, значение - группа)
    const groupsMap = new Map<string, { date: string; messages: SupportMessage[] }>();
    
    messages.forEach((message) => {
      // Получаем строковое представление даты (например, "Wed Mar 06 2024")
      const messageDate = new Date(message.created_at).toDateString();
      
      // Если группа для этой даты ещё не создана, создаём её
      if (!groupsMap.has(messageDate)) {
        groupsMap.set(messageDate, {
          date: formatDate(message.created_at), // Форматированная дата ("Сегодня", "Вчера", "ДД.ММ.ГГГГ")
          messages: [],
        });
      }
      
      // Добавляем сообщение в существующую группу для этой даты
      groupsMap.get(messageDate)!.messages.push(message);
    });
    
    // Преобразуем Map в массив групп, сохраняя порядок добавления
    return Array.from(groupsMap.values());
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
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-gray-500">
                Сессия #{session.id}
              </p>
              <span className="text-gray-400">•</span>
              <span className={`text-sm font-medium ${
                currentSessionType === 'support' ? 'text-blue-600' : 'text-gray-600'
              }`}>
                {currentSessionType === 'support' ? 'Поддержка' : 'Обычный диалог'}
              </span>
              <span className="text-gray-400">•</span>
              <span className={`text-sm ${
                session.status === 'active' ? 'text-green-600' : 'text-gray-500'
              }`}>
                {session.status === 'active' ? 'Активна' : 'Завершена'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Кнопка подключения к Chat_Session (Requirements 4.1) */}
            {currentSessionType === 'chat' && session.status === 'active' && (
              <button
                onClick={handleConnectToChat}
                disabled={isConnecting}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isConnecting ? 'Подключение...' : 'Подключиться к диалогу'}
              </button>
            )}
            {session.status === 'active' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Онлайн
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Список сообщений */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Индикатор загрузки предыдущих сообщений */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="text-sm text-gray-500 animate-pulse">
              Загрузка предыдущих сообщений...
            </div>
          </div>
        )}

        {/* Индикатор наличия ещё сообщений */}
        {hasMore && !isLoadingMore && messages.length > 0 && (
          <div className="flex justify-center py-2">
            <button
              onClick={loadMoreMessages}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Загрузить предыдущие сообщения ({totalMessages - messages.length} осталось)
            </button>
          </div>
        )}

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
              {group.messages.map((message) => {
                // Определяем стиль в зависимости от типа сообщения (Requirements 4.1)
                const isFromSupport = message.message_type === 'from_support';
                const isFromBot = message.message_type === 'from_bot';
                const isFromUser = message.message_type === 'from_user';

                return (
                  <div
                    key={message.id}
                    className={`flex mb-3 ${
                      isFromSupport ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 ${
                        isFromSupport
                          ? 'bg-blue-600 text-white'
                          : isFromBot
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : 'bg-white text-gray-900 shadow-sm'
                      }`}
                    >
                      {/* Метка отправителя для сообщений бота */}
                      {isFromBot && (
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs font-semibold text-purple-700">🤖 Бот</span>
                        </div>
                      )}

                      {/* Текст сообщения */}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.message_text}
                      </p>

                      {/* Метаданные сообщения */}
                      <div
                        className={`flex items-center justify-end gap-2 mt-1 text-xs ${
                          isFromSupport
                            ? 'text-blue-100'
                            : isFromBot
                            ? 'text-purple-600'
                            : 'text-gray-500'
                        }`}
                      >
                        <span>{formatTime(message.created_at)}</span>
                        
                        {/* Индикатор доставки для сообщений от поддержки */}
                        {isFromSupport && (
                          <span className="ml-1">
                            {message.delivered ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
