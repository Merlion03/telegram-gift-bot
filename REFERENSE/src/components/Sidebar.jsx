import React from 'react'
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'

const Sidebar = ({ dialogs, selectedDialog, onSelectDialog, searchQuery, onSearchChange, activeFilter, onFilterChange, collapsed, onToggleCollapse }) => {
  const filters = [
    { id: 'all', label: 'Все', count: dialogs.length },
    { id: 'new', label: 'Новые', count: dialogs.filter(d => d.status === 'new').length },
    { id: 'active', label: 'В работе', count: dialogs.filter(d => d.status === 'active').length },
    { id: 'closed', label: 'Закрытые', count: dialogs.filter(d => d.status === 'closed').length }
  ]

  const getStatusColor = (status) => {
    switch(status) {
      case 'new': return 'bg-telegram-blue'
      case 'active': return 'bg-telegram-green'
      case 'closed': return 'bg-telegram-secondary'
      default: return 'bg-telegram-secondary'
    }
  }

  return (
    <div className={`bg-telegram-sidebar border-r border-telegram-border flex flex-col telegram-shadow transition-all duration-300 ${
      collapsed ? 'w-16' : 'w-80'
    }`}>
      <div className="p-3 border-b border-telegram-border backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          {!collapsed && (
            <h2 className="text-base font-medium text-telegram-text">
              Диалоги
            </h2>
          )}
          <div className="flex items-center gap-1">
            {!collapsed && (
              <button className="p-1 hover:bg-telegram-chat rounded-lg transition-all duration-200 hover:scale-105">
                <Filter className="w-4 h-4 text-telegram-secondary" />
              </button>
            )}
            <button 
              onClick={onToggleCollapse}
              className="p-1 hover:bg-telegram-chat rounded-lg transition-all duration-200 hover:scale-105"
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-telegram-secondary" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-telegram-secondary" />
              )}
            </button>
          </div>
        </div>
        
        {!collapsed && (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-secondary" />
              <input
                type="text"
                placeholder="Поиск по чатам..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="telegram-input w-full pl-9 pr-4 py-2 text-sm"
              />
            </div>
            
            <div className="flex gap-1 overflow-x-auto pb-1">
              {filters.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => onFilterChange(filter.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-300 transform hover:scale-105 ${
                    activeFilter === filter.id
                      ? 'bg-telegram-blue text-white shadow-lg shadow-telegram-blue/25'
                      : 'bg-telegram-chat text-telegram-secondary hover:bg-telegram-border hover:text-telegram-text'
                  }`}
                >
                  {filter.label} {filter.count > 0 && filter.count}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {dialogs.map(dialog => (
          <div
            key={dialog.id}
            onClick={() => onSelectDialog(dialog)}
            className={`${collapsed ? 'p-2' : 'p-3'} border-b border-telegram-border/30 cursor-pointer transition-all duration-200 hover:transform hover:scale-[1.02] ${
              selectedDialog?.id === dialog.id
                ? 'bg-telegram-blue/15 border-l-2 border-l-telegram-blue telegram-shadow'
                : 'hover:bg-telegram-chat/50'
            }`}
          >
            {collapsed ? (
              // Collapsed view - only avatar
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center text-white font-medium text-sm">
                    {dialog.avatar}
                  </div>
                  {dialog.online && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-telegram-green border-2 border-telegram-sidebar rounded-full"></div>
                  )}
                  <div className={`absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-telegram-sidebar ${getStatusColor(dialog.status)}`}></div>
                  {dialog.unread > 0 && (
                    <div className="absolute -top-1 -right-1 px-1 py-0.5 bg-telegram-blue text-white text-xs font-semibold rounded-full min-w-[16px] text-center">
                      {dialog.unread}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Expanded view - full info
              <div className="flex gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-telegram-blue to-telegram-accent rounded-full flex items-center justify-center text-white font-medium text-sm">
                    {dialog.avatar}
                  </div>
                  {dialog.online && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-telegram-green border-2 border-telegram-sidebar rounded-full"></div>
                  )}
                  <div className={`absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-telegram-sidebar ${getStatusColor(dialog.status)}`}></div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`truncate text-sm ${
                        dialog.unread > 0 
                          ? 'font-semibold text-telegram-text' 
                          : 'font-medium text-telegram-text'
                      }`}>
                        {dialog.name}
                      </h3>
                      {dialog.priority && (
                        <span className="px-1.5 py-0.5 bg-telegram-red/20 text-telegram-red text-xs font-medium rounded">
                          VIP
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-telegram-secondary flex-shrink-0 ml-2">
                      {dialog.time}
                    </span>
                  </div>
                  
                  <p className="text-xs text-telegram-secondary mb-1">
                    {dialog.username} · #{dialog.id}
                  </p>
                  
                  <p className={`text-sm truncate mb-2 leading-tight ${
                    dialog.unread > 0 
                      ? 'text-telegram-text font-medium' 
                      : 'text-telegram-secondary'
                  }`}>
                    {dialog.lastMessage}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-telegram-secondary">
                      {dialog.operator || 'Не назначен'}
                    </span>
                    
                    {dialog.unread > 0 && (
                      <span className="px-1.5 py-0.5 bg-telegram-blue text-white text-xs font-semibold rounded-full min-w-[18px] text-center">
                        {dialog.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Sidebar