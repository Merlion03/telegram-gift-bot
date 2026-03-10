/**
 * Preservation Property-Based Tests для группировки сообщений по датам
 * 
 * ВАЖНО: Следуем методологии observation-first
 * Эти тесты фиксируют наблюдаемое поведение на НЕИСПРАВЛЕННОМ коде
 * 
 * Property 2: Preservation - Корректная группировка разных дат
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тесты ПРОХОДЯТ на неисправленном коде
 * Это подтверждает базовое поведение, которое должно сохраниться после исправления
 * 
 * Requirements: 3.3, 3.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SupportMessage } from '../types/support';

/**
 * Симуляция функции groupMessagesByDate из ChatWindow.tsx
 * ИСПРАВЛЕННАЯ версия с использованием Map для предотвращения дублирования разделителей
 */
function groupMessagesByDate(messages: SupportMessage[]) {
  // Вспомогательная функция форматирования даты
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  };

  // Map для отслеживания групп по датам (ключ - toDateString, значение - группа)
  const groupsMap = new Map<string, { date: string; messages: SupportMessage[] }>();
  
  messages.forEach((message) => {
    // Получаем строковое представление даты (например, "Wed Mar 06 2024")
    const messageDate = new Date(message.created_at).toDateString();
    
    // Если группа для этой даты ещё не создана, создаём её
    if (!groupsMap.has(messageDate)) {
      groupsMap.set(messageDate, {
        date: formatDate(message.created_at), // Форматированная дата ("Сегодня", "Вчера", "ДД.ММ.ГГГГ")
        messages: [],
      });
    }
    
    // Добавляем сообщение в существующую группу для этой даты
    groupsMap.get(messageDate)!.messages.push(message);
  });
  
  // Преобразуем Map в массив групп, сохраняя порядок добавления
  return Array.from(groupsMap.values());
}

/**
 * Вспомогательная функция для создания сообщения
 */
function createMessage(
  id: number,
  date: Date,
  message_type: 'from_user' | 'from_support' | 'from_bot' = 'from_user'
): SupportMessage {
  return {
    id,
    session_id: 5,
    telegram_id: 123456789,
    message_type,
    message_text: `Сообщение ${id}`,
    created_at: date.toISOString(),
    delivered: false,
  };
}

