/**
 * Конфигурация для property-based тестирования с fast-check
 * Настройка параметров выполнения тестов и воспроизводимости
 */

import * as fc from 'fast-check';

// ============================================================================
// Глобальная конфигурация fast-check
// ============================================================================

/**
 * Параметры по умолчанию для всех property-based тестов
 */
export const defaultFastCheckConfig: fc.Parameters<unknown> = {
  // Минимум 100 итераций на тест для надёжной проверки свойств
  numRuns: 100,
  
  // Seed для воспроизводимости тестов
  // Если тест падает, fast-check выведет seed, который можно использовать для воспроизведения
  // Пример: seed: 1234567890
  seed: Date.now(),
  
  // Максимальное количество shrink итераций для поиска минимального failing примера
  maxSkipsPerRun: 100,
  
  // Timeout для каждого теста (в миллисекундах)
  // Увеличен для длительных тестов с асинхронными операциями
  timeout: 10_000, // 10 секунд
  
  // Путь для сохранения примеров, которые вызвали ошибку
  path: '',
  
  // Логирование для отладки
  verbose: false,
  
  // Количество примеров для отображения при ошибке
  examples: [],
  
  // Настройки для асинхронных тестов
  asyncReporter: undefined,
  
  // Прерывать выполнение после первой ошибки
  endOnFailure: false,
  
  // Пропускать все тесты после первой ошибки
  skipAllAfterTimeLimit: undefined,
  
  // Интерпретировать исключения как ошибки
  interruptAfterTimeLimit: undefined,
  
  // Маркировать тесты как flaky если они иногда падают
  markInterruptAsFailure: false,
  
  // Настройки reporter
  reporter: undefined,
};

/**
 * Конфигурация для быстрых тестов (меньше итераций)
 * Используется для smoke-тестов и CI
 */
export const fastFastCheckConfig: fc.Parameters<unknown> = {
  ...defaultFastCheckConfig,
  numRuns: 50,
  timeout: 5_000, // 5 секунд
};

/**
 * Конфигурация для тщательных тестов (больше итераций)
 * Используется для критических свойств и перед релизом
 */
export const thoroughFastCheckConfig: fc.Parameters<unknown> = {
  ...defaultFastCheckConfig,
  numRuns: 500,
  timeout: 30_000, // 30 секунд
};

/**
 * Конфигурация для тестов с длительными асинхронными операциями
 */
export const asyncFastCheckConfig: fc.Parameters<unknown> = {
  ...defaultFastCheckConfig,
  numRuns: 50, // Меньше итераций для асинхронных тестов
  timeout: 30_000, // 30 секунд для WebSocket операций
};

/**
 * Конфигурация для интеграционных тестов
 */
export const integrationFastCheckConfig: fc.Parameters<unknown> = {
  ...defaultFastCheckConfig,
  numRuns: 30, // Ещё меньше итераций для полных интеграционных тестов
  timeout: 60_000, // 60 секунд для полного цикла клиент-сервер
};

// ============================================================================
// Утилиты для работы с seed
// ============================================================================

/**
 * Получить seed из переменной окружения или использовать случайный
 * Использование: FAST_CHECK_SEED=1234567890 npm test
 */
export function getSeedFromEnv(): number {
  const envSeed = process.env.FAST_CHECK_SEED;
  if (envSeed) {
    const seed = parseInt(envSeed, 10);
    if (!isNaN(seed)) {
      console.log(`[fast-check] Используется seed из переменной окружения: ${seed}`);
      return seed;
    }
  }
  const seed = Date.now();
  console.log(`[fast-check] Используется случайный seed: ${seed}`);
  return seed;
}

/**
 * Создать конфигурацию с seed из переменной окружения
 */
export function configWithEnvSeed(
  baseConfig: fc.Parameters<unknown> = defaultFastCheckConfig
): fc.Parameters<unknown> {
  return {
    ...baseConfig,
    seed: getSeedFromEnv(),
  };
}

// ============================================================================
// Утилиты для отладки
// ============================================================================

/**
 * Включить verbose режим для отладки
 */
export function enableVerboseMode(
  config: fc.Parameters<unknown> = defaultFastCheckConfig
): fc.Parameters<unknown> {
  return {
    ...config,
    verbose: true,
  };
}

/**
 * Создать конфигурацию для воспроизведения конкретного failing примера
 */
