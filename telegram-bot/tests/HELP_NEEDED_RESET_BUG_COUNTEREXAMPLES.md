# Help Needed Reset Bug - Counterexamples

## Дата: 2026-04-09

## Описание бага

При вызове операции "Вернуть в главное меню" (`StateResetService.reset_user_state()`) для пользователя с активной сессией и флагом `help_needed=True`, флаг НЕ сбрасывается в `False`, как ожидается.

## Найденные counterexamples

### Counterexample 1: Базовый случай

**Входные данные:**
- `telegram_id`: 100000
- `admin_id`: '00000'
- `session_id`: 2
- `help_needed` (до операции): True

**Ожидаемое поведение:**
- После вызова `reset_user_state()` флаг `help_needed` должен быть сброшен в `False`

**Фактическое поведение:**
- После вызова `reset_user_state()` флаг `help_needed` остался `True`

**Assertion Error:**
```
AssertionError: После вызова reset_user_state() для пользователя с telegram_id=100000 
и session_id=2, флаг help_needed должен быть сброшен в False. 
Получено: True. 
Это подтверждает баг: StateResetService.reset_user_state() не сбрасывает флаг help_needed.
```

## Анализ корневой причины

Из логов видно, что метод `StateResetService.reset_user_state()` выполняет следующие операции:

1. ✅ Очистка FSM состояния (`fsm_state_cleared`)
2. ✅ Сохранение команды `/start` в БД (`start_command_saved`)
3. ✅ Вызов обработчика `/start` (`start_handler_invoked`)
4. ✅ Логирование успешной операции (`state_reset_completed`)

**НО:**
- ❌ Нигде не вызывается `session.reset_help_needed()`
- ❌ Флаг `help_needed` не сбрасывается в базе данных

## Подтверждение гипотезы

Гипотеза из design.md подтверждена:
> Метод `StateResetService.reset_user_state()` не вызывает `session.reset_help_needed()` ни на одном из четырёх шагов выполнения

Тест успешно выявил баг и подтвердил корневую причину.

## Следующие шаги

1. ✅ Тест написан и запущен на неисправленном коде
2. ✅ Counterexamples задокументированы
3. ⏳ Следующий шаг: Написать preservation property тесты (задача 2)
4. ⏳ Реализовать исправление (задача 3)
5. ⏳ Проверить что тест проходит после исправления

## Примечания

- Тест использует property-based testing с Hypothesis
- Ограничено 10 примерами для детерминистического бага (Scoped PBT подход)
- Тест кодирует ОЖИДАЕМОЕ поведение - он будет валидировать исправление когда пройдёт после реализации
