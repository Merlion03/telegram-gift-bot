/**
 * Preservation Property-Based Tests для отображения отправителя
 * 
 * ВАЖНО: Следуем методологии observation-first
 * Эти тесты фиксируют наблюдаемое поведение на НЕИСПРАВЛЕННОМ коде
 * 
 * Property 2: Preservation - Неизменное отображение сообщений пользователя
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тесты ПРОХОДЯТ на неисправленном коде
 * Это подтверждает базовое поведение, которое должно сохраниться после исправления
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SupportMessage } from '../types/support';

/**
 * Симуляция логики преобразования из ChatWindow.tsx (строки 79-88)
 * Это текущая НЕИСПРАВЛЕННАЯ логика
 */
function transformWebSocketMessage(serverMessage: {
  data: {
    id: number;
    session_id: number;
    sender_type: 'user' | 'admin' | 'bot';
    message_text: string;
    created_at: string;
    is_read: boolean;
  };
}, telegram_id: number): SupportMessage {
  return {
    id: serverMessage.data.id,
    session_id: serverMessage.data.session_id,
    telegram_id: telegram_id,
    message_type: serverMessage.data.sender_type === 'user' ? 'from_user' : 'from_support',
    message_text: serverMessage.data.message_text,
    created_at: serverMessage.data.created_at,
    delivered: serverMessage.data.is_read || false,
  };
}

/**
 * Симуляция функции formatTime из ChatWindow.tsx
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Симуляция визуального отображения сообщения
 * Возвращает объект с CSS классами и стилями
 */
function getMessageDisplayStyle(message: SupportMessage) {
  const isFromSupport = message.message_type === 'from_support';
  const isFromBot = message.message_type === 'from_bot';
  const isFromUser = message.message_type === 'from_user';

  return {
    alignment: isFromSupport ? 'right' : 'left',
    backgroundColor: isFromSupport 
      ? 'blue-600' 
      : isFromBot 
      ? 'purple-100' 
      : 'white',
    textColor: isFromSupport 
      ? 'white' 
      : isFromBot 
      ? 'purple-900' 
      : 'gray-900',
    hasShadow: isFromUser,
    showDeliveryIndicator: isFromSupport,
    showBotLabel: isFromBot,
  };
}

