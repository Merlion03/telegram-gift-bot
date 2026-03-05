# Requirements Document

## Введение

Данная спецификация описывает замену Supabase Realtime на нативный PostgreSQL LISTEN/NOTIFY механизм для real-time обновлений в админ-панели. Текущая реализация использует внешний WebSocket сервер Supabase, что вызывает CSP (Content Security Policy) ошибки в браузере и создаёт зависимость от внешнего сервиса. Новая реализация будет использовать прямое подключение к PostgreSQL и собственный WebSocket сервер для передачи уведомлений клиентам.

## Глоссарий

- **PostgreSQL_LISTEN_NOTIFY**: Нативный механизм PostgreSQL для асинхронных уведомлений между процессами
- **WebSocket_Server**: Серверный компонент, обеспечивающий двустороннюю связь с браузером через WebSocket протокол
- **Database_Trigger**: Триггер PostgreSQL, автоматически выполняющийся при INSERT/UPDATE/DELETE операциях
- **Notification_Channel**: Именованный канал для передачи уведомлений через LISTEN/NOTIFY
- **Realtime_Client**: Клиентский компонент в браузере, подключающийся к WebSocket серверу
- **Admin_Panel**: Веб-интерфейс администратора для управления сессиями поддержки
- **Support_Session**: Сессия общения пользователя со службой поддержки (таблица support_sessions)
- **Support_Message**: Сообщение в рамках сессии поддержки (таблица support_messages)
- **Session_Type**: Тип сессии - 'chat' (обычный диалог с ботом) или 'support' (диалог с администратором)
- **Message_Type**: Тип сообщения - 'from_user', 'from_support', 'from_bot'
- **API_Route**: Next.js API endpoint для обработки HTTP запросов
- **Connection_Pool**: Пул подключений к PostgreSQL для эффективного управления соединениями

## Требования

### Requirement 1: Database Triggers для уведомлений

**User Story:** Как система, я хочу автоматически отправлять уведомления при изменениях в базе данных, чтобы клиенты получали real-time обновления без polling.

#### Acceptance Criteria

1. WHEN новое сообщение вставляется в таблицу support_messages, THE Database_Trigger SHALL отправить уведомление в Notification_Channel 'new_message' с payload содержащим session_id и message_id
2. WHEN статус сессии обновляется в таблице support_sessions, THE Database_Trigger SHALL отправить уведомление в Notification_Channel 'session_status_change' с payload содержащим session_id и новый status
3. WHEN тип сессии изменяется с 'chat' на 'support' в таблице support_sessions, THE Database_Trigger SHALL отправить уведомление в Notification_Channel 'session_type_change' с payload содержащим session_id и новый session_type
4. THE Database_Trigger SHALL форматировать payload как JSON строку с полями operation, table, session_id и данными изменённой записи
5. IF триггер выполняется для операции DELETE, THEN THE Database_Trigger SHALL использовать OLD запись для формирования payload

### Requirement 2: WebSocket Server для клиентских подключений

**User Story:** Как администратор, я хочу получать real-time обновления в браузере, чтобы видеть новые сообщения и изменения статусов без перезагрузки страницы.

#### Acceptance Criteria

1. THE WebSocket_Server SHALL принимать WebSocket подключения от клиентов на endpoint '/api/realtime'
2. WHEN клиент подключается, THE WebSocket_Server SHALL аутентифицировать клиента используя session token
3. WHEN клиент отправляет subscribe сообщение с session_id, THE WebSocket_Server SHALL добавить клиента в список подписчиков для данной сессии
4. WHEN клиент отправляет subscribe сообщение без session_id, THE WebSocket_Server SHALL добавить клиента в список подписчиков на все сообщения
5. WHEN клиент отправляет unsubscribe сообщение, THE WebSocket_Server SHALL удалить клиента из соответствующего списка подписчиков
6. WHEN WebSocket соединение закрывается, THE WebSocket_Server SHALL автоматически удалить клиента из всех списков подписчиков
7. THE WebSocket_Server SHALL поддерживать heartbeat механизм с ping/pong сообщениями каждые 30 секунд
8. IF клиент не отвечает на ping в течение 60 секунд, THEN THE WebSocket_Server SHALL закрыть соединение

### Requirement 3: PostgreSQL LISTEN подписка на сервере

**User Story:** Как WebSocket сервер, я хочу получать уведомления от PostgreSQL, чтобы транслировать их подключённым клиентам.

#### Acceptance Criteria

1. THE WebSocket_Server SHALL создать выделенное PostgreSQL подключение для LISTEN операций при старте сервера
2. THE WebSocket_Server SHALL выполнить LISTEN команду для каналов 'new_message', 'session_status_change' и 'session_type_change'
3. WHEN уведомление получено от PostgreSQL, THE WebSocket_Server SHALL распарсить JSON payload
4. WHEN уведомление типа 'new_message' получено, THE WebSocket_Server SHALL загрузить полные данные сообщения из таблицы support_messages
5. WHEN уведомление типа 'session_status_change' или 'session_type_change' получено, THE WebSocket_Server SHALL загрузить полные данные сессии из таблицы support_sessions
6. THE WebSocket_Server SHALL отправить уведомление всем подписанным клиентам через WebSocket
7. IF загрузка данных из базы завершается ошибкой, THEN THE WebSocket_Server SHALL логировать ошибку и пропустить уведомление

