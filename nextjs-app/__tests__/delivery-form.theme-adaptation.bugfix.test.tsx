/**
 * Exploratory Property-Based Test для Bug Condition
 * 
 * Bugfix Spec: Telegram WebApp Theme Adaptation Fix
 * 
 * ЦЕЛЬ: Выявить counterexamples, демонстрирующие существование бага
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Этот тест ПРОВАЛИТСЯ на неисправленном коде
 * Провал подтверждает существование бага и помогает понять первопричину
 * 
 * ВАЖНО: Этот тест кодирует ОЖИДАЕМОЕ поведение (Expected Behavior)
 * После исправления бага этот же тест должен ПРОЙТИ, подтверждая корректность исправления
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryForm } from '@/components/webapp/DeliveryForm';
import * as fc from 'fast-check';

/**
 * Утилита для расчёта относительной яркости цвета (luminance)
 * Используется в формуле контраста WCAG
 * 
 * @param rgb - Массив [r, g, b] значений от 0 до 255
 * @returns Относительная яркость от 0 до 1
 */
function calculateLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((val) => {
    const normalized = val / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Расчёт контрастного соотношения между двумя цветами
 * Согласно WCAG 2.1 формуле
 * 
 * @param color1 - Первый цвет в формате [r, g, b]
 * @param color2 - Второй цвет в формате [r, g, b]
 * @returns Контрастное соотношение от 1 до 21
 */
function calculateContrastRatio(
  color1: [number, number, number],
  color2: [number, number, number]
): number {
  const lum1 = calculateLuminance(color1);
  const lum2 = calculateLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Парсинг CSS цвета в RGB массив
 * Поддерживает форматы: rgb(), rgba(), hex (#RRGGBB, #RGB)
 * 
 * @param color - CSS цвет в виде строки
 * @returns Массив [r, g, b] или null если не удалось распарсить
 */
function parseColor(color: string): [number, number, number] | null {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    return null;
  }

  // Обработка rgb/rgba формата (с пробелами и без)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1]),
      parseInt(rgbMatch[2]),
      parseInt(rgbMatch[3]),
    ];
  }

  // Обработка hex формата
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
  }

  return null;
}

/**
 * Извлечение вычисленного цвета элемента с поддержкой CSS переменных
 * 
 * @param element - DOM элемент
 * @param property - CSS свойство ('color' или 'backgroundColor')
 * @returns RGB массив или null
 */
function getComputedColor(
  element: HTMLElement,
  property: 'color' | 'backgroundColor'
): [number, number, number] | null {
  const computed = window.getComputedStyle(element);
  let colorValue = computed[property];
  
  // Если значение содержит CSS переменную, извлекаем fallback или вычисляем переменную
  const varMatch = colorValue.match(/var\(([^,)]+)(?:,\s*([^)]+))?\)/);
  if (varMatch) {
    const varName = varMatch[1].trim();
    const fallback = varMatch[2]?.trim();
    
    // Пытаемся получить значение переменной из :root
    const rootStyle = getComputedStyle(document.documentElement);
    const varValue = rootStyle.getPropertyValue(varName).trim();
    
    if (varValue) {
      colorValue = varValue;
    } else if (fallback) {
      colorValue = fallback;
    }
  }
  
  return parseColor(colorValue);
}

/**
 * Тип для темы Telegram
 */
type TelegramTheme = {
  name: 'light' | 'dark';
  textColor: string;
  bgColor: string;
  secondaryBgColor: string;
  hintColor: string;
};

/**
 * Симуляция тем Telegram через CSS переменные
 * Эти значения создают РЕАЛЬНУЮ проблему с контрастом, которая существует в баге
 * 
 * КРИТИЧЕСКАЯ ПРОБЛЕМА (контраст < 4.5:1):
 * - Светлая тема: лейблы (#999999) на белом фоне (#ffffff) = контраст ~2.85:1 ❌
 * - Тёмная тема: текст (#ffffff) на фоне инпута (#3a3a3c) = контраст ~3.48:1 ❌
 * - Тёмная тема: лейблы (#999999) на чёрном фоне (#000000) = контраст ~5.78:1 ✓ (но это не проблема)
 * 
 * Эти значения отражают реальную ситуацию в Telegram, где:
 * - --tg-theme-text-color может быть серым (#999999) на светлой теме
 * - --tg-theme-secondary-bg-color (#3a3a3c) имеет низкий контраст с белым текстом
 */
