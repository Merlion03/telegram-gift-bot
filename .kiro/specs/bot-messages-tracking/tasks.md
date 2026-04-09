# План реализации: bot-messages-tracking

## Обзор

Данный план описывает задачи для реализации полного отслеживания диалога партнёра с ботом в админ-панели. Основная цель — обеспечить сохранение и отображение системных команд (например, `/start`, `/help`) и автоматических ответов бота.

Ключевые изменения:
- Убрать фильтрацию системных команд в `MessageInterceptor` (одна строка кода)
- Проверить корректность вызовов `save_bot_message()` во всех handlers
- Создать property-based тесты для проверки 31 свойства
- Убедиться, что `ChatWindow.tsx` и WebSocket работают корректно (уже реализовано)

## Задачи

- [x] 1. Изменить MessageInterceptor для сохранения системных команд
  - Убрать фильтрацию системных команд в методе `__call__()`
  - Удалить проверку `if self._is_system_command(event)` перед сохранением сообщения
  - Системные команды должны сохраняться в историю диалога как обычные сообщения от пользователя
  - Файл: `telegram-bot/middleware/message_interceptor.py`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Проверить handlers на корректность сохранения ответов бота
  - [x] 2.1 Проверить common_handler.py (команды /start, /help)
    - Убедиться, что `save_bot_message()` вызывается после `message.answer()`
    - Проверить обработку ошибок при сохранении
    - Файл: `telegram-bot/handlers/common_handler.py`
    - _Requirements: 2.1, 2.2, 2.5, 2.6_
  
  - [x] 2.2 Проверить support_handler.py
    - Убедиться, что все ответы бота сохраняются через `save_bot_message()`
    - Проверить методы: `start_support()`, `handle_support_end_callback()`, `end_support()`
    - Файл: `telegram-bot/handlers/support_handler.py`
    - _Requirements: 2.1, 2.2, 2.5, 2.6_
  
  - [x] 2.3 Проверить prize_flow_handler.py
    - Убедиться, что все ответы бота сохраняются
    - Проверить, что inline keyboard не сохраняются в тексте сообщения
    - Файл: `telegram-bot/handlers/prize_flow_handler.py`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 2.4 Проверить prize_handler.py
    - Убедиться, что все ответы бота сохраняются
    - Файл: `telegram-bot/handlers/prize_handler.py`
    - _Requirements: 2.1, 2.2, 2.5, 2.6_
  
  - [x] 2.5 Проверить delivery_handler.py
    - Убедиться, что все ответы бота сохраняются
    - Файл: `telegram-bot/handlers/delivery_handler.py`
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

- [x] 3. Checkpoint - Проверка базовой функциональности
  - Убедиться, что системные команды сохраняются в БД
  - Убедиться, что ответы бота сохраняются в БД
  - Запустить существующие тесты для проверки обратной совместимости
  - Если возникли проблемы, обратиться к пользователю

