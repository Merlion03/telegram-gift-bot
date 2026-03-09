import { describe, it, expect, beforeEach } from 'vitest';
import { MessageQueue } from '../MessageQueue';
import { LIMITS } from '../../constants';
import type { ClientMessage } from '../../types';

describe('MessageQueue - Unit Tests', () => {
  let messageQueue: MessageQueue;

  beforeEach(() => {
    messageQueue = new MessageQueue();
  });

  describe('Максимальный размер очереди', () => {
    it('должен использовать размер по умолчанию из LIMITS.MESSAGE_QUEUE_SIZE', () => {
      const queue = new MessageQueue();
      expect(LIMITS.MESSAGE_QUEUE_SIZE).toBe(100);
      for (let i = 0; i < 150; i++) {
        queue.enqueue({ type: 'init' });
      }
      expect(queue.size()).toBe(100);
    });

    it('должен принимать кастомный максимальный размер', () => {
      const customSize = 50;
      const queue = new MessageQueue(customSize);
      for (let i = 0; i < 100; i++) {
        queue.enqueue({ type: 'init' });
      }
      expect(queue.size()).toBe(customSize);
    });

    it('НЕ должен превышать максимальный размер при добавлении сообщений', () => {
      const queue = new MessageQueue(100);
      for (let i = 0; i < 200; i++) {
        queue.enqueue({ type: 'init' });
        expect(queue.size()).toBeLessThanOrEqual(100);
      }
      expect(queue.size()).toBe(100);
    });

    it('должен корректно работать метод isFull()', () => {
      const queue = new MessageQueue(10);
      expect(queue.isFull()).toBe(false);
      for (let i = 0; i < 9; i++) {
        queue.enqueue({ type: 'init' });
        expect(queue.isFull()).toBe(false);
      }
      queue.enqueue({ type: 'init' });
      expect(queue.isFull()).toBe(true);
      queue.enqueue({ type: 'init' });
      expect(queue.isFull()).toBe(true);
    });

    it('должен удалять самое старое сообщение при достижении лимита', () => {
      const queue = new MessageQueue(3);
      const msg1: ClientMessage = { type: 'init' };
      const msg2: ClientMessage = { type: 'init' };
      const msg3: ClientMessage = { type: 'init' };
      const msg4: ClientMessage = { type: 'init' };
      queue.enqueue(msg1);
      queue.enqueue(msg2);
      queue.enqueue(msg3);
      expect(queue.getAll()).toEqual([msg1, msg2, msg3]);
      queue.enqueue(msg4);
      expect(queue.getAll()).toEqual([msg2, msg3, msg4]);
    });

    it('должен корректно работать с размером 1', () => {
      const queue = new MessageQueue(1);
      const msg1: ClientMessage = { type: 'init' };
      const msg2: ClientMessage = { type: 'init' };
      queue.enqueue(msg1);
      expect(queue.size()).toBe(1);
      expect(queue.getAll()).toEqual([msg1]);
      queue.enqueue(msg2);
      expect(queue.size()).toBe(1);
      expect(queue.getAll()).toEqual([msg2]);
    });

    it('должен сохранять размер после clear()', () => {
      const queue = new MessageQueue(50);
      for (let i = 0; i < 100; i++) {
        queue.enqueue({ type: 'init' });
      }
      expect(queue.size()).toBe(50);
      queue.clear();
      expect(queue.size()).toBe(0);
      for (let i = 0; i < 100; i++) {
        queue.enqueue({ type: 'init' });
      }
      expect(queue.size()).toBe(50);
    });
  });
});