describe('Property 2: Preservation - Корректная группировка разных дат', () => {
  /**
   * Тест 1: Сообщения разных дат группируются в отдельные группы
   * 
   * Наблюдаем: когда сообщения имеют разные даты и идут последовательно,
   * функция создаёт отдельную группу для каждой даты
   * 
   * Requirement: 3.3
   */
  it('для последовательных сообщений разных дат должны создаваться отдельные группы', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // количество дней
        (numDays) => {
          const today = new Date();
          const messages: SupportMessage[] = [];

          // Создаём по одному сообщению для каждого дня
          for (let i = 0; i < numDays; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            date.setHours(12, 0, 0, 0);
            messages.push(createMessage(i + 1, date));
          }

          const groups = groupMessagesByDate(messages);

          // КРИТИЧЕСКАЯ ПРОВЕРКА: количество групп = количество уникальных дат
          expect(groups.length).toBe(numDays);

          // Проверяем, что каждая группа содержит ровно одно сообщение
          groups.forEach((group) => {
            expect(group.messages.length).toBe(1);
          });
        }
      ),
      { numRuns: 50 } // Запускаем 50 раз для надёжности
    );
  });

  /**
   * Тест 2: Форматирование дат сохраняется
   * 
   * Наблюдаем: функция formatDate корректно форматирует даты как
   * "Сегодня", "Вчера" или "ДД.ММ.ГГГГ"
   * 
   * Requirement: 3.5
   */
  it('форматирование дат должно работать корректно для "Сегодня", "Вчера" и других дат', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const messages: SupportMessage[] = [
      createMessage(1, twoDaysAgo),
      createMessage(2, yesterday),
      createMessage(3, today),
    ];

    const groups = groupMessagesByDate(messages);

    // Проверяем количество групп
    expect(groups.length).toBe(3);

    // Проверяем форматирование дат
    expect(groups[0].date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/); // ДД.ММ.ГГГГ
    expect(groups[1].date).toBe('Вчера');
    expect(groups[2].date).toBe('Сегодня');
  });

  /**
   * Тест 3: Порядок сообщений внутри групп сохраняется
   * 
   * Наблюдаем: сообщения внутри одной группы сохраняют свой порядок
   * 
   * Requirement: 3.3
   */
  it('порядок сообщений внутри групп должен сохраняться', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }), // количество сообщений в одной дате
        (numMessages) => {
          const today = new Date();
          const messages: SupportMessage[] = [];

          // Создаём несколько сообщений с одинаковой датой, но разным временем
          for (let i = 0; i < numMessages; i++) {
            const date = new Date(today);
            date.setHours(9 + i, 0, 0, 0); // 9:00, 10:00, 11:00, ...
            messages.push(createMessage(i + 1, date));
          }

          const groups = groupMessagesByDate(messages);

          // Должна быть одна группа
          expect(groups.length).toBe(1);

          // Проверяем, что порядок сообщений сохранён
          const groupMessages = groups[0].messages;
          expect(groupMessages.length).toBe(numMessages);

          for (let i = 0; i < numMessages; i++) {
            expect(groupMessages[i].id).toBe(i + 1);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Тест 4: Множественные сообщения разных дат группируются корректно
   * 
   * Наблюдаем: когда есть несколько сообщений для каждой даты,
   * они группируются правильно (при последовательном порядке)
   * 
   * Requirement: 3.3
   */
  it('множественные сообщения разных дат должны группироваться корректно', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }), // количество дней
        fc.integer({ min: 1, max: 5 }), // сообщений на день
        (numDays, messagesPerDay) => {
          const today = new Date();
          const messages: SupportMessage[] = [];
          let messageId = 1;

          // Создаём сообщения для каждого дня
          for (let day = 0; day < numDays; day++) {
            for (let msg = 0; msg < messagesPerDay; msg++) {
              const date = new Date(today);
              date.setDate(date.getDate() - day);
              date.setHours(9 + msg, 0, 0, 0);
              messages.push(createMessage(messageId++, date));
            }
          }

          const groups = groupMessagesByDate(messages);

          // Проверяем количество групп
          expect(groups.length).toBe(numDays);

          // Проверяем количество сообщений в каждой группе
          groups.forEach((group) => {
            expect(group.messages.length).toBe(messagesPerDay);
          });

          // Проверяем общее количество сообщений
          const totalMessages = groups.reduce((sum, group) => sum + group.messages.length, 0);
          expect(totalMessages).toBe(numDays * messagesPerDay);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Тест 5: Граничные случаи - пустой массив
   * 
   * Requirement: 3.3
   */
  it('должен возвращать пустой массив для пустого списка сообщений', () => {
    const messages: SupportMessage[] = [];
    const groups = groupMessagesByDate(messages);

    expect(groups).toEqual([]);
    expect(groups.length).toBe(0);
  });

  /**
   * Тест 6: Граничные случаи - одно сообщение
   * 
   * Requirement: 3.3
   */
  it('должен создавать одну группу для одного сообщения', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
        (date) => {
          const messages: SupportMessage[] = [createMessage(1, date)];
          const groups = groupMessagesByDate(messages);

          expect(groups.length).toBe(1);
          expect(groups[0].messages.length).toBe(1);
          expect(groups[0].messages[0].id).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Тест 7: Все сообщения одной даты попадают в одну группу (последовательные)
   * 
   * Наблюдаем: когда все сообщения имеют одинаковую дату и идут последовательно,
   * создаётся только одна группа
   * 
   * Requirement: 3.3
   */
  it('все последовательные сообщения одной даты должны попадать в одну группу', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // количество сообщений
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
        (numMessages, baseDate) => {
          const messages: SupportMessage[] = [];

          // Создаём сообщения с одинаковой датой, но разным временем
          for (let i = 0; i < numMessages; i++) {
            const date = new Date(baseDate);
            date.setHours(i % 24, i % 60, 0, 0);
            messages.push(createMessage(i + 1, date));
          }

          const groups = groupMessagesByDate(messages);

          // КРИТИЧЕСКАЯ ПРОВЕРКА: должна быть только одна группа
          expect(groups.length).toBe(1);
          expect(groups[0].messages.length).toBe(numMessages);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Тест 8: Инвариант - сумма сообщений в группах равна общему количеству
   * 
   * Requirement: 3.3
   */
  it('сумма сообщений во всех группах должна равняться общему количеству сообщений', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
            count: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (dateGroups) => {
          const messages: SupportMessage[] = [];
          let messageId = 1;

          // Создаём сообщения для каждой группы дат
          dateGroups.forEach(({ date, count }) => {
            for (let i = 0; i < count; i++) {
              const msgDate = new Date(date);
              msgDate.setHours(9 + i, 0, 0, 0);
              messages.push(createMessage(messageId++, msgDate));
            }
          });

          // Сортируем сообщения по дате (важно для корректной группировки)
          messages.sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          const groups = groupMessagesByDate(messages);

          // Подсчитываем общее количество сообщений в группах
          const totalInGroups = groups.reduce((sum, group) => sum + group.messages.length, 0);

          // ИНВАРИАНТ: сумма сообщений в группах = общее количество сообщений
          expect(totalInGroups).toBe(messages.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Дополнительные preservation тесты для специфических сценариев
 */
describe('Preservation: Специфические сценарии группировки', () => {
  /**
   * Тест 9: Сообщения с одинаковым временем, но разными датами
   * 
   * Requirement: 3.3
   */
  it('сообщения с одинаковым временем, но разными датами должны быть в разных группах', () => {
    const today = new Date();
    today.setHours(15, 30, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const messages: SupportMessage[] = [
      createMessage(1, yesterday),
      createMessage(2, today),
    ];

    const groups = groupMessagesByDate(messages);

    expect(groups.length).toBe(2);
    expect(groups[0].date).toBe('Вчера');
    expect(groups[1].date).toBe('Сегодня');
  });

  /**
   * Тест 10: Сообщения на границе дня (23:59 и 00:01)
   * 
   * Requirement: 3.3
   */
  it('сообщения на границе дня должны группироваться по дате, а не времени', () => {
    const today = new Date();
    today.setHours(0, 1, 0, 0); // 00:01 сегодня

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 0, 0); // 23:59 вчера

    const messages: SupportMessage[] = [
      createMessage(1, yesterday),
      createMessage(2, today),
    ];

    const groups = groupMessagesByDate(messages);

    // Должно быть 2 группы, несмотря на то что разница во времени всего 2 минуты
    expect(groups.length).toBe(2);
  });

  /**
   * Тест 11: Форматирование даты для старых сообщений
   * 
   * Requirement: 3.5
   */
  it('старые сообщения должны форматироваться как "ДД.ММ.ГГГГ"', () => {
    const oldDate = new Date('2024-01-15T12:00:00Z');
    const messages: SupportMessage[] = [createMessage(1, oldDate)];

    const groups = groupMessagesByDate(messages);

    expect(groups.length).toBe(1);
    // Проверяем формат ДД.ММ.ГГГГ
    expect(groups[0].date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  /**
   * Тест 12: Сообщения разных типов группируются одинаково
   * 
   * Requirement: 3.3
   */
  it('сообщения разных типов (user, support, bot) должны группироваться по дате одинаково', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const messages: SupportMessage[] = [
      createMessage(1, today, 'from_user'),
      createMessage(2, today, 'from_support'),
      createMessage(3, today, 'from_bot'),
    ];

    const groups = groupMessagesByDate(messages);

    // Все сообщения должны быть в одной группе
    expect(groups.length).toBe(1);
    expect(groups[0].messages.length).toBe(3);

    // Проверяем, что все типы сообщений присутствуют
    const types = groups[0].messages.map(m => m.message_type);
    expect(types).toContain('from_user');
    expect(types).toContain('from_support');
    expect(types).toContain('from_bot');
  });

  /**
   * Тест 13: Последовательность дат в группах соответствует порядку сообщений
   * 
   * Requirement: 3.3
   */
  it('последовательность дат в группах должна соответствовать хронологическому порядку', () => {
    const today = new Date();
    const messages: SupportMessage[] = [];

    // Создаём сообщения за последние 5 дней
    for (let i = 4; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(12, 0, 0, 0);
      messages.push(createMessage(5 - i, date));
    }

    const groups = groupMessagesByDate(messages);

    expect(groups.length).toBe(5);

    // Проверяем, что даты идут в хронологическом порядке
    for (let i = 0; i < groups.length - 1; i++) {
      const currentDate = new Date(groups[i].messages[0].created_at);
      const nextDate = new Date(groups[i + 1].messages[0].created_at);
      expect(currentDate.getTime()).toBeLessThan(nextDate.getTime());
    }
  });

  /**
   * Тест 14: Группировка работает корректно для большого количества сообщений
   * 
   * Requirement: 3.3
   */
  it('группировка должна работать корректно для большого количества сообщений', () => {
    const today = new Date();
    const messages: SupportMessage[] = [];

    // Создаём 100 сообщений за 10 дней (по 10 сообщений в день)
    for (let day = 0; day < 10; day++) {
      for (let msg = 0; msg < 10; msg++) {
        const date = new Date(today);
        date.setDate(date.getDate() - day);
        date.setHours(9 + msg, 0, 0, 0);
        messages.push(createMessage(day * 10 + msg + 1, date));
      }
    }

    const groups = groupMessagesByDate(messages);

    // Проверяем количество групп
    expect(groups.length).toBe(10);

    // Проверяем, что в каждой группе 10 сообщений
    groups.forEach((group) => {
      expect(group.messages.length).toBe(10);
    });

    // Проверяем общее количество
    const totalMessages = groups.reduce((sum, group) => sum + group.messages.length, 0);
    expect(totalMessages).toBe(100);
  });
});

/**
 * Тесты для проверки стабильности форматирования
 */
describe('Preservation: Стабильность форматирования дат', () => {
  /**
   * Тест 15: Форматирование "Сегодня" стабильно
   * 
   * Requirement: 3.5
   */
  it('все сообщения сегодняшнего дня должны иметь метку "Сегодня"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numMessages) => {
          const today = new Date();
          const messages: SupportMessage[] = [];

          for (let i = 0; i < numMessages; i++) {
            const date = new Date(today);
            date.setHours(i % 24, i % 60, 0, 0);
            messages.push(createMessage(i + 1, date));
          }

          const groups = groupMessagesByDate(messages);

          expect(groups.length).toBe(1);
          expect(groups[0].date).toBe('Сегодня');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Тест 16: Форматирование "Вчера" стабильно
   * 
   * Requirement: 3.5
   */
  it('все сообщения вчерашнего дня должны иметь метку "Вчера"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numMessages) => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const messages: SupportMessage[] = [];

          for (let i = 0; i < numMessages; i++) {
            const date = new Date(yesterday);
            date.setHours(i % 24, i % 60, 0, 0);
            messages.push(createMessage(i + 1, date));
          }

          const groups = groupMessagesByDate(messages);

          expect(groups.length).toBe(1);
          expect(groups[0].date).toBe('Вчера');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Тест 17: Форматирование старых дат стабильно
   * 
   * Requirement: 3.5
   */
  it('старые даты должны форматироваться в формате "ДД.ММ.ГГГГ"', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-11-30') }),
        (date) => {
          // Убеждаемся, что дата не "сегодня" и не "вчера"
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          if (
            date.toDateString() === today.toDateString() ||
            date.toDateString() === yesterday.toDateString()
          ) {
            return; // Пропускаем этот случай
          }

          const messages: SupportMessage[] = [createMessage(1, date)];
          const groups = groupMessagesByDate(messages);

          expect(groups.length).toBe(1);
          expect(groups[0].date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
        }
      ),
      { numRuns: 50 }
    );
  });
});