- [x] 4. Создать unit-тесты для базовой функциональности
  - [x] 4.1 Тесты для MessageInterceptor
    - Тест сохранения команды `/start`
    - Тест сохранения команды `/help`
    - Тест сохранения команды с параметрами (например, `/start ref=123`)
    - Тест обновления `last_activity` при сохранении команды
    - Файл: `telegram-bot/tests/test_message_interceptor.py`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 4.2 Тесты для SessionManager
    - Тест сохранения ответа бота с `telegram_id=0`
    - Тест сохранения ответа бота с `message_type='from_bot'`
    - Тест связи ответа бота с активной сессией
    - Файл: `telegram-bot/tests/test_session_manager.py`
    - _Requirements: 2.1, 2.5, 2.6_
  
  - [x] 4.3 Тесты для обратной совместимости
    - Тест сохранения обычных текстовых сообщений
    - Тест сохранения медиа-сообщений с `file_id`
    - Тест работы режима поддержки
    - Файл: `telegram-bot/tests/test_backward_compatibility.py`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 5. Создать property-based тесты (Hypothesis)
  - [x] 5.1 Property 1: Сохранение системных команд
    - **Property 1: Сохранение системных команд**
    - **Validates: Requirements 1.1, 1.2**
    - For any системной команды и любого пользователя, система должна сохранить её в БД как сообщение типа `from_user` без фильтрации
    - Файл: `telegram-bot/tests/property_tests/test_property_01_system_commands.py`
  
  - [x] 5.2 Property 2: Создание сессии при системной команде
    - **Property 2: Создание сессии при системной команде**
    - **Validates: Requirements 1.3**
    - For any системной команды, система должна создать или получить активную сессию для пользователя
    - Файл: `telegram-bot/tests/property_tests/test_property_02_session_creation.py`
  
  - [x] 5.3 Property 3: Полнота текста системной команды
    - **Property 3: Полнота текста системной команды**
    - **Validates: Requirements 1.4**
    - For any системной команды с параметрами, сохранённое сообщение должно содержать полный текст команды
    - Файл: `telegram-bot/tests/property_tests/test_property_03_command_text.py`
  
  - [x] 5.4 Property 4: Обновление времени активности сессии
    - **Property 4: Обновление времени активности сессии**
    - **Validates: Requirements 1.5**
    - For any сохранённой системной команды, поле `last_activity` должно быть обновлено
    - Файл: `telegram-bot/tests/property_tests/test_property_04_last_activity.py`
  
  - [x] 5.5 Property 5: Сохранение ответов бота с правильным типом
    - **Property 5: Сохранение ответов бота с правильным типом**
    - **Validates: Requirements 2.1**
    - For any ответа бота, система должна сохранить его как сообщение типа `from_bot`
    - Файл: `telegram-bot/tests/property_tests/test_property_05_bot_message_type.py`
  
  - [x] 5.6 Property 6: Сохранение только текстового содержимого
    - **Property 6: Сохранение только текстового содержимого**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - For any ответа бота, сохранённое сообщение должно содержать только текст без inline keyboard
    - Файл: `telegram-bot/tests/property_tests/test_property_06_text_only.py`
  
  - [x] 5.7 Property 7: Системный идентификатор для ответов бота
    - **Property 7: Системный идентификатор для ответов бота**
    - **Validates: Requirements 2.5**
    - For any ответа бота, сохранённое сообщение должно содержать `telegram_id = 0`
    - Файл: `telegram-bot/tests/property_tests/test_property_07_bot_telegram_id.py`
  
  - [x] 5.8 Property 8: Связь ответа бота с сессией
    - **Property 8: Связь ответа бота с сессией**
    - **Validates: Requirements 2.6**
    - For any сохранённого ответа бота, сообщение должно быть связано с активной сессией
    - Файл: `telegram-bot/tests/property_tests/test_property_08_bot_session_link.py`
  
  - [x] 5.9 Property 17: Обратная совместимость текстовых сообщений
    - **Property 17: Обратная совместимость текстовых сообщений**
    - **Validates: Requirements 6.1**
    - For any обычного текстового сообщения, система должна корректно сохранять его
    - Файл: `telegram-bot/tests/property_tests/test_property_17_text_messages.py`
  
  - [x] 5.10 Property 18: Обратная совместимость медиа-сообщений
    - **Property 18: Обратная совместимость медиа-сообщений**
    - **Validates: Requirements 6.2**
    - For any медиа-сообщения, система должна корректно сохранять его с `file_id`
    - Файл: `telegram-bot/tests/property_tests/test_property_18_media_messages.py`
  
  - [x] 5.11 Property 23: Производительность сохранения команд
    - **Property 23: Производительность сохранения команд**
    - **Validates: Requirements 7.1**
    - For any системной команды, операция сохранения должна выполняться за время не более 100ms
    - Файл: `telegram-bot/tests/property_tests/test_property_23_performance_commands.py`
  
  - [x] 5.12 Property 24: Производительность сохранения ответов бота
    - **Property 24: Производительность сохранения ответов бота**
    - **Validates: Requirements 7.2**
    - For any ответа бота, операция сохранения должна выполняться за время не более 100ms
    - Файл: `telegram-bot/tests/property_tests/test_property_24_performance_bot.py`
  
  - [x] 5.13 Property 25: Обработка ошибок без блокировки
    - **Property 25: Обработка ошибок без блокировки**
    - **Validates: Requirements 7.3, 7.4**
    - For any ошибки при сохранении, система должна залогировать ошибку и продолжить обработку
    - Файл: `telegram-bot/tests/property_tests/test_property_25_error_handling.py`
  
  - [x] 5.14 Property 26: Сохранение при параллельной обработке
    - **Property 26: Сохранение при параллельной обработке**
    - **Validates: Requirements 7.5**
    - For any набора команд, обрабатываемых одновременно, система должна сохранить все сообщения
    - Файл: `telegram-bot/tests/property_tests/test_property_26_parallel_processing.py`
  
  - [x] 5.15 Property 27: Логирование сохранения команд
    - **Property 27: Логирование сохранения команд**
    - **Validates: Requirements 8.1**
    - For any системной команды, система должна залогировать событие с уровнем `debug`
    - Файл: `telegram-bot/tests/property_tests/test_property_27_logging_commands.py`
  
  - [x] 5.16 Property 28: Логирование сохранения ответов бота
    - **Property 28: Логирование сохранения ответов бота**
    - **Validates: Requirements 8.2**
    - For any ответа бота, система должна залогировать событие с уровнем `debug`
    - Файл: `telegram-bot/tests/property_tests/test_property_28_logging_bot.py`
  
  - [x] 5.17 Property 29: Логирование ошибок с stack trace
    - **Property 29: Логирование ошибок с stack trace**
    - **Validates: Requirements 8.3**
    - For any ошибки при сохранении, система должна залогировать ошибку с полным stack trace
    - Файл: `telegram-bot/tests/property_tests/test_property_29_logging_errors.py`
  
  - [x] 5.18 Property 30: Логирование операций с сессиями
    - **Property 30: Логирование операций с сессиями**
    - **Validates: Requirements 8.4**
    - For any операции с сессией, система должна залогировать событие
    - Файл: `telegram-bot/tests/property_tests/test_property_30_logging_sessions.py`

