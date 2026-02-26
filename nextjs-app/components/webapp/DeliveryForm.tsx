'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ErrorMessage, getReadableErrorMessage } from '@/components/common/ErrorMessage';

// Схема валидации формы
const formSchema = z.object({
  full_name: z.string().min(2, 'Минимум 2 символа').max(100, 'Максимум 100 символов'),
  address: z.string().min(10, 'Минимум 10 символов').max(500, 'Максимум 500 символов'),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Неверный формат телефона'),
  comment: z.string().max(500, 'Максимум 500 символов').optional(),
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 max-w-md mx-auto">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
          ФИО <span className="text-red-500">*</span>
        </label>
        <input
          {...register('full_name')}
          type="text"
          id="full_name"
          placeholder="Иванов Иван Иванович"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isSubmitting}
        />
        {errors.full_name && (
          <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
          Адрес доставки <span className="text-red-500">*</span>
        </label>
        <textarea
          {...register('address')}
          id="address"
          rows={3}
          placeholder="Город, улица, дом, квартира"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isSubmitting}
        />
        {errors.address && (
          <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
          Номер телефона <span className="text-red-500">*</span>
        </label>
        <input
          {...register('phone')}
          type="tel"
          id="phone"
          placeholder="+79991234567"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isSubmitting}
        />
        {errors.phone && (
          <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
          Комментарий (опционально)
        </label>
        <textarea
          {...register('comment')}
          id="comment"
          rows={2}
          placeholder="Дополнительная информация для доставки"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isSubmitting}
        />
        {errors.comment && (
          <p className="mt-1 text-sm text-red-600">{errors.comment.message}</p>
        )}
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
