# WebSocket Notify Fix - Технический Дизайн

## Обзор

Исправление критического бага с доставкой real-time уведомлений о новых сообщениях через WebSocket. Триггер PostgreSQL `notify_new_message()` отправляет уведомления в канал `new_message`, но `NotificationRouter` не обрабатывает этот канал, что приводит к потере всех уведомлений. Клиенты вынуждены обновлять страницу (F5) для получения новых сообщений.

**Подход к исправлению:** Добавить обработку канала `new_message` в метод `createMessageFromPayload()` класса `NotificationRouter` с последующей маршрутизацией уведомлений к подписчикам соответствующих каналов `session_*` и `all_messages`.

## Глоссарий

- **Bug_Condition (C)**: Условие, при котором проявляется баг - триггер отправляет уведомление в канал `new_message`
- **Property (P)**: Желаемое поведение - уведомления из канала `new_message` должны доставляться подписчикам `session_*` и `all_messages`
- **Preservation**: Существующая обработка каналов `session_status_change` и `session_type_change` должна остаться неизменной
- **NotificationRouter**: Класс в `nextjs-app/lib/websocket/server/NotificationRouter.ts`, отвечающий за маршрутизацию уведомлений от PostgreSQL к WebSocket клиентам
- **SubscriptionRegistry**: Реестр подписок клиентов на каналы, используется для поиска подписчиков
- **pg_notify**: Механизм PostgreSQL для отправки асинхронных уведомлений через каналы LISTEN/NOTIFY
- **session_id**: Идентификатор сессии чата, используется для маршрутизации сообщений к конкретным клиентам

## Детали Бага

### Условие Возникновения Бага (Fault Condition)

Баг проявляется, когда триггер PostgreSQL отправляет уведомление о новом сообщении в канал `new_message`. Метод `NotificationRouter.createMessageFromPayload()` не распознаёт этот канал и возвращает `null`, что приводит к потере уведомления.

**Формальная Спецификация:**
```
FUNCTION isBugCondition(notification)
  INPUT: notification типа { channel: string, payload: PostgresNewMessagePayload }
  OUTPUT: boolean
  
  RETURN notification.channel === 'new_message'
         AND notification.payload.session_id EXISTS
         AND notification.payload.id EXISTS
         AND notification.payload.message_text EXISTS
         AND NOT isProcessedByRouter(notification)
END FUNCTION
```

### Примеры

- **Пример 1**: Пользователь отправляет сообщение "Привет" боту в Telegram → триггер отправляет уведомление в канал `new_message` с `session_id: 5` → `NotificationRouter` логирует "⚠️ Неизвестный канал: new_message" → клиент, подписанный на `session_5`, не получает уведомление → сообщение появляется только после F5

- **Пример 2**: Админ открыл чат с сессией ID=10 → подписался на канал `session` с `sessionId: 10` → сервер зарегистрировал подписку на `session_10` → пользователь отправляет сообщение → триггер отправляет в `new_message` → уведомление теряется

- **Пример 3**: Админ подписан на канал `all` (маппится в `all_messages`) → пользователь отправляет сообщение в любую сессию → триггер отправляет в `new_message` → уведомление теряется, хотя админ должен был его получить

- **Граничный случай**: Триггер отправляет уведомление в `new_message` для сессии, на которую никто не подписан → система должна корректно обработать отсутствие подписчиков без ошибок


## Ожидаемое Поведение

### Требования к Сохранению (Preservation Requirements)

**Неизменное Поведение:**
- Обработка канала `session_status_change` через маппинг в `status_changes` должна продолжать работать без изменений
- Обработка канала `session_type_change` через маппинг в `type_changes` должна продолжать работать без изменений
- Клиенты, подписанные на канал `all` (маппится в `all_messages`), должны продолжать получать уведомления об изменениях статуса и типа
- Логирование информационных сообщений при отсутствии подписчиков должно работать как раньше
- WebSocket heartbeat (ping-pong) механизм не должен быть затронут
- Загрузка истории сообщений при обновлении страницы (F5) должна работать как раньше

**Область Действия:**
Все уведомления, которые НЕ приходят через канал `new_message`, должны обрабатываться абсолютно идентично текущей реализации. Это включает:
- Уведомления об изменении статуса сессии (`session_status_change`)
- Уведомления об изменении типа сессии (`session_type_change`)
- Прямые уведомления в каналы `session_*`, `all_messages`, `status_changes` (если они когда-либо будут использоваться)
- Обработка ошибок парсинга JSON payload
- Обработка невалидных payload (отсутствие обязательных полей)

