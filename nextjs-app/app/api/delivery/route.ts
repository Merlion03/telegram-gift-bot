/**
 * API Route для обработки данных доставки физических призов
 * 
 * POST /api/delivery
 * 
 * Выполняет:
 * 1. Валидацию схемы данных с помощью Zod
 * 2. Криптографическую проверку InitData от Telegram
 * 3. Сохранение данных доставки в Google Sheets
 * 4. Обработку всех типов ошибок (400, 403, 500)
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 15.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { GoogleSheetsClient } from '@/lib/google/sheetsClient';
import { sanitizeDeliveryData } from '@/lib/utils/sanitize';

/**
 * Схема валидации данных доставки
 * 
 * Validates: Requirements 4.1, 4.2
 */
const deliverySchema = z.object({
  full_name: z
    .string()
    .min(2, 'ФИО должно содержать минимум 2 символа')
    .max(100, 'ФИО не должно превышать 100 символов')
    .trim(),
  address: z
    .string()
    .min(10, 'Адрес должен содержать минимум 10 символов')
    .max(500, 'Адрес не должен превышать 500 символов')
    .trim(),
  phone: z
    .string()
    .regex(
      /^\+?[0-9]{10,15}$/,
      'Неверный формат телефона. Используйте формат: +79991234567'
    )
    .trim(),
  comment: z
    .string()
    .max(500, 'Комментарий не должен превышать 500 символов')
    .trim()
    .optional(),
  prize_id: z
    .number()
    .int('Prize ID должен быть целым числом')
    .positive('Prize ID должен быть положительным числом'),
  initData: z.string().min(1, 'InitData обязателен'),
});

/**
 * Тип данных доставки после валидации
 */
type DeliveryRequestData = z.infer<typeof deliverySchema>;

/**
 * POST /api/delivery
 * 
 * Обрабатывает запрос на сохранение данных доставки
 * 
 * @param request - Next.js request объект
 * @returns JSON response с результатом операции
 */
export async function POST(request: NextRequest) {
  try {
    // Парсинг тела запроса
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid JSON',
          message: 'Тело запроса должно быть валидным JSON',
        },
        { status: 400 }
      );
    }

    // Валидация схемы данных (Requirement 4.1, 4.2)
    let validatedData: DeliveryRequestData;
    try {
      validatedData = deliverySchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: 'Validation error',
            message: 'Ошибка валидации данных',
            details: error.errors.map((err) => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Проверка наличия необходимых переменных окружения
    const botToken = process.env.BOT_TOKEN;
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!botToken) {
      console.error('BOT_TOKEN environment variable is not set');
      return NextResponse.json(
        {
          error: 'Configuration error',
          message: 'Сервер неправильно настроен',
        },
        { status: 500 }
      );
    }

    if (!credentialsPath && !process.env.GOOGLE_CREDENTIALS_JSON) {
      console.error('Google credentials not configured');
      return NextResponse.json(
        {
          error: 'Configuration error',
          message: 'Сервер неправильно настроен',
        },
        { status: 500 }
      );
    }

    if (!spreadsheetId) {
      console.error('SPREADSHEET_ID environment variable is not set');
      return NextResponse.json(
        {
          error: 'Configuration error',
          message: 'Сервер неправильно настроен',
        },
        { status: 500 }
      );
    }

    // Криптографическая валидация InitData (Requirement 4.3)
    const validator = new InitDataValidator(botToken);
    
    try {
      validator.validate(validatedData.initData);
    } catch (error) {
      // Requirement 4.4: Отклонение запроса с HTTP 403 при невалидных InitData
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.warn('InitData validation failed:', errorMessage);
      
      return NextResponse.json(
        {
          error: 'Invalid signature',
          message: 'Невалидная подпись InitData',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    // Извлечение данных пользователя из InitData
    let telegramId: number;
    try {
      const userData = validator.extractUserData(validatedData.initData);
      telegramId = userData.id;
    } catch (error) {
      console.error('Failed to extract user data:', error);
      return NextResponse.json(
        {
          error: 'Invalid InitData',
          message: 'Не удалось извлечь данные пользователя',
        },
        { status: 403 }
      );
    }

    // Санитизация данных перед сохранением (Requirement 12.3)
    const sanitizedData = sanitizeDeliveryData({
      full_name: validatedData.full_name,
      address: validatedData.address,
      phone: validatedData.phone,
      comment: validatedData.comment,
      telegram_id: telegramId,
    });

    // Сохранение данных в Google Sheets (Requirement 4.5)
    const sheetsClient = new GoogleSheetsClient(
      credentialsPath || '',
      spreadsheetId
    );

    try {
      const success = await sheetsClient.saveDeliveryData(
        validatedData.prize_id,
        sanitizedData
      );

      if (!success) {
        throw new Error('saveDeliveryData returned false');
      }

      // Успешное сохранение
      return NextResponse.json(
        {
          success: true,
          message: 'Данные доставки успешно сохранены',
        },
        { status: 200 }
      );
    } catch (error) {
      // Requirement 4.7: Обработка ошибки сохранения в Google Sheets
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('Failed to save delivery data to Google Sheets:', {
        error: errorMessage,
        prize_id: validatedData.prize_id,
        telegram_id: telegramId,
      });

      return NextResponse.json(
        {
          error: 'Failed to save delivery data',
          message: 'Не удалось сохранить данные доставки. Попробуйте позже.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    // Обработка непредвиденных ошибок
    console.error('Unexpected error in delivery API:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Произошла внутренняя ошибка сервера',
      },
      { status: 500 }
    );
  }
}
