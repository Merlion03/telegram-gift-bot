# Design Document: Добавление полей "Страна" и "Почтовый индекс"

## Overview

Данный документ описывает техническое проектирование добавления двух новых обязательных полей в форму доставки Telegram Web App: "Страна" (country) и "Почтовый индекс" (postal_code). Эти поля расширяют существующий раздел "Адрес доставки" и будут расположены первыми в этом разделе для логичного заполнения адреса от общего к частному.

### Цели проектирования

1. Минимальные изменения в существующей архитектуре
2. Сохранение единообразия UI/UX с существующими полями
3. Полная валидация на фронтенде и бэкенде
4. Безопасная санитизация пользовательского ввода
5. Корректное сохранение в Google Sheets (колонки N и O)
6. Обратная совместимость с существующей функциональностью
7. Полное покрытие тестами (unit и property-based)

### Затрагиваемые компоненты

- **Frontend**: `nextjs-app/components/webapp/DeliveryForm.tsx` - React компонент формы
- **Backend API**: `nextjs-app/app/api/delivery/route.ts` - REST API endpoint
- **Validation**: Zod схемы валидации (фронтенд и бэкенд)
- **Sanitization**: `nextjs-app/lib/utils/sanitize.ts` - функция sanitizeDeliveryData
- **Google Sheets**: `nextjs-app/lib/google/sheetsClient.ts` - клиент для сохранения данных
- **Python Service**: `telegram-bot/services/google_sheets_service.py` - Python сервис (для справки)

## Architecture

### Общая архитектура потока данных

```
┌─────────────────────────────────────────────────────────────────┐
│                     Telegram Web App                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  DeliveryForm Component (React + react-hook-form)          │ │
│  │  - Поля: country, postal_code, city, street, house, etc.  │ │
│  │  - Zod валидация на фронтенде                             │ │
│  │  - Telegram Web App SDK (темизация, InitData)            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/delivery
                              │ { country, postal_code, ... }
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js API Route                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  /api/delivery/route.ts                                    │ │
│  │  1. Zod валидация схемы (включая country, postal_code)    │ │
│  │  2. Криптографическая проверка InitData                   │ │
│  │  3. Санитизация данных (sanitizeDeliveryData)             │ │
│  │  4. Сохранение через GoogleSheetsClient                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ saveDeliveryData(rowId, data)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Sheets Client                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  GoogleSheetsClient.saveDeliveryData()                     │ │
│  │  - Обновление строки rowId                                │ │
│  │  - Колонки E-M: существующие поля                         │ │
│  │  - Колонка N: country (новое)                             │ │
│  │  - Колонка O: postal_code (новое)                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Google Sheets   │
                    │  Spreadsheet     │
                    └──────────────────┘
```

### Принципы проектирования

1. **Модульность**: Каждое изменение локализовано в соответствующем модуле
2. **Единообразие**: Новые поля следуют тем же паттернам, что и существующие
3. **Безопасность**: Валидация на всех уровнях + санитизация перед сохранением
4. **Расширяемость**: Изменения не нарушают существующую функциональность
5. **Тестируемость**: Все изменения покрыты unit и property-based тестами

## Components and Interfaces

### 1. DeliveryForm Component (Frontend)

**Файл**: `nextjs-app/components/webapp/DeliveryForm.tsx`

#### Изменения в Zod схеме валидации

```typescript
const formSchema = z.object({
  // Новые поля
  country: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(100, 'Максимум 100 символов')
    .trim(),
  postal_code: z
    .string()
    .min(3, 'Минимум 3 символа')
    .max(20, 'Максимум 20 символов')
    .trim(),
  
  // Существующие поля (без изменений)
  last_name: z.string().min(2, 'Минимум 2 символа').max(50, 'Максимум 50 символов').trim(),
  first_name: z.string().min(2, 'Минимум 2 символа').max(50, 'Максимум 50 символов').trim(),
  patronymic: z.string().min(2, 'Минимум 2 символа').max(50, 'Максимум 50 символов').trim().optional().or(z.literal('')),
  city: z.string().min(2, 'Минимум 2 символа').max(100, 'Максимум 100 символов').trim(),
  street: z.string().min(2, 'Минимум 2 символа').max(200, 'Максимум 200 символов').trim(),
  house: z.string().min(1, 'Минимум 1 символ').max(20, 'Максимум 20 символов').trim(),
  apartment: z.string().min(1, 'Минимум 1 символ').max(20, 'Максимум 20 символов').trim().optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Неверный формат телефона').trim(),
  comment: z.string().max(500, 'Максимум 500 символов').trim().optional(),
});
```

