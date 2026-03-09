# Design: Удаление зависимости от Supabase

## Метаданные
- **Связанные требования**: requirements.md
- **Дата создания**: 2026-03-09
- **Статус**: В разработке

## 1. Обзор архитектуры

### 1.1 Текущая архитектура (ДО изменений)

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │  SessionList.tsx │        │  ChatWindow.tsx  │          │
│  └────────┬─────────┘        └────────┬─────────┘          │
│           │                           │                      │
│           └───────────┬───────────────┘                      │
│                       │                                      │
│                       ▼                                      │
│           ┌───────────────────────┐                         │
│           │  getSupabaseClient()  │  ◄── Feature Flag       │
│           └───────────┬───────────┘                         │
│                       │                                      │
│           ┌───────────┴───────────┐                         │
│           │                       │                         │
│           ▼                       ▼                         │
│  ┌─────────────────┐   ┌──────────────────────┐           │
│  │ PostgresRealtime│   │ SupabaseRealtimeClient│ ◄── УДАЛИТЬ
│  │     Client      │   │    (УСТАРЕЛ)          │           │
│  └─────────────────┘   └──────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Целевая архитектура (ПОСЛЕ изменений)

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │  SessionList.tsx │        │  ChatWindow.tsx  │          │
│  └────────┬─────────┘        └────────┬─────────┘          │
│           │                           │                      │
│           └───────────┬───────────────┘                      │
│                       │                                      │
│                       ▼                                      │
│           ┌───────────────────────┐                         │
│           │  getRealtimeClient()  │  ◄── Прямой вызов       │
│           └───────────┬───────────┘                         │
│                       │                                      │
│                       ▼                                      │
│           ┌─────────────────────┐                           │
│           │ PostgresRealtime    │                           │
│           │   Client.getInstance│                           │
│           └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

## 2. Детальный дизайн компонентов

### 2.1 Новый файл: `realtimeClient.ts`

**Расположение**: `nextjs-app/lib/database/realtimeClient.ts`

**Назначение**: Чистый экспорт PostgresRealtimeClient без устаревшего кода Supabase

**Структура**:

```typescript
/**
 * Realtime Client для WebSocket подключений
 * Использует PostgreSQL LISTEN/NOTIFY для real-time обновлений
 */

import { PostgresRealtimeClient } from '@/lib/websocket/client/PostgresRealtimeClient';
import type { ErrorCallback, MessageCallback } from '@/lib/websocket/types';

/**
 * Получить singleton instance realtime клиента
 * 
 * @returns PostgresRealtimeClient instance
 */
export function getRealtimeClient(): PostgresRealtimeClient {
  return PostgresRealtimeClient.getInstance();
}

// Экспортируем класс для прямого использования
export { PostgresRealtimeClient };

// Экспортируем типы для удобства
export type { ErrorCallback, MessageCallback };
```

**Обоснование дизайна**:
- Простой и понятный API
- Нет feature flag логики
- Прямой доступ к PostgresRealtimeClient
- Экспорт типов для удобства использования

### 2.2 Обновление `lib/database/index.ts`

**ДО**:
```typescript
export { DatabaseClient, getDb, type PaginatedSessions } from './client';
export { 
  SupabaseRealtimeClient, 
  getSupabaseClient, 
  type MessageCallback, 
  type ErrorCallback 
} from './supabaseClient';
```

**ПОСЛЕ**:
```typescript
export { DatabaseClient, getDb, type PaginatedSessions } from './client';
export { 
  PostgresRealtimeClient, 
  getRealtimeClient, 
  type MessageCallback, 
  type ErrorCallback 
} from './realtimeClient';
```

### 2.3 Обновление компонентов

#### 2.3.1 SessionList.tsx

**ДО**:
```typescript
import { getSupabaseClient } from '@/lib/database/supabaseClient';

// ...
const client = await getSupabaseClient();
```

**ПОСЛЕ**:
```typescript
import { getRealtimeClient } from '@/lib/database/realtimeClient';

// ...
const client = getRealtimeClient();
```

