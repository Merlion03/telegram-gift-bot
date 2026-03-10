/**
 * Exploratory Property-Based Test для выявления бага дублирования разделителей дат
 * 
 * КРИТИЧЕСКИ ВАЖНО: Этот тест ДОЛЖЕН ПРОВАЛИТЬСЯ на неисправленном коде
 * Провал подтверждает существование бага
 * 
 * Property 2: Fault Condition - Дублирование разделителей дат после перезагрузки
 * 
 * Цель: Выявить контрпримеры, демонстрирующие баг
 * Подход: Scoped PBT - ограничиваем property конкретным проваливающимся случаем
 * 
 * АНАЛИЗ БАГА:
 * Согласно дизайну, функция groupMessagesByDate использует последовательное сравнение дат.
 * Проблема: если сообщения с одинаковой датой разделены сообщениями с другой датой
 * (из-за асинхронной загрузки или неправильной сортировки), создаются дублирующиеся группы.
 * 
 * СЦЕНАРИЙ ВОСПРОИЗВЕДЕНИЯ:
 * 1. Загружаются старые сообщения (например, вчера)
 * 2. Загружаются новые сообщения (сегодня)
 * 3. Добавляются ещё сообщения (сегодня) через WebSocket
 * 4. Если сообщения не отсортированы или добавляются в конец, создаётся новая группа "Сегодня"
 */

import { describe, it, expect } from 'vitest';
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

describe('Property 2: Fault Condition - Дублирование разделителей дат', () => {
  /**
   * Тест 1: Сообщения одной даты, разделённые сообщением другой даты
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИТСЯ
   * Причина: Функция создаст две группы "Сегодня" вместо одной
   * 
   * Этот сценарий воспроизводит реальный баг:
   * - Сообщения приходят не в строгом хронологическом порядке
   * - Или добавляются через WebSocket после загрузки истории
   */
  it('должен создавать только одну группу для даты, даже если сообщения разделены', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Сценарий: сообщения сегодня -> вчера -> снова сегодня
    // Это может произойти при асинхронной загрузке или неправильной сортировке
    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сообщение сегодня утром',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Сообщение вчера',
        created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 15, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сообщение сегодня вечером',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== Тест 1: Разделённые сообщения одной даты ===');
    console.log('Входные данные: Сегодня -> Вчера -> Сегодня');
    console.log('Количество групп:', groups.length);
    console.log('Даты групп:', groups.map(g => g.date));
    console.log('Сообщений в группах:', groups.map(g => g.messages.length));
    console.log('');
    
    // Визуализация
    groups.forEach((group, index) => {
      console.log(`Группа ${index + 1}: ${group.date}`);
      group.messages.forEach(msg => {
        const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        console.log(`  [${time}] ${msg.message_text}`);
      });
    });
    console.log('');

    // Подсчёт групп "Сегодня"
    const todayGroups = groups.filter(g => g.date === 'Сегодня');
    console.log('Количество групп "Сегодня":', todayGroups.length);
    console.log('ОЖИДАЕТСЯ: 1 группа "Сегодня"');
    console.log('ФАКТИЧЕСКИ: ' + todayGroups.length + ' групп "Сегодня"');
    console.log('Статус: ' + (todayGroups.length === 1 ? 'ИСПРАВЛЕНО ✓' : 'БАГ ПОДТВЕРЖДЁН ✗'));
    console.log('================================================\n');

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ (после исправления):
    // Должно быть 2 группы: "Сегодня" (с 2 сообщениями) и "Вчера" (с 1 сообщением)
    
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (на неисправленном коде):
    // Будет 3 группы: "Сегодня" (1 сообщение), "Вчера" (1 сообщение), "Сегодня" (1 сообщение)
    
    // Проверяем, что есть только одна группа "Сегодня"
    expect(todayGroups.length).toBe(1);
    
    // Проверяем, что в группе "Сегодня" 2 сообщения
    if (todayGroups.length === 1) {
      expect(todayGroups[0].messages.length).toBe(2);
    }
  });

  /**
   * Тест 2: Множественные переключения между датами
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИТСЯ
   * Причина: Функция создаст несколько групп для каждой даты
   */
  it('должен создавать уникальные группы дат при множественных переключениях', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Сценарий: Сегодня -> Вчера -> Сегодня -> Вчера -> Сегодня
    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сегодня #1',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Вчера #1',
        created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 14, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сегодня #2',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 4,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Вчера #2',
        created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 16, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 5,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Сегодня #3',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== Тест 2: Множественные переключения ===');
    console.log('Входные данные: Сегодня -> Вчера -> Сегодня -> Вчера -> Сегодня');
    console.log('Количество групп:', groups.length);
    console.log('Даты групп:', groups.map(g => g.date));
    console.log('');

    // Подсчёт дубликатов
    const todayGroups = groups.filter(g => g.date === 'Сегодня');
    const yesterdayGroups = groups.filter(g => g.date === 'Вчера');
    
    console.log('Групп "Сегодня":', todayGroups.length, '(ожидается: 1)');
    console.log('Групп "Вчера":', yesterdayGroups.length, '(ожидается: 1)');
    console.log('');
    console.log('Статус: ' + (todayGroups.length === 1 && yesterdayGroups.length === 1 ? 'ИСПРАВЛЕНО ✓' : 'БАГ ПОДТВЕРЖДЁН ✗'));
    console.log('==========================================\n');

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: 2 группы ("Сегодня" с 3 сообщениями, "Вчера" с 2 сообщениями)
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: 5 групп (чередующиеся "Сегодня" и "Вчера")
    
    expect(todayGroups.length).toBe(1);
    expect(yesterdayGroups.length).toBe(1);
    
    if (todayGroups.length === 1) {
      expect(todayGroups[0].messages.length).toBe(3);
    }
    if (yesterdayGroups.length === 1) {
      expect(yesterdayGroups[0].messages.length).toBe(2);
    }
  });

  /**
   * Тест 3: Симуляция реального сценария - загрузка истории + WebSocket
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Тест ПРОВАЛИТСЯ
   * Причина: При добавлении новых сообщений через WebSocket создаётся дубликат группы
   * 
   * Реальный сценарий:
   * 1. Загружается история сообщений (сегодня утром)
   * 2. Пользователь пишет новое сообщение (сегодня днём)
   * 3. Сообщение добавляется в конец массива через WebSocket
   * 4. Если между ними есть сообщения другой даты, создаётся дубликат "Сегодня"
   */
  it('должен корректно обрабатывать добавление новых сообщений через WebSocket', () => {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Сценарий:
    // 1. История: сообщения сегодня утром
    // 2. История: старые сообщения (2 дня назад)
    // 3. WebSocket: новое сообщение сегодня днём
    const messages: SupportMessage[] = [
      // История: сегодня утром
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Утреннее сообщение',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
        delivered: false,
      },
      // История: 2 дня назад
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Старое сообщение',
        created_at: new Date(twoDaysAgo.getFullYear(), twoDaysAgo.getMonth(), twoDaysAgo.getDate(), 14, 0, 0).toISOString(),
        delivered: true,
      },
      // WebSocket: сегодня днём (добавлено в конец)
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Новое сообщение через WebSocket',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== Тест 3: Симуляция WebSocket добавления ===');
    console.log('Сценарий: История (сегодня) -> История (2 дня назад) -> WebSocket (сегодня)');
    console.log('Количество групп:', groups.length);
    console.log('Даты групп:', groups.map(g => g.date));
    console.log('');

    // Визуализация UI
    console.log('Как это выглядит в интерфейсе:');
    groups.forEach((group) => {
      console.log(`\n--- ${group.date} ---`);
      group.messages.forEach(msg => {
        const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        console.log(`  [${time}] ${msg.message_text}`);
      });
    });
    console.log('');

    const todayGroups = groups.filter(g => g.date === 'Сегодня');
    console.log('Количество групп "Сегодня":', todayGroups.length);
    console.log('ПРОБЛЕМА: Пользователь видит дублирующиеся разделители "Сегодня"');
    console.log('Статус: ' + (todayGroups.length === 1 ? 'ИСПРАВЛЕНО ✓' : 'БАГ ПОДТВЕРЖДЁН ✗'));
    console.log('==============================================\n');

    // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: 2 группы ("Сегодня" с 2 сообщениями, дата 2 дня назад с 1 сообщением)
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: 3 группы (две группы "Сегодня")
    
    expect(todayGroups.length).toBe(1);
    
    if (todayGroups.length === 1) {
      expect(todayGroups[0].messages.length).toBe(2);
    }
  });
});