#### Структура JSX для новых полей

Новые поля будут добавлены в секцию "Адрес доставки" первыми двумя полями:

```typescript
{/* Секция: Адрес доставки */}
<div className="space-y-3">
  <h3 className="text-lg font-semibold border-b pb-2" style={{ ... }}>
    Адрес доставки
  </h3>
  
  {/* Поле: Страна */}
  <div>
    <label 
      htmlFor="country" 
      className="block text-sm font-medium mb-1"
      style={{ color: 'var(--tg-theme-text-color, #000000)' }}
    >
      Страна <span className="text-red-500">*</span>
    </label>
    <input
      {...register('country')}
      type="text"
      id="country"
      placeholder="Россия"
      aria-label="Страна"
      aria-required="true"
      aria-invalid={errors.country ? 'true' : 'false'}
      aria-describedby={errors.country ? 'country-error' : undefined}
      className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      style={{ 
        backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
        color: 'var(--tg-theme-text-color, #000000)',
        borderColor: 'var(--tg-theme-hint-color, #999999)'
      }}
      disabled={isSubmitting}
    />
    {errors.country && (
      <p id="country-error" className="mt-1 text-sm text-red-600">
        {errors.country.message}
      </p>
    )}
  </div>
  
  {/* Поле: Почтовый индекс */}
  <div>
    <label 
      htmlFor="postal_code" 
      className="block text-sm font-medium mb-1"
      style={{ color: 'var(--tg-theme-text-color, #000000)' }}
    >
      Почтовый индекс <span className="text-red-500">*</span>
    </label>
    <input
      {...register('postal_code')}
      type="text"
      id="postal_code"
      placeholder="123456"
      aria-label="Почтовый индекс"
      aria-required="true"
      aria-invalid={errors.postal_code ? 'true' : 'false'}
      aria-describedby={errors.postal_code ? 'postal-code-error' : undefined}
      className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      style={{ 
        backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
        color: 'var(--tg-theme-text-color, #000000)',
        borderColor: 'var(--tg-theme-hint-color, #999999)'
      }}
      disabled={isSubmitting}
    />
    {errors.postal_code && (
      <p id="postal-code-error" className="mt-1 text-sm text-red-600">
        {errors.postal_code.message}
      </p>
    )}
  </div>
  
  {/* Существующие поля: city, street, house, apartment */}
  {/* ... без изменений ... */}
</div>
```

#### Accessibility атрибуты

Каждое новое поле включает:
- `aria-label`: Описание поля для screen readers
- `aria-required="true"`: Индикация обязательности
- `aria-invalid`: Динамически устанавливается при ошибке валидации
- `aria-describedby`: Связывает поле с сообщением об ошибке

### 2. API Endpoint (Backend)

**Файл**: `nextjs-app/app/api/delivery/route.ts`

#### Обновление Zod схемы валидации

