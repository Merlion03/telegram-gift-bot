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
import { PrizeClient, PrizeNotFoundError, BackendUnavailableError } from '@/lib/api/prizeClient';
import type { PrizeInfo } from '@/lib/types/prize';
import { validateSheetName } from '@/lib/utils/sheetNameValidator';
import { SheetNotFoundError, SheetAccessDeniedError } from '@/lib/types/sheet';

/**
 * Схема валидации данных доставки
 * 
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 4.5
 */
const deliverySchema = z.object({
  // ФИО поля
  last_name: z
    .string()
    .trim()
    .min(2, 'Фамилия должна содержать минимум 2 символа')
    .max(50, 'Фамилия не должна превышать 50 символов'),
  first_name: z
    .string()
    .trim()
    .min(2, 'Имя должно содержать минимум 2 символа')
    .max(50, 'Имя не должно превышать 50 символов'),
  patronymic: z
    .string()
    .trim()
    .min(2, 'Отчество должно содержать минимум 2 символа')
    .max(50, 'Отчество не должно превышать 50 символов')
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Адресные поля
  country: z
    .string()
    .trim()
    .min(2, 'Страна должна содержать минимум 2 символа')
    .max(100, 'Страна не должна превышать 100 символов'),
  postal_code: z
    .string()
    .trim()
    .min(3, 'Почтовый индекс должен содержать минимум 3 символа')
    .max(20, 'Почтовый индекс не должен превышать 20 символов'),
  city: z
    .string()
    .trim()
    .min(2, 'Город должен содержать минимум 2 символа')
    .max(100, 'Город не должен превышать 100 символов'),
  street: z
    .string()
    .trim()
    .min(2, 'Улица должна содержать минимум 2 символа')
    .max(200, 'Улица не должна превышать 200 символов'),
  house: z
    .string()
    .trim()
    .min(1, 'Дом должен содержать минимум 1 символ')
    .max(20, 'Дом не должен превышать 20 символов'),
  apartment: z
    .string()
    .trim()
    .min(1, 'Квартира должна содержать минимум 1 символ')
    .max(20, 'Квартира не должна превышать 20 символов')
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Существующие поля
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9]{10,15}$/,
      'Неверный формат телефона. Используйте формат: +79991234567'
    ),
  comment: z
    .string()
    .trim()
    .max(500, 'Комментарий не должен превышать 500 символов')
    .optional(),
  
  // Служебные поля
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
    const backendUrl = process.env.BACKEND_API_URL;

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

    if (!backendUrl) {
      console.error('BACKEND_API_URL environment variable is not set');
      return NextResponse.json(
        {
          error: 'Configuration error',
          message: 'Backend URL не настроен',
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

    // Получение информации о призе из Backend API (Requirement 2.1, 9.2)
    const prizeClient = new PrizeClient(backendUrl);
    
    let prizeInfo: PrizeInfo;
    try {
      prizeInfo = await prizeClient.getPrizeInfo(validatedData.prize_id);
    } catch (error) {
      if (error instanceof PrizeNotFoundError) {
        // Requirement 9.4: Обработка HTTP 404 от Backend
        console.error('Prize not found:', error.message);
        return NextResponse.json(
          {
            error: 'Prize not found',
            message: 'Приз не найден',
          },
          { status: 404 }
        );
      }
      if (error instanceof BackendUnavailableError) {
        // Requirement 6.5: Обработка недоступности Backend
        console.error('Backend unavailable:', error.message);
        return NextResponse.json(
          {
            error: 'Backend unavailable',
            message: 'Сервис временно недоступен',
          },
          { status: 503 }
        );
      }
      // Неожиданная ошибка
      console.error('Unexpected error getting prize info:', error);
      throw error;
    }

    // Валидация sheet_name (Requirement 2.4, 10.1-10.4)
    try {
      validateSheetName(prizeInfo.sheet_name);
    } catch (error) {
      console.error('Invalid sheet name from backend:', {
        sheet_name: prizeInfo.sheet_name,
        prize_id: validatedData.prize_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return NextResponse.json(
        {
          error: 'Invalid sheet name',
          message: 'Некорректное название листа',
        },
        { status: 500 }
      );
    }

    // Логирование sheet_name (Requirement 2.5, 7.5)
    console.log(`Using sheet: ${prizeInfo.sheet_name} for prize ${validatedData.prize_id}`);

    // Санитизация данных перед сохранением (Requirement 12.3)
    const sanitizedData = sanitizeDeliveryData({
      last_name: validatedData.last_name,
      first_name: validatedData.first_name,
      patronymic: validatedData.patronymic || '',
      country: validatedData.country,
      postal_code: validatedData.postal_code,
      city: validatedData.city,
      street: validatedData.street,
      house: validatedData.house,
      apartment: validatedData.apartment || '',
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
      // Requirement 2.2, 9.5: Передача sheet_name в GoogleSheetsClient
      const success = await sheetsClient.saveDeliveryData(
        prizeInfo.row_id,
        sanitizedData,
        prizeInfo.sheet_name
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
      // Requirement 6.4: Обработка ошибок GoogleSheetsClient
      if (error instanceof SheetNotFoundError) {
        console.error('Sheet not found:', {
          sheet_name: prizeInfo.sheet_name,
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
          error: error.message,
        });
        return NextResponse.json(
          {
            error: 'Sheet not found',
            message: 'Лист не найден в таблице',
          },
          { status: 500 }
        );
      }
      
      if (error instanceof SheetAccessDeniedError) {
        console.error('Access denied to sheet:', {
          sheet_name: prizeInfo.sheet_name,
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
          error: error.message,
        });
        return NextResponse.json(
          {
            error: 'Access denied',
            message: 'Нет доступа к листу',
          },
          { status: 500 }
        );
      }
      
      // Requirement 4.7, 6.3, 7.4: Обработка общих ошибок с контекстом
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('Failed to save delivery data to Google Sheets:', {
        error: errorMessage,
        sheet_name: prizeInfo.sheet_name,
        prize_id: validatedData.prize_id,
        telegram_id: telegramId,
        stack: error instanceof Error ? error.stack : undefined,
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
