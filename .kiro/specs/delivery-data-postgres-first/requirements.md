# Requirements Document

## Введение

Текущая реализация системы доставки физических призов имеет критическую проблему производительности: при отправке формы доставки данные сначала сохраняются в Google Sheets через API, что создаёт задержку до 3 секунд. Это негативно влияет на пользовательский опыт и создаёт риск потери данных при недоступности Google Sheets API.

Данная фича изменяет архитектуру потока данных: вместо прямого сохранения в Google Sheets, данные доставки будут сначала сохраняться в PostgreSQL (быстро, без задержек), а затем синхронизироваться в Google Sheets через существующий сервис синхронизации (sync_worker). Это устранит задержку при отправке формы и повысит надёжность системы.

## Глоссарий

- **Delivery_API**: API endpoint `/api/delivery` в Next.js приложении для обработки данных доставки
- **PostgreSQL**: Основная база данных для хранения данных призов
- **Google_Sheets**: Google Таблица для хранения данных (legacy требование)
- **Sync_Worker**: Автономный процесс для периодической синхронизации данных
- **Sync_Service**: Сервис синхронизации данных между PostgreSQL и Google Sheets
- **Prize_Repository**: Repository для работы с таблицей prizes в PostgreSQL
- **Delivery_Data**: Данные доставки физического приза (ФИО, адрес, телефон)
- **Prize_ID**: Уникальный идентификатор приза в PostgreSQL
- **Sheet_Name**: Название листа в Google Таблице
- **Row_ID**: Номер строки в Google Sheets

## Требования

### Requirement 1: Сохранение данных доставки в PostgreSQL

**User Story:** Как система, я хочу сохранять данные доставки сначала в PostgreSQL, чтобы обеспечить быструю обработку запроса без задержек от Google Sheets API.

#### Acceptance Criteria

1. WHEN Delivery_API получает валидные данные доставки, THE Delivery_API SHALL сохранить их в PostgreSQL через Prize_Repository
2. THE Delivery_API SHALL обновить поля last_name, first_name, patronymic, country, postal_code, city, street, house, apartment, phone, comment в таблице prizes
3. WHEN данные успешно сохранены в PostgreSQL, THE Delivery_API SHALL установить поле claimed_at в текущее время UTC
4. THE Delivery_API SHALL выполнить сохранение в PostgreSQL в рамках одной транзакции
5. WHEN сохранение в PostgreSQL завершено успешно, THE Delivery_API SHALL вернуть HTTP 200 с сообщением об успехе

### Requirement 2: Удаление прямого сохранения в Google Sheets

**User Story:** Как Delivery_API, я хочу прекратить прямое сохранение данных в Google Sheets, чтобы устранить задержку в 3 секунды при отправке формы.

#### Acceptance Criteria

1. THE Delivery_API SHALL НЕ вызывать GoogleSheetsClient.saveDeliveryData при обработке запроса
2. THE Delivery_API SHALL НЕ импортировать GoogleSheetsClient
3. THE Delivery_API SHALL НЕ требовать переменные окружения GOOGLE_CREDENTIALS_PATH и SPREADSHEET_ID
4. WHEN данные доставки обработаны, THE Delivery_API SHALL завершить запрос за время менее 500 миллисекунд
5. THE Delivery_API SHALL удалить всю логику работы с Google Sheets API из обработчика POST /api/delivery

### Requirement 3: Обновление метода Prize_Repository для данных доставки

**User Story:** Как Prize_Repository, я хочу иметь метод для обновления данных доставки, чтобы Delivery_API мог сохранять их в PostgreSQL.

#### Acceptance Criteria

1. THE Prize_Repository SHALL предоставить метод update_delivery_data_by_prize_id(prize_id, delivery_data)
2. WHEN метод вызван с валидным prize_id, THE Prize_Repository SHALL обновить запись в таблице prizes
3. THE Prize_Repository SHALL обновить поля: last_name, first_name, patronymic, country, postal_code, city, street, house, apartment, phone, comment, claimed_at
4. IF prize_id не существует в таблице prizes, THEN THE Prize_Repository SHALL выбросить исключение PrizeNotFoundError
5. WHEN обновление выполнено успешно, THE Prize_Repository SHALL вернуть обновлённый объект Prize

