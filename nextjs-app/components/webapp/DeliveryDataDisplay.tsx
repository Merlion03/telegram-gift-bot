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
    <div className={className}>
      <style jsx>{`
        .data-section {
          background-color: var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff));
          border-radius: 12px;
          overflow: hidden;
        }
        
        .data-separator {
          height: 1px;
          background-color: var(--tg-theme-section-separator-color, #c8c7cc);
          margin: 0 16px;
        }
      `}</style>
      
      {/* Секция: Получатель */}
      <div className="mb-3">
        <h4 
          className="text-xs font-normal uppercase px-4 pb-2"
          style={{ 
            color: 'var(--tg-theme-section-header-text-color, var(--tg-theme-hint-color, #8e8e93))',
            letterSpacing: '0.5px',
          }}
        >
          {formattedData.recipient.label}
        </h4>
        <div className="data-section">
          {formattedData.recipient.fields.map((field, index) => (
            <div key={index}>
              {index > 0 && <div className="data-separator" />}
              <div className="px-4 py-3">
                <div 
                  className="text-xs mb-1"
                  style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
                >
                  {field.label}
                </div>
                <div 
                  className="text-base"
                  style={{ color: 'var(--tg-theme-text-color, #000000)' }}
                >
                  {field.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Секция: Адрес */}
      <div className="mb-3">
        <h4 
          className="text-xs font-normal uppercase px-4 pb-2"
          style={{ 
            color: 'var(--tg-theme-section-header-text-color, var(--tg-theme-hint-color, #8e8e93))',
            letterSpacing: '0.5px',
          }}
        >
          {formattedData.address.label}
        </h4>
        <div className="data-section">
          {formattedData.address.fields.map((field, index) => (
            <div key={index}>
              {index > 0 && <div className="data-separator" />}
              <div className="px-4 py-3">
                <div 
                  className="text-xs mb-1"
                  style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
                >
                  {field.label}
                </div>
                <div 
                  className="text-base"
                  style={{ color: 'var(--tg-theme-text-color, #000000)' }}
                >
                  {field.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Секция: Контакты */}
      <div>
        <h4 
          className="text-xs font-normal uppercase px-4 pb-2"
          style={{ 
            color: 'var(--tg-theme-section-header-text-color, var(--tg-theme-hint-color, #8e8e93))',
            letterSpacing: '0.5px',
          }}
        >
          {formattedData.contacts.label}
        </h4>
        <div className="data-section">
          {formattedData.contacts.fields.map((field, index) => (
            <div key={index}>
              {index > 0 && <div className="data-separator" />}
              <div className="px-4 py-3">
                <div 
                  className="text-xs mb-1"
                  style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
                >
                  {field.label}
                </div>
                <div 
                  className="text-base"
                  style={{ color: 'var(--tg-theme-text-color, #000000)' }}
                >
                  {field.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
