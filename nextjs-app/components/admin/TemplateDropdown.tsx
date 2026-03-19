/**
 * TemplateDropdown - компонент выпадающего списка шаблонов сообщений
 * Отображает категоризированные шаблоны для быстрого выбора
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  MessageTemplate,
  TEMPLATE_CATEGORIES_INFO,
  getTemplatesByCategory,
  getTemplateCategories,
} from '@/lib/constants/message-templates';

interface TemplateDropdownProps {
  templates: MessageTemplate[];
  onSelectTemplate: (template: MessageTemplate) => void;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Компонент выпадающего списка шаблонов
 */
export function TemplateDropdown({
  templates,
  onSelectTemplate,
  isOpen,
  onToggle,
}: TemplateDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const categories = getTemplateCategories(templates);

  // Закрываем меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        if (isOpen) {
          onToggle();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle]);

  const handleSelectTemplate = (template: MessageTemplate) => {
    onSelectTemplate(template);
    onToggle();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Кнопка открытия меню */}
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm text-telegram-secondary hover:text-telegram-text transition-colors"
        title="Шаблоны сообщений"
        aria-label="Открыть шаблоны"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Выпадающее меню */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-telegram-bg border border-telegram-border rounded-lg telegram-shadow-lg z-50 animate-menu-slide-in">
          {/* Заголовок */}
          <div className="px-4 py-3 border-b border-telegram-border">
            <h3 className="text-sm font-semibold text-telegram-text">
              Шаблоны сообщений
            </h3>
            <p className="text-xs text-telegram-secondary mt-1">
              Выберите готовый ответ
            </p>
          </div>

          {/* Категории и шаблоны */}
          <div className="max-h-96 overflow-y-auto">
            {categories.map((category) => {
              const categoryTemplates = getTemplatesByCategory(
                templates,
                category
              );
              const categoryInfo =
                TEMPLATE_CATEGORIES_INFO[category as keyof typeof TEMPLATE_CATEGORIES_INFO];

              return (
                <div key={category}>
                  {/* Заголовок категории */}
                  <div className="px-4 py-2 bg-telegram-sidebar">
                    <p className="text-xs font-semibold text-telegram-secondary uppercase tracking-wide">
                      {categoryInfo.label}
                    </p>
                  </div>

                  {/* Шаблоны в категории */}
                  {categoryTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="w-full text-left px-4 py-3 hover:bg-telegram-sidebar transition-colors border-b border-telegram-border last:border-b-0"
                    >
                      <p className="text-sm text-telegram-text line-clamp-2">
                        {template.text}
                      </p>
                      {template.shortcut && (
                        <p className="text-xs text-telegram-secondary mt-1">
                          {template.shortcut}
                        </p>
                      )}
                      {template.usageCount > 0 && (
                        <p className="text-xs text-telegram-tertiary mt-1">
                          Использовано: {template.usageCount}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Подсказка */}
          <div className="px-4 py-2 bg-telegram-sidebar border-t border-telegram-border">
            <p className="text-xs text-telegram-secondary">
              💡 Введите shortcut для быстрого выбора
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
