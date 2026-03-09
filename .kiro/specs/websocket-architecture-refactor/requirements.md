# Требования к переработке WebSocket архитектуры

## Введение

Текущая реализация WebSocket соединения страдает от критической проблемы: соединение постоянно закрывается с кодом 1006 (abnormal close) сразу после успешной аутентификации. Проблема не решается уже 20 часов работы. Необходима полная переработка архитектуры с устранением всех выявленных проблем и внедрением надёжных паттернов для стабильной работы real-time коммуникации.

## Глоссарий

- **WebSocket_Client** - клиентская часть WebSocket соединения (PostgresRealtimeClient.ts)
- **WebSocket_Server** - серверная часть WebSocket соединения (RealtimeWebSocketServer.ts)
- **Handshake_Protocol** - протокол установки соединения между клиентом и сервером
- **Connection_Lifecycle** - жизненный цикл WebSocket соединения от установки до закрытия
- **Heartbeat_Mechanism** - механизм проверки активности соединения через ping/pong
- **Reconnection_Strategy** - стратегия автоматического переподключения при разрыве соединения
- **Message_Queue** - очередь сообщений для отправки при восстановлении соединения
- **Subscription_Manager** - менеджер подписок на каналы уведомлений
- **Authentication_Flow** - процесс аутентификации WebSocket соединения
- **State_Manager** - менеджер состояния соединения и подписок

## Требования

### Требование 1: Стабильное WebSocket соединение

**User Story:** Как пользователь системы, я хочу иметь стабильное WebSocket соединение без аномальных закрытий, чтобы получать real-time уведомления без перерывов.

#### Критерии приёмки

1. WHEN WebSocket соединение установлено, THE WebSocket_Client SHALL поддерживать соединение открытым без аномальных закрытий (код 1006)
2. WHEN соединение установлено успешно, THE WebSocket_Server SHALL НЕ закрывать соединение преждевременно
3. THE Connection_Lifecycle SHALL включать чёткие фазы: connecting → authenticating → connected → active
4. WHEN происходит нормальное закрытие, THE WebSocket_Client SHALL использовать код 1000 (normal closure)
5. WHEN происходит ошибка, THE WebSocket_Client SHALL использовать соответствующий код закрытия (не 1006)

### Требование 2: Правильный Handshake протокол

**User Story:** Как разработчик, я хочу иметь надёжный handshake протокол, чтобы избежать race conditions между аутентификацией и установкой соединения.

#### Критерии приёмки

1. THE Handshake_Protocol SHALL использовать паттерн "Client speaks first" (клиент инициирует handshake)
2. WHEN WebSocket соединение открыто, THE WebSocket_Client SHALL отправить init сообщение первым
3. WHEN WebSocket_Server получает init сообщение, THE WebSocket_Server SHALL выполнить аутентификацию
4. WHEN аутентификация успешна, THE WebSocket_Server SHALL отправить connected сообщение
5. WHEN WebSocket_Client получает connected сообщение, THE WebSocket_Client SHALL перейти в состояние 'connected'
6. THE Handshake_Protocol SHALL включать задержку 50ms после HTTP Upgrade для стабилизации прокси
7. WHEN аутентификация не пройдена, THE WebSocket_Server SHALL закрыть соединение с кодом 4401 (Unauthorized)

### Требование 3: Надёжный Heartbeat механизм

**User Story:** Как система, я хочу автоматически обнаруживать "зависшие" соединения, чтобы своевременно их переподключать.

#### Критерии приёмки

1. THE Heartbeat_Mechanism SHALL использовать WebSocket ping/pong frames (не JSON сообщения)
2. THE WebSocket_Server SHALL отправлять ping frames каждые 30 секунд
3. WHEN WebSocket_Client получает ping frame, THE WebSocket_Client SHALL автоматически ответить pong frame
4. WHEN WebSocket_Server НЕ получает pong в течение 60 секунд, THE WebSocket_Server SHALL закрыть соединение
5. THE Heartbeat_Mechanism SHALL запускаться ТОЛЬКО после получения connected сообщения
6. THE Heartbeat_Mechanism SHALL останавливаться при закрытии соединения

### Требование 4: Умная стратегия переподключения

**User Story:** Как пользователь, я хочу автоматическое переподключение при разрыве соединения, чтобы не терять real-time уведомления.

#### Критерии приёмки

