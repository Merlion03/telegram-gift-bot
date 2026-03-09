# WebSocket Connection 1006 Fix - Bugfix Design

## Overview

Исправление race condition в `ConnectionManager.connect()`, которое приводит к аномальному закрытию WebSocket соединений с кодом 1006. Проблема возникает из-за конкуренции между обработчиками `handleOpen` и `handleClose`: во время асинхронной задержки 50ms для стабилизации прокси обработчик `handleClose` устанавливает `this.ws = null`, что приводит к невозможности отправки init сообщения.

Решение основано на захвате локальной ссылки на WebSocket instance в начале `handleOpen` и использовании этой ссылки для всех операций handshake, независимо от изменений `this.ws` другими обработчиками.

## Glossary

- **Bug_Condition (C)**: Условие, при котором проявляется баг - когда WebSocket закрывается во время выполнения асинхронного `handleOpen`, до отправки init сообщения
- **Property (P)**: Желаемое поведение - init сообщение должно быть отправлено через захваченную ссылку на WebSocket instance, даже если `this.ws` был изменён обработчиком `handleClose`
- **Preservation**: Существующее поведение нормального handshake, обработки закрытия соединения и переподключения, которое должно остаться неизменным
- **Race Condition**: Состояние гонки между `handleOpen` и `handleClose`, когда `handleClose` очищает `this.ws` до того, как `handleOpen` завершит отправку init сообщения
- **WebSocket Instance**: Конкретный экземпляр объекта WebSocket, созданный при вызове `new WebSocket(wsUrl)`
- **Captured Reference**: Локальная константа, захватывающая ссылку на WebSocket instance в начале `handleOpen` для использования на протяжении всего handshake
- **this.ws**: Поле класса ConnectionManager, хранящее текущий активный WebSocket instance (может быть изменено обработчиком `handleClose`)
- **handleOpen**: Асинхронный обработчик события `open` WebSocket, выполняющий задержку 50ms и отправку init сообщения
- **handleClose**: Обработчик события `close` WebSocket, очищающий `this.ws` и обновляющий состояние на `disconnected`
- **Init Message**: Первое сообщение от клиента к серверу типа `{type: 'init'}`, начинающее handshake протокол
- **Proxy Stabilization Delay**: Задержка 50ms после открытия WebSocket для стабилизации работы прокси-серверов (nginx, ngrok)

## Bug Details

### Fault Condition

Баг проявляется, когда WebSocket соединение закрывается во время выполнения асинхронного обработчика `handleOpen`, конкретно во время задержки 50ms для стабилизации прокси. Обработчик `handleClose` устанавливает `this.ws = null`, и последующая попытка отправить init сообщение через `this.send()` завершается неудачей, так как метод проверяет `this.ws?.readyState`.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type {wsInstance: WebSocket, closeEvent: CloseEvent, timingMs: number}
  OUTPUT: boolean
  
  RETURN wsInstance.readyState === WebSocket.OPEN
         AND closeEvent.occurredDuring === 'handleOpen_proxyDelay'
         AND timingMs >= 0 AND timingMs <= 50
         AND this.ws === null (после handleClose)
         AND initMessage.sent === false
