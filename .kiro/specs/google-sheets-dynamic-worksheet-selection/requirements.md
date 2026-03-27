# Requirements Document

## Введение

Текущая реализация GoogleSheetsClient содержит критическую ошибку: при сохранении данных доставки всегда используется первый лист таблицы, игнорируя информацию о целевом листе, хранящуюся в базе данных. Это приводит к тому, что данные доставки сохраняются не на тот лист, где находится запись победителя.

Данная фича исправляет эту проблему, добавляя поддержку динамического выбора листа на основе данных из базы Prize_Database. Система должна получать название листа (sheet_name) из базы данных по prize_id и использовать его при сохранении данных в Google Sheets.

## Глоссарий

- **GoogleSheetsClient**: TypeScript класс для работы с Google Sheets API
- **Prize_Database**: База данных SQLite в Python backend, хранящая информацию о призах
- **Delivery_API**: API endpoint `/api/delivery` в Next.js приложении
- **Sheet_Name**: Название листа в Google Таблице, где находится запись победителя
- **Prize_ID**: Уникальный идентификатор приза, соответствует row_id в Google Sheets
- **Row_ID**: Номер строки в Google Sheets, где находится запись победителя
- **Backend**: Python Telegram bot приложение
- **Frontend**: Next.js TypeScript приложение

## Требования

### Requirement 1: Получение информации о листе из базы данных

**User Story:** Как система, я хочу получать информацию о листе из базы данных по prize_id, чтобы знать, на какой лист сохранять данные доставки.

#### Acceptance Criteria

1. WHEN Backend получает запрос на информацию о призе с prize_id, THE Backend SHALL вернуть объект, содержащий sheet_name, code_word и row_id
2. IF prize_id не существует в Prize_Database, THEN THE Backend SHALL вернуть HTTP 404 с сообщением об ошибке
3. THE Backend SHALL предоставить API endpoint для получения информации о призе по prize_id
4. THE Backend SHALL валидировать, что prize_id является положительным целым числом
5. WHEN запрос к базе данных выполнен успешно, THE Backend SHALL вернуть HTTP 200 с JSON объектом

### Requirement 2: Передача sheet_name через API

**User Story:** Как Frontend, я хочу получать sheet_name вместе с другими данными о призе, чтобы передать его в GoogleSheetsClient.

#### Acceptance Criteria

1. WHEN Frontend запрашивает информацию о призе, THE Delivery_API SHALL получить sheet_name из Backend
2. THE Delivery_API SHALL передать sheet_name в метод saveDeliveryData класса GoogleSheetsClient
3. IF Backend не вернул sheet_name, THEN THE Delivery_API SHALL вернуть HTTP 500 с сообщением об ошибке
4. THE Delivery_API SHALL валидировать, что sheet_name не является пустой строкой
5. WHEN sheet_name получен успешно, THE Delivery_API SHALL логировать название листа для отладки

### Requirement 3: Использование динамического листа в GoogleSheetsClient

**User Story:** Как GoogleSheetsClient, я хочу использовать переданный sheet_name вместо первого листа, чтобы сохранять данные на правильный лист.

#### Acceptance Criteria

1. THE GoogleSheetsClient SHALL принимать sheet_name как параметр метода saveDeliveryData
2. WHEN sheet_name передан в saveDeliveryData, THE GoogleSheetsClient SHALL использовать его для формирования диапазонов ячеек
3. THE GoogleSheetsClient SHALL НЕ вызывать метод getSheetName, если sheet_name передан явно
4. IF sheet_name не передан, THEN THE GoogleSheetsClient SHALL выбросить ошибку с описательным сообщением
5. WHEN данные сохраняются, THE GoogleSheetsClient SHALL использовать формат диапазона `{sheet_name}!{column}{row}`

### Requirement 4: Проверка существования листа

**User Story:** Как GoogleSheetsClient, я хочу проверять существование листа перед сохранением данных, чтобы избежать ошибок при работе с несуществующими листами.

#### Acceptance Criteria

1. WHEN GoogleSheetsClient получает sheet_name, THE GoogleSheetsClient SHALL проверить существование листа с таким названием в таблице
2. IF лист с указанным sheet_name не существует, THEN THE GoogleSheetsClient SHALL выбросить ошибку с сообщением "Sheet '{sheet_name}' not found"
3. THE GoogleSheetsClient SHALL кэшировать список существующих листов для оптимизации повторных проверок
4. WHEN проверка существования листа завершена успешно, THE GoogleSheetsClient SHALL продолжить сохранение данных
5. THE GoogleSheetsClient SHALL логировать результат проверки существования листа

### Requirement 5: Обратная совместимость

**User Story:** Как разработчик, я хочу сохранить обратную совместимость с существующими тестами, чтобы не нарушить работу системы.

#### Acceptance Criteria

