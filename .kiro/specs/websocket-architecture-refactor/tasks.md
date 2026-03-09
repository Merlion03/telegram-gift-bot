# План реализации: Переработка WebSocket архитектуры

## Обзор

Полная переработка WebSocket архитектуры с модульной структурой, надёжным handshake протоколом, heartbeat механизмом и стратегией переподключения. Реализация включает 6 клиентских модулей, 6 серверных модулей и 22 property-based теста.

## Задачи

- [x] 1. Подготовка инфраструктуры и общих типов
  - Создать директорию `src/websocket/client/` для клиентских модулей
  - Создать директорию `src/websocket/server/` для серверных модулей
  - Создать файл `src/websocket/types.ts` с общими типами сообщений и интерфейсами
  - Создать файл `src/websocket/constants.ts` с константами (коды закрытия, таймауты, лимиты)
  - _Requirements: 8.1, 8.3_

- [x] 2. Реализация клиентского модуля StateManager
  - [x] 2.1 Создать класс StateManager в `src/websocket/client/StateManager.ts`
    - Реализовать управление состояниями: disconnected, connecting, connected, reconnecting
    - Реализовать методы getState(), setState(), isConnected()
    - Реализовать механизм подписки на изменения состояния (onChange)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 2.2 Написать property-based тест для Property 17 (уведомление при изменении состояния)
    - **Property 17: Уведомление при изменении состояния**
    - **Validates: Requirements 7.2**
  
  - [x] 2.3 Написать property-based тест для Property 18 (согласованность isConnected)
    - **Property 18: Согласованность isConnected() с состояниями**
    - **Validates: Requirements 7.5, 7.6**

- [x] 3. Реализация клиентского модуля ConnectionManager
  - [x] 3.1 Создать класс ConnectionManager в `src/websocket/client/ConnectionManager.ts`
    - Реализовать метод connect() с задержкой 50ms после HTTP Upgrade
    - Реализовать метод disconnect() с правильными кодами закрытия
    - Реализовать метод send() для отправки сообщений
    - Реализовать обработчики событий: open, close, error, message
    - Интегрировать с StateManager для управления состоянием
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.2, 12.1_
  
  - [x] 3.2 Написать property-based тест для Property 1 (отсутствие аномальных закрытий)
    - **Property 1: Отсутствие аномальных закрытий при нормальной работе**
    - **Validates: Requirements 1.1**
  
  - [x] 3.3 Написать property-based тест для Property 2 (правильные коды закрытия)
    - **Property 2: Использование правильных кодов закрытия при ошибках**
    - **Validates: Requirements 1.5**
  
  - [x] 3.4 Написать unit-тест для нормального закрытия с кодом 1000
    - Проверить, что при вызове disconnect() используется код 1000
    - _Requirements: 1.4_

- [x] 4. Реализация клиентского модуля SubscriptionManager
  - [x] 4.1 Создать класс SubscriptionManager в `src/websocket/client/SubscriptionManager.ts`
    - Реализовать хранение подписок в Map с уникальными ID
    - Реализовать методы subscribe(), unsubscribe(), getAll()
    - Реализовать метод restoreAll() для восстановления после переподключения
    - Реализовать метод handleMessage() для обработки входящих сообщений
    - Поддержать три типа подписок: session, all, status
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_
  
  - [x] 4.2 Написать property-based тест для Property 10 (уникальность ID подписок)
    - **Property 10: Уникальность ID подписок**
    - **Validates: Requirements 5.2**
  
  - [x] 4.3 Написать property-based тест для Property 11 (subscribe/unsubscribe round-trip)
    - **Property 11: Subscribe/Unsubscribe round-trip**
    - **Validates: Requirements 5.4**
  
  - [x] 4.4 Написать property-based тест для Property 12 (вызов callback при подтверждении)
    - **Property 12: Вызов callback при подтверждении подписки**
    - **Validates: Requirements 5.6, 14.2**
  
  - [x] 4.5 Написать unit-тест для поддержки трёх типов подписок
    - Проверить создание подписок типа session, all, status
    - _Requirements: 5.5_

