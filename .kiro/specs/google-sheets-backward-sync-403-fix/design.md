# Google Sheets Backward Sync 403 Fix - Bugfix Design

## Overview

Исправление ошибки `APIError: [403]: Request had insufficient authentication scopes`, возникающей при обратной синхронизации данных доставки из PostgreSQL в Google Sheets. Проблема вызвана использованием readonly scopes в методе `_init_client()` класса `SyncService`, что блокирует операции записи через `worksheet.batch_update()`. Решение заключается в замене readonly scopes на полные scopes с правами на чтение и запись, аналогично реализации в `GoogleSheetsService`.

## Glossary

- **Bug_Condition (C)**: Условие, при котором возникает баг - когда `SyncService` пытается выполнить операцию записи в Google Sheets (batch_update) с credentials, имеющими только readonly scopes
- **Property (P)**: Желаемое поведение - операции записи в Google Sheets должны выполняться успешно с кодом 200, данные доставки должны быть записаны в столбцы E-P
- **Preservation**: Существующая функциональность прямой синхронизации (Google Sheets → PostgreSQL) и чтения данных должна остаться неизменной
- **SyncService**: Сервис в `telegram-bot/services/sync_service.py`, отвечающий за двустороннюю синхронизацию между Google Sheets и PostgreSQL
- **GoogleSheetsService**: Старый сервис в `telegram-bot/services/google_sheets_service.py`, использующий полные scopes и работающий корректно
- **batch_update**: Метод gspread для массового обновления ячеек в Google Sheets, требующий прав на запись
- **readonly scopes**: OAuth2 scopes `spreadsheets.readonly` и `drive.readonly`, позволяющие только чтение данных
- **full scopes**: OAuth2 scopes `spreadsheets` и `drive`, позволяющие чтение и запись данных

## Bug Details

### Bug Condition

Баг проявляется когда пользователь заполняет форму доставки через веб-приложение, данные сохраняются в PostgreSQL, и система пытается выполнить обратную синхронизацию (PostgreSQL → Google Sheets) для обновления столбцов E-P с данными доставки. Метод `_sync_sheet_delivery_data()` вызывает `worksheet.batch_update()`, но Google Sheets API отклоняет запрос с ошибкой 403, так как gspread клиент был инициализирован с readonly scopes.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type SyncOperation
  OUTPUT: boolean
  
  RETURN input.operation_type == 'BACKWARD_SYNC'
         AND input.method == 'batch_update'
         AND input.client_scopes CONTAINS 'spreadsheets.readonly'
         AND NOT input.client_scopes CONTAINS 'spreadsheets'
