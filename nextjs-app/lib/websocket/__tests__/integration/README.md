# Интеграционные тесты WebSocket клиент-сервер

Этот каталог содержит интеграционные тесты для проверки взаимодействия между клиентом и сервером WebSocket.

## Структура тестов

### `handshake.integration.test.ts`
Проверяет полный handshake протокол: connect → init → connected → subscribe

**Требования:** 14.1

**Тесты:**
- Property: Полный handshake round-trip для всех валидных токенов
- Example: Конкретный пример успешного handshake
- Example: Handshake с session подпиской
- Example: Множественные подписки после handshake

### `subscription.integration.test.ts`
Проверяет подписку с получением уведомлений: subscribe → subscription_confirmed → notification

**Требования:** 14.2

**Тесты:**
- Property: Subscription round-trip с уведомлениями
- Example: Получение new_message уведомления
- Example: Получение status_change уведомления
- Example: Множественные уведомления для одной подписки
- Example: Подписка на all_messages

### `reconnection.integration.test.ts`
Проверяет переподключение: разрыв → reconnect → восстановление подписок → отправка очереди

**Требования:** 14.3

**Тесты:**
- Property: Восстановление подписок после переподключения
- Example: Простое переподключение с одной подпиской
- Example: Отправка сообщений из очереди после переподключения
- Example: Множественные переподключения подряд
- Example: Переподключение с множественными подписками

### `heartbeat.integration.test.ts`
Проверяет heartbeat механизм: ping → pong → соединение активно

**Требования:** 14.4

**Тесты:**
- Property: Heartbeat поддерживает соединение активным
- Example: Соединение активно в течение 10 секунд
- Example: Проверка метрик pong на сервере
- Example: Множественные клиенты с heartbeat
- Example: Heartbeat запускается только после handshake
- Example: Heartbeat останавливается при закрытии
- Example: Соединение закрывается при отсутствии pong

### `graceful-shutdown.integration.test.ts`
Проверяет graceful shutdown: SIGTERM → closing message → close connections

**Требования:** 10.1, 10.2

**Тесты:**
- Property: Все клиенты получают closing сообщение при shutdown
- Example: Один клиент получает closing сообщение
- Example: Множественные клиенты при shutdown
- Example: Shutdown с активными подписками
- Example: Shutdown не принимает новые подключения
- Example: Timeout при shutdown

## Запуск тестов

### Все интеграционные тесты
```bash
npm test -- integration
```

### Конкретный файл
```bash
npm test -- handshake.integration.test.ts
npm test -- subscription.integration.test.ts
npm test -- reconnection.integration.test.ts
npm test -- heartbeat.integration.test.ts
npm test -- graceful-shutdown.integration.test.ts
```

### С режимом интеграции (30 итераций, 60s timeout)
```bash
TEST_MODE=integration npm test -- integration
```

## Особенности интеграционных тестов

### Timeout
Все интеграционные тесты имеют увеличенный timeout (120 секунд) для учёта:
- Установки соединения
- Handshake протокола
- Heartbeat циклов
- Переподключений
- Graceful shutdown

### Mock зависимости
Тесты используют mock для:
- PostgreSQL Pool и PoolClient
- PostgreSQL NOTIFY (эмулируется через callbacks)

### Реальные компоненты
Тесты используют реальные:
- WebSocketServer (ws библиотека)
- RealtimeWebSocketServer
- PostgresRealtimeClient
- Все клиентские и серверные модули

### Property-based тесты
Используется конфигурация `integrationFastCheckConfig`:
- 30 итераций (меньше чем обычные тесты)
- 60 секунд timeout
- Генерация валидных токенов, подписок, событий

## Проверяемые сценарии

### Handshake
- ✓ Клиент говорит первым (Client speaks first)
- ✓ Задержка 50ms после HTTP Upgrade
- ✓ Init → Connected → Subscribe последовательность
- ✓ Множественные подписки

### Subscription
- ✓ Subscribe → Subscription_confirmed round-trip
- ✓ Получение new_message уведомлений
- ✓ Получение status_change уведомлений
- ✓ Получение type_change уведомлений
- ✓ Множественные уведомления
- ✓ Подписки на session, all, status каналы

### Reconnection
- ✓ Автоматическое переподключение при аномальном закрытии
- ✓ Восстановление всех подписок
- ✓ Отправка сообщений из очереди
- ✓ Множественные переподключения
- ✓ Экспоненциальная задержка

### Heartbeat
- ✓ Ping/Pong frames (не JSON)
- ✓ Соединение остаётся активным
- ✓ Метрики pong на сервере
- ✓ Множественные клиенты
- ✓ Запуск после handshake
- ✓ Остановка при закрытии
- ✓ Timeout при отсутствии pong

### Graceful Shutdown
- ✓ Closing сообщение всем клиентам
- ✓ Закрытие всех соединений
- ✓ Shutdown с активными подписками
- ✓ Отказ в новых подключениях
- ✓ Timeout при shutdown

## Отладка

### Воспроизведение ошибок
Если property-based тест падает, используйте seed:

```bash
FAST_CHECK_SEED=1234567890 npm test -- handshake.integration.test.ts
```

### Verbose режим
```bash
DEBUG=* npm test -- integration
```

### Проверка конкретного сценария
Используйте `.only` для запуска одного теста:

```typescript
it.only('должен выполнить handshake', async () => {
  // ...
});
```

## Требования к окружению

- Node.js >= 18
- WebSocket сервер (ws)
- PostgreSQL (mock в тестах)
- fast-check для property-based тестов
- Jest для test runner

## Известные ограничения

1. **PostgreSQL NOTIFY эмулируется** - реальные уведомления от PostgreSQL не тестируются
2. **Heartbeat интервалы сокращены** - для ускорения тестов используются меньшие интервалы
3. **Timeout тесты длительные** - тесты с проверкой timeout могут занимать до 80 секунд

## Метрики покрытия

Интеграционные тесты покрывают:
- ✓ Все критические пути взаимодействия клиент-сервер
- ✓ Все требования из секции 14 (Round-trip тестирование)
- ✓ Graceful shutdown (требования 10.1, 10.2)
- ✓ Property-based проверки для всех сценариев
- ✓ Конкретные примеры для edge cases
