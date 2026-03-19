/**
 * Константы для оптимизации производительности
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

/**
 * Размеры для виртуализации списков
 */
export const VIRTUALIZATION_CONFIG = {
  // Высота одного элемента в списке сессий (в пиксельях)
  SESSION_ITEM_HEIGHT: 72,
  
  // Высота одного элемента в списке сообщений (в пиксельях)
  MESSAGE_ITEM_HEIGHT: 60,
  
  // Количество элементов для рендеринга за пределами видимой области
  OVERSCAN_COUNT: 5,
  
  // Максимальное количество элементов для рендеринга без виртуализации
  VIRTUALIZATION_THRESHOLD: 50,
} as const;

/**
 * Конфигурация для дебаунса и throttle
 */
export const DEBOUNCE_CONFIG = {
  // Задержка для поиска (в миллисекундах)
  SEARCH_DELAY: 300,
  
  // Задержка для скролла (в миллисекундах)
  SCROLL_DELAY: 100,
  
  // Задержка для изменения размера окна (в миллисекундах)
  RESIZE_DELAY: 200,
  
  // Задержка для автосохранения (в миллисекундах)
  AUTOSAVE_DELAY: 1000,
} as const;

/**
 * Конфигурация для кэширования
 */
export const CACHE_CONFIG = {
  // Время жизни кэша сессий (в миллисекундах)
  SESSIONS_CACHE_TTL: 5 * 60 * 1000, // 5 минут
  
  // Время жизни кэша сообщений (в миллисекундах)
  MESSAGES_CACHE_TTL: 10 * 60 * 1000, // 10 минут
  
  // Время жизни кэша пользователей (в миллисекундах)
  USERS_CACHE_TTL: 15 * 60 * 1000, // 15 минут
  
  // Максимальный размер кэша (в элементах)
  MAX_CACHE_SIZE: 1000,
} as const;

/**
 * Конфигурация для анимаций
 */
export const ANIMATION_CONFIG = {
  // Использовать GPU-ускорение для анимаций
  USE_GPU_ACCELERATION: true,
  
  // Отключить анимации на мобильных устройствах для экономии батареи
  DISABLE_ANIMATIONS_ON_MOBILE: false,
  
  // Использовать will-change для оптимизации
  USE_WILL_CHANGE: true,
  
  // Длительность анимаций (в миллисекундах)
  ANIMATION_DURATION: 300,
  
  // Длительность быстрых анимаций (в миллисекундах)
  FAST_ANIMATION_DURATION: 150,
} as const;

/**
 * Конфигурация для загрузки изображений
 */
export const IMAGE_CONFIG = {
  // Использовать lazy loading для изображений
  USE_LAZY_LOADING: true,
  
  // Использовать WebP формат если поддерживается
  USE_WEBP: true,
  
  // Размер аватара (в пиксельях)
  AVATAR_SIZE: 48,
  
  // Размер большого аватара (в пиксельях)
  LARGE_AVATAR_SIZE: 96,
} as const;

/**
 * Конфигурация для пагинации
 */
export const PAGINATION_CONFIG = {
  // Количество элементов на странице для сессий
  SESSIONS_PER_PAGE: 50,
  
  // Количество элементов на странице для сообщений
  MESSAGES_PER_PAGE: 50,
  
  // Количество элементов для предзагрузки
  PRELOAD_COUNT: 10,
} as const;

/**
 * Конфигурация для оптимизации CSS
 */
export const CSS_OPTIMIZATION = {
  // Использовать CSS containment для оптимизации
  USE_CONTAINMENT: true,
  
  // Использовать CSS Grid вместо Flexbox где возможно
  USE_GRID: true,
  
  // Минимизировать использование box-shadow
  MINIMIZE_SHADOWS: false,
  
  // Использовать transform вместо top/left для анимаций
  USE_TRANSFORM: true,
} as const;

/**
 * Конфигурация для мониторинга производительности
 */
export const PERFORMANCE_MONITORING = {
  // Включить мониторинг производительности
  ENABLED: process.env.NODE_ENV === 'development',
  
  // Пороговое значение для медленных операций (в миллисекундах)
  SLOW_OPERATION_THRESHOLD: 100,
  
  // Пороговое значение для медленного рендеринга (в миллисекундах)
  SLOW_RENDER_THRESHOLD: 16, // 60 FPS
  
  // Логировать все операции
  LOG_ALL_OPERATIONS: false,
} as const;

/**
 * Функция для получения оптимальной конфигурации на основе размера экрана
 */
export function getResponsivePerformanceConfig(screenWidth: number) {
  if (screenWidth < 480) {
    // Мобильные устройства - более агрессивная оптимизация
    return {
      ...VIRTUALIZATION_CONFIG,
      OVERSCAN_COUNT: 2,
      VIRTUALIZATION_THRESHOLD: 30,
    };
  } else if (screenWidth < 768) {
    // Планшеты - средняя оптимизация
    return {
      ...VIRTUALIZATION_CONFIG,
      OVERSCAN_COUNT: 3,
      VIRTUALIZATION_THRESHOLD: 40,
    };
  } else {
    // Десктопы - стандартная оптимизация
    return VIRTUALIZATION_CONFIG;
  }
}

/**
 * Функция для получения оптимальной конфигурации на основе производительности устройства
 */
export function getDevicePerformanceConfig() {
  // Проверяем, поддерживает ли устройство requestIdleCallback
  const supportsIdleCallback = typeof requestIdleCallback !== 'undefined';
  
  // Проверяем, поддерживает ли устройство IntersectionObserver
  const supportsIntersectionObserver = typeof IntersectionObserver !== 'undefined';
  
  return {
    supportsIdleCallback,
    supportsIntersectionObserver,
    // Если устройство не поддерживает современные API, используем более консервативные настройки
    useConservativeSettings: !supportsIdleCallback || !supportsIntersectionObserver,
  };
}
