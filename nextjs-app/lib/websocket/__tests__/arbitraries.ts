/**
 * Fast-check arbitraries для property-based тестирования WebSocket архитектуры
 * Генераторы для создания валидных тестовых данных
 */

import * as fc from 'fast-check';
import {
  ClientMessage,
  ServerMessage,
  SubscriptionType,
  ConnectionState,
  InitMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  ConnectedMessage,
  SubscriptionConfirmedMessage,
  NewMessageMessage,
  StatusChangeMessage,
  TypeChangeMessage,
  ErrorMessage,
  ClosingMessage,
} from '../types';
import {
  ALL_CLOSE_CODES,
  NO_RECONNECT_CODES,
  ERROR_CODES,
  CHANNEL_PREFIXES,
} from '../constants';

// ============================================================================
// Базовые генераторы
// ============================================================================

/**
 * Генератор валидных JWT токенов (упрощённая версия для тестов)
 */
export const tokenArbitrary = fc.oneof(
  // Валидный токен (base64url строка с точками)
  fc.tuple(
    fc.stringMatching(/^[A-Za-z0-9_-]+$/),
    fc.stringMatching(/^[A-Za-z0-9_-]+$/),
    fc.stringMatching(/^[A-Za-z0-9_-]+$/)
  ).map(([header, payload, signature]) => `${header}.${payload}.${signature}`),
  
  // Невалидный токен для негативных тестов
  fc.constantFrom('', 'invalid', 'too.short', 'no-dots-here')
);

/**
 * Генератор типов подписок
 */
export const subscriptionTypeArbitrary: fc.Arbitrary<SubscriptionType> = fc.constantFrom(
  'session' as const,
  'all' as const,
  'status' as const
);

/**
 * Генератор ID сессий (положительные целые числа)
 */
export const sessionIdArbitrary = fc.integer({ min: 1, max: 1_000_000 });

/**
 * Генератор ID подписок (UUID-подобные строки)
 */
export const subscriptionIdArbitrary = fc.uuid();

/**
 * Генератор ID клиентов
 */
export const clientIdArbitrary = fc.uuid();

/**
 * Генератор кодов закрытия WebSocket
 */
export const closeCodeArbitrary = fc.constantFrom(
  ...Object.values(ALL_CLOSE_CODES)
);

/**
 * Генератор кодов закрытия, при которых НЕ нужно переподключаться
 */
export const noReconnectCloseCodeArbitrary = fc.constantFrom(
  ...NO_RECONNECT_CODES
);

/**
 * Генератор кодов закрытия, при которых НУЖНО переподключаться
 */
export const reconnectCloseCodeArbitrary = closeCodeArbitrary.filter(
  (code) => !NO_RECONNECT_CODES.includes(code as any)
);

/**
 * Генератор кодов ошибок приложения
 */
export const errorCodeArbitrary = fc.constantFrom(
  ...Object.values(ERROR_CODES)
);

/**
 * Генератор состояний соединения
 */
export const connectionStateArbitrary: fc.Arbitrary<ConnectionState> = fc.constantFrom(
  'disconnected' as const,
  'connecting' as const,
  'connected' as const,
  'reconnecting' as const
);

/**
 * Генератор имён каналов
 */
export const channelNameArbitrary = fc.oneof(
  // session_<id>
  sessionIdArbitrary.map((id) => `${CHANNEL_PREFIXES.SESSION}${id}`),
  
  // all_messages
  fc.constant(CHANNEL_PREFIXES.ALL_MESSAGES),
  
  // status_changes
  fc.constant(CHANNEL_PREFIXES.STATUS_CHANGES)
);

// ============================================================================
// Генераторы сообщений клиента
// ============================================================================

/**
 * Генератор init сообщения
 */
export const initMessageArbitrary: fc.Arbitrary<InitMessage> = fc.constant({
  type: 'init' as const,
});

/**
 * Генератор subscribe сообщения
 */
export const subscribeMessageArbitrary: fc.Arbitrary<SubscribeMessage> = fc.record({
  type: fc.constant('subscribe' as const),
  channel: subscriptionTypeArbitrary,
  sessionId: fc.option(sessionIdArbitrary, { nil: undefined }),
  subscriptionId: subscriptionIdArbitrary,
});

/**
 * Генератор unsubscribe сообщения
 */
export const unsubscribeMessageArbitrary: fc.Arbitrary<UnsubscribeMessage> = fc.record({
  type: fc.constant('unsubscribe' as const),
  subscriptionId: subscriptionIdArbitrary,
});

/**
 * Генератор любого сообщения от клиента
 */
export const clientMessageArbitrary: fc.Arbitrary<ClientMessage> = fc.oneof(
  initMessageArbitrary,
  subscribeMessageArbitrary,
  unsubscribeMessageArbitrary
);

// ============================================================================
// Генераторы сообщений сервера
// ============================================================================