- [x] 6. Проверить frontend (ChatWindow.tsx)
  - [x] 6.1 Проверить отображение системных команд
    - Убедиться, что системные команды отображаются в хронологическом порядке
    - Проверить визуальный стиль (должен быть идентичен обычным сообщениям от пользователя)
    - Файл: `nextjs-app/components/admin/ChatWindow.tsx`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 6.2 Проверить отображение ответов бота
    - Убедиться, что ответы бота отображаются в хронологическом порядке
    - Проверить визуальный стиль (фиолетовый фон, иконка 🤖, метка "🤖 Бот")
    - Убедиться, что inline keyboard не отображаются
    - Файл: `nextjs-app/components/admin/ChatWindow.tsx`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 6.3 Проверить WebSocket real-time обновления
    - Убедиться, что новые ответы бота приходят в реальном времени
    - Проверить формат данных (`sender_type='bot'`)
    - Проверить автоматическую прокрутку к последнему сообщению
    - Файл: `nextjs-app/components/admin/ChatWindow.tsx`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Создать frontend тесты (Jest + React Testing Library)
  - [x] 7.1 Unit-тесты для ChatWindow.tsx
    - Тест отображения сообщения бота с правильным стилем
    - Тест отображения метки "🤖 Бот"
    - Тест хронологического порядка сообщений
    - Файл: `nextjs-app/components/admin/__tests__/ChatWindow.test.tsx`
    - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4_
  
  - [x] 7.2 Property-based тесты для ChatWindow.tsx (fast-check)
    - **Property 9: Хронологический порядок системных команд**
    - **Validates: Requirements 3.1**
    - **Property 11: Хронологический порядок ответов бота**
    - **Validates: Requirements 4.1**
    - Файл: `nextjs-app/components/admin/__tests__/ChatWindow.property.test.tsx`
  
  - [x] 7.3 Интеграционные тесты WebSocket
    - Тест получения нового сообщения бота через WebSocket
    - Тест автоматического добавления в список сообщений
    - Тест автоматической прокрутки
    - Файл: `nextjs-app/components/admin/__tests__/ChatWindow.integration.test.tsx`
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [x] 8. Checkpoint - Финальная проверка
  - Запустить все unit-тесты и убедиться, что они проходят
  - Запустить все property-based тесты (минимум 100 итераций на тест)
  - Проверить обратную совместимость (все существующие тесты должны проходить)
  - Проверить производительность (время выполнения < 100ms)
  - Проверить логирование (все события логируются корректно)
  - Если возникли проблемы, обратиться к пользователю