**Изменения**:
- Импорт из нового файла
- Убрана асинхронность (getInstance() синхронный)
- API остаётся совместимым

#### 2.3.2 ChatWindow.tsx

**ДО**:
```typescript
import { getSupabaseClient } from '@/lib/database/supabaseClient';

// ...
const supabaseClient = await getSupabaseClient();
```

**ПОСЛЕ**:
```typescript
import { getRealtimeClient } from '@/lib/database/realtimeClient';

// ...
const realtimeClient = getRealtimeClient();
```

**Изменения**:
- Импорт из нового файла
- Переименование переменной для ясности
- Убрана асинхронность

## 3. Изменения в конфигурации

### 3.1 package.json

**ДО**:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.48.1",
    // ... другие зависимости
  }
}
```

**ПОСЛЕ**:
```json
{
  "dependencies": {
    // @supabase/supabase-js удалён
    // ... другие зависимости
  }
}
```

### 3.2 Переменные окружения

**Файлы для изменения**:
- `.env`
- `.env.example` (если существует)
- `.env.production.example`
- `vitest.config.ts`

**Удалить**:
```bash
# Supabase (УДАЛИТЬ)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Feature flag (УДАЛИТЬ)
NEXT_PUBLIC_USE_POSTGRES_REALTIME=true
```

**Оставить**:
```bash
# PostgreSQL (ОСТАВИТЬ)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=telegram_support
DB_USER=postgres
DB_PASSWORD=postgres

# WebSocket (ОСТАВИТЬ)
# Конфигурация в коде, не требует env переменных
```

### 3.3 vitest.config.ts

**ДО**:
```typescript
env: {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  // ...
}
```

**ПОСЛЕ**:
```typescript
env: {
  // Supabase переменные удалены
  // ...
}
```

## 4. Изменения в типах

### 4.1 types/support.ts

**ДО**:
```typescript
// Real-time событие нового сообщения (для Supabase Realtime)
export interface NewMessageEvent {
  type: 'INSERT';
  // ...
}
```

**ПОСЛЕ**:
```typescript
// Real-time событие нового сообщения (для PostgreSQL LISTEN/NOTIFY)
export interface NewMessageEvent {
  type: 'INSERT';
  // ...
}
```

## 5. Миграция данных

### 5.1 Нет миграции данных
- Изменения касаются только кода, не данных
- База данных остаётся без изменений
- Все данные сохраняются

### 5.2 Нет изменений в API
- API PostgresRealtimeClient полностью совместим
- Методы `subscribeToSessionMessages()` работают идентично
- Методы `subscribeToSessionStatusChanges()` работают идентично

## 6. План рефакторинга

### 6.1 Фаза 1: Создание нового файла
1. Создать `realtimeClient.ts` с чистым экспортом
2. Обновить `lib/database/index.ts`

### 6.2 Фаза 2: Обновление компонентов
1. Обновить импорты в `SessionList.tsx`
2. Обновить импорты в `ChatWindow.tsx`
3. Убрать `await` из вызовов (синхронный getInstance)

### 6.3 Фаза 3: Удаление старого кода
1. Удалить `supabaseClient.ts`
2. Удалить `supabaseClient.property.test.ts`

### 6.4 Фаза 4: Очистка зависимостей
1. Удалить `@supabase/supabase-js` из package.json
2. Запустить `npm uninstall @supabase/supabase-js`
3. Запустить `npm install` для обновления lock-файла

### 6.5 Фаза 5: Очистка конфигурации
1. Удалить Supabase переменные из `.env` файлов
2. Обновить `vitest.config.ts`
3. Обновить комментарии в `types/support.ts`

### 6.6 Фаза 6: Проверка
1. Запустить TypeScript компиляцию: `npm run type-check`
2. Запустить тесты: `npm test`
3. Запустить приложение: `npm run dev`
4. Проверить работу в браузере

## 7. Совместимость API

### 7.1 PostgresRealtimeClient API

**Методы, используемые в компонентах**:

```typescript
// Подписка на сообщения сессии
subscribeToSessionMessages(
  sessionId: number,
  onMessage: MessageCallback,
  onError?: ErrorCallback
): () => void

