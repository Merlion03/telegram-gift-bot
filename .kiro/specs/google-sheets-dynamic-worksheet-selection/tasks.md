# Implementation Plan: Google Sheets Dynamic Worksheet Selection

## Обзор

Данный план реализует исправление критической ошибки в GoogleSheetsClient, которая приводит к сохранению данных доставки на неправильный лист. Реализация добавляет поддержку динамического выбора листа на основе данных из Prize_Database через Backend API.

## Ключевые изменения

- Новые модули: SheetNameValidator, PrizeClient, типы для работы с призами
- Модификация GoogleSheetsClient: добавление параметра sheetName, проверка существования листа
- Модификация Delivery API: интеграция с Backend API
- Backend API: новый endpoint GET /api/prize/{prize_id}
- Обновление всех существующих тестов (16 unit + 4 property)

## Tasks

- [x] 1. Создать модуль валидации sheet_name
  - [x] 1.1 Создать файл `lib/utils/sheetNameValidator.ts`
    - Реализовать функцию `validateSheetName()` с проверками: пустая строка, длина ≤ 100, недопустимые символы
    - Реализовать функцию `isValidSheetName()` без выброса исключений
    - Экспортировать константы `FORBIDDEN_CHARACTERS` и `MAX_SHEET_NAME_LENGTH`
    - Создать класс ошибки `InvalidSheetNameError`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 1.2 Написать unit тесты для SheetNameValidator
    - Тесты для валидных названий листов
    - Тесты для пустых строк и строк с пробелами
    - Тесты для каждого недопустимого символа отдельно
    - Тесты для слишком длинных названий (> 100 символов)
    - Тесты для функции `isValidSheetName()`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 1.3 Написать property тесты для SheetNameValidator
    - **Property 17: Система валидирует пустые sheet_name**
    - **Validates: Requirements 2.4, 10.1**
    - **Property 18: Система валидирует недопустимые символы в sheet_name**
    - **Validates: Requirements 10.2, 10.4**
    - **Property 19: Система валидирует длину sheet_name**
    - **Validates: Requirements 10.3**

- [x] 2. Создать типы и классы ошибок для работы с призами
  - [x] 2.1 Создать файл `lib/types/prize.ts`
    - Определить интерфейс `PrizeInfo` с полями: sheet_name, row_id, code_word
    - Создать класс ошибки `PrizeNotFoundError`
    - Создать класс ошибки `BackendUnavailableError`
    - _Requirements: 1.1, 1.2, 9.3_

- [x] 3. Создать HTTP клиент для Backend API
  - [x] 3.1 Создать файл `lib/api/prizeClient.ts`
    - Реализовать класс `PrizeClient` с методом `getPrizeInfo(prizeId)`
    - Добавить обработку HTTP 404 (приз не найден)
    - Добавить обработку сетевых ошибок и timeout (5 секунд)
    - Валидировать структуру JSON ответа от Backend
    - Логировать все ошибки взаимодействия с Backend
    - _Requirements: 1.1, 1.2, 1.4, 9.2, 9.3_
  
  - [x] 3.2 Написать unit тесты для PrizeClient
    - Тест успешного получения информации о призе
    - Тест обработки HTTP 404
    - Тест обработки HTTP 500 и других ошибок
    - Тест обработки timeout
    - Тест обработки сетевых ошибок
    - Тест валидации структуры ответа (отсутствующие поля)
    - _Requirements: 1.1, 1.2, 1.4, 9.3_
  
  - [x] 3.3 Написать property тесты для PrizeClient
    - **Property 1: Backend API возвращает полную информацию о призе**
    - **Validates: Requirements 1.1, 1.5**
    - **Property 2: Backend API отклоняет несуществующие prize_id**
    - **Validates: Requirements 1.2**
    - **Property 3: Backend API валидирует формат prize_id**
    - **Validates: Requirements 1.4**

- [x] 4. Checkpoint - Проверка новых модулей
  - Убедиться, что все новые модули компилируются без ошибок
  - Запустить тесты для новых модулей
  - Спросить пользователя, если возникли вопросы