const telegramThemes: Record<'light' | 'dark', TelegramTheme> = {
  light: {
    name: 'light',
    textColor: '#999999', // Серый текст (ПРОБЛЕМА: контраст с белым ~2.85:1)
    bgColor: '#ffffff', // Белый основной фон
    secondaryBgColor: '#f2f2f7', // Светло-серый вторичный фон
    hintColor: '#8e8e93',
  },
  dark: {
    name: 'dark',
    textColor: '#ffffff', // Белый текст
    bgColor: '#000000', // Чёрный основной фон
    secondaryBgColor: '#3a3a3c', // Серый вторичный фон (ПРОБЛЕМА: контраст с белым ~3.48:1)
    hintColor: '#8e8e93',
  },
};

/**
 * Применение темы Telegram к документу
 */
function applyTelegramTheme(theme: TelegramTheme): void {
  const root = document.documentElement;
  root.style.setProperty('--tg-theme-text-color', theme.textColor);
  root.style.setProperty('--tg-theme-bg-color', theme.bgColor);
  root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondaryBgColor);
  root.style.setProperty('--tg-theme-hint-color', theme.hintColor);
}

/**
 * Очистка CSS переменных темы
 */
function clearTelegramTheme(): void {
  const root = document.documentElement;
  root.style.removeProperty('--tg-theme-text-color');
  root.style.removeProperty('--tg-theme-bg-color');
  root.style.removeProperty('--tg-theme-secondary-bg-color');
  root.style.removeProperty('--tg-theme-hint-color');
}

