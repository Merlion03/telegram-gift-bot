'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DeliveryForm } from '@/components/webapp/DeliveryForm';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

function WebAppContent() {
  const searchParams = useSearchParams();
  const [prizeId, setPrizeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Динамический импорт Telegram WebApp SDK только на клиенте
    const initWebApp = async () => {
      if (typeof window !== 'undefined') {
        const WebApp = (await import('@twa-dev/sdk')).default;
        WebApp.ready();
        WebApp.expand();
        setIsReady(true);
      }
    };
    
    initWebApp();

    // Получение prize_id из query параметров
    const prizeIdParam = searchParams.get('prize_id');
    
    if (!prizeIdParam) {
      setError('Отсутствует параметр prize_id. Откройте форму через бота.');
      return;
    }

    const parsedPrizeId = parseInt(prizeIdParam, 10);
    
    if (isNaN(parsedPrizeId) || parsedPrizeId <= 0) {
      setError('Некорректный prize_id. Обратитесь в поддержку.');
      return;
    }

    setPrizeId(parsedPrizeId);
  }, [searchParams]);

  if (!isReady) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}
      >
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p style={{ color: 'var(--tg-theme-text-color, #000000)' }}>Инициализация...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}
      >
        <div 
          className="max-w-md w-full rounded-lg shadow-md p-6"
          style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #f1f1f1)' }}
        >
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 
            className="text-xl font-semibold text-center mb-2"
            style={{ color: 'var(--tg-theme-text-color, #000000)' }}
          >
            Ошибка
          </h2>
          <p 
            className="text-center"
            style={{ color: 'var(--tg-theme-hint-color, #999999)' }}
          >{error}</p>
        </div>
      </div>
    );
  }

  if (prizeId === null) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}
      >
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p style={{ color: 'var(--tg-theme-text-color, #000000)' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen py-8"
      style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}
    >
      <div className="max-w-md mx-auto">
        <div 
          className="rounded-lg shadow-md overflow-hidden"
          style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #f1f1f1)' }}
        >
          <div className="bg-blue-600 px-6 py-4">
            <h1 className="text-xl font-bold text-white text-center">
              📦 Данные для доставки приза
            </h1>
          </div>
          <DeliveryForm prizeId={prizeId} />
        </div>
      </div>
    </div>
  );
}

export default function WebAppPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div 
            className="min-h-screen flex items-center justify-center p-4"
            style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}
          >
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p style={{ color: 'var(--tg-theme-text-color, #000000)' }}>Загрузка...</p>
            </div>
          </div>
        }
      >
        <WebAppContent />
      </Suspense>
    </ErrorBoundary>
  );
}