END FUNCTION
```

### Examples

- **Пример 1**: Пользователь заполняет форму доставки с данными (ФИО, адрес, телефон) → данные сохраняются в PostgreSQL → вызывается `sync_delivery_data_to_sheets()` → метод `_sync_sheet_delivery_data()` пытается выполнить `worksheet.batch_update()` → Google Sheets API возвращает `APIError: [403]: Request had insufficient authentication scopes` → данные НЕ записываются в Google Sheets
  - **Ожидаемое поведение**: данные должны быть успешно записаны в столбцы E-P соответствующей строки
  
- **Пример 2**: В PostgreSQL есть 5 призов с заполненными данными доставки → вызывается обратная синхронизация → для каждого приза формируется batch_data с диапазоном `E{row_id}:P{row_id}` → вызов `worksheet.batch_update(batch_data)` → ошибка 403 → логируется `sheet_backward_sync_error`
  - **Ожидаемое поведение**: все 5 записей должны быть обновлены в Google Sheets, логируется `sheet_backward_sync_batch_update_completed` с `records_updated=5`

- **Пример 3**: Sync worker выполняет периодическую обратную синхронизацию → находит призы с `delivery_data_updated_at > last_synced_at` → пытается синхронизировать данные → ошибка 403 → данные остаются несинхронизированными между PostgreSQL и Google Sheets
  - **Ожидаемое поведение**: данные должны быть синхронизированы, `last_synced_at` обновляется

- **Edge case**: Пользователь заполняет форму доставки для приза, который находится в листе с кириллическим названием (например, "Январь 2024") → обратная синхронизация → ошибка 403 независимо от названия листа
  - **Ожидаемое поведение**: данные должны быть записаны в любой лист, независимо от его названия

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Прямая синхронизация (Google Sheets → PostgreSQL) через метод `sync_all_sheets()` должна продолжать работать без изменений
- Чтение данных из Google Sheets через методы `_read_sheet_data()` и `_read_sheet_data_sync()` должно работать идентично
- Получение списка листов через `_get_all_sheet_names()` должно работать без изменений
- Преобразование данных из Google Sheets в объекты Prize через `_convert_sheet_data_to_prizes()` должно работать без изменений
- Batch upsert в PostgreSQL через `_batch_upsert_prizes()` должен работать без изменений
- Авторизация через service account credentials из `credentials/google-credentials.json` должна работать без изменений

**Scope:**
Все операции, которые НЕ включают запись в Google Sheets (batch_update), должны быть полностью не затронуты этим исправлением. Это включает:
- Все операции чтения из Google Sheets
- Все операции записи в PostgreSQL
- Логику преобразования данных между форматами
- Обработку ошибок и retry логику
- Логирование операций

## Hypothesized Root Cause

На основе анализа кода и описания бага, наиболее вероятная причина:

1. **Некорректные OAuth2 Scopes**: Метод `_init_client()` в `SyncService` использует readonly scopes:
   ```python
   scopes = [
       'https://www.googleapis.com/auth/spreadsheets.readonly',
       'https://www.googleapis.com/auth/drive.readonly'
   ]
   ```
   Эти scopes позволяют только чтение данных, но блокируют любые операции записи (update, append, batch_update).

2. **Несоответствие с GoogleSheetsService**: Старый `GoogleSheetsService` использует полные scopes:
   ```python
   scopes = [
       'https://www.googleapis.com/auth/spreadsheets',
       'https://www.googleapis.com/auth/drive'
   ]
   ```
   Эти scopes позволяют как чтение, так и запись, поэтому `GoogleSheetsService` работает корректно.

3. **Изначальный Design для Read-Only**: Вероятно, `SyncService` изначально проектировался только для прямой синхронизации (чтение из Google Sheets), и readonly scopes были выбраны из соображений безопасности. Позже была добавлена обратная синхронизация (запись в Google Sheets), но scopes не были обновлены.

4. **Google Sheets API Permissions**: Google Sheets API строго проверяет scopes при каждом запросе. Операция `batch_update` требует scope `spreadsheets` (или более специфичный `spreadsheets.write`), и отклоняет запросы с `spreadsheets.readonly` с кодом 403.

## Correctness Properties

Property 1: Bug Condition - Backward Sync Write Operations

_For any_ sync operation where обратная синхронизация пытается записать данные доставки в Google Sheets через batch_update (isBugCondition returns true), исправленный метод `_init_client()` SHALL инициализировать gspread клиент с полными scopes (`spreadsheets`, `drive`), и операция batch_update SHALL выполниться успешно с кодом 200, записав данные в столбцы E-P указанных строк.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Read Operations and Forward Sync

_For any_ sync operation где НЕ выполняется запись в Google Sheets (isBugCondition returns false), включая прямую синхронизацию (Google Sheets → PostgreSQL), чтение данных, получение списка листов, исправленный код SHALL производить точно такой же результат, как и оригинальный код, сохраняя всю существующую функциональность чтения и прямой синхронизации.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `telegram-bot/services/sync_service.py`

**Function**: `_init_client()`

**Specific Changes**:
1. **Замена Readonly Scopes на Full Scopes**: Изменить список scopes с readonly на полные права
   - Было: `'https://www.googleapis.com/auth/spreadsheets.readonly'`
   - Стало: `'https://www.googleapis.com/auth/spreadsheets'`
   - Было: `'https://www.googleapis.com/auth/drive.readonly'`
   - Стало: `'https://www.googleapis.com/auth/drive'`

2. **Обновление Комментария**: Обновить комментарий в методе, чтобы отразить, что scopes используются для чтения И записи
   - Было: "Определяем необходимые scopes для работы с Google Sheets"
   - Стало: "Определяем необходимые scopes для чтения и записи в Google Sheets"

3. **Проверка Credentials**: Убедиться, что service account в `credentials/google-credentials.json` имеет необходимые права на запись в целевую Google Sheets таблицу (должен быть добавлен как Editor или Owner)

4. **Логирование**: Логирование остаётся без изменений, так как оно уже корректно отражает успешную инициализацию клиента

5. **Обработка Ошибок**: Обработка ошибок остаётся без изменений, так как она уже корректно ловит и логирует исключения при инициализации

### Minimal Code Change

Изменение затрагивает только 2 строки кода в методе `_init_client()`:

```python
# Строки 68-69 (приблизительно)
scopes = [
    'https://www.googleapis.com/auth/spreadsheets',      # было: spreadsheets.readonly
    'https://www.googleapis.com/auth/drive'              # было: drive.readonly
]
```

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала поверхностно демонстрируем баг на неисправленном коде (exploratory bug condition checking), затем проверяем, что исправление работает корректно и сохраняет существующее поведение (fix checking и preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Продемонстрировать баг ДО внесения исправления. Подтвердить или опровергнуть анализ первопричины. Если опровергнем, потребуется пересмотр гипотезы.

**Test Plan**: Написать тесты, которые симулируют обратную синхронизацию с данными доставки на НЕИСПРАВЛЕННОМ коде. Запустить эти тесты и наблюдать ошибку 403. Проверить, что ошибка действительно связана с недостаточными scopes.

**Test Cases**:
1. **Backward Sync Single Record Test**: Создать один приз с данными доставки в PostgreSQL → вызвать `sync_delivery_data_to_sheets()` → ожидать ошибку `APIError: [403]` (will fail on unfixed code)
2. **Backward Sync Multiple Records Test**: Создать 5 призов с данными доставки → вызвать обратную синхронизацию → ожидать ошибку 403 при попытке batch_update (will fail on unfixed code)
3. **Backward Sync Different Sheets Test**: Создать призы в разных листах (например, "Январь 2024", "Февраль 2024") → вызвать обратную синхронизацию → ожидать ошибку 403 для каждого листа (will fail on unfixed code)
4. **Scope Verification Test**: Проверить, что gspread клиент инициализирован с readonly scopes → попытаться выполнить batch_update → ожидать ошибку 403 (will fail on unfixed code)

**Expected Counterexamples**:
- `APIError: [403]: Request had insufficient authentication scopes` при вызове `worksheet.batch_update()`
- Логирование `sheet_backward_sync_error` с текстом ошибки о недостаточных правах
- Данные доставки остаются несинхронизированными между PostgreSQL и Google Sheets
- Possible causes: readonly scopes в `_init_client()`, отсутствие прав у service account, некорректная конфигурация credentials

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где выполняется bug condition, исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := _sync_sheet_delivery_data_fixed(input)
  ASSERT result.status_code == 200
  ASSERT result.records_updated > 0
  ASSERT google_sheets_data_matches_postgresql_data(input)
END FOR
```