## Гипотеза Корневой Причины

На основе анализа кода выявлены следующие проблемы:

1. **Отсутствие Обработки Канала `new_message`**: Метод `NotificationRouter.createMessageFromPayload()` проверяет только каналы `all_messages`, `session_*`, `status_changes`, `type_changes`. Канал `new_message` не обрабатывается, что приводит к возврату `null` и логированию предупреждения.

2. **Несоответствие Между Триггером и Router**: Триггер `notify_new_message()` в файле `telegram-bot/database/migrations/005_realtime_triggers.sql` отправляет уведомления в канал `new_message`, но этот канал не документирован в константах `CHANNEL_PREFIXES` и не обрабатывается в коде.

3. **Отсутствие Маршрутизации к Подписчикам**: Даже если бы канал обрабатывался, необходима логика для определения, каким подписчикам отправлять уведомление. Уведомление содержит `session_id` в payload, который нужно использовать для маршрутизации к подписчикам `session_*` и `all_messages`.

4. **Структура Payload Триггера**: Триггер отправляет payload с вложенной структурой:
   ```json
   {
     "operation": "INSERT",
     "table": "support_messages",
     "session_id": 5,
     "message_id": 123,
     "data": {
       "id": 123,
       "session_id": 5,
       "telegram_id": 987654321,
       "message_type": "text",
       "message_text": "Привет",
       "file_id": null,
       "created_at": "2024-01-15T10:30:00Z",
       "delivered": false
     }
   }
   ```
   Эта структура отличается от ожидаемой `PostgresNewMessagePayload`, которая используется для каналов `all_messages` и `session_*`.


## Свойства Корректности (Correctness Properties)

Property 1: Fault Condition - Обработка Канала new_message

_Для любого_ уведомления, где канал равен `new_message` и payload содержит валидные поля `session_id`, `message_id` и `data`, исправленный метод `createMessageFromPayload()` ДОЛЖЕН создать корректное сообщение типа `NewMessageMessage` и маршрутизировать его к подписчикам каналов `session_<session_id>` и `all_messages`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Обработка Существующих Каналов

_Для любого_ уведомления, где канал НЕ равен `new_message` (т.е. `session_status_change`, `session_type_change`, `all_messages`, `session_*`, `status_changes`, `type_changes`), исправленный код ДОЛЖЕН производить абсолютно идентичный результат, что и оригинальный код, сохраняя всю существующую функциональность обработки уведомлений.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Реализация Исправления

### Необходимые Изменения

Исходя из корректности гипотезы корневой причины:

**Файл**: `nextjs-app/lib/websocket/server/NotificationRouter.ts`

**Метод**: `createMessageFromPayload(channel: string, payload: any): ServerMessage | null`

**Конкретные Изменения**:

1. **Добавить Обработку Канала `new_message`**: В метод `createMessageFromPayload()` добавить новый case для канала `new_message` перед проверкой кастомных обработчиков:
   ```typescript
   // 5. Канал new_message - уведомление от триггера PostgreSQL
   if (channel === 'new_message') {
     return this.createNewMessageFromTrigger(payload);
   }
   ```

2. **Создать Новый Приватный Метод `createNewMessageFromTrigger()`**: Этот метод будет обрабатывать специфическую структуру payload от триггера и извлекать данные из вложенного объекта `data`:
   ```typescript
   private createNewMessageFromTrigger(payload: any): NewMessageMessage | null {
     try {
       // Валидация структуры payload от триггера
       if (!payload.session_id || !payload.message_id || !payload.data) {
         console.error(`[NotificationRouter] ❌ Невалидный payload от триггера new_message:`, payload);
         return null;
       }
       
       const data = payload.data;
       
       // Валидация обязательных полей в data
       if (!data.id || !data.session_id || !data.message_text || !data.created_at) {
         console.error(`[NotificationRouter] ❌ Невалидные данные в payload.data:`, data);
         return null;
       }
       
       // Определяем sender_type на основе message_type или других полей
       const senderType = this.determineSenderType(data);
       
       return {
         type: 'new_message',
         data: {
           id: data.id,
           session_id: data.session_id,
           sender_type: senderType,
           message_text: data.message_text,
           created_at: data.created_at,
           is_read: false, // Новые сообщения всегда непрочитанные
         },
       };
     } catch (error) {
       console.error(`[NotificationRouter] ❌ Ошибка обработки триггера new_message:`, error);
       return null;
     }
   }
   ```

