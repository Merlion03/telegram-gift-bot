# Bugfix Requirements Document

## Введение

Система падает с ошибкой "Failed to update Google Sheets for row 2" при попытке обновить статус получения приза пользователем. Ошибка возникает из-за того, что в методе `_process_prize_claimed` класса `UpdateQueueService` используется неправильный параметр при вызове `google_sheets_service.save_delivery_data()` - передаётся `code_word` (значение из столбца B таблицы) вместо `sheet_name` (название листа в Google Sheets).

После рефакторинга (spec: google-sheets-code-word-column) поле `code_word` стало храниться в столбце B таблицы и больше не является названием листа. Модель `Prize` содержит оба поля (`code_word` и `sheet_name`), но класс `UpdateTask` не содержит поле `sheet_name`, что приводит к невозможности корректно обновить данные в Google Sheets.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN метод `add_prize_claimed_update` вызывается с параметрами `telegram_id`, `code_word`, `row_id`, `claimed_at` THEN система создаёт `UpdateTask` без поля `sheet_name`

1.2 WHEN метод `_process_prize_claimed` обрабатывает задачу обновления THEN система использует `task.code_word` в качестве параметра `worksheet_name` при вызове `save_delivery_data()`

1.3 WHEN `google_sheets_service.save_delivery_data()` пытается найти лист с названием равным `code_word` (например, "RSYA2028") THEN система не находит такой лист и возвращает `False`

1.4 WHEN `save_delivery_data()` возвращает `False` THEN система выбрасывает исключение `RuntimeError` с сообщением "Failed to update Google Sheets for row {row_id}"

### Expected Behavior (Correct)

2.1 WHEN метод `add_prize_claimed_update` вызывается THEN система SHALL принимать дополнительный параметр `sheet_name` и сохранять его в `UpdateTask`

2.2 WHEN класс `UpdateTask` создаётся THEN система SHALL содержать поле `sheet_name: str` для хранения названия листа Google Sheets

2.3 WHEN метод `_process_prize_claimed` обрабатывает задачу обновления THEN система SHALL использовать `task.sheet_name` в качестве параметра `worksheet_name` при вызове `save_delivery_data()`

2.4 WHEN `prize_service.py` вызывает `add_prize_claimed_update` THEN система SHALL передавать параметр `sheet_name`, который уже доступен в методе

2.5 WHEN `google_sheets_service.save_delivery_data()` вызывается с корректным `worksheet_name` THEN система SHALL успешно обновлять данные в Google Sheets и возвращать `True`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN метод `add_delivery_data_update` вызывается THEN система SHALL CONTINUE TO работать без изменений (этот метод не затронут багом)

3.2 WHEN `UpdateTask` создаётся для типа `DELIVERY_DATA` THEN система SHALL CONTINUE TO обрабатывать задачи доставки корректно

3.3 WHEN очередь обновлений обрабатывает задачи THEN система SHALL CONTINUE TO выполнять повторные попытки при ошибках (механизм retry)

3.4 WHEN `_process_delivery_data` обрабатывает задачи доставки THEN система SHALL CONTINUE TO использовать корректную логику обновления данных доставки

3.5 WHEN система логирует события очереди обновлений THEN система SHALL CONTINUE TO записывать все необходимые данные в логи