```typescript
const deliverySchema = z.object({
  // Новые поля
  country: z
    .string()
    .min(2, 'Страна должна содержать минимум 2 символа')
    .max(100, 'Страна не должна превышать 100 символов')
    .trim(),
  postal_code: z
    .string()
    .min(3, 'Почтовый индекс должен содержать минимум 3 символа')
    .max(20, 'Почтовый индекс не должен превышать 20 символов')
    .trim(),
  
  // ФИО поля (без изменений)
  last_name: z.string().min(2, 'Фамилия должна содержать минимум 2 символа').max(50, 'Фамилия не должна превышать 50 символов').trim(),
  first_name: z.string().min(2, 'Имя должно содержать минимум 2 символа').max(50, 'Имя не должно превышать 50 символов').trim(),
  patronymic: z.string().min(2, 'Отчество должно содержать минимум 2 символа').max(50, 'Отчество не должно превышать 50 символов').trim().optional().or(z.literal('')),
  
  // Адресные поля (без изменений)
  city: z.string().min(2, 'Город должен содержать минимум 2 символа').max(100, 'Город не должен превышать 100 символов').trim(),
  street: z.string().min(2, 'Улица должна содержать минимум 2 символа').max(200, 'Улица не должна превышать 200 символов').trim(),
  house: z.string().min(1, 'Дом должен содержать минимум 1 символ').max(20, 'Дом не должен превышать 20 символов').trim(),
  apartment: z.string().min(1, 'Квартира должна содержать минимум 1 символ').max(20, 'Квартира не должна превышать 20 символов').trim().optional().or(z.literal('')),
  
  // Существующие поля (без изменений)
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Неверный формат телефона. Используйте формат: +79991234567').trim(),
  comment: z.string().max(500, 'Комментарий не должен превышать 500 символов').trim().optional(),
  
  // Служебные поля (без изменений)
  prize_id: z.number().int('Prize ID должен быть целым числом').positive('Prize ID должен быть положительным числом'),
  initData: z.string().min(1, 'InitData обязателен'),
});
```

#### Обновление вызова sanitizeDeliveryData

```typescript
// Санитизация данных перед сохранением
const sanitizedData = sanitizeDeliveryData({
  country: validatedData.country,
  postal_code: validatedData.postal_code,
  last_name: validatedData.last_name,
  first_name: validatedData.first_name,
  patronymic: validatedData.patronymic || '',
  city: validatedData.city,
  street: validatedData.street,
  house: validatedData.house,
  apartment: validatedData.apartment || '',
  phone: validatedData.phone,
  comment: validatedData.comment,
  telegram_id: telegramId,
});
```

### 3. Sanitization Utility

**Файл**: `nextjs-app/lib/utils/sanitize.ts`

#### Обновление функции sanitizeDeliveryData

```typescript
export function sanitizeDeliveryData(data: {
  country: string;
  postal_code: string;
  last_name: string;
  first_name: string;
  patronymic?: string;
  city: string;
  street: string;
  house: string;
  apartment?: string;
  phone: string;
  comment?: string;
  telegram_id: number;
}): {
  country: string;
  postal_code: string;
  last_name: string;
  first_name: string;
  patronymic: string | null;
  city: string;
  street: string;
  house: string;
  apartment: string | null;
  phone: string;
  comment?: string;
  telegram_id: number;
} {
  return {
    country: sanitizeText(data.country),
    postal_code: sanitizeText(data.postal_code),
    last_name: sanitizeText(data.last_name),
    first_name: sanitizeText(data.first_name),
    patronymic: (data.patronymic && data.patronymic.trim()) ? sanitizeText(data.patronymic) : null,
    city: sanitizeText(data.city),
    street: sanitizeText(data.street),
    house: sanitizeText(data.house),
    apartment: (data.apartment && data.apartment.trim()) ? sanitizeText(data.apartment) : null,
    phone: sanitizeText(data.phone),
    comment: data.comment ? sanitizeText(data.comment) : undefined,
    telegram_id: data.telegram_id,
  };
}
```

### 4. Google Sheets Client

**Файл**: `nextjs-app/lib/google/sheetsClient.ts`

#### Обновление интерфейса DeliveryData

```typescript
export interface DeliveryData {
  country: string;
  postal_code: string;
  last_name: string;
  first_name: string;
  patronymic: string | null;
  city: string;
  street: string;
  house: string;
  apartment: string | null;
  phone: string;
  comment?: string;
  telegram_id: number;
}
```

#### Обновление метода saveDeliveryData

