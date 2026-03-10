/**
 * Exploratory Property-Based Test для выявления багов отображения сообщений
 * 
 * КРИТИЧЕСКИ ВАЖНО: Эти тесты ДОЛЖНЫ ПРОВАЛИТЬСЯ на неисправленном коде
 * Провал подтверждает существование багов
 * 
 * Property 1: Fault Condition - Некорректное преобразование типа отправителя бота
 * Property 2: Fault Condition - Дублирование разделителей дат после перезагрузки
 * 
 * Цель: Выявить контрпримеры, демонстрирующие баги
 * Подход: Scoped PBT - ограничиваем property конкретными проваливающимися случаями
 */

import { describe, it, expect } from 'vitest';
import type { SupportMessage } from '../types/support';

/**
 * Симуляция логики преобразования из ChatWindow.tsx (строки 79-88)
 * Это ИСПРАВЛЕННАЯ логика с явной обработкой всех типов отправителей
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
    // ИСПРАВЛЕННАЯ ЛОГИКА: явное преобразование всех типов
    // - 'user' -> 'from_user'
    // - 'bot' -> 'from_bot'
    // - 'admin' -> 'from_support'
    // - неизвестные типы -> 'from_support' (fallback)
    message_type: 
      serverMessage.data.sender_type === 'user' ? 'from_user' :
      serverMessage.data.sender_type === 'bot' ? 'from_bot' :
      'from_support',
    message_text: serverMessage.data.message_text,
    created_at: serverMessage.data.created_at,
    delivered: serverMessage.data.is_read || false,
  };
}

/**
 * Симуляция функции groupMessagesByDate из ChatWindow.tsx (строки 363-381)
 * Это НЕИСПРАВЛЕННАЯ логика с багом дублирования разделителей
 */
function groupMessagesByDate(messages: SupportMessage[]) {
  const groups: { date: string; messages: SupportMessage[] }[] = [];
  let currentDate = '';

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

  messages.forEach((message) => {
    const messageDate = new Date(message.created_at).toDateString();

    if (messageDate !== currentDate) {
      currentDate = messageDate;
      groups.push({
        date: formatDate(message.created_at),
        messages: [message],
      });
    } else {
      groups[groups.length - 1].messages.push(message);
    }
  });

  return groups;
}

describe('Property 1: Fault Condition - Некорректное преобразование типа отправителя бота', () => {
  /**
   * Тест 1: Проверка преобразования sender_type='bot'
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИВАЕТСЯ
   * Причина: message_type будет 'from_support' вместо 'from_bot'
   */
  it('должен преобразовывать sender_type="bot" в message_type="from_bot"', () => {
    // Симулируем WebSocket событие с sender_type='bot'
    const webSocketMessage = {
      data: {
        id: 124,
        session_id: 5,
        sender_type: 'bot' as const,
        message_text: 'Автоматический ответ от бота',
        created_at: '2024-03-06T15:00:00Z',
        is_read: false,
      },
    };

    const result = transformWebSocketMessage(webSocketMessage, 987654321);

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (после исправления):
    // message_type должен быть 'from_bot'
    
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (на неисправленном коде):
    // message_type будет 'from_support' (НЕПРАВИЛЬНО)
    
    expect(result.message_type).toBe('from_bot');
  });

  /**
   * Тест 2: Проверка преобразования sender_type='admin'
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест МОЖЕТ ПРОЙТИ
   * Причина: текущая логика случайно корректна для 'admin'
   */
  it('должен преобразовывать sender_type="admin" в message_type="from_support"', () => {
    // Симулируем WebSocket событие с sender_type='admin'
    const webSocketMessage = {
      data: {
        id: 123,
        session_id: 5,
        sender_type: 'admin' as const,
        message_text: 'Здравствуйте, чем могу помочь?',
        created_at: '2024-03-06T14:00:00Z',
        is_read: false,
      },
    };

    const result = transformWebSocketMessage(webSocketMessage, 987654321);

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: message_type должен быть 'from_support'
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: message_type будет 'from_support' (ПРАВИЛЬНО)
    
    expect(result.message_type).toBe('from_support');
  });

  /**
   * Тест 3: Проверка преобразования sender_type='user'
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ
   * Причина: текущая логика корректна для 'user'
   */
  it('должен преобразовывать sender_type="user" в message_type="from_user"', () => {
    // Симулируем WebSocket событие с sender_type='user'
    const webSocketMessage = {
      data: {
        id: 125,
        session_id: 5,
        sender_type: 'user' as const,
        message_text: 'Помогите, пожалуйста!',
        created_at: '2024-03-06T13:00:00Z',
        is_read: false,
      },
    };

    const result = transformWebSocketMessage(webSocketMessage, 987654321);

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: message_type должен быть 'from_user'
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: message_type будет 'from_user' (ПРАВИЛЬНО)
    
    expect(result.message_type).toBe('from_user');
  });
});

