# Backward Sync Column Overwrite Fix - Bugfix Design

## Overview

Баг проявляется при обратной синхронизации данных доставки из PostgreSQL в Google Sheets: метод `_sync_sheet_delivery_data` перезаписывает столбцы E (Промокод) и F (Инструкция), которые содержат критически важные данные для цифровых призов. Это происходит из-за неправильного указания диапазона обновления - данные доставки записываются в диапазон `E{row_id}:P{row_id}` вместо корректного `G{row_id}:R{row_id}`.

Стратегия исправления: изменить диапазон записи данных доставки с E:P на G:R, сохранив столбцы E и F нетронутыми. Это минимальное изменение затрагивает только метод `_sync_sheet_delivery_data` и не влияет на forward sync или другие части системы.

## Glossary

- **Bug_Condition (C)**: Условие, при котором баг проявляется - когда backward sync записывает данные доставки для записи с заполненными промокодом и инструкцией
- **Property (P)**: Желаемое поведение - данные доставки записываются в столбцы G-R, промокод и инструкция в столбцах E-F остаются нетронутыми
- **Preservation**: Существующее поведение forward sync, backward sync для физических призов и записей без промокода, которое должно остаться неизменным
- **_sync_sheet_delivery_data**: Метод в `telegram-bot/services/sync_service.py` (строка 976), который выполняет batch update данных доставки в Google Sheets
- **claimed_at**: Поле в модели Prize, указывающее на наличие заполненных данных доставки (NOT NULL означает, что пользователь заполнил форму доставки)
- **row_id**: Номер строки в Google Sheets, где находится запись приза (хранится в PostgreSQL для синхронизации)

## Bug Details

### Bug Condition

Баг проявляется когда backward sync обновляет данные доставки в Google Sheets для записей с цифровыми призами. Метод `_sync_sheet_delivery_data` формирует batch update с диапазоном `E{row_id}:P{row_id}`, что приводит к перезаписи столбцов E (промокод) и F (инструкция) пустыми значениями из полей `last_name` и `first_name`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type Prize (запись из PostgreSQL)
  OUTPUT: boolean
  
  RETURN input.claimed_at IS NOT NULL
         AND input.prize_type == 'digital'
         AND (input.promo_code IS NOT NULL OR input.instructions IS NOT NULL)
         AND backward_sync_is_running()
END FUNCTION
```

### Examples

- **Пример 1**: Пользователь получает цифровой приз с промокодом "PROMO123" и инструкцией "Активируйте на сайте". После заполнения данных доставки (для физической части приза) backward sync перезаписывает столбцы E и F, промокод и инструкция исчезают из Google Sheets.

- **Пример 2**: В Google Sheets есть запись: telegram_id=12345, code_word="слово", prize_type="digital", promo_code="ABC", instructions="Инструкция". После backward sync столбец E содержит пустую строку (вместо "ABC"), столбец F содержит пустую строку (вместо "Инструкция").

- **Пример 3**: Запись с физическим призом (prize_type="physical") обновляется корректно, так как столбцы E и F не используются для физических призов.

- **Edge case**: Запись с цифровым призом без промокода и инструкции (promo_code=NULL, instructions=NULL) - баг не критичен, так как перезаписываются пустые значения, но диапазон всё равно неправильный.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Forward sync должен продолжать корректно читать промокод из столбца E и инструкцию из столбца F
- Forward sync должен продолжать корректно читать данные доставки из столбцов G-R
- Backward sync для физических призов должен продолжать корректно записывать все 12 полей данных доставки
- Backward sync для записей без промокода и инструкции должен продолжать работать без изменений

**Scope:**
Все операции, которые НЕ связаны с backward sync записью данных доставки в диапазон E:P, должны быть полностью не затронуты исправлением. Это включает:
- Чтение данных из Google Sheets (forward sync)
- Запись данных доставки для записей без промокода/инструкции
- Любые другие операции с Google Sheets вне метода `_sync_sheet_delivery_data`

## Hypothesized Root Cause

На основе анализа кода, наиболее вероятные причины бага:

1. **Неправильный диапазон обновления**: В методе `_sync_sheet_delivery_data` (строка 976) диапазон указан как `E{row_id}:P{row_id}`, что соответствует 12 столбцам (E, F, G, H, I, J, K, L, M, N, O, P). Однако данные доставки должны записываться в столбцы G-R (12 столбцов: G, H, I, J, K, L, M, N, O, P, Q, R).

2. **Несоответствие структуры данных**: Массив `row_data` в методе `_sync_sheet_delivery_data` содержит 12 элементов (last_name, first_name, patronymic, city, street, house, apartment, phone, comment, country, postal_code, claimed_at), которые записываются начиная со столбца E, перезаписывая промокод и инструкцию.

3. **Отсутствие учёта столбцов E и F**: При формировании batch update не учитывается, что столбцы E и F уже заняты данными цифрового приза (promo_code, instructions).

4. **Историческая ошибка в архитектуре**: Возможно, изначально столбцы E и F не использовались, и данные доставки записывались с E. После добавления промокода и инструкции диапазон не был обновлён.

## Correctness Properties

Property 1: Bug Condition - Backward Sync Preserves Promo Code and Instructions

_For any_ Prize record where claimed_at IS NOT NULL AND prize_type == 'digital' AND (promo_code IS NOT NULL OR instructions IS NOT NULL), the fixed _sync_sheet_delivery_data method SHALL write delivery data to columns G-R, leaving columns E (promo_code) and F (instructions) unchanged in Google Sheets.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Forward Sync and Other Operations Unchanged

_For any_ operation that is NOT backward sync writing delivery data (forward sync reading, backward sync for physical prizes, backward sync for records without promo_code/instructions), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for non-buggy scenarios.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `telegram-bot/services/sync_service.py`

**Function**: `_sync_sheet_delivery_data` (строка 976)

**Specific Changes**:

1. **Изменить диапазон обновления**: Заменить `E{row_id}:P{row_id}` на `G{row_id}:R{row_id}` в строке формирования `cell_range`
   - Текущий код: `cell_range = f'E{prize.row_id}:P{prize.row_id}'`
   - Исправленный код: `cell_range = f'G{prize.row_id}:R{prize.row_id}'`

2. **Обновить комментарии в коде**: Исправить комментарии, описывающие структуру столбцов, чтобы они соответствовали реальной структуре
   - Текущие комментарии указывают E-P (12 столбцов)
   - Исправленные комментарии должны указывать G-R (12 столбцов)

3. **Обновить docstring метода**: Изменить описание обновляемых столбцов в docstring метода `sync_delivery_data_to_sheets`
   - Текущий docstring: "Обновляет столбцы E-O (данные доставки) и столбец P (claimed_at)"
   - Исправленный docstring: "Обновляет столбцы G-Q (данные доставки) и столбец R (claimed_at)"

4. **Проверить соответствие с forward sync**: Убедиться, что forward sync (`_convert_sheet_data_to_prizes`) корректно читает данные из столбцов G-R
   - Проверить индексы в методе `_convert_sheet_data_to_prizes` (строка 600+)
   - Убедиться, что индексы 6-17 соответствуют столбцам G-R

5. **Добавить валидацию**: Опционально добавить проверку, что при backward sync не перезаписываются столбцы E и F
   - Можно добавить assertion или логирование для контроля корректности диапазона

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала демонстрируем баг на неисправленном коде (exploratory testing), затем проверяем, что исправление работает корректно и не нарушает существующее поведение (fix checking и preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Продемонстрировать баг ПЕРЕД внедрением исправления. Подтвердить или опровергнуть анализ корневой причины. Если опровергнем, потребуется пересмотр гипотезы.

**Test Plan**: Написать тесты, которые создают запись с цифровым призом (promo_code и instructions заполнены), затем выполняют backward sync и проверяют, что столбцы E и F в Google Sheets перезаписаны. Запустить эти тесты на НЕИСПРАВЛЕННОМ коде для наблюдения сбоев и понимания корневой причины.

**Test Cases**:
1. **Digital Prize with Promo Code Test**: Создать запись с prize_type='digital', promo_code='TEST123', instructions='Инструкция', заполнить данные доставки, выполнить backward sync, проверить что столбцы E и F перезаписаны (тест провалится на неисправленном коде)
2. **Digital Prize without Delivery Data Test**: Создать запись с prize_type='digital', promo_code='ABC', instructions='Текст', НЕ заполнять данные доставки (claimed_at=NULL), выполнить backward sync, проверить что столбцы E и F НЕ изменились (тест должен пройти, так как backward sync не запускается для claimed_at=NULL)
3. **Physical Prize Test**: Создать запись с prize_type='physical', заполнить данные доставки, выполнить backward sync, проверить что данные доставки записаны корректно (тест должен пройти, так как для физических призов столбцы E и F не используются)
4. **Multiple Records Test**: Создать несколько записей с разными типами призов, выполнить backward sync, проверить что только цифровые призы с данными доставки теряют промокод и инструкцию (тест провалится на неисправленном коде)

**Expected Counterexamples**:
- Столбцы E и F в Google Sheets содержат пустые строки или данные из полей last_name/first_name вместо promo_code/instructions
- Возможные причины: неправильный диапазон обновления (E:P вместо G:R), неправильная структура массива row_data, отсутствие учёта столбцов E и F

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где выполняется условие бага, исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL prize WHERE isBugCondition(prize) DO
  # Записываем промокод и инструкцию в Google Sheets
  write_to_sheets(prize.row_id, column_E=prize.promo_code, column_F=prize.instructions)
  
  # Выполняем backward sync с исправленным кодом
  result := _sync_sheet_delivery_data_fixed(prize.sheet_name, [prize])
  
  # Читаем данные из Google Sheets
  sheet_data := read_from_sheets(prize.row_id)
  
  # Проверяем, что промокод и инструкция не изменились
  ASSERT sheet_data[column_E] == prize.promo_code
  ASSERT sheet_data[column_F] == prize.instructions
  
  # Проверяем, что данные доставки записаны в столбцы G-R
  ASSERT sheet_data[column_G] == prize.last_name
  ASSERT sheet_data[column_H] == prize.first_name
  # ... и так далее для всех полей доставки
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где условие бага НЕ выполняется, исправленная функция производит тот же результат, что и оригинальная функция.

**Pseudocode:**
```
FOR ALL prize WHERE NOT isBugCondition(prize) DO
  # Выполняем backward sync с оригинальным кодом
  result_original := _sync_sheet_delivery_data_original(prize.sheet_name, [prize])
  sheet_data_original := read_from_sheets(prize.row_id)
  
  # Выполняем backward sync с исправленным кодом
  result_fixed := _sync_sheet_delivery_data_fixed(prize.sheet_name, [prize])
  sheet_data_fixed := read_from_sheets(prize.row_id)
  
  # Проверяем, что результаты идентичны
  ASSERT result_original == result_fixed
  ASSERT sheet_data_original == sheet_data_fixed
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев по всему входному домену
- Обнаруживает граничные случаи, которые могут быть пропущены в ручных unit тестах
- Предоставляет сильные гарантии, что поведение не изменилось для всех не-багованных входных данных

**Test Plan**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для forward sync и других операций, затем написать property-based тесты, фиксирующие это поведение.

**Test Cases**:
1. **Forward Sync Preservation**: Наблюдать, что forward sync корректно читает промокод из столбца E и инструкцию из столбца F на неисправленном коде, затем написать тест для проверки, что это поведение сохраняется после исправления
2. **Forward Sync Delivery Data Preservation**: Наблюдать, что forward sync корректно читает данные доставки из столбцов G-R на неисправленном коде, затем написать тест для проверки сохранения этого поведения
3. **Physical Prize Backward Sync Preservation**: Наблюдать, что backward sync для физических призов корректно записывает данные доставки на неисправленном коде, затем написать тест для проверки сохранения
4. **Empty Promo Code Backward Sync Preservation**: Наблюдать, что backward sync для записей без промокода/инструкции работает корректно на неисправленном коде, затем написать тест для проверки сохранения

### Unit Tests

- Тест backward sync для цифрового приза с промокодом и инструкцией (проверка исправления бага)
- Тест backward sync для физического приза (проверка preservation)
- Тест backward sync для записи без данных доставки (claimed_at=NULL) - не должен выполняться
- Тест граничного случая: запись с пустым промокодом и инструкцией
- Тест forward sync чтения промокода и инструкции из столбцов E и F
- Тест forward sync чтения данных доставки из столбцов G-R

### Property-Based Tests

- Генерировать случайные записи Prize с различными комбинациями prize_type, promo_code, instructions, claimed_at и проверять, что backward sync корректно записывает данные в правильные столбцы
- Генерировать случайные конфигурации листов Google Sheets и проверять, что forward sync корректно читает данные из всех столбцов
- Тестировать, что все операции, не связанные с backward sync, продолжают работать идентично после исправления

### Integration Tests

- Полный цикл: создание записи с цифровым призом → заполнение данных доставки → backward sync → forward sync → проверка, что все данные корректны
- Тест переключения между контекстами: forward sync → backward sync → forward sync → проверка консистентности данных
- Тест множественных записей: создание нескольких записей с разными типами призов → backward sync → проверка, что все записи обновлены корректно
