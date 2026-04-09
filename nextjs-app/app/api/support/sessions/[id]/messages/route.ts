/**
 * API Route: GET /api/support/sessions/[id]/messages
 * Получение истории сообщений конкретной сессии
 * Требует аутентификации через NextAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminRequestAuth } from '@/lib/auth/adminRequestAuth';
import { getDb } from '@/lib/database/client';

/**
 * Параметры маршрута
 */
interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/support/sessions/[id]/messages
 * Получает историю сообщений для конкретной сессии
 * 
 * Path параметры:
 * - id: ID сессии (обязательный)
 * 
 * Query параметры:
 * - limit: максимальное количество сообщений (опционально, по умолчанию без лимита)
 * - filter_commands: фильтровать системные команды (опционально, по умолчанию true)
 * 
 * Validates: Requirements 3.4, 7.3, 8.4
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Проверка аутентификации (Requirements 8.1, 8.5)
    const adminAuth = await resolveAdminRequestAuth(request);

    if (!adminAuth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Извлечение и валидация ID сессии (await для Promise params в Next.js 15+)
    const resolvedParams = await params;
    const sessionId = parseInt(resolvedParams.id, 10);

    if (isNaN(sessionId) || sessionId < 1) {
      return NextResponse.json(
        { error: 'Invalid session_id', message: 'ID сессии должен быть положительным числом' },
        { status: 400 }
      );
    }

    // Извлечение query параметров
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const filterCommandsParam = searchParams.get('filter_commands');

    // Валидация limit параметра (Requirements 7.3)
    let limit: number | undefined = undefined;
    if (limitParam) {
      limit = parseInt(limitParam, 10);
      if (isNaN(limit) || limit < 1) {
        return NextResponse.json(
          { error: 'Invalid limit', message: 'Лимит должен быть положительным числом' },
          { status: 400 }
        );
      }
    }

    // Валидация offset параметра для пагинации
    let offset: number = 0;
    if (offsetParam) {
      offset = parseInt(offsetParam, 10);
      if (isNaN(offset) || offset < 0) {
        return NextResponse.json(
          { error: 'Invalid offset', message: 'Offset должен быть неотрицательным числом' },
          { status: 400 }
        );
      }
    }

    // Параметр фильтрации команд (Requirements 8.4)
    // По умолчанию false - показываем все команды согласно Requirement 3
    const filterCommands = filterCommandsParam === 'true'; // По умолчанию false

    const db = getDb();

    // Проверяем существование сессии
    const supportSession = await db.getSession(sessionId);
    
    if (!supportSession) {
      return NextResponse.json(
        { error: 'Session not found', message: 'Сессия не найдена' },
        { status: 404 }
      );
    }

    // Обновление флагов при открытии диалога оператором (Bug Fix: Requirements 3.1, 3.2, 3.3, 4.6)
    try {
      // Помечаем все непрочитанные сообщения от пользователя как доставленные
      const updatedCount = await db.markMessagesAsDelivered(sessionId);
      console.log(`Marked ${updatedCount} messages as delivered for session ${sessionId}`);

      // Сбрасываем флаг help_needed если он был установлен
      if (supportSession.help_needed) {
        await db.setHelpNeeded(sessionId, false);
        console.log(`Reset help_needed flag for session ${sessionId}`);
      }
    } catch (flagUpdateError) {
      // Логируем ошибку, но не прерываем загрузку сообщений (Preservation: Requirements 3.1, 3.2, 4.6)
      console.error('Failed to update message flags:', {
        session_id: sessionId,
        error: flagUpdateError instanceof Error ? flagUpdateError.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }

    // Получаем сообщения с учётом параметров
    let messages = await db.getMessages(sessionId);

    // Фильтрация системных команд (Requirements 8.4)
    if (filterCommands) {
      const systemCommands = ['/start', '/help'];
      messages = messages.filter(msg => {
        // Фильтруем только сообщения от пользователя
        if (msg.message_type !== 'from_user') {
          return true;
        }
        // Проверяем, не является ли сообщение системной командой
        const text = msg.message_text.trim();
        return !systemCommands.some(cmd => text.startsWith(cmd));
      });
    }

    // Общее количество сообщений (до применения пагинации)
    const totalMessages = messages.length;

    // Применяем offset и limit для пагинации (Requirements 7.3)
    if (offset > 0 || limit) {
      const startIndex = offset;
      const endIndex = limit ? offset + limit : messages.length;
      messages = messages.slice(startIndex, endIndex);
    }

    // Определяем, есть ли ещё сообщения
    const hasMore = offset + messages.length < totalMessages;

    return NextResponse.json(
      {
        messages,
        session: supportSession,
        total: totalMessages,
        offset,
        limit: limit || totalMessages,
        has_more: hasMore,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('GET /api/support/sessions/[id]/messages error:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Не удалось получить историю сообщений. Попробуйте позже.'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/sessions/[id]/messages
 * Отправляет сообщение от администратора пользователю
 * 
 * Path параметры:
 * - id: ID сессии (обязательный)
 * 
 * Body:
 * - message_text: текст сообщения (обязательный)
 * 
 * Validates: Requirements 4.2, 4.3, 4.4, 8.3
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Проверка аутентификации (Requirements 8.1, 8.5)
    const adminAuth = await resolveAdminRequestAuth(request);

    if (!adminAuth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Извлечение и валидация ID сессии (await для Promise params в Next.js 15+)
    const resolvedParams = await params;
    const sessionId = parseInt(resolvedParams.id, 10);

    if (isNaN(sessionId) || sessionId < 1) {
      return NextResponse.json(
        { error: 'Invalid session_id', message: 'ID сессии должен быть положительным числом' },
        { status: 400 }
      );
    }

    // Парсинг тела запроса
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Некорректный формат JSON' },
        { status: 400 }
      );
    }

    // Валидация message_text
    const { message_text } = body;

    if (!message_text || typeof message_text !== 'string') {
      return NextResponse.json(
        { error: 'Missing message_text', message: 'Поле message_text обязательно' },
        { status: 400 }
      );
    }

    const trimmedText = message_text.trim();

    if (trimmedText.length === 0) {
      return NextResponse.json(
        { error: 'Empty message_text', message: 'Текст сообщения не может быть пустым' },
        { status: 400 }
      );
    }

    if (trimmedText.length > 4096) {
      return NextResponse.json(
        { error: 'Message too long', message: 'Текст сообщения не может превышать 4096 символов' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Проверяем существование сессии
    const supportSession = await db.getSession(sessionId);
    
    if (!supportSession) {
      return NextResponse.json(
        { error: 'Session not found', message: 'Сессия не найдена' },
        { status: 404 }
      );
    }

    // Проверяем, что сессия активна
    if (supportSession.status !== 'active') {
      return NextResponse.json(
        { error: 'Session closed', message: 'Сессия уже закрыта' },
        { status: 400 }
      );
    }

    const telegram_id = supportSession.telegram_id;

    // Автоматическое преобразование Chat_Session в Support_Session (Requirements 4.3)
    if (supportSession.session_type === 'chat') {
      await db.updateSessionType(sessionId, 'support');
      
      // Логирование преобразования (Requirements 8.3)
      console.log('Session type converted', {
        session_id: sessionId,
        from: 'chat',
        to: 'support',
        admin_id: adminAuth.adminId,
        timestamp: new Date().toISOString(),
      });
    }

    // Сохраняем сообщение в БД с типом 'from_support' (Requirements 4.4)
    const savedMessage = await db.saveMessage({
      session_id: sessionId,
      telegram_id,
      message_type: 'from_support',
      message_text: trimmedText,
    });

    // Логирование действия администратора (Requirements 8.3)
    console.log('Admin message sent', {
      session_id: sessionId,
      message_id: savedMessage.id,
      admin_id: adminAuth.adminId,
      telegram_id,
      message_length: trimmedText.length,
      timestamp: new Date().toISOString(),
    });

    // Отправляем сообщение через Telegram Bot API (Requirements 4.2)
    const botToken = process.env.BOT_TOKEN;
    
    if (!botToken) {
      console.error('BOT_TOKEN environment variable is not set');
      return NextResponse.json(
        { 
          error: 'Configuration error',
          message: 'Бот не настроен. Обратитесь к администратору.'
        },
        { status: 500 }
      );
    }

    const { TelegramBotApi } = await import('@/lib/telegram/botApi');
    const botApi = new TelegramBotApi(botToken);
    
    try {
      await botApi.sendMessage(telegram_id, trimmedText);
      
      // Отмечаем сообщение как доставленное
      await db.markMessageAsDelivered(savedMessage.id);
      
      // Обновляем статус доставки в объекте
      savedMessage.delivered = true;

      return NextResponse.json(
        {
          success: true,
          message: savedMessage,
          session: {
            ...supportSession,
            session_type: 'support', // Обновлённый тип
          },
        },
        { status: 200 }
      );

    } catch (telegramError) {
      // Ошибка отправки через Telegram API
      console.error('Telegram API error:', telegramError);
      
      // Логирование ошибки доставки (Requirements 8.3)
      console.error('Message delivery failed', {
        session_id: sessionId,
        message_id: savedMessage.id,
        telegram_id,
        error: telegramError instanceof Error ? telegramError.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      
      // Сообщение сохранено в БД, но не доставлено
      return NextResponse.json(
        {
          error: 'Telegram API error',
          message: 'Не удалось отправить сообщение через Telegram',
          saved_message: savedMessage,
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('POST /api/support/sessions/[id]/messages error:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Не удалось отправить сообщение. Попробуйте позже.'
      },
      { status: 500 }
    );
  }
}