### Requirement 4: Фильтрация уведомлений по подпискам

**User Story:** Как администратор, я хочу получать только релевантные уведомления для открытых сессий, чтобы не перегружать интерфейс лишней информацией.

#### Acceptance Criteria

1. WHEN клиент подписан на конкретную сессию, THE WebSocket_Server SHALL отправлять клиенту только уведомления для этой session_id
2. WHEN клиент подписан на все сообщения, THE WebSocket_Server SHALL отправлять клиенту все уведомления о новых сообщениях независимо от session_id
3. THE WebSocket_Server SHALL отправлять уведомления об изменении статуса сессии всем клиентам, подписанным на эту сессию
4. THE WebSocket_Server SHALL отправлять уведомления об изменении типа сессии всем клиентам, подписанным на эту сессию
5. THE WebSocket_Server SHALL поддерживать множественные подписки от одного клиента на разные сессии

### Requirement 5: Realtime Client в браузере

**User Story:** Как компонент React, я хочу иметь простой API для подписки на real-time обновления, чтобы легко интегрироваться с существующим кодом.

#### Acceptance Criteria

1. THE Realtime_Client SHALL предоставлять метод subscribeToSessionMessages(sessionId, onMessage, onError) с той же сигнатурой, что и текущий SupabaseRealtimeClient
2. THE Realtime_Client SHALL предоставлять метод subscribeToAllMessages(onMessage, onError) с той же сигнатурой, что и текущий SupabaseRealtimeClient
3. THE Realtime_Client SHALL предоставлять метод subscribeToSessionStatusChanges(onStatusChange, onError) с той же сигнатурой, что и текущий SupabaseRealtimeClient
4. WHEN метод подписки вызывается, THE Realtime_Client SHALL установить WebSocket соединение с сервером, если оно ещё не установлено
5. WHEN метод подписки вызывается, THE Realtime_Client SHALL отправить subscribe сообщение на сервер с соответствующими параметрами
6. WHEN уведомление получено от сервера, THE Realtime_Client SHALL вызвать соответствующий callback с данными уведомления
7. THE Realtime_Client SHALL автоматически переподключаться при разрыве соединения с экспоненциальной задержкой (1s, 2s, 4s, 8s, максимум 30s)
8. WHEN метод подписки возвращает функцию отписки, THE Realtime_Client SHALL отправить unsubscribe сообщение при её вызове
9. IF WebSocket соединение не может быть установлено, THEN THE Realtime_Client SHALL вызвать onError callback с описанием ошибки

### Requirement 6: Обратная совместимость с существующим кодом

**User Story:** Как разработчик, я хочу заменить Supabase клиент без изменения компонентов React, чтобы минимизировать риск регрессии.

#### Acceptance Criteria

1. THE Realtime_Client SHALL экспортироваться из того же модуля '@/lib/database/supabaseClient', что и текущий SupabaseRealtimeClient
2. THE Realtime_Client SHALL иметь метод getInstance() для получения singleton instance
3. THE Realtime_Client SHALL иметь метод unsubscribeAll() для отписки от всех каналов
4. THE Realtime_Client SHALL преобразовывать данные от сервера в тип SupportMessage с теми же полями, что и текущая реализация
5. THE Realtime_Client SHALL обрабатывать ошибки подключения и передавать их в onError callback так же, как текущая реализация
6. THE Realtime_Client SHALL логировать события подписки/отписки в консоль так же, как текущая реализация

### Requirement 7: Управление подключениями к PostgreSQL

**User Story:** Как система, я хочу эффективно управлять подключениями к PostgreSQL, чтобы избежать утечек ресурсов и обеспечить стабильную работу.

#### Acceptance Criteria

1. THE WebSocket_Server SHALL использовать отдельное PostgreSQL подключение для LISTEN операций, не входящее в Connection_Pool
2. THE WebSocket_Server SHALL переподключаться к PostgreSQL при разрыве LISTEN соединения с задержкой 5 секунд
3. WHEN WebSocket_Server останавливается, THE WebSocket_Server SHALL корректно закрыть LISTEN подключение к PostgreSQL
4. THE WebSocket_Server SHALL использовать Connection_Pool для запросов данных сообщений и сессий
5. THE WebSocket_Server SHALL логировать все события подключения/отключения от PostgreSQL
6. IF LISTEN подключение разрывается более 3 раз подряд, THEN THE WebSocket_Server SHALL логировать критическую ошибку

### Requirement 8: Безопасность и аутентификация

**User Story:** Как система, я хочу обеспечить безопасность WebSocket подключений, чтобы только авторизованные администраторы получали real-time обновления.

#### Acceptance Criteria

