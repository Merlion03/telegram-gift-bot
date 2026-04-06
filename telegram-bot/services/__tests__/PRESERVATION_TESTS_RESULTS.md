# Preservation Property Tests - Результаты выполнения

## Дата: 2026-04-03

## Статус: ЧАСТИЧНО ПРОЙДЕНЫ (2/8 тестов)

## Цель тестирования

Зафиксировать текущее корректное поведение системы синхронизации, которое должно сохраниться после исправления бага full sync. Тесты запущены на НЕФИКСИРОВАННОМ коде.

## Результаты тестов

### ✅ ПРОЙДЕНО: test_preservation_delivery_data_protection
**Requirement**: 3.1 - Защита данных доставки для claimed_at IS NOT NULL

**Проверяемое поведение**: Данные доставки защищены от перезаписи из Google Sheets при forward sync

**Результат**: PASSED - Подтверждено, что SyncService НЕ передаёт поля доставки (last_name, first_name, phone) из Google Sheets в batch_upsert_prizes, что позволяет PrizeRepository применить логику защиты

### ✅ ПРОЙДЕНО: test_preservation_backward_sync_continues_working  
**Requirement**: 3.3 - Backward sync (PostgreSQL → Google Sheets) продолжает работать

**Проверяемое поведение**: Backward sync не затронут исправлением forward sync

**Результат**: PASSED - Подтверждено, что _sync_sheet_delivery_data корректно записывает данные доставки в столбцы E-P Google Sheets

### ❌ ТРЕБУЕТ ИСПРАВЛЕНИЯ: test_preservation_new_records_insertion
**Requirement**: 3.2 - Вставка новых записей из Google Sheets

**Ошибка**: AssertionError - неправильный порядок полей в sheet_data (code_word и prize_type перепутаны)

**Причина**: В тестовых данных порядок столбцов не соответствует реальной структуре Google Sheets

**Действие**: Исправить порядок столбцов в sheet_data

### ❌ ТРЕБУЕТ ИСПРАВЛЕНИЯ: test_preservation_delivery_data_protection_in_repository
**Requirement**: 3.1 - Защита данных доставки на уровне Repository

**Ошибка**: ImportError - cannot import name 'Database' from 'database.connection'

**Причина**: Неправильный импорт - Database находится в другом модуле

**Действие**: Исправить импорт или удалить тест (основная проверка уже есть в test_preservation_delivery_data_protection)

### ❌ ТРЕБУЕТ ИСПРАВЛЕНИЯ: test_preservation_graceful_degradation_on_sheet_error
**Requirement**: 3.4 - Graceful degradation при ошибках одного листа

**Ошибка**: KeyError: 'sheets_synced'

**Причина**: Неправильная структура результата sync_all_sheets - ключи не соответствуют реальной реализации

**Действие**: Изучить реальную структуру результата sync_all_sheets и исправить assertions

### ❌ ТРЕБУЕТ ИСПРАВЛЕНИЯ: test_preservation_no_unnecessary_updates
**Requirement**: 3.5 - Отсутствие лишних UPDATE для неизменённых записей

**Ошибка**: ImportError - cannot import name 'Database' from 'database.connection'

**Причина**: Неправильный импорт

**Действие**: Исправить импорт или упростить тест

### ❌ ТРЕБУЕТ ИСПРАВЛЕНИЯ: test_preservation_full_cycle_integration
**Requirements**: 3.1, 3.2, 3.4 - Полный цикл preservation

**Ошибка**: KeyError: 'sheets_synced'

**Причина**: Неправильная структура результата sync_all_sheets

**Действие**: Исправить assertions для соответствия реальной структуре

### ❌ ТРЕБУЕТ ИСПРАВЛЕНИЯ: test_preservation_property_comprehensive
**Requirements**: 3.1, 3.2, 3.5 - Комплексная проверка preservation (Property-Based)

**Ошибка**: AssertionError - неправильный порядок полей в sheet_data

**Причина**: Та же проблема с порядком столбцов

**Действие**: Исправить порядок столбцов в sheet_data

## Наблюдения

### Подтверждённое поведение (из успешных тестов):

1. **Защита данных доставки работает корректно**:
   - SyncService НЕ передаёт поля доставки из Google Sheets
   - Это позволяет PrizeRepository применить CASE WHEN логику для защиты

2. **Backward sync работает корректно**:
   - Метод _sync_sheet_delivery_data успешно записывает данные в Google Sheets
   - Данные записываются в столбцы E-P
   - batch_update вызывается с корректными параметрами

### Требуемые исправления:

1. **Порядок столбцов в sheet_data**: Нужно изучить реальную структуру Google Sheets и исправить тестовые данные

2. **Импорт Database**: Найти правильный модуль или упростить тесты

3. **Структура результата sync_all_sheets**: Изучить реальную реализацию и исправить assertions

## Следующие шаги

1. Исправить порядок столбцов в тестовых данных
2. Изучить реальную структуру результата sync_all_sheets
3. Исправить или удалить тесты с проблемными импортами
4. Перезапустить все тесты
5. Убедиться, что все тесты проходят на нефиксированном коде

## Важно

Эти тесты должны ПРОЙТИ на нефиксированном коде, чтобы зафиксировать baseline поведение. После исправления бага (Task 3) эти же тесты должны продолжать проходить, подтверждая отсутствие регрессий.
