/**
 * API Routes: GET/POST /api/support/messages
 * Получение и отправка сообщений поддержки
 * Требует аутентификации через NextAuth
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getDb } from '@/lib/database/client';
import { TelegramBotApi } from '@/lib/telegram/botApi';
import type { SendReplyData } from '@/types/support';
import { z } from 'zod';

/**
 * Схема валидации для отправки сообщения
 */
const sendReplySchema = z.object({
  session_id: z.number().int().positive(),
  telegram_id: z.number().int().positive(),
  message_text: z.string().trim().min(2).max(4096), // Telegram лимит на длину сообщения, минимум 2 символа после trim
});

/**
 * GET /api/support/messages
 * Получает все сообщения для конкретной сессии поддержки
 * 
 * Query параметры:
 * - session_id: ID сессии (обязательный)
 * 
 * Validates: Requirements 7.5
 */
export async function GET(request: NextRequest) {
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Извлечение параметров запроса
    const { searchParams } = new URL(request.url);
    const sessionIdParam = searchParams.get('session_id');

    if (!sessionIdParam) {
      return NextResponse.json(
        { error: 'Missing session_id', message: 'Параметр session_id обязателен' },
        { status: 400 }
      );
    }

    const sessionId = parseInt(sessionIdParam, 10);

    if (isNaN(sessionId) || sessionId < 1) {
      return NextResponse.json(
        { error: 'Invalid session_id', message: 'session_id должен быть положительным числом' },
        { status: 400 }
      );
    }

    // Получение сообщений из БД
    const db = getDb();
    
    // Проверяем существование сессии
    const supportSession = await db.getSession(sessionId);
    
    if (!supportSession) {
      return NextResponse.json(
        { error: 'Session not found', message: 'Сессия не найдена' },
        { status: 404 }
      );
    }

    const messages = await db.getMessages(sessionId);

    return NextResponse.json(
      {
        messages,
        session: supportSession,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('GET /api/support/messages error:', error);
    
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
        message: 'Не удалось получить сообщения. Попробуйте позже.'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/messages
 * Отправляет ответ пользователю от службы поддержки
 * 
 * Body:
 * - session_id: ID сессии
 * - telegram_id: Telegram ID пользователя
 * - message_text: Текст сообщения
 * 
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.6
 */
export async function POST(request: NextRequest) {
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    // Парсинг и валидация тела запроса
    const body = await request.json();
    
    let validatedData: SendReplyData;
    try {
      validatedData = sendReplySchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'Validation error',
            message: 'Ошибка валидации данных',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const { session_id, telegram_id, message_text } = validatedData;

    const db = getDb();

    // Проверяем существование сессии
    const supportSession = await db.getSession(session_id);
    
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

    // Сохраняем сообщение в БД
    const savedMessage = await db.saveMessage({
      session_id,
      telegram_id,
      message_type: 'from_support',
      message_text,
    });

    // Отправляем сообщение через Telegram Bot API
    const botToken = process.env.BOT_TOKEN;
    
    if (!botToken) {
      throw new Error('BOT_TOKEN environment variable is not set');
    }

    const botApi = new TelegramBotApi(botToken);
    
    try {
      await botApi.sendMessage(telegram_id, message_text);
      
      // Отмечаем сообщение как доставленное
      await db.markMessageAsDelivered(savedMessage.id);
      
      // Обновляем статус доставки в объекте
      savedMessage.delivered = true;

      return NextResponse.json(
        {
          success: true,
          message: savedMessage,
        },
        { status: 200 }
      );

    } catch (telegramError) {
      // Ошибка отправки через Telegram API
      console.error('Telegram API error:', telegramError);
      
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
    console.error('POST /api/support/messages error:', error);
    
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
