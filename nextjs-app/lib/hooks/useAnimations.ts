/**
 * Хуки для управления анимациями в стиле Telegram
 */

import { useEffect, useRef } from 'react';

/**
 * Хук для управления анимацией появления элемента слева
 */
export const useSlideInAnimation = (dependency: any) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.classList.add('animate-slide-in-left');
    }
  }, [dependency]);

  return ref;
};

/**
 * Хук для управления анимацией появления элемента справа
 */
export const useSlideInRightAnimation = (dependency: any) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.classList.add('animate-slide-in-right');
    }
  }, [dependency]);

  return ref;
};

/**
 * Хук для управления эффектом масштабирования при наведении
 */
export const useHoverScale = () => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseEnter = () => {
      element.style.transform = 'scale(1.02)';
      element.style.transition = 'transform 0.2s ease-out';
    };

    const handleMouseLeave = () => {
      element.style.transform = 'scale(1)';
    };

    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return ref;
};

/**
 * Хук для управления эффектом поднятия при наведении
 */
export const useHoverLift = () => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseEnter = () => {
      element.style.transform = 'translateY(-2px)';
      element.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)';
      element.style.transition = 'all 0.2s ease-out';
    };

    const handleMouseLeave = () => {
      element.style.transform = 'translateY(0)';
      element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)';
    };

    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return ref;
};

/**
 * Хук для управления анимацией появления меню
 */
export const useMenuAnimation = (isOpen: boolean) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (isOpen) {
      ref.current.classList.add('animate-menu-slide-in');
      ref.current.classList.remove('hidden');
    } else {
      ref.current.classList.add('hidden');
      ref.current.classList.remove('animate-menu-slide-in');
    }
  }, [isOpen]);

  return ref;
};

/**
 * Хук для управления анимацией появления элемента с задержкой
 */
export const useDelayedAnimation = (delay: number = 0) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const timer = setTimeout(() => {
      ref.current?.classList.add('animate-fade-in');
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return ref;
};

/**
 * Хук для управления анимацией пульсации
 */
export const usePulseAnimation = (shouldPulse: boolean = true) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (shouldPulse) {
      ref.current.classList.add('animate-pulse');
    } else {
      ref.current.classList.remove('animate-pulse');
    }
  }, [shouldPulse]);

  return ref;
};

/**
 * Хук для управления анимацией сворачивания/разворачивания
 */
export const useCollapseAnimation = (isCollapsed: boolean) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (isCollapsed) {
      ref.current.style.maxHeight = '0';
      ref.current.style.overflow = 'hidden';
      ref.current.style.opacity = '0';
    } else {
      ref.current.style.maxHeight = ref.current.scrollHeight + 'px';
      ref.current.style.overflow = 'visible';
      ref.current.style.opacity = '1';
    }

    ref.current.style.transition = 'all 0.3s ease-out';
  }, [isCollapsed]);

  return ref;
};

/**
 * Хук для управления анимацией загрузки (скелетон)
 */
export const useSkeletonAnimation = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.classList.add('animate-pulse');
    }
  }, []);

  return ref;
};

/**
 * Хук для управления анимацией появления с эффектом масштабирования
 */
export const useScaleInAnimation = (dependency: any) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.classList.add('animate-scale-in');
    }
  }, [dependency]);

  return ref;
};
