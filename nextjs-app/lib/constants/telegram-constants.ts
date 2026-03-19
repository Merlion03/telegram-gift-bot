/**
 * Константы для Telegram-темы и компонентов
 */

/**
 * Цветовые константы
 */
export const TELEGRAM_COLORS = {
  BLUE: '#2481cc',
  LIGHT_BLUE: '#64b5ef',
  DARK_BLUE: '#1c5a85',
  GREEN: '#4dcd5e',
  RED: '#e53e3e',
  YELLOW: '#f5a623',
  ACCENT: '#64b5ef',
  BG: '#ffffff',
  SIDEBAR: '#f4f4f5',
  CHAT: '#f8fafc',
  INPUT_BG: '#f0f0f0',
  TEXT: '#000000',
  SECONDARY: '#6b7280',
  TERTIARY: '#9ca3af',
  BORDER: '#e5e7eb',
} as const;

/**
 * Темные цвета
 */
export const DARK_TELEGRAM_COLORS = {
  BLUE: '#2481cc',
  LIGHT_BLUE: '#64b5ef',
  DARK_BLUE: '#1c5a85',
  GREEN: '#4dcd5e',
  RED: '#e53e3e',
  YELLOW: '#f5a623',
  ACCENT: '#64b5ef',
  BG: '#212d3b',
  SIDEBAR: '#17212b',
  CHAT: '#0e1621',
  INPUT_BG: '#2f3b4c',
  TEXT: '#ffffff',
  SECONDARY: '#8596a8',
  TERTIARY: '#708499',
  BORDER: '#2f3b4c',
} as const;

/**
 * Размеры и отступы
 */
export const TELEGRAM_SIZES = {
  BORDER_RADIUS: '12px',
  BORDER_RADIUS_LG: '16px',
  BORDER_RADIUS_XL: '20px',
  SPACING: '12px',
  SPACING_LG: '16px',
  SPACING_XL: '20px',
  ICON_SIZE_SM: '16px',
  ICON_SIZE_MD: '24px',
  ICON_SIZE_LG: '32px',
  ICON_SIZE_XL: '48px',
} as const;

/**
 * Длительности анимаций
 */
export const ANIMATION_DURATIONS = {
  FAST: 150,
  NORMAL: 200,
  SLOW: 300,
  VERY_SLOW: 500,
} as const;

/**
 * Классы CSS для анимаций
 */
export const ANIMATION_CLASSES = {
  SLIDE_IN_RIGHT: 'animate-slide-in-right',
  SLIDE_IN_LEFT: 'animate-slide-in-left',
  SLIDE_IN_TOP: 'animate-slide-in-top',
  SLIDE_IN_BOTTOM: 'animate-slide-in-bottom',
  FADE_IN: 'animate-fade-in',
  SCALE_IN: 'animate-scale-in',
  MENU_SLIDE_IN: 'animate-menu-slide-in',
  PULSE: 'animate-pulse',
} as const;

/**
 * Классы CSS для компонентов
 */
export const COMPONENT_CLASSES = {
  BUTTON: 'telegram-button',
  BUTTON_SECONDARY: 'telegram-button-secondary',
  BUTTON_GHOST: 'telegram-button-ghost',
  INPUT: 'telegram-input',
  TEXTAREA: 'telegram-textarea',
  CARD: 'telegram-card',
  BADGE: 'telegram-badge',
  SHADOW: 'telegram-shadow',
  SHADOW_LG: 'telegram-shadow-lg',
  DIVIDER: 'telegram-divider',
  STATUS_INDICATOR: 'telegram-status-indicator',
  STATUS_ONLINE: 'telegram-status-online',
  STATUS_AWAY: 'telegram-status-away',
  STATUS_OFFLINE: 'telegram-status-offline',
} as const;

/**
 * Статусы сессий
 */
export const SESSION_STATUSES = {
  NEW: 'new',
  ACTIVE: 'active',
  CLOSED: 'closed',
  AWAY: 'away',
} as const;

/**
 * Фильтры для сессий
 */