- [x] 5. Реализация клиентского модуля MessageQueue
  - [x] 5.1 Создать класс MessageQueue в `src/websocket/client/MessageQueue.ts`
    - Реализовать методы enqueue(), flush(), size(), clear()
    - Реализовать FIFO логику с максимальным размером 100 сообщений
    - Реализовать фильтрацию subscribe/unsubscribe сообщений
    - Реализовать удаление старых сообщений при переполнении
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_
  
  - [x] 5.2 Написать property-based тест для Property 13 (буферизация при разрыве)
    - **Property 13: Буферизация сообщений при разрыве соединения**
    - **Validates: Requirements 6.1**
  
  - [x] 5.3 Написать property-based тест для Property 14 (FIFO при переполнении)
    - **Property 14: FIFO при переполнении очереди**
    - **Validates: Requirements 6.3**
  
  - [x] 5.4 Написать property-based тест для Property 15 (фильтрация subscribe/unsubscribe)
    - **Property 15: Фильтрация subscribe/unsubscribe в очереди**
    - **Validates: Requirements 6.5**
  
  - [x] 5.5 Написать property-based тест для Property 16 (удаление после отправки)
    - **Property 16: Удаление сообщения из очереди после отправки**
    - **Validates: Requirements 6.6**
  
  - [x] 5.6 Написать unit-тест для максимального размера очереди
    - Проверить, что очередь не превышает 100 сообщений
    - _Requirements: 6.2_

- [x] 6. Реализация клиентского модуля HeartbeatMonitor
  - [x] 6.1 Создать класс HeartbeatMonitor в `src/websocket/client/HeartbeatMonitor.ts`
    - Реализовать методы start(), stop()
    - Реализовать метод updateLastMessageTime() для обновления timestamp
    - Реализовать проверку активности каждые 10 секунд
    - Реализовать обнаружение "мёртвого" соединения (90 секунд без сообщений)
    - Реализовать callback onDead для уведомления о мёртвом соединении
    - _Requirements: 3.3, 3.6_
  
  - [x] 6.2 Написать property-based тест для Property 5 (heartbeat останавливается при закрытии)
    - **Property 5: Heartbeat останавливается при закрытии**
    - **Validates: Requirements 3.6**

- [x] 7. Реализация клиентского модуля ReconnectionStrategy
  - [x] 7.1 Создать класс ReconnectionStrategy в `src/websocket/client/ReconnectionStrategy.ts`
    - Реализовать метод reconnect() с экспоненциальной задержкой
    - Реализовать метод shouldReconnect() для проверки кодов закрытия
    - Реализовать методы cancel() и reset()
    - Реализовать логику: не переподключаться при кодах 1000, 4401, 4403
    - Реализовать проверку авторизации пользователя перед переподключением
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_
  
  - [x] 7.2 Написать property-based тест для Property 6 (автоматическое переподключение)
    - **Property 6: Автоматическое переподключение при аномальном закрытии**
    - **Validates: Requirements 4.1**
  
  - [x] 7.3 Написать property-based тест для Property 7 (экспоненциальная задержка)
    - **Property 7: Экспоненциальная задержка при переподключении**
    - **Validates: Requirements 4.2**
  
  - [x] 7.4 Написать unit-тест для кодов, при которых не переподключаемся
    - Проверить коды 1000, 4401, 4403
    - _Requirements: 4.5, 4.6_
  
  - [x] 7.5 Написать edge-case тест для неавторизованного пользователя
    - Проверить, что не пытаемся переподключиться если пользователь не авторизован
    - _Requirements: 4.7_

