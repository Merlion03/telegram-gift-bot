# Help Needed Reset on Main Menu Bugfix Design

## Overview

Данный документ описывает дизайн исправления бага, при котором флаг `help_needed` не сбрасывается при вызове операции "Вернуть в главное меню" (reset-state). Когда администратор возвращает пользователя в главное меню через админ-панель, система должна сбросить флаг `help_needed` в `False`, чтобы индикатор в админ-панели снова стал красным. Текущая реализация не выполняет этот сброс, что приводит к тому, что зелёный индикатор остаётся активным даже после возврата пользователя в главное меню.

Исправление будет минимальным и целенаправленным: добавление одного вызова метода `session.reset_help_needed()` в правильном месте последовательности операций `StateResetService.reset_user_state()`.

## Glossary

- **Bug_Condition (C)**: Условие, при котором проявляется баг - администратор вызывает "Вернуть в главное меню" для пользователя с `help_needed=True`
- **Property (P)**: Желаемое поведение - флаг `help_needed` должен быть сброшен в `False` в базе данных
- **Preservation**: Существующее поведение операции reset-state (очистка FSM, сохранение /start, вызов обработчика), которое должно остаться неизменным
- **StateResetService**: Сервис в `telegram-bot/services/state_reset_service.py`, отвечающий за сброс состояния пользователя
- **reset_user_state()**: Метод StateResetService, выполняющий последовательность операций сброса состояния
- **help_needed**: Булевый флаг в модели `SupportSession`, указывающий что пользователь нажал кнопку "Нужна помощь"
- **SupportSession**: Модель сессии поддержки в `telegram-bot/database/models/support.py`
- **reset_help_needed()**: Метод модели `SupportSession`, сбрасывающий флаг `help_needed` в `False`
- **SessionManager**: Сервис в `telegram-bot/services/session_manager.py`, управляющий сессиями пользователей

## Bug Details

### Bug Condition

Баг проявляется когда администратор вызывает операцию "Вернуть в главное меню" для пользователя, у которого установлен флаг `help_needed=True`. Метод `StateResetService.reset_user_state()` выполняет четыре операции (очистка FSM, сохранение команды /start, вызов обработчика /start, логирование), но нигде не сбрасывает флаг `help_needed` в базе данных.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ResetStateRequest
  OUTPUT: boolean
  
  RETURN input.telegram_id IS valid integer
         AND input.session_id IS valid integer
         AND session EXISTS with session_id = input.session_id
         AND session.help_needed = True
         AND admin calls reset_user_state()
         AND help_needed NOT reset to False after operation