export const SESSION_FILTERS = {
  ALL: 'all',
  NEW: 'new',
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;

/**
 * Статусы онлайн
 */
export const ONLINE_STATUSES = {
  ONLINE: 'online',
  AWAY: 'away',
  OFFLINE: 'offline',
} as const;

/**
 * Категории шаблонов
 */
export const TEMPLATE_CATEGORIES = {
  GREETING: 'greeting',
  SUPPORT: 'support',
  CLOSING: 'closing',
  CUSTOM: 'custom',
} as const;

/**
 * Типы вложений
 */
export const ATTACHMENT_TYPES = {
  IMAGE: 'image',
  FILE: 'file',
  VIDEO: 'video',
  AUDIO: 'audio',
} as const;

/**
 * Максимальные размеры
 */
export const MAX_SIZES = {
  MESSAGE_LENGTH: 4096,
  NOTE_LENGTH: 1000,
  FILE_SIZE: 50 * 1024 * 1024, // 50 MB
  AVATAR_SIZE: 5 * 1024 * 1024, // 5 MB
} as const;

/**
 * Точки останова для адаптивности
 */
export const BREAKPOINTS = {
  MOBILE: 480,
  TABLET: 768,
  DESKTOP: 1024,
  WIDE: 1280,
} as const;

/**
 * Сообщения об ошибках
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Ошибка сети. Пожалуйста, проверьте подключение.',
  SERVER_ERROR: 'Ошибка сервера. Пожалуйста, попробуйте позже.',
  VALIDATION_ERROR: 'Ошибка валидации. Пожалуйста, проверьте данные.',
  NOT_FOUND: 'Ресурс не найден.',
  UNAUTHORIZED: 'Вы не авторизованы.',
  FORBIDDEN: 'Доступ запрещен.',
  TIMEOUT: 'Время ожидания истекло.',
} as const;

/**
 * Сообщения об успехе
 */
export const SUCCESS_MESSAGES = {
  MESSAGE_SENT: 'Сообщение отправлено.',
  NOTE_ADDED: 'Заметка добавлена.',
  SESSION_UPDATED: 'Сессия обновлена.',
  SETTINGS_SAVED: 'Настройки сохранены.',
} as const;

/**
 * Иконки lucide-react для использования
 */
export const LUCIDE_ICONS = {
  USERS: 'Users',
  SEARCH: 'Search',
  SEND: 'Send',
  PAPERCLIP: 'Paperclip',
  SMILE: 'Smile',
  FILE_TEXT: 'FileText',
  MENU: 'Menu',
  X: 'X',
  CHEVRON_DOWN: 'ChevronDown',
  CHEVRON_UP: 'ChevronUp',
  CHEVRON_LEFT: 'ChevronLeft',
  CHEVRON_RIGHT: 'ChevronRight',
  BELL: 'Bell',
  BELL_OFF: 'BellOff',
  SETTINGS: 'Settings',
  LOGOUT: 'LogOut',
  CIRCLE: 'Circle',
  CHECK_CIRCLE: 'CheckCircle',
  ALERT_CIRCLE: 'AlertCircle',
  INFO: 'Info',
  TRASH_2: 'Trash2',
  EDIT: 'Edit',
  COPY: 'Copy',
  EXTERNAL_LINK: 'ExternalLink',
  LOADER: 'Loader',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
} as const;

/**
 * Значения по умолчанию
 */
export const DEFAULTS = {
  DEBOUNCE_DELAY: 300,
  SEARCH_MIN_LENGTH: 2,
  MESSAGES_PER_PAGE: 50,
  SESSIONS_PER_PAGE: 20,
  AVATAR_SIZE: 40,
  AVATAR_SIZE_LG: 64,
  AVATAR_SIZE_XL: 96,
} as const;

/**
 * Регулярные выражения
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL: /(https?:\/\/[^\s]+)/g,
  PHONE: /^[\d\s\-\+\(\)]+$/,
  USERNAME: /^[a-zA-Z0-9_]{5,32}$/,
} as const;
