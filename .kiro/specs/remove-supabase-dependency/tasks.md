# Tasks: Удаление зависимости от Supabase

## Метаданные
- **Связанные документы**: requirements.md, design.md
- **Дата создания**: 2026-03-09

## Задачи

### Фаза 1: Создание нового файла

- [x] 1. Создать новый файл `realtimeClient.ts`
  - [x] 1.1 Создать файл `nextjs-app/lib/database/realtimeClient.ts`
  - [x] 1.2 Добавить функцию `getRealtimeClient()`
  - [x] 1.3 Экспортировать `PostgresRealtimeClient`
  - [x] 1.4 Экспортировать типы `ErrorCallback`, `MessageCallback`
  - [x] 1.5 Добавить JSDoc комментарии на русском

- [x] 2. Обновить `lib/database/index.ts`
  - [x] 2.1 Удалить экспорт `SupabaseRealtimeClient`
  - [x] 2.2 Удалить экспорт `getSupabaseClient`
  - [x] 2.3 Добавить экспорт `PostgresRealtimeClient`
  - [x] 2.4 Добавить экспорт `getRealtimeClient`
  - [x] 2.5 Сохранить экспорты типов `MessageCallback`, `ErrorCallback`

### Фаза 2: Обновление компонентов

- [x] 3. Обновить `SessionList.tsx`
  - [x] 3.1 Заменить импорт с `supabaseClient` на `realtimeClient`
  - [x] 3.2 Заменить `getSupabaseClient` на `getRealtimeClient`
  - [x] 3.3 Убрать `await` из вызова `getRealtimeClient()` (синхронный)
  - [x] 3.4 Проверить TypeScript ошибки

- [x] 4. Обновить `ChatWindow.tsx`
  - [x] 4.1 Заменить импорт с `supabaseClient` на `realtimeClient`
  - [x] 4.2 Заменить `getSupabaseClient` на `getRealtimeClient`
  - [x] 4.3 Убрать `await` из вызова `getRealtimeClient()` (синхронный)
  - [x] 4.4 Переименовать переменную `supabaseClient` → `realtimeClient`
  - [x] 4.5 Проверить TypeScript ошибки

### Фаза 3: Удаление старого кода

- [x] 5. Удалить устаревшие файлы
  - [x] 5.1 Удалить `nextjs-app/lib/database/supabaseClient.ts`
  - [x] 5.2 Удалить `nextjs-app/lib/database/__tests__/supabaseClient.property.test.ts`
  - [x] 5.3 Проверить отсутствие других файлов с упоминанием Supabase

### Фаза 4: Очистка зависимостей

- [x] 6. Удалить npm зависимость
  - [x] 6.1 Удалить `@supabase/supabase-js` из `package.json`
  - [x] 6.2 Выполнить `npm uninstall @supabase/supabase-js`
  - [x] 6.3 Выполнить `npm install` для обновления lock-файла
  - [x] 6.4 Проверить, что зависимость удалена из `node_modules`

### Фаза 5: Очистка конфигурации

- [x] 7. Обновить файлы окружения
  - [x] 7.1 Удалить `NEXT_PUBLIC_SUPABASE_URL` из `.env`
  - [x] 7.2 Удалить `NEXT_PUBLIC_SUPABASE_ANON_KEY` из `.env`
  - [x] 7.3 Удалить `SUPABASE_SERVICE_ROLE_KEY` из `.env`
  - [x] 7.4 Удалить `NEXT_PUBLIC_USE_POSTGRES_REALTIME` из `.env`
  - [x] 7.5 Обновить `.env.production.example` (удалить Supabase переменные)
  - [x] 7.6 Обновить `.env.test` (если есть Supabase переменные)

- [x] 8. Обновить тестовую конфигурацию
  - [x] 8.1 Открыть `nextjs-app/vitest.config.ts`
  - [x] 8.2 Удалить `NEXT_PUBLIC_SUPABASE_URL` из env
  - [x] 8.3 Удалить `NEXT_PUBLIC_SUPABASE_ANON_KEY` из env
  - [x] 8.4 Сохранить файл

### Фаза 6: Обновление документации

- [x] 9. Обновить комментарии в типах
  - [x] 9.1 Открыть `nextjs-app/types/support.ts`
  - [x] 9.2 Найти комментарий "для Supabase Realtime"
  - [x] 9.3 Заменить на "для PostgreSQL LISTEN/NOTIFY"
  - [x] 9.4 Проверить другие упоминания Supabase

### Фаза 7: Проверка и тестирование

- [x] 10. Проверить отсутствие упоминаний Supabase
  - [x] 10.1 Выполнить поиск `grep -r "supabase" nextjs-app/` (исключая node_modules)
  - [x] 10.2 Выполнить поиск `grep -r "Supabase" nextjs-app/` (исключая node_modules)
  - [x] 10.3 Убедиться, что остались только комментарии в истории (если есть)

- [x] 11. Запустить TypeScript компиляцию
  - [x] 11.1 Выполнить `npm run type-check` (или `tsc --noEmit`)
  - [x] 11.2 Убедиться, что нет ошибок компиляции
  - [x] 11.3 Исправить ошибки, если есть

- [-] 12. Запустить тесты
  - [x] 12.1 Выполнить `npm test`
  - [ ] 12.2 Убедиться, что все тесты проходят
  - [ ] 12.3 Исправить падающие тесты, если есть

- [ ] 13. Ручное тестирование в браузере
  - [ ] 13.1 Запустить приложение `npm run dev`
  - [ ] 13.2 Открыть админку
  - [ ] 13.3 Проверить загрузку списка сессий
  - [ ] 13.4 Проверить открытие чата
  - [ ] 13.5 Проверить real-time обновления (отправить сообщение)
  - [ ] 13.6 Проверить изменение статуса сессии
  - [ ] 13.7 Убедиться, что нет ошибок в консоли браузера

## Порядок выполнения

**Строгая последовательность**:
1. Фаза 1 (Задачи 1-2) - создание нового кода
2. Фаза 2 (Задачи 3-4) - обновление компонентов
3. Фаза 3 (Задача 5) - удаление старого кода
4. Фаза 4 (Задача 6) - очистка зависимостей
5. Фаза 5 (Задачи 7-8) - очистка конфигурации
6. Фаза 6 (Задача 9) - обновление документации
7. Фаза 7 (Задачи 10-13) - проверка и тестирование

**Важно**: Не переходить к следующей фазе, пока не завершена текущая.

## Критерии завершения

Все задачи считаются выполненными, когда:
- ✅ Все чекбоксы отмечены
- ✅ TypeScript компиляция проходит без ошибок
- ✅ Все тесты проходят
- ✅ Приложение работает в браузере
- ✅ Real-time обновления работают корректно
- ✅ Нет упоминаний Supabase в коде (кроме истории git)
- ✅ Зависимость `@supabase/supabase-js` удалена
