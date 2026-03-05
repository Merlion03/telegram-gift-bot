# Implementation Plan: PostgreSQL Realtime Notifications

## Overview

Замена Supabase Realtime на нативный PostgreSQL LISTEN/NOTIFY механизм для real-time обновлений в админ-панели. Реализация включает database triggers, custom Next.js server с WebSocket поддержкой, browser client и миграцию существующих компонентов. Архитектура обеспечивает полную обратную совместимость с существующим API и устраняет CSP ошибки.

## Tasks

- [ ] 1. Создать PostgreSQL database triggers для уведомлений
  - [ ] 1.1 Создать функцию и триггер notify_new_message для таблицы support_messages
    - Реализовать функцию notify_new_message() с формированием JSON payload
    - Создать AFTER INSERT триггер trigger_notify_new_message
    - Payload должен содержать: operation, table, session_id, message_id, data
    - Использовать pg_notify для отправки в канал 'new_message'
    - Добавить EXCEPTION блок для обработки ошибок без блокировки INSERT
    - _Requirements: 1.1, 1.4_
  
  - [ ] 1.2 Написать property test для trigger notify_new_message
    - **Property 1: Database trigger notification round-trip**
    - **Validates: Requirements 1.1, 1.4**
    - Генерировать произвольные support_messages записи
    - Проверять, что NOTIFY payload содержит данные, совпадающие с INSERT
    - Минимум 100 итераций с fast-check
  
  - [ ] 1.3 Создать функцию и триггер notify_session_status_change для таблицы support_sessions
    - Реализовать функцию notify_session_status_change() с проверкой изменения status
    - Создать AFTER UPDATE триггер trigger_notify_session_status_change
    - Payload должен содержать: operation, table, session_id, old_status, new_status, data
    - Отправлять уведомление только если OLD.status IS DISTINCT FROM NEW.status
    - Использовать pg_notify для отправки в канал 'session_status_change'
    - _Requirements: 1.2, 1.4_
  
  - [ ] 1.4 Создать функцию и триггер notify_session_type_change для таблицы support_sessions
    - Реализовать функцию notify_session_type_change() с проверкой изменения session_type
    - Создать AFTER UPDATE триггер trigger_notify_session_type_change
    - Payload должен содержать: operation, table, session_id, old_type, new_type, data
    - Отправлять уведомление только если OLD.session_type IS DISTINCT FROM NEW.session_type
    - Использовать pg_notify для отправки в канал 'session_type_change'
    - _Requirements: 1.3, 1.4_
  
  - [ ] 1.5 Написать unit тесты для всех database triggers
    - Тестировать корректность формирования JSON payload
    - Тестировать обработку NULL значений в полях
    - Тестировать использование OLD записи для DELETE операций
    - Тестировать EXCEPTION блок при ошибках
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Создать SQL миграционный скрипт
  - [ ] 2.1 Создать файл миграции database/migrations/005_realtime_triggers.sql
    - Включить все три функции и триггера из задачи 1
    - Добавить проверку существования триггеров (CREATE OR REPLACE)
    - Добавить комментарии на русском языке для каждого триггера
    - Добавить rollback секцию для удаления триггеров
    - _Requirements: 13.1, 13.4_
  
  - [ ] 2.2 Создать скрипт применения миграции scripts/apply_migration_005.py
    - Использовать существующий DatabaseClient для подключения
    - Читать и выполнять SQL из файла миграции
    - Логировать каждый шаг применения миграции
    - Обрабатывать ошибки с rollback при необходимости
    - _Requirements: 13.1_