- [x] 8. Интеграция клиентских модулей в PostgresRealtimeClient
  - [x] 8.1 Обновить класс PostgresRealtimeClient в `src/websocket/client/PostgresRealtimeClient.ts`
    - Инициализировать все модули: ConnectionManager, SubscriptionManager, MessageQueue, HeartbeatMonitor, ReconnectionStrategy, StateManager
    - Реализовать метод connect() с handshake протоколом "Client speaks first"
    - Реализовать отправку init сообщения после задержки 50ms
    - Реализовать обработку connected сообщения и запуск heartbeat
    - Реализовать методы subscribe(), unsubscribe() через SubscriptionManager
    - Реализовать обработку закрытия соединения и логику переподключения
    - _Requirements: 2.1, 2.2, 2.5, 3.5, 4.3, 4.4, 8.1_
  
  - [x] 8.2 Написать property-based тест для Property 3 (handshake round-trip)
    - **Property 3: Handshake round-trip (Client speaks first)**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 14.1**
  
  - [x] 8.3 Написать property-based тест для Property 4 (heartbeat после handshake)
    - **Property 4: Heartbeat запускается после handshake**
    - **Validates: Requirements 3.5**
  
  - [x] 8.4 Написать property-based тест для Property 8 (восстановление подписок)
    - **Property 8: Восстановление подписок после переподключения**
    - **Validates: Requirements 4.3, 5.3, 14.3**
  
  - [x] 8.5 Написать property-based тест для Property 9 (отправка сообщений из очереди)
    - **Property 9: Отправка сообщений из очереди после переподключения**
    - **Validates: Requirements 4.4, 6.4, 14.3**

- [x] 9. Checkpoint - Проверка клиентской части
  - Убедиться, что все клиентские модули работают корректно
  - Запустить все unit и property-based тесты для клиента
  - Проверить, что нет ошибок компиляции TypeScript
  - Спросить пользователя, если возникли вопросы

- [x] 10. Реализация серверного модуля AuthenticationHandler
  - [x] 10.1 Создать класс AuthenticationHandler в `src/websocket/server/AuthenticationHandler.ts`
    - Реализовать метод validateToken() для валидации JWT токена из URL
    - Реализовать метод authenticateInit() для аутентификации init сообщения
    - Реализовать метод canSubscribe() для проверки прав доступа к каналу
    - Реализовать логирование всех попыток аутентификации
    - _Requirements: 2.3, 2.7, 9.2_
  
  - [x] 10.2 Написать unit-тест для ошибки аутентификации с кодом 4401
    - Проверить, что при невалидном токене соединение закрывается с кодом 4401
    - _Requirements: 2.7_

- [x] 11. Реализация серверного модуля SubscriptionRegistry
  - [x] 11.1 Создать класс SubscriptionRegistry в `src/websocket/server/SubscriptionRegistry.ts`
    - Реализовать методы add(), remove(), getSubscribers()
    - Реализовать методы getClientSubscriptions(), removeAllForClient()
    - Реализовать двунаправленные индексы: channel → clients и client → subscriptions
    - Реализовать поддержку трёх типов каналов: session_*, all_messages, status_changes
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 12. Реализация серверного модуля ConnectionHandler
  - [x] 12.1 Создать класс ConnectionHandler в `src/websocket/server/ConnectionHandler.ts`
    - Реализовать метод handleConnection() для обработки новых соединений
    - Реализовать метод handleMessage() для обработки сообщений от клиента
    - Реализовать методы sendToClient(), closeConnection()
    - Реализовать хранение соединений в Map с уникальными clientId
    - Реализовать логирование всех событий с полным контекстом
    - Интегрировать с AuthenticationHandler для аутентификации
    - _Requirements: 1.2, 2.3, 2.4, 9.4_

- [x] 13. Реализация серверного модуля NotificationRouter
  - [x] 13.1 Создать класс NotificationRouter в `src/websocket/server/NotificationRouter.ts`
    - Реализовать метод handleNotification() для обработки уведомлений от PostgreSQL
    - Реализовать метод broadcastToSubscribers() для отправки уведомлений подписчикам
    - Реализовать парсинг JSON payload от PostgreSQL
    - Реализовать определение типа уведомления: new_message, status_change, type_change
    - Реализовать обработку ошибок при отправке
    - Интегрировать с SubscriptionRegistry для поиска подписчиков
    - _Requirements: 5.3, 9.3_
  
  - [x] 13.2 Написать property-based тест для Property 21 (subscription round-trip)
    - **Property 21: Subscription round-trip с уведомлениями**
    - **Validates: Requirements 14.2**
  
  - [x] 13.3 Написать unit-тест для обработки отклонённых подписок
    - Проверить отправку error сообщения при отклонении подписки
    - _Requirements: 9.3_

