/**
 * API Route для обработки данных доставки физических призов
 * 
 * POST /api/delivery
 * 
 * АРХИТЕКТУРА:
 * Данные доставки сохраняются напрямую в PostgreSQL через Backend API,
 * а затем асинхронно синхронизируются в Google Sheets через Sync_Worker.
 * Это обеспечивает быстрый ответ пользователю без задержек от Google Sheets API.
 * 
 * ПРОЦЕСС ОБРАБОТКИ:
 * 1. Валидация схемы данных с помощью Zod (country, postal_code и другие поля)
 * 2. Криптографическая проверка InitData от Telegram
 * 3. Получение информации о призе из Backend API
 * 4. Валидация владения призом (prize_id принадлежит telegram_id)
 * 5. Сохранение данных доставки в PostgreSQL через Backend API endpoint /api/delivery/update
 * 6. Возврат успешного ответа пользователю
 * 
 * ПРОИЗВОДИТЕЛЬНОСТЬ:
 * Ожидаемое время ответа: < 500 мс (вместо 3 секунд при прямом сохранении в Google Sheets)
 * 
 * КОДЫ ОШИБОК:
 * - 400: Ошибка валидации данных (невалидная схема, некорректные поля)
 * - 403: Доступ запрещён (невалидная подпись InitData или приз не принадлежит пользователю)
 * - 404: Приз не найден в PostgreSQL
 * - 500: Внутренняя ошибка сервера (конфигурация, невалидный sheet_name)
 * - 503: База данных PostgreSQL или Backend API временно недоступны
 * 
 * ЗАВИСИМОСТИ:
 * - Backend API endpoint /api/delivery/update для сохранения данных в PostgreSQL
 * - Telegram Bot API для валидации InitData
 * - НЕ зависит от Google Sheets API (синхронизация выполняется асинхронно)
 * 
 * Requirements: 1.1, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3, 13.1, 13.2, 13.3, 13.4, 13.5, 16.1, 16.2, 16.3, 16.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { InitDataValidator } from '@/lib/telegram/initDataValidator';
import { sanitizeDeliveryData } from '@/lib/utils/sanitize';
import { PrizeClient, PrizeNotFoundError, BackendUnavailableError } from '@/lib/api/prizeClient';
import type { PrizeInfo } from '@/lib/types/prize';
import { validateSheetName } from '@/lib/utils/sheetNameValidator';

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
  message_id: z.number().int().positive().optional(), // ID сообщения с кнопкой для удаления
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

    // Сохранение данных в PostgreSQL через Backend API (Requirement 1.1, 7.1, 7.2, 7.3)
    const startTime = Date.now();
    
    try {
      const backendResponse = await fetch(`${backendUrl}/api/delivery/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
          delivery_data: {
            last_name: sanitizedData.last_name,
            first_name: sanitizedData.first_name,
            patronymic: sanitizedData.patronymic || undefined,
            country: sanitizedData.country,
            postal_code: sanitizedData.postal_code,
            city: sanitizedData.city,
            street: sanitizedData.street,
            house: sanitizedData.house,
            apartment: sanitizedData.apartment || undefined,
            phone: sanitizedData.phone,
            comment: sanitizedData.comment || undefined,
          },
        }),
      });

      const elapsedTime = Date.now() - startTime;
      console.log(`Backend API request completed in ${elapsedTime}ms`);

      // Обработка ответов Backend API (Requirement 7.2, 7.3)
      if (backendResponse.status === 403) {
        // Доступ запрещён - приз не принадлежит пользователю
        console.error('Access denied from backend:', {
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
        });
        return NextResponse.json(
          {
            error: 'Access denied',
            message: 'Доступ запрещён',
          },
          { status: 403 }
        );
      }

      if (backendResponse.status === 404) {
        // Приз не найден
        console.error('Prize not found in backend:', {
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
        });
        return NextResponse.json(
          {
            error: 'Prize not found',
            message: 'Приз не найден',
          },
          { status: 404 }
        );
      }

      if (backendResponse.status === 503) {
        // База данных недоступна (Requirement 7.1)
        console.error('Database unavailable from backend:', {
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
        });
        return NextResponse.json(
          {
            error: 'Database unavailable',
            message: 'База данных временно недоступна',
          },
          { status: 503 }
        );
      }

      if (!backendResponse.ok) {
        // Другие ошибки Backend API
        const errorText = await backendResponse.text();
        console.error('Backend API error:', {
          status: backendResponse.status,
          error: errorText,
          prize_id: validatedData.prize_id,
          telegram_id: telegramId,
        });
        return NextResponse.json(
          {
            error: 'Backend error',
            message: 'Не удалось сохранить данные доставки. Попробуйте позже.',
          },
          { status: 500 }
        );
      }

      // Успешное сохранение (Requirement 1.5)
      // Отправляем данные в Telegram бота для отправки уведомлений пользователю
      try {
        const botApiUrl = `${backendUrl}/bot/delivery-notification`;
        const notificationResponse = await fetch(botApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            telegram_id: telegramId,
            prize_id: validatedData.prize_id,
            message_id: validatedData.message_id, // Передаём message_id для удаления клавиатуры
          }),
        });

        if (!notificationResponse.ok) {
          console.error('Failed to send notification to bot:', {
            status: notificationResponse.status,
            telegram_id: telegramId,
            prize_id: validatedData.prize_id,
          });
          // Не блокируем успешный ответ пользователю, если уведомление не отправилось
        }
      } catch (notificationError) {
        console.error('Error sending notification to bot:', notificationError);
        // Не блокируем успешный ответ пользователю
      }

      return NextResponse.json(
        {
          success: true,
          message: 'Данные доставки успешно сохранены',
        },
        { status: 200 }
      );
    } catch (error) {
      // Обработка ошибок сети или таймаутов
      const elapsedTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('Failed to connect to Backend API:', {
        error: errorMessage,
        elapsed_time: elapsedTime,
        prize_id: validatedData.prize_id,
        telegram_id: telegramId,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return NextResponse.json(
        {
          error: 'Backend unavailable',
          message: 'Сервис временно недоступен. Попробуйте позже.',
        },
        { status: 503 }
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
