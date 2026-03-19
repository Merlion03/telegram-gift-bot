'use client';

import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  ExternalLink,
  FileText,
  MessageSquare,
  Image as ImageIcon,
  File,
  Link as LinkIcon,
  StickyNote,
  X,
  Send,
} from 'lucide-react';
import { createTelegramGradient, generateAvatarLetter } from '@/lib/telegram-utils';

/**
 * Интерфейс для информации о пользователе
 */
interface UserInfo {
  telegramId: number;
  username?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  name: string;
  online: boolean;
  lastSeen?: string;
  firstContact: string;
  totalMessages: number;
  notes: InternalNote[];
  preferences: UserPreferences;
}

/**
 * Интерфейс для внутренней заметки
 */
interface InternalNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  category?: string;
}

/**
 * Интерфейс для предпочтений пользователя
 */
interface UserPreferences {
  notifications: boolean;
  language: string;
  timezone: string;
}

/**
 * Интерфейс для пропсов компонента UserPanel
 */
interface UserPanelProps {
  user: UserInfo;
  onAddNote?: (note: string) => Promise<void>;
  onToggleNotifications?: (enabled: boolean) => void;
  onOpenTelegramProfile?: () => void;
  onClose?: () => void;
}

/**
 * Тип для активного таба
 */
type TabType = 'posts' | 'media' | 'files' | 'links' | 'notes';

/**
 * Компонент UserPanel - панель информации о пользователе
 */
