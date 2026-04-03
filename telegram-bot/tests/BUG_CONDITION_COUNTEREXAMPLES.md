# Контрпримеры Bug Condition Exploration

## Дата тестирования
2026-04-02

## Статус кода
**НЕИСПРАВЛЕННЫЙ КОД** - тесты запущены ДО внедрения исправления

## Результаты тестирования

### ✅ Тесты упали как ожидалось
Все три property-based теста упали, подтверждая существование бага.

## Найденные контрпримеры

### 1. test_gdpr_consent_persistence_without_prizes

**Falsifying example:**
```python
telegram_id = 100000
```

**Результат:**
- Пользователь без записей в таблице `prizes` дает согласие с политикой конфиденциальности
- `save_gdpr_consent(100000)` вызван успешно
- `update_gdpr_consent()` вернул: `records_updated=0, updated=False`
- `get_gdpr_consent_date(100000)` вернул `None`
- `check_gdpr_consent(100000)` вернул `False`
- **Ожидалось:** Согласие должно быть сохранено и найдено
- **Причина:** Методы работают только с таблицей `prizes` - UPDATE не создаёт новых записей, SELECT возвращает None

**Подтверждение бага:** ✅ Баг воспроизведён для GDPR Consent Persistence

**Корневая причина:**
- `update_gdpr_consent()` делает `UPDATE prizes SET gdpr_consent_date = ? WHERE telegram_id = ?`
- Если у пользователя нет записей в `prizes`, UPDATE не создаёт новых записей (records_updated=0)
- `get_gdpr_consent_date()` делает `SELECT gdpr_consent_date FROM prizes WHERE telegram_id = ?`
- Возвращает None для пользователей без призов
- **Вывод:** Согласие GDPR концептуально не связано с призами, но хранится в той же таблице, создавая ненужную зависимость

---

### 3. test_check_user_exists_with_claimed_prize

**Falsifying example:**
```python
telegram_id = 100000
prize_type = 'digital'
```

**Результат:**
- `check_user_exists(100000)` вернул `False`
- **Ожидалось:** `True` (пользователь существует в таблице призов)
- **Причина:** Метод проверяет только `Prize.claimed_at.is_(None)`, игнорируя записи с `claimed_at IS NOT NULL`

**Подтверждение бага:** ✅ Баг воспроизведён

---

### 2. test_digital_prize_idempotent_delivery

**Falsifying example:**
```python
telegram_id = 100000
promo_code = '00000'
code_word = 'AAA'
```

**Результат:**
- Пользователь с уже полученным цифровым призом (claimed_at установлен, promo_code='00000')
- `check_user_exists(100000)` вернул `False`
- **Ожидалось:** `True` для идемпотентной выдачи промокода
- **Последствие:** Система покажет "❌ У вас нет доступных призов" вместо повторной выдачи промокода

**Подтверждение бага:** ✅ Баг воспроизведён для цифровых призов

---

### 4. test_physical_prize_show_filled_delivery_status

**Falsifying example:**
```python
telegram_id = 100000
last_name = 'AA'
first_name = 'AA'
city = 'AA'
code_word = 'AAA'
```

**Результат:**
- Пользователь с заполненной формой доставки (claimed_at установлен, все поля доставки заполнены)
- `check_user_exists(100000)` вернул `False`
- **Ожидалось:** `True` для показа статуса заполненной формы
- **Последствие:** Система покажет "❌ У вас нет доступных призов" вместо сообщения "✅ Вы уже заполнили данные для получения приза"

**Подтверждение бага:** ✅ Баг воспроизведён для физических призов

---

## Анализ корневой причины

### Подтверждённая корневая причина для GDPR Consent Persistence

Методы `get_gdpr_consent_date` и `update_gdpr_consent` в `prize_repository.py` работают только с таблицей `prizes`:

**update_gdpr_consent (строки 556-620):**
```python
stmt = (
    update(Prize)
    .where(Prize.telegram_id == telegram_id)
    .values(
        gdpr_consent_date=consent_date,
        updated_at=datetime.now(timezone.utc)
    )
)
```

**Проблема:** UPDATE не создаёт новых записей, если у пользователя нет призов (records_updated=0)

**get_gdpr_consent_date (строки 504-555):**
```python
query = select(Prize.gdpr_consent_date).where(
    Prize.telegram_id == telegram_id
).limit(1)
```

**Проблема:** SELECT возвращает None для пользователей без записей в таблице `prizes`

**Вывод:** Согласие GDPR концептуально не связано с призами, но хранится в той же таблице, создавая ненужную зависимость. Пользователи без призов не могут сохранить согласие.

### Подтверждённая корневая причина для check_user_exists

Метод `check_user_exists` в `prize_repository.py` (строки 453-505) использует SQL-запрос:

```python
query = select(Prize.id).where(
    and_(
        Prize.telegram_id == telegram_id,
        Prize.claimed_at.is_(None)  # ← ПРОБЛЕМА ЗДЕСЬ
    )
).limit(1)
```

**Проблема:** Условие `Prize.claimed_at.is_(None)` исключает из поиска все записи с установленным `claimed_at`, что приводит к ложному результату "пользователь не найден" для пользователей, которые уже получили приз.

### Влияние на систему

1. **Цифровые призы:** Пользователи не могут получить промокод повторно (не идемпотентно)
2. **Физические призы:** Пользователи не могут увидеть статус заполненной формы доставки
3. **UX проблема:** Пользователи видят сообщение "У вас нет доступных призов", хотя они являются победителями

### Рекомендуемое исправление для GDPR Consent Persistence

Создать отдельную таблицу `gdpr_consents` для независимого хранения согласий:

```python
# Новая таблица gdpr_consents
CREATE TABLE gdpr_consents (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    consent_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

Создать новый репозиторий `GdprConsentRepository` с методами:
- `get_consent(telegram_id)` - получить согласие из отдельной таблицы
- `save_consent(telegram_id, consent_date)` - сохранить согласие (upsert)
- `check_consent_exists(telegram_id)` - проверить наличие согласия

Обновить `PrizeService` для использования нового репозитория вместо методов из `PrizeRepository`.

### Рекомендуемое исправление для check_user_exists

Удалить условие `Prize.claimed_at.is_(None)` из WHERE-клаузы:

```python
query = select(Prize.id).where(
    Prize.telegram_id == telegram_id  # Проверяем только наличие пользователя
).limit(1)
```

## Следующие шаги

1. ✅ Bug condition exploration завершён - баги подтверждены:
   - ✅ GDPR Consent Persistence - согласие не сохраняется для пользователей без призов
   - ✅ check_user_exists - не находит пользователей с claimed_at IS NOT NULL
   - ✅ Идемпотентная выдача цифровых призов - не работает
   - ✅ Показ статуса физических призов - не работает
2. ⏭️ Написать preservation property тесты (задача 2)
3. ⏭️ Реализовать исправления (задача 3)
4. ⏭️ Проверить, что bug condition тесты проходят после исправления
5. ⏭️ Проверить, что preservation тесты всё ещё проходят (нет регрессий)
