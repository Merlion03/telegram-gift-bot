'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ErrorMessage, getReadableErrorMessage } from '@/components/common/ErrorMessage';

// Схема валидации формы
const formSchema = z.object({
  // ФИО поля
  last_name: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .trim(),
  first_name: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .trim(),
  patronymic: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .trim()
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Адресные поля
  city: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(100, 'Максимум 100 символов')
    .trim(),
  street: z
    .string()
    .min(2, 'Минимум 2 символа')
    .max(200, 'Максимум 200 символов')
    .trim(),
  house: z
    .string()
    .min(1, 'Минимум 1 символ')
    .max(20, 'Максимум 20 символов')
    .trim(),
  apartment: z
    .string()
    .min(1, 'Минимум 1 символ')
    .max(20, 'Максимум 20 символов')
    .trim()
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Существующие поля
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Неверный формат телефона')
    .trim(),
  comment: z
    .string()
    .max(500, 'Максимум 500 символов')
    .trim()
    .optional(),
});

type FormData = z.infer<typeof formSchema>;

interface DeliveryFormProps {
  prizeId: number;
}


export function DeliveryForm({ prizeId }: DeliveryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });
  
  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Динамический импорт WebApp SDK
      const WebApp = (await import('@twa-dev/sdk')).default;
      
      // Получение InitData строки от Telegram
      const initDataRaw = WebApp.initData;
      
      if (!initDataRaw) {
        throw new Error('InitData недоступны. Откройте форму через Telegram.');
      }
      
      // Отправка данных на API
      const response = await fetch('/api/delivery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          prize_id: prizeId,
          initData: initDataRaw,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не удалось отправить данные');
      }
      
      // Успех - показываем уведомление и закрываем WebApp
      WebApp.showAlert('Данные успешно сохранены!', () => {
        WebApp.close();
      });
      
    } catch (err) {
      const errorMessage = getReadableErrorMessage(err);
      setError(errorMessage);
      console.error('Ошибка отправки формы:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-4 max-w-md mx-auto">
      <style jsx>{`
        input::placeholder,
        textarea::placeholder {
          color: var(--tg-theme-hint-color, #8e8e93);
        }
      `}</style>
      
      {/* Секция: Получатель */}
      <div className="space-y-3">
        <h3 
          className="text-lg font-semibold border-b pb-2"
          style={{ 
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
        >
          Получатель
        </h3>
        
      <div>
        <label 
          htmlFor="last_name" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Фамилия <span className="text-red-500">*</span>
        </label>
        <input
          {...register('last_name')}
          type="text"
          id="last_name"
          placeholder="Иванов"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.last_name && (
          <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
        )}
      </div>
      
      <div>
        <label 
          htmlFor="first_name" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Имя <span className="text-red-500">*</span>
        </label>
        <input
          {...register('first_name')}
          type="text"
          id="first_name"
          placeholder="Иван"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.first_name && (
          <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
        )}
      </div>
      
      <div>
        <label 
          htmlFor="patronymic" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Отчество (опционально)
        </label>
        <input
          {...register('patronymic')}
          type="text"
          id="patronymic"
          placeholder="Иванович"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.patronymic && (
          <p className="mt-1 text-sm text-red-600">{errors.patronymic.message}</p>
        )}
      </div>
      </div>
      
      {/* Секция: Адрес доставки */}
      <div className="space-y-3">
        <h3 
          className="text-lg font-semibold border-b pb-2"
          style={{ 
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
        >
          Адрес доставки
        </h3>
      
      {/* Адресные поля */}
      <div>
        <label 
          htmlFor="city" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Город <span className="text-red-500">*</span>
        </label>
        <input
          {...register('city')}
          type="text"
          id="city"
          placeholder="Москва"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.city && (
          <p className="mt-1 text-sm text-red-600">{errors.city.message}</p>
        )}
      </div>
      
      <div>
        <label 
          htmlFor="street" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Улица <span className="text-red-500">*</span>
        </label>
        <input
          {...register('street')}
          type="text"
          id="street"
          placeholder="Ленина"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.street && (
          <p className="mt-1 text-sm text-red-600">{errors.street.message}</p>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label 
            htmlFor="house" 
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--tg-theme-text-color, #000000)' }}
          >
            Дом <span className="text-red-500">*</span>
          </label>
          <input
            {...register('house')}
            type="text"
            id="house"
            placeholder="10"
            className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            style={{ 
              backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
              color: 'var(--tg-theme-text-color, #000000)',
              borderColor: 'var(--tg-theme-hint-color, #999999)'
            }}
            disabled={isSubmitting}
          />
          {errors.house && (
            <p className="mt-1 text-sm text-red-600">{errors.house.message}</p>
          )}
        </div>
        
        <div>
          <label 
            htmlFor="apartment" 
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--tg-theme-text-color, #000000)' }}
          >
            Квартира (опционально)
          </label>
          <input
            {...register('apartment')}
            type="text"
            id="apartment"
            placeholder="25"
            className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            style={{ 
              backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
              color: 'var(--tg-theme-text-color, #000000)',
              borderColor: 'var(--tg-theme-hint-color, #999999)'
            }}
            disabled={isSubmitting}
          />
          {errors.apartment && (
            <p className="mt-1 text-sm text-red-600">{errors.apartment.message}</p>
          )}
        </div>
      </div>
      </div>
      
      {/* Секция: Контактная информация */}
      <div className="space-y-3">
        <h3 
          className="text-lg font-semibold border-b pb-2"
          style={{ 
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
        >
          Контактная информация
        </h3>
      
      <div>
        <label 
          htmlFor="phone" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Номер телефона <span className="text-red-500">*</span>
        </label>
        <input
          {...register('phone')}
          type="tel"
          id="phone"
          placeholder="+79991234567"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.phone && (
          <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
        )}
      </div>
      
      <div>
        <label 
          htmlFor="comment" 
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--tg-theme-text-color, #000000)' }}
        >
          Комментарий (опционально)
        </label>
        <textarea
          {...register('comment')}
          id="comment"
          rows={2}
          placeholder="Дополнительная информация для доставки"
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting}
        />
        {errors.comment && (
          <p className="mt-1 text-sm text-red-600">{errors.comment.message}</p>
        )}
      </div>
      </div>
      
      {error && (
        <ErrorMessage
          message={error}
          severity="error"
          onRetry={() => {
            setError(null);
            handleSubmit(onSubmit)();
          }}
          onDismiss={() => setError(null)}
        />
      )}
      
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Отправка...' : 'Отправить данные'}
      </button>
    </form>
  );
}