- [ ] 3. Реализовать WebSocket server класс RealtimeWebSocketServer
  - [ ] 3.1 Создать базовую структуру класса lib/realtime/RealtimeWebSocketServer.ts
    - Определить интерфейсы: ClientConnection, ServerState, ServerConfig
    - Определить типы сообщений: ClientMessage, ServerMessage
    - Создать класс RealtimeWebSocketServer с приватными полями
    - Реализовать constructor с инициализацией WebSocketServer и pg.Pool
    - _Requirements: 2.1, 7.1, 7.4_
  
  - [ ] 3.2 Реализовать метод initialize() для запуска сервера
    - Создать выделенное PostgreSQL подключение для LISTEN (вне pool)
    - Выполнить LISTEN команды для каналов: new_message, session_status_change, session_type_change
    - Настроить обработчик уведомлений от PostgreSQL
    - Запустить heartbeat механизм
    - Настроить обработчики SIGTERM/SIGINT для graceful shutdown
    - Логировать успешный запуск сервера
    - _Requirements: 3.1, 3.2, 7.1, 7.5_
  
  - [ ] 3.3 Реализовать метод handleConnection() для новых WebSocket подключений
    - Вызвать authenticateClient() для проверки session token
    - Проверить роль администратора через NextAuth
    - При успешной аутентификации создать ClientConnection с уникальным ID
    - Добавить клиента в Map clients
    - Настроить обработчики сообщений от клиента
    - Настроить обработчик закрытия соединения
    - При ошибке аутентификации отклонить подключение с кодом 401/403
    - Логировать каждое подключение с timestamp, client_id, user_id
    - _Requirements: 2.2, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1_

  - [ ] 3.4 Реализовать метод handleClientMessage() для обработки сообщений от клиентов
    - Парсить JSON сообщение от клиента
    - Обрабатывать тип 'subscribe' для session_messages, all_messages, status_changes
    - Обрабатывать тип 'unsubscribe' с удалением из соответствующих Map
    - Обрабатывать тип 'pong' для обновления lastPong timestamp
    - Отправлять subscription_confirmed сообщение клиенту
    - Обрабатывать ошибки парсинга с отправкой error сообщения
    - _Requirements: 2.3, 2.4, 2.5, 4.1, 4.2_
  
  - [ ] 3.5 Реализовать метод handlePostgresNotification() для обработки уведомлений от PostgreSQL
    - Парсить JSON payload от PostgreSQL NOTIFY
    - Для канала 'new_message' загружать полные данные из support_messages
    - Для каналов 'session_status_change' и 'session_type_change' загружать данные из support_sessions
    - Определять релевантных подписчиков на основе session_id и типа подписки
    - Вызывать broadcastToSubscribers() для отправки уведомлений
    - Обрабатывать ошибки загрузки данных с логированием и пропуском уведомления
    - Логировать каждое полученное уведомление с типом и session_id
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 9.3_
  
  - [ ] 3.6 Реализовать методы управления подписками
    - Реализовать subscribeToSession(clientId, sessionId) с добавлением в sessionSubscribers Map
    - Реализовать subscribeToAllMessages(clientId) с добавлением в allMessagesSubscribers Set
    - Реализовать subscribeToStatusChanges(clientId) с добавлением в statusChangeSubscribers Set
    - Реализовать unsubscribe(clientId, subscriptionId) с удалением из соответствующих структур
    - Поддерживать множественные подписки от одного клиента
    - _Requirements: 2.3, 2.4, 2.5, 4.5_
  
  - [ ] 3.7 Реализовать методы отправки сообщений клиентам
    - Реализовать sendToClient(clientId, message) с проверкой состояния WebSocket
    - Реализовать broadcastToSubscribers(subscribers, message) с итерацией по Set
    - Обрабатывать ошибки отправки с retry (1 попытка)
    - При неудаче закрывать соединение с клиентом
    - Логировать ошибки отправки с client_id и текстом ошибки
    - _Requirements: 3.6, 9.5_
  
  - [ ] 3.8 Реализовать heartbeat механизм
    - Создать метод startHeartbeat() с setInterval 30 секунд
    - Отправлять ping сообщения всем подключённым клиентам
    - Проверять lastPong timestamp для каждого клиента
    - Закрывать соединение если pong не получен в течение 60 секунд
    - _Requirements: 2.7, 2.8_
  
  - [ ] 3.9 Реализовать graceful shutdown
    - Создать метод shutdown() для обработки SIGTERM/SIGINT
    - Установить флаг isShuttingDown для прекращения приёма новых подключений
    - Отправить close frame (code 1001) всем подключённым клиентам
    - Ожидать закрытия всех соединений в течение 10 секунд
    - Выполнить UNLISTEN для всех каналов
    - Закрыть PostgreSQL LISTEN подключение
    - Логировать завершение shutdown с количеством закрытых подключений
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  
  - [ ] 3.10 Реализовать переподключение к PostgreSQL LISTEN
    - Создать метод reconnectPostgresListen() с задержкой 5 секунд
    - Отслеживать количество последовательных неудач
    - Логировать CRITICAL после 3 последовательных разрывов
    - Продолжать попытки переподключения бесконечно
    - Восстанавливать LISTEN подписки после переподключения
    - _Requirements: 7.2, 7.5, 7.6_
  
  - [ ] 3.11 Реализовать метрики и мониторинг
    - Добавить поле metrics в ServerState
    - Обновлять totalConnections, activeConnections при подключении/отключении
    - Обновлять totalNotifications при получении уведомлений от PostgreSQL
    - Обновлять totalErrors при ошибках
    - Логировать количество активных подключений каждые 60 секунд
    - Предоставить метод getMetrics() для экспорта метрик
    - _Requirements: 9.4, 9.6_
  
  - [ ] 3.12 Написать unit тесты для RealtimeWebSocketServer
    - Тестировать аутентификацию с валидным/невалидным токеном
    - Тестировать подписку на конкретную сессию
    - Тестировать подписку на все сообщения
    - Тестировать отписку от канала
    - Тестировать автоматическую очистку при закрытии соединения
    - Тестировать отправку ping каждые 30 секунд
    - Тестировать закрытие при timeout pong
    - Тестировать graceful shutdown
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 10.1-10.6_
  
  - [ ] 3.13 Написать property тесты для RealtimeWebSocketServer
    - **Property 3: WebSocket authentication enforcement**
    - **Property 4: Session-specific subscription filtering**
    - **Property 6: Subscription cleanup on disconnect**
    - **Property 7: Heartbeat ping interval**
    - **Property 9: Notification routing to subscribers**
    - **Property 16: PostgreSQL LISTEN reconnection**
    - **Property 17: Admin role authorization**
    - **Property 20: Graceful shutdown connection closure**
    - **Validates: Requirements 2.2, 2.3, 2.6, 2.7, 4.1, 7.2, 8.4, 10.2-10.4**
    - Минимум 100 итераций для каждого property