- [x] 14. Реализация серверного модуля HeartbeatManager
  - [x] 14.1 Создать класс HeartbeatManager в `src/websocket/server/HeartbeatManager.ts`
    - Реализовать методы start(), stop()
    - Реализовать метод sendPingToAll() для отправки ping frames каждые 30 секунд
    - Реализовать метод handlePong() для обработки pong от клиента
    - Реализовать метод checkDeadConnections() для проверки таймаута (60 секунд)
    - Реализовать закрытие соединений без pong с кодом 4408
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  
  - [x] 14.2 Написать property-based тест для Property 22 (heartbeat round-trip)
    - **Property 22: Heartbeat round-trip**
    - **Validates: Requirements 14.4**
  
  - [x] 14.3 Написать unit-тест для отправки ping каждые 30 секунд
    - Проверить интервал отправки ping frames
    - _Requirements: 3.2_
  
  - [x] 14.4 Написать unit-тест для таймаута 60 секунд
    - Проверить закрытие соединения при отсутствии pong
    - _Requirements: 3.4_

- [x] 15. Реализация серверного модуля MetricsCollector
  - [x] 15.1 Создать класс MetricsCollector в `src/websocket/server/MetricsCollector.ts`
    - Реализовать методы increment(), decrement(), set()
    - Реализовать метод getAll() для получения всех метрик
    - Реализовать метод logMetrics() для логирования каждые 60 секунд
    - Реализовать отслеживание метрик: totalConnections, activeConnections, totalNotifications, totalErrors, totalPongsReceived
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 16. Интеграция серверных модулей в RealtimeWebSocketServer
  - [x] 16.1 Обновить класс RealtimeWebSocketServer в `src/websocket/server/RealtimeWebSocketServer.ts`
    - Инициализировать все модули: ConnectionHandler, AuthenticationHandler, NotificationRouter, SubscriptionRegistry, HeartbeatManager, MetricsCollector
    - Реализовать обработку handshake: получение init → аутентификация → отправка connected
    - Реализовать обработку subscribe/unsubscribe сообщений
    - Реализовать PostgreSQL LISTEN для получения уведомлений
    - Реализовать запуск heartbeat после handshake
    - Реализовать отключение perMessageDeflate для совместимости с прокси
    - _Requirements: 2.3, 2.4, 3.5, 8.2, 12.2_
  
  - [x] 16.2 Написать property-based тест для Property 19 (вызов onError callback)
    - **Property 19: Вызов onError callback при ошибках**
    - **Validates: Requirements 9.1**

- [x] 17. Реализация Graceful Shutdown
  - [x] 17.1 Добавить обработку graceful shutdown в RealtimeWebSocketServer
    - Реализовать обработчики SIGTERM и SIGINT
    - Реализовать отправку closing сообщения всем клиентам
    - Реализовать прекращение приёма новых подключений
    - Реализовать ожидание закрытия всех соединений (timeout 5 секунд)
    - Реализовать закрытие PostgreSQL LISTEN подключения
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  
  - [x] 17.2 Написать property-based тест для Property 20 (closing сообщение при shutdown)
    - **Property 20: Отправка closing сообщения всем клиентам при shutdown**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 10.6**
  
  - [x] 17.3 Написать unit-тест для graceful shutdown
    - Проверить последовательность: SIGTERM → closing сообщения → закрытие соединений
    - _Requirements: 10.1_

- [x] 18. Checkpoint - Проверка серверной части (completed)
  - Убедиться, что все серверные модули работают корректно ✓
  - Запустить все unit и property-based тесты для сервера ✓
  - Проверить, что нет ошибок компиляции TypeScript ✓
  - Спросить пользователя, если возникли вопросы ✓

