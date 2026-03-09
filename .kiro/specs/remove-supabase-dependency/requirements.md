# Requirements: Удаление зависимости от Supabase

## Метаданные
- **Тип**: Рефакторинг / Удаление зависимости
- **Приоритет**: Высокий
- **Статус**: В разработке
- **Дата создания**: 2026-03-09

## 1. Обзор

### 1.1 Контекст
Проект изначально использовал Supabase Realtime для получения real-time обновлений из PostgreSQL. Была реализована собственная система WebSocket на базе PostgreSQL LISTEN/NOTIFY через `PostgresRealtimeClient`, которая полностью заменяет функциональность Supabase Realtime.

Текущее состояние:
- ✅ PostgreSQL LISTEN/NOTIFY WebSocket система полностью реализована
- ✅ Feature flag `NEXT_PUBLIC_USE_POSTGRES_REALTIME=true` активирован
- ❌ Код Supabase всё ещё присутствует в проекте
- ❌ Зависимость `@supabase/supabase-js` всё ещё установлена
- ❌ Файл `supabaseClient.ts` содержит устаревший код

### 1.2 Цель
Полностью удалить зависимость от Supabase из проекта, очистить код от устаревших компонентов и упростить архитектуру.

### 1.3 Преимущества удаления
1. **Упрощение архитектуры** - один способ получения real-time обновлений вместо двух
2. **Уменьшение размера bundle** - удаление неиспользуемой библиотеки
3. **Снижение технического долга** - удаление мёртвого кода
4. **Упрощение конфигурации** - меньше переменных окружения
5. **Улучшение поддерживаемости** - меньше кода для поддержки

## 2. Функциональные требования

### 2.1 Удаление кода Supabase

**REQ-2.1.1**: Удалить класс `SupabaseRealtimeClient` из `supabaseClient.ts`
- Класс больше не используется
- Все компоненты используют `PostgresRealtimeClient`

**REQ-2.1.2**: Удалить функцию `getSupabaseClient()` с feature flag логикой
- Feature flag больше не нужен
- Заменить прямым использованием `PostgresRealtimeClient.getInstance()`

**REQ-2.1.3**: Удалить импорты `@supabase/supabase-js`
- Удалить из `supabaseClient.ts`
- Проверить отсутствие в других файлах

### 2.2 Рефакторинг файловой структуры

**REQ-2.2.1**: Переименовать `supabaseClient.ts` в `realtimeClient.ts`
- Имя файла должно отражать реальную функциональность
- Обновить все импорты в проекте

**REQ-2.2.2**: Создать чистый экспорт для `PostgresRealtimeClient`
- Экспортировать `PostgresRealtimeClient` напрямую
- Создать удобную функцию `getRealtimeClient()` как алиас для `PostgresRealtimeClient.getInstance()`

### 2.3 Обновление компонентов

**REQ-2.3.1**: Обновить импорты в `SessionList.tsx`
- Заменить `import { getSupabaseClient } from '@/lib/database/supabaseClient'`
- На `import { getRealtimeClient } from '@/lib/database/realtimeClient'`

**REQ-2.3.2**: Обновить импорты в `ChatWindow.tsx`
- Заменить `import { getSupabaseClient } from '@/lib/database/supabaseClient'`
- На `import { getRealtimeClient } from '@/lib/database/realtimeClient'`

**REQ-2.3.3**: Обновить использование клиента в компонентах
- Заменить `await getSupabaseClient()` на `await getRealtimeClient()`
- Убедиться, что API совместим

### 2.4 Удаление зависимостей

**REQ-2.4.1**: Удалить `@supabase/supabase-js` из `package.json`
- Удалить из dependencies
- Запустить `npm uninstall @supabase/supabase-js`

**REQ-2.4.2**: Обновить lock-файл
- Запустить `npm install` для обновления `package-lock.json`

### 2.5 Очистка конфигурации