/**
 * Генератор connected сообщения
 */
export const connectedMessageArbitrary: fc.Arbitrary<ConnectedMessage> = fc.record({
  type: fc.constant('connected' as const),
  clientId: clientIdArbitrary,
});

/**
 * Генератор subscription_confirmed сообщения
 */
export const subscriptionConfirmedMessageArbitrary: fc.Arbitrary<SubscriptionConfirmedMessage> = fc.record({
  type: fc.constant('subscription_confirmed' as const),
  subscriptionId: subscriptionIdArbitrary,
  channel: channelNameArbitrary,
});

/**
 * Генератор new_message сообщения
 */
export const newMessageMessageArbitrary: fc.Arbitrary<NewMessageMessage> = fc.record({
  type: fc.constant('new_message' as const),
  data: fc.record({
    id: fc.integer({ min: 1, max: 1_000_000 }),
    session_id: sessionIdArbitrary,
    sender_type: fc.constantFrom('user' as const, 'admin' as const),
    message_text: fc.string({ minLength: 1, maxLength: 1000 }),
    created_at: fc.date().map((d) => d.toISOString()),
    is_read: fc.boolean(),
  }),
});

/**
 * Генератор status_change сообщения
 */
export const statusChangeMessageArbitrary: fc.Arbitrary<StatusChangeMessage> = fc.record({
  type: fc.constant('status_change' as const),
  sessionId: sessionIdArbitrary,
  oldStatus: fc.constantFrom('open', 'in_progress', 'resolved', 'closed'),
  newStatus: fc.constantFrom('open', 'in_progress', 'resolved', 'closed'),
});

/**
 * Генератор type_change сообщения
 */
export const typeChangeMessageArbitrary: fc.Arbitrary<TypeChangeMessage> = fc.record({
  type: fc.constant('type_change' as const),
  sessionId: sessionIdArbitrary,
  oldType: fc.constantFrom('question', 'issue', 'feedback', 'other'),
  newType: fc.constantFrom('question', 'issue', 'feedback', 'other'),
});

/**
 * Генератор error сообщения
 */
export const errorMessageArbitrary: fc.Arbitrary<ErrorMessage> = fc.record({
  type: fc.constant('error' as const),
  code: errorCodeArbitrary,
  message: fc.string({ minLength: 1, maxLength: 200 }),
  subscriptionId: fc.option(subscriptionIdArbitrary, { nil: undefined }),
});

/**
 * Генератор closing сообщения
 */
export const closingMessageArbitrary: fc.Arbitrary<ClosingMessage> = fc.record({
  type: fc.constant('closing' as const),
  reason: fc.constantFrom(
    'server shutdown',
    'maintenance',
    'restart',
    'overloaded'
  ),
});

/**
 * Генератор любого сообщения от сервера
 */
export const serverMessageArbitrary: fc.Arbitrary<ServerMessage> = fc.oneof(
  connectedMessageArbitrary,
  subscriptionConfirmedMessageArbitrary,
  newMessageMessageArbitrary,
  statusChangeMessageArbitrary,
  typeChangeMessageArbitrary,
  errorMessageArbitrary,
  closingMessageArbitrary
);

// ============================================================================
// Генераторы последовательностей событий
// ============================================================================

/**
 * Тип события в последовательности
 */
export type EventType =
  | { type: 'connect' }
  | { type: 'disconnect'; code: number }
  | { type: 'send'; message: ClientMessage }
  | { type: 'receive'; message: ServerMessage }
  | { type: 'error'; error: string }
  | { type: 'delay'; ms: number };

/**
 * Генератор события подключения
 */
const connectEventArbitrary: fc.Arbitrary<EventType> = fc.constant({
  type: 'connect' as const,
});

/**
 * Генератор события отключения
 */
const disconnectEventArbitrary: fc.Arbitrary<EventType> = fc.record({
  type: fc.constant('disconnect' as const),
  code: closeCodeArbitrary,
});

/**
 * Генератор события отправки сообщения
 */
const sendEventArbitrary: fc.Arbitrary<EventType> = fc.record({
  type: fc.constant('send' as const),
  message: clientMessageArbitrary,
});

/**
 * Генератор события получения сообщения
 */
const receiveEventArbitrary: fc.Arbitrary<EventType> = fc.record({
  type: fc.constant('receive' as const),
  message: serverMessageArbitrary,
});

/**
 * Генератор события ошибки
 */
const errorEventArbitrary: fc.Arbitrary<EventType> = fc.record({
  type: fc.constant('error' as const),
  error: fc.string({ minLength: 1, maxLength: 100 }),
});

/**
 * Генератор события задержки
 */
const delayEventArbitrary: fc.Arbitrary<EventType> = fc.record({
  type: fc.constant('delay' as const),
  ms: fc.integer({ min: 10, max: 1000 }),
});

