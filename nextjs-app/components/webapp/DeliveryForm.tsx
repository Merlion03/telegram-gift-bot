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
      <form onSubmit={handleSubmit(onSubmit)} className="min-h-screen" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #efeff4)' }}>
        <style jsx>{`
          input::placeholder,
          textarea::placeholder {
            color: var(--tg-theme-hint-color, #8e8e93) !important;
            opacity: 1;
          }
          
          /* Стили для полей ввода в стиле Telegram */
          .tg-input {
            transition: border-color 0.2s ease;
            color: var(--tg-theme-text-color, #000000) !important;
          }
          
          .tg-input:focus {
            border-color: var(--tg-theme-link-color, #3390ec);
          }
          
          /* Убираем автозаполнение браузера, которое может менять цвета */
          .tg-input:-webkit-autofill,
          .tg-input:-webkit-autofill:hover,
          .tg-input:-webkit-autofill:focus,
          .tg-input:-webkit-autofill:active {
            -webkit-text-fill-color: var(--tg-theme-text-color, #000000) !important;
            -webkit-box-shadow: 0 0 0 30px var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff)) inset !important;
            transition: background-color 5000s ease-in-out 0s;
          }
          
          /* Стили для секций */
          .tg-section {
            background-color: var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff));
            border-radius: 12px;
            overflow: hidden;
          }
          
          /* Стили для заголовков секций */
          .tg-section-header {
            color: var(--tg-theme-section-header-text-color, var(--tg-theme-hint-color, #8e8e93));
            font-size: 13px;
            font-weight: 400;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          /* Разделители между полями */
          .tg-separator {
            height: 1px;
            background-color: var(--tg-theme-section-separator-color, #c8c7cc);
            margin: 0 16px;
          }
        `}</style>
        
        {/* Requirement 3.4: Отображение Success_Message после успешной отправки */}
        {successMessage && (
          <div 
            className="mx-4 mt-4 p-4 rounded-xl"
            style={{
              backgroundColor: 'var(--tg-theme-section-bg-color, var(--tg-theme-bg-color, #ffffff))',
              color: 'var(--tg-theme-text-color, #000000)',
              border: '1px solid var(--tg-theme-link-color, #3390ec)',
            }}
          >
            <p className="text-center font-medium">{successMessage}</p>
          </div>
        )}
      
      {/* Секция: Получатель */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="tg-section-header mb-2">
          Получатель
        </h3>
      </div>
      
      <div className="mx-4 mb-4 tg-section">
        {/* Фамилия */}
        <div className="px-4 py-3">
          <label 
            htmlFor="last_name" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Фамилия <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
          </label>
          <input
            {...register('last_name')}
            type="text"
            id="last_name"
            placeholder="Иванов"
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.last_name && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.last_name.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Имя */}
        <div className="px-4 py-3">
          <label 
            htmlFor="first_name" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Имя <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
          </label>
          <input
            {...register('first_name')}
            type="text"
            id="first_name"
            placeholder="Иван"
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.first_name && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.first_name.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Отчество */}
        <div className="px-4 py-3">
          <label 
            htmlFor="patronymic" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Отчество
          </label>
          <input
            {...register('patronymic')}
            type="text"
            id="patronymic"
            placeholder="Иванович"
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.patronymic && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.patronymic.message}
            </p>
          )}
        </div>
      </div>
      
      {/* Секция: Адрес доставки */}
      <div className="px-4 pt-2 pb-2">
        <h3 className="tg-section-header mb-2">
          Адрес доставки
        </h3>
      </div>
      
      <div className="mx-4 mb-4 tg-section">
        {/* Страна */}
        <div className="px-4 py-3">
          <label 
            htmlFor="country" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Страна <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
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
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.country && (
            <p id="country-error" className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.country.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Почтовый индекс */}
        <div className="px-4 py-3">
          <label 
            htmlFor="postal_code" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Почтовый индекс <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
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
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.postal_code && (
            <p id="postal_code-error" className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.postal_code.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Город */}
        <div className="px-4 py-3">
          <label 
            htmlFor="city" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Город <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
          </label>
          <input
            {...register('city')}
            type="text"
            id="city"
            placeholder="Москва"
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.city && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.city.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Улица */}
        <div className="px-4 py-3">
          <label 
            htmlFor="street" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Улица <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
          </label>
          <input
            {...register('street')}
            type="text"
            id="street"
            placeholder="Ленина"
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.street && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.street.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Дом и Квартира */}
        <div className="px-4 py-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label 
                htmlFor="house" 
                className="block text-xs mb-1"
                style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
              >
                Дом <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
              </label>
              <input
                {...register('house')}
                type="text"
                id="house"
                placeholder="10"
                className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
                style={{ 
                  backgroundColor: 'transparent',
                  color: 'var(--tg-theme-text-color, #000000)',
                }}
                disabled={isSubmitting || isFormSubmitted}
              />
              {errors.house && (
                <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
                  {errors.house.message}
                </p>
              )}
            </div>
            
            <div>
              <label 
                htmlFor="apartment" 
                className="block text-xs mb-1"
                style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
              >
                Квартира
              </label>
              <input
                {...register('apartment')}
                type="text"
                id="apartment"
                placeholder="25"
                className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
                style={{ 
                  backgroundColor: 'transparent',
                  color: 'var(--tg-theme-text-color, #000000)',
                }}
                disabled={isSubmitting || isFormSubmitted}
              />
              {errors.apartment && (
                <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
                  {errors.apartment.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Секция: Контактная информация */}
      <div className="px-4 pt-2 pb-2">
        <h3 className="tg-section-header mb-2">
          Контактная информация
        </h3>
      </div>
      
      <div className="mx-4 mb-4 tg-section">
        {/* Телефон */}
        <div className="px-4 py-3">
          <label 
            htmlFor="phone" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Номер телефона <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>*</span>
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
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.phone && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.phone.message}
            </p>
          )}
        </div>
        
        <div className="tg-separator"></div>
        
        {/* Комментарий */}
        <div className="px-4 py-3">
          <label 
            htmlFor="comment" 
            className="block text-xs mb-1"
            style={{ color: 'var(--tg-theme-hint-color, #8e8e93)' }}
          >
            Комментарий
          </label>
          <textarea
            {...register('comment')}
            id="comment"
            rows={3}
            placeholder="Дополнительная информация для доставки"
            className="w-full px-0 py-1 border-0 focus:outline-none tg-input text-base resize-none"
            style={{ 
              backgroundColor: 'transparent',
              color: 'var(--tg-theme-text-color, #000000)',
            }}
            disabled={isSubmitting || isFormSubmitted}
          />
          {errors.comment && (
            <p className="mt-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
              {errors.comment.message}
            </p>
          )}
        </div>
      </div>
      
      {error && (
        <div className="mx-4 mb-4">
          <ErrorMessage
            message={error}
            severity="error"
            onRetry={() => {
              setError(null);
              handleSubmit(onSubmit)();
            }}
            onDismiss={() => setError(null)}
          />
        </div>
      )}
      
      {/* Кнопка отправки в стиле Telegram */}
      <div className="px-4 pb-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <button
          type="submit"
          disabled={isSubmitting || isFormSubmitted}
          className="w-full rounded-xl px-4 py-3 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--tg-theme-button-color, #3390ec)',
            color: 'var(--tg-theme-button-text-color, #ffffff)',
          }}
        >
          {isSubmitting ? 'Отправка...' : 'Отправить данные'}
        </button>
      </div>
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