export function reproduceFailure(
  seed: number,
  path?: string,
  config: fc.Parameters<unknown> = defaultFastCheckConfig
): fc.Parameters<unknown> {
  return {
    ...config,
    seed,
    path: path || '',
    numRuns: 1, // Запустить только failing пример
    endOnFailure: true,
  };
}

// ============================================================================
// Хелперы для тестирования
// ============================================================================

/**
 * Обёртка для property тестов с логированием
 */
export async function testProperty<T>(
  name: string,
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  config: fc.Parameters<unknown> = defaultFastCheckConfig
): Promise<void> {
  console.log(`[fast-check] Запуск property теста: ${name}`);
  console.log(`[fast-check] Конфигурация: ${JSON.stringify({ numRuns: config.numRuns, seed: config.seed })}`);
  
  try {
    await fc.assert(
      fc.asyncProperty(arbitrary, predicate),
      config
    );
    console.log(`[fast-check] ✓ Тест пройден: ${name}`);
  } catch (error) {
    console.error(`[fast-check] ✗ Тест провален: ${name}`);
    if (error instanceof Error) {
      console.error(`[fast-check] Ошибка: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Создать mock функцию с отслеживанием вызовов
 */
export function createMockFunction<T extends (...args: any[]) => any>(): {
  fn: T;
  calls: Array<Parameters<T>>;
  results: Array<ReturnType<T>>;
  reset: () => void;
} {
  const calls: Array<Parameters<T>> = [];
  const results: Array<ReturnType<T>> = [];
  
  const fn = ((...args: Parameters<T>) => {
    calls.push(args);
    const result = undefined as ReturnType<T>;
    results.push(result);
    return result;
  }) as T;
  
  const reset = () => {
    calls.length = 0;
    results.length = 0;
  };
  
  return { fn, calls, results, reset };
}

/**
 * Создать promise с контролируемым разрешением
 */
export function createControllablePromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}

/**
 * Задержка для асинхронных тестов
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ожидание условия с таймаутом
 */
export async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout: условие не выполнено за ${timeoutMs}ms`);
    }
    await delay(checkIntervalMs);
  }
}

// ============================================================================
// Экспорт конфигураций
// ============================================================================

/**
 * Получить конфигурацию на основе переменной окружения TEST_MODE
 * Использование:
 * - TEST_MODE=fast npm test (быстрые тесты)
 * - TEST_MODE=thorough npm test (тщательные тесты)
 * - TEST_MODE=async npm test (асинхронные тесты)
 * - TEST_MODE=integration npm test (интеграционные тесты)
 * - npm test (по умолчанию)
 */
export function getConfigForTestMode(): fc.Parameters<unknown> {
  const testMode = process.env.TEST_MODE;
  
  switch (testMode) {
    case 'fast':
      console.log('[fast-check] Режим: FAST (50 итераций)');
      return configWithEnvSeed(fastFastCheckConfig);
    
    case 'thorough':
      console.log('[fast-check] Режим: THOROUGH (500 итераций)');
      return configWithEnvSeed(thoroughFastCheckConfig);
    
    case 'async':
      console.log('[fast-check] Режим: ASYNC (50 итераций, 30s timeout)');
      return configWithEnvSeed(asyncFastCheckConfig);
    
    case 'integration':
      console.log('[fast-check] Режим: INTEGRATION (30 итераций, 60s timeout)');
      return configWithEnvSeed(integrationFastCheckConfig);
    
    default:
      console.log('[fast-check] Режим: DEFAULT (100 итераций)');
      return configWithEnvSeed(defaultFastCheckConfig);
  }
}

// ============================================================================
// Глобальная настройка для Jest
// ============================================================================

/**
 * Увеличить timeout для Jest тестов с property-based testing
 * Примечание: эта настройка должна быть применена в jest.setup.js или в начале тестового файла
 */
export const JEST_TIMEOUT = 60_000; // 60 секунд для всех тестов

// ============================================================================
// Экспорт всех конфигураций
// ============================================================================

export default {
  defaultFastCheckConfig,
  fastFastCheckConfig,
  thoroughFastCheckConfig,
  asyncFastCheckConfig,
  integrationFastCheckConfig,
  getSeedFromEnv,
  configWithEnvSeed,
  enableVerboseMode,
  reproduceFailure,
  testProperty,
  createMockFunction,
  createControllablePromise,
  delay,
  waitFor,
  getConfigForTestMode,
};
