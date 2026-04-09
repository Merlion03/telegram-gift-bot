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
    <div className="w-full md:w-80 flex flex-col h-full" style={{ 
      backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
      borderLeft: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
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
        
        .tg-textarea {
          background-color: var(--tg-theme-secondary-bg-color, #efeff4);
          color: var(--tg-theme-text-color, #000000);
          border: none;
          border-radius: 10px;
          padding: 8px 12px;
          transition: background-color 0.2s ease;
          resize: none;
        }
        
        .tg-textarea:focus {
          outline: none;
          background-color: var(--tg-theme-section-separator-color, #c8c7cc);
        }
        
        .tg-textarea::placeholder {
          color: var(--tg-theme-hint-color, #8e8e93);
        }
      `}</style>
      
      {/* Заголовок с кнопкой закрытия */}
      <div className="flex items-center justify-between px-4 py-3" style={{ 
        borderBottom: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
      }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
          Информация о пользователе
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-all duration-200"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--tg-theme-secondary-bg-color, #efeff4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Закрыть панель"
          >
            <X className="w-5 h-5" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }} />
          </button>
        )}
      </div>

      {/* Основной контент */}
      <div className="flex-1 overflow-y-auto">
        {/* Информация о пользователе */}
        <div className="p-4" style={{ 
          borderBottom: '1px solid var(--tg-theme-section-separator-color, #c8c7cc)',
        }}>
          {/* Аватар и статус */}
          <div className="flex flex-col items-center mb-4">
            <div className="relative mb-3">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-24 h-24 rounded-full object-cover border-4"
                  style={{ borderColor: 'var(--tg-theme-button-color, #3390ec)' }}
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold border-4"
                  style={{ 
                    background: avatarGradient,
                    borderColor: 'var(--tg-theme-button-color, #3390ec)',
                  }}
                >
                  {avatarLetter}
                </div>
              )}

              {/* Индикатор онлайн статуса */}
              <div
                className="absolute bottom-0 right-0 w-6 h-6 rounded-full border-4"
                style={{
                  backgroundColor: user.online ? '#34c759' : 'var(--tg-theme-hint-color, #8e8e93)',
                  borderColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
                }}
              />
            </div>

            {/* Имя и статус */}
            <h3 className="text-xl font-bold text-center" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
              {user.name}
            </h3>
            <p className="text-sm text-center mt-1" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
              {user.online ? 'Онлайн' : `Был в сети: ${user.lastSeen || 'неизвестно'}`}
            </p>
          </div>

          {/* Контактная информация */}
          <div className="space-y-3">
            {/* Telegram ID */}
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium min-w-fit" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                ID:
              </span>
              <span className="text-sm break-all" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                {user.telegramId}
              </span>
            </div>

            {/* Username */}
            {user.username && (
              <div className="flex items-start gap-3">
                <span className="text-sm font-medium min-w-fit" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                  Username:
                </span>
                <span className="text-sm break-all" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                  @{user.username}
                </span>
              </div>
            )}

            {/* Телефон */}
            {user.phone && (
              <div className="flex items-start gap-3">
                <span className="text-sm font-medium min-w-fit" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                  Телефон:
                </span>
                <span className="text-sm break-all" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                  {user.phone}
                </span>
              </div>
            )}

            {/* Email */}
            {user.email && (
              <div className="flex items-start gap-3">
                <span className="text-sm font-medium min-w-fit" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                  Email:
                </span>
                <span className="text-sm break-all" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                  {user.email}
                </span>
              </div>
            )}

            {/* Первый контакт */}
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium min-w-fit" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                Первый контакт:
              </span>
              <span className="text-sm" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                {new Date(user.firstContact).toLocaleDateString('ru-RU')}
              </span>
            </div>

            {/* Всего сообщений */}
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium min-w-fit" style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}>
                Сообщений:
              </span>
              <span className="text-sm" style={{ color: 'var(--tg-theme-text-color, #000000)' }}>
                {user.totalMessages}
              </span>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onOpenTelegramProfile}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: 'var(--tg-theme-button-color, #3390ec)',
                color: 'var(--tg-theme-button-text-color, #ffffff)',
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Профиль
            </button>

            <button
              onClick={handleToggleNotifications}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: notificationsEnabled 
                  ? 'var(--tg-theme-button-color, #3390ec)' 
                  : 'var(--tg-theme-secondary-bg-color, #efeff4)',
                color: notificationsEnabled 
                  ? 'var(--tg-theme-button-text-color, #ffffff)' 
                  : 'var(--tg-theme-text-color, #000000)',
              }}
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