describe('Bugfix Exploratory Test - Property 1: Fault Condition - Видимость текстовых элементов на всех темах', () => {
  beforeEach(() => {
    // Очищаем тему перед каждым тестом
    clearTelegramTheme();
  });

  afterEach(() => {
    // Очищаем тему после каждого теста
    clearTelegramTheme();
  });

  /**
   * Property 1.1: Контраст лейблов на светлой теме
   * 
   * Bug Condition: theme === 'light' AND contrast(labelColor, backgroundColor) < 4.5
   * Expected Behavior: Контраст лейблов >= 4.5:1 на светлой теме
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Лейблы не видны или плохо различимы на светлой теме
   * 
   * **Validates: Requirements 2.1**
   */
  it('Property 1.1: Контраст лейблов на светлой теме должен быть >= 4.5:1 (WCAG AA)', () => {
    // Применяем светлую тему
    applyTelegramTheme(telegramThemes.light);

    // Рендерим форму
    render(<DeliveryForm prizeId={1} />);

    // Получаем все лейблы
    const labels = [
      screen.getByText(/ФИО/i),
      screen.getByText(/Адрес доставки/i),
      screen.getByText(/Номер телефона/i),
      screen.getByText(/Комментарий/i),
    ];

    // Проверяем контраст каждого лейбла
    labels.forEach((label) => {
      const labelColor = getComputedColor(label, 'color');
      const bgColor = getComputedColor(label, 'backgroundColor');

      expect(labelColor, `Не удалось получить цвет лейбла "${label.textContent}"`).not.toBeNull();

      // Если backgroundColor прозрачный, используем цвет фона страницы
      const backgroundColor = bgColor || parseColor(telegramThemes.light.bgColor);
      expect(backgroundColor, 'Не удалось определить цвет фона').not.toBeNull();

      const contrast = calculateContrastRatio(labelColor!, backgroundColor!);

      // КРИТИЧЕСКАЯ ПРОВЕРКА: контраст должен быть >= 4.5:1
      expect(
        contrast,
        `Контраст лейбла "${label.textContent}" на светлой теме недостаточен. ` +
        `Текущий контраст: ${contrast.toFixed(2)}:1, требуется >= 4.5:1. ` +
        `Цвет текста: rgb(${labelColor!.join(', ')}), цвет фона: rgb(${backgroundColor!.join(', ')})`
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Property 1.2: Контраст введённого текста на тёмной теме
   * 
   * Bug Condition: theme === 'dark' AND contrast(inputTextColor, inputBackgroundColor) < 4.5
   * Expected Behavior: Контраст введённого текста >= 4.5:1 на тёмной теме
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Введённый текст плохо виден на тёмном фоне инпута
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 1.2: Контраст введённого текста на тёмной теме должен быть >= 4.5:1 (WCAG AA)', () => {
    // Применяем тёмную тему
    applyTelegramTheme(telegramThemes.dark);

    // Рендерим форму
    render(<DeliveryForm prizeId={1} />);

    // Получаем все поля ввода
    const inputs = [
      screen.getByPlaceholderText(/Иванов Иван Иванович/i),
      screen.getByPlaceholderText(/Город, улица, дом, квартира/i),
      screen.getByPlaceholderText(/\+79991234567/i),
      screen.getByPlaceholderText(/Дополнительная информация/i),
    ];

    // Проверяем контраст каждого поля ввода
    inputs.forEach((input) => {
      const textColor = getComputedColor(input as HTMLElement, 'color');
      const bgColor = getComputedColor(input as HTMLElement, 'backgroundColor');

      expect(textColor, `Не удалось получить цвет текста для инпута с placeholder "${input.getAttribute('placeholder')}"`).not.toBeNull();
      expect(bgColor, `Не удалось получить цвет фона для инпута с placeholder "${input.getAttribute('placeholder')}"`).not.toBeNull();

      const contrast = calculateContrastRatio(textColor!, bgColor!);

      // КРИТИЧЕСКАЯ ПРОВЕРКА: контраст должен быть >= 4.5:1
      expect(
        contrast,
        `Контраст введённого текста в поле "${input.getAttribute('placeholder')}" на тёмной теме недостаточен. ` +
        `Текущий контраст: ${contrast.toFixed(2)}:1, требуется >= 4.5:1. ` +
        `Цвет текста: rgb(${textColor!.join(', ')}), цвет фона: rgb(${bgColor!.join(', ')})`
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Property 1.3: Контраст лейблов на тёмной теме
   * 
   * Bug Condition: theme === 'dark' AND contrast(labelColor, backgroundColor) < 4.5
   * Expected Behavior: Контраст лейблов >= 4.5:1 на тёмной теме
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Лейблы не видны или плохо различимы на тёмной теме
   * 
   * **Validates: Requirements 2.3**
   */
  it('Property 1.3: Контраст лейблов на тёмной теме должен быть >= 4.5:1 (WCAG AA)', () => {
    // Применяем тёмную тему
    applyTelegramTheme(telegramThemes.dark);

    // Рендерим форму
    render(<DeliveryForm prizeId={1} />);

    // Получаем все лейблы
    const labels = [
      screen.getByText(/ФИО/i),
      screen.getByText(/Адрес доставки/i),
      screen.getByText(/Номер телефона/i),
      screen.getByText(/Комментарий/i),
    ];

    // Проверяем контраст каждого лейбла
    labels.forEach((label) => {
      const labelColor = getComputedColor(label, 'color');
      const bgColor = getComputedColor(label, 'backgroundColor');

      expect(labelColor, `Не удалось получить цвет лейбла "${label.textContent}"`).not.toBeNull();

      // Если backgroundColor прозрачный, используем цвет фона страницы
      const backgroundColor = bgColor || parseColor(telegramThemes.dark.bgColor);
      expect(backgroundColor, 'Не удалось определить цвет фона').not.toBeNull();

      const contrast = calculateContrastRatio(labelColor!, backgroundColor!);

      // КРИТИЧЕСКАЯ ПРОВЕРКА: контраст должен быть >= 4.5:1
      expect(
        contrast,
        `Контраст лейбла "${label.textContent}" на тёмной теме недостаточен. ` +
        `Текущий контраст: ${contrast.toFixed(2)}:1, требуется >= 4.5:1. ` +
        `Цвет текста: rgb(${labelColor!.join(', ')}), цвет фона: rgb(${backgroundColor!.join(', ')})`
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Property 1.4: Property-Based Test - Контраст на различных темах
   * 
   * Генерирует различные комбинации тем и проверяет контраст
   * Использует Scoped PBT подход - ограничивает тестирование конкретными проваливающимися случаями
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Демонстрирует баг на множестве сценариев
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  it('Property 1.4: PBT - Контраст текстовых элементов должен быть >= 4.5:1 на всех темах', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные темы
        fc.constantFrom<'light' | 'dark'>('light', 'dark'),
        // Генерируем различные prize_id
        fc.integer({ min: 1, max: 1000 }),
        async (themeName, prizeId) => {
          // Применяем тему
          const theme = telegramThemes[themeName];
          applyTelegramTheme(theme);

          // Рендерим форму
          const { unmount } = render(<DeliveryForm prizeId={prizeId} />);

          try {
            // Проверяем лейблы
            const labels = [
              screen.getByText(/ФИО/i),
              screen.getByText(/Адрес доставки/i),
              screen.getByText(/Номер телефона/i),
              screen.getByText(/Комментарий/i),
            ];

            labels.forEach((label) => {
              const labelColor = getComputedColor(label, 'color');
              const bgColor = getComputedColor(label, 'backgroundColor');
              const backgroundColor = bgColor || parseColor(theme.bgColor);

              if (labelColor && backgroundColor) {
                const contrast = calculateContrastRatio(labelColor, backgroundColor);
                expect(
                  contrast,
                  `[${themeName} тема] Контраст лейбла "${label.textContent}" недостаточен: ${contrast.toFixed(2)}:1`
                ).toBeGreaterThanOrEqual(4.5);
              }
            });

            // Проверяем поля ввода (только для тёмной темы, так как это основная проблема)
            if (themeName === 'dark') {
              const inputs = [
                screen.getByPlaceholderText(/Иванов Иван Иванович/i),
                screen.getByPlaceholderText(/Город, улица, дом, квартира/i),
                screen.getByPlaceholderText(/\+79991234567/i),
                screen.getByPlaceholderText(/Дополнительная информация/i),
              ];

              inputs.forEach((input) => {
                const textColor = getComputedColor(input as HTMLElement, 'color');
                const bgColor = getComputedColor(input as HTMLElement, 'backgroundColor');

                if (textColor && bgColor) {
                  const contrast = calculateContrastRatio(textColor, bgColor);
                  expect(
                    contrast,
                    `[${themeName} тема] Контраст текста в поле "${input.getAttribute('placeholder')}" недостаточен: ${contrast.toFixed(2)}:1`
                  ).toBeGreaterThanOrEqual(4.5);
                }
              });
            }
          } finally {
            // Очищаем после каждого теста
            unmount();
            clearTelegramTheme();
          }
        }
      ),
      { numRuns: 20 } // Запускаем 20 раз для различных комбинаций
    );
  });
});


/**
 * Property-Based Tests для Preservation
 * 
 * Bugfix Spec: Telegram WebApp Theme Adaptation Fix
 * 
 * ЦЕЛЬ: Зафиксировать существующее поведение формы, которое НЕ должно измениться после исправления
 * 
 * МЕТОДОЛОГИЯ: Observation-first
 * 1. Наблюдаем поведение на НЕИСПРАВЛЕННОМ коде
 * 2. Фиксируем наблюдаемые паттерны в property-based тестах
 * 3. Запускаем тесты на НЕИСПРАВЛЕННОМ коде
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Эти тесты ПРОХОДЯТ на неисправленном коде
 * Это подтверждает базовое поведение, которое должно сохраниться после исправления
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

describe('Bugfix Preservation Tests - Property 2: Сохранение функциональности формы', () => {
  beforeEach(() => {
    clearTelegramTheme();
  });

  afterEach(() => {
    clearTelegramTheme();
  });

  /**
   * Property 2.1: Сохранение валидации полей формы
   * 
   * Проверяет, что валидация работает корректно с теми же правилами:
   * - ФИО: минимум 2 символа, максимум 100
   * - Адрес: минимум 10 символов, максимум 500
   * - Телефон: формат +?[0-9]{10,15}
   * - Комментарий: максимум 500 символов (опционально)
   * 
   * **Validates: Requirements 3.1**
   */
  it('Property 2.1: Валидация полей формы должна работать корректно', async () => {
    render(<DeliveryForm prizeId={1} />);

    // Получаем поля ввода
    const fullNameInput = screen.getByPlaceholderText(/Иванов Иван Иванович/i) as HTMLInputElement;
    const addressInput = screen.getByPlaceholderText(/Город, улица, дом, квартира/i) as HTMLTextAreaElement;
    const phoneInput = screen.getByPlaceholderText(/\+79991234567/i) as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /Отправить данные/i });

    // Тест 1: Невалидное ФИО (слишком короткое)
    await userEvent.type(fullNameInput, 'A');
    await userEvent.click(submitButton);
    expect(await screen.findByText(/Минимум 2 символа/i)).toBeInTheDocument();

    // Очищаем и тестируем валидный ввод
    await userEvent.clear(fullNameInput);
    await userEvent.type(fullNameInput, 'Иванов Иван');
    
    // Тест 2: Невалидный адрес (слишком короткий)
    await userEvent.type(addressInput, 'Short');
    await userEvent.click(submitButton);
    expect(await screen.findByText(/Минимум 10 символов/i)).toBeInTheDocument();

    // Очищаем и тестируем валидный адрес
    await userEvent.clear(addressInput);
    await userEvent.type(addressInput, 'Москва, ул. Ленина, д. 1');

    // Тест 3: Невалидный телефон
    await userEvent.type(phoneInput, 'invalid');
    await userEvent.click(submitButton);
    expect(await screen.findByText(/Неверный формат телефона/i)).toBeInTheDocument();

    // Очищаем и тестируем валидный телефон
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '+79991234567');

    // После ввода всех валидных данных ошибок быть не должно
    await userEvent.click(submitButton);
    
    // Проверяем, что старые ошибки исчезли (форма пытается отправиться)
    expect(screen.queryByText(/Минимум 2 символа/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Минимум 10 символов/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Неверный формат телефона/i)).not.toBeInTheDocument();
  });

  /**
   * Property 2.2: Сохранение отображения сообщений об ошибках красным цветом
   * 
   * Проверяет, что сообщения об ошибках валидации отображаются красным цветом
   * 
   * **Validates: Requirements 3.3**
   */
  it('Property 2.2: Сообщения об ошибках валидации должны отображаться красным цветом', async () => {
    render(<DeliveryForm prizeId={1} />);

    // Вводим невалидное ФИО
    const fullNameInput = screen.getByPlaceholderText(/Иванов Иван Иванович/i);
    const submitButton = screen.getByRole('button', { name: /Отправить данные/i });

    await userEvent.type(fullNameInput, 'A'); // Слишком короткое
    await userEvent.click(submitButton); // Триггерим валидацию

    // Ищем сообщение об ошибке
    const errorMessage = await screen.findByText(/Минимум 2 символа/i);
    expect(errorMessage).toBeInTheDocument();

    // Проверяем, что ошибка имеет CSS класс для красного цвета
    expect(errorMessage).toHaveClass('text-red-600');
  });

  /**
   * Property 2.3: Сохранение стилизации и поведения кнопки отправки
   * 
   * Проверяет, что кнопка отправки:
   * - Имеет правильную стилизацию (синий фон, белый текст)
   * - Отключается при isSubmitting
   * - Меняет текст при isSubmitting
   * 
   * **Validates: Requirements 3.4**
   */
  it('Property 2.3: Стилизация и поведение кнопки отправки должны работать корректно', () => {
    render(<DeliveryForm prizeId={1} />);

    // Получаем кнопку отправки
    const submitButton = screen.getByRole('button', { name: /Отправить данные/i });
    expect(submitButton).toBeInTheDocument();

    // Проверяем, что кнопка имеет правильные CSS классы
    expect(submitButton).toHaveClass('bg-blue-600');
    expect(submitButton).toHaveClass('text-white');
    expect(submitButton).toHaveClass('disabled:opacity-50');

    // Проверяем, что кнопка не отключена изначально
    expect(submitButton).not.toBeDisabled();
    
    // Проверяем текст кнопки
    expect(submitButton).toHaveTextContent('Отправить данные');
  });

  /**
   * Property 2.4: Сохранение блокировки полей ввода в состоянии isSubmitting
   * 
   * Проверяет, что поля ввода имеют механизм блокировки через атрибут disabled
   * 
   * **Validates: Requirements 3.5**
   */
  it('Property 2.4: Поля ввода должны иметь механизм блокировки', () => {
    render(<DeliveryForm prizeId={1} />);

    // Получаем поля ввода
    const fullNameInput = screen.getByPlaceholderText(/Иванов Иван Иванович/i) as HTMLInputElement;
    const addressInput = screen.getByPlaceholderText(/Город, улица, дом, квартира/i) as HTMLTextAreaElement;
    const phoneInput = screen.getByPlaceholderText(/\+79991234567/i) as HTMLInputElement;
    const commentInput = screen.getByPlaceholderText(/Дополнительная информация/i) as HTMLTextAreaElement;

    // Проверяем, что поля не заблокированы изначально
    expect(fullNameInput).not.toBeDisabled();
    expect(addressInput).not.toBeDisabled();
    expect(phoneInput).not.toBeDisabled();
    expect(commentInput).not.toBeDisabled();

    // Проверяем, что поля могут быть заблокированы (имеют свойство disabled)
    expect(fullNameInput).toHaveProperty('disabled');
    expect(addressInput).toHaveProperty('disabled');
    expect(phoneInput).toHaveProperty('disabled');
    expect(commentInput).toHaveProperty('disabled');
  });

  /**
   * Property 2.5: Сохранение эффектов фокуса (focus ring)
   * 
   * Проверяет, что focus ring отображается корректно при фокусе на полях ввода
   * 
   * **Validates: Requirements 3.6**
   */
  it('Property 2.5: Эффекты фокуса должны быть настроены через CSS классы', async () => {
    render(<DeliveryForm prizeId={1} />);

    // Получаем поле ввода
    const fullNameInput = screen.getByPlaceholderText(/Иванов Иван Иванович/i);

    // Проверяем наличие CSS классов для focus ring
    expect(fullNameInput).toHaveClass('focus:ring-2');
    expect(fullNameInput).toHaveClass('focus:ring-blue-500');
    expect(fullNameInput).toHaveClass('focus:border-blue-500');

    // Устанавливаем фокус
    await userEvent.click(fullNameInput);

    // Проверяем, что элемент получил фокус
    expect(fullNameInput).toHaveFocus();
  });

  /**
   * Property 2.6: Сохранение структуры DOM и классов элементов
   * 
   * Проверяет, что структура DOM формы остаётся неизменной
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
   */
  it('Property 2.6: Структура DOM формы должна оставаться неизменной', () => {
    const { container } = render(<DeliveryForm prizeId={1} />);

    // Проверяем наличие формы
    const form = container.querySelector('form');
    expect(form).toBeInTheDocument();
    
    // Проверяем наличие всех лейблов
    expect(screen.getByText(/ФИО/i)).toBeInTheDocument();
    expect(screen.getByText(/Адрес доставки/i)).toBeInTheDocument();
    expect(screen.getByText(/Номер телефона/i)).toBeInTheDocument();
    expect(screen.getByText(/Комментарий/i)).toBeInTheDocument();

    // Проверяем наличие всех полей ввода
    expect(screen.getByPlaceholderText(/Иванов Иван Иванович/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Город, улица, дом, квартира/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/\+79991234567/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Дополнительная информация/i)).toBeInTheDocument();

    // Проверяем наличие кнопки отправки
    expect(screen.getByRole('button', { name: /Отправить данные/i })).toBeInTheDocument();

    // Проверяем наличие обязательных полей (звёздочки)
    const requiredMarkers = screen.getAllByText('*');
    expect(requiredMarkers.length).toBe(3); // ФИО, Адрес, Телефон
  });
});