// Подписка на изменения статусов
subscribe({
  channel: 'status',
  onMessage: (message: any) => void,
  onError?: ErrorCallback
}): string

// Отписка
unsubscribe(subscriptionId: string): void
```

**Совместимость**: ✅ Полная
- API идентичен предыдущему использованию
- Никаких breaking changes
- Компоненты работают без изменений логики

### 7.2 Изменения в использовании

**Единственное изменение**: убрана асинхронность

**ДО**:
```typescript
const client = await getSupabaseClient();
```

**ПОСЛЕ**:
```typescript
const client = getRealtimeClient();
```

**Обоснование**: 
- `PostgresRealtimeClient.getInstance()` синхронный
- Нет необходимости в async/await
- Упрощает код компонентов

## 8. Тестирование

### 8.1 Удаление тестов Supabase

**Файл для удаления**:
- `nextjs-app/lib/database/__tests__/supabaseClient.property.test.ts`

**Обоснование**:
- Тесты для устаревшего кода
- PostgresRealtimeClient имеет свои тесты
- Нет необходимости в дублировании

### 8.2 Существующие тесты PostgresRealtimeClient

**Файлы с тестами** (уже существуют):
- `nextjs-app/lib/websocket/client/__tests__/PostgresRealtimeClient.property.test.ts`
- `nextjs-app/lib/websocket/__tests__/integration/*.test.ts`

**Покрытие**: ✅ Полное
- Property-based тесты
- Интеграционные тесты
- Unit тесты

### 8.3 План тестирования после изменений

1. **TypeScript компиляция**:
   ```bash
   npm run type-check
   ```

2. **Unit тесты**:
   ```bash
   npm test
   ```

3. **Интеграционные тесты**:
   ```bash
   npm run test:integration
   ```

4. **Ручное тестирование**:
   - Запустить приложение
   - Открыть админку
   - Проверить список сессий
   - Проверить чат с пользователем
   - Проверить real-time обновления

## 9. Риски и митигация

### 9.1 Риск: Забытые импорты

**Проблема**: Могут остаться импорты из старого файла

**Митигация**:
```bash
# Поиск всех импортов supabaseClient
grep -r "from '@/lib/database/supabaseClient'" nextjs-app/

# Поиск всех импортов getSupabaseClient
grep -r "getSupabaseClient" nextjs-app/

# Поиск всех импортов SupabaseRealtimeClient
grep -r "SupabaseRealtimeClient" nextjs-app/
```

### 9.2 Риск: Сломанные тесты

**Проблема**: Тесты могут не пройти после изменений

**Митигация**:
- Запустить все тесты перед коммитом
- Проверить TypeScript компиляцию
- Использовать CI/CD для автоматической проверки

### 9.3 Риск: Проблемы с асинхронностью

**Проблема**: Убрали `await`, может сломаться логика

**Митигация**:
- `getInstance()` синхронный, проблем не будет
- Проверить все места использования
- Протестировать в браузере

## 10. Метрики успеха

### 10.1 Размер bundle

**Ожидаемое уменьшение**: ~50-100 KB (gzipped)

**Измерение**:
```bash
# ДО
npm run build
# Проверить размер bundle

# ПОСЛЕ
npm run build
# Сравнить размер bundle
```

### 10.2 Количество строк кода

**Ожидаемое уменьшение**: ~400-500 строк

**Файлы для удаления**:
- `supabaseClient.ts`: ~370 строк
- `supabaseClient.property.test.ts`: ~500 строк

**Новый файл**:
- `realtimeClient.ts`: ~20 строк

**Итого**: -850 строк кода

### 10.3 Зависимости

**ДО**: 1 зависимость Supabase
**ПОСЛЕ**: 0 зависимостей Supabase

### 10.4 Переменные окружения

**ДО**: 4 переменные (3 Supabase + 1 feature flag)
**ПОСЛЕ**: 0 переменных

## 11. Диаграммы

### 11.1 Диаграмма потока данных

```
ТЕКУЩИЙ ПОТОК (с feature flag):

User Action
    ↓
Component (SessionList/ChatWindow)
    ↓
getSupabaseClient() ← Feature Flag Check
    ↓
    ├─→ [if true] PostgresRealtimeClient
    └─→ [if false] SupabaseRealtimeClient (УСТАРЕЛ)
        ↓
    WebSocket / Supabase API
        ↓
    PostgreSQL Database


НОВЫЙ ПОТОК (без feature flag):

User Action
    ↓
Component (SessionList/ChatWindow)
    ↓
getRealtimeClient()
    ↓
PostgresRealtimeClient.getInstance()
    ↓
WebSocket Connection
    ↓
PostgreSQL LISTEN/NOTIFY
    ↓
PostgreSQL Database
```

### 11.2 Диаграмма зависимостей

```
ДО:

┌─────────────────────────────────────────┐
│         React Components                 │
│  (SessionList, ChatWindow)              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      lib/database/supabaseClient.ts     │
│  ┌────────────────────────────────────┐ │
│  │  getSupabaseClient()               │ │
│  │  ├─ Feature Flag Check             │ │
│  │  ├─ PostgresRealtimeClient         │ │
│  │  └─ SupabaseRealtimeClient         │ │
│  └────────────────────────────────────┘ │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ PostgresRT  │  │ @supabase/   │
│   Client    │  │ supabase-js  │
└─────────────┘  └──────────────┘


ПОСЛЕ:

┌─────────────────────────────────────────┐
│         React Components                 │
│  (SessionList, ChatWindow)              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      lib/database/realtimeClient.ts     │
│  ┌────────────────────────────────────┐ │
│  │  getRealtimeClient()               │ │
│  │  └─ PostgresRealtimeClient         │ │
│  └────────────────────────────────────┘ │
└──────────────┬──────────────────────────┘
               │
               ▼
       ┌─────────────┐
       │ PostgresRT  │
       │   Client    │
       └─────────────┘
```

## 12. Чеклист выполнения

### 12.1 Код
- [ ] Создан `realtimeClient.ts`
- [ ] Обновлён `lib/database/index.ts`
- [ ] Обновлён `SessionList.tsx`
- [ ] Обновлён `ChatWindow.tsx`
- [ ] Удалён `supabaseClient.ts`
- [ ] Удалён `supabaseClient.property.test.ts`

### 12.2 Зависимости
- [ ] Удалён `@supabase/supabase-js` из package.json
- [ ] Выполнен `npm uninstall @supabase/supabase-js`
- [ ] Выполнен `npm install`
- [ ] Обновлён package-lock.json

### 12.3 Конфигурация
- [ ] Удалены Supabase переменные из `.env`
- [ ] Удалены Supabase переменные из `.env.example`
- [ ] Удалены Supabase переменные из `.env.production.example`
- [ ] Удалён feature flag из всех env файлов
- [ ] Обновлён `vitest.config.ts`

### 12.4 Документация
- [ ] Обновлены комментарии в `types/support.ts`
- [ ] Обновлены JSDoc комментарии в коде

### 12.5 Тестирование
- [ ] Пройдена TypeScript компиляция
- [ ] Пройдены все unit тесты
- [ ] Пройдены интеграционные тесты
- [ ] Проверена работа в браузере
- [ ] Проверены real-time обновления

### 12.6 Проверка
- [ ] Нет импортов `supabaseClient`
- [ ] Нет импортов `getSupabaseClient`
- [ ] Нет импортов `SupabaseRealtimeClient`
- [ ] Нет упоминаний `@supabase/supabase-js`
- [ ] Нет Supabase переменных окружения

## 13. Заключение

Дизайн удаления Supabase прост и понятен:
1. Создаём чистый файл `realtimeClient.ts` с прямым экспортом
2. Обновляем импорты в компонентах
3. Удаляем старый код и зависимости
4. Очищаем конфигурацию

Изменения минимальны, риски низкие, совместимость полная.