- [ ] 4. Создать Custom Next.js Server с WebSocket поддержкой
  - [ ] 4.1 Создать файл server.ts в корне nextjs-app
    - Импортировать Next.js и создать Next app instance
    - Создать HTTP server с http.createServer()
    - Интегрировать Next.js как request handler
    - Инициализировать RealtimeWebSocketServer с HTTP server
    - Запустить сервер на порту из переменной окружения (default 3000)
    - Обрабатывать ошибки запуска с логированием
    - _Requirements: 2.1_
  
  - [ ] 4.2 Обновить package.json для использования custom server
    - Изменить скрипт "dev" на "node server.ts" с ts-node
    - Изменить скрипт "start" на "node server.ts" для production
    - Добавить зависимости: ws, @types/ws
    - Обновить скрипт "build" для компиляции server.ts
    - _Requirements: 2.1_
  
  - [ ] 4.3 Создать API route /api/realtime для WebSocket upgrade
    - Создать файл app/api/realtime/route.ts
    - Обрабатывать HTTP GET запросы для WebSocket upgrade
    - Проверять заголовок Upgrade: websocket
    - Передавать управление RealtimeWebSocketServer для upgrade
    - Возвращать 426 Upgrade Required для обычных HTTP запросов
    - _Requirements: 2.1_

- [ ] 5. Checkpoint - Проверить работу WebSocket сервера
  - Убедиться, что custom server запускается без ошибок
  - Убедиться, что PostgreSQL LISTEN подключение устанавливается
  - Убедиться, что все unit тесты проходят
  - Спросить пользователя, если возникли вопросы

