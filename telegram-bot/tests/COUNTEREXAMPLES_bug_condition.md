# Counterexamples для Bug Condition - Update Queue Sheet Name Fix

## Дата: 16.03.2026

## Резюме

Exploratory тесты подтвердили существование бага в `UpdateQueueService`. Баг проявляется при обработке задач типа `PRIZE_CLAIMED`.

## Найденные Counterexamples

### 1. Отсутствие поля sheet_name в UpdateTask

**Тест**: `test_update_task_missing_sheet_name_field`

**Результат**: ❌ FAILED (как и ожидалось)

**Описание**:
- UpdateTask для типа PRIZE_CLAIMED не содержит поле `sheet_name`
- При попытке доступа к `task.sheet_name` возникает AttributeError
- Это подтверждает первопричину бага: отсутствие необходимого поля в dataclass

**Counterexample**:
```python
task = UpdateTask(
    id="test_claimed_123",
    update_type=UpdateType.PRIZE_CLAIMED,
    telegram_id=123456,
    code_word="RSYA2028",
    data={"row_id": 2, "claimed_at": "16.03.2026 12:00:00"},
    created_at=datetime.now(timezone.utc)
)

# hasattr(task, 'sheet_name') == False
# Ожидалось: True
```

### 2. Использование code_word вместо sheet_name

**Тест**: `test_process_prize_claimed_uses_code_word_instead_of_sheet_name`

**Результат**: ✅ PASSED (подтверждает баг)

**Описание**:
- Метод `_process_prize_claimed` использует `task.code_word` в качестве `worksheet_name`
- При вызове `save_delivery_data(worksheet_name="RSYA2028")` лист не найден
- Google Sheets API возвращает False
- Система выбрасывает RuntimeError: "Failed to update Google Sheets for row 2"

**Counterexample**:
```python
# Ожидалось: worksheet_name="Лист1" (sheet_name)
# Фактически: worksheet_name="RSYA2028" (code_word)

mock_sheets_service.save_delivery_data.assert_called_once_with(
    row_id=2,
    delivery_data={"claimed_at": "16.03.2026 12:00:00"},
    worksheet_name="RSYA2028"  # ❌ Неправильно! Должно быть "Лист1"
)
```

### 3. Property-Based Test: Множественные counterexamples

**Тест**: `test_property_bug_condition_scoped`

**Результат**: ✅ PASSED (подтверждает баг для множества случаев)

**Описание**:
- Hypothesis сгенерировал 10 различных комбинаций code_word и sheet_name
- Во всех случаях система использовала code_word вместо sheet_name
- Все случаи привели к RuntimeError из-за несуществующего листа

**Примеры counterexamples**:
- code_word="ABCD1234", sheet_name="Лист1" → использовано "ABCD1234"
- code_word="TEST2024", sheet_name="Призы" → использовано "TEST2024"
- code_word="WIN123", sheet_name="Winners" → использовано "WIN123"

### 4. Интеграционный тест полного потока

**Тест**: `test_integration_flow_prize_claimed_with_wrong_worksheet`

**Результат**: ✅ PASSED (подтверждает баг в полном потоке)

**Описание**:
- Полный поток от `add_prize_claimed_update` до `_process_prize_claimed`
- Задача создаётся без поля `sheet_name`
- При обработке используется `code_word` вместо `sheet_name`
- Система падает с RuntimeError

**Counterexample**:
```python
# Шаг 1: Добавление задачи
await service.add_prize_claimed_update(
    telegram_id=123456,
    code_word="RSYA2028",
    row_id=2,
    claimed_at="16.03.2026 12:00:00"
)

# Шаг 2: Получение задачи из очереди
task = await service.queue.get()

# Шаг 3: Проверка
assert not hasattr(task, 'sheet_name')  # ✅ True (баг подтверждён)

# Шаг 4: Обработка задачи
# RuntimeError: Failed to update Google Sheets for row 2
```

## Анализ первопричины

На основе найденных counterexamples подтверждается гипотеза о первопричине:

1. **Отсутствие поля sheet_name в UpdateTask** - dataclass не содержит необходимое поле
2. **Неправильная передача параметра** - метод `add_prize_claimed_update` не принимает `sheet_name`
3. **Использование code_word вместо sheet_name** - метод `_process_prize_claimed` использует неправильное поле
4. **Последствия рефакторинга** - после разделения понятий code_word и sheet_name UpdateQueueService не был обновлён

## Рекомендации для исправления

1. Добавить поле `sheet_name: str` в dataclass UpdateTask
2. Обновить сигнатуру `add_prize_claimed_update` для приёма параметра `sheet_name`
3. Исправить `_process_prize_claimed` для использования `task.sheet_name`
4. Обновить вызов в `prize_service.py` для передачи `sheet_name`

## Статус

- ✅ Баг подтверждён
- ✅ Counterexamples задокументированы
- ✅ Первопричина установлена
- ⏳ Готово к реализации исправления (Task 3)