### Requirement 4: Добавление полей country и postal_code в таблицу prizes

**User Story:** Как система, я хочу хранить country и postal_code в таблице prizes, чтобы иметь полные данные доставки для синхронизации с Google Sheets.

#### Acceptance Criteria

1. THE System SHALL добавить столбец country типа VARCHAR(100) в таблицу prizes
2. THE System SHALL добавить столбец postal_code типа VARCHAR(20) в таблицу prizes
3. THE System SHALL создать миграцию базы данных для добавления новых столбцов
4. WHEN миграция выполнена, THE System SHALL сохранить существующие данные без потерь
5. THE System SHALL разрешить NULL значения для country и postal_code для обратной совместимости

### Requirement 5: Обратная синхронизация PostgreSQL → Google Sheets

**User Story:** Как Sync_Service, я хочу синхронизировать данные доставки из PostgreSQL в Google Sheets, чтобы поддерживать актуальность данных в Google Таблице.

#### Acceptance Criteria

1. THE Sync_Service SHALL добавить метод sync_delivery_data_to_sheets()
2. WHEN метод вызван, THE Sync_Service SHALL найти все записи в prizes с claimed_at IS NOT NULL и обновлёнными данными доставки
3. THE Sync_Service SHALL обновить соответствующие строки в Google Sheets с данными доставки из PostgreSQL
4. THE Sync_Service SHALL использовать поля sheet_name и row_id для определения целевой ячейки в Google Sheets
5. WHEN синхронизация завершена, THE Sync_Service SHALL логировать количество обновлённых записей

### Requirement 6: Интеграция обратной синхронизации в Sync_Worker

**User Story:** Как Sync_Worker, я хочу периодически запускать обратную синхронизацию данных доставки, чтобы Google Sheets оставался актуальным.

#### Acceptance Criteria

1. THE Sync_Worker SHALL вызывать Sync_Service.sync_delivery_data_to_sheets() после каждой синхронизации Google Sheets → PostgreSQL
2. THE Sync_Worker SHALL выполнять обратную синхронизацию с тем же интервалом, что и прямую синхронизацию
3. IF обратная синхронизация завершилась с ошибкой, THEN THE Sync_Worker SHALL логировать ошибку и продолжить работу
4. THE Sync_Worker SHALL НЕ блокировать прямую синхронизацию при ошибках обратной синхронизации
5. WHEN обратная синхронизация выполнена, THE Sync_Worker SHALL логировать статистику (количество обновлённых записей, время выполнения)

### Requirement 7: Обработка ошибок PostgreSQL в Delivery_API

**User Story:** Как Delivery_API, я хочу корректно обрабатывать ошибки PostgreSQL, чтобы предоставить понятную информацию пользователю.

#### Acceptance Criteria

1. IF PostgreSQL недоступен, THEN THE Delivery_API SHALL вернуть HTTP 503 с сообщением "База данных временно недоступна"
2. IF prize_id не найден в PostgreSQL, THEN THE Delivery_API SHALL вернуть HTTP 404 с сообщением "Приз не найден"
3. IF транзакция PostgreSQL завершилась с ошибкой, THEN THE Delivery_API SHALL откатить изменения и вернуть HTTP 500
4. WHEN происходит ошибка PostgreSQL, THE Delivery_API SHALL логировать полный stack trace с контекстом (prize_id, telegram_id)
5. THE Delivery_API SHALL НЕ раскрывать внутренние детали ошибок PostgreSQL в ответе пользователю

### Requirement 8: Валидация владения призом

**User Story:** Как Delivery_API, я хочу проверять, что prize_id принадлежит пользователю, отправившему запрос, чтобы предотвратить несанкционированный доступ.

#### Acceptance Criteria