3. **Создать Вспомогательный Метод `determineSenderType()`**: Метод для определения типа отправителя на основе доступных данных:
   ```typescript
   private determineSenderType(data: any): 'user' | 'admin' {
     // Логика определения: если есть telegram_id, то это user, иначе admin
     return data.telegram_id ? 'user' : 'admin';
   }
   ```

4. **Добавить Маршрутизацию к Нескольким Каналам**: Модифицировать метод `handleNotification()` для поддержки маршрутизации одного уведомления к нескольким каналам:
   ```typescript
   async handleNotification(channel: string, payload: string): Promise<void> {
     // ... существующий код парсинга ...
     
     const message = this.createMessageFromPayload(channel, parsedPayload);
     
     if (!message) {
       console.warn(`[NotificationRouter] ⚠️ Не удалось определить тип уведомления для канала: ${channel}`);
       return;
     }
     
     // Определяем целевые каналы для маршрутизации
     const targetChannels = this.getTargetChannels(channel, parsedPayload);
     
     // Отправляем уведомление всем целевым каналам
     for (const targetChannel of targetChannels) {
       await this.broadcastToSubscribers(targetChannel, message);
     }
   }
   ```

5. **Создать Метод `getTargetChannels()`**: Метод для определения списка каналов, которым нужно отправить уведомление:
   ```typescript
   private getTargetChannels(channel: string, payload: any): string[] {
     // Для канала new_message маршрутизируем к session_* и all_messages
     if (channel === 'new_message' && payload.session_id) {
       return [
         `session_${payload.session_id}`,
         'all_messages'
       ];
     }
     
     // Для всех остальных каналов - маршрутизация 1:1
     return [channel];
   }
   ```


## Стратегия Тестирования

### Подход к Валидации

Стратегия тестирования следует двухфазному подходу: сначала выявить контрпримеры, демонстрирующие баг на неисправленном коде, затем проверить, что исправление работает корректно и сохраняет существующее поведение.

### Исследовательская Проверка Условия Бага (Exploratory Fault Condition Checking)

**Цель**: Выявить контрпримеры, демонстрирующие баг ДО реализации исправления. Подтвердить или опровергнуть анализ корневой причины. Если опровергнем - потребуется пересмотр гипотезы.

**План Тестирования**: Написать тесты, которые эмулируют отправку уведомления от триггера PostgreSQL в канал `new_message` и проверяют, что уведомление НЕ доставляется подписчикам. Запустить эти тесты на НЕИСПРАВЛЕННОМ коде для наблюдения сбоев и понимания корневой причины.

**Тестовые Случаи**:

1. **Тест Обработки Канала new_message**: Эмулировать уведомление в канал `new_message` с валидным payload → ожидается, что `createMessageFromPayload()` вернёт `null` и залогирует предупреждение (провалится на неисправленном коде)

2. **Тест Маршрутизации к session_***: Подписать клиента на `session_5` → эмулировать уведомление в `new_message` с `session_id: 5` → ожидается, что клиент НЕ получит уведомление (провалится на неисправленном коде)

3. **Тест Маршрутизации к all_messages**: Подписать клиента на `all_messages` → эмулировать уведомление в `new_message` → ожидается, что клиент НЕ получит уведомление (провалится на неисправленном коде)

4. **Тест Структуры Payload**: Эмулировать уведомление с вложенной структурой `data` от триггера → ожидается, что парсинг не сработает корректно (может провалиться на неисправленном коде)

**Ожидаемые Контрпримеры**:
- Метод `createMessageFromPayload()` возвращает `null` для канала `new_message`
- Логируется предупреждение "⚠️ Неизвестный канал: new_message"
- Подписчики `session_*` и `all_messages` не получают уведомления
- Возможные причины: отсутствие обработки канала, неправильная структура payload, отсутствие маршрутизации

### Проверка Исправления (Fix Checking)

**Цель**: Проверить, что для всех входных данных, где выполняется условие бага, исправленная функция производит ожидаемое поведение.

**Псевдокод:**
```
FOR ALL notification WHERE isBugCondition(notification) DO
  message := createMessageFromPayload_fixed(notification.channel, notification.payload)
  ASSERT message IS NOT NULL
  ASSERT message.type === 'new_message'
  ASSERT message.data.session_id === notification.payload.session_id
  
  targetChannels := getTargetChannels_fixed(notification.channel, notification.payload)
  ASSERT targetChannels CONTAINS `session_${notification.payload.session_id}`
  ASSERT targetChannels CONTAINS 'all_messages'
END FOR
```

