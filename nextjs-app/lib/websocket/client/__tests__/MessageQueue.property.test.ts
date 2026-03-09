import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { MessageQueue } from '../MessageQueue';
import type { ClientMessage } from '../../types';

const initMessageArbitrary = fc.constant<ClientMessage>({ type: 'init' });

const subscribeMessageArbitrary = fc.record({
  type: fc.constant('subscribe' as const),
  channel: fc.constantFrom('session' as const, 'all' as const, 'status' as const),
  sessionId: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
  subscriptionId: fc.uuid(),
});

const unsubscribeMessageArbitrary = fc.record({
  type: fc.constant('unsubscribe' as const),
  subscriptionId: fc.uuid(),
});

const clientMessageArbitrary = fc.oneof(
  initMessageArbitrary,
  subscribeMessageArbitrary,
  unsubscribeMessageArbitrary
);

const queueableMessageArbitrary = initMessageArbitrary;

describe('MessageQueue - Property-Based Tests', () => {
  describe('Property 13: Буферизация сообщений при разрыве соединения', () => {
    it('должен сохранять все сообщения (кроме subscribe/unsubscribe) в очереди', () => {
      fc.assert(
        fc.property(
          fc.array(clientMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            const expectedCount = messages.filter(
              (msg) => msg.type !== 'subscribe' && msg.type !== 'unsubscribe'
            ).length;
            expect(queue.size()).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять сообщения в порядке FIFO', () => {
      fc.assert(
        fc.property(
          fc.array(initMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            const queuedMessages = queue.getAll();
            expect(queuedMessages).toEqual(messages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать смешанные типы сообщений', () => {
      fc.assert(
        fc.property(
          fc.array(clientMessageArbitrary, { minLength: 10, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            const queuedMessages = queue.getAll();
            queuedMessages.forEach((msg) => {
              expect(msg.type).not.toBe('subscribe');
              expect(msg.type).not.toBe('unsubscribe');
            });
            const originalInitMessages = messages.filter((msg) => msg.type === 'init');
            const queuedInitMessages = queuedMessages.filter((msg) => msg.type === 'init');
            expect(queuedInitMessages).toEqual(originalInitMessages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен отправлять все сохранённые сообщения при flush', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            const sentMessages: ClientMessage[] = [];
            messages.forEach((message) => queue.enqueue(message));
            const sendFn = vi.fn((message: ClientMessage) => {
              sentMessages.push(message);
              return true;
            });
            const sentCount = queue.flush(sendFn);
            expect(sentCount).toBe(messages.length);
            expect(sentMessages).toEqual(messages);
            expect(sendFn).toHaveBeenCalledTimes(messages.length);
            expect(queue.size()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять неотправленные сообщения при частичном сбое', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 2, maxLength: 20 }),
          fc.integer({ min: 0, max: 19 }),
          (messages, failureIndex) => {
            const actualFailureIndex = failureIndex % messages.length;
            const queue = new MessageQueue();
            const sentMessages: ClientMessage[] = [];
            messages.forEach((message) => queue.enqueue(message));
            let callIndex = 0;
            const sendFn = vi.fn((message: ClientMessage) => {
              const currentIndex = callIndex++;
              if (currentIndex >= actualFailureIndex) {
                return false;
              }
              sentMessages.push(message);
              return true;
            });
            const sentCount = queue.flush(sendFn);
            expect(sentCount).toBe(actualFailureIndex);
            expect(sentMessages.length).toBe(actualFailureIndex);
            const remainingCount = messages.length - actualFailureIndex;
            expect(queue.size()).toBe(remainingCount);
            const remainingMessages = queue.getAll();
            expect(remainingMessages).toEqual(messages.slice(actualFailureIndex));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать пустую очередь', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const queue = new MessageQueue();
            const sendFn = vi.fn(() => true);
            const sentCount = queue.flush(sendFn);
            expect(sentCount).toBe(0);
            expect(sendFn).not.toHaveBeenCalled();
            expect(queue.size()).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('должен сохранять состояние очереди между множественными операциями', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              action: fc.constantFrom<'enqueue' | 'flush'>('enqueue', 'flush'),
              messages: fc.array(queueableMessageArbitrary, { minLength: 0, maxLength: 10 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (operations) => {
            const queue = new MessageQueue();
            let expectedMessages: ClientMessage[] = [];
            operations.forEach((op) => {
              if (op.action === 'enqueue') {
                op.messages.forEach((msg) => {
                  queue.enqueue(msg);
                  expectedMessages.push(msg);
                });
              } else if (op.action === 'flush') {
                const sendFn = vi.fn(() => true);
                queue.flush(sendFn);
                expectedMessages = [];
              }
              expect(queue.size()).toBe(expectedMessages.length);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
  describe('Property 14: FIFO при переполнении очереди', () => {
    it('должен удалять самые старые сообщения при переполнении', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 101, max: 200 }),
          (messageCount) => {
            const queue = new MessageQueue(100);
            const messages: ClientMessage[] = [];
            for (let i = 0; i < messageCount; i++) {
              const msg: ClientMessage = { type: 'init' };
              messages.push(msg);
              queue.enqueue(msg);
            }
            expect(queue.size()).toBe(100);
            const queuedMessages = queue.getAll();
            const expectedMessages = messages.slice(messageCount - 100);
            expect(queuedMessages).toEqual(expectedMessages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять FIFO порядок при множественных переполнениях', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.array(queueableMessageArbitrary, { minLength: 1, maxLength: 50 }),
            { minLength: 3, maxLength: 10 }
          ),
          (batches) => {
            const queue = new MessageQueue(100);
            const allMessages: ClientMessage[] = [];
            batches.forEach((batch) => {
              batch.forEach((msg) => {
                allMessages.push(msg);
                queue.enqueue(msg);
              });
            });
            expect(queue.size()).toBeLessThanOrEqual(100);
            const queuedMessages = queue.getAll();
            const expectedMessages = allMessages.slice(Math.max(0, allMessages.length - 100));
            expect(queuedMessages).toEqual(expectedMessages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно работать при точном достижении лимита', () => {
      fc.assert(
        fc.property(
          fc.constant(100),
          (messageCount) => {
            const queue = new MessageQueue(100);
            const messages: ClientMessage[] = [];
            for (let i = 0; i < messageCount; i++) {
              const msg: ClientMessage = { type: 'init' };
              messages.push(msg);
              queue.enqueue(msg);
            }
            expect(queue.size()).toBe(100);
            expect(queue.isFull()).toBe(true);
            const queuedMessages = queue.getAll();
            expect(queuedMessages).toEqual(messages);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('должен удалять по одному старому сообщению за раз при переполнении', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (extraMessages) => {
            const queue = new MessageQueue(100);
            const messages: ClientMessage[] = [];
            for (let i = 0; i < 100 + extraMessages; i++) {
              const msg: ClientMessage = { type: 'init' };
              messages.push(msg);
              queue.enqueue(msg);
              expect(queue.size()).toBeLessThanOrEqual(100);
            }
            expect(queue.size()).toBe(100);
            const queuedMessages = queue.getAll();
            expect(queuedMessages).toEqual(messages.slice(extraMessages));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  describe('Property 15: Фильтрация subscribe/unsubscribe в очереди', () => {
    it('НЕ должен сохранять subscribe сообщения в очереди', () => {
      fc.assert(
        fc.property(
          fc.array(subscribeMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            expect(queue.size()).toBe(0);
            expect(queue.getAll()).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('НЕ должен сохранять unsubscribe сообщения в очереди', () => {
      fc.assert(
        fc.property(
          fc.array(unsubscribeMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            expect(queue.size()).toBe(0);
            expect(queue.getAll()).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен фильтровать subscribe/unsubscribe из смешанного потока сообщений', () => {
      fc.assert(
        fc.property(
          fc.array(clientMessageArbitrary, { minLength: 10, maxLength: 100 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            const queuedMessages = queue.getAll();
            queuedMessages.forEach((msg) => {
              expect(msg.type).not.toBe('subscribe');
              expect(msg.type).not.toBe('unsubscribe');
            });
            const expectedCount = messages.filter(
              (msg) => msg.type !== 'subscribe' && msg.type !== 'unsubscribe'
            ).length;
            expect(queue.size()).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять только init сообщения из смешанного потока', () => {
      fc.assert(
        fc.property(
          fc.array(clientMessageArbitrary, { minLength: 10, maxLength: 100 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            const queuedMessages = queue.getAll();
            const expectedMessages = messages.filter((msg) => msg.type === 'init');
            expect(queuedMessages).toEqual(expectedMessages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно работать при 100% subscribe/unsubscribe сообщениях', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(subscribeMessageArbitrary, unsubscribeMessageArbitrary),
            { minLength: 1, maxLength: 50 }
          ),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            expect(queue.size()).toBe(0);
            expect(queue.getAll()).toEqual([]);
            expect(queue.isFull()).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  describe('Property 16: Удаление сообщения из очереди после отправки', () => {
    it('должен удалять сообщения из очереди после успешной отправки', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            expect(queue.size()).toBe(messages.length);
            const sendFn = vi.fn(() => true);
            queue.flush(sendFn);
            expect(queue.size()).toBe(0);
            expect(queue.getAll()).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен сохранять сообщения при неудачной отправке', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 1, maxLength: 50 }),
          (messages) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            const sendFn = vi.fn(() => false);
            queue.flush(sendFn);
            expect(queue.size()).toBe(messages.length);
            expect(queue.getAll()).toEqual(messages);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен удалять только успешно отправленные сообщения', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 2, maxLength: 20 }),
          fc.integer({ min: 1, max: 19 }),
          (messages, successCount) => {
            const actualSuccessCount = Math.min(successCount, messages.length - 1);
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            let callIndex = 0;
            const sendFn = vi.fn(() => {
              const success = callIndex < actualSuccessCount;
              callIndex++;
              return success;
            });
            const sentCount = queue.flush(sendFn);
            expect(sentCount).toBe(actualSuccessCount);
            expect(queue.size()).toBe(messages.length - actualSuccessCount);
            const remainingMessages = queue.getAll();
            expect(remainingMessages).toEqual(messages.slice(actualSuccessCount));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать множественные flush операции', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 5, maxLength: 20 }),
          fc.integer({ min: 1, max: 5 }),
          (messages, flushCount) => {
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            for (let i = 0; i < flushCount; i++) {
              const sendFn = vi.fn(() => true);
              queue.flush(sendFn);
              expect(queue.size()).toBe(0);
            }
            expect(queue.getAll()).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен позволять повторную отправку после частичного сбоя', () => {
      fc.assert(
        fc.property(
          fc.array(queueableMessageArbitrary, { minLength: 3, maxLength: 20 }),
          fc.integer({ min: 1, max: 19 }),
          (messages, firstSuccessCount) => {
            const actualFirstSuccess = Math.min(firstSuccessCount, messages.length - 1);
            const queue = new MessageQueue();
            messages.forEach((message) => queue.enqueue(message));
            let callIndex = 0;
            const firstSendFn = vi.fn(() => {
              const success = callIndex < actualFirstSuccess;
              callIndex++;
              return success;
            });
            queue.flush(firstSendFn);
            const remainingAfterFirst = messages.length - actualFirstSuccess;
            expect(queue.size()).toBe(remainingAfterFirst);
            const secondSendFn = vi.fn(() => true);
            queue.flush(secondSendFn);
            expect(queue.size()).toBe(0);
            expect(queue.getAll()).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