- [x] 19. Настройка fast-check для property-based тестов
  - [x] 19.1 Создать файл `src/websocket/__tests__/arbitraries.ts` с генераторами
    - Реализовать tokenArbitrary для генерации валидных токенов
    - Реализовать subscriptionTypeArbitrary для типов подписок
    - Реализовать sessionIdArbitrary для ID сессий
    - Реализовать messageArbitrary для сообщений различных типов
    - Реализовать closeCodeArbitrary для кодов закрытия
    - Реализовать eventSequenceArbitrary для последовательностей событий
    - _Requirements: 13.4, 13.5, 13.6_
  
  - [x] 19.2 Создать файл `src/websocket/__tests__/setup.ts` с конфигурацией
    - Настроить минимум 100 итераций на тест
    - Настроить seed для воспроизводимости
    - Настроить timeout для длительных тестов
    - _Requirements: 13.6_

- [x] 20. Интеграционные тесты клиент-сервер
  - [x] 20.1 Написать интеграционный тест для полного handshake
    - Проверить последовательность: connect → init → connected → subscribe
    - _Requirements: 14.1_
  
  - [x] 20.2 Написать интеграционный тест для подписки с уведомлениями
    - Проверить: subscribe → subscription_confirmed → получение уведомления
    - _Requirements: 14.2_
  
  - [x] 20.3 Написать интеграционный тест для переподключения
    - Проверить: разрыв → переподключение → восстановление подписок → отправка очереди
    - _Requirements: 14.3_
  
  - [x] 20.4 Написать интеграционный тест для heartbeat
    - Проверить: ping → pong → соединение остаётся активным
    - _Requirements: 14.4_
  
  - [x] 20.5 Написать интеграционный тест для graceful shutdown
    - Проверить: SIGTERM → closing сообщение → закрытие соединений
    - _Requirements: 10.1, 10.2_

- [x] 21. Обновление существующих файлов
  - [x] 21.1 Удалить старую реализацию PostgresRealtimeClient
    - Сохранить резервную копию старого кода
    - Удалить монолитный код из старого файла
    - _Requirements: 8.1_
  
  - [x] 21.2 Удалить старую реализацию RealtimeWebSocketServer
    - Сохранить резервную копию старого кода
    - Удалить монолитный код из старого файла
    - _Requirements: 8.2_
  
  - [x] 21.3 Обновить импорты в зависимых файлах
    - Обновить импорты в файлах, использующих PostgresRealtimeClient
    - Обновить импорты в файлах, использующих RealtimeWebSocketServer
    - Проверить, что все зависимости корректны

- [-] 22. Финальная проверка и документация
  - [-] 22.1 Запустить все тесты
    - Запустить все unit-тесты
    - Запустить все property-based тесты
    - Запустить все интеграционные тесты
    - Убедиться, что покрытие кода >= 80%
    - _Requirements: 13.5_
  
  - [ ] 22.2 Проверить работу в реальном окружении
    - Запустить клиент и сервер локально
    - Проверить handshake, подписки, уведомления
    - Проверить переподключение при разрыве
    - Проверить graceful shutdown
  
  - [ ] 22.3 Обновить README с инструкциями
    - Описать новую модульную архитектуру
    - Добавить примеры использования клиента
    - Добавить примеры настройки сервера
    - Описать процесс запуска тестов

- [ ] 23. Финальный checkpoint
  - Убедиться, что все задачи выполнены
  - Убедиться, что все тесты проходят
  - Убедиться, что система работает стабильно
  - Спросить пользователя о готовности к деплою

## Примечания

- Все задачи являются обязательными, включая все тесты (property-based, unit, интеграционные)
- Каждая задача ссылается на конкретные требования для отслеживаемости
- Checkpoint задачи обеспечивают инкрементальную валидацию
- Property-based тесты проверяют универсальные свойства корректности (22 свойства)
- Unit-тесты проверяют конкретные примеры и edge cases
- Интеграционные тесты проверяют взаимодействие клиент-сервер
- Все модули следуют принципу "один модуль = один файл"
- Приоритет: сначала базовая инфраструктура, потом функциональность, затем тесты
- Покрытие кода должно быть >= 80%