- [ ] 6. Реализовать PostgresRealtimeClient для браузера
  - [ ] 6.1 Создать базовую структуру класса lib/realtime/PostgresRealtimeClient.ts
    - Определить интерфейсы: Subscription, ClientState, ClientConfig
    - Определить типы callback: MessageCallback, ErrorCallback
    - Создать класс PostgresRealtimeClient с приватными полями
    - Реализовать private constructor для singleton pattern
    - Реализовать статический метод getInstance()
    - _Requirements: 5.1, 5.2, 5.3, 6.2_
  
  - [ ] 6.2 Реализовать метод connect() для подключения к WebSocket серверу
    - Получить session token из cookies или NextAuth
    - Создать WebSocket соединение к /api/realtime
    - Передать session token в query параметрах или заголовках
    - Настроить обработчики: onopen, onmessage, onerror, onclose
    - Установить connectionState в 'connected' при успехе
    - Восстановить подписки после переподключения
    - _Requirements: 5.4, 8.1_
  
  - [ ] 6.3 Реализовать методы подписки
    - Реализовать subscribeToSessionMessages(sessionId, onMessage, onError)
    - Реализовать subscribeToAllMessages(onMessage, onError)
    - Реализовать subscribeToSessionStatusChanges(onStatusChange, onError)
    - Каждый метод должен вызывать connect() если соединение не установлено
    - Отправлять subscribe сообщение на сервер с соответствующими параметрами
    - Сохранять подписку в Map subscriptions
    - Возвращать функцию отписки, которая отправляет unsubscribe сообщение
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 6.1_
  
  - [ ] 6.4 Реализовать метод handleMessage() для обработки сообщений от сервера
    - Парсить JSON сообщение от сервера
    - Обрабатывать тип 'subscription_confirmed' с логированием
    - Обрабатывать тип 'new_message' с вызовом onMessage callback
    - Обрабатывать тип 'status_change' с вызовом onStatusChange callback
    - Обрабатывать тип 'type_change' с вызовом onStatusChange callback
    - Обрабатывать тип 'error' с вызовом onError callback
    - Обрабатывать тип 'ping' с отправкой pong ответа
    - Преобразовывать данные в тип SupportMessage с правильными полями
    - Обрабатывать ошибки парсинга с логированием
    - _Requirements: 5.6, 6.4, 6.6_
  
  - [ ] 6.5 Реализовать автоматическое переподключение с экспоненциальной задержкой
    - Создать метод reconnect() с расчётом задержки
    - Использовать формулу: delay = min(initialDelay * (backoffMultiplier ^ attempts), maxDelay)
    - Начальная задержка: 1 секунда, максимальная: 30 секунд, множитель: 2
    - Установить connectionState в 'reconnecting'
    - Вызывать connect() после задержки
    - Сбрасывать reconnectAttempts при успешном подключении
    - Вызывать onError callback для всех подписок при разрыве
    - _Requirements: 5.7, 5.9_
  
  - [ ] 6.6 Реализовать heartbeat механизм на клиенте
    - Создать метод sendHeartbeat() с setInterval 30 секунд
    - Отправлять pong сообщения в ответ на ping от сервера
    - Отслеживать lastPongAt timestamp
    - Закрывать соединение и переподключаться при timeout
    - _Requirements: 2.7_
  
  - [ ] 6.7 Реализовать метод unsubscribeAll()
    - Итерировать по всем подпискам в Map
    - Отправлять unsubscribe сообщение для каждой подписки
    - Очищать Map subscriptions
    - Закрывать WebSocket соединение
    - _Requirements: 6.3_
  
  - [ ] 6.8 Написать unit тесты для PostgresRealtimeClient
    - Тестировать установку соединения при вызове subscribe
    - Тестировать отправку subscribe сообщения
    - Тестировать вызов callback при получении уведомления
    - Тестировать функцию отписки
    - Тестировать автоматическое переподключение
    - Тестировать вызов onError при ошибке подключения
    - Тестировать heartbeat механизм
    - _Requirements: 5.1-5.9, 6.1-6.6_
  
  - [ ] 6.9 Написать property тесты для PostgresRealtimeClient
    - **Property 11: Client subscription message sending**
    - **Property 12: Client callback invocation**
    - **Property 13: Client reconnection exponential backoff**
    - **Property 14: Unsubscribe message sending**
    - **Property 15: Client data transformation consistency**
    - **Validates: Requirements 5.4, 5.5, 5.6, 5.7, 5.8, 6.4**
    - Минимум 100 итераций для каждого property

- [ ] 7. Интегрировать PostgresRealtimeClient в существующий код
  - [ ] 7.1 Обновить lib/database/supabaseClient.ts для экспорта PostgresRealtimeClient
    - Импортировать PostgresRealtimeClient
    - Создать переменную окружения NEXT_PUBLIC_USE_POSTGRES_REALTIME (feature flag)
    - Экспортировать PostgresRealtimeClient.getInstance() если feature flag включён
    - Экспортировать SupabaseRealtimeClient если feature flag выключен
    - Сохранить обратную совместимость с существующим API
    - _Requirements: 6.1, 13.2, 13.3_
  
  - [ ] 7.2 Обновить компонент SessionList для использования нового клиента
    - Заменить импорт SupabaseRealtimeClient на импорт из supabaseClient
    - Проверить, что все вызовы методов совместимы
    - Проверить, что обработка ошибок работает корректно
    - Проверить, что логирование работает так же
    - _Requirements: 6.5, 6.6_
  
  - [ ] 7.3 Обновить компонент ChatWindow для использования нового клиента
    - Заменить импорт SupabaseRealtimeClient на импорт из supabaseClient
    - Проверить, что все вызовы методов совместимы
    - Проверить, что обработка ошибок работает корректно
    - Проверить, что логирование работает так же
    - _Requirements: 6.5, 6.6_

