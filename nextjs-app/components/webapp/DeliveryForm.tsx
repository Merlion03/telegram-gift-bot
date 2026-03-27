'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ErrorMessage, getReadableErrorMessage } from '@/components/common/ErrorMessage';
import { useConfirmationModal } from '@/hooks/webapp/useConfirmationModal';
import { ConfirmationModal } from '@/components/webapp/ConfirmationModal';

// Схема валидации формы
const formSchema = z.object({
  // ФИО поля
  last_name: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов'),
  first_name: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов'),
  patronymic: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(50, 'Максимум 50 символов')
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Адресные поля
  country: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(100, 'Максимум 100 символов'),
  postal_code: z
    .string()
    .trim()
    .min(3, 'Минимум 3 символа')
    .max(20, 'Максимум 20 символов'),
  city: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(100, 'Максимум 100 символов'),
  street: z
    .string()
    .trim()
    .min(2, 'Минимум 2 символа')
    .max(200, 'Максимум 200 символов'),
  house: z
    .string()
    .trim()
    .min(1, 'Минимум 1 символ')
    .max(20, 'Максимум 20 символов'),
  apartment: z
    .string()
    .trim()
    .min(1, 'Минимум 1 символ')
    .max(20, 'Максимум 20 символов')
    .optional()
    .or(z.literal('')), // Разрешаем пустую строку
  
  // Существующие поля
  phone: z
    .string()
    .trim()
    .regex(/^[\+0-9]+$/, 'Можно использовать только цифры и символ +')
    .regex(/^\+?[0-9]{10,15}$/, 'Неверный формат телефона'),
  comment: z
    .string()
    .trim()
    .max(500, 'Максимум 500 символов')
    .optional(),
});

type FormData = z.infer<typeof formSchema>;

interface DeliveryFormProps {
  prizeId: number;
}


export function DeliveryForm({ prizeId }: DeliveryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFormSubmitted, setIsFormSubmitted] = useState(false); // Состояние для блокировки формы после успешной отправки
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // Состояние для отображения сообщения об успехе
  
  const {
    isOpen,
    deliveryData,
    openModal,
    closeModal,
  } = useConfirmationModal();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });
  
  const onSubmit = async (data: FormData) => {
    // Перехватываем отправку формы и открываем модальное окно вместо немедленной отправки
    // Requirement 1.1, 1.2: Предотвращаем немедленную отправку и открываем модальное окно
    console.log('onSubmit вызван, открываем модальное окно', data);
    openModal(data);
    console.log('openModal вызван');
  };
  
  const handleConfirmSubmit = async () => {
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
          ...deliveryData,
          prize_id: prizeId,
          initData: initDataRaw,
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Не удалось отправить данные';
        try {
          const errorData = await response.json();
          // Используем error или message из ответа API
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (jsonError) {
          // Если не удалось распарсить JSON, используем дефолтное сообщение
          console.error('Ошибка парсинга JSON ответа:', jsonError);
        }
        throw new Error(errorMessage);
      }
      
      // Requirement 3.3, 3.4, 3.5: Закрыть модальное окно, показать Success_Message, заблокировать форму
      closeModal();
      setSuccessMessage('Данные были отправлены. Ожидайте');
      setIsFormSubmitted(true);
      
      // Показываем уведомление и закрываем WebApp
      WebApp.showAlert('Данные успешно сохранены!', () => {
        WebApp.close();
      });
      
    } catch (err) {
      // Requirement 5.1, 5.2, 5.3, 5.4: Закрыть модальное окно, показать ошибку, сохранить данные, разрешить повторную отправку
      const errorMessage = getReadableErrorMessage(err);
      closeModal();
      setError(errorMessage);
      console.error('Ошибка отправки формы:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-4 max-w-md mx-auto">
        <style jsx>{`
          input::placeholder,
          textarea::placeholder {
            color: var(--tg-theme-hint-color, #8e8e93);
          }
        `}</style>
        
        {/* Requirement 3.4: Отображение Success_Message после успешной отправки */}
        {successMessage && (
          <div 
            className="p-4 rounded-md border"
            style={{
              backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
              color: 'var(--tg-theme-text-color, #000000)',
              borderColor: 'var(--tg-theme-button-color, #3390ec)',
            }}
          >
            <p className="text-center font-medium">{successMessage}</p>
          </div>
        )}
      
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
          disabled={isSubmitting || isFormSubmitted}
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
          disabled={isSubmitting || isFormSubmitted}
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
          disabled={isSubmitting || isFormSubmitted}
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
          aria-invalid={errors.country ? "true" : "false"}
          aria-describedby={errors.country ? "country-error" : undefined}
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting || isFormSubmitted}
        />
        {errors.country && (
          <p id="country-error" className="mt-1 text-sm text-red-600">{errors.country.message}</p>
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
          aria-invalid={errors.postal_code ? "true" : "false"}
          aria-describedby={errors.postal_code ? "postal_code-error" : undefined}
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting || isFormSubmitted}
        />
        {errors.postal_code && (
          <p id="postal_code-error" className="mt-1 text-sm text-red-600">{errors.postal_code.message}</p>
        )}
      </div>
      
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
          disabled={isSubmitting || isFormSubmitted}
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
          disabled={isSubmitting || isFormSubmitted}
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
            disabled={isSubmitting || isFormSubmitted}
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
            disabled={isSubmitting || isFormSubmitted}
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
          onInput={(e) => {
            // Фильтруем ввод: оставляем только +0123456789
            const input = e.currentTarget;
            const filteredValue = input.value.replace(/[^+0-9]/g, '');
            if (input.value !== filteredValue) {
              input.value = filteredValue;
            }
          }}
          className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ 
            backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
            color: 'var(--tg-theme-text-color, #000000)',
            borderColor: 'var(--tg-theme-hint-color, #999999)'
          }}
          disabled={isSubmitting || isFormSubmitted}
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
          disabled={isSubmitting || isFormSubmitted}
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
        disabled={isSubmitting || isFormSubmitted}
        className="w-full rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Отправка...' : 'Отправить данные'}
      </button>
    </form>
    
    {/* Requirement 2.1, 3.1, 4.1, 6.1, 6.2, 6.4: Модальное окно подтверждения */}
    {isOpen && deliveryData && (
      <ConfirmationModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirmSubmit}
        deliveryData={deliveryData}
        isSubmitting={isSubmitting}
      />
    )}
    </>
  );
}
