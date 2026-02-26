/**
 * Типы для данных доставки физических призов
 */

// Данные доставки
export interface DeliveryData {
  full_name: string;
  address: string;
  phone: string;
  comment?: string;
}

// Данные для отправки на API (включая prize_id и initData)
export interface DeliverySubmitData extends DeliveryData {
  prize_id: number;
  initData: string;
}

// Ответ API при сохранении данных доставки
export interface DeliveryApiResponse {
  success: boolean;
  error?: string;
  details?: Array<{
    code: string;
    path: string[];
    message: string;
  }>;
}

// Ошибка валидации формы
export interface ValidationError {
  field: keyof DeliveryData;
  message: string;
}

// Состояние формы доставки
export interface DeliveryFormState {
  isSubmitting: boolean;
  error: string | null;
  validationErrors: ValidationError[];
}

// Тип приза
export type PrizeType = 'digital' | 'physical';

// Информация о призе
export interface PrizeInfo {
  id: number;
  type: PrizeType;
  name?: string;
  description?: string;
}

// Данные приза в Google Sheets
export interface PrizeSheetData {
  row_id: number;
  telegram_id: number;
  prize_type: PrizeType;
  promo_code?: string; // Для цифровых призов
  instructions?: string; // Инструкция по использованию промокода
  full_name?: string; // Данные доставки
  address?: string;
  phone?: string;
  comment?: string;
  claimed_at?: string; // Время получения приза
}
