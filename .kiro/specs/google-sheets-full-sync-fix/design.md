# Google Sheets Full Sync Fix - Design Document

## Overview

Текущая реализация forward sync (Google Sheets → PostgreSQL) выполняет только вставку новых записей через `INSERT ... ON CONFLICT DO UPDATE`, но не обрабатывает два критических сценария:

1. **Обновление изменённых записей**: Когда запись изменена в Google Sheets (например, изменён prize_type или promo_code), система не обновляет её в PostgreSQL
2. **Удаление записей**: Когда запись удалена из Google Sheets, она остаётся в PostgreSQL и доступна пользователям

Это приводит к тому, что PostgreSQL содержит устаревшие данные, а пользователи получают доступ к удалённым призам.

**Стратегия исправления**:
- Реализовать трёхфазную синхронизацию: INSERT/UPDATE → DELETE → STATS
- Добавить механизм отслеживания записей для удаления (diff между Google Sheets и PostgreSQL)
- Реализовать защиту данных доставки при удалении (архивирование вместо удаления для claimed_at IS NOT NULL)
- Корректно подсчитывать статистику (new_records, updated_records, deleted_records)

## Glossary

- **Bug_Condition (C)**: Условие, при котором баг проявляется - когда записи изменены или удалены в Google Sheets, но не синхронизированы в PostgreSQL
- **Property (P)**: Желаемое поведение - все изменения и удаления из Google Sheets должны корректно отражаться в PostgreSQL с защитой данных доставки
- **Preservation**: Существующее поведение, которое должно остаться неизменным - защита данных доставки, backward sync, graceful degradation
- **sync_all_sheets()**: Метод в `telegram-bot/services/sync_service.py`, который выполняет синхронизацию всех листов Google Sheets с PostgreSQL
- **batch_upsert_prizes()**: Метод в `telegram-bot/database/repositories/prize_repository.py`, который выполняет массовую вставку/обновление призов
- **claimed_at**: Поле в таблице prizes, которое указывает, что пользователь заявил приз и сохранил данные доставки (IS NOT NULL = данные доставки защищены)
- **Forward Sync**: Синхронизация Google Sheets → PostgreSQL (текущий баг)
- **Backward Sync**: Синхронизация PostgreSQL → Google Sheets (работает корректно, не должна быть затронута)
- **Архивирование**: Механизм сохранения записей с данными доставки при удалении из Google Sheets (вместо физического удаления)

## Bug Details

### Bug Condition

Баг проявляется когда администратор изменяет или удаляет записи в Google Sheets, но система не синхронизирует эти изменения в PostgreSQL. Метод `sync_all_sheets()` использует `batch_upsert_prizes()`, который выполняет только INSERT/UPDATE для записей из Google Sheets, но не обрабатывает удалённые записи.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type SyncInput
    - input.sheets_records: List[Dict] - записи из Google Sheets
    - input.postgres_records: List[Prize] - записи из PostgreSQL
  OUTPUT: boolean
  
  RETURN (
    // Случай 1: Запись изменена в Google Sheets
    EXISTS record IN input.postgres_records WHERE (
      record.exists_in_sheets(input.sheets_records) AND
      record.data_differs_from_sheets(input.sheets_records)
    )
  ) OR (
    // Случай 2: Запись удалена из Google Sheets
    EXISTS record IN input.postgres_records WHERE (
      record.sheet_name IN input.synced_sheets AND
      record NOT IN input.sheets_records
    )
  )