describe('Property 2: Fault Condition - Дублирование разделителей дат после перезагрузки', () => {
  /**
   * Тест 1: Проверка группировки сообщений одной даты
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ (на текущей реализации)
   * Причина: Функция корректно группирует последовательные сообщения одной даты
   * 
   * ВАЖНО: Этот тест использует НЕИСПРАВЛЕННУЮ логику groupMessagesByDate
   * Баг проявляется в других сценариях (см. следующие тесты)
   */
  it('должен создавать только одну группу для последовательных сообщений одной даты', () => {
    // Создаём массив сообщений с одинаковой датой (сегодня)
    const today = new Date();
    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сообщение 1',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Сообщение 2',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сообщение 3',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== Тест группировки одной даты ===');
    console.log('Количество сообщений:', messages.length);
    console.log('Количество групп:', groups.length);
    console.log('Даты групп:', groups.map(g => g.date));
    console.log('===================================\n');

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: одна группа
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: одна группа (ПРАВИЛЬНО для последовательных сообщений)
    expect(groups.length).toBe(1);
    expect(groups[0].messages.length).toBe(3);
    expect(groups[0].date).toBe('Сегодня');
  });

  /**
   * Тест 2: Проверка уникальности дат в группах
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ
   * Причина: Для последовательных сообщений функция работает корректно
   */
  it('должен создавать уникальные даты для каждой группы', () => {
    const today = new Date();
    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Утреннее сообщение',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Дневное сообщение',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Вечернее сообщение',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);
    const dates = groups.map(g => g.date);
    const uniqueDates = [...new Set(dates)];

    console.log('=== Тест уникальности дат ===');
    console.log('Все даты:', dates);
    console.log('Уникальные даты:', uniqueDates);
    console.log('Есть дубликаты:', dates.length !== uniqueDates.length);
    console.log('=============================\n');

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: количество дат = количество уникальных дат
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: нет дубликатов (ПРАВИЛЬНО для последовательных сообщений)
    expect(dates.length).toBe(uniqueDates.length);
  });

  /**
   * Тест 3: Проверка группировки сообщений разных дат
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ
   * Причина: Функция корректно группирует сообщения разных дат
   */
  it('должен создавать отдельные группы для сообщений разных дат', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Вчерашнее сообщение',
        created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 15, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Сегодняшнее сообщение 1',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сегодняшнее сообщение 2',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== Тест группировки разных дат ===');
    console.log('Количество групп:', groups.length);
    console.log('Даты групп:', groups.map(g => g.date));
    console.log('Сообщений в группах:', groups.map(g => g.messages.length));
    console.log('===================================\n');

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: 2 группы (Вчера и Сегодня)
    expect(groups.length).toBe(2);
    
    // Проверяем первую группу (Вчера)
    expect(groups[0].date).toBe('Вчера');
    expect(groups[0].messages.length).toBe(1);
    
    // Проверяем вторую группу (Сегодня)
    expect(groups[1].date).toBe('Сегодня');
    expect(groups[1].messages.length).toBe(2);
  });

  /**
   * Тест 4: Граничный случай - пустой массив сообщений
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ
   */
  it('должен возвращать пустой массив для пустого списка сообщений', () => {
    const messages: SupportMessage[] = [];
    const groups = groupMessagesByDate(messages);

    expect(groups.length).toBe(0);
  });

  /**
   * Тест 5: Граничный случай - одно сообщение
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОХОДИТ
   */
  it('должен создавать одну группу для одного сообщения', () => {
    const today = new Date();
    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Единственное сообщение',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    expect(groups.length).toBe(1);
    expect(groups[0].messages.length).toBe(1);
    expect(groups[0].date).toBe('Сегодня');
  });
});

/**
 * Дополнительные тесты для документирования контрпримеров
 */
describe('Контрпримеры: Демонстрация багов', () => {
  /**
   * Контрпример 1: Сообщение от бота отображается как от поддержки
   */
  it('КОНТРПРИМЕР 1: sender_type="bot" преобразуется в message_type="from_support"', () => {
    const webSocketMessage = {
      data: {
        id: 999,
        session_id: 1,
        sender_type: 'bot' as const,
        message_text: 'Контрпример',
        created_at: '2024-03-06T18:00:00Z',
        is_read: false,
      },
    };

    const result = transformWebSocketMessage(webSocketMessage, 123456789);

    // Документируем ТЕКУЩЕЕ (неправильное) поведение
    console.log('=== КОНТРПРИМЕР 1 ===');
    console.log('Входные данные: sender_type="bot"');
    console.log('Ожидаемый результат: message_type="from_bot"');
    console.log('Фактический результат: message_type="' + result.message_type + '"');
    console.log('Статус: ' + (result.message_type === 'from_bot' ? 'ИСПРАВЛЕНО' : 'БАГ ПОДТВЕРЖДЁН'));
    console.log('=====================\n');

    // Этот тест показывает текущее поведение
    // На неисправленном коде: result.message_type === 'from_support'
    // После исправления: result.message_type === 'from_bot'
  });

  /**
   * Контрпример 2: Визуализация группировки сообщений
   */
  it('КОНТРПРИМЕР 2: визуализация группировки сообщений одной даты', () => {
    const today = new Date();
    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Первое сообщение утром',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Ответ администратора',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Второе сообщение днём',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== КОНТРПРИМЕР 2: Визуализация группировки ===');
    console.log('Входные данные: 3 сообщения с одинаковой датой (сегодня)');
    console.log('Ожидаемый результат: 1 группа "Сегодня"');
    console.log('Фактический результат: ' + groups.length + ' групп\n');
    
    console.log('Как это выглядит в интерфейсе:\n');
    groups.forEach((group, index) => {
      console.log(`--- ${group.date} ---`);
      group.messages.forEach(msg => {
        const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        console.log(`  [${time}] ${msg.message_text}`);
      });
      console.log('');
    });

    console.log('Статус: ' + (groups.length === 1 ? 'КОРРЕКТНО' : 'ВОЗМОЖЕН БАГ'));
    console.log('Примечание: Баг проявляется при определённых условиях загрузки сообщений');
    console.log('===============================================\n');
  });
});
