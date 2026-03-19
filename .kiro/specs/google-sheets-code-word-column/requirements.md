# Requirements Document

## Introduction

Данный документ описывает требования к улучшению системы синхронизации данных из Google Sheets в PostgreSQL. Текущая реализация использует название листа Google Sheets в качестве кодового слова (code_word) для идентификации призов. Новая реализация должна читать кодовое слово из отдельного столбца в таблице Google Sheets, что обеспечит большую гибкость и независимость данных от структуры листов.

## Glossary

- **Sync_Service**: Сервис синхронизации данных между Google Sheets и PostgreSQL (файл `telegram-bot/services/sync_service.py`)
- **Google_Sheets**: Таблица Google Sheets, содержащая данные о призах пользователей
- **Sheet**: Отдельный лист (вкладка) внутри Google_Sheets
- **PostgreSQL**: База данных для хранения синхронизированных данных о призах
- **Prize_Record**: Запись о призе в таблице `prizes` базы данных PostgreSQL
- **Code_Word**: Уникальное кодовое слово для идентификации приза пользователя
- **Column_Structure**: Структура столбцов в Google_Sheets: `telegram_id | code_word | prize_type | promo_code | instructions | ...`
- **Telegram_ID**: Уникальный идентификатор пользователя в Telegram
- **Prize_Type**: Тип приза - 'digital' (цифровой) или 'physical' (физический)
- **Validation_Error**: Ошибка валидации данных, требующая логирования и пропуска записи
- **Migration_Script**: Скрипт для одноразового обновления существующих данных в PostgreSQL

## Requirements

### Requirement 1: Чтение кодового слова из столбца Google Sheets

**User Story:** Как система синхронизации, я хочу читать кодовое слово из отдельного столбца в Google Sheets, чтобы обеспечить независимость данных от названия листа.

#### Acceptance Criteria

1. WHEN Sync_Service читает данные из Sheet, THE Sync_Service SHALL извлекать значение code_word из второго столбца (индекс 1) каждой строки
2. THE Column_Structure в Google_Sheets SHALL иметь следующий порядок: `telegram_id (столбец A) | code_word (столбец B) | prize_type (столбец C) | promo_code (столбец D) | instructions (столбец E) | ...`
3. WHEN Sync_Service преобразует данные строки в Prize_Record, THE Sync_Service SHALL использовать значение из столбца code_word вместо sheet_name
4. THE Sync_Service SHALL сохранять поле sheet_name в Prize_Record для целей аудита и отладки

### Requirement 2: Валидация обязательности кодового слова

**User Story:** Как система синхронизации, я хочу валидировать наличие кодового слова в каждой строке, чтобы предотвратить создание некорректных записей.

#### Acceptance Criteria

1. WHEN Sync_Service обрабатывает строку из Sheet, THE Sync_Service SHALL проверять, что столбец code_word не пустой
2. IF столбец code_word пустой или отсутствует, THEN THE Sync_Service SHALL пропустить эту строку и записать Validation_Error в лог
3. THE Validation_Error SHALL содержать следующую информацию: sheet_name, row_index, причину ошибки ("missing_code_word")
4. WHEN строка пропущена из-за отсутствия code_word, THE Sync_Service SHALL продолжить обработку следующих строк

### Requirement 3: Обеспечение уникальности кодового слова

**User Story:** Как система синхронизации, я хочу гарантировать уникальность кодового слова в рамках всей системы, чтобы избежать конфликтов и дублирования данных.

#### Acceptance Criteria

1. THE PostgreSQL SHALL поддерживать существующий уникальный индекс `idx_prizes_telegram_code` на полях (telegram_id, code_word)
2. WHEN Sync_Service пытается вставить Prize_Record с дублирующейся комбинацией (telegram_id, code_word), THE PostgreSQL SHALL отклонить операцию с ошибкой уникальности
3. WHEN возникает ошибка уникальности при вставке, THE Sync_Service SHALL записать Validation_Error в лог с информацией о конфликтующих значениях
4. FOR ALL Prize_Record в PostgreSQL, комбинация (telegram_id, code_word) SHALL быть уникальной