- [ ] 9. Интеграционное тестирование
  - [ ] 9.1 E2E тест: команда /start → сохранение → отображение
    - Отправить команду `/start` от пользователя
    - Проверить сохранение команды в БД
    - Проверить сохранение ответа бота в БД
    - Проверить отображение в ChatWindow
    - _Requirements: 1.1, 2.1, 3.1, 4.1_
  
  - [ ] 9.2 E2E тест: команда /help → сохранение → отображение
    - Отправить команду `/help` от пользователя
    - Проверить сохранение команды в БД
    - Проверить сохранение ответа бота в БД
    - Проверить отображение в ChatWindow
    - _Requirements: 1.1, 2.1, 3.1, 4.1_
  
  - [ ] 9.3 E2E тест: WebSocket real-time обновления
    - Отправить команду от пользователя
    - Проверить, что ответ бота приходит в реальном времени в админ-панель
    - Проверить автоматическое отображение без перезагрузки страницы
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 9.4 E2E тест: режим поддержки (обратная совместимость)
    - Запустить режим поддержки
    - Отправить сообщение от пользователя
    - Отправить ответ от администратора
    - Проверить корректность сохранения и отображения
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

- [ ] 10. Финальный checkpoint - Завершение реализации
  - Все тесты проходят успешно
  - Обратная совместимость сохранена
  - Производительность соответствует требованиям
  - Логирование работает корректно
  - Документация обновлена (если требуется)
  - Готово к деплою

## Примечания

- Задачи, помеченные `*`, являются опциональными и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные requirements для отслеживаемости
- Checkpoints обеспечивают инкрементальную валидацию
- Property-based тесты проверяют универсальные свойства на большом количестве входных данных (минимум 100 итераций)
- Unit-тесты проверяют конкретные примеры и edge cases
- Интеграционные тесты проверяют взаимодействие компонентов
- E2E тесты проверяют полный flow от команды до отображения

## Конфигурация тестирования

### Backend (Python)
- Фреймворк: `pytest`, `pytest-asyncio`
- Property-based тесты: `hypothesis`
- Минимум 100 итераций на property-тест
- Логирование: `structlog.testing.CapturingLogger`
- Производительность: `pytest-benchmark`

### Frontend (TypeScript/React)
- Фреймворк: `Jest`, `React Testing Library`
- Property-based тесты: `fast-check`
- Минимум 100 итераций на property-тест
- WebSocket мокирование для интеграционных тестов

## Критерии завершения

Фича считается завершённой, когда:
1. Все системные команды сохраняются в БД
2. Все ответы бота сохраняются в БД
3. Администратор видит полную историю диалога в админ-панели
4. Сообщения бота отображаются с уникальным визуальным стилем
5. Real-time обновления работают корректно
6. Существующая функциональность не нарушена
7. Все тесты проходят успешно
8. Логирование работает корректно
