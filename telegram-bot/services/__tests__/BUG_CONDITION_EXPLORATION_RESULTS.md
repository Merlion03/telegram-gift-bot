# Bug Condition Exploration Results

## Дата: 2026-04-03

## Статус: БАГ ПОДТВЕРЖДЁН ✓

## Exploratory Test Results

### Test: `test_bug_condition_backward_sync_403_error_readonly_scopes`

**Цель**: Продемонстрировать баг обратной синхронизации с readonly scopes

**Результат**: ✓ Тест УПАЛ как ожидалось - баг подтверждён

### Counterexamples

#### Counterexample 1: Лист1
- **Sheet Name**: Лист1
- **Row ID**: 2
- **Prize ID**: 1
- **Error**: `APIError: [403]: Request had insufficient authentication scopes.`
- **Status Code**: 403

#### Counterexample 2: Январь 2024
- **Sheet Name**: Январь 2024
- **Row ID**: 5
- **Prize ID**: 2
- **Error**: `APIError: [403]: Request had insufficient authentication scopes.`
- **Status Code**: 403

### Первопричина (Root Cause)

**Подтверждено**: `_init_client()` использует readonly scopes:
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/drive.readonly`

Эти scopes блокируют операции записи (`batch_update`) в Google Sheets.

### Решение

Заменить readonly scopes на full scopes в методе `_init_client()`:
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`

### Bug Condition Validation

**Bug Condition**: 
```
isBugCondition(input) где
  input.operation_type == 'BACKWARD_SYNC' AND
  input.method == 'batch_update' AND
  input.client_scopes CONTAINS 'spreadsheets.readonly'
```

**Статус**: ✓ Подтверждено

### Scope Verification Test

**Test**: `test_bug_condition_scopes_verification`

**Результат**: ✓ PASSED

**Подтверждено**:
- `_init_client()` использует `spreadsheets.readonly` ✓
- `_init_client()` использует `drive.readonly` ✓
- `_init_client()` НЕ использует `spreadsheets` (full scope) ✓
- `_init_client()` НЕ использует `drive` (full scope) ✓

## Выводы

1. Баг существует и воспроизводится детерминистично
2. Первопричина подтверждена - использование readonly scopes
3. Решение очевидно - замена на full scopes
4. Тест готов для валидации исправления (после fix тест должен пройти)

## Следующие шаги

1. ✓ Task 1: Exploratory тест написан и запущен - БАГ ПОДТВЕРЖДЁН
2. → Task 2: Написать preservation property тесты
3. → Task 3: Внести исправление в `_init_client()`
4. → Task 3.2: Перезапустить exploratory тест - должен ПРОЙТИ
5. → Task 3.3: Перезапустить preservation тесты - должны ПРОЙТИ

## Validates

- Requirements: 1.1, 1.2, 1.3
- Bug Condition Properties: 2.1, 2.2, 2.3
