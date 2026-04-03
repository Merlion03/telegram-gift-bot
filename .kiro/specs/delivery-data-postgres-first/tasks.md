# Implementation Plan: delivery-data-postgres-first

## Overview

Данный план реализует изменение архитектуры потока данных для обработки информации о доставке физических призов. Вместо прямого сохранения в Google Sheets (задержка 3 секунды), данные будут сначала сохраняться в PostgreSQL (< 100 мс), а затем асинхронно синхронизироваться в Google Sheets через Sync_Worker.

Ключевые изменения:
- Миграция БД: добавление столбцов country и postal_code
- Prize_Repository: новый метод update_delivery_data_by_prize_id()
- Backend API: новый endpoint /api/delivery/update
- Delivery_API (Next.js): удаление GoogleSheetsClient, интеграция с Backend API
- Sync_Service: обратная синхронизация PostgreSQL → Google Sheets
- Sync_Worker: интеграция обратной синхронизации в цикл

## Tasks

- [x] 1. Миграция базы данных: добавление полей country и postal_code
  - Создать файл миграции `telegram-bot/database/migrations/012_add_country_postal_code_to_prizes.sql`
  - Добавить столбец `country VARCHAR(100)` с поддержкой NULL
  - Добавить столбец `postal_code VARCHAR(20)` с поддержкой NULL
  - Добавить комментарии к столбцам для документации
  - Создать индекс `idx_prizes_sync_delivery` для оптимизации обратной синхронизации: `CREATE INDEX IF NOT EXISTS idx_prizes_sync_delivery ON prizes(claimed_at, updated_at) WHERE claimed_at IS NOT NULL`
  - Выполнить миграцию на тестовой БД и проверить корректность
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2. Обновление модели Prize в Python
  - Открыть файл `telegram-bot/database/models/prize.py`
  - Добавить поля `country = Column(String(100), nullable=True)` и `postal_code = Column(String(20), nullable=True)` в класс Prize
  - Обновить комментарии к модели с описанием новых полей
  - _Requirements: 4.1, 4.2_

- [x] 3. Реализация метода update_delivery_data_by_prize_id в Prize_Repository
  - [x] 3.1 Создать метод update_delivery_data_by_prize_id() в Prize_Repository
    - Открыть файл `telegram-bot/database/repositories/prize_repository.py`
    - Реализовать метод `async def update_delivery_data_by_prize_id(prize_id: int, delivery_data: Dict[str, Any]) -> Prize`
    - Валидировать входные данные (проверка разрешённых полей)
    - Выполнить UPDATE запрос с обновлением полей: last_name, first_name, patronymic, country, postal_code, city, street, house, apartment, phone, comment
    - Установить claimed_at в текущее время UTC, если оно ещё не установлено
    - Автоматически обновить updated_at
    - Использовать транзакцию через _get_session_context()
    - Выбросить PrizeNotFoundError если prize_id не существует
    - Логировать время выполнения операции
    - Вернуть обновлённый объект Prize
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.5_
  
  - [x] 3.2 Написать unit тесты для update_delivery_data_by_prize_id()
    - Создать файл `telegram-bot/database/repositories/__tests__/test_prize_repository_delivery.py`
    - Тест успешного обновления всех полей данных доставки
    - Тест установки claimed_at при первом обновлении
    - Тест обработки несуществующего prize_id (PrizeNotFoundError)
    - Тест валидации невалидных полей (ValueError)
    - Тест транзакционности (rollback при ошибке)
    - Тест идемпотентности (повторные обновления)
    - Тест автоматического обновления updated_at
    - _Requirements: 3.4, 11.1, 11.2, 11.3_
  
  - [x] 3.3 Написать property тест для update_delivery_data_by_prize_id()
    - **Property 1: Сохранение всех полей данных доставки**
    - **Validates: Requirements 1.1, 1.2, 3.2, 3.3**
    - Использовать Hypothesis для генерации случайных валидных данных доставки
    - Проверить, что все переданные поля корректно сохраняются в PostgreSQL
    - Минимум 100 итераций теста
    - _Requirements: 1.1, 1.2, 3.2, 3.3_

