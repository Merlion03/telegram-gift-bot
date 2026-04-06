# Bug Condition Exploration Results: Google Sheets Full Sync Bug

## Дата тестирования
2026-04-03

## Статус
✗ БАГ ПОДТВЕРЖДЁН - Все 5 тестов упали как ожидалось

## Резюме

Exploratory property-based тесты успешно подтвердили существование бага в системе синхронизации Google Sheets → PostgreSQL. Текущая реализация `sync_sheet()` выполняет только INSERT/UPDATE операции через `batch_upsert_prizes()`, но НЕ обрабатывает:

1. Обновление изменённых записей (updated_records всегда = 0)
2. Удаление записей, удалённых из Google Sheets
3. Архивирование записей с данными доставки
4. Корректную статистику (new_records, updated_records, deleted_records)

## Counterexamples

### Scenario 1: Record modified in Google Sheets (prize_type changed)

**Входные данные:**
- PostgreSQL: `telegram_id=123, code_word='TEST', prize_type='digital'`
- Google Sheets: `telegram_id=123, code_word='TEST', prize_type='physical'`

**Текущее поведение (НЕИСПРАВЛЕННЫЙ КОД):**
```
new_records: 1
updated_records: 0  ← БАГ: должно быть 1
deleted_records: 0
```

**Ожидаемое поведение (ПОСЛЕ ИСПРАВЛЕНИЯ):**
```
new_records: 0
updated_records: 1
deleted_records: 0
prize_type в PostgreSQL: 'physical'
```

**Первопричина:** `batch_upsert_prizes()` возвращает только общий count, не различает new/updated записи.

---

### Scenario 2: Record deleted from Google Sheets (claimed_at IS NULL)

**Входные данные:**
- PostgreSQL: `telegram_id=456, code_word='TEST2', claimed_at=NULL`
- Google Sheets: запись удалена

**Текущее поведение (НЕИСПРАВЛЕННЫЙ КОД):**
```
new_records: 0
updated_records: 0
deleted_records: 0  ← БАГ: должно быть 1
Запись остаётся в PostgreSQL
```

**Ожидаемое поведение (ПОСЛЕ ИСПРАВЛЕНИЯ):**
```
new_records: 0
updated_records: 0
deleted_records: 1
Запись удалена из PostgreSQL
```

**Первопричина:** Отсутствует механизм DELETE (diff между Google Sheets и PostgreSQL).

---

### Scenario 3: Record deleted from Google Sheets (claimed_at IS NOT NULL)

**Входные данные:**
- PostgreSQL: `telegram_id=789, code_word='TEST3', claimed_at='2026-04-03', last_name='Иванов'`
- Google Sheets: запись удалена

**Текущее поведение (НЕИСПРАВЛЕННЫЙ КОД):**
```
new_records: 0
updated_records: 0
deleted_records: 0  ← БАГ: должно быть 1
Запись остаётся в PostgreSQL, is_archived=False
```

**Ожидаемое поведение (ПОСЛЕ ИСПРАВЛЕНИЯ):**
```
new_records: 0
updated_records: 0
deleted_records: 1
Запись помечена как архивная (is_archived=True)
Данные доставки сохранены
```

**Первопричина:** Отсутствует поле `is_archived` в модели Prize и метод `batch_archive_prizes()`.

---

### Scenario 4: Statistics show updated_records=0, deleted_records=0

**Входные данные:**
- PostgreSQL: 3 записи (NEW1, MODIFIED, DELETED)
- Google Sheets: 3 записи (NEW1 без изменений, MODIFIED с изменённым prize_type, NEW2 новая)

**Текущее поведение (НЕИСПРАВЛЕННЫЙ КОД):**
```
new_records: 3  ← БАГ: должно быть 1 (только NEW2)
updated_records: 0  ← БАГ: должно быть 1 (MODIFIED)
deleted_records: 0  ← БАГ: должно быть 1 (DELETED)
```

**Ожидаемое поведение (ПОСЛЕ ИСПРАВЛЕНИЯ):**
```
new_records: 1  (NEW2)
updated_records: 1  (MODIFIED)
deleted_records: 1  (DELETED)
```