1. WHEN Delivery_API получает prize_id и initData, THE Delivery_API SHALL извлечь telegram_id из initData
2. THE Delivery_API SHALL проверить, что prize_id принадлежит пользователю с telegram_id через Prize_Repository.validate_prize_ownership()
3. IF prize_id не принадлежит пользователю, THEN THE Delivery_API SHALL вернуть HTTP 403 с сообщением "Доступ запрещён"
4. THE Delivery_API SHALL логировать попытки несанкционированного доступа с telegram_id и prize_id
5. WHEN валидация владения успешна, THE Delivery_API SHALL продолжить обработку запроса

### Requirement 9: Обновление схемы валидации данных доставки

**User Story:** Как Delivery_API, я хочу валидировать поля country и postal_code, чтобы обеспечить корректность данных доставки.

#### Acceptance Criteria

1. THE Delivery_API SHALL добавить валидацию поля country (минимум 2 символа, максимум 100 символов)
2. THE Delivery_API SHALL добавить валидацию поля postal_code (минимум 3 символа, максимум 20 символов)
3. THE Delivery_API SHALL требовать обязательное заполнение полей country и postal_code
4. IF валидация country или postal_code не прошла, THEN THE Delivery_API SHALL вернуть HTTP 400 с описанием ошибки
5. THE Delivery_API SHALL применять trim() к полям country и postal_code перед валидацией

### Requirement 10: Логирование и мониторинг производительности

**User Story:** Как разработчик, я хочу видеть метрики производительности сохранения данных, чтобы подтвердить устранение задержки.

#### Acceptance Criteria

1. THE Delivery_API SHALL логировать время выполнения сохранения в PostgreSQL в миллисекундах
2. THE Delivery_API SHALL логировать общее время обработки запроса POST /api/delivery
3. IF время обработки превышает 500 миллисекунд, THEN THE Delivery_API SHALL логировать предупреждение
4. THE Sync_Service SHALL логировать время выполнения обратной синхронизации
5. THE Sync_Service SHALL логировать количество записей, синхронизированных из PostgreSQL в Google Sheets

### Requirement 11: Идемпотентность обновления данных доставки

**User Story:** Как система, я хочу обеспечить идемпотентность обновления данных доставки, чтобы повторные запросы не создавали проблем.

#### Acceptance Criteria

1. WHEN Delivery_API получает повторный запрос с теми же данными доставки для того же prize_id, THE Delivery_API SHALL обновить запись в PostgreSQL
2. THE Delivery_API SHALL НЕ создавать дубликаты записей при повторных запросах
3. THE Delivery_API SHALL обновить поле updated_at при каждом обновлении данных доставки
4. WHEN данные доставки обновлены повторно, THE Delivery_API SHALL вернуть HTTP 200 с тем же сообщением об успехе
5. THE Sync_Service SHALL синхронизировать последнюю версию данных доставки в Google Sheets

### Requirement 12: Обратная совместимость с существующими данными

**User Story:** Как система, я хочу сохранить обратную совместимость с существующими данными в Google Sheets, чтобы не нарушить работу системы.

#### Acceptance Criteria

1. THE Sync_Service SHALL продолжать синхронизацию Google Sheets → PostgreSQL для новых записей
2. THE Sync_Service SHALL НЕ перезаписывать данные доставки в PostgreSQL, если они уже заполнены (claimed_at IS NOT NULL)
3. THE Sync_Service SHALL синхронизировать только записи с обновлёнными данными доставки из PostgreSQL в Google Sheets
4. THE System SHALL поддерживать существующую структуру столбцов в Google Sheets
5. THE System SHALL сохранить существующие индексы и ограничения в таблице prizes

### Requirement 13: Удаление зависимости от Google Sheets в Delivery_API

**User Story:** Как Delivery_API, я хочу удалить зависимость от Google Sheets API, чтобы упростить архитектуру и повысить надёжность.

#### Acceptance Criteria

1. THE Delivery_API SHALL НЕ требовать доступ к Google Sheets API при обработке запросов
2. THE Delivery_API SHALL работать корректно даже при недоступности Google Sheets API
3. THE Delivery_API SHALL удалить импорт GoogleSheetsClient из файла route.ts
4. THE Delivery_API SHALL удалить проверку переменных окружения GOOGLE_CREDENTIALS_PATH и SPREADSHEET_ID
5. THE Delivery_API SHALL удалить обработку ошибок SheetNotFoundError и SheetAccessDeniedError