1. WHEN клиент подключается к WebSocket_Server, THE WebSocket_Server SHALL проверить наличие валидного session token в cookies или query параметрах
2. IF session token отсутствует или невалиден, THEN THE WebSocket_Server SHALL отклонить WebSocket подключение с кодом 401
3. THE WebSocket_Server SHALL использовать NextAuth для валидации session token
4. THE WebSocket_Server SHALL проверять, что пользователь имеет роль администратора перед принятием подключения
5. THE WebSocket_Server SHALL логировать все попытки подключения с указанием user_id и результата аутентификации

### Requirement 9: Мониторинг и логирование

**User Story:** Как DevOps инженер, я хочу иметь подробные логи работы real-time системы, чтобы быстро диагностировать проблемы.

#### Acceptance Criteria

1. THE WebSocket_Server SHALL логировать каждое новое WebSocket подключение с timestamp, client_id и user_id
2. THE WebSocket_Server SHALL логировать каждое отключение клиента с причиной (нормальное закрытие, timeout, ошибка)
3. THE WebSocket_Server SHALL логировать каждое полученное уведомление от PostgreSQL с типом и session_id
4. THE WebSocket_Server SHALL логировать количество активных WebSocket подключений каждые 60 секунд
5. THE WebSocket_Server SHALL логировать ошибки отправки уведомлений клиентам с указанием client_id и текста ошибки
6. THE WebSocket_Server SHALL предоставлять метрики для мониторинга: количество активных подключений, количество отправленных уведомлений, количество ошибок

### Requirement 10: Graceful Shutdown

**User Story:** Как система, я хочу корректно завершать работу WebSocket сервера при остановке приложения, чтобы не терять данные и не оставлять висячие подключения.

#### Acceptance Criteria

1. WHEN процесс получает сигнал SIGTERM или SIGINT, THE WebSocket_Server SHALL начать процедуру graceful shutdown
2. WHEN graceful shutdown начинается, THE WebSocket_Server SHALL прекратить принимать новые WebSocket подключения
3. WHEN graceful shutdown начинается, THE WebSocket_Server SHALL отправить close сообщение всем подключённым клиентам с кодом 1001 (going away)
4. THE WebSocket_Server SHALL ожидать закрытия всех клиентских подключений в течение 10 секунд
5. WHEN все клиенты отключены или истёк timeout, THE WebSocket_Server SHALL закрыть LISTEN подключение к PostgreSQL
6. THE WebSocket_Server SHALL логировать завершение graceful shutdown с количеством корректно закрытых подключений

### Requirement 11: Тестирование и надёжность

**User Story:** Как разработчик, я хочу иметь автоматические тесты для real-time системы, чтобы гарантировать её корректную работу.

#### Acceptance Criteria

1. THE система SHALL иметь unit тесты для Database_Trigger, проверяющие корректность формирования JSON payload
2. THE система SHALL иметь integration тесты для WebSocket_Server, проверяющие подключение, подписку и получение уведомлений
3. THE система SHALL иметь тесты для Realtime_Client, проверяющие автоматическое переподключение при разрыве соединения
4. THE система SHALL иметь property-based тесты для проверки round-trip свойства: INSERT в базу → уведомление → данные в клиенте совпадают с INSERT
5. THE система SHALL иметь тесты для проверки фильтрации уведомлений по session_id
6. THE система SHALL иметь тесты для проверки обработки множественных одновременных подключений (минимум 100 клиентов)
7. THE система SHALL иметь тесты для проверки graceful shutdown

### Requirement 12: Производительность

**User Story:** Как система, я хочу обеспечить низкую задержку доставки уведомлений, чтобы администраторы видели сообщения практически мгновенно.

#### Acceptance Criteria

1. WHEN новое сообщение вставляется в базу данных, THE система SHALL доставить уведомление клиенту в течение 500ms в 95% случаев
2. THE WebSocket_Server SHALL поддерживать минимум 100 одновременных WebSocket подключений без деградации производительности
3. THE WebSocket_Server SHALL обрабатывать минимум 1000 уведомлений в секунду без потери данных
4. THE Database_Trigger SHALL выполняться менее чем за 10ms для каждой операции INSERT/UPDATE
5. THE Realtime_Client SHALL использовать не более 5MB памяти в браузере при 10 активных подписках

### Requirement 13: Миграция с Supabase Realtime

**User Story:** Как DevOps инженер, я хочу иметь план миграции с Supabase на PostgreSQL LISTEN/NOTIFY, чтобы выполнить переход без простоя.

#### Acceptance Criteria

1. THE система SHALL предоставлять SQL скрипт миграции для создания Database_Trigger в существующей базе данных
2. THE система SHALL поддерживать feature flag для переключения между Supabase и PostgreSQL реализациями
3. WHEN feature flag включён, THE Admin_Panel SHALL использовать новый Realtime_Client вместо SupabaseRealtimeClient
4. THE система SHALL предоставлять скрипт для проверки корректности работы триггеров после миграции
5. THE система SHALL предоставлять rollback план для возврата к Supabase в случае проблем