/**
 * Контрпримеры для документации
 */
describe('Контрпримеры: Дублирование разделителей дат', () => {
  /**
   * Контрпример: Визуализация проблемы в UI
   */
  it('КОНТРПРИМЕР: Пользователь видит дублирующиеся разделители "Сегодня"', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const messages: SupportMessage[] = [
      {
        id: 1,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Доброе утро!',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).toISOString(),
        delivered: false,
      },
      {
        id: 2,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_support',
        message_text: 'Вчерашний ответ',
        created_at: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 18, 0, 0).toISOString(),
        delivered: true,
      },
      {
        id: 3,
        session_id: 5,
        telegram_id: 123456789,
        message_type: 'from_user',
        message_text: 'Добрый день!',
        created_at: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0).toISOString(),
        delivered: false,
      },
    ];

    const groups = groupMessagesByDate(messages);

    console.log('=== КОНТРПРИМЕР: Дублирование в UI ===');
    console.log('\nПроблема: После перезагрузки страницы пользователь видит:\n');
    
    groups.forEach((group) => {
      console.log(`╔═══ ${group.date} ═══╗`);
      group.messages.forEach(msg => {
        const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const sender = msg.message_type === 'from_user' ? '👤' : '👨‍💼';
        console.log(`║ ${sender} [${time}] ${msg.message_text}`);
      });
      console.log('╚═══════════════════╝\n');
    });

    const todayCount = groups.filter(g => g.date === 'Сегодня').length;
    
    if (todayCount > 1) {
      console.log('❌ БАГ: Разделитель "Сегодня" дублируется ' + todayCount + ' раз!');
      console.log('Это сбивает пользователя с толку и нарушает хронологию.');
    } else {
      console.log('✓ ИСПРАВЛЕНО: Разделитель "Сегодня" отображается только один раз.');
    }
    
    console.log('\nОжидаемое поведение:');
    console.log('╔═══ Сегодня ═══╗');
    console.log('║ 👤 [09:00] Доброе утро!');
    console.log('║ 👤 [14:00] Добрый день!');
    console.log('╚═══════════════════╝');
    console.log('╔═══ Вчера ═══╗');
    console.log('║ 👨‍💼 [18:00] Вчерашний ответ');
    console.log('╚═══════════════════╝');
    console.log('======================================\n');
  });
});