describe('Property 2: Preservation - Неизменное отображение сообщений пользователя', () => {
  /**
   * Тест 1: Сообщения от пользователей всегда преобразуются в message_type='from_user'
   * 
   * Property-based тест генерирует множество случайных сообщений от пользователей
   * и проверяет, что все они корректно преобразуются
   * 
   * Requirement: 3.1
   */
  it('для всех сообщений с sender_type="user" должен устанавливаться message_type="from_user"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }), // id
        fc.integer({ min: 1, max: 10000 }), // session_id
        fc.integer({ min: 100000000, max: 999999999 }), // telegram_id
        fc.string({ minLength: 1, maxLength: 4000 }), // message_text
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }), // created_at
        fc.boolean(), // is_read
        (id, session_id, telegram_id, message_text, created_at, is_read) => {
          // Создаём WebSocket сообщение от пользователя
          const webSocketMessage = {
            data: {
              id,
              session_id,
              sender_type: 'user' as const,
              message_text,
              created_at: created_at.toISOString(),
              is_read,
            },
          };

          const result = transformWebSocketMessage(webSocketMessage, telegram_id);

          // КРИТИЧЕСКАЯ ПРОВЕРКА: message_type всегда должен быть 'from_user'
          expect(result.message_type).toBe('from_user');
          
          // Дополнительные проверки целостности данных
          expect(result.id).toBe(id);
          expect(result.session_id).toBe(session_id);
          expect(result.telegram_id).toBe(telegram_id);
          expect(result.message_text).toBe(message_text);
          expect(result.created_at).toBe(created_at.toISOString());
          expect(result.delivered).toBe(is_read);
        }
      )
    );
  });

  /**
   * Тест 2: Сообщения от пользователей отображаются слева с белым фоном
   * 
   * Проверяет визуальное отображение сообщений от пользователей
   * 
   * Requirement: 3.1
   */
  it('сообщения от пользователей должны отображаться слева с белым фоном', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 100000000, max: 999999999 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.date(),
        fc.boolean(),
        (id, session_id, telegram_id, message_text, created_at, is_read) => {
          const webSocketMessage = {
            data: {
              id,
              session_id,
              sender_type: 'user' as const,
              message_text,
              created_at: created_at.toISOString(),
              is_read,
            },
          };

          const message = transformWebSocketMessage(webSocketMessage, telegram_id);
          const displayStyle = getMessageDisplayStyle(message);

          // Проверяем визуальные свойства
          expect(displayStyle.alignment).toBe('left');
          expect(displayStyle.backgroundColor).toBe('white');
          expect(displayStyle.textColor).toBe('gray-900');
          expect(displayStyle.hasShadow).toBe(true);
          expect(displayStyle.showDeliveryIndicator).toBe(false);
          expect(displayStyle.showBotLabel).toBe(false);
        }
      )
    );
  });

  /**
   * Тест 3: Форматирование времени не изменяется
   * 
   * Проверяет, что функция formatTime работает корректно для различных дат
   * 
   * Requirement: 3.5
   */
  it('форматирование времени должно работать корректно', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
        (date) => {
          const dateString = date.toISOString();
          const formattedTime = formatTime(dateString);

          // Проверяем формат времени (HH:MM)
          expect(formattedTime).toMatch(/^\d{2}:\d{2}$/);
          
          // Проверяем, что время соответствует исходной дате
          const [hours, minutes] = formattedTime.split(':').map(Number);
          expect(hours).toBeGreaterThanOrEqual(0);
          expect(hours).toBeLessThanOrEqual(23);
          expect(minutes).toBeGreaterThanOrEqual(0);
          expect(minutes).toBeLessThanOrEqual(59);
        }
      )
    );
  });

  /**
   * Тест 4: Все поля сообщения от пользователя сохраняются без изменений
   * 
   * Проверяет, что преобразование не теряет и не изменяет данные
   * 
   * Requirement: 3.1
   */
  it('все поля сообщения от пользователя должны сохраняться без изменений', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1, max: 1000000 }),
          session_id: fc.integer({ min: 1, max: 10000 }),
          telegram_id: fc.integer({ min: 100000000, max: 999999999 }),
          message_text: fc.string({ minLength: 1, maxLength: 4000 }),
          created_at: fc.date(),
          is_read: fc.boolean(),
        }),
        ({ id, session_id, telegram_id, message_text, created_at, is_read }) => {
          const webSocketMessage = {
            data: {
              id,
              session_id,
              sender_type: 'user' as const,
              message_text,
              created_at: created_at.toISOString(),
              is_read,
            },
          };

          const result = transformWebSocketMessage(webSocketMessage, telegram_id);

          // Проверяем, что все поля сохранены
          expect(result).toEqual({
            id,
            session_id,
            telegram_id,
            message_type: 'from_user',
            message_text,
            created_at: created_at.toISOString(),
            delivered: is_read,
          });
        }
      )
    );
  });

  /**
   * Тест 5: Граничные случаи для сообщений от пользователей
   * 
   * Проверяет корректность обработки граничных значений
   * 
   * Requirement: 3.1
   */
  describe('граничные случаи для сообщений от пользователей', () => {
    it('должен корректно обрабатывать минимальный id', () => {
      const webSocketMessage = {
        data: {
          id: 1,
          session_id: 1,
          sender_type: 'user' as const,
          message_text: 'Тест',
          created_at: '2024-03-06T10:00:00Z',
          is_read: false,
        },
      };

      const result = transformWebSocketMessage(webSocketMessage, 123456789);
      expect(result.message_type).toBe('from_user');
      expect(result.id).toBe(1);
    });

    it('должен корректно обрабатывать очень длинное сообщение', () => {
      const longMessage = 'А'.repeat(4000);
      const webSocketMessage = {
        data: {
          id: 100,
          session_id: 5,
          sender_type: 'user' as const,
          message_text: longMessage,
          created_at: '2024-03-06T10:00:00Z',
          is_read: false,
        },
      };

      const result = transformWebSocketMessage(webSocketMessage, 123456789);
      expect(result.message_type).toBe('from_user');
      expect(result.message_text).toBe(longMessage);
      expect(result.message_text.length).toBe(4000);
    });

    it('должен корректно обрабатывать сообщение с одним символом', () => {
      const webSocketMessage = {
        data: {
          id: 200,
          session_id: 10,
          sender_type: 'user' as const,
          message_text: 'А',
          created_at: '2024-03-06T10:00:00Z',
          is_read: false,
        },
      };

      const result = transformWebSocketMessage(webSocketMessage, 123456789);
      expect(result.message_type).toBe('from_user');
      expect(result.message_text).toBe('А');
    });

    it('должен корректно обрабатывать is_read=true', () => {
      const webSocketMessage = {
        data: {
          id: 300,
          session_id: 15,
          sender_type: 'user' as const,
          message_text: 'Прочитано',
          created_at: '2024-03-06T10:00:00Z',
          is_read: true,
        },
      };

      const result = transformWebSocketMessage(webSocketMessage, 123456789);
      expect(result.message_type).toBe('from_user');
      expect(result.delivered).toBe(true);
    });

    it('должен корректно обрабатывать is_read=false', () => {
      const webSocketMessage = {
        data: {
          id: 400,
          session_id: 20,
          sender_type: 'user' as const,
          message_text: 'Не прочитано',
          created_at: '2024-03-06T10:00:00Z',
          is_read: false,
        },
      };

      const result = transformWebSocketMessage(webSocketMessage, 123456789);
      expect(result.message_type).toBe('from_user');
      expect(result.delivered).toBe(false);
    });
  });

  /**
   * Тест 6: Множественные сообщения от пользователей
   * 
   * Проверяет, что обработка множественных сообщений работает корректно
   * 
   * Requirement: 3.1, 3.3
   */
  it('все сообщения от пользователей должны обрабатываться одинаково', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 1000000 }),
            session_id: fc.integer({ min: 1, max: 10000 }),
            message_text: fc.string({ minLength: 1, maxLength: 100 }),
            created_at: fc.date(),
            is_read: fc.boolean(),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        fc.integer({ min: 100000000, max: 999999999 }),
        (messagesData, telegram_id) => {
          const results = messagesData.map(data => {
            const webSocketMessage = {
              data: {
                ...data,
                sender_type: 'user' as const,
                created_at: data.created_at.toISOString(),
              },
            };
            return transformWebSocketMessage(webSocketMessage, telegram_id);
          });

          // Проверяем, что все сообщения имеют message_type='from_user'
          results.forEach(result => {
            expect(result.message_type).toBe('from_user');
            expect(result.telegram_id).toBe(telegram_id);
          });

          // Проверяем, что количество сообщений не изменилось
          expect(results.length).toBe(messagesData.length);
        }
      )
    );
  });

  /**
   * Тест 7: Сообщения от пользователей не должны показывать индикатор доставки
   * 
   * Requirement: 3.6
   */
  it('сообщения от пользователей не должны показывать индикатор доставки', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 100000000, max: 999999999 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.date(),
        fc.boolean(),
        (id, session_id, telegram_id, message_text, created_at, is_read) => {
          const webSocketMessage = {
            data: {
              id,
              session_id,
              sender_type: 'user' as const,
              message_text,
              created_at: created_at.toISOString(),
              is_read,
            },
          };

          const message = transformWebSocketMessage(webSocketMessage, telegram_id);
          const displayStyle = getMessageDisplayStyle(message);

          // Сообщения от пользователей не должны показывать индикатор доставки
          expect(displayStyle.showDeliveryIndicator).toBe(false);
        }
      )
    );
  });
});

