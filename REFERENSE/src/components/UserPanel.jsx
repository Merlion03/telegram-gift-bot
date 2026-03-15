import React, { useState } from 'react'
import { User, Phone, Mail, Calendar, MessageSquare, FileText, TrendingUp, X, Edit3, Bell, ExternalLink } from 'lucide-react'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const UserPanel = ({ user, dialog }) => {
  const [activeTab, setActiveTab] = useState('info')
  const [newNote, setNewNote] = useState('')
  
  const { 
    hapticFeedback, 
    showAlert, 
    showConfirm, 
    openTelegramLink,
    sendData,
    isReady: tgReady 
  } = useTelegramWebApp()

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    hapticFeedback('selection')
  }

  const handleOpenTelegramProfile = () => {
    if (user.username) {
      openTelegramLink(`https://t.me/${user.username}`)
    } else {
      showAlert('Username пользователя не найден')
    }
  }

  const handleAddNote = () => {
    if (newNote.trim()) {
      showConfirm('Добавить внутреннюю заметку?', (confirmed) => {
        if (confirmed) {
          // Здесь будет логика добавления заметки
          console.log('Добавление заметки:', newNote)
          
          if (tgReady) {
            sendData({
              action: 'note_added',
              user_id: user.telegramId,
              note: newNote,
              timestamp: Date.now()
            })
          }
          
          setNewNote('')
          showAlert('Заметка добавлена')
          hapticFeedback('notification', 'success')
        }
      })
    }
  }

  const handleNotificationToggle = () => {
    hapticFeedback('impact', 'light')
    showAlert('Настройки уведомлений изменены')
  }

  return (
    <div className="w-80 bg-telegram-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-telegram-border">
        <h2 className="text-lg font-medium text-telegram-text">User Info</h2>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-telegram-sidebar rounded-lg transition-colors">
            <Edit3 className="w-5 h-5 text-telegram-secondary" />
          </button>
          <button className="p-2 hover:bg-telegram-sidebar rounded-lg transition-colors">
            <X className="w-5 h-5 text-telegram-secondary" />
          </button>
        </div>
      </div>

      {/* User Avatar and Basic Info */}
      <div className="p-6 text-center border-b border-telegram-border">
        <div className="relative mb-4 inline-block">
          <div className="w-20 h-20 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center text-white text-2xl font-medium telegram-shadow">
            {user.avatar}
          </div>
          {user.online && (
            <div className="absolute bottom-1 right-1 w-5 h-5 bg-telegram-green border-3 border-telegram-bg rounded-full"></div>
          )}
        </div>
        
        <h3 className="text-xl font-medium text-telegram-text mb-1">
          {user.name}
        </h3>
        <p className="text-sm text-telegram-secondary mb-4">
          {user.online ? 'онлайн' : 'был недавно'}
        </p>
      </div>

      {/* Contact Info */}
      <div className="px-4 py-3 border-b border-telegram-border">
        <div className="flex items-center gap-3 py-3">
          <Phone className="w-5 h-5 text-telegram-secondary" />
          <div className="flex-1">
            <p className="text-sm text-telegram-text font-medium">{user.phone}</p>
            <p className="text-xs text-telegram-secondary">Phone</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 py-3">
          <Mail className="w-5 h-5 text-telegram-secondary" />
          <div className="flex-1">
            <p className="text-sm text-telegram-text font-medium">{user.username}</p>
            <p className="text-xs text-telegram-secondary">Username</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 py-3">
          <User className="w-5 h-5 text-telegram-secondary" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-telegram-text font-medium">ID: {user.telegramId}</p>
              <button
                onClick={handleOpenTelegramProfile}
                className="p-1 hover:bg-telegram-sidebar rounded transition-colors"
                title="Открыть профиль в Telegram"
              >
                <ExternalLink className="w-3 h-3 text-telegram-blue" />
              </button>
            </div>
            <p className="text-xs text-telegram-secondary">Telegram ID</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 py-3">
          <Calendar className="w-5 h-5 text-telegram-secondary" />
          <div className="flex-1">
            <p className="text-sm text-telegram-text font-medium">{user.firstContact}</p>
            <p className="text-xs text-telegram-secondary">Первое обращение</p>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="px-4 py-3 border-b border-telegram-border">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-telegram-secondary" />
            <span className="text-sm text-telegram-text">Notifications</span>
          </div>
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only" 
              defaultChecked 
              onChange={handleNotificationToggle}
            />
            <div className="w-12 h-6 bg-telegram-blue rounded-full relative cursor-pointer">
              <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full transition-transform"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-telegram-border">
        {[
          { id: 'posts', label: 'Posts' },
          { id: 'media', label: 'Media' },
          { id: 'files', label: 'Files' },
          { id: 'links', label: 'Links' },
          { id: 'notes', label: 'Notes' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 px-2 py-3 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-telegram-blue border-b-2 border-telegram-blue'
                : 'text-telegram-secondary hover:text-telegram-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === 'posts' && (
          <div className="p-4">
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-telegram-secondary/50 mx-auto mb-3" />
              <p className="text-sm text-telegram-secondary">No posts yet</p>
            </div>
          </div>
        )}
        
        {activeTab === 'media' && (
          <div className="p-4">
            <div className="grid grid-cols-3 gap-1">
              {/* Mock media items */}
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div key={item} className="aspect-square bg-telegram-sidebar rounded-lg flex items-center justify-center">
                  <span className="text-xs text-telegram-secondary">IMG</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'files' && (
          <div className="p-4">
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-telegram-secondary/50 mx-auto mb-3" />
              <p className="text-sm text-telegram-secondary">No files</p>
            </div>
          </div>
        )}
        
        {activeTab === 'links' && (
          <div className="p-4">
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-telegram-secondary/50 mx-auto mb-3" />
              <p className="text-sm text-telegram-secondary">No links</p>
            </div>
          </div>
        )}
        
        {activeTab === 'notes' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-telegram-text">
                Внутренние заметки
              </h4>
              <button className="text-xs text-telegram-blue hover:text-telegram-darkblue font-medium">
                + Добавить
              </button>
            </div>
            
            {user.notes.map((note, idx) => (
              <div 
                key={idx}
                className="p-3 bg-telegram-sidebar rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <FileText className="w-4 h-4 text-telegram-blue mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-telegram-text mb-2">
                      {note.text}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-telegram-secondary">
                      <span>{note.author}</span>
                      <span>•</span>
                      <span>{note.date}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            <div className="pt-4 border-t border-telegram-border">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Добавить внутреннюю заметку..."
                rows="3"
                className="telegram-input w-full px-3 py-2 rounded-lg text-sm resize-none"
              />
              <button 
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="mt-2 w-full px-4 py-2 bg-telegram-blue hover:bg-telegram-darkblue disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Сохранить заметку
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserPanel