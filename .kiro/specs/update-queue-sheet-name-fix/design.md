# Update Queue Sheet Name Fix - Bugfix Design

## Overview

Система падает с ошибкой "Failed to update Google Sheets for row 2" при попытке обновить статус получения приза. Баг возникает из-за того, что метод `_process_prize_claimed` в классе `UpdateQueueService` использует `task.code_word` (значение из столбца B таблицы) вместо `task.sheet_name` (название листа Google Sheets) при вызове `google_sheets_service.save_delivery_data()`.

После рефакторинга (spec: google-sheets-code-word-column) поле `code_word` стало храниться в столбце B и больше не является названием листа. Класс `UpdateTask` не содержит поле `sheet_name`, хотя это значение доступно в методе `_mark_prize_claimed_async` класса `PrizeService`, который вызывает `add_prize_claimed_update`.

Исправление минимально: добавить поле `sheet_name` в `UpdateTask`, передавать его через `add_prize_claimed_update`, и использовать в `_process_prize_claimed`.

## Glossary

- **Bug_Condition (C)**: Условие, при котором возникает баг - когда система пытается обновить статус получения приза через очередь обновлений
- **Property (P)**: Желаемое поведение - система должна успешно обновлять данные в Google Sheets, используя корректное название листа
- **Preservation**: Существующая функциональность обновления данных доставки и механизм retry, которые должны остаться неизменными
- **UpdateTask**: Dataclass в `telegram-bot/services/update_queue_service.py`, представляющий задачу обновления в очереди
- **UpdateQueueService**: Сервис в `telegram-bot/services/update_queue_service.py`, управляющий асинхронной очередью обновлений PostgreSQL -> Google Sheets
- **code_word**: Значение из столбца B таблицы Google Sheets, используется для идентификации приза (например, "RSYA2028")
- **sheet_name**: Название листа (worksheet) в Google Sheets, куда нужно записывать данные (например, "Лист1", "Призы")

## Bug Details

### Bug Condition

Баг проявляется когда пользователь получает приз и система пытается обновить статус в Google Sheets через очередь обновлений. Метод `_process_prize_claimed` использует `task.code_word` в качестве параметра `worksheet_name`, но Google Sheets API ожидает название листа, а не кодовое слово из столбца B.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UpdateTask
  OUTPUT: boolean
  
  RETURN input.update_type == UpdateType.PRIZE_CLAIMED
         AND input.code_word IS NOT NULL
         AND NOT hasField(input, "sheet_name")
         AND googleSheetsWorksheetExists(input.code_word) == False