```typescript
async saveDeliveryData(rowId: number, deliveryData: DeliveryData): Promise<boolean> {
  try {
    // Подготовка данных для записи
    // Обновлённая структура столбцов:
    // E: last_name, F: first_name, G: patronymic
    // H: city, I: street, J: house, K: apartment
    // L: phone, M: comment
    // N: country (новое)
    // O: postal_code (новое)
    const values = [
      [
        deliveryData.last_name,
        deliveryData.first_name,
        deliveryData.patronymic || '',
        deliveryData.city,
        deliveryData.street,
        deliveryData.house,
        deliveryData.apartment || '',
        deliveryData.phone,
        deliveryData.comment || '',
        deliveryData.country,
        deliveryData.postal_code,
      ],
    ];

    // Определение диапазона для обновления (строка rowId, столбцы E-O)
    const range = `E${rowId}:O${rowId}`;

    // Выполнение обновления
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });

    // Отметка времени получения приза в столбце P (сдвинулась с N на P)
    const mskDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const claimedAt = mskDate.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const claimedAtRange = `P${rowId}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: claimedAtRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[claimedAt]],
      },
    });

    return true;
  } catch (error) {
    console.error('Error saving delivery data to Google Sheets:', error);
    throw new Error(
      `Failed to save delivery data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

## Data Models

### FormData (Frontend)

```typescript
type FormData = {
  country: string;
  postal_code: string;
  last_name: string;
  first_name: string;
  patronymic?: string;
  city: string;
  street: string;
  house: string;
  apartment?: string;
  phone: string;
  comment?: string;
};
```

### DeliveryRequestData (Backend API)

```typescript
type DeliveryRequestData = {
  country: string;
  postal_code: string;
  last_name: string;
  first_name: string;
  patronymic?: string;
  city: string;
  street: string;
  house: string;
  apartment?: string;
  phone: string;
  comment?: string;
  prize_id: number;
  initData: string;
};
```

### SanitizedDeliveryData (After Sanitization)

```typescript
type SanitizedDeliveryData = {
  country: string;
  postal_code: string;
  last_name: string;
  first_name: string;
  patronymic: string | null;
  city: string;
  street: string;
  house: string;
  apartment: string | null;
  phone: string;
  comment?: string;
  telegram_id: number;
};
```

### Google Sheets Column Mapping

| Колонка | Поле | Описание |
|---------|------|----------|
| A | telegram_id | ID пользователя в Telegram |
| B | prize_type | Тип приза (digital/physical) |
| C | promo_code | Промокод (для digital) |
| D | instructions | Инструкции (для digital) |
| E | last_name | Фамилия получателя |
| F | first_name | Имя получателя |
| G | patronymic | Отчество получателя |
| H | city | Город |
| I | street | Улица |
| J | house | Дом |
| K | apartment | Квартира |
| L | phone | Телефон |
| M | comment | Комментарий |
| N | country | Страна (новое поле) |
| O | postal_code | Почтовый индекс (новое поле) |
| P | claimed_at | Время получения приза (сдвинулось с N) |


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Валидация длины полей

*For any* строку, используемую в качестве значения для полей country или postal_code, валидация должна принимать строки длиной от 2 до 100 символов для country и от 3 до 20 символов для postal_code, и отклонять все остальные с соответствующими сообщениями об ошибках.

**Validates: Requirements 1.3, 2.3**

### Property 2: Автоматическое удаление пробелов

*For any* строку с пробелами в начале или конце, используемую в качестве значения для полей country или postal_code, система должна автоматически удалить эти пробелы (trim) перед валидацией и сохранением.

**Validates: Requirements 1.7, 2.7**

### Property 3: Поддержка различных форматов почтовых индексов

*For any* строку, состоящую из комбинации цифр, букв, дефисов и пробелов, длиной от 3 до 20 символов, валидация postal_code должна принимать такие значения как валидные.

**Validates: Requirements 2.8**

### Property 4: Согласованность валидации фронтенд/бэкенд

*For any* данные формы с полями country и postal_code, валидация на фронтенде (Zod схема в DeliveryForm) и валидация на бэкенде (Zod схема в API endpoint) должны давать идентичный результат (принять или отклонить с теми же сообщениями об ошибках).

**Validates: Requirements 5.1, 5.2**

### Property 5: Отклонение невалидных значений на бэкенде

*For any* невалидные значения country или postal_code (не соответствующие правилам длины), отправленные на API endpoint, система должна вернуть HTTP 400 с детальным описанием ошибки валидации, включающим имя поля и причину отклонения.

**Validates: Requirements 5.5, 5.6**

### Property 6: Удаление HTML тегов при санитизации

*For any* строку, содержащую HTML теги, используемую в качестве значения для полей country или postal_code, функция sanitizeDeliveryData должна полностью удалить все HTML теги, оставив только текстовое содержимое.

**Validates: Requirements 7.3**

### Property 7: Экранирование специальных символов при санитизации

*For any* строку, содержащую специальные HTML символы (&, <, >, ", ', /), используемую в качестве значения для полей country или postal_code, функция sanitizeDeliveryData должна экранировать эти символы в их HTML entity эквиваленты.

**Validates: Requirements 7.4**

### Property 8: Сохранение валидных символов в postal_code

*For any* строку postal_code, содержащую валидные символы (буквы, цифры, дефисы, пробелы), функция sanitizeDeliveryData не должна удалять или изменять эти символы (кроме экранирования специальных HTML символов).

**Validates: Requirements 7.5**

### Property 9: Успешная обработка валидных данных

*For any* валидные данные формы, содержащие корректные значения country и postal_code (соответствующие всем правилам валидации), отправка через API endpoint должна завершаться успешно с HTTP 200 и данные должны быть сохранены в Google Sheets в колонки N и O соответственно.

**Validates: Requirements 9.7**

### Property 10: Отклонение невалидных данных

*For any* невалидные значения country или postal_code (пустые строки, слишком короткие, слишком длинные), валидация должна отклонять данные с соответствующими сообщениями об ошибках как на фронтенде, так и на бэкенде.

**Validates: Requirements 9.8**

### Property 11: Accessibility атрибуты при ошибках валидации

*For any* поле (country или postal_code), содержащее ошибку валидации, система должна автоматически устанавливать атрибут aria-invalid="true" и связывать сообщение об ошибке с полем через атрибут aria-describedby.

**Validates: Requirements 10.5, 10.6**

## Error Handling

### Frontend Error Handling

#### Валидация формы

1. **Пустые обязательные поля**
   - Сценарий: Пользователь пытается отправить форму с пустыми полями country или postal_code
   - Обработка: react-hook-form блокирует отправку, отображает сообщение "Минимум 2 символа" для country и "Минимум 3 символа" для postal_code
   - UI: Красное сообщение об ошибке под полем

2. **Невалидная длина**
   - Сценарий: Пользователь вводит слишком короткое или длинное значение
   - Обработка: Zod валидация отклоняет значение при потере фокуса (onBlur)
   - UI: Красное сообщение об ошибке с указанием допустимого диапазона

3. **Ошибка сети при отправке**
   - Сценарий: Отсутствует интернет-соединение или сервер недоступен
   - Обработка: Catch блок в onSubmit перехватывает ошибку
   - UI: Компонент ErrorMessage с кнопкой "Повторить попытку"

4. **Ошибка InitData**
   - Сценарий: WebApp SDK не предоставил InitData
   - Обработка: Выброс ошибки с понятным сообщением
   - UI: ErrorMessage с текстом "InitData недоступны. Откройте форму через Telegram."

### Backend Error Handling

#### API Endpoint Errors

1. **Ошибка валидации схемы (HTTP 400)**
   ```typescript
   {
     "error": "Validation error",
     "message": "Ошибка валидации данных",
     "details": [
       {
         "field": "country",
         "message": "Страна должна содержать минимум 2 символа"
       },
       {
         "field": "postal_code",
         "message": "Почтовый индекс должен содержать минимум 3 символа"
       }
     ]
   }
   ```

2. **Отсутствие обязательных полей (HTTP 400)**
   - Сценарий: Запрос не содержит поля country или postal_code
   - Ответ: HTTP 400 с детальным описанием отсутствующих полей
   - Логирование: Предупреждение в логах с деталями запроса

3. **Невалидная подпись InitData (HTTP 403)**
   ```typescript
   {
     "error": "Invalid signature",
     "message": "Невалидная подпись InitData",
     "details": "Signature verification failed"
   }
   ```

4. **Ошибка сохранения в Google Sheets (HTTP 500)**
   ```typescript
   {
     "error": "Failed to save delivery data",
     "message": "Не удалось сохранить данные доставки. Попробуйте позже."
   }
   ```
   - Логирование: Детальная информация об ошибке, prize_id, telegram_id

5. **Ошибка конфигурации (HTTP 500)**
   - Сценарий: Отсутствуют переменные окружения (BOT_TOKEN, GOOGLE_CREDENTIALS, SPREADSHEET_ID)
   - Ответ: HTTP 500 с сообщением "Сервер неправильно настроен"
   - Логирование: Критическая ошибка с указанием отсутствующей переменной

### Google Sheets Client Error Handling

1. **Ошибка аутентификации**
   - Сценарий: Невалидные credentials или истёк срок действия
   - Обработка: Выброс исключения с детальным сообщением
   - Логирование: Ошибка с путём к credentials файлу

2. **Ошибка API запроса**
   - Сценарий: Превышен лимит запросов или таблица недоступна
   - Обработка: Выброс исключения, которое перехватывается в API endpoint
   - Логирование: Детали ошибки Google Sheets API

3. **Ошибка записи данных**
   - Сценарий: Невалидный rowId или недостаточно прав на запись
   - Обработка: Выброс исключения с описанием проблемы
   - Логирование: rowId, spreadsheetId, детали ошибки

### Sanitization Error Handling

Функция sanitizeDeliveryData не выбрасывает исключений, но обрабатывает edge cases:

1. **Пустые строки**: Возвращает пустую строку после обработки
2. **Только HTML теги**: Возвращает пустую строку после удаления тегов
3. **Только пробелы**: Возвращает пустую строку после trim
4. **Управляющие символы**: Удаляются автоматически
5. **Опасные протоколы**: Удаляются (javascript:, data:, vbscript:)

## Testing Strategy

### Dual Testing Approach

Для обеспечения полного покрытия и корректности новой функциональности используется комбинация unit тестов и property-based тестов:

- **Unit тесты**: Проверяют конкретные примеры, edge cases и интеграционные точки
- **Property-based тесты**: Проверяют универсальные свойства на большом количестве сгенерированных входных данных (минимум 100 итераций)

Оба подхода дополняют друг друга: unit тесты ловят конкретные баги, property тесты проверяют общую корректность.

### Property-Based Testing Configuration

**Библиотека**: `fast-check` для TypeScript/JavaScript

**Конфигурация**:
- Минимум 100 итераций на каждый property тест
- Каждый тест помечен комментарием с ссылкой на property из design документа
- Формат тега: `// Feature: delivery-form-country-postal-fields, Property {number}: {property_text}`

### Frontend Testing

#### Unit Tests

**Файл**: `nextjs-app/__tests__/delivery-form-country-postal.test.tsx`

1. **Рендеринг новых полей**
   - Проверка наличия поля "Страна" с placeholder "Россия"
   - Проверка наличия поля "Почтовый индекс" с placeholder "123456"
   - Проверка порядка полей в секции "Адрес доставки"
   - Проверка визуальной индикации обязательности (красная звездочка)

2. **Accessibility атрибуты**
   - Проверка aria-label="Страна" для поля country
   - Проверка aria-label="Почтовый индекс" для поля postal_code
   - Проверка aria-required="true" для обоих полей
   - Проверка aria-invalid при ошибках валидации
   - Проверка aria-describedby связывает поле с сообщением об ошибке

3. **Валидация на фронтенде**
   - Отклонение пустых значений
   - Отклонение слишком коротких значений (country < 2, postal_code < 3)
   - Отклонение слишком длинных значений (country > 100, postal_code > 20)
   - Принятие валидных значений

4. **Интеграция с формой**
   - Проверка, что новые поля включены в данные отправки
   - Проверка, что существующие поля продолжают работать
   - Проверка навигации по клавиатуре (Tab, Shift+Tab)

#### Property-Based Tests

**Файл**: `nextjs-app/__tests__/delivery-form-country-postal.property.test.tsx`

1. **Property 1: Валидация длины полей**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 1: Валидация длины полей
   fc.assert(
     fc.property(
       fc.string({ minLength: 2, maxLength: 100 }),
       fc.string({ minLength: 3, maxLength: 20 }),
       (country, postal_code) => {
         const result = formSchema.safeParse({ country, postal_code, /* other fields */ });
         return result.success === true;
       }
     ),
     { numRuns: 100 }
   );
   ```

2. **Property 2: Автоматическое удаление пробелов**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 2: Автоматическое удаление пробелов
   fc.assert(
     fc.property(
       fc.string({ minLength: 2, maxLength: 100 }).map(s => `  ${s}  `),
       (countryWithSpaces) => {
         const result = formSchema.parse({ country: countryWithSpaces, /* other fields */ });
         return result.country === countryWithSpaces.trim();
       }
     ),
     { numRuns: 100 }
   );
   ```

3. **Property 3: Поддержка различных форматов почтовых индексов**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 3: Поддержка различных форматов почтовых индексов
   fc.assert(
     fc.property(
       fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', '-', ' '), { minLength: 3, maxLength: 20 }),
       (postal_code) => {
         const result = formSchema.safeParse({ postal_code, /* other fields */ });
         return result.success === true;
       }
     ),
     { numRuns: 100 }
   );
   ```

### Backend API Testing

#### Unit Tests

**Файл**: `nextjs-app/__tests__/api-delivery-country-postal.test.ts`

1. **Валидация схемы**
   - Отклонение запроса без поля country (HTTP 400)
   - Отклонение запроса без поля postal_code (HTTP 400)
   - Отклонение запроса с невалидным country (HTTP 400)
   - Отклонение запроса с невалидным postal_code (HTTP 400)
   - Принятие запроса с валидными полями (HTTP 200)

2. **Санитизация данных**
   - Проверка вызова sanitizeDeliveryData с новыми полями
   - Проверка, что санитизированные данные передаются в GoogleSheetsClient

3. **Интеграция с Google Sheets**
   - Mock GoogleSheetsClient.saveDeliveryData
   - Проверка, что country и postal_code передаются в метод
   - Проверка успешного ответа при успешном сохранении

4. **Обратная совместимость**
   - Проверка, что существующие поля продолжают корректно обрабатываться
   - Проверка, что существующие тесты продолжают проходить

#### Property-Based Tests

**Файл**: `nextjs-app/__tests__/api-delivery-country-postal.property.test.ts`

1. **Property 4: Согласованность валидации фронтенд/бэкенд**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 4: Согласованность валидации фронтенд/бэкенд
   fc.assert(
     fc.property(
       fc.record({
         country: fc.string(),
         postal_code: fc.string(),
         // other fields
       }),
       (data) => {
         const frontendResult = frontendSchema.safeParse(data);
         const backendResult = backendSchema.safeParse(data);
         return frontendResult.success === backendResult.success;
       }
     ),
     { numRuns: 100 }
   );
   ```

2. **Property 5: Отклонение невалидных значений на бэкенде**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 5: Отклонение невалидных значений на бэкенде
   fc.assert(
     fc.property(
       fc.oneof(
         fc.string({ maxLength: 1 }), // too short country
         fc.string({ minLength: 101 }), // too long country
         fc.string({ maxLength: 2 }), // too short postal_code
         fc.string({ minLength: 21 }) // too long postal_code
       ),
       async (invalidValue) => {
         const response = await POST(createMockRequest({ country: invalidValue, /* other fields */ }));
         return response.status === 400;
       }
     ),
     { numRuns: 100 }
   );
   ```

3. **Property 9: Успешная обработка валидных данных**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 9: Успешная обработка валидных данных
   fc.assert(
     fc.property(
       fc.record({
         country: fc.string({ minLength: 2, maxLength: 100 }),
         postal_code: fc.string({ minLength: 3, maxLength: 20 }),
         // other valid fields
       }),
       async (validData) => {
         const response = await POST(createMockRequest(validData));
         return response.status === 200;
       }
     ),
     { numRuns: 100 }
   );
   ```

### Sanitization Testing

#### Unit Tests

**Файл**: `nextjs-app/lib/utils/__tests__/sanitize-country-postal.test.ts`

1. **Удаление HTML тегов**
   - `sanitizeDeliveryData({ country: '<script>alert("XSS")</script>Россия' })` → `{ country: 'alert(&quot;XSS&quot;)Россия' }`
   - `sanitizeDeliveryData({ postal_code: '<b>123456</b>' })` → `{ postal_code: '123456' }`

2. **Экранирование специальных символов**
   - `sanitizeDeliveryData({ country: 'США & Канада' })` → `{ country: 'США &amp; Канада' }`
   - `sanitizeDeliveryData({ postal_code: '12"34' })` → `{ postal_code: '12&quot;34' }`

3. **Сохранение валидных символов**
   - `sanitizeDeliveryData({ postal_code: 'AB-123 456' })` → `{ postal_code: 'AB-123 456' }`
   - `sanitizeDeliveryData({ country: 'Великобритания' })` → `{ country: 'Великобритания' }`

#### Property-Based Tests

**Файл**: `nextjs-app/lib/utils/__tests__/sanitize-country-postal.property.test.ts`

1. **Property 6: Удаление HTML тегов при санитизации**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 6: Удаление HTML тегов при санитизации
   fc.assert(
     fc.property(
       fc.string().map(s => `<script>${s}</script>`),
       (htmlString) => {
         const result = sanitizeDeliveryData({ country: htmlString, /* other fields */ });
         return !result.country.includes('<') && !result.country.includes('>');
       }
     ),
     { numRuns: 100 }
   );
   ```

2. **Property 7: Экранирование специальных символов при санитизации**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 7: Экранирование специальных символов при санитизации
   fc.assert(
     fc.property(
       fc.stringOf(fc.constantFrom('&', '<', '>', '"', "'", '/')),
       (specialChars) => {
         const result = sanitizeDeliveryData({ country: specialChars, /* other fields */ });
         return result.country.includes('&amp;') || result.country.includes('&lt;') || 
                result.country.includes('&gt;') || result.country.includes('&quot;');
       }
     ),
     { numRuns: 100 }
   );
   ```

3. **Property 8: Сохранение валидных символов в postal_code**
   ```typescript
   // Feature: delivery-form-country-postal-fields, Property 8: Сохранение валидных символов в postal_code
   fc.assert(
     fc.property(
       fc.stringOf(fc.constantFrom('A', 'B', '1', '2', '-', ' '), { minLength: 3, maxLength: 20 }),
       (validPostalCode) => {
         const result = sanitizeDeliveryData({ postal_code: validPostalCode, /* other fields */ });
         // Проверяем, что все символы сохранены (кроме возможного экранирования)
         return result.postal_code.length >= validPostalCode.length;
       }
     ),
     { numRuns: 100 }
   );
   ```

### Google Sheets Client Testing

#### Unit Tests

**Файл**: `nextjs-app/lib/google/__tests__/sheetsClient-country-postal.test.ts`

1. **Сохранение в правильные колонки**
   - Mock Google Sheets API
   - Вызов saveDeliveryData с country и postal_code
   - Проверка, что данные записываются в колонки N и O
   - Проверка, что claimed_at записывается в колонку P (сдвинулась с N)

2. **Обновление интерфейса DeliveryData**
   - Проверка, что TypeScript компилируется с новыми полями
   - Проверка, что все поля передаются корректно

3. **Обратная совместимость**
   - Проверка, что существующие поля (E-M) продолжают записываться в правильные колонки
   - Проверка, что существующие тесты продолжают проходить

### Integration Testing

#### End-to-End Flow

**Файл**: `nextjs-app/__tests__/integration/delivery-flow-country-postal.test.ts`

1. **Полный цикл отправки формы**
   - Рендеринг DeliveryForm
   - Заполнение всех полей, включая country и postal_code
   - Отправка формы
   - Mock API endpoint
   - Проверка, что данные корректно передаются через все слои
   - Проверка успешного ответа

2. **Обработка ошибок**
   - Отправка формы с невалидными country/postal_code
   - Проверка отображения ошибок валидации
   - Проверка, что форма не отправляется

3. **Accessibility flow**
   - Навигация по форме с помощью клавиатуры
   - Проверка фокуса на новых полях
   - Проверка screen reader атрибутов

### Test Coverage Goals

- **Unit тесты**: 100% покрытие новых функций и изменённых строк кода
- **Property-based тесты**: Все 11 properties из design документа
- **Integration тесты**: Полный цикл от UI до Google Sheets
- **Regression тесты**: Все существующие тесты продолжают проходить

### Continuous Integration

Все тесты должны выполняться в CI pipeline:
1. Lint проверка (ESLint, TypeScript)
2. Unit тесты (Jest)
3. Property-based тесты (fast-check)
4. Integration тесты
5. Coverage report (минимум 80% для новых файлов)

