/**
 * Типы для Telegram-компонентов и утилит
 */

/**
 * Статусы сессии поддержки
 */
export type SessionStatus = 'new' | 'active' | 'closed' | 'away';

/**
 * Фильтры для списка сессий
 */
export type SessionFilter = 'all' | 'new' | 'active' | 'closed';

/**
 * Статусы онлайн
 */
export type OnlineStatus = 'online' | 'away' | 'offline';

/**
 * Категории шаблонов сообщений
 */
export type TemplateCategory = 'greeting' | 'support' | 'closing' | 'custom';

/**
 * Интерфейс для сессии поддержки
 */
export interface SupportSession {
  id: number;
  telegram_id: number;
  session_type: 'chat' | 'support';
  status: SessionStatus;
  created_at: string;
  last_message_at?: string;
  last_message?: string;
  unread_count?: number;
  user_avatar?: string;
  user_name?: string;
  user_username?: string;
  user_online?: boolean;
  priority?: boolean;
  assigned_operator?: string;
}

/**
 * Интерфейс для сообщения
 */
export interface SupportMessage {
  id: number;
  session_id: number;
  sender_id: number;
  sender_type: 'user' | 'operator';
  text: string;
  created_at: string;
  updated_at?: string;
  read_at?: string;
  attachments?: MessageAttachment[];
}

/**
 * Интерфейс для вложения в сообщение
 */
export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Интерфейс для информации о пользователе
 */
export interface UserInfo {
  telegramId: number;
  username?: string;
  phone?: string;
  email?: string;
  avatar: string;
  name: string;
  online: boolean;
  lastSeen?: string;
  firstContact: string;
  totalMessages: number;
  notes: InternalNote[];
  preferences: UserPreferences;
}

/**
 * Интерфейс для внутренней заметки администратора
 */
export interface InternalNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  category?: string;
}

/**
 * Интерфейс для предпочтений пользователя
 */
export interface UserPreferences {
  notifications: boolean;
  language: string;
  timezone: string;
}

/**
 * Интерфейс для шаблона сообщения
 */
export interface MessageTemplate {
  id: string;
  text: string;
  category: TemplateCategory;
  shortcut?: string;
  usageCount: number;
  lastUsed?: string;
}

/**
 * Интерфейс для группировки сообщений по датам
 */
export interface MessageGroup {
  date: string;
  formattedDate: string;
  messages: SupportMessage[];
}

/**
 * Интерфейс для статистики
 */
export interface AdminStats {
  total: number;
  new: number;
  active: number;
  closed: number;
  unreadMessages: number;
}

/**
 * Интерфейс для пропсов Header компонента
 */
export interface HeaderProps {
  stats: AdminStats;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onUserMenuAction: (action: string) => void;
  userName?: string;
  userAvatar?: string;
}

/**
 * Интерфейс для пропсов Sidebar компонента
 */
export interface SidebarProps {
  sessions: SupportSession[];
  selectedSession: SupportSession | null;
  onSelectSession: (session: SupportSession) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: SessionFilter;
  onFilterChange: (filter: SessionFilter) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Интерфейс для пропсов ChatWindow компонента
 */
export interface ChatWindowProps {
  session: SupportSession;
  messages: SupportMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onLoadMoreMessages: () => Promise<void>;
  loading?: boolean;
}

/**
 * Интерфейс для пропсов UserPanel компонента
 */
export interface UserPanelProps {
  user: UserInfo;
  session: SupportSession;
  onAddNote: (note: string) => Promise<void>;
  onToggleNotifications: (enabled: boolean) => void;
  onOpenTelegramProfile: () => void;
}

/**
 * Интерфейс для пропсов MessageInput компонента
 */
export interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => Promise<void>;
  onAttachFile: () => void;
  onSelectTemplate: (template: string) => void;
  disabled?: boolean;
  maxLength?: number;
  templates: MessageTemplate[];
  loading?: boolean;
}

/**
 * Интерфейс для ошибки
 */
export interface ErrorInfo {
  code: string;
  message: string;
  details?: string;
}

/**
 * Интерфейс для состояния загрузки
 */
export interface LoadingState {
  isLoading: boolean;
  error?: ErrorInfo;
  progress?: number;
}

/**
 * Интерфейс для контекста админки
 */
export interface AdminContextType {
  sessions: SupportSession[];
  selectedSession: SupportSession | null;
  messages: SupportMessage[];
  stats: AdminStats;
  loading: LoadingState;
  selectSession: (session: SupportSession) => void;
  sendMessage: (text: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  updateSession: (session: SupportSession) => void;
  deleteSession: (sessionId: number) => void;
}
