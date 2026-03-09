# Property-Based Testing для WebSocket архитектуры

Этот каталог содержит инфраструктуру для property-based тестирования WebSocket модулей с использованием fast-check.

## Файлы

### `arbitraries.ts`
Генераторы (arbitraries) для создания валидных тестовых данных:
- Токены, ID сессий, коды закрытия
- Сообщения клиента и сервера
- Последовательности событий
- Метрики и состояния

### `setup.ts`
Конфигурация для property-based тестов:
- Настройки fast-check (количество итераций, timeout, seed)
- Утилиты для тестирования (mock функции, задержки, ожидание условий)
- Различные режимы тестирования (fast, thorough, async, integration)

## Использование

### Базовый пример

```typescript
import * as fc from 'fast-check';
import { defaultFastCheckConfig } from './setup';
import { sessionIdArbitrary, subscriptionTypeArbitrary } from './arbitraries';

describe('SubscriptionManager', () => {
  it('должен генерировать уникальные ID для подписок', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(subscriptionTypeArbitrary, sessionIdArbitrary), { minLength: 2, maxLength: 10 }),
        async (subscriptions) => {
          const manager = new SubscriptionManager();
          const ids = subscriptions.map(([type, sessionId]) => 
            manager.subscribe({ channel: type, sessionId, onMessage: () => {} })
          );
          
          // Проверяем уникальность ID
          const uniqueIds = new Set(ids);
          return uniqueIds.size === ids.length;
        }
      ),
      defaultFastCheckConfig
    );
  });
});
```

### Режимы тестирования

```bash
# Быстрые тесты (50 итераций)
TEST_MODE=fast npm test

# Тщательные тесты (500 итераций)
TEST_MODE=thorough npm test

# Асинхронные тесты (50 итераций, 30s timeout)
TEST_MODE=async npm test

# Интеграционные тесты (30 итераций, 60s timeout)
TEST_MODE=integration npm test

# По умолчанию (100 итераций)
npm test
```

### Воспроизведение ошибок

Если тест падает, fast-check выведет seed:

```
Property failed after 42 tests
{ seed: 1234567890, path: "42:0:1", endOnFailure: true }
```

Воспроизвести ошибку:

```bash
FAST_CHECK_SEED=1234567890 npm test
```

Или в коде:

```typescript
import { reproduceFailure } from './setup';

it('воспроизведение ошибки', async () => {
  await fc.assert(
    fc.asyncProperty(arbitrary, predicate),
    reproduceFailure(1234567890, "42:0:1")
  );
});
```

## Доступные генераторы

### Базовые
- `tokenArbitrary` - JWT токены
- `sessionIdArbitrary` - ID сессий
- `subscriptionIdArbitrary` - ID подписок
- `clientIdArbitrary` - ID клиентов
- `closeCodeArbitrary` - коды закрытия WebSocket
- `errorCodeArbitrary` - коды ошибок приложения
- `connectionStateArbitrary` - состояния соединения

### Сообщения
- `clientMessageArbitrary` - любое сообщение от клиента
- `serverMessageArbitrary` - любое сообщение от сервера
- `initMessageArbitrary` - init сообщение
- `subscribeMessageArbitrary` - subscribe сообщение
- `connectedMessageArbitrary` - connected сообщение
- и другие...

### Последовательности
- `eventSequenceArbitrary` - валидная последовательность событий
- `handshakeSequenceArbitrary` - последовательность handshake
- `subscriptionSequenceArbitrary` - последовательность подписки
- `reconnectionSequenceArbitrary` - последовательность переподключения

### Коллекции
- `messageQueueArbitrary` - массив сообщений для очереди
- `subscriptionsArrayArbitrary` - массив подписок
- `metricsArbitrary` - метрики сервера

## Утилиты

### Задержки и ожидание

```typescript
import { delay, waitFor } from './setup';

// Задержка
await delay(1000);

// Ожидание условия
await waitFor(() => connection.isConnected(), 5000);
```

### Mock функции

```typescript
import { createMockFunction } from './setup';

const { fn, calls, results, reset } = createMockFunction<(msg: string) => void>();

fn('test');
console.log(calls); // [['test']]

reset();
console.log(calls); // []
```

### Контролируемые Promise

```typescript
import { createControllablePromise } from './setup';

const { promise, resolve, reject } = createControllablePromise<string>();

setTimeout(() => resolve('done'), 1000);
const result = await promise; // 'done'
```

## Конфигурации

- `defaultFastCheckConfig` - 100 итераций, 10s timeout
- `fastFastCheckConfig` - 50 итераций, 5s timeout
- `thoroughFastCheckConfig` - 500 итераций, 30s timeout
- `asyncFastCheckConfig` - 50 итераций, 30s timeout
- `integrationFastCheckConfig` - 30 итераций, 60s timeout

## Примеры свойств

### Property 1: Отсутствие аномальных закрытий
```typescript
await fc.assert(
  fc.asyncProperty(
    eventSequenceArbitrary,
    async (events) => {
      const client = new PostgresRealtimeClient(url, token);
      // Выполняем события
      // Проверяем, что нет кода 1006
    }
  ),
  defaultFastCheckConfig
);
```

### Property 10: Уникальность ID подписок
```typescript
await fc.assert(
  fc.asyncProperty(
    subscriptionsArrayArbitrary,
    async (subscriptions) => {
      const manager = new SubscriptionManager();
      const ids = subscriptions.map(s => manager.subscribe(s));
      return new Set(ids).size === ids.length;
    }
  ),
  defaultFastCheckConfig
);
```

### Property 13: Буферизация при разрыве
```typescript
await fc.assert(
  fc.asyncProperty(
    messageQueueArbitrary,
    async (messages) => {
      const queue = new MessageQueue();
      messages.forEach(m => queue.enqueue(m));
      return queue.size() === Math.min(messages.length, 100);
    }
  ),
  defaultFastCheckConfig
);
```
