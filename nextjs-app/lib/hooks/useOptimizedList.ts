/**
 * Хук для оптимизированного рендеринга больших списков
 * Использует виртуализацию для минимизации количества DOM элементов
 * Requirements: 10.1, 10.2, 10.3
 */

import { useMemo, useCallback, useState, useEffect } from 'react';

interface UseOptimizedListOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number; // Количество элементов для рендеринга за пределами видимой области
}

interface OptimizedListState {
  visibleStartIndex: number;
  visibleEndIndex: number;
  offsetY: number;
}

/**
 * Хук для виртуализации списков
 * Рендерит только видимые элементы для оптимизации производительности
 * Requirements: 10.1, 10.2, 10.3
 */
export function useOptimizedList<T>(
  items: T[],
  options: UseOptimizedListOptions
) {
  const { itemHeight, containerHeight, overscan = 3 } = options;
  const [scrollTop, setScrollTop] = useState(0);

  // Вычисляем видимый диапазон элементов
  const visibleRange = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      startIndex + visibleCount + overscan * 2
    );

    return {
      visibleStartIndex: startIndex,
      visibleEndIndex: endIndex,
      offsetY: startIndex * itemHeight,
    };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  // Получаем только видимые элементы
  const visibleItems = useMemo(() => {
    return items.slice(
      visibleRange.visibleStartIndex,
      visibleRange.visibleEndIndex
    );
  }, [items, visibleRange.visibleStartIndex, visibleRange.visibleEndIndex]);

  // Обработчик скролла
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);

  return {
    visibleItems,
    visibleRange,
    handleScroll,
    totalHeight: items.length * itemHeight,
  };
}

/**
 * Хук для мемоизации элементов списка
 * Предотвращает ненужные re-renders при изменении других пропсов
 * Requirements: 10.2
 */
export function useMemoizedListItems<T>(
  items: T[],
  renderItem: (item: T, index: number) => React.ReactNode,
  dependencies: any[] = []
) {
  return useMemo(() => {
    return items.map((item, index) => renderItem(item, index));
  }, [items, renderItem, ...dependencies]);
}

/**
 * Хук для дебаунса скролла
 * Уменьшает количество обновлений при скролле
 * Requirements: 10.3
 */
export function useDebouncedScroll(
  callback: (scrollTop: number) => void,
  delay: number = 100
) {
  const [scrollTop, setScrollTop] = useState(0);
  const timeoutRef = useCallback(
    (scrollValue: number) => {
      const timeout = setTimeout(() => {
        callback(scrollValue);
      }, delay);

      return () => clearTimeout(timeout);
    },
    [callback, delay]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);
      timeoutRef(target.scrollTop);
    },
    [timeoutRef]
  );

  return { scrollTop, handleScroll };
}

/**
 * Хук для отслеживания видимости элемента
 * Используется для ленивой загрузки контента
 * Requirements: 10.1, 10.2
 */
export function useIntersectionObserver(
  ref: React.RefObject<HTMLElement>,
  options: IntersectionObserverInit = {}
) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [ref, options]);

  return isVisible;
}

/**
 * Хук для оптимизации рендеринга с использованием requestAnimationFrame
 * Синхронизирует обновления с частотой обновления экрана
 * Requirements: 10.3
 */
export function useRAFState<T>(initialValue: T) {
  const [state, setState] = useState(initialValue);
  const rafRef = useCallback((newValue: T) => {
    requestAnimationFrame(() => {
      setState(newValue);
    });
  }, []);

  return [state, rafRef] as const;
}
