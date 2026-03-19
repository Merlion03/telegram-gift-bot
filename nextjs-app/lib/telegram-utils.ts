/**
 * Утилиты для работы с Telegram-стилями и анимациями
 */

export const telegramColors = {
  blue: '#2481cc',
  lightBlue: '#64b5ef',
  darkBlue: '#1c5a85',
  green: '#4dcd5e',
  red: '#e53e3e',
  yellow: '#f5a623',
  accent: '#64b5ef',
  bg: '#ffffff',
  sidebar: '#f4f4f5',
  chat: '#f8fafc',
  text: '#000000',
  secondary: '#6b7280',
  tertiary: '#9ca3af',
  border: '#e5e7eb',
} as const;

export const darkTelegramColors = {
  blue: '#2481cc',
  lightBlue: '#64b5ef',
  darkBlue: '#1c5a85',
  green: '#4dcd5e',
  red: '#e53e3e',
  yellow: '#f5a623',
  accent: '#64b5ef',
  bg: '#212d3b',
  sidebar: '#17212b',
  chat: '#0e1621',
  text: '#ffffff',
  secondary: '#8596a8',
  tertiary: '#708499',
  border: '#2f3b4c',
} as const;

/**
 * Генерирует аватар из первой буквы имени
 */
export const generateAvatarLetter = (name: string): string => {
  if (!name || name.length === 0) return '?';
  return name.charAt(0).toUpperCase();
};

/**
 * Генерирует цвет градиента для аватара на основе строки
 */
export const createTelegramGradient = (seed: string): string => {
  const gradients = [
    'linear-gradient(135deg, #2481cc 0%, #64b5ef 100%)',
    'linear-gradient(135deg, #4dcd5e 0%, #7ed321 100%)',
    'linear-gradient(135deg, #e53e3e 0%, #ff6b6b 100%)',
    'linear-gradient(135deg, #9013fe 0%, #bd10e0 100%)',
    'linear-gradient(135deg, #f5a623 0%, #f8e71c 100%)',
    'linear-gradient(135deg, #00b4d8 0%, #0096c7 100%)',
    'linear-gradient(135deg, #ff006e 0%, #fb5607 100%)',
    'linear-gradient(135deg, #8338ec 0%, #3a86ff 100%)',
  ];

  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % gradients.length;

  return gradients[index];
};

/**
 * Возвращает цвет статуса на основе типа
 */
export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'new':
    case 'новая':
      return 'bg-telegram-blue';
    case 'active':
    case 'активная':
      return 'bg-telegram-green';
    case 'closed':
    case 'закрытая':
      return 'bg-telegram-secondary';
    case 'away':
    case 'отсутствует':
      return 'bg-telegram-yellow';
    default:
      return 'bg-telegram-secondary';
  }
};

/**
 * Возвращает цвет статуса онлайн
 */
export const getOnlineStatusColor = (online: boolean): string => {
  return online ? 'bg-telegram-green' : 'bg-telegram-tertiary';
};

/**
 * Форматирует время в относительный формат
 */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;

  return date.toLocaleDateString('ru-RU');
};

/**
 * Форматирует время в формат HH:MM
 */
export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Форматирует дату в формат DD.MM.YYYY
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/**
 * Проверяет, находится ли дата в сегодня
 */
export const isToday = (dateString: string): boolean => {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

/**
 * Проверяет, находится ли дата вчера
 */
export const isYesterday = (dateString: string): boolean => {
  const date = new Date(dateString);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  );
};

/**
 * Форматирует дату для отображения в чате
 */
export const formatChatDate = (dateString: string): string => {
  if (isToday(dateString)) {
    return 'Сегодня';
  }
  if (isYesterday(dateString)) {
    return 'Вчера';
  }
  return formatDate(dateString);
};

/**
 * Группирует сообщения по датам
 */
export interface MessageGroup {
  date: string;
  formattedDate: string;
  messages: any[];
}

export const groupMessagesByDate = (messages: any[]): MessageGroup[] => {
  const groups: { [key: string]: any[] } = {};

  messages.forEach((message) => {
    const date = new Date(message.created_at).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
  });

  return Object.entries(groups).map(([date, messages]) => ({
    date,
    formattedDate: formatChatDate(messages[0].created_at),
    messages,
  }));
};

/**
 * Обрезает текст до определенной длины с многоточием
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Проверяет, является ли строка URL
 */
export const isUrl = (text: string): boolean => {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * Извлекает URL из текста
 */
export const extractUrls = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches || [];
};

/**
 * Форматирует размер файла в читаемый формат
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Б';

  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Генерирует уникальный ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Возвращает класс CSS для анимации сообщения
 */
export const getMessageAnimationClass = (isOutgoing: boolean): string => {
  return isOutgoing ? 'animate-slide-in-right' : 'animate-slide-in-left';
};

/**
 * Возвращает класс CSS для статуса
 */
export const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'new':
    case 'новая':
      return 'telegram-badge-blue';
    case 'active':
    case 'активная':
      return 'telegram-badge-green';
    case 'closed':
    case 'закрытая':
      return 'telegram-badge-red';
    case 'away':
    case 'отсутствует':
      return 'telegram-badge-yellow';
    default:
      return 'telegram-badge-blue';
  }
};

/**
 * Проверяет, нужно ли показывать аватар отправителя
 * (показываем, если это первое сообщение или отправитель изменился)
 */
export const shouldShowAvatar = (
  currentMessage: any,
  previousMessage: any | null
): boolean => {
  if (!previousMessage) return true;
  return currentMessage.sender_id !== previousMessage.sender_id;
};

/**
 * Проверяет, нужно ли показывать время сообщения
 * (показываем, если это последнее сообщение или прошло более 5 минут)
 */
export const shouldShowTime = (
  currentMessage: any,
  nextMessage: any | null
): boolean => {
  if (!nextMessage) return true;

  const currentTime = new Date(currentMessage.created_at).getTime();
  const nextTime = new Date(nextMessage.created_at).getTime();
  const diffMins = (nextTime - currentTime) / 60000;

  return diffMins > 5 || currentMessage.sender_id !== nextMessage.sender_id;
};

/**
 * Возвращает класс для контейнера сообщения
 */
export const getMessageContainerClass = (isOutgoing: boolean): string => {
  return isOutgoing ? 'justify-end' : 'justify-start';
};

/**
 * Возвращает класс для пузыря сообщения
 */
export const getMessageBubbleClass = (isOutgoing: boolean): string => {
  if (isOutgoing) {
    return 'bg-telegram-blue text-white rounded-3xl rounded-tr-lg';
  }
  return 'bg-telegram-sidebar text-telegram-text rounded-3xl rounded-tl-lg';
};

/**
 * Проверяет, содержит ли текст эмодзи
 */
export const hasEmoji = (text: string): boolean => {
  const emojiRegex =
    /(\u00d7|\u20e3|[\u2600-\u27BF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2300-\u23FF]|[\u2D00-\u2D2F]|[\u2B50-\u2B55])/g;
  return emojiRegex.test(text);
};

/**
 * Возвращает класс для контейнера на основе размера экрана
 */
export const getResponsiveClass = (
  mobileClass: string,
  tabletClass: string,
  desktopClass: string
): string => {
  return `${mobileClass} md:${tabletClass} lg:${desktopClass}`;
};

/**
 * Проверяет, является ли экран мобильным
 */
export const isMobileScreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
};

/**
 * Проверяет, является ли экран планшетом
 */
export const isTabletScreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 768 && window.innerWidth < 1024;
};

/**
 * Проверяет, является ли экран десктопом
 */
export const isDesktopScreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 1024;
};