END FUNCTION
```

### Examples

- **Пример 1**: WebSocket открывается → начинается задержка 50ms → на 20ms соединение закрывается → `handleClose` устанавливает `this.ws = null` → через 30ms `handleOpen` пытается отправить init → `this.send()` возвращает `false` (ожидается: init должен быть отправлен через захваченную ссылку)

- **Пример 2**: WebSocket открывается → начинается задержка 50ms → на 45ms соединение закрывается → `handleClose` очищает `this.ws` → через 5ms `handleOpen` пытается отправить init → сообщение не отправляется (ожидается: проверка `wsInstance.readyState === OPEN` и отправка через захваченную ссылку)

- **Пример 3**: WebSocket открывается → начинается задержка 50ms → на 10ms соединение закрывается → `handleClose` устанавливает `this.ws = null` → через 40ms `handleOpen` пытается отправить init → логи показывают `hasWs: false, readyState: undefined` (ожидается: логи должны показывать работу с захваченной ссылкой и проверку её `readyState`)

- **Edge case**: WebSocket открывается → задержка 50ms завершается → init отправляется успешно → соединение закрывается сразу после отправки → `handleClose` корректно очищает `this.ws` (ожидается: нормальное поведение, баг не проявляется)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Нормальный handshake процесс: открытие соединения → задержка 50ms → отправка init → получение connected → переход в состояние `connected`
- Обработка нормального закрытия соединения с кодом 1000 без попыток переподключения
- Обработка аномального закрытия с кодом 1006 после успешного handshake с инициацией переподключения
- Задержка 50ms для стабилизации прокси должна сохраниться
- Обработчик `handleClose` должен продолжать устанавливать состояние `disconnected`, очищать `this.ws` и вызывать пользовательские обработчики
- Метод `send()` должен продолжать проверять состояние соединения перед отправкой и возвращать `false` если соединение не активно

**Scope:**
Все сценарии, которые НЕ включают закрытие WebSocket во время задержки 50ms в `handleOpen`, должны быть полностью не затронуты этим исправлением. Это включает:
- Успешный handshake без преждевременного закрытия
- Закрытие соединения после завершения handshake
- Отправку обычных сообщений через `send()` после установки соединения
- Обработку ошибок WebSocket
- Переподключение после разрыва соединения

## Hypothesized Root Cause

На основе анализа бага и логов, наиболее вероятные причины:

1. **Shared Mutable State**: Использование `this.ws` как общего изменяемого состояния между асинхронными обработчиками `handleOpen` и `handleClose` создаёт race condition. Обработчик `handleClose` может изменить `this.ws` в любой момент, включая время выполнения асинхронных операций в `handleOpen`.

2. **Отсутствие Instance Isolation**: Обработчик `handleOpen` не захватывает ссылку на конкретный WebSocket instance в начале выполнения, полагаясь на `this.ws`, который может быть изменён другими обработчиками. Это нарушает изоляцию между операциями над конкретным экземпляром сокета.

3. **Неправильная Проверка в send()**: Метод `send()` проверяет `this.ws?.readyState`, но не принимает WebSocket instance как параметр. Это делает невозможным отправку сообщения через конкретный instance, если `this.ws` был очищен.

4. **Отсутствие Instance Comparison в handleClose**: Обработчик `handleClose` безусловно очищает `this.ws`, не проверяя, является ли закрывающийся сокет тем же экземпляром, что хранится в `this.ws`. Это может привести к очистке `this.ws`, даже если уже создан новый WebSocket instance.

## Correctness Properties

Property 1: Fault Condition - Init Message Sent via Captured Reference

_For any_ WebSocket connection where the socket closes during the 50ms proxy stabilization delay in handleOpen, the fixed handleOpen function SHALL send the init message using a captured local reference to the WebSocket instance, checking the captured instance's readyState directly, ensuring the message is sent if that specific instance is still in OPEN state, regardless of changes to this.ws by handleClose.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Normal Handshake and Connection Lifecycle

_For any_ WebSocket connection that does NOT close during the 50ms proxy stabilization delay (normal handshake scenario), the fixed code SHALL produce exactly the same behavior as the original code, preserving successful handshake completion, state transitions, heartbeat monitoring, normal closure handling, and reconnection logic.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Предполагая, что наш анализ корневой причины верен:

**File**: `nextjs-app/lib/websocket/client/ConnectionManager.ts`

**Function**: `connect()` → обработчик `handleOpen`

**Specific Changes**:

1. **Захват локальной ссылки на WebSocket instance**:
   - В начале `handleOpen`, сразу после входа в функцию, захватить ссылку на WebSocket instance в локальную константу
   - Использовать `const wsInstance = this.ws!` для гарантии работы с конкретным экземпляром
   - Это обеспечит изоляцию операций handshake от изменений `this.ws` другими обработчиками

2. **Модификация метода send() для поддержки прямой передачи WebSocket instance**:
   - Добавить опциональный параметр `ws?: WebSocket` в сигнатуру метода `send()`
   - Если параметр `ws` передан, использовать его вместо `this.ws`
   - Проверять `ws.readyState === WebSocket.OPEN` для переданного instance
   - Сохранить обратную совместимость: если `ws` не передан, использовать `this.ws` как раньше

3. **Использование захваченной ссылки для отправки init сообщения**:
   - После задержки 50ms вызывать `this.send(initMessage, wsInstance)` вместо `this.send(initMessage)`
   - Это гарантирует отправку через конкретный WebSocket instance, даже если `this.ws` был изменён

4. **Проверка readyState захваченного instance**:
   - Перед вызовом `this.send()` добавить проверку `wsInstance.readyState === WebSocket.OPEN`
   - Логировать состояние захваченного instance для диагностики
   - Если instance уже закрыт, пропустить отправку init сообщения (соединение уже недействительно)

5. **Сравнение экземпляров в handleClose**:
   - В начале `handleClose` добавить проверку `if (this.ws !== event.target) return;`
   - Это предотвратит очистку `this.ws`, если закрывается старый WebSocket instance, а `this.ws` уже указывает на новый
   - Очищать `this.ws` только если закрывающийся сокет - это текущий активный сокет

6. **Улучшение логирования для диагностики**:
   - Добавить логи с информацией о захваченном WebSocket instance
   - Логировать `wsInstance.readyState` перед отправкой init сообщения
   - Логировать сравнение экземпляров в `handleClose`

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала выявить контрпримеры, демонстрирующие баг на неисправленном коде, затем проверить, что исправление работает корректно и сохраняет существующее поведение.

### Exploratory Fault Condition Checking

**Goal**: Выявить контрпримеры, демонстрирующие баг ДО внедрения исправления. Подтвердить или опровергнуть анализ корневой причины. Если опровергнем, потребуется пересмотр гипотезы.

**Test Plan**: Написать тесты, симулирующие закрытие WebSocket во время задержки 50ms в `handleOpen`. Использовать моки для контроля времени выполнения и событий WebSocket. Запустить тесты на НЕИСПРАВЛЕННОМ коде для наблюдения сбоев и понимания корневой причины.

**Test Cases**:
1. **Race Condition During Proxy Delay**: Симулировать открытие WebSocket → начать задержку 50ms → вызвать событие `close` на 25ms → проверить, что init сообщение не отправлено (будет сбой на неисправленном коде)
2. **Close at Start of Delay**: Симулировать открытие WebSocket → начать задержку 50ms → вызвать событие `close` на 0ms → проверить, что `this.ws === null` и init не отправлен (будет сбой на неисправленном коде)
3. **Close at End of Delay**: Симулировать открытие WebSocket → начать задержку 50ms → вызвать событие `close` на 49ms → проверить, что init не отправлен из-за `this.ws === null` (будет сбой на неисправленном коде)
4. **Multiple Close Events**: Симулировать открытие WebSocket → вызвать событие `close` дважды во время задержки → проверить корректность обработки (может выявить дополнительные проблемы на неисправленном коде)

**Expected Counterexamples**:
- Init сообщение не отправляется, когда `handleClose` вызывается во время задержки 50ms
- Логи показывают `hasWs: false, readyState: undefined` в момент попытки отправки
- Возможные причины: `this.ws` установлен в `null` обработчиком `handleClose`, метод `send()` не может работать с захваченной ссылкой

### Fix Checking

**Goal**: Проверить, что для всех входных данных, где выполняется условие бага, исправленная функция производит ожидаемое поведение.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  wsInstance := capturedWebSocketReference
  result := handleOpen_fixed(wsInstance)
  ASSERT initMessage.sent === true OR wsInstance.readyState !== OPEN
  ASSERT send() используется с wsInstance параметром
  ASSERT handleClose не влияет на отправку init через wsInstance
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех входных данных, где условие бага НЕ выполняется, исправленная функция производит тот же результат, что и оригинальная функция.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleOpen_original(input) = handleOpen_fixed(input)
  ASSERT нормальный handshake работает идентично
  ASSERT обработка закрытия после handshake идентична
  ASSERT переподключение работает идентично
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев по всему входному домену
- Выявляет граничные случаи, которые могут быть упущены в ручных unit тестах
- Предоставляет сильные гарантии, что поведение не изменилось для всех не-багованных входных данных

**Test Plan**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для нормальных сценариев handshake, затем написать property-based тесты, захватывающие это поведение.

**Test Cases**:
1. **Normal Handshake Preservation**: Наблюдать, что нормальный handshake (без закрытия во время задержки) работает корректно на неисправленном коде, затем написать тест для проверки, что это продолжает работать после исправления
2. **Post-Handshake Close Preservation**: Наблюдать, что закрытие соединения после успешного handshake обрабатывается корректно на неисправленном коде, затем написать тест для проверки сохранения этого поведения
3. **Reconnection Logic Preservation**: Наблюдать, что логика переподключения работает корректно на неисправленном коде, затем написать тест для проверки, что она продолжает работать идентично
4. **Send Method Preservation**: Наблюдать, что метод `send()` без параметра `ws` работает как раньше, проверяя `this.ws`

### Unit Tests

- Тест захвата локальной ссылки на WebSocket instance в начале `handleOpen`
- Тест отправки init сообщения через захваченную ссылку при `wsInstance.readyState === OPEN`
- Тест пропуска отправки init сообщения, если `wsInstance.readyState !== OPEN`
- Тест сравнения экземпляров в `handleClose` перед очисткой `this.ws`
- Тест модифицированного метода `send()` с опциональным параметром `ws`
- Тест обратной совместимости `send()` без параметра `ws`
- Тест граничного случая: закрытие сразу после открытия (0ms)
- Тест граничного случая: закрытие в конце задержки (49ms)

### Property-Based Tests

- Генерировать случайные тайминги закрытия WebSocket (0-50ms) во время задержки и проверять, что init отправляется через захваченную ссылку, если instance всё ещё OPEN
- Генерировать случайные последовательности событий WebSocket (open, close, error) и проверять корректность обработки race conditions
- Генерировать случайные сценарии нормального handshake и проверять, что поведение идентично оригинальному коду
- Тестировать, что все не-race-condition сценарии продолжают работать корректно после исправления

### Integration Tests

- Тест полного flow: открытие соединения → race condition во время задержки → init отправлен через захваченную ссылку → handshake завершён успешно
- Тест полного flow: открытие соединения → нормальная задержка 50ms → init отправлен → connected получен → состояние `connected`
- Тест полного flow: открытие соединения → закрытие во время задержки → init не отправлен (instance закрыт) → переподключение инициировано
- Тест взаимодействия между `handleOpen`, `handleClose` и `send()` в различных сценариях race conditions