### Requirement 4: Валидация структуры листа

**User Story:** Как система синхронизации, я хочу валидировать структуру листа перед обработкой данных, чтобы обнаружить несовместимые листы на ранней стадии.

#### Acceptance Criteria

1. WHEN Sync_Service начинает обработку Sheet, THE Sync_Service SHALL проверять наличие минимум 3 столбцов (telegram_id, code_word, prize_type)
2. IF Sheet не содержит минимально необходимое количество столбцов, THEN THE Sync_Service SHALL записать Validation_Error и пропустить весь Sheet
3. THE Validation_Error для некорректной структуры SHALL содержать: sheet_name, количество найденных столбцов, ожидаемое минимальное количество
4. WHEN Sheet пропущен из-за некорректной структуры, THE Sync_Service SHALL продолжить обработку следующих листов

### Requirement 5: Миграция существующих данных

**User Story:** Как администратор системы, я хочу обновить существующие записи в PostgreSQL, чтобы они соответствовали новой структуре данных.

#### Acceptance Criteria

1. THE Migration_Script SHALL обновить все существующие Prize_Record, где code_word равен sheet_name
2. WHEN Migration_Script выполняется, THE Migration_Script SHALL сохранить резервную копию данных перед изменениями
3. THE Migration_Script SHALL записывать в лог количество обновленных записей и любые ошибки
4. WHEN миграция завершена, THE Migration_Script SHALL вернуть статус выполнения (успех/ошибка) и статистику изменений

### Requirement 6: Обратная совместимость

**User Story:** Как разработчик, я хочу понимать требования к обратной совместимости, чтобы правильно обработать существующие листы.

#### Acceptance Criteria

1. THE Sync_Service SHALL NOT поддерживать старую структуру листов без столбца code_word
2. WHEN Sync_Service обнаруживает Sheet без столбца code_word, THE Sync_Service SHALL записать Validation_Error и пропустить этот Sheet
3. THE Validation_Error SHALL явно указывать, что требуется обновление структуры Sheet для добавления столбца code_word
4. FOR ALL Sheet в Google_Sheets, структура SHALL соответствовать новому формату Column_Structure

### Requirement 7: Логирование и мониторинг

**User Story:** Как администратор системы, я хочу получать детальную информацию о процессе синхронизации, чтобы быстро выявлять и устранять проблемы.

#### Acceptance Criteria

1. WHEN Sync_Service пропускает строку из-за отсутствия code_word, THE Sync_Service SHALL записать предупреждение с уровнем WARNING
2. WHEN Sync_Service пропускает Sheet из-за некорректной структуры, THE Sync_Service SHALL записать ошибку с уровнем ERROR
3. WHEN Sync_Service успешно обрабатывает Sheet, THE Sync_Service SHALL записать информацию с уровнем INFO, включая количество обработанных и пропущенных строк
4. THE Sync_Service SHALL записывать в лог значение code_word для каждой успешно обработанной строки на уровне DEBUG

### Requirement 8: Обновление тестовых данных

**User Story:** Как разработчик, я хочу обновить все тестовые данные для соответствия новой структуре, чтобы тесты корректно проверяли функциональность.

#### Acceptance Criteria

1. FOR ALL тестовых данных в модуле тестирования синхронизации, структура SHALL соответствовать новому формату Column_Structure
2. THE тестовые данные SHALL включать сценарии с отсутствующим code_word для проверки валидации
3. THE тестовые данные SHALL включать сценарии с дублирующимися code_word для проверки уникальности
4. WHEN тесты выполняются, THE тесты SHALL проверять, что code_word корректно извлекается из столбца B, а не из sheet_name