END FUNCTION
```

### Examples

- **Пример 1**: Пользователь с telegram_id=123456 получает приз с code_word="RSYA2028" из листа "Лист1". Система создаёт UpdateTask без поля sheet_name, затем вызывает `save_delivery_data(worksheet_name="RSYA2028")`. Google Sheets API не находит лист с названием "RSYA2028" и возвращает False. Система выбрасывает RuntimeError.

- **Пример 2**: Пользователь получает приз с code_word="PROMO123" из листа "Призы 2024". Система пытается найти лист "PROMO123" вместо "Призы 2024", операция проваливается.

- **Пример 3**: Пользователь получает приз с code_word="WIN2024" из листа "Winners". Система использует "WIN2024" как worksheet_name, не находит такой лист, выбрасывает исключение после 3 попыток retry.

- **Edge case**: Если случайно существует лист с названием равным code_word (например, лист "TEST" и code_word="TEST"), система может записать данные в неправильный лист, что приведёт к повреждению данных.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Метод `add_delivery_data_update` и обработка задач типа DELIVERY_DATA должны продолжать работать без изменений
- Механизм retry с exponential backoff должен остаться неизменным
- Логирование событий очереди обновлений должно продолжать работать корректно
- Структура и поведение класса UpdateTask для других типов обновлений не должны измениться

**Scope:**
Все задачи обновления, которые НЕ относятся к типу PRIZE_CLAIMED, должны быть полностью не затронуты этим исправлением. Это включает:
- Обновления данных доставки (DELIVERY_DATA)
- Механизм работы воркера очереди (_worker)
- Логику повторных попыток (_process_task)
- Методы получения размера очереди и ожидания опустошения

## Hypothesized Root Cause

На основе анализа кода, наиболее вероятные причины бага:

1. **Отсутствие поля sheet_name в UpdateTask**: Класс UpdateTask не содержит поле `sheet_name`, хотя это значение критически необходимо для корректной работы с Google Sheets API. После рефакторинга code_word и sheet_name стали разными сущностями, но UpdateTask не был обновлён.

2. **Неправильная передача параметра в add_prize_claimed_update**: Метод `add_prize_claimed_update` не принимает параметр `sheet_name`, хотя он доступен в вызывающем коде (`_mark_prize_claimed_async` имеет параметр `sheet_name`).

3. **Использование code_word вместо sheet_name в _process_prize_claimed**: Метод `_process_prize_claimed` передаёт `task.code_word` в качестве `worksheet_name`, что является семантически неверным после рефакторинга.

4. **Отсутствие обновления после рефакторинга**: Рефакторинг google-sheets-code-word-column разделил понятия code_word (значение в столбце B) и sheet_name (название листа), но UpdateQueueService не был обновлён для работы с новой структурой данных.

## Correctness Properties

Property 1: Bug Condition - Correct Sheet Name Usage

_For any_ UpdateTask где update_type == PRIZE_CLAIMED и sheet_name корректно заполнен, метод _process_prize_claimed SHALL использовать task.sheet_name в качестве параметра worksheet_name при вызове save_delivery_data(), что приведёт к успешному обновлению данных в Google Sheets.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Delivery Data Updates Unchanged

_For any_ UpdateTask где update_type == DELIVERY_DATA, система SHALL продолжать обрабатывать задачи точно так же, как до исправления, сохраняя все существующие поведение обновления данных доставки, механизм retry и логирование.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Предполагая, что наш анализ корректен:

**File**: `telegram-bot/services/update_queue_service.py`

**Specific Changes**:

1. **Добавить поле sheet_name в UpdateTask**:
   - В dataclass UpdateTask добавить поле `sheet_name: str` после поля `code_word`
   - Это позволит хранить название листа в задаче обновления

2. **Обновить сигнатуру add_prize_claimed_update**:
   - Добавить параметр `sheet_name: str` в метод `add_prize_claimed_update`
   - Передавать этот параметр при создании UpdateTask

3. **Обновить создание UpdateTask в add_prize_claimed_update**:
   - При создании UpdateTask передавать `sheet_name=sheet_name`
   - Обновить логирование для включения sheet_name

4. **Исправить _process_prize_claimed**:
   - Заменить `worksheet_name=task.code_word` на `worksheet_name=task.sheet_name`
   - Это обеспечит использование корректного названия листа

5. **Обновить вызов в prize_service.py**:
   - В методе `_mark_prize_claimed_async` добавить параметр `sheet_name=sheet_name` при вызове `add_prize_claimed_update`

**File**: `telegram-bot/services/prize_service.py`

**Function**: `_mark_prize_claimed_async`

**Specific Changes**:
1. **Передать sheet_name в очередь обновлений**:
   - Добавить параметр `sheet_name=sheet_name` в вызов `update_queue_service.add_prize_claimed_update()`

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала продемонстрировать баг на нефиксированном коде через exploratory тесты, затем проверить, что исправление работает корректно и сохраняет существующее поведение.

### Exploratory Bug Condition Checking

**Goal**: Продемонстрировать баг ДО внесения исправлений. Подтвердить или опровергнуть анализ первопричины. Если опровергнем, потребуется пересмотреть гипотезу.

**Test Plan**: Написать тесты, которые симулируют получение приза пользователем и проверяют, что система пытается использовать code_word вместо sheet_name. Запустить эти тесты на НЕФИКСИРОВАННОМ коде для наблюдения ошибок и понимания первопричины.

**Test Cases**:
1. **Test Missing Sheet Name Field**: Создать UpdateTask для PRIZE_CLAIMED и проверить, что поле sheet_name отсутствует (will fail on unfixed code - AttributeError)
2. **Test Wrong Worksheet Name**: Вызвать _process_prize_claimed с task, содержащим code_word="RSYA2028", и проверить, что система пытается найти лист "RSYA2028" вместо корректного sheet_name (will fail on unfixed code - RuntimeError)
3. **Test Integration Flow**: Симулировать полный поток от _mark_prize_claimed_async до _process_prize_claimed и проверить, что система падает с ошибкой "Failed to update Google Sheets" (will fail on unfixed code)
4. **Test Edge Case - Code Word Equals Sheet Name**: Создать ситуацию, где code_word случайно совпадает с названием существующего листа, и проверить, что данные могут быть записаны в неправильный лист (may fail on unfixed code - data corruption)

**Expected Counterexamples**:
- UpdateTask не содержит поле sheet_name, что приводит к использованию code_word
- Google Sheets API не находит лист с названием равным code_word
- Возможные причины: отсутствие поля в dataclass, неправильная передача параметров, использование неверного поля в _process_prize_claimed

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где выполняется условие бага, исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL task WHERE isBugCondition(task) DO
  result := _process_prize_claimed_fixed(task)
  ASSERT result.success == True
  ASSERT result.used_worksheet_name == task.sheet_name
  ASSERT result.used_worksheet_name != task.code_word
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где условие бага НЕ выполняется, исправленная функция производит тот же результат, что и оригинальная функция.

**Pseudocode:**
```
FOR ALL task WHERE NOT isBugCondition(task) DO
  ASSERT _process_delivery_data_original(task) == _process_delivery_data_fixed(task)
  ASSERT retry_mechanism_original(task) == retry_mechanism_fixed(task)
  ASSERT logging_original(task) == logging_fixed(task)
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев по всему входному домену
- Ловит граничные случаи, которые могут быть пропущены в ручных unit тестах
- Предоставляет сильные гарантии, что поведение не изменилось для всех не-багованных входных данных