**REQ-2.5.1**: Удалить переменные окружения Supabase
- Удалить `NEXT_PUBLIC_SUPABASE_URL` из `.env`, `.env.example`, `.env.production.example`
- Удалить `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Удалить `SUPABASE_SERVICE_ROLE_KEY`
- Удалить `NEXT_PUBLIC_USE_POSTGRES_REALTIME` (больше не нужен feature flag)

**REQ-2.5.2**: Обновить тестовую конфигурацию
- Удалить Supabase переменные из `vitest.config.ts`

### 2.6 Обновление экспортов

**REQ-2.6.1**: Обновить `lib/database/index.ts`
- Удалить экспорт `SupabaseRealtimeClient`
- Заменить `getSupabaseClient` на `getRealtimeClient`
- Экспортировать `PostgresRealtimeClient`

### 2.7 Обновление типов

**REQ-2.7.1**: Обновить комментарии в `types/support.ts`
- Удалить упоминание "для Supabase Realtime" из комментариев
- Обновить на "для PostgreSQL LISTEN/NOTIFY"

## 3. Нефункциональные требования

### 3.1 Обратная совместимость

**REQ-3.1.1**: API `PostgresRealtimeClient` должен быть совместим с предыдущим использованием
- Методы `subscribeToSessionMessages()` должны работать как раньше
- Методы `subscribeToSessionStatusChanges()` должны работать как раньше
- Метод `subscribe()` должен работать как раньше

### 3.2 Тестирование

**REQ-3.2.1**: Удалить тесты для `SupabaseRealtimeClient`
- Удалить файл `lib/database/__tests__/supabaseClient.property.test.ts`
- Все тесты для `PostgresRealtimeClient` уже существуют

**REQ-3.2.2**: Проверить работу существующих тестов
- Запустить все тесты после изменений
- Убедиться, что ничего не сломалось

### 3.3 Документация

**REQ-3.3.1**: Обновить комментарии в коде
- Удалить упоминания Supabase из комментариев
- Обновить JSDoc комментарии

## 4. Ограничения и предположения

### 4.1 Предположения
- PostgreSQL LISTEN/NOTIFY система полностью функциональна
- Все компоненты уже используют `PostgresRealtimeClient` через feature flag
- Нет других частей проекта, зависящих от Supabase

### 4.2 Ограничения
- Изменения должны быть обратно совместимы на уровне API
- Нельзя нарушать работу существующих компонентов

## 5. Критерии приёмки

### 5.1 Код
- ✅ Класс `SupabaseRealtimeClient` удалён
- ✅ Функция `getSupabaseClient()` удалена
- ✅ Файл переименован в `realtimeClient.ts`
- ✅ Все импорты обновлены
- ✅ Зависимость `@supabase/supabase-js` удалена из `package.json`

### 5.2 Конфигурация
- ✅ Переменные окружения Supabase удалены
- ✅ Feature flag `NEXT_PUBLIC_USE_POSTGRES_REALTIME` удалён
- ✅ Тестовая конфигурация обновлена

### 5.3 Тестирование
- ✅ Все существующие тесты проходят
- ✅ Тесты Supabase удалены
- ✅ Компоненты работают корректно

### 5.4 Документация
- ✅ Комментарии обновлены
- ✅ Упоминания Supabase удалены

## 6. Затронутые файлы

### 6.1 Файлы для удаления
- `nextjs-app/lib/database/__tests__/supabaseClient.property.test.ts`

### 6.2 Файлы для переименования
- `nextjs-app/lib/database/supabaseClient.ts` → `nextjs-app/lib/database/realtimeClient.ts`

### 6.3 Файлы для изменения
- `nextjs-app/lib/database/index.ts` - обновить экспорты
- `nextjs-app/components/admin/SessionList.tsx` - обновить импорты
- `nextjs-app/components/admin/ChatWindow.tsx` - обновить импорты
- `nextjs-app/types/support.ts` - обновить комментарии
- `nextjs-app/package.json` - удалить зависимость
- `nextjs-app/vitest.config.ts` - удалить Supabase переменные
- `.env` - удалить Supabase переменные
- `.env.example` - удалить Supabase переменные (если есть)
- `.env.production.example` - удалить Supabase переменные

## 7. Риски и митигация

### 7.1 Риск: Забыть обновить какой-то импорт
**Вероятность**: Средняя  
**Влияние**: Высокое (приложение не запустится)  
**Митигация**: 
- Использовать поиск по всему проекту для проверки
- Запустить TypeScript компиляцию
- Запустить все тесты

### 7.2 Риск: Сломать существующую функциональность
**Вероятность**: Низкая  
**Влияние**: Высокое  
**Митигация**:
- Тщательное тестирование после изменений
- Проверка работы компонентов в браузере
- Запуск всех автоматических тестов

## 8. План миграции

### 8.1 Этап 1: Подготовка
1. Убедиться, что `NEXT_PUBLIC_USE_POSTGRES_REALTIME=true` установлен
2. Проверить, что всё работает с PostgresRealtimeClient
3. Создать backup текущего состояния

### 8.2 Этап 2: Рефакторинг кода
1. Переименовать `supabaseClient.ts` в `realtimeClient.ts`
2. Удалить класс `SupabaseRealtimeClient`
3. Удалить функцию `getSupabaseClient()` с feature flag
4. Создать новую функцию `getRealtimeClient()`
5. Обновить экспорты в `index.ts`

### 8.3 Этап 3: Обновление компонентов
1. Обновить импорты в `SessionList.tsx`
2. Обновить импорты в `ChatWindow.tsx`
3. Обновить использование клиента

### 8.4 Этап 4: Очистка зависимостей
1. Удалить `@supabase/supabase-js` из `package.json`
2. Запустить `npm uninstall @supabase/supabase-js`
3. Запустить `npm install`

### 8.5 Этап 5: Очистка конфигурации
1. Удалить Supabase переменные из `.env` файлов
2. Удалить feature flag `NEXT_PUBLIC_USE_POSTGRES_REALTIME`
3. Обновить `vitest.config.ts`

### 8.6 Этап 6: Очистка тестов
1. Удалить `supabaseClient.property.test.ts`
2. Обновить комментарии в `types/support.ts`

### 8.7 Этап 7: Проверка
1. Запустить TypeScript компиляцию
2. Запустить все тесты
3. Проверить работу в браузере
4. Проверить отсутствие упоминаний Supabase в коде

## 9. Успешное завершение

Проект считается успешно мигрированным, когда:
1. ✅ Все упоминания Supabase удалены из кода
2. ✅ Зависимость `@supabase/supabase-js` удалена
3. ✅ Все тесты проходят
4. ✅ Приложение работает корректно
5. ✅ Размер bundle уменьшился
6. ✅ Код стал проще и понятнее