export const UserPanel: React.FC<UserPanelProps> = ({
  user,
  onAddNote,
  onToggleNotifications,
  onOpenTelegramProfile,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user.preferences.notifications
  );

  /**
   * Обработчик добавления заметки
   */
  const handleAddNote = async () => {
    if (!noteText.trim() || !onAddNote) return;

    setIsAddingNote(true);
    try {
      await onAddNote(noteText);
      setNoteText('');
    } catch (error) {
      console.error('Ошибка при добавлении заметки:', error);
    } finally {
      setIsAddingNote(false);
    }
  };

  /**
   * Обработчик переключения уведомлений
   */
  const handleToggleNotifications = () => {
    const newState = !notificationsEnabled;
    setNotificationsEnabled(newState);
    onToggleNotifications?.(newState);
  };

  /**
   * Получить градиент для аватара
   */
  const avatarGradient = createTelegramGradient(user.name);
  const avatarLetter = generateAvatarLetter(user.name);

  return (
    <div className="w-full md:w-80 bg-telegram-bg border-l border-telegram-border flex flex-col h-full">
      {/* Заголовок с кнопкой закрытия */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-telegram-border">
        <h2 className="text-lg font-semibold text-telegram-text">
          Информация о пользователе
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-telegram-sidebar rounded-lg transition-telegram"
            aria-label="Закрыть панель"
          >
            <X className="w-5 h-5 text-telegram-secondary" />
          </button>
        )}
      </div>

      {/* Основной контент */}
      <div className="flex-1 overflow-y-auto">
        {/* Информация о пользователе */}
        <div className="p-4 border-b border-telegram-border">
          {/* Аватар и статус */}
          <div className="flex flex-col items-center mb-4">
            <div className="relative mb-3">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-telegram-blue"
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold border-4 border-telegram-blue"
                  style={{ background: avatarGradient }}
                >
                  {avatarLetter}
                </div>
              )}

              {/* Индикатор онлайн статуса */}
              <div
                className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-4 border-telegram-bg ${
                  user.online ? 'bg-telegram-green' : 'bg-telegram-tertiary'
                }`}
              />
            </div>

            {/* Имя и статус */}
            <h3 className="text-xl font-bold text-telegram-text text-center">
              {user.name}
            </h3>
            <p className="text-sm text-telegram-secondary text-center mt-1">
              {user.online ? 'Онлайн' : `Был в сети: ${user.lastSeen || 'неизвестно'}`}
            </p>
          </div>

          {/* Контактная информация */}
          <div className="space-y-3">
            {/* Telegram ID */}
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium text-telegram-secondary min-w-fit">
                ID:
              </span>
              <span className="text-sm text-telegram-text break-all">
                {user.telegramId}
              </span>
            </div>

            {/* Username */}
            {user.username && (
              <div className="flex items-start gap-3">
                <span className="text-sm font-medium text-telegram-secondary min-w-fit">
                  Username:
                </span>
                <span className="text-sm text-telegram-text break-all">
                  @{user.username}
                </span>
              </div>
            )}

            {/* Телефон */}
            {user.phone && (
              <div className="flex items-start gap-3">
                <span className="text-sm font-medium text-telegram-secondary min-w-fit">
                  Телефон:
                </span>
                <span className="text-sm text-telegram-text break-all">
                  {user.phone}
                </span>
              </div>
            )}

            {/* Email */}
            {user.email && (
              <div className="flex items-start gap-3">
                <span className="text-sm font-medium text-telegram-secondary min-w-fit">
                  Email:
                </span>
                <span className="text-sm text-telegram-text break-all">
                  {user.email}
                </span>
              </div>
            )}

            {/* Первый контакт */}
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium text-telegram-secondary min-w-fit">
                Первый контакт:
              </span>
              <span className="text-sm text-telegram-text">
                {new Date(user.firstContact).toLocaleDateString('ru-RU')}
              </span>
            </div>

            {/* Всего сообщений */}
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium text-telegram-secondary min-w-fit">
                Сообщений:
              </span>
              <span className="text-sm text-telegram-text">
                {user.totalMessages}
              </span>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onOpenTelegramProfile}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-telegram-blue hover:bg-telegram-dark-blue text-white rounded-lg text-sm font-medium transition-telegram"
            >
              <ExternalLink className="w-4 h-4" />
              Профиль
            </button>

            <button
              onClick={handleToggleNotifications}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-telegram ${
                notificationsEnabled
                  ? 'bg-telegram-blue hover:bg-telegram-dark-blue text-white'
                  : 'bg-telegram-sidebar hover:bg-telegram-border text-telegram-text'
              }`}
            >
              {notificationsEnabled ? (
                <>
                  <Bell className="w-4 h-4" />
                  Уведомления
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4" />
                  Без уведомлений
                </>
              )}
            </button>
          </div>
        </div>

        {/* Табы */}
        <div className="border-b border-telegram-border">
          <div className="flex overflow-x-auto">
            {[
              { id: 'posts' as TabType, label: 'Посты', icon: MessageSquare },
              { id: 'media' as TabType, label: 'Медиа', icon: ImageIcon },
              { id: 'files' as TabType, label: 'Файлы', icon: File },
              { id: 'links' as TabType, label: 'Ссылки', icon: LinkIcon },
              { id: 'notes' as TabType, label: 'Заметки', icon: StickyNote },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-telegram border-b-2 ${
                  activeTab === id
                    ? 'border-telegram-blue text-telegram-blue'
                    : 'border-transparent text-telegram-secondary hover:text-telegram-text'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Содержимое табов */}
        <div className="p-4">
          {activeTab === 'posts' && (
            <div className="text-center text-telegram-secondary text-sm py-8">
              Нет постов
            </div>
          )}

          {activeTab === 'media' && (
            <div className="text-center text-telegram-secondary text-sm py-8">
              Нет медиа
            </div>
          )}

          {activeTab === 'files' && (
            <div className="text-center text-telegram-secondary text-sm py-8">
              Нет файлов
            </div>
          )}

          {activeTab === 'links' && (
            <div className="text-center text-telegram-secondary text-sm py-8">
              Нет ссылок
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              {/* Форма добавления заметки */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-telegram-text block">
                  Добавить заметку
                </label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Введите заметку..."
                  className="telegram-textarea w-full h-20 text-sm"
                  maxLength={1000}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-telegram-secondary">
                    {noteText.length}/1000
                  </span>
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || isAddingNote}
                    className="flex items-center gap-2 px-3 py-2 bg-telegram-blue hover:bg-telegram-dark-blue disabled:bg-telegram-tertiary text-white rounded-lg text-sm font-medium transition-telegram"
                  >
                    <Send className="w-4 h-4" />
                    {isAddingNote ? 'Добавление...' : 'Добавить'}
                  </button>
                </div>
              </div>

              {/* Список заметок */}
              {user.notes.length > 0 ? (
                <div className="space-y-3 mt-4">
                  <h4 className="text-sm font-semibold text-telegram-text">
                    Заметки ({user.notes.length})
                  </h4>
                  {user.notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-telegram-sidebar rounded-lg border border-telegram-border"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-telegram-secondary">
                            {note.author}
                          </p>
                          <p className="text-xs text-telegram-tertiary">
                            {new Date(note.createdAt).toLocaleString('ru-RU')}
                          </p>
                        </div>
                        {note.category && (
                          <span className="text-xs px-2 py-1 bg-telegram-blue/10 text-telegram-blue rounded">
                            {note.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-telegram-text break-words">
                        {note.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-telegram-secondary text-sm py-8">
                  Нет заметок
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserPanel;