1. WHEN соединение закрывается аномально, THE Reconnection_Strategy SHALL автоматически переподключиться
2. THE Reconnection_Strategy SHALL использовать экспоненциальную задержку (1s, 2s, 4s, 8s, ..., max 30s)
3. WHEN переподключение успешно, THE Reconnection_Strategy SHALL восстановить все активные подписки
4. WHEN переподключение успешно, THE Reconnection_Strategy SHALL отправить сообщения из очереди
5. THE Reconnection_Strategy SHALL НЕ переподключаться при нормальном закрытии (код 1000)
6. THE Reconnection_Strategy SHALL НЕ переподключаться при ошибке аутентификации (коды 4401, 4403)
7. WHEN пользователь не авторизован, THE Reconnection_Strategy SHALL НЕ пытаться переподключиться

### Требование 5: Менеджер подписок

**User Story:** Как разработчик, я хочу централизованное управление подписками, чтобы легко подписываться и отписываться от каналов.

#### Критерии приёмки

1. THE Subscription_Manager SHALL хранить все активные подписки в Map структуре
2. WHEN клиент подписывается на канал, THE Subscription_Manager SHALL сохранить подписку с уникальным ID
3. WHEN соединение восстанавливается, THE Subscription_Manager SHALL автоматически восстановить все подписки
4. WHEN клиент отписывается, THE Subscription_Manager SHALL удалить подписку и уведомить сервер
5. THE Subscription_Manager SHALL поддерживать три типа подписок: session, all, status
6. WHEN подписка подтверждена сервером, THE Subscription_Manager SHALL вызвать callback подтверждения

### Требование 6: Очередь сообщений

**User Story:** Как система, я хочу сохранять сообщения при разрыве соединения, чтобы отправить их после переподключения.

#### Критерии приёмки

1. WHEN соединение разорвано, THE Message_Queue SHALL сохранять исходящие сообщения
2. THE Message_Queue SHALL иметь максимальный размер 100 сообщений
3. WHEN очередь заполнена, THE Message_Queue SHALL удалять самые старые сообщения
4. WHEN соединение восстановлено, THE Message_Queue SHALL отправить все сохранённые сообщения
5. THE Message_Queue SHALL НЕ сохранять subscribe/unsubscribe сообщения (они восстанавливаются через Subscription_Manager)
6. WHEN сообщение отправлено успешно, THE Message_Queue SHALL удалить его из очереди

### Требование 7: Менеджер состояния соединения

**User Story:** Как разработчик, я хочу отслеживать состояние соединения, чтобы корректно обрабатывать операции в зависимости от состояния.

#### Критерии приёмки

1. THE State_Manager SHALL поддерживать состояния: disconnected, connecting, connected, reconnecting
2. WHEN состояние меняется, THE State_Manager SHALL уведомить все заинтересованные компоненты
3. THE State_Manager SHALL предоставлять метод isConnected() для проверки активного соединения
4. THE State_Manager SHALL предоставлять метод getConnectionState() для получения текущего состояния
5. WHEN WebSocket readyState === OPEN И connectionState === 'connected', THE State_Manager SHALL вернуть true из isConnected()
6. THE State_Manager SHALL синхронизировать внутреннее состояние с WebSocket readyState

### Требование 8: Модульная архитектура

**User Story:** Как разработчик, я хочу модульную архитектуру с чётким разделением ответственности, чтобы легко поддерживать и расширять систему.

#### Критерии приёмки

1. THE WebSocket_Client SHALL быть разделён на независимые модули: ConnectionManager, SubscriptionManager, MessageQueue, HeartbeatManager
2. THE WebSocket_Server SHALL быть разделён на независимые модули: ConnectionHandler, AuthenticationHandler, NotificationRouter, SubscriptionRegistry
3. EACH модуль SHALL находиться в отдельном файле
4. EACH модуль SHALL иметь чёткую единственную ответственность (Single Responsibility Principle)
5. THE модули SHALL взаимодействовать через чётко определённые интерфейсы
6. THE модули SHALL быть независимо тестируемыми

### Требование 9: Обработка ошибок

**User Story:** Как пользователь, я хочу получать понятные сообщения об ошибках, чтобы понимать причину проблем с соединением.

#### Критерии приёмки

