# Bugfix Requirements Document

## Введение

После синхронизации данных доставки из PostgreSQL в Google Sheets (backward sync) пропадают столбцы E (Промокод) и F (Инструкция). Это происходит потому, что метод `_sync_sheet_delivery_data` записывает данные доставки начиная со столбца E, перезаписывая существующие данные промокода и инструкции.

Корневая причина: в методе `_sync_sheet_delivery_data` (файл `telegram-bot/services/sync_service.py`, строка 976) данные доставки записываются в диапазон `E{row_id}:P{row_id}`, но столбцы E и F уже заняты промокодом и инструкцией для цифровых призов.

Правильная структура должна быть:
- Столбцы A-F: Неизменяемые данные (telegram_id, username, code_word, prize_type, promo_code, instructions)
- Столбцы G-R: Данные доставки (12 полей: last_name, first_name, patronymic, city, street, house, apartment, phone, comment, country, postal_code, claimed_at)

## Анализ бага

### Current Behavior (Defect)

1.1 WHEN backward sync записывает данные доставки в Google Sheets THEN система записывает данные в диапазон E:P, перезаписывая столбцы E (промокод) и F (инструкция)

1.2 WHEN пользователь получает цифровой приз и заполняет данные доставки THEN после backward sync промокод и инструкция исчезают из Google Sheets

1.3 WHEN метод `_sync_sheet_delivery_data` формирует batch update THEN диапазон обновления указывается как `E{row_id}:P{row_id}` вместо `G{row_id}:R{row_id}`

### Expected Behavior (Correct)

2.1 WHEN backward sync записывает данные доставки в Google Sheets THEN система SHALL записывать данные в диапазон G:R, сохраняя столбцы E (промокод) и F (инструкция) нетронутыми

2.2 WHEN пользователь получает цифровой приз и заполняет данные доставки THEN после backward sync промокод и инструкция SHALL оставаться в столбцах E и F без изменений

2.3 WHEN метод `_sync_sheet_delivery_data` формирует batch update THEN диапазон обновления SHALL быть `G{row_id}:R{row_id}` для 12 полей данных доставки

### Unchanged Behavior (Regression Prevention)

3.1 WHEN forward sync читает данные из Google Sheets THEN система SHALL CONTINUE TO корректно читать промокод из столбца E и инструкцию из столбца F

3.2 WHEN forward sync читает данные доставки из Google Sheets THEN система SHALL CONTINUE TO корректно читать данные доставки из столбцов G-R

3.3 WHEN backward sync обновляет данные доставки для физических призов THEN система SHALL CONTINUE TO корректно записывать все 12 полей данных доставки

3.4 WHEN backward sync обновляет данные для записей без промокода и инструкции THEN система SHALL CONTINUE TO корректно обновлять данные доставки