- [ ] 8. Checkpoint - Проверить интеграцию клиента
  - Убедиться, что компоненты React компилируются без ошибок
  - Убедиться, что feature flag работает корректно
  - Убедиться, что все unit тесты проходят
  - Спросить пользователя, если возникли вопросы

- [ ] 9. Написать integration и performance тесты
  - [ ] 9.1 Написать end-to-end integration тест
    - Запустить PostgreSQL с тестовой базой данных
    - Запустить WebSocket сервер
    - Создать клиентское подключение
    - Выполнить INSERT в support_messages
    - Проверить, что клиент получил уведомление
    - Проверить, что данные совпадают с INSERT
    - Очистить тестовую базу данных
    - _Requirements: 11.2_
  
  - [ ] 9.2 Написать property тест для end-to-end round-trip
    - **Property 8: Notification data enrichment round-trip**
    - **Validates: Requirements 3.4, 3.5**
    - Генерировать произвольные support_messages
    - Выполнять INSERT в базу данных
    - Проверять, что загруженные данные совпадают с INSERT
    - Минимум 100 итераций
  
  - [ ] 9.3 Написать performance тест для latency
    - **Property 22: End-to-end latency**
    - **Validates: Requirements 12.1**
    - Измерять время от INSERT до получения уведомления клиентом
    - Выполнить 1000 INSERT операций
    - Проверить, что 95 перцентиль < 500ms
  
  - [ ] 9.4 Написать load тест для 100 одновременных подключений
    - **Property 23: Concurrent connection capacity**
    - **Validates: Requirements 12.2**
    - Создать 100 WebSocket подключений
    - Подписать каждое на разные сессии
    - Отправить уведомления для всех сессий
    - Проверить, что все клиенты получили уведомления
    - Проверить отсутствие ошибок и disconnects
  
  - [ ] 9.5 Написать throughput тест для 1000 уведомлений/сек
    - **Property 24: Notification throughput**
    - **Validates: Requirements 12.3**
    - Создать несколько клиентских подключений
    - Генерировать 1000 INSERT операций в секунду
    - Проверить, что все уведомления доставлены
    - Проверить отсутствие потери данных

- [ ] 10. Создать документацию и скрипты миграции
  - [ ] 10.1 Создать скрипт проверки работы триггеров scripts/test_realtime_triggers.py
    - Подключиться к PostgreSQL
    - Создать тестовое LISTEN подключение
    - Выполнить INSERT в support_messages
    - Проверить получение уведомления через LISTEN
    - Проверить корректность JSON payload
    - Логировать результаты проверки
    - _Requirements: 13.4_
  
  - [ ] 10.2 Создать rollback скрипт scripts/rollback_realtime_triggers.py
    - Удалить все три триггера: DROP TRIGGER IF EXISTS
    - Удалить все три функции: DROP FUNCTION IF EXISTS
    - Логировать каждый шаг rollback
    - _Requirements: 13.5_
  
  - [ ] 10.3 Обновить README.md с инструкциями по миграции
    - Добавить секцию "PostgreSQL Realtime Migration"
    - Описать шаги применения миграции
    - Описать настройку feature flag
    - Описать процесс rollback при проблемах
    - Добавить примеры команд для запуска тестов
    - _Requirements: 13.1, 13.2, 13.3, 13.5_

- [ ] 11. Final checkpoint - Финальная проверка
  - Убедиться, что все unit тесты проходят
  - Убедиться, что все property тесты проходят (минимум 100 итераций)
  - Убедиться, что integration тесты проходят
  - Убедиться, что миграция применяется без ошибок
  - Убедиться, что feature flag работает корректно
  - Убедиться, что существующие компоненты работают с новым клиентом
  - Спросить пользователя о готовности к deployment

## Notes

- Каждая задача ссылается на конкретные требования для трассируемости
- Property тесты должны выполняться с минимум 100 итерациями (fast-check)
- Все комментарии в коде должны быть на русском языке
- Один модуль = один файл (модульная архитектура)
- Zero tolerance policy: все ошибки исправляются немедленно
- Checkpoints обеспечивают инкрементальную валидацию