- [x] 4. Создание Backend API endpoint /api/delivery/update
  - [x] 4.1 Создать новый endpoint в Python Backend
    - Создать файл `telegram-bot/api/delivery.py` (если не существует)
    - Реализовать POST endpoint `/api/delivery/update`
    - Валидировать входные данные (prize_id, telegram_id, delivery_data)
    - Вызвать Prize_Repository.validate_prize_ownership() для проверки владения
    - Вызвать Prize_Repository.update_delivery_data_by_prize_id() для обновления
    - Обработать ошибки: PrizeNotFoundError (404), PrizeOwnershipError (403), DatabaseUnavailableError (503)
    - Логировать все операции с контекстом (prize_id, telegram_id)
    - Вернуть JSON ответ с результатом операции
    - _Requirements: 1.1, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_
  
  - [x] 4.2 Написать unit тесты для /api/delivery/update endpoint
    - Создать файл `telegram-bot/api/__tests__/test_delivery_api.py`
    - Тест успешного обновления данных (HTTP 200)
    - Тест валидации входных данных (HTTP 400)
    - Тест валидации владения призом (HTTP 403)
    - Тест обработки несуществующего prize_id (HTTP 404)
    - Тест обработки недоступности БД (HTTP 503)
    - Тест логирования попыток несанкционированного доступа
    - _Requirements: 7.1, 7.2, 7.3, 8.2, 8.3, 8.4_

- [x] 5. Обновление Delivery_API в Next.js
  - [x] 5.1 Удалить зависимость от GoogleSheetsClient
    - Открыть файл `nextjs-app/app/api/delivery/route.ts`
    - Удалить импорт GoogleSheetsClient
    - Удалить вызов sheetsClient.saveDeliveryData()
    - Удалить проверку переменных окружения GOOGLE_CREDENTIALS_PATH и SPREADSHEET_ID
    - Удалить обработку ошибок SheetNotFoundError и SheetAccessDeniedError
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [x] 5.2 Добавить интеграцию с Backend API /api/delivery/update
    - Добавить вызов Backend API endpoint `/api/delivery/update` после валидации InitData
    - Передать prize_id, telegram_id и delivery_data в Backend API
    - Обработать ответы Backend API: 200 (успех), 403 (доступ запрещён), 404 (приз не найден), 503 (БД недоступна)
    - Логировать время выполнения запроса к Backend API
    - Вернуть соответствующий HTTP статус пользователю
    - _Requirements: 1.1, 1.5, 7.1, 7.2, 7.3_
  
  - [x] 5.3 Обновить схему валидации для полей country и postal_code
    - Добавить валидацию поля country: `z.string().trim().min(2).max(100)`
    - Добавить валидацию поля postal_code: `z.string().trim().min(3).max(20)`
    - Сделать оба поля обязательными в deliverySchema
    - Обновить интерфейс DeliveryRequest с новыми полями
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 5.4 Написать unit тесты для обновлённого Delivery_API
    - Обновить файл `nextjs-app/app/api/delivery/__tests__/route.test.ts`
    - Тест успешного сохранения данных через Backend API (HTTP 200)
    - Тест валидации полей country и postal_code
    - Тест обработки ошибок Backend API (403, 404, 503)
    - Тест производительности (время обработки < 500 мс)
    - Тест отсутствия вызовов GoogleSheetsClient
    - _Requirements: 2.4, 9.1, 9.2, 9.4, 10.1, 10.2, 10.3_
  
  - [x] 5.5 Написать property тест для валидации данных
    - **Property 6: Валидация длины строковых полей**
    - **Validates: Requirements 9.1, 9.2**
    - Использовать fast-check для генерации строк различной длины
    - Проверить отклонение коротких строк (country < 2, postal_code < 3)
    - Проверить отклонение длинных строк (country > 100, postal_code > 20)
    - Минимум 100 итераций теста
    - _Requirements: 9.1, 9.2_

- [x] 6. Checkpoint - Проверка базовой функциональности
  - Убедиться, что все тесты проходят успешно
  - Проверить, что Delivery_API корректно сохраняет данные в PostgreSQL
  - Проверить, что время обработки запроса < 500 мс
  - Спросить пользователя, если возникли вопросы