- [x] 5. Модифицировать GoogleSheetsClient для поддержки динамического sheet_name
  - [x] 5.1 Добавить типы ошибок для работы с листами
    - Создать файл `lib/types/sheet.ts`
    - Определить класс `SheetError` (базовый)
    - Определить класс `SheetNotFoundError`
    - Определить класс `SheetAccessDeniedError`
    - _Requirements: 4.2, 6.1, 6.2_
  
  - [x] 5.2 Модифицировать класс GoogleSheetsClient
    - Добавить приватное поле `sheetCache: Map<string, boolean>`
    - Удалить метод `getSheetName()` и поле `sheetName`
    - Добавить приватный метод `getAllSheetNames()` для получения списка всех листов
    - Добавить приватный метод `verifySheetExists(sheetName)` с кэшированием
    - Модифицировать метод `saveDeliveryData()`: добавить обязательный параметр `sheetName`
    - Добавить валидацию `sheetName` через `validateSheetName()`
    - Добавить проверку существования листа через `verifySheetExists()`
    - Обновить формирование диапазонов: использовать `${sheetName}!{column}{row}`
    - Добавить логирование: "Using sheet: {sheetName} for row {rowId}"
    - Добавить логирование: "Verifying sheet '{sheetName}' exists"
    - Добавить логирование: "Successfully saved delivery data to sheet '{sheetName}', row {rowId}"
    - Добавить логирование ошибок с контекстом (sheetName, rowId, stack trace)
    - Обработать ошибки Google Sheets API: "Unable to parse range" → SheetNotFoundError
    - Обработать ошибки доступа: "permission"/"access" → SheetAccessDeniedError
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.5, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4_
  
  - [x] 5.3 Обновить существующие unit тесты GoogleSheetsClient (16 тестов)
    - Обновить моки: добавить мок для `spreadsheets.get()` с возвратом списка листов
    - Обновить все вызовы `saveDeliveryData()`: добавить третий параметр `sheetName`
    - Обновить assertions: проверять использование `sheetName` в диапазонах
    - Добавить новые тесты: проверка существования листа
    - Добавить новые тесты: обработка несуществующего листа
    - Добавить новые тесты: кэширование проверок существования
    - Добавить новые тесты: логирование использования листа
    - Добавить новые тесты: логирование проверки существования
    - Добавить новые тесты: логирование успешного сохранения
    - Добавить новые тесты: логирование ошибок с контекстом
    - _Requirements: 3.2, 3.5, 4.1, 4.2, 4.3, 4.5, 5.2, 7.1, 7.2, 7.3, 7.4_
  
  - [x] 5.4 Обновить существующие property тесты GoogleSheetsClient (4 теста)
    - Добавить генератор `validSheetNameArbitrary`
    - Обновить все вызовы `saveDeliveryData()`: добавить параметр `sheetName`
    - Обновить assertions: проверять использование `sheetName` в диапазонах
    - _Requirements: 3.2, 3.5, 5.2_
  
  - [x] 5.5 Написать новые property тесты для GoogleSheetsClient
    - **Property 7: GoogleSheetsClient использует переданный sheet_name в диапазонах**
    - **Validates: Requirements 3.2, 3.5**
    - **Property 8: GoogleSheetsClient не вызывает getSheetName при явной передаче**
    - **Validates: Requirements 3.3**
    - **Property 9: GoogleSheetsClient проверяет существование листа**
    - **Validates: Requirements 4.1**
    - **Property 10: GoogleSheetsClient отклоняет несуществующие листы**
    - **Validates: Requirements 4.2**
    - **Property 11: GoogleSheetsClient кэширует проверки существования**
    - **Validates: Requirements 4.3**
    - **Property 21: Round-trip сохранения с динамическим листом**
    - **Validates: Requirements 3.2, 3.5**
    - **Property 22: Идемпотентность сохранения на динамический лист**
    - **Validates: Requirements 3.2, 3.5**

- [x] 6. Checkpoint - Проверка модификаций GoogleSheetsClient
  - Убедиться, что все тесты GoogleSheetsClient проходят (16 unit + 4 property + новые)
  - Проверить отсутствие регрессий в функциональности
  - Спросить пользователя, если возникли вопросы

- [x] 7. Модифицировать Delivery API для интеграции с Backend
  - [x] 7.1 Обновить файл `app/api/delivery/route.ts`
    - Добавить импорты: PrizeClient, PrizeInfo, PrizeNotFoundError, BackendUnavailableError
    - Добавить импорты: validateSheetName, SheetNotFoundError, SheetAccessDeniedError
    - Добавить проверку переменной окружения `BACKEND_API_URL`
    - Создать экземпляр `PrizeClient` с `BACKEND_API_URL`
    - Добавить получение информации о призе через `prizeClient.getPrizeInfo(prize_id)`
    - Обработать ошибку `PrizeNotFoundError`: вернуть HTTP 404
    - Обработать ошибку `BackendUnavailableError`: вернуть HTTP 503
    - Добавить валидацию `sheet_name` через `validateSheetName()`
    - Добавить логирование: "Using sheet: {sheet_name} for prize {prize_id}"
    - Обновить вызов `saveDeliveryData()`: передать `prizeInfo.row_id` и `prizeInfo.sheet_name`
    - Обработать ошибку `SheetNotFoundError`: вернуть HTTP 500 с сообщением "Лист не найден в таблице"
    - Обработать ошибку `SheetAccessDeniedError`: вернуть HTTP 500 с сообщением "Нет доступа к листу"
    - Логировать все ошибки с контекстом (prize_id, sheet_name, telegram_id)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.3, 6.4, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 7.2 Написать property тесты для Delivery API
    - **Property 4: Delivery API получает sheet_name из Backend**
    - **Validates: Requirements 2.1, 9.2**
    - **Property 5: Delivery API передает sheet_name в GoogleSheetsClient**
    - **Validates: Requirements 2.2, 9.5**
    - **Property 6: Delivery API логирует sheet_name**
    - **Validates: Requirements 2.5, 7.5**
    - **Property 16: Delivery API обрабатывает ошибки GoogleSheetsClient**
    - **Validates: Requirements 6.4**
    - **Property 20: Delivery API парсит JSON ответ Backend**
    - **Validates: Requirements 9.3**