**План Тестирования**: После реализации исправления запустить тесты, которые проверяют:
- Канал `new_message` корректно обрабатывается
- Создаётся валидное сообщение `NewMessageMessage`
- Уведомление маршрутизируется к подписчикам `session_*` и `all_messages`
- Подписчики получают уведомление в реальном времени

### Проверка Сохранения (Preservation Checking)

**Цель**: Проверить, что для всех входных данных, где условие бага НЕ выполняется, исправленная функция производит идентичный результат оригинальной функции.

**Псевдокод:**
```
FOR ALL notification WHERE NOT isBugCondition(notification) DO
  ASSERT createMessageFromPayload_original(notification.channel, notification.payload) 
         === createMessageFromPayload_fixed(notification.channel, notification.payload)
  
  ASSERT getTargetChannels_original(notification.channel, notification.payload)
         === getTargetChannels_fixed(notification.channel, notification.payload)
END FOR
```

**Подход к Тестированию**: Property-based тестирование рекомендуется для проверки сохранения, потому что:
- Автоматически генерирует множество тестовых случаев по всему домену входных данных
- Выявляет граничные случаи, которые могут быть упущены в ручных unit-тестах
- Предоставляет строгие гарантии, что поведение не изменилось для всех небагованных входных данных

**План Тестирования**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для существующих каналов, затем написать property-based тесты, фиксирующие это поведение.

**Тестовые Случаи**:

1. **Сохранение Обработки status_changes**: Наблюдать, что уведомления в канал `session_status_change` корректно обрабатываются на неисправленном коде → написать тест для проверки идентичного поведения после исправления

2. **Сохранение Обработки type_changes**: Наблюдать, что уведомления в канал `session_type_change` корректно обрабатываются на неисправленном коде → написать тест для проверки идентичного поведения после исправления

3. **Сохранение Обработки all_messages**: Наблюдать, что прямые уведомления в канал `all_messages` (если используются) корректно обрабатываются → написать тест для проверки идентичного поведения

4. **Сохранение Обработки session_***: Наблюдать, что прямые уведомления в каналы `session_*` (если используются) корректно обрабатываются → написать тест для проверки идентичного поведения

5. **Сохранение Обработки Ошибок**: Проверить, что невалидные payload и отсутствующие поля обрабатываются идентично


### Unit Tests

- Тест обработки канала `new_message` с валидным payload от триггера
- Тест обработки канала `new_message` с невалидным payload (отсутствие обязательных полей)
- Тест метода `createNewMessageFromTrigger()` с различными структурами данных
- Тест метода `determineSenderType()` для корректного определения типа отправителя
- Тест метода `getTargetChannels()` для канала `new_message` (должен вернуть `session_*` и `all_messages`)
- Тест метода `getTargetChannels()` для других каналов (должен вернуть исходный канал)
- Тест маршрутизации уведомления к нескольким каналам одновременно
- Тест сохранения обработки существующих каналов (`status_changes`, `type_changes`)
- Тест обработки граничных случаев (отсутствие подписчиков, невалидный session_id)

### Property-Based Tests

- Генерация случайных уведомлений в канал `new_message` с различными `session_id` → проверка корректной маршрутизации к соответствующим подписчикам
- Генерация случайных уведомлений в существующие каналы (`status_changes`, `type_changes`) → проверка идентичности поведения до и после исправления
- Генерация случайных конфигураций подписчиков на различные каналы → проверка корректной доставки уведомлений только целевым подписчикам
- Генерация случайных payload с различными структурами → проверка устойчивости к невалидным данным
- Тестирование множественных одновременных уведомлений → проверка отсутствия race conditions и корректной обработки всех уведомлений

### Integration Tests

- Полный flow: эмуляция INSERT в таблицу `support_messages` → триггер отправляет уведомление в `new_message` → NotificationRouter обрабатывает → подписчики `session_*` и `all_messages` получают уведомление
- Тест переключения между сессиями: клиент подписывается на `session_5` → получает уведомление → отписывается → подписывается на `session_10` → получает уведомление для новой сессии
- Тест множественных подписчиков: несколько клиентов подписаны на `all_messages` и различные `session_*` → все получают соответствующие уведомления
- Тест визуальной обратной связи: уведомление приходит → фронтенд отображает новое сообщение в чате без обновления страницы
- Тест совместной работы с другими типами уведомлений: одновременная отправка уведомлений о новом сообщении, изменении статуса и типа → все корректно обрабатываются
