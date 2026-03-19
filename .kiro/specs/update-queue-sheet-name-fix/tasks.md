# Implementation Plan

- [x] 1. Написать exploratory тест для Bug Condition
  - **Property 1: Bug Condition** - Correct Sheet Name Usage
  - **КРИТИЧЕСКИ ВАЖНО**: Этот тест ДОЛЖЕН УПАСТЬ на нефиксированном коде - падение подтверждает существование бага
  - **НЕ ПЫТАТЬСЯ исправить тест или код когда он упадёт**
  - **ПРИМЕЧАНИЕ**: Этот тест кодирует ожидаемое поведение - он будет валидировать исправление, когда пройдёт после реализации
  - **ЦЕЛЬ**: Выявить конкретные примеры (counterexamples), демонстрирующие существование бага
  - **Подход Scoped PBT**: Для детерминированного бага ограничить property конкретными падающими случаями для воспроизводимости
  - Тест должен проверить, что UpdateTask для PRIZE_CLAIMED не содержит поле sheet_name (AttributeError)
  - Тест должен проверить, что _process_prize_claimed использует task.code_word вместо корректного sheet_name
  - Тест должен симулировать ситуацию: code_word="RSYA2028", sheet_name="Лист1", и проверить, что система пытается найти лист "RSYA2028"
  - Тест должен проверить, что Google Sheets API не находит лист с названием равным code_word и возвращает False
  - Тест должен проверить, что система выбрасывает RuntimeError: "Failed to update Google Sheets for row X"
  - Запустить тест на НЕФИКСИРОВАННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПАДАЕТ (это правильно - доказывает существование бага)
  - Задокументировать найденные counterexamples для понимания первопричины
  - Отметить задачу выполненной, когда тест написан, запущен и падение задокументировано
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Написать preservation property тесты (ДО реализации исправления)
  - **Property 2: Preservation** - Delivery Data Updates Unchanged
  - **ВАЖНО**: Следовать методологии observation-first
  - Наблюдать поведение на НЕФИКСИРОВАННОМ коде для обновлений типа DELIVERY_DATA
  - Наблюдать, что механизм retry с exponential backoff работает корректно
  - Наблюдать, что воркер очереди (_worker) обрабатывает задачи корректно
  - Наблюдать, что логирование событий очереди работает правильно
  - Написать property-based тесты, захватывающие наблюдаемые паттерны поведения из Preservation Requirements
  - Property-based тестирование генерирует множество тестовых случаев для более сильных гарантий
  - Запустить тесты на НЕФИКСИРОВАННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (это подтверждает baseline поведение для сохранения)
  - Отметить задачу выполненной, когда тесты написаны, запущены и проходят на нефиксированном коде
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Исправление для бага с именем листа в UpdateQueueService

  - [x] 3.1 Реализовать исправление
    - Добавить поле `sheet_name: str` в dataclass UpdateTask после поля `code_word`
    - Обновить сигнатуру метода `add_prize_claimed_update`: добавить параметр `sheet_name: str`
    - Обновить создание UpdateTask в `add_prize_claimed_update`: передавать `sheet_name=sheet_name`
    - Обновить логирование в `add_prize_claimed_update` для включения sheet_name
    - Исправить метод `_process_prize_claimed`: заменить `worksheet_name=task.code_word` на `worksheet_name=task.sheet_name`
    - В файле `prize_service.py`, метод `_mark_prize_claimed_async`: добавить параметр `sheet_name=sheet_name` при вызове `update_queue_service.add_prize_claimed_update()`
    - _Bug_Condition: isBugCondition(input) где input.update_type == PRIZE_CLAIMED AND NOT hasField(input, "sheet_name")_
    - _Expected_Behavior: _process_prize_claimed использует task.sheet_name для корректного обновления Google Sheets_
    - _Preservation: Обновления DELIVERY_DATA, механизм retry, воркер очереди и логирование остаются неизменными_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Проверить, что exploratory тест Bug Condition теперь проходит
    - **Property 1: Expected Behavior** - Correct Sheet Name Usage
    - **ВАЖНО**: Перезапустить ТОТ ЖЕ тест из задачи 1 - НЕ писать новый тест
    - Тест из задачи 1 кодирует ожидаемое поведение
    - Когда этот тест проходит, это подтверждает, что ожидаемое поведение достигнуто
    - Запустить exploratory тест Bug Condition из шага 1
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОХОДИТ (подтверждает, что баг исправлен)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Проверить, что preservation тесты всё ещё проходят
    - **Property 2: Preservation** - Delivery Data Updates Unchanged
    - **ВАЖНО**: Перезапустить ТЕ ЖЕ тесты из задачи 2 - НЕ писать новые тесты
    - Запустить preservation property тесты из шага 2
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (подтверждает отсутствие регрессий)
    - Подтвердить, что все тесты всё ещё проходят после исправления (нет регрессий)

- [-] 4. Checkpoint - Убедиться, что все тесты проходят
  - Убедиться, что все тесты проходят, спросить пользователя, если возникнут вопросы