- [x] 7. Реализация обратной синхронизации в Sync_Service
  - [x] 7.1 Создать метод sync_delivery_data_to_sheets()
    - Открыть файл `telegram-bot/services/sync_service.py`
    - Реализовать метод `async def sync_delivery_data_to_sheets() -> Dict[str, Any]`
    - Запросить из PostgreSQL записи с `claimed_at IS NOT NULL AND updated_at > last_sync_timestamp`
    - Группировать записи по sheet_name для batch операций
    - Для каждого листа: сформировать batch update запрос к Google Sheets API
    - Обновить столбцы E-O (last_name, first_name, patronymic, city, street, house, apartment, phone, comment, country, postal_code)
    - Обновить столбец P (claimed_at)
    - Обработать ошибки Google Sheets API gracefully (не блокировать синхронизацию других листов)
    - Логировать статистику: records_processed, records_updated, sheets_updated, errors, elapsed_seconds
    - Обновить last_sync_timestamp после успешной синхронизации
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 10.4, 10.5_
  
  - [x] 7.2 Добавить метод get_claimed_prizes_for_sync() в Prize_Repository
    - Открыть файл `telegram-bot/database/repositories/prize_repository.py`
    - Реализовать метод `async def get_claimed_prizes_for_sync(last_sync_timestamp: Optional[datetime]) -> List[Prize]`
    - Запросить записи с `claimed_at IS NOT NULL`
    - Если last_sync_timestamp указан, добавить условие `updated_at > last_sync_timestamp`
    - Использовать индекс idx_prizes_sync_delivery для оптимизации
    - Логировать количество найденных записей
    - _Requirements: 5.2, 12.3, 18.5_
  
  - [x] 7.3 Написать unit тесты для sync_delivery_data_to_sheets()
    - Создать файл `telegram-bot/services/__tests__/test_sync_service_backward.py`
    - Тест поиска записей с claimed_at IS NOT NULL
    - Тест группировки по sheet_name
    - Тест batch update в Google Sheets (с mock)
    - Тест обработки ошибок Google Sheets API
    - Тест инкрементальной синхронизации (updated_at > last_sync)
    - Тест логирования статистики
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 12.3_
  
  - [x] 7.4 Написать property тест для обратной синхронизации
    - **Property 15: Синхронизация данных PostgreSQL → Google Sheets**
    - **Validates: Requirements 5.3, 18.1**
    - Создать случайные данные доставки в PostgreSQL
    - Запустить обратную синхронизацию
    - Проверить, что данные в Google Sheets идентичны данным в PostgreSQL
    - Минимум 50 итераций теста
    - _Requirements: 5.3, 18.1_

- [x] 8. Интеграция обратной синхронизации в Sync_Worker
  - [x] 8.1 Обновить метод _run_sync() в Sync_Worker
    - Открыть файл `telegram-bot/sync_worker.py`
    - Добавить вызов `sync_service.sync_delivery_data_to_sheets()` после `sync_service.sync_all_sheets()`
    - Обработать ошибки обратной синхронизации в отдельном try-except блоке
    - Логировать статистику обратной синхронизации
    - Убедиться, что ошибки обратной синхронизации не блокируют прямую синхронизацию
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 8.2 Написать unit тесты для обновлённого Sync_Worker
    - Обновить файл `telegram-bot/__tests__/test_sync_worker.py`
    - Тест интеграции обратной синхронизации в цикл
    - Тест обработки ошибок обратной синхронизации
    - Тест независимости прямой и обратной синхронизации
    - Тест логирования статистики обеих синхронизаций
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

- [x] 9. Обновление защиты от перезаписи данных в Sync_Service
  - [x] 9.1 Обновить метод _convert_sheet_data_to_prizes()
    - Открыть файл `telegram-bot/services/sync_service.py`
    - Добавить логику: не перезаписывать поля данных доставки, если claimed_at IS NOT NULL
    - Проверять существующие записи в PostgreSQL перед upsert
    - Сохранять только поля, которые не являются данными доставки (для записей с claimed_at)
    - Логировать случаи защиты от перезаписи
    - _Requirements: 12.2, 18.2_
  
  - [x] 9.2 Написать unit тест для защиты от перезаписи
    - Добавить тест в `telegram-bot/services/__tests__/test_sync_service.py`
    - Создать запись с claimed_at IS NOT NULL и данными доставки
    - Изменить данные в Google Sheets
    - Запустить прямую синхронизацию
    - Проверить, что данные доставки в PostgreSQL не изменились
    - _Requirements: 12.2, 18.2_
  
  - [x] 9.3 Написать property тест для защиты данных
    - **Property 17: Защита данных с claimed_at при прямой синхронизации**
    - **Validates: Requirements 12.2, 18.2**
    - Создать случайные записи с claimed_at IS NOT NULL
    - Изменить данные в Google Sheets
    - Запустить прямую синхронизацию
    - Проверить, что данные доставки в PostgreSQL остались неизменными
    - Минимум 50 итераций теста
    - _Requirements: 12.2, 18.2_