/**
 * Генератор одного события
 */
export const eventArbitrary: fc.Arbitrary<EventType> = fc.oneof(
  connectEventArbitrary,
  disconnectEventArbitrary,
  sendEventArbitrary,
  receiveEventArbitrary,
  errorEventArbitrary,
  delayEventArbitrary
);

/**
 * Генератор последовательности событий
 * Гарантирует валидную последовательность (например, connect перед send)
 */
export const eventSequenceArbitrary = fc
  .array(eventArbitrary, { minLength: 1, maxLength: 20 })
  .map((events) => {
    // Фильтруем невалидные последовательности
    const validEvents: EventType[] = [];
    let isConnected = false;

    for (const event of events) {
      if (event.type === 'connect') {
        if (!isConnected) {
          validEvents.push(event);
          isConnected = true;
        }
      } else if (event.type === 'disconnect') {
        if (isConnected) {
          validEvents.push(event);
          isConnected = false;
        }
      } else if (event.type === 'send' || event.type === 'receive') {
        // Можно отправлять/получать только когда подключены
        if (isConnected) {
          validEvents.push(event);
        }
      } else {
        // error и delay можно всегда
        validEvents.push(event);
      }
    }

    return validEvents.length > 0 ? validEvents : [{ type: 'connect' as const }];
  });

/**
 * Генератор валидной handshake последовательности
 */
export const handshakeSequenceArbitrary = fc.tuple(
  tokenArbitrary,
  clientIdArbitrary
).map(([token, clientId]) => [
  { type: 'connect' as const },
  { type: 'send' as const, message: { type: 'init' as const } },
  { type: 'receive' as const, message: { type: 'connected' as const, clientId } },
]);

/**
 * Генератор последовательности подписки
 */
export const subscriptionSequenceArbitrary = fc.tuple(
  subscriptionTypeArbitrary,
  sessionIdArbitrary,
  subscriptionIdArbitrary,
  channelNameArbitrary
).map(([channel, sessionId, subscriptionId, channelName]) => [
  {
    type: 'send' as const,
    message: {
      type: 'subscribe' as const,
      channel,
      sessionId: channel === 'session' ? sessionId : undefined,
      subscriptionId,
    },
  },
  {
    type: 'receive' as const,
    message: {
      type: 'subscription_confirmed' as const,
      subscriptionId,
      channel: channelName,
    },
  },
]);

/**
 * Генератор последовательности переподключения
 */
export const reconnectionSequenceArbitrary = fc.tuple(
  reconnectCloseCodeArbitrary,
  fc.integer({ min: 1, max: 5 })
).map(([closeCode, attempts]) => {
  const sequence: EventType[] = [
    { type: 'connect' as const },
    { type: 'disconnect' as const, code: closeCode },
  ];

  for (let i = 0; i < attempts; i++) {
    sequence.push({ type: 'delay' as const, ms: Math.pow(2, i) * 1000 });
    sequence.push({ type: 'connect' as const });
  }

  return sequence;
});

// ============================================================================
// Генераторы для тестирования очереди сообщений
// ============================================================================

/**
 * Генератор массива сообщений для очереди
 */
export const messageQueueArbitrary = fc.array(
  clientMessageArbitrary.filter((msg) => msg.type !== 'subscribe' && msg.type !== 'unsubscribe'),
  { minLength: 0, maxLength: 150 } // Больше лимита для тестирования переполнения
);

/**
 * Генератор массива подписок
 */
export const subscriptionsArrayArbitrary = fc.array(
  fc.record({
    id: subscriptionIdArbitrary,
    channel: subscriptionTypeArbitrary,
    sessionId: fc.option(sessionIdArbitrary, { nil: undefined }),
  }),
  { minLength: 0, maxLength: 10 }
);

// ============================================================================
// Генераторы для тестирования метрик
// ============================================================================

/**
 * Генератор метрик
 */
export const metricsArbitrary = fc.record({
  totalConnections: fc.nat({ max: 10_000 }),
  activeConnections: fc.nat({ max: 1_000 }),
  totalNotifications: fc.nat({ max: 100_000 }),
  totalErrors: fc.nat({ max: 1_000 }),
  totalPongsReceived: fc.nat({ max: 100_000 }),
  lastNotificationAt: fc.option(fc.date(), { nil: null }),
});

// ============================================================================
// Утилиты для тестирования
// ============================================================================

/**
 * Генератор задержки в миллисекундах
 */
export const delayMsArbitrary = fc.integer({ min: 0, max: 5000 });

/**
 * Генератор timestamp
 */
export const timestampArbitrary = fc.date().map((d) => d.getTime());

/**
 * Генератор булевого значения с заданной вероятностью true
 */
export const biasedBooleanArbitrary = (trueProbability: number) =>
  fc.integer({ min: 0, max: 99 }).map((n) => n < trueProbability * 100);
