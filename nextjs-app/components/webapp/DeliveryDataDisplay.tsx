'use client';

import { DeliveryData } from '@/types/delivery';
import { formatDeliveryData } from '@/lib/webapp/formatDeliveryData';

/**
 * Props для компонента DeliveryDataDisplay
 */
export interface DeliveryDataDisplayProps {
  data: DeliveryData;
  className?: string;
}

/**
 * Компонент для форматированного отображения данных доставки.
 * Группирует данные по секциям (Получатель, Адрес, Контакты) и
 * отображает их в читаемом виде с использованием Telegram темизации.
 * 
 * @param data - Данные доставки для отображения
 * @param className - Дополнительные CSS классы
 */
export function DeliveryDataDisplay({ data, className = '' }: DeliveryDataDisplayProps) {
  // Форматируем данные через утилиту
  const formattedData = formatDeliveryData(data);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Секция: Получатель */}
      <div className="space-y-2">
        <h4 
          className="text-base font-semibold border-b pb-1"
          style={{ 
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
        >
          {formattedData.recipient.label}
        </h4>
        <div className="space-y-1 pl-2">
          {formattedData.recipient.fields.map((field, index) => (
            <div key={index} className="flex">
              <span 
                className="text-sm font-medium min-w-[120px]"
                style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
              >
                {field.label}:
              </span>
              <span 
                className="text-sm"
                style={{ color: 'var(--tg-theme-text-color, #000000)' }}
              >
                {field.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Секция: Адрес */}
      <div className="space-y-2">
        <h4 
          className="text-base font-semibold border-b pb-1"
          style={{ 
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
        >
          {formattedData.address.label}
        </h4>
        <div className="space-y-1 pl-2">
          {formattedData.address.fields.map((field, index) => (
            <div key={index} className="flex">
              <span 
                className="text-sm font-medium min-w-[120px]"
                style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
              >
                {field.label}:
              </span>
              <span 
                className="text-sm"
                style={{ color: 'var(--tg-theme-text-color, #000000)' }}
              >
                {field.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Секция: Контакты */}
      <div className="space-y-2">
        <h4 
          className="text-base font-semibold border-b pb-1"
          style={{ 
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
        >
          {formattedData.contacts.label}
        </h4>
        <div className="space-y-1 pl-2">
          {formattedData.contacts.fields.map((field, index) => (
            <div key={index} className="flex">
              <span 
                className="text-sm font-medium min-w-[120px]"
                style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
              >
                {field.label}:
              </span>
              <span 
                className="text-sm"
                style={{ color: 'var(--tg-theme-text-color, #000000)' }}
              >
                {field.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