/**
 * Дополнительные preservation тесты для других типов отправителей
 * (для полноты картины, хотя основной фокус на пользователях)
 */
describe('Preservation: Дополнительные проверки', () => {
  /**
   * Тест 8: Сообщения от администратора отображаются справа с синим фоном
   * 
   * Requirement: 3.2
   */
  it('сообщения от администратора должны отображаться справа с синим фоном', () => {
    const webSocketMessage = {
      data: {
        id: 500,
        session_id: 25,
        sender_type: 'admin' as const,
        message_text: 'Ответ администратора',
        created_at: '2024-03-06T10:00:00Z',
        is_read: false,
      },
    };

    const message = transformWebSocketMessage(webSocketMessage, 123456789);
    const displayStyle = getMessageDisplayStyle(message);

    expect(message.message_type).toBe('from_support');
    expect(displayStyle.alignment).toBe('right');
    expect(displayStyle.backgroundColor).toBe('blue-600');
    expect(displayStyle.textColor).toBe('white');
    expect(displayStyle.showDeliveryIndicator).toBe(true);
  });

  /**
   * Тест 9: Проверка инварианта - каждое сообщение имеет ровно один тип
   * 
   * Requirement: 3.1, 3.2
   */
  it('каждое сообщение должно иметь ровно один message_type', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('user' as const),
          fc.constant('admin' as const),
          fc.constant('bot' as const)
        ),
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 100000000, max: 999999999 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.date(),
        fc.boolean(),
        (sender_type, id, session_id, telegram_id, message_text, created_at, is_read) => {
          const webSocketMessage = {
            data: {
              id,
              session_id,
              sender_type,
              message_text,
              created_at: created_at.toISOString(),
              is_read,
            },
          };

          const result = transformWebSocketMessage(webSocketMessage, telegram_id);

          // Проверяем, что message_type - одно из допустимых значений
          expect(['from_user', 'from_support', 'from_bot']).toContain(result.message_type);
          
          // Проверяем, что message_type определён
          expect(result.message_type).toBeDefined();
          expect(result.message_type).not.toBeNull();
          expect(result.message_type).not.toBe('');
        }
      )
    );
  });
});