1. THE GoogleSheetsClient SHALL сохранить существующую сигнатуру метода saveDeliveryData с опциональным параметром sheet_name
2. WHEN существующие unit тесты выполняются, THE GoogleSheetsClient SHALL пройти все 16 существующих unit тестов
3. WHEN существующие property тесты выполняются, THE GoogleSheetsClient SHALL пройти все 4 существующих property теста
4. THE GoogleSheetsClient SHALL НЕ изменять поведение метода healthCheck
5. THE GoogleSheetsClient SHALL НЕ изменять интерфейс DeliveryData

### Requirement 6: Обработка ошибок

**User Story:** Как система, я хочу корректно обрабатывать ошибки при работе с динамическими листами, чтобы предоставить понятную информацию об ошибках.

#### Acceptance Criteria

1. IF Google Sheets API вернул ошибку "Sheet not found", THEN THE GoogleSheetsClient SHALL выбросить ошибку с сообщением "Sheet '{sheet_name}' does not exist in spreadsheet"
2. IF Google Sheets API вернул ошибку доступа, THEN THE GoogleSheetsClient SHALL выбросить ошибку с сообщением "Access denied to sheet '{sheet_name}'"
3. WHEN происходит ошибка при сохранении данных, THE GoogleSheetsClient SHALL логировать sheet_name, row_id и текст ошибки
4. THE Delivery_API SHALL перехватывать ошибки от GoogleSheetsClient и возвращать HTTP 500 с понятным сообщением
5. IF Backend API недоступен, THEN THE Delivery_API SHALL вернуть HTTP 503 с сообщением "Backend service unavailable"

### Requirement 7: Логирование и отладка

**User Story:** Как разработчик, я хочу видеть подробные логи работы с динамическими листами, чтобы упростить отладку проблем.

#### Acceptance Criteria

1. WHEN GoogleSheetsClient получает sheet_name, THE GoogleSheetsClient SHALL логировать "Using sheet: {sheet_name} for row {row_id}"
2. WHEN проверка существования листа выполняется, THE GoogleSheetsClient SHALL логировать "Verifying sheet '{sheet_name}' exists"
3. WHEN данные успешно сохранены, THE GoogleSheetsClient SHALL логировать "Successfully saved delivery data to sheet '{sheet_name}', row {row_id}"
4. WHEN происходит ошибка, THE GoogleSheetsClient SHALL логировать полный stack trace с контекстом (sheet_name, row_id)
5. THE Delivery_API SHALL логировать входящий sheet_name при получении запроса

### Requirement 8: Property-Based тестирование

**User Story:** Как разработчик, я хочу иметь property-based тесты для проверки корректности работы с динамическими листами, чтобы гарантировать надёжность системы.

#### Acceptance Criteria

1. THE System SHALL иметь property тест, проверяющий, что для любого валидного sheet_name данные сохраняются на правильный лист
2. THE System SHALL иметь property тест, проверяющий инвариант: если лист существует в таблице, то saveDeliveryData должен успешно сохранить данные
3. THE System SHALL иметь property тест, проверяющий, что для любого невалидного sheet_name выбрасывается ошибка
4. THE System SHALL иметь property тест для round-trip проверки: сохранение данных на лист и последующее чтение должно вернуть те же данные
5. THE System SHALL иметь property тест, проверяющий идемпотентность: повторное сохранение тех же данных на тот же лист должно давать тот же результат

### Requirement 9: Интеграция с Backend API

**User Story:** Как Frontend, я хочу получать sheet_name из Backend API перед сохранением данных доставки, чтобы использовать правильный лист.

#### Acceptance Criteria

1. THE Delivery_API SHALL создать HTTP клиент для запросов к Backend API
2. WHEN Delivery_API получает prize_id, THE Delivery_API SHALL выполнить GET запрос к Backend API `/api/prize/{prize_id}`
3. THE Delivery_API SHALL парсить JSON ответ от Backend и извлекать поле sheet_name
4. IF Backend API вернул HTTP 404, THEN THE Delivery_API SHALL вернуть HTTP 404 с сообщением "Prize not found"
5. WHEN sheet_name получен успешно, THE Delivery_API SHALL передать его в GoogleSheetsClient.saveDeliveryData

### Requirement 10: Валидация sheet_name

**User Story:** Как система, я хочу валидировать sheet_name перед использованием, чтобы избежать ошибок при работе с Google Sheets API.

#### Acceptance Criteria

1. THE System SHALL валидировать, что sheet_name не является пустой строкой
2. THE System SHALL валидировать, что sheet_name не содержит недопустимые символы для Google Sheets (например, `[]*/\?:`)
3. THE System SHALL валидировать, что длина sheet_name не превышает 100 символов
4. IF sheet_name содержит недопустимые символы, THEN THE System SHALL выбросить ошибку "Invalid sheet name: contains forbidden characters"
5. WHEN валидация sheet_name успешна, THE System SHALL продолжить выполнение операции
