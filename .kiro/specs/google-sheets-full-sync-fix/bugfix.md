# Bugfix Requirements Document

## Введение

Система синхронизации между Google Sheets и PostgreSQL работает некорректно при изменении и удалении данных в Google Sheets. Forward sync (Google Sheets → PostgreSQL) выполняет только вставку новых записей, но не обновляет существующие и не удаляет записи, которые были удалены из Google Sheets. Это приводит к тому, что PostgreSQL содержит устаревшие данные, а пользователи получают промокоды для записей, которые уже удалены из источника данных.

**Критичность**: Высокая - пользователи получают доступ к удалённым призам, что нарушает бизнес-логику.

**Затронутые компоненты**:
- `telegram-bot/services/sync_service.py` - метод `sync_all_sheets()`, `_batch_upsert_prizes()`
- `telegram-bot/database/repositories/prize_repository.py` - метод `batch_upsert_prizes()`

## Анализ бага

### Текущее поведение (Дефект)

1.1 КОГДА запись существует в PostgreSQL, но изменена в Google Sheets (например, изменён prize_type или promo_code), ТО система НЕ обновляет эту запись в PostgreSQL и показывает `updated_records=0`

1.2 КОГДА запись удалена из Google Sheets, но существует в PostgreSQL, ТО система НЕ удаляет эту запись из PostgreSQL и она остаётся доступной для пользователей

1.3 КОГДА выполняется синхронизация, ТО система всегда показывает `new_records=N, updated_records=0`, даже если записи уже существуют в PostgreSQL

1.4 КОГДА пользователь удаляет свои данные из Google Sheets, ТО бот всё равно выдаёт промокод из PostgreSQL, так как запись не была удалена

### Ожидаемое поведение (Корректное)

2.1 КОГДА запись существует в PostgreSQL и изменена в Google Sheets, ТО система ДОЛЖНА обновить эту запись в PostgreSQL и увеличить счётчик `updated_records`

2.2 КОГДА запись удалена из Google Sheets, но существует в PostgreSQL с `claimed_at IS NULL`, ТО система ДОЛЖНА удалить эту запись из PostgreSQL

2.3 КОГДА запись удалена из Google Sheets, но существует в PostgreSQL с `claimed_at IS NOT NULL`, ТО система ДОЛЖНА сохранить эту запись (защита данных доставки) и пометить её как архивную

2.4 КОГДА выполняется синхронизация, ТО система ДОЛЖНА корректно различать новые записи (`new_records`) и обновлённые записи (`updated_records`) в статистике

2.5 КОГДА пользователь удаляет свои данные из Google Sheets и запись не имеет данных доставки, ТО бот НЕ ДОЛЖЕН выдавать промокод для этой записи

### Неизменное поведение (Предотвращение регрессии)

3.1 КОГДА запись имеет `claimed_at IS NOT NULL` (данные доставки сохранены), ТО система ДОЛЖНА ПРОДОЛЖАТЬ защищать поля данных доставки от перезаписи из Google Sheets

3.2 КОГДА новая запись добавляется в Google Sheets, ТО система ДОЛЖНА ПРОДОЛЖАТЬ вставлять её в PostgreSQL как новую запись

3.3 КОГДА выполняется backward sync (PostgreSQL → Google Sheets), ТО система ДОЛЖНА ПРОДОЛЖАТЬ синхронизировать данные доставки обратно в Google Sheets

3.4 КОГДА происходит ошибка синхронизации одного листа, ТО система ДОЛЖНА ПРОДОЛЖАТЬ синхронизацию других листов (graceful degradation)

3.5 КОГДА запись существует в PostgreSQL с корректными данными и не изменена в Google Sheets, ТО система НЕ ДОЛЖНА выполнять лишние UPDATE операции (оптимизация производительности)

## Условие бага (Bug Condition)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type SyncInput
  OUTPUT: boolean
  
  // X.sheets_records - записи из Google Sheets
  // X.postgres_records - записи из PostgreSQL
  
  // Баг проявляется когда:
  // 1. Запись изменена в Google Sheets (существует в обоих источниках, но данные отличаются)
  // 2. Запись удалена из Google Sheets (существует в PostgreSQL, но отсутствует в Google Sheets)
  
  RETURN (
    // Случай 1: Запись изменена
    EXISTS record IN X.postgres_records WHERE (
      record IN X.sheets_records AND
      record.data_differs_from_sheets(X.sheets_records)
    )
  ) OR (
    // Случай 2: Запись удалена из Google Sheets
    EXISTS record IN X.postgres_records WHERE (
      record NOT IN X.sheets_records
    )
  )
END FUNCTION
```

## Свойство корректности (Property)

```pascal
// Property: Fix Checking - Корректная синхронизация изменений и удалений
FOR ALL X WHERE isBugCondition(X) DO
  result ← sync_all_sheets'(X)
  
  // Проверка 1: Изменённые записи обновлены
  FOR ALL record IN X.sheets_records DO
    IF record EXISTS IN X.postgres_records THEN
      postgres_record ← get_from_postgres(record.telegram_id, record.code_word)
      ASSERT postgres_record.data == record.data
      ASSERT result.updated_records > 0
    END IF
  END FOR
  
  // Проверка 2: Удалённые записи обработаны
  FOR ALL record IN X.postgres_records DO
    IF record NOT IN X.sheets_records THEN
      IF record.claimed_at IS NULL THEN
        // Запись без данных доставки должна быть удалена
        ASSERT record NOT EXISTS IN postgres_after_sync
      ELSE
        // Запись с данными доставки должна быть помечена как архивная
        ASSERT record EXISTS IN postgres_after_sync
        ASSERT record.is_archived == true
      END IF
    END IF
  END FOR
  
  // Проверка 3: Статистика корректна
  ASSERT result.new_records == count(new_records_inserted)
  ASSERT result.updated_records == count(existing_records_updated)
  ASSERT result.deleted_records == count(records_deleted)
END FOR
```

## Цель сохранения (Preservation Goal)

```pascal
// Property: Preservation Checking - Неизменное поведение для корректных сценариев
FOR ALL X WHERE NOT isBugCondition(X) DO
  // X - сценарии, где баг не проявляется:
  // - Только новые записи в Google Sheets
  // - Записи не изменены и не удалены
  // - Backward sync
  
  ASSERT sync_all_sheets(X) == sync_all_sheets'(X)
  
  // Защита данных доставки сохраняется
  FOR ALL record WHERE record.claimed_at IS NOT NULL DO
    ASSERT delivery_data_protected(record)
  END FOR
END FOR
```

## Контрпример (Counterexample)

**Сценарий**: Пользователь удалил свою запись из Google Sheets, но бот всё равно выдал промокод

**Входные данные**:
- Google Sheets: запись с `telegram_id=123456, code_word="PROMO2024"` удалена
- PostgreSQL: запись с `telegram_id=123456, code_word="PROMO2024", claimed_at=NULL` существует

**Текущее поведение** (F):
```python
# После sync_all_sheets()
stats = {
    'new_records': 0,
    'updated_records': 0,
    'deleted_records': 0  # Поле отсутствует
}
# Запись остаётся в PostgreSQL
# Пользователь получает промокод при запросе
```

**Ожидаемое поведение** (F'):
```python
# После sync_all_sheets'()
stats = {
    'new_records': 0,
    'updated_records': 0,
    'deleted_records': 1
}
# Запись удалена из PostgreSQL
# Пользователь НЕ получает промокод при запросе
```