**Test Plan**: После внесения исправления (замена scopes), запустить те же тесты и проверить, что:
- Ошибка 403 больше не возникает
- `worksheet.batch_update()` выполняется успешно
- Данные доставки корректно записываются в столбцы E-P
- Логируется `sheet_backward_sync_batch_update_completed` с корректным количеством обновлённых записей

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где bug condition НЕ выполняется, исправленная функция производит точно такой же результат, как и оригинальная функция.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT sync_all_sheets_original(input) = sync_all_sheets_fixed(input)
  ASSERT _read_sheet_data_original(input) = _read_sheet_data_fixed(input)
  ASSERT _get_all_sheet_names_original(input) = _get_all_sheet_names_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев по всему входному домену
- Ловит edge cases, которые могут быть пропущены в ручных unit тестах
- Предоставляет сильные гарантии, что поведение не изменилось для всех операций чтения

**Test Plan**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для операций чтения и прямой синхронизации, затем написать property-based тесты, захватывающие это поведение.

**Test Cases**:
1. **Forward Sync Preservation**: Наблюдать, что `sync_all_sheets()` корректно читает данные из Google Sheets и записывает в PostgreSQL на неисправленном коде → написать тест, проверяющий, что это поведение сохраняется после исправления
2. **Read Operations Preservation**: Наблюдать, что `_read_sheet_data()` корректно читает все строки из листа на неисправленном коде → написать тест, проверяющий идентичность результатов до и после исправления
3. **Sheet Names Retrieval Preservation**: Наблюдать, что `_get_all_sheet_names()` возвращает корректный список листов на неисправленном коде → написать тест, проверяющий идентичность результатов
4. **Data Conversion Preservation**: Наблюдать, что `_convert_sheet_data_to_prizes()` корректно преобразует данные на неисправленном коде → написать тест, проверяющий идентичность результатов

### Unit Tests

- Тест инициализации gspread клиента с полными scopes (проверка, что scopes содержат `spreadsheets` и `drive`)
- Тест успешного выполнения `batch_update` для одной записи
- Тест успешного выполнения `batch_update` для множественных записей
- Тест обратной синхронизации для разных листов
- Тест edge case: обратная синхронизация для приза с частично заполненными данными доставки (некоторые поля None)
- Тест edge case: обратная синхронизация для приза с кириллическими символами в данных
- Тест edge case: обратная синхронизация для листа с кириллическим названием

### Property-Based Tests

- Генерировать случайные данные доставки (ФИО, адреса, телефоны) и проверять, что обратная синхронизация успешно записывает их в Google Sheets
- Генерировать случайные конфигурации листов (разные названия, разное количество строк) и проверять, что обратная синхронизация работает для всех конфигураций
- Генерировать случайные комбинации операций чтения и записи и проверять, что операции чтения продолжают работать идентично после исправления
- Тест preservation: генерировать случайные входные данные для прямой синхронизации и проверять, что результаты идентичны до и после исправления

### Integration Tests

- Полный цикл: пользователь заполняет форму доставки → данные сохраняются в PostgreSQL → обратная синхронизация → данные появляются в Google Sheets → прямая синхронизация → данные остаются корректными в PostgreSQL
- Тест с sync_worker: запустить sync_worker → дождаться периодической обратной синхронизации → проверить, что данные синхронизированы
- Тест переключения между операциями: выполнить прямую синхронизацию → выполнить обратную синхронизацию → выполнить снова прямую синхронизацию → проверить консистентность данных
- Тест визуальной проверки: после обратной синхронизации открыть Google Sheets в браузере и проверить, что столбцы E-P заполнены корректными данными
