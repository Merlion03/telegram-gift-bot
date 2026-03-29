'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTelegramUserId, isTelegramWebApp, initTelegramWebApp } from '@/lib/utils/telegramWebApp';

/**
 * Компонент формы логина с автоматическим извлечением tg_id из Telegram WebApp
 * Обёрнут в Suspense для соответствия требованиям Next.js 16
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin';
  
  const [tgId, setTgId] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Инициализация Telegram WebApp и извлечение tg_id
  useEffect(() => {
    const initWebApp = async () => {
      // Ждём загрузки Telegram WebApp SDK (максимум 3 секунды)
      let attempts = 0;
      const maxAttempts = 30; // 30 попыток по 100ms = 3 секунды
      
      while (!isTelegramWebApp() && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // Инициализируем Telegram WebApp API
      initTelegramWebApp();

      // Проверяем, что приложение открыто в Telegram
      if (!isTelegramWebApp()) {
        setError('Доступ разрешён только через Telegram WebApp');
        setIsLoading(false);
        return;
      }

      // Логируем данные для диагностики
      console.log('Telegram WebApp initDataUnsafe:', window.Telegram?.WebApp?.initDataUnsafe);
      console.log('Telegram WebApp initData:', window.Telegram?.WebApp?.initData);

      // Извлекаем tg_id из Telegram WebApp контекста
      const userId = getTelegramUserId();
      
      if (!userId) {
        setError('Не удалось получить Telegram User ID');
        setIsLoading(false);
        return;
      }

      setTgId(userId);

      // Проверяем, первый ли это вход
      checkFirstLogin(userId);
    };

    initWebApp();
  }, []);

  /**
   * Проверяет, первый ли это вход администратора
   */
  const checkFirstLogin = async (userId: number) => {
    try {
      const response = await fetch(`/api/auth/check-first-login?tgId=${userId}`);
      
      if (!response.ok) {
        if (response.status === 403) {
          setError('Доступ запрещён. Вы не являетесь администратором.');
        } else {
          setError('Ошибка проверки статуса входа');
        }
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      
      if (!data.exists) {
        setError('Доступ запрещён. Вы не являетесь администратором.');
        setIsLoading(false);
        return;
      }

      setIsFirstLogin(data.isFirstLogin);
      setIsLoading(false);
    } catch (err) {
      setError('Ошибка соединения с сервером');
      console.error('Check first login error:', err);
      setIsLoading(false);
    }
  };

  /**
   * Обработчик отправки формы (регистрация или вход)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tgId) {
      setError('Telegram User ID недоступен');
      return;
    }

    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // Выбираем endpoint в зависимости от типа входа
      const endpoint = isFirstLogin ? '/api/auth/register' : '/api/auth/login';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tgId,
          password,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Неверный пароль');
        } else if (response.status === 429) {
          const data = await response.json();
          setError(data.error || 'Слишком много попыток входа. Попробуйте позже.');
        } else if (response.status === 403) {
          setError('Доступ запрещён');
        } else {
          setError('Ошибка аутентификации');
        }
        setIsSubmitting(false);
        return;
      }

      const data = await response.json();

      // Сохраняем JWT токен в cookie
      document.cookie = `admin-token=${data.token}; path=/; max-age=${24 * 60 * 60}; SameSite=Strict`;

      // Редирект на админ-панель
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError('Ошибка соединения с сервером');
      console.error('Login error:', err);
      setIsSubmitting(false);
    }
  };

  // Показываем загрузку пока проверяем статус
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Загрузка...</div>
      </div>
    );
  }

  // Показываем ошибку если нет доступа
  if (error && !tgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">
          {isFirstLogin ? 'Установка пароля' : 'Вход в админку'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {isFirstLogin ? 'Установите пароль' : 'Пароль'}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isFirstLogin ? 'Установите пароль' : 'Пароль'}
              required
              minLength={8}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete={isFirstLogin ? 'new-password' : 'current-password'}
            />
            {isFirstLogin && (
              <p className="text-xs text-gray-500 mt-1">
                Минимум 8 символов
              </p>
            )}
          </div>

          {error && tgId && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (isFirstLogin ? 'Установка...' : 'Вход...') : (isFirstLogin ? 'Установить пароль' : 'Войти')}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Страница входа в админку
 * 
 * Автоматически извлекает tg_id из Telegram WebApp API и определяет,
 * первый ли это вход администратора (установка пароля) или повторный (аутентификация).
 * 
 * Блокирует доступ из обычных браузеров - только через Telegram WebApp.
 * После успешного входа редиректит на /admin.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 9.4
 */
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Загрузка...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