END FUNCTION
```

### Examples

**Пример 1: Изменение prize_type**
- Google Sheets: `telegram_id=123456, code_word="PROMO2024", prize_type="physical"`
- PostgreSQL: `telegram_id=123456, code_word="PROMO2024", prize_type="digital"`
- Текущее поведение: Запись НЕ обновляется, остаётся `prize_type="digital"`
- Ожидаемое поведение: Запись обновляется на `prize_type="physical"`, `updated_records=1`

**Пример 2: Удаление записи без данных доставки**
- Google Sheets: запись удалена
- PostgreSQL: `telegram_id=123456, code_word="PROMO2024", claimed_at=NULL`
- Текущее поведение: Запись остаётся в PostgreSQL, пользователь получает промокод
- Ожидаемое поведение: Запись удаляется из PostgreSQL, `deleted_records=1`

**Пример 3: Удаление записи с данными доставки**
- Google Sheets: запись удалена
- PostgreSQL: `telegram_id=123456, code_word="PROMO2024", claimed_at="2024-01-15 12:00:00"`
- Текущее поведение: Запись остаётся в PostgreSQL
- Ожидаемое поведение: Запись помечается как архивная (`is_archived=true`), данные доставки сохраняются, `deleted_records=1`

**Пример 4: Статистика синхронизации**
- Сценарий: 5 новых записей, 3 изменённых, 2 удалённых
- Текущее поведение: `new_records=8, updated_records=0, deleted_records=0`
- Ожидаемое поведение: `new_records=5, updated_records=3, deleted_records=2`

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Защита данных доставки для записей с `claimed_at IS NOT NULL` должна продолжать работать (поля last_name, first_name, patronymic, country, postal_code, city, street, house, apartment, phone, comment не перезаписываются из Google Sheets)
- Backward sync (PostgreSQL → Google Sheets) должен продолжать работать без изменений
- Graceful degradation при ошибках синхронизации одного листа (продолжение синхронизации других листов)
- Batch операции для производительности должны сохраниться
- Новые записи из Google Sheets должны продолжать вставляться в PostgreSQL

**Scope:**
Все сценарии, которые НЕ включают изменение или удаление записей в Google Sheets, должны быть полностью не затронуты исправлением. Это включает:
- Вставку новых записей из Google Sheets
- Backward sync данных доставки
- Обработку ошибок Google Sheets API и PostgreSQL
- Защиту данных доставки при forward sync

## Hypothesized Root Cause

На основе анализа кода выявлены следующие причины бага:

1. **Отсутствие механизма удаления записей**: Метод `sync_all_sheets()` не выполняет diff между Google Sheets и PostgreSQL для определения удалённых записей. Он только вызывает `batch_upsert_prizes()` для записей из Google Sheets.

2. **Некорректная статистика**: Метод `batch_upsert_prizes()` возвращает только общее количество обработанных записей (`processed_count`), но не различает новые и обновлённые записи. Это приводит к тому, что все записи считаются новыми (`new_records=N, updated_records=0`).

3. **Отсутствие поля is_archived**: В модели Prize отсутствует поле для маркировки архивных записей (удалённых из Google Sheets, но с сохранёнными данными доставки).

4. **Отсутствие метода для получения записей листа**: В PrizeRepository отсутствует метод для получения всех записей конкретного листа из PostgreSQL, что необходимо для выполнения diff операции.

## Correctness Properties

Property 1: Bug Condition - Корректная синхронизация изменений и удалений

_For any_ входных данных синхронизации, где записи изменены или удалены в Google Sheets (isBugCondition возвращает true), исправленная функция sync_all_sheets' ДОЛЖНА обновить изменённые записи в PostgreSQL, удалить записи без данных доставки, архивировать записи с данными доставки, и корректно подсчитать статистику (new_records, updated_records, deleted_records).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Неизменное поведение для корректных сценариев

_For any_ входных данных синхронизации, где записи НЕ изменены и НЕ удалены в Google Sheets (isBugCondition возвращает false), исправленная функция sync_all_sheets' ДОЛЖНА производить тот же результат, что и оригинальная функция sync_all_sheets, сохраняя защиту данных доставки, backward sync, graceful degradation и вставку новых записей.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Исправление требует изменений в трёх компонентах системы:

**1. Модель Prize** (`telegram-bot/database/models/prize.py`)

**Добавить поле**:
- `is_archived`: Boolean поле для маркировки архивных записей (удалённых из Google Sheets, но с сохранёнными данными доставки)
- Значение по умолчанию: `False`
- Индекс: Добавить в составной индекс для оптимизации запросов

**2. PrizeRepository** (`telegram-bot/database/repositories/prize_repository.py`)

**Добавить методы**:

1. `get_prizes_by_sheet(sheet_name: str) -> List[Prize]`
   - Получает все записи конкретного листа из PostgreSQL
   - Используется для diff операции (определение удалённых записей)
   - Возвращает список Prize объектов

2. `batch_delete_prizes(prizes_keys: List[Tuple[int, str]]) -> int`
   - Удаляет записи без данных доставки (claimed_at IS NULL)
   - Принимает список кортежей (telegram_id, code_word)
   - Возвращает количество удалённых записей

3. `batch_archive_prizes(prizes_keys: List[Tuple[int, str]]) -> int`
   - Архивирует записи с данными доставки (claimed_at IS NOT NULL)
   - Устанавливает is_archived=True вместо удаления
   - Принимает список кортежей (telegram_id, code_word)
   - Возвращает количество архивированных записей

**Модифицировать метод**:

4. `batch_upsert_prizes(prizes_data: List[Dict[str, Any]]) -> Dict[str, int]`
   - Изменить возвращаемое значение с `int` на `Dict[str, int]`
   - Возвращать `{'new_records': N, 'updated_records': M}`
   - Использовать PostgreSQL RETURNING для определения новых/обновлённых записей
   - Сохранить существующую логику защиты данных доставки

**3. SyncService** (`telegram-bot/services/sync_service.py`)

**Модифицировать метод**:

1. `sync_sheet(sheet_name: str) -> Dict[str, Any]`
   - Реализовать трёхфазную синхронизацию:
     - **Фаза 1: INSERT/UPDATE** - вызов `batch_upsert_prizes()` для записей из Google Sheets
     - **Фаза 2: DELETE** - определение удалённых записей через diff, вызов `batch_delete_prizes()` и `batch_archive_prizes()`
     - **Фаза 3: STATS** - агрегация статистики из всех фаз
   - Возвращать корректную статистику: `{'new_records': N, 'updated_records': M, 'deleted_records': K}`

**Детальная логика Фазы 2 (DELETE)**:
```python
# Получаем все записи листа из PostgreSQL
postgres_records = await prize_repository.get_prizes_by_sheet(sheet_name)

