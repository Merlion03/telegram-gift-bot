# Bugfix Requirements Document

## Введение

При обратной синхронизации данных доставки из PostgreSQL в Google Sheets возникает ошибка `APIError: [403]: Request had insufficient authentication scopes`. Ошибка происходит в методе `_sync_sheet_delivery_data()` в файле `telegram-bot/services/sync_service.py` при попытке выполнить `worksheet.batch_update()` для записи данных доставки в Google Sheets.

Проблема вызвана тем, что в методе `_init_client()` используются scopes только для чтения:
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/drive.readonly`

Для выполнения операций записи (batch_update) требуются scopes с правами на запись в Google Sheets.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN метод `_init_client()` инициализирует gspread клиент с scopes `['spreadsheets.readonly', 'drive.readonly']` THEN система использует credentials только для чтения

1.2 WHEN метод `_sync_sheet_delivery_data()` вызывает `worksheet.batch_update(batch_data)` для записи данных доставки THEN Google Sheets API возвращает ошибку `APIError: [403]: Request had insufficient authentication scopes`

1.3 WHEN обратная синхронизация (PostgreSQL → Google Sheets) выполняется в `sync_delivery_data_to_sheets()` THEN данные доставки не записываются в Google Sheets и логируется ошибка `google_sheets_api_error_backward_sync`

### Expected Behavior (Correct)

2.1 WHEN метод `_init_client()` инициализирует gspread клиент THEN система SHALL использовать scopes с правами на чтение и запись: `['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']`

2.2 WHEN метод `_sync_sheet_delivery_data()` вызывает `worksheet.batch_update(batch_data)` для записи данных доставки THEN Google Sheets API SHALL успешно обновить столбцы E-P в указанных строках без ошибок 403

2.3 WHEN обратная синхронизация (PostgreSQL → Google Sheets) выполняется в `sync_delivery_data_to_sheets()` THEN данные доставки SHALL быть успешно записаны в Google Sheets и логируется `backward_sync_completed` с корректной статистикой

### Unchanged Behavior (Regression Prevention)

3.1 WHEN метод `sync_all_sheets()` выполняет прямую синхронизацию (Google Sheets → PostgreSQL) THEN система SHALL CONTINUE TO успешно читать данные из Google Sheets без изменений в функциональности

3.2 WHEN метод `_read_sheet_data()` читает данные из листа Google Sheets THEN система SHALL CONTINUE TO получать все значения начиная со второй строки без изменений в логике чтения

3.3 WHEN метод `_get_all_sheet_names()` получает список листов из Google Sheets THEN система SHALL CONTINUE TO возвращать корректный список названий всех worksheets без изменений

3.4 WHEN service account имеет доступ к Google Sheets через credentials из `credentials/google-credentials.json` THEN система SHALL CONTINUE TO успешно авторизовываться и получать доступ к таблицам

3.5 WHEN метод `_convert_sheet_data_to_prizes()` преобразует данные из Google Sheets THEN система SHALL CONTINUE TO корректно парсить столбцы A-O и создавать объекты Prize без изменений в логике преобразования

3.6 WHEN метод `_batch_upsert_prizes()` выполняет batch upsert в PostgreSQL THEN система SHALL CONTINUE TO успешно сохранять данные в таблицу prizes с обработкой конфликтов через ON CONFLICT DO UPDATE