- [x] 10. Checkpoint - Проверка синхронизации
  - Убедиться, что обратная синхронизация работает корректно
  - Проверить, что данные из PostgreSQL синхронизируются в Google Sheets
  - Проверить, что прямая синхронизация не перезаписывает данные с claimed_at
  - Спросить пользователя, если возникли вопросы

- [x] 11. Обновление документации и комментариев в коде
  - [x] 11.1 Обновить комментарии в Delivery_API
    - Открыть файл `nextjs-app/app/api/delivery/route.ts`
    - Обновить комментарии с описанием новой архитектуры (сохранение в PostgreSQL)
    - Документировать ожидаемое время ответа (< 500 мс)
    - Документировать новые коды ошибок (503 для PostgreSQL)
    - Удалить устаревшие комментарии о Google Sheets API
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
  
  - [x] 11.2 Обновить комментарии в Prize_Repository
    - Добавить docstring для метода update_delivery_data_by_prize_id()
    - Документировать обновляемые поля и их валидацию
    - Документировать исключения (PrizeNotFoundError, DatabaseUnavailableError)
    - _Requirements: 3.1, 3.2, 3.4_
  
  - [x] 11.3 Обновить комментарии в Sync_Service
    - Добавить docstring для метода sync_delivery_data_to_sheets()
    - Документировать логику обратной синхронизации
    - Документировать обработку ошибок Google Sheets API
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 12. Integration тесты для полного цикла
  - [x] 12.1 Написать E2E тест полного цикла
    - Создать файл `telegram-bot/__tests__/integration/test_delivery_full_cycle.py`
    - Создать приз в PostgreSQL
    - Отправить форму доставки через Delivery_API (mock)
    - Проверить сохранение в PostgreSQL
    - Запустить обратную синхронизацию
    - Проверить данные в Google Sheets (mock)
    - Проверить идентичность данных в PostgreSQL и Google Sheets
    - _Requirements: 1.1, 5.3, 15.5_
  
  - [x] 12.2 Написать integration тест обратной совместимости
    - Создать данные в Google Sheets (старый формат)
    - Запустить прямую синхронизацию
    - Проверить данные в PostgreSQL
    - Обновить данные через Delivery_API
    - Запустить обратную синхронизацию
    - Проверить, что данные в Google Sheets обновлены
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  
  - [x] 12.3 Написать integration тест устойчивости к недоступности Google Sheets
    - Отключить Google Sheets API (mock)
    - Отправить форму доставки через Delivery_API
    - Проверить успешное сохранение в PostgreSQL
    - Проверить, что API вернул HTTP 200
    - Включить Google Sheets API
    - Запустить обратную синхронизацию
    - Проверить синхронизацию данных
    - _Requirements: 2.4, 13.2_
  
  - [x] 12.4 Написать property тест для идемпотентности
    - **Property 11: Идемпотентность обновления данных**
    - **Validates: Requirements 11.1, 11.2**
    - Создать случайные данные доставки
    - Отправить одни и те же данные N раз (N = 1..10)
    - Проверить, что состояние в PostgreSQL одинаковое после каждой отправки
    - Проверить отсутствие дубликатов записей
    - Минимум 50 итераций теста
    - _Requirements: 11.1, 11.2_

- [ ] 13. Final checkpoint - Полная проверка системы
  - Запустить все unit тесты и убедиться, что они проходят
  - Запустить все property тесты и убедиться, что они проходят
  - Запустить все integration тесты и убедиться, что они проходят
  - Проверить производительность: время обработки Delivery_API < 500 мс
  - Проверить логирование: все операции логируются с метриками
  - Проверить обратную синхронизацию: данные корректно синхронизируются в Google Sheets
  - Спросить пользователя о готовности к деплою

## Notes

- Задачи, отмеченные `*`, являются опциональными и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Checkpoints обеспечивают инкрементальную валидацию
- Property тесты валидируют универсальные свойства корректности
- Unit тесты валидируют конкретные примеры и edge cases
- Integration тесты проверяют полный цикл работы системы
- Все изменения выполняются с учётом обратной совместимости