**Первопричина:** Комбинация всех проблем - некорректная статистика, отсутствие DELETE механизма.

---

### Scenario 5: Verification of current implementation

**Проверка наличия необходимых методов/полей:**

```
PrizeRepository.get_prizes_by_sheet: ✗
PrizeRepository.batch_delete_prizes: ✗
PrizeRepository.batch_archive_prizes: ✗
Prize.is_archived: ✗
```

**Статус:** НЕИСПРАВЛЕННЫЙ КОД - отсутствуют все необходимые компоненты для трёхфазной синхронизации.

## Первопричина бага

Анализ кода выявил следующие причины:

1. **Отсутствие механизма DELETE**: Метод `sync_sheet()` не выполняет diff между Google Sheets и PostgreSQL для определения удалённых записей. Он только вызывает `batch_upsert_prizes()` для записей из Google Sheets.

2. **Некорректная статистика**: Метод `batch_upsert_prizes()` возвращает только общее количество обработанных записей (`processed_count`), но не различает новые и обновлённые записи. Это приводит к тому, что все записи считаются новыми (`new_records=N, updated_records=0`).

3. **Отсутствие поля is_archived**: В модели Prize отсутствует поле для маркировки архивных записей (удалённых из Google Sheets, но с сохранёнными данными доставки).

4. **Отсутствие методов для DELETE операций**: В PrizeRepository отсутствуют методы:
   - `get_prizes_by_sheet()` - для получения всех записей конкретного листа
   - `batch_delete_prizes()` - для удаления записей без данных доставки
   - `batch_archive_prizes()` - для архивирования записей с данными доставки

## Решение

Для исправления бага необходимо:

1. **Добавить поле is_archived в модель Prize**
   - `is_archived: Mapped[bool]` с default=False
   - Индекс для оптимизации запросов

2. **Добавить методы в PrizeRepository:**
   - `get_prizes_by_sheet(sheet_name: str) -> List[Prize]`
   - `batch_delete_prizes(prizes_keys: List[Tuple[int, str]]) -> int`
   - `batch_archive_prizes(prizes_keys: List[Tuple[int, str]]) -> int`

3. **Модифицировать batch_upsert_prizes():**
   - Изменить возвращаемое значение с `int` на `Dict[str, int]`
   - Возвращать `{'new_records': N, 'updated_records': M}`
   - Использовать PostgreSQL RETURNING для определения новых/обновлённых записей

4. **Реализовать трёхфазную синхронизацию в sync_sheet():**
   - **Фаза 1: INSERT/UPDATE** - вызов `batch_upsert_prizes()` для записей из Google Sheets
   - **Фаза 2: DELETE** - определение удалённых записей через diff, вызов `batch_delete_prizes()` и `batch_archive_prizes()`
   - **Фаза 3: STATS** - агрегация статистики из всех фаз

5. **Обновить sync_all_sheets():**
   - Добавить поле `deleted_records` в статистику
   - Агрегировать `deleted_records` из каждого листа

## Validates Requirements

- **1.1**: Изменённые записи должны обновляться в PostgreSQL
- **1.2**: Удалённые записи без данных доставки должны удаляться
- **1.3**: Статистика должна показывать updated_records > 0
- **1.4**: Пользователь не должен получать промокод для удалённой записи
- **2.1**: Корректная статистика (new_records, updated_records)
- **2.2**: Удаление записей без данных доставки
- **2.3**: Архивирование записей с данными доставки
- **2.4**: Корректная статистика deleted_records
- **2.5**: Защита данных доставки при удалении

## Следующие шаги

1. ✓ Написать bug condition exploration test (Task 1) - ЗАВЕРШЕНО
2. Написать preservation property tests (Task 2)
3. Реализовать исправление (Task 3)
4. Проверить, что bug condition test проходит (Task 3.9)
5. Проверить, что preservation tests проходят (Task 3.10)

## Примечания

- Тесты написаны с использованием Scoped PBT подхода - конкретные падающие случаи для детерминистичного бага
- Все тесты упали как ожидалось - это правильно, это доказывает существование бага
- НЕ пытаемся исправить тест или код на этом этапе
- Падение теста - это успех для exploratory testing