# Формируем множество ключей из Google Sheets
sheets_keys = {(p['telegram_id'], p['code_word']) for p in prizes_data}

# Определяем удалённые записи (есть в PostgreSQL, но нет в Google Sheets)
deleted_records = [
    p for p in postgres_records 
    if (p.telegram_id, p.code_word) not in sheets_keys
]

# Разделяем на записи с/без данных доставки
to_delete = [(p.telegram_id, p.code_word) for p in deleted_records if p.claimed_at is None]
to_archive = [(p.telegram_id, p.code_word) for p in deleted_records if p.claimed_at is not None]

# Выполняем удаление и архивирование
deleted_count = await prize_repository.batch_delete_prizes(to_delete)
archived_count = await prize_repository.batch_archive_prizes(to_archive)

total_deleted = deleted_count + archived_count
```

### Migration Script

Необходимо создать миграцию для добавления поля `is_archived`:

```sql
-- Добавление поля is_archived
ALTER TABLE prizes ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Создание индекса для оптимизации запросов
CREATE INDEX idx_prizes_archived ON prizes(is_archived) WHERE is_archived = TRUE;

-- Комментарий для документации
COMMENT ON COLUMN prizes.is_archived IS 'Маркер архивной записи (удалена из Google Sheets, но данные доставки сохранены)';
```

## Testing Strategy

### Validation Approach

Тестирование следует двухфазному подходу: сначала демонстрация бага на нефиксированном коде (exploratory bug condition checking), затем проверка корректности исправления (fix checking) и сохранения существующего поведения (preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Продемонстрировать баг на НЕФИКСИРОВАННОМ коде. Подтвердить или опровергнуть гипотезу о причинах бага. Если опровергнем, потребуется пересмотр гипотезы.

**Test Plan**: Написать тесты, которые симулируют изменение и удаление записей в Google Sheets, и проверяют, что текущая реализация НЕ обрабатывает эти сценарии корректно. Запустить тесты на НЕФИКСИРОВАННОМ коде для наблюдения сбоев.

**Test Cases**:

1. **Test: Изменение записи в Google Sheets** (провалится на нефиксированном коде)
   - Создать запись в PostgreSQL: `telegram_id=123, code_word="TEST", prize_type="digital"`
   - Изменить в Google Sheets: `prize_type="physical"`
   - Выполнить sync_all_sheets()
   - Ожидаемый сбой: запись остаётся `prize_type="digital"`, `updated_records=0`

2. **Test: Удаление записи без данных доставки** (провалится на нефиксированном коде)
   - Создать запись в PostgreSQL: `telegram_id=456, code_word="TEST2", claimed_at=NULL`
   - Удалить из Google Sheets
   - Выполнить sync_all_sheets()
   - Ожидаемый сбой: запись остаётся в PostgreSQL, `deleted_records=0`

3. **Test: Удаление записи с данными доставки** (провалится на нефиксированном коде)
   - Создать запись в PostgreSQL: `telegram_id=789, code_word="TEST3", claimed_at="2024-01-15"`
   - Удалить из Google Sheets
   - Выполнить sync_all_sheets()
   - Ожидаемый сбой: запись остаётся в PostgreSQL, `is_archived=False`, `deleted_records=0`

4. **Test: Статистика синхронизации** (провалится на нефиксированном коде)
   - Создать 3 записи в PostgreSQL
   - Добавить 2 новые записи в Google Sheets, изменить 1 существующую, удалить 1
   - Выполнить sync_all_sheets()
   - Ожидаемый сбой: `new_records=3, updated_records=0, deleted_records=0` (вместо `new_records=2, updated_records=1, deleted_records=1`)

**Expected Counterexamples**:
- Изменённые записи не обновляются в PostgreSQL
- Удалённые записи остаются в PostgreSQL
- Статистика показывает `updated_records=0, deleted_records=0` всегда
- Возможные причины: отсутствие diff механизма, некорректная статистика в batch_upsert_prizes, отсутствие методов удаления/архивирования

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где условие бага выполняется (isBugCondition возвращает true), исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := sync_all_sheets'(input)
  
  // Проверка 1: Изменённые записи обновлены
  FOR ALL record IN input.sheets_records DO
    IF record EXISTS IN input.postgres_records THEN
      postgres_record := get_from_postgres(record.telegram_id, record.code_word)
      ASSERT postgres_record.data == record.data
      ASSERT result.updated_records > 0
    END IF
  END FOR
  
  // Проверка 2: Удалённые записи обработаны
  FOR ALL record IN input.postgres_records DO
    IF record NOT IN input.sheets_records THEN
      IF record.claimed_at IS NULL THEN
        ASSERT record NOT EXISTS IN postgres_after_sync
      ELSE
        ASSERT record EXISTS IN postgres_after_sync
        ASSERT record.is_archived == true
      END IF
    END IF
  END FOR
  
  // Проверка 3: Статистика корректна
  ASSERT result.new_records == count(new_records_inserted)
  ASSERT result.updated_records == count(existing_records_updated)
  ASSERT result.deleted_records == count(records_deleted_or_archived)
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где условие бага НЕ выполняется (isBugCondition возвращает false), исправленная функция производит тот же результат, что и оригинальная функция.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  // input - сценарии без изменений и удалений:
  // - Только новые записи в Google Sheets
  // - Записи не изменены и не удалены
  // - Backward sync
  
  ASSERT sync_all_sheets(input) == sync_all_sheets'(input)
  
  // Защита данных доставки сохраняется
  FOR ALL record WHERE record.claimed_at IS NOT NULL DO
    ASSERT delivery_data_protected(record)
  END FOR
  
  // Backward sync продолжает работать
  ASSERT backward_sync_works()
  
  // Graceful degradation сохраняется
  ASSERT graceful_degradation_on_errors()
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев по всему входному домену
- Обнаруживает граничные случаи, которые могут быть пропущены в ручных unit тестах
- Предоставляет сильные гарантии, что поведение не изменилось для всех не-багованных входных данных

**Test Plan**: Наблюдать поведение на НЕФИКСИРОВАННОМ коде для сценариев без изменений/удалений, затем написать property-based тесты, захватывающие это поведение.

**Test Cases**:

1. **Preservation Test: Вставка новых записей** - Наблюдать, что новые записи из Google Sheets корректно вставляются на нефиксированном коде, затем написать тест для проверки, что это продолжает работать после исправления

2. **Preservation Test: Защита данных доставки** - Наблюдать, что данные доставки защищены от перезаписи на нефиксированном коде, затем написать тест для проверки, что это продолжает работать после исправления

3. **Preservation Test: Backward sync** - Наблюдать, что backward sync работает корректно на нефиксированном коде, затем написать тест для проверки, что это продолжает работать после исправления

4. **Preservation Test: Graceful degradation** - Наблюдать, что ошибки одного листа не блокируют синхронизацию других листов на нефиксированном коде, затем написать тест для проверки, что это продолжает работать после исправления

### Unit Tests

- Тест `get_prizes_by_sheet()` для корректного получения записей листа
- Тест `batch_delete_prizes()` для удаления записей без данных доставки
- Тест `batch_archive_prizes()` для архивирования записей с данными доставки
- Тест `batch_upsert_prizes()` для корректной статистики (new_records, updated_records)
- Тест трёхфазной синхронизации в `sync_sheet()` (INSERT/UPDATE → DELETE → STATS)
- Тест граничных случаев (пустой лист, все записи удалены, все записи новые)

### Property-Based Tests

- Генерация случайных состояний Google Sheets и PostgreSQL для проверки корректности синхронизации
- Генерация случайных конфигураций записей (с/без данных доставки) для проверки корректности удаления/архивирования
- Тестирование по множеству сценариев для проверки, что все не-багованные входные данные продолжают работать корректно

### Integration Tests

- Полный цикл синхронизации с реальным Google Sheets (тестовая таблица)
- Проверка корректности работы с множеством листов
- Проверка graceful degradation при ошибках Google Sheets API
- Проверка корректности backward sync после forward sync с удалениями
