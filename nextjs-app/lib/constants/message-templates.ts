/**
 * Шаблоны быстрых ответов для поля ввода сообщений
 */

export interface MessageTemplate {
  id: string;
  text: string;
  category: 'greeting' | 'support' | 'closing' | 'custom';
  shortcut?: string;
  usageCount: number;
  lastUsed?: string;
}

/**
 * Предустановленные шаблоны сообщений
 */
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplate[] = [
  // Приветствия
  {
    id: 'greeting-1',
    text: 'Здравствуйте! Спасибо, что обратились в нашу службу поддержки. Чем я могу вам помочь?',
    category: 'greeting',
    shortcut: '/привет',
    usageCount: 0,
  },
  {
    id: 'greeting-2',
    text: 'Добрый день! Я готов помочь вам. Опишите, пожалуйста, вашу проблему.',
    category: 'greeting',
    shortcut: '/день',
    usageCount: 0,
  },
  {
    id: 'greeting-3',
    text: 'Привет! Спасибо за сообщение. Я помогу вам разобраться.',
    category: 'greeting',
    shortcut: '/привет2',
    usageCount: 0,
  },

  // Поддержка
  {
    id: 'support-1',
    text: 'Я понимаю вашу проблему. Давайте разберемся вместе. Можете ли вы предоставить больше деталей?',
    category: 'support',
    shortcut: '/помощь',
    usageCount: 0,
  },
  {
    id: 'support-2',
    text: 'Спасибо за информацию. Я проверю это и вернусь к вам в ближайшее время.',
    category: 'support',
    shortcut: '/проверка',
    usageCount: 0,
  },
  {
    id: 'support-3',
    text: 'К сожалению, я не могу помочь с этим вопросом. Позвольте мне перенаправить вас к специалисту.',
    category: 'support',
    shortcut: '/специалист',
    usageCount: 0,
  },
  {
    id: 'support-4',
    text: 'Проблема решена? Если у вас есть еще вопросы, я всегда готов помочь.',
    category: 'support',
    shortcut: '/решено',
    usageCount: 0,
  },

  // Завершение
  {
    id: 'closing-1',
    text: 'Спасибо за обращение! Если у вас возникнут еще вопросы, не стесняйтесь писать.',
    category: 'closing',
    shortcut: '/спасибо',
    usageCount: 0,
  },
  {
    id: 'closing-2',
    text: 'Рад был помочь! Хорошего дня!',
    category: 'closing',
    shortcut: '/до-свидания',
    usageCount: 0,
  },
  {
    id: 'closing-3',
    text: 'Спасибо за внимание. Надеюсь, я смог вам помочь. До встречи!',
    category: 'closing',
    shortcut: '/конец',
    usageCount: 0,
  },
];

/**
 * Категории шаблонов с описаниями
 */
export const TEMPLATE_CATEGORIES_INFO = {
  greeting: {
    label: 'Приветствия',
    description: 'Шаблоны для начала диалога',
    icon: 'MessageCircle',
  },
  support: {
    label: 'Поддержка',
    description: 'Шаблоны для помощи пользователю',
    icon: 'HelpCircle',
  },
  closing: {
    label: 'Завершение',
    description: 'Шаблоны для завершения диалога',
    icon: 'CheckCircle',
  },
  custom: {
    label: 'Пользовательские',
    description: 'Ваши собственные шаблоны',
    icon: 'Star',
  },
} as const;

/**
 * Получить шаблоны по категории
 */
export const getTemplatesByCategory = (
  templates: MessageTemplate[],
  category: MessageTemplate['category']
): MessageTemplate[] => {
  return templates.filter((template) => template.category === category);
};

/**
 * Получить все категории из шаблонов
 */
export const getTemplateCategories = (
  templates: MessageTemplate[]
): MessageTemplate['category'][] => {
  const categories = new Set<MessageTemplate['category']>();
  templates.forEach((template) => {
    categories.add(template.category);
  });
  return Array.from(categories);
};

/**
 * Найти шаблон по shortcut
 */
export const findTemplateByShortcut = (
  templates: MessageTemplate[],
  shortcut: string
): MessageTemplate | undefined => {
  return templates.find((template) => template.shortcut === shortcut);
};

/**
 * Обновить счетчик использования шаблона
 */
export const updateTemplateUsage = (
  templates: MessageTemplate[],
  templateId: string
): MessageTemplate[] => {
  return templates.map((template) => {
    if (template.id === templateId) {
      return {
        ...template,
        usageCount: template.usageCount + 1,
        lastUsed: new Date().toISOString(),
      };
    }
    return template;
  });
};

/**
 * Получить самые используемые шаблоны
 */
export const getMostUsedTemplates = (
  templates: MessageTemplate[],
  limit: number = 5
): MessageTemplate[] => {
  return [...templates]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
};
