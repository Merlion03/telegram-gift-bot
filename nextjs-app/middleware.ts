/**
 * Next.js Middleware для настройки безопасности и аутентификации
 * 
 * Функции:
 * - Добавляет Content Security Policy (CSP) заголовки для защиты от XSS-атак
 * - Проверяет аутентификацию для защищённых роутов (/admin, /api/support)
 * - Редиректит неавторизованных пользователей на страницу входа
 * 
 * Requirements: 11.1, 11.2, 12.4
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Content Security Policy директивы
 * 
 * Запрещает:
 * - Inline scripts (защита от XSS)
 * - Внешние источники скриптов (кроме разрешённых)
 * - Небезопасные eval()
 * 
 * Разрешает:
 * - Скрипты только с того же origin ('self')
 * - Стили с того же origin и inline стили (для Tailwind CSS)
 * - Изображения с любых источников (для Telegram аватаров)
 * - Подключения к API того же origin
 */
const CSP_DIRECTIVES = {
  // Скрипты только с того же origin, без inline
  'script-src': ["'self'"],
  
  // Стили с того же origin и inline (для Tailwind CSS)
  // unsafe-inline нужен для динамических стилей Tailwind
  'style-src': ["'self'", "'unsafe-inline'"],
  
  // Изображения с любых источников (для Telegram аватаров и внешних изображений)
  'img-src': ["'self'", 'data:', 'https:', 'http:'],
  
  // Шрифты только с того же origin
  'font-src': ["'self'"],
  
  // Подключения (fetch, WebSocket) только к тому же origin
  'connect-src': ["'self'"],
  
  // Фреймы запрещены (защита от clickjacking)
  'frame-src': ["'none'"],
  
  // Объекты (Flash, Java) запрещены
  'object-src': ["'none'"],
  
  // Базовый URI ограничен тем же origin
  'base-uri': ["'self'"],
  
  // Формы могут отправляться только на тот же origin
  'form-action': ["'self'"],
  
  // Разрешаем загрузку в iframe только для Telegram WebApp
  // 'frame-ancestors': ["'none'"], // Закомментировано для работы Telegram WebApp
  
  // Обновление небезопасных запросов до HTTPS
  'upgrade-insecure-requests': [],
  
  // Блокировка всего контента при нарушении CSP
  'block-all-mixed-content': [],
};

/**
 * Формирует строку CSP из директив
 */
function buildCSPHeader(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

/**
 * Middleware функция
 * 
 * Выполняет:
 * 1. Проверку аутентификации для защищённых роутов
 * 2. Добавление заголовков безопасности ко всем ответам
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Проверка аутентификации для защищённых роутов (Requirements 11.1, 11.2)
  const protectedPaths = ['/admin', '/api/support'];
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
  
  if (isProtectedPath) {
    // Получаем токен из сессии
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    
    // Если токен отсутствует - редирект на страницу входа (Requirement 11.2)
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  
  // Создаём response
  const response = NextResponse.next();
  
  // Добавляем CSP заголовок (Requirement 12.4)
  const cspHeader = buildCSPHeader();
  response.headers.set('Content-Security-Policy', cspHeader);
  
  // Дополнительные заголовки безопасности
  
  // X-Frame-Options: защита от clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  
  // X-Content-Type-Options: предотвращает MIME-sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Referrer-Policy: контроль передачи referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions-Policy: ограничение доступа к API браузера
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  
  return response;
}

/**
 * Конфигурация matcher
 * 
 * Применяем middleware ко всем путям, включая защищённые роуты
 */
export const config = {
  matcher: [
    /*
     * Применяем ко всем путям кроме:
     * - _next/static (статические файлы)
     * - _next/image (оптимизированные изображения)
     * - favicon.ico (иконка)
     * - /api/auth/* (NextAuth endpoints)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
