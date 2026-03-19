/**
 * SessionFilters - компонент для фильтрации и поиска сессий
 * Отделяет логику фильтрации от основного компонента SessionList
 * Requirements: 2.4, 2.7
 */

'use client';

import { Search, X } from 'lucide-react';
import type { SupportSessionStatus, SessionType } from '@/types/support';

interface SessionFiltersProps {
  statusFilter: SupportSessionStatus | 'all';
  typeFilter: SessionType | 'all';
  searchQuery: string;
  onStatusChange: (status: SupportSessionStatus | 'all') => void;
  onTypeChange: (type: SessionType | 'all') => void;
  onSearchChange: (query: string) => void;
}

/**
 * Компонент фильтров сессий с telegram-дизайном
 * Requirements: 2.4, 2.7
 */
export function SessionFilters({
  statusFilter,
  typeFilter,
  searchQuery,
  onStatusChange,
  onTypeChange,
  onSearchChange,
}: SessionFiltersProps) {
  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || searchQuery.trim() !== '';

  const handleClearFilters = () => {
    onStatusChange('all');
    onTypeChange('all');
    onSearchChange('');
  };

  return (
    <div className="space-y-3">
      {/* Поле поиска */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-telegram-secondary" />
        <input
          type="text"
          placeholder="Поиск по ID, имени, сообщению..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="telegram-input w-full pl-10 pr-10"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-telegram-secondary hover:text-telegram-text transition-colors"
            title="Очистить поиск"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-2 gap-2">
        {/* Фильтр по статусу */}
        <div>
          <label htmlFor="status-filter" className="block text-xs font-medium text-telegram-text mb-1">
            Статус
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as SupportSessionStatus | 'all')}
            className="telegram-input w-full text-sm"
          >
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="closed">Закрытые</option>
          </select>
        </div>

        {/* Фильтр по типу сессии */}
        <div>
          <label htmlFor="session-type-filter" className="block text-xs font-medium text-telegram-text mb-1">
            Тип
          </label>
          <select
            id="session-type-filter"
            value={typeFilter}
            onChange={(e) => onTypeChange(e.target.value as SessionType | 'all')}
            className="telegram-input w-full text-sm"
          >
            <option value="all">Все</option>
            <option value="chat">💬 Диалоги</option>
            <option value="support">👤 Поддержка</option>
          </select>
        </div>
      </div>

      {/* Кнопка очистки фильтров */}
      {hasActiveFilters && (
        <button
          onClick={handleClearFilters}
          className="w-full px-3 py-2 text-sm text-telegram-blue hover:bg-telegram-sidebar rounded-lg transition-colors duration-200"
        >
          Очистить фильтры
        </button>
      )}
    </div>
  );
}