END FUNCTION
```

### Examples

- **Пример 1**: Пользователь с `telegram_id=123456` нажимает кнопку "Нужна помощь", флаг `help_needed` устанавливается в `True`, счётчик в админ-панели становится зелёным. Администратор нажимает "Вернуть в главное меню" → **Ожидается**: `help_needed=False`, счётчик красный. **Фактически**: `help_needed=True`, счётчик остаётся зелёным.

- **Пример 2**: Пользователь с активной сессией `session_id=42` и `help_needed=True` получает reset-state от администратора → **Ожидается**: FSM сброшен, команда /start отправлена, `help_needed=False`. **Фактически**: FSM сброшен, команда /start отправлена, но `help_needed=True` (не изменился).

- **Пример 3**: Администратор вызывает `/api/bot/reset-state` с `telegram_id=789012` и `session_id=15`, где `help_needed=True` → **Ожидается**: все операции reset-state выполнены + `help_needed` сброшен. **Фактически**: все операции выполнены, но `help_needed` не сброшен.

- **Edge case**: Пользователь с `help_needed=False` получает reset-state → **Ожидается**: `help_needed` остаётся `False`, никаких изменений в этом флаге. **Фактически**: работает корректно (флаг уже False).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Очистка FSM состояния через `FSMContext.clear()` должна продолжать работать точно так же
- Сохранение команды `/start` в историю сообщений с типом `from_user` должно продолжать работать
- Программный вызов обработчика `CommonHandler.handle_start()` должен продолжать работать
- Логирование операции сброса состояния должно продолжать работать
- Порядок выполнения существующих операций (1. FSM clear, 2. save /start, 3. invoke handler, 4. log) должен остаться неизменным

**Scope:**
Все входные данные, где `help_needed=False` или где операция reset-state вызывается для пользователей без активной сессии, должны быть полностью не затронуты этим исправлением. Это включает:
- Пользователей, которые никогда не нажимали кнопку "Нужна помощь"
- Пользователей, у которых флаг `help_needed` уже сброшен
- Все остальные операции StateResetService

## Hypothesized Root Cause

На основе анализа кода, наиболее вероятная причина бага:

1. **Отсутствие вызова reset_help_needed()**: Метод `StateResetService.reset_user_state()` не вызывает `session.reset_help_needed()` ни на одном из четырёх шагов выполнения
   - Шаг 1 (`_clear_fsm_state`): работает только с FSM storage, не касается БД
   - Шаг 2 (`_save_start_command`): сохраняет сообщение, но не трогает флаг сессии
   - Шаг 3 (`_invoke_start_handler`): вызывает обработчик /start, но не сбрасывает флаг
   - Шаг 4 (`_log_reset_operation`): только логирование

2. **Отсутствие доступа к объекту сессии**: StateResetService имеет `session_manager`, но не получает объект активной сессии для работы с ним
   - Есть `session_id` в параметрах, но нет вызова `repository.get_user_active_session()`
   - Нет обращения к методу `session.reset_help_needed()`

3. **Логическая неполнота операции reset-state**: Операция "Вернуть в главное меню" задумана как полный сброс состояния пользователя, но не включает сброс флага запроса помощи
   - Сбрасывается FSM состояние (диалоговые состояния)
   - Сбрасывается история диалога (отправка /start)
   - Но НЕ сбрасывается флаг `help_needed` (индикатор запроса помощи)

## Correctness Properties

Property 1: Bug Condition - Help Needed Flag Reset on Main Menu

_For any_ reset-state operation where the user has an active session with `help_needed=True`, the fixed `reset_user_state()` function SHALL reset the `help_needed` flag to `False` in the database, causing the admin panel indicator to change from green to red.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Existing Reset-State Operations

_For any_ reset-state operation, the fixed code SHALL continue to perform all existing operations (FSM clear, save /start command, invoke /start handler, logging) in the same order and with the same behavior as the original code, preserving all functionality except the addition of `help_needed` flag reset.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Предполагая, что наш анализ корневой причины верен:

**File**: `telegram-bot/services/state_reset_service.py`

**Function**: `reset_user_state()`

**Specific Changes**:

1. **Добавить получение активной сессии**: После валидации входных данных, но перед началом операций сброса
   - Вызвать `session = await self.session_manager.repository.get_user_active_session(telegram_id)`
   - Проверить, что сессия существует (если нет - логировать warning, но продолжить выполнение)

2. **Добавить сброс флага help_needed**: После шага 1 (очистка FSM), но перед шагом 2 (сохранение /start)
   - Если сессия существует: вызвать `session.reset_help_needed()`
   - Сохранить изменения в БД через `await self.session_manager.repository.save_session(session)`
   - Логировать операцию сброса флага

3. **Обработка ошибок**: Обернуть операцию сброса флага в try-except
   - Если сброс флага не удался - логировать ошибку, но НЕ прерывать выполнение остальных операций
   - Это гарантирует, что даже при ошибке сброса флага, пользователь всё равно вернётся в главное меню

4. **Обновить логирование**: Добавить информацию о сбросе флага в финальное логирование
   - В `_log_reset_operation()` добавить поле `help_needed_reset: bool`
   - Логировать успешность сброса флага

5. **Порядок операций** (обновлённый):
   1. Валидация входных данных
   2. Получение активной сессии
   3. Очистка FSM состояния (`_clear_fsm_state`)
   4. **НОВОЕ**: Сброс флага help_needed (если сессия существует)
   5. Сохранение команды /start (`_save_start_command`)
   6. Вызов обработчика /start (`_invoke_start_handler`)
   7. Логирование операции (`_log_reset_operation`)

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала продемонстрировать баг на неисправленном коде (exploratory bug condition checking), затем проверить, что исправление работает корректно и сохраняет существующее поведение (fix checking + preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Продемонстрировать баг ДО внедрения исправления. Подтвердить или опровергнуть анализ корневой причины. Если опровергнем - нужно будет пересмотреть гипотезу.

**Test Plan**: Написать тесты, которые симулируют вызов reset-state для пользователя с `help_needed=True` и проверяют, что флаг НЕ сбрасывается. Запустить эти тесты на НЕИСПРАВЛЕННОМ коде, чтобы увидеть падение и понять корневую причину.

**Test Cases**:
1. **Basic Bug Reproduction**: Создать сессию с `help_needed=True`, вызвать `reset_user_state()`, проверить что `help_needed` остался `True` (упадёт на неисправленном коде - ожидаем `False`, получаем `True`)
2. **Admin Panel Indicator**: Создать сессию с `help_needed=True`, вызвать reset-state через API endpoint `/api/bot/reset-state`, проверить что флаг не сброшен (упадёт на неисправленном коде)
3. **Multiple Sessions**: Создать несколько сессий с разными значениями `help_needed`, вызвать reset-state для одной из них, проверить что только целевая сессия должна измениться (упадёт на неисправленном коде)
4. **Edge Case - No Active Session**: Вызвать reset-state для пользователя без активной сессии, проверить что операция не падает (может упасть на неисправленном коде, если не обработан этот случай)

**Expected Counterexamples**:
- Флаг `help_needed` остаётся `True` после вызова reset-state
- Возможная причина: отсутствие вызова `session.reset_help_needed()` в методе `reset_user_state()`

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где выполняется bug condition, исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := reset_user_state_fixed(input.telegram_id, input.session_id, input.admin_id)
  session := get_session_by_id(input.session_id)
  ASSERT session.help_needed = False
  ASSERT result.success = True
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где bug condition НЕ выполняется, исправленная функция производит тот же результат, что и оригинальная функция.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT reset_user_state_original(input) = reset_user_state_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев по всему входному домену
- Ловит edge cases, которые могут быть пропущены в ручных unit тестах
- Даёт сильные гарантии, что поведение не изменилось для всех не-багованных входных данных

**Test Plan**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для случаев с `help_needed=False` и без активной сессии, затем написать property-based тесты, фиксирующие это поведение.

**Test Cases**:
1. **FSM Clear Preservation**: Наблюдать что FSM состояние очищается на неисправленном коде, затем написать тест проверяющий что это продолжает работать после исправления
2. **Start Command Save Preservation**: Наблюдать что команда /start сохраняется в БД на неисправленном коде, затем написать тест проверяющий что это продолжает работать
3. **Start Handler Invocation Preservation**: Наблюдать что обработчик /start вызывается на неисправленном коде, затем написать тест проверяющий что это продолжает работать
4. **Logging Preservation**: Наблюдать что логирование работает на неисправленном коде, затем написать тест проверяющий что это продолжает работать
5. **Help Needed False Preservation**: Наблюдать что для пользователей с `help_needed=False` флаг остаётся `False` на неисправленном коде, затем написать тест проверяющий что это продолжает работать

### Unit Tests

- Тест сброса флага `help_needed` для пользователя с `help_needed=True`
- Тест сохранения флага `help_needed=False` для пользователя с `help_needed=False`
- Тест обработки случая отсутствия активной сессии (не должно падать)
- Тест порядка выполнения операций (FSM clear → help_needed reset → save /start → invoke handler → log)
- Тест обработки ошибок при сбросе флага (не должно прерывать выполнение остальных операций)

### Property-Based Tests

- Генерировать случайные состояния сессий (с разными значениями `help_needed`, `status`, `session_type`) и проверять что reset-state корректно работает для всех
- Генерировать случайные комбинации `telegram_id` и `session_id` и проверять что операция не падает
- Тестировать что для всех входных данных с `help_needed=False` поведение идентично оригинальному коду

### Integration Tests

- Полный flow: пользователь нажимает "Нужна помощь" → администратор видит зелёный индикатор → администратор нажимает "Вернуть в главное меню" → индикатор становится красным
- Тест через API endpoint `/api/bot/reset-state`: отправить POST запрос с `telegram_id`, `session_id`, `admin_id` для пользователя с `help_needed=True`, проверить что флаг сброшен
- Тест взаимодействия с админ-панелью: симулировать действия администратора через Next.js API и проверить что изменения отражаются в БД