**Test Plan**: Наблюдать поведение на НЕФИКСИРОВАННОМ коде для обновлений данных доставки и других взаимодействий, затем написать property-based тесты, захватывающие это поведение.

**Test Cases**:
1. **Preservation Test - Delivery Data Updates**: Наблюдать, что обновления DELIVERY_DATA работают корректно на нефиксированном коде, затем написать тест для проверки, что это продолжает работать после исправления
2. **Preservation Test - Retry Mechanism**: Наблюдать, что механизм retry с exponential backoff работает корректно, затем написать тест для проверки сохранения этого поведения
3. **Preservation Test - Queue Worker**: Наблюдать, что воркер очереди обрабатывает задачи корректно, затем написать тест для проверки неизменности этого поведения
4. **Preservation Test - Logging**: Проверить, что все события логируются с правильными параметрами до и после исправления

### Unit Tests

- Тест создания UpdateTask с полем sheet_name
- Тест вызова add_prize_claimed_update с параметром sheet_name
- Тест _process_prize_claimed использует task.sheet_name вместо task.code_word
- Тест граничного случая: code_word совпадает с sheet_name (должно работать корректно)
- Тест, что _process_delivery_data не затронут изменениями

### Property-Based Tests

- Генерировать случайные UpdateTask с различными комбинациями code_word и sheet_name, проверять, что _process_prize_claimed всегда использует sheet_name
- Генерировать случайные UpdateTask типа DELIVERY_DATA, проверять, что поведение идентично до и после исправления
- Генерировать случайные сценарии с ошибками, проверять, что механизм retry работает одинаково для всех типов задач

### Integration Tests

- Тест полного потока: _mark_prize_claimed_async -> add_prize_claimed_update -> _process_prize_claimed -> save_delivery_data с корректным sheet_name
- Тест, что после исправления система успешно обновляет Google Sheets для реальных данных
- Тест, что обновления данных доставки продолжают работать корректно после исправления
- Тест, что логирование включает sheet_name и code_word для отладки