1. WHEN происходит ошибка, THE WebSocket_Client SHALL вызвать onError callback с описательным сообщением
2. WHEN аутентификация не пройдена, THE WebSocket_Server SHALL отправить сообщение с кодом ошибки и описанием
3. WHEN подписка отклонена, THE WebSocket_Server SHALL отправить error сообщение с причиной
4. THE система SHALL логировать все критические ошибки с полным контекстом
5. THE система SHALL использовать структурированное логирование с timestamp, clientId, userId
6. WHEN происходит критическая ошибка, THE система SHALL инкрементировать метрику totalErrors

### Требование 10: Graceful Shutdown

**User Story:** Как администратор, я хочу корректное завершение работы сервера, чтобы не терять данные и не обрывать соединения резко.

#### Критерии приёмки

1. WHEN сервер получает SIGTERM или SIGINT, THE WebSocket_Server SHALL начать graceful shutdown
2. WHEN начинается shutdown, THE WebSocket_Server SHALL отправить closing сообщение всем клиентам
3. WHEN начинается shutdown, THE WebSocket_Server SHALL прекратить принимать новые подключения
4. WHEN начинается shutdown, THE WebSocket_Server SHALL дождаться закрытия всех соединений (timeout 5 секунд)
5. WHEN начинается shutdown, THE WebSocket_Server SHALL закрыть PostgreSQL LISTEN подключение
6. WHEN все соединения закрыты, THE WebSocket_Server SHALL завершить процесс с кодом 0

### Требование 11: Метрики и мониторинг

**User Story:** Как администратор, я хочу видеть метрики работы WebSocket сервера, чтобы отслеживать его состояние и производительность.

#### Критерии приёмки

1. THE WebSocket_Server SHALL собирать метрики: totalConnections, activeConnections, totalNotifications, totalErrors
2. THE WebSocket_Server SHALL логировать метрики каждые 60 секунд
3. THE WebSocket_Server SHALL предоставлять метод getMetrics() для получения текущих метрик
4. WHEN происходит событие, THE WebSocket_Server SHALL обновить соответствующую метрику
5. THE метрики SHALL включать timestamp последнего уведомления (lastNotificationAt)
6. THE метрики SHALL включать количество полученных pong ответов (totalPongsReceived)

### Требование 12: Совместимость с прокси

**User Story:** Как система, я хочу корректно работать через прокси (nginx, ngrok), чтобы поддерживать production окружение.

#### Критерии приёмки

1. THE WebSocket_Client SHALL добавлять задержку 50ms после HTTP Upgrade для стабилизации прокси
2. THE WebSocket_Server SHALL отключить perMessageDeflate для упрощения обработки frames прокси
3. THE Handshake_Protocol SHALL учитывать время переключения прокси в TCP-режим
4. WHEN используется прокси, THE система SHALL корректно обрабатывать заголовки X-Forwarded-For
5. THE WebSocket_Server SHALL логировать информацию о прокси (clientIp, origin, userAgent)
6. THE система SHALL корректно работать через HTTP и HTTPS прокси

### Требование 13: Тестируемость

**User Story:** Как разработчик, я хочу иметь возможность тестировать WebSocket функциональность, чтобы гарантировать корректность работы.

#### Критерии приёмки

1. THE WebSocket_Client SHALL предоставлять методы для тестирования: testConnection(), getConnectionState()
2. THE WebSocket_Server SHALL предоставлять методы для тестирования: getMetrics(), getWebSocketServer()
3. THE модули SHALL быть изолированы для unit-тестирования
4. THE система SHALL поддерживать mock объекты для WebSocket и PostgreSQL
5. THE тесты SHALL покрывать все критические сценарии: handshake, reconnection, heartbeat, subscriptions
6. THE тесты SHALL использовать property-based testing для проверки инвариантов

### Требование 14: Round-trip тестирование протокола

**User Story:** Как разработчик, я хочу проверять корректность протокола через round-trip тесты, чтобы гарантировать совместимость клиента и сервера.

#### Критерии приёмки

1. FOR ALL валидных handshake последовательностей, отправка init → получение connected → отправка subscribe SHALL завершиться успешно
2. FOR ALL валидных подписок, отправка subscribe → получение subscription_confirmed → получение уведомлений SHALL работать корректно
3. FOR ALL сценариев переподключения, разрыв соединения → переподключение → восстановление подписок SHALL восстановить состояние
4. FOR ALL heartbeat циклов, отправка ping → получение pong SHALL поддерживать соединение активным
5. THE round-trip тесты SHALL проверять сохранение инвариантов на всех этапах протокола
6. THE round-trip тесты SHALL использовать property-based testing для генерации тестовых сценариев