- [x] 8. Реализовать Backend API endpoint
  - [x] 8.1 Создать endpoint GET /api/prize/{prize_id} в Python backend
    - Создать функцию `get_prize(prize_id)` для обработки запроса
    - Валидировать `prize_id`: должен быть положительным целым числом
    - Вернуть HTTP 400 для невалидного `prize_id`
    - Выполнить запрос к Prize_Database для получения информации о призе
    - Вернуть HTTP 404 если приз не найден
    - Вернуть HTTP 200 с JSON объектом: {sheet_name, row_id, code_word}
    - Обработать исключения базы данных: вернуть HTTP 500
    - Логировать все ошибки
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 8.2 Создать функцию для работы с Prize_Database
    - Создать функцию `get_prize_info(prize_id)` для запроса к SQLite
    - Выполнить SELECT запрос: `SELECT sheet_name, row_id, code_word WHERE prize_id = ?`
    - Вернуть dict с полями или None если приз не найден
    - Корректно закрывать соединение с БД в блоке finally
    - _Requirements: 1.1, 1.5_
  
  - [x] 8.3 Написать unit тесты для Backend API endpoint
    - Тест успешного получения информации о призе (HTTP 200)
    - Тест обработки несуществующего prize_id (HTTP 404)
    - Тест валидации prize_id: отрицательное число (HTTP 400)
    - Тест валидации prize_id: нецелое число (HTTP 400)
    - Тест обработки ошибок базы данных (HTTP 500)
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 9. Настроить переменные окружения
  - [x] 9.1 Добавить BACKEND_API_URL в конфигурацию
    - Добавить `BACKEND_API_URL=http://localhost:5000` в `.env`
    - Добавить `BACKEND_API_URL=http://localhost:5000` в `.env.test`
    - Добавить пример в `.env.example` с комментарием
    - _Requirements: 9.1_

- [ ] 10. Checkpoint - Интеграционное тестирование
  - Запустить все тесты: `npm test` для Frontend
  - Запустить все тесты для Backend (если есть)
  - Проверить end-to-end flow: форма доставки → Backend API → Google Sheets
  - Убедиться, что данные сохраняются на правильный лист
  - Спросить пользователя, если возникли вопросы

- [ ] 11. Написать integration тесты для end-to-end flow
  - [ ] 11.1 Создать файл `app/api/delivery/__tests__/route.integration.test.ts`
    - Тест успешного flow: получение sheet_name из Backend и сохранение в Google Sheets
    - Тест обработки HTTP 404 от Backend (приз не найден)
    - Тест обработки HTTP 503 (Backend недоступен)
    - Тест обработки невалидного sheet_name от Backend
    - Тест обработки несуществующего листа в Google Sheets
    - _Requirements: 2.1, 2.2, 2.3, 6.4, 9.2, 9.4, 9.5_

- [ ] 12. Финальная проверка и валидация
  - Убедиться, что все 20 существующих тестов проходят
  - Убедиться, что все новые тесты проходят
  - Проверить покрытие кода тестами (цель: ≥ 90%)
  - Проверить отсутствие TypeScript ошибок: `npm run type-check`
  - Проверить отсутствие lint ошибок: `npm run lint`
  - Выполнить ручное тестирование: отправить форму доставки и проверить сохранение на правильный лист

## Примечания

- Задачи, помеченные `*`, являются опциональными и могут быть пропущены для более быстрого MVP
- Каждая задача ссылается на конкретные requirements для трассируемости
- Checkpoints обеспечивают инкрементальную валидацию
- Property тесты валидируют универсальные свойства корректности
- Unit тесты валидируют конкретные примеры и edge cases
- Следовать принципу "Zero Tolerance Policy": любая ошибка исправляется немедленно

## Критерии завершения

- ✅ Все новые модули созданы и протестированы
- ✅ GoogleSheetsClient модифицирован и использует динамический sheet_name
- ✅ Delivery API интегрирован с Backend API
- ✅ Backend API endpoint реализован и работает
- ✅ Все 20 существующих тестов обновлены и проходят
- ✅ Все 22 correctness properties реализованы в property тестах
- ✅ Покрытие кода тестами ≥ 90%
- ✅ Переменные окружения настроены
- ✅ Отсутствуют TypeScript и lint ошибки
