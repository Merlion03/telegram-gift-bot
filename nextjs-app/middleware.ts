/**
 * Next.js Middleware для настройки безопасности и аутентификации
 * 
 * Функции:
 * - Добавляет Content Security Policy (CSP) заголовки для защиты от XSS-атак
 * - Проверяет JWT аутентификацию для защищённых роутов (/admin, /api/admin)
 * - Редиректит неавторизованных пользователей на страницу входа
 * 
 * Requirements: 11.1, 11.2, 12.4
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { JWTSessionService } from '@/lib/services/jwtSessionService';

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
 * Формирует CSP заголовок для Telegram WebApp роута
 * 
 * Отличия от стандартной CSP:
 * - 'unsafe-inline' в script-src: необходим для Next.js hydration скриптов
 * - https://telegram.org и https://t.me: разрешает загрузку Telegram WebApp SDK
 * - frame-ancestors: разрешает встраивание страницы в Telegram iframe
 * 
 * Эта более мягкая политика применяется только к роуту /webapp,
 * все остальные роуты используют строгую CSP для защиты от XSS
 */
function buildWebAppCSPHeader(): string {
  const WEBAPP_CSP_DIRECTIVES = {
    // Скрипты: разрешаем inline для Next.js и домены Telegram для SDK
    'script-src': ["'self'", "'unsafe-inline'", 'https://telegram.org', 'https://t.me'],
    
    // Стили с того же origin и inline (для Tailwind CSS)
    'style-src': ["'self'", "'unsafe-inline'"],
    
    // Изображения с любых источников (для Telegram аватаров)
    'img-src': ["'self'", 'data:', 'https:', 'http:'],
    
    // Шрифты только с того же origin
    'font-src': ["'self'"],
    
    // Подключения только к тому же origin
    'connect-src': ["'self'"],
    
    // Фреймы запрещены
    'frame-src': ["'none'"],
    
    // Объекты запрещены
    'object-src': ["'none'"],
    
    // Базовый URI ограничен тем же origin
    'base-uri': ["'self'"],
    
    // Формы только на тот же origin
    'form-action': ["'self'"],
    
    // Разрешаем встраивание в Telegram iframe
    'frame-ancestors': ['https://web.telegram.org', 'https://telegram.org'],
    
    // Обновление небезопасных запросов до HTTPS
    'upgrade-insecure-requests': [],
    
    // Блокировка смешанного контента
    'block-all-mixed-content': [],
  };
  
  return Object.entries(WEBAPP_CSP_DIRECTIVES)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

/**
 * Извлекает JWT токен из cookie или Authorization header
 * @param request - Next.js request
 * @returns JWT токен или null
 */
function extractToken(request: NextRequest): string | null {
  // Пытаемся получить токен из cookie 'admin-token'
  const cookieToken = request.cookies.get('admin-token')?.value;
  
  if (cookieToken) {
    return cookieToken;
  }
  
  // Пытаемся получить токен из Authorization header
  const authHeader = request.headers.get('authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * Middleware функция
 * 
 * Выполняет:
 * 1. Проверку JWT аутентификации для защищённых роутов
 * 2. Добавление заголовков безопасности ко всем ответам
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Проверка аутентификации для защищённых роутов (Requirements 11.1, 11.2)
  // Для /admin не делаем редирект - страница сама проверит токен и редиректнет если нужно
  // Это сохраняет контекст Telegram WebApp при редиректе
  const protectedPaths = ['/api/admin', '/api/support'];
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
  
  if (isProtectedPath) {
    // Извлекаем JWT токен из cookie или Authorization header
    const token = extractToken(request);
    
    // Если токен отсутствует - редирект на страницу входа (Requirement 11.2)
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    
    // Валидируем JWT токен
    try {
      const jwtSecret = process.env.JWT_SECRET;
      
      if (!jwtSecret) {
        console.error('JWT_SECRET is not configured');
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
      
      const jwtService = new JWTSessionService({
        secretKey: jwtSecret,
      });
      
      const claims = await jwtService.validateToken(token);
      
      // Если токен невалиден или истёк - редирект на страницу входа
      if (!claims) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }
      
      // Добавляем claims в request headers для использования в API routes
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-admin-tgid', claims.tgId.toString());
      requestHeaders.set('x-admin-role', claims.role.toString());
      
      // Создаём response с обновлёнными headers
      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
      
      // Применяем CSP заголовки (см. ниже)
      applyCspHeaders(response, pathname);
      
      return response;
    } catch (error) {
      console.error('Error validating JWT token in middleware:', error);
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }
  
  // Создаём response для незащищённых роутов
  const response = NextResponse.next();
  
  // Применяем CSP заголовки
  applyCspHeaders(response, pathname);
  
  return response;
}

/**
 * Применяет CSP заголовки к response
 * @param response - Next.js response
 * @param pathname - Путь запроса
 */
function applyCspHeaders(response: NextResponse, pathname: string): void {
  
  // Применяем роут-специфичную CSP политику (Requirement 12.4)
  // Для /webapp, /login и /admin используем более мягкую политику с 'unsafe-inline'
  // Это необходимо для корректной работы Next.js hydration и Client Components
  // Для всех остальных роутов используем строгую CSP для защиты от XSS
  const needsRelaxedCSP = 
    pathname === '/webapp' || pathname.startsWith('/webapp/') ||
    pathname === '/login' || pathname.startsWith('/login/') ||
    pathname === '/admin' || pathname.startsWith('/admin/');
  
  const cspHeader = needsRelaxedCSP
    ? buildWebAppCSPHeader()  // Мягкая CSP для /webapp, /login, /admin
    : buildCSPHeader();        // Строгая CSP для остальных роутов
  
  response.headers.set('Content-Security-Policy', cspHeader);
  
  // Дополнительные заголовки безопасности
  
  // X-Frame-Options: защита от clickjacking
  // Для роутов с мягкой CSP (/webapp, /login, /admin) не устанавливаем этот заголовок,
  // так как они используют frame-ancestors в CSP
  // Для всех остальных роутов применяем DENY для защиты от clickjacking атак
  if (!needsRelaxedCSP) {
    response.headers.set('X-Frame-Options', 'DENY');
  }
  
  // X-Content-Type-Options: предотвращает MIME-sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Referrer-Policy: контроль передачи referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions-Policy: ограничение доступа к API браузера
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
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