### Requirement 14: Тестирование обратной синхронизации

**User Story:** Как разработчик, я хочу иметь тесты для обратной синхронизации, чтобы гарантировать корректность работы.

#### Acceptance Criteria

1. THE System SHALL иметь unit тест для метода Sync_Service.sync_delivery_data_to_sheets()
2. THE System SHALL иметь integration тест для полного цикла: сохранение в PostgreSQL → обратная синхронизация → проверка данных в Google Sheets
3. THE System SHALL иметь тест для проверки идемпотентности обратной синхронизации
4. THE System SHALL иметь тест для обработки ошибок Google Sheets API при обратной синхронизации
5. THE System SHALL иметь property тест для инварианта: данные в PostgreSQL и Google Sheets должны быть идентичны после синхронизации

### Requirement 15: Миграция существующих данных

**User Story:** Как система, я хочу мигрировать существующие данные доставки из Google Sheets в PostgreSQL, чтобы обеспечить полноту данных.

#### Acceptance Criteria

1. THE System SHALL предоставить скрипт миграции для переноса данных доставки из Google Sheets в PostgreSQL
2. THE System SHALL мигрировать только записи с заполненными данными доставки (claimed_at IS NOT NULL в Google Sheets)
3. THE System SHALL НЕ перезаписывать существующие данные доставки в PostgreSQL при миграции
4. WHEN миграция выполнена, THE System SHALL логировать количество мигрированных записей
5. THE System SHALL валидировать корректность мигрированных данных (проверка соответствия prize_id, sheet_name, row_id)

### Requirement 16: Обновление документации API

**User Story:** Как разработчик, я хочу иметь актуальную документацию API endpoint /api/delivery, чтобы понимать новую архитектуру.

#### Acceptance Criteria

1. THE System SHALL обновить комментарии в коде route.ts с описанием новой архитектуры
2. THE System SHALL документировать, что данные сохраняются в PostgreSQL, а не в Google Sheets
3. THE System SHALL документировать время ожидаемого ответа (менее 500 миллисекунд)
4. THE System SHALL документировать новые коды ошибок (503 для недоступности PostgreSQL)
5. THE System SHALL удалить устаревшие комментарии о работе с Google Sheets API

### Requirement 17: Мониторинг задержки синхронизации

**User Story:** Как администратор, я хочу мониторить задержку синхронизации данных из PostgreSQL в Google Sheets, чтобы обеспечить актуальность данных.

#### Acceptance Criteria

1. THE Sync_Service SHALL логировать временную метку последней успешной обратной синхронизации
2. THE Sync_Service SHALL логировать количество записей, ожидающих синхронизации в Google Sheets
3. IF задержка синхронизации превышает 2 интервала синхронизации, THEN THE Sync_Service SHALL логировать предупреждение
4. THE Sync_Worker SHALL предоставить метод health_check() для проверки статуса обратной синхронизации
5. THE Sync_Worker SHALL логировать ошибки обратной синхронизации с уровнем ERROR

### Requirement 18: Обработка конфликтов данных

**User Story:** Как система, я хочу корректно обрабатывать конфликты данных между PostgreSQL и Google Sheets, чтобы избежать потери данных.

#### Acceptance Criteria

1. WHEN данные доставки в PostgreSQL отличаются от данных в Google Sheets, THE Sync_Service SHALL использовать данные из PostgreSQL как источник истины
2. THE Sync_Service SHALL НЕ перезаписывать данные в PostgreSQL данными из Google Sheets, если claimed_at IS NOT NULL
3. THE Sync_Service SHALL логировать обнаруженные конфликты данных с деталями (prize_id, поля с различиями)
4. IF обнаружен конфликт данных, THEN THE Sync_Service SHALL обновить Google Sheets данными из PostgreSQL
5. THE Sync_Service SHALL сохранять временную метку последнего обновления (updated_at) для отслеживания изменений

