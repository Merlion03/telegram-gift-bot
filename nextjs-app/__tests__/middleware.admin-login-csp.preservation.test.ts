/**
 * Preservation Property-Based Tests
 * 
 * Bugfix Spec: CSP Admin Login Fix
 * 
 * ЦЕЛЬ: Зафиксировать существующее корректное поведение для не-багованных роутов
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Эти тесты ПРОХОДЯТ на неисправленном коде
 * Прохождение подтверждает базовое поведение, которое должно сохраниться после исправления
 * 
 * ВАЖНО: Следуем методологии observation-first
 * - Наблюдаем поведение на НЕИСПРАВЛЕННОМ коде
 * - Фиксируем наблюдаемые паттерны в property-based тестах
 * - После исправления эти же тесты должны ПРОДОЛЖАТЬ ПРОХОДИТЬ
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { getToken } from 'next-auth/jwt';
import * as fc from 'fast-check';

// Мокируем next-auth/jwt
vi.mock('next-auth/jwt');

describe('Preservation Tests - Property 2: Неизменное поведение для других роутов', () => {
  /**
   * Property 2.1: /webapp должен продолжать получать мягкую CSP с unsafe-inline и доменами Telegram
   * 
   * Preservation Requirement 3.1: Мягкая CSP для /webapp должна остаться неизменной
   * 
   * Наблюдаемое поведение на неисправленном коде:
   * - script-src содержит 'self', 'unsafe-inline', https://telegram.org, https://t.me
   * - frame-ancestors содержит https://web.telegram.org, https://telegram.org
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirement 3.1**
   */
  it('Property 2.1: /webapp должен продолжать получать мягкую CSP с unsafe-inline и доменами Telegram', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные варианты /webapp роута
        fc.record({
          subpath: fc.option(
            fc.constantFrom('', '/', '/game', '/profile', '/settings'),
            { nil: undefined }
          ),
          queryParams: fc.option(
            fc.record({
              userId: fc.option(fc.integer({ min: 1, max: 999999 }), { nil: undefined }),
              chatId: fc.option(fc.integer({ min: 1, max: 999999 }), { nil: undefined }),
            }),
            { nil: undefined }
          ),
        }),
        async ({ subpath, queryParams }) => {
          // Формируем URL для /webapp
          let url = `https://example.com/webapp${subpath || ''}`;
          
          if (queryParams) {
            const params = new URLSearchParams();
            if (queryParams.userId) params.set('userId', queryParams.userId.toString());
            if (queryParams.chatId) params.set('chatId', queryParams.chatId.toString());
            const queryString = params.toString();
            if (queryString) url += `?${queryString}`;
          }

          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(cspHeader).not.toBeNull();

          // Проверяем script-src директиву
          const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
          expect(scriptSrcMatch).toBeTruthy();
          const scriptSrcDirective = scriptSrcMatch![0];

          // Мягкая CSP для /webapp должна содержать:
          // 1. 'unsafe-inline' для Next.js hydration
          expect(
            scriptSrcDirective,
            `CSP для /webapp должна содержать 'unsafe-inline'. URL: ${url}, CSP: ${scriptSrcDirective}`
          ).toContain("'unsafe-inline'");

          // 2. Домены Telegram для SDK
          expect(
            scriptSrcDirective,
            `CSP для /webapp должна содержать https://telegram.org. URL: ${url}, CSP: ${scriptSrcDirective}`
          ).toContain('https://telegram.org');

          expect(
            scriptSrcDirective,
            `CSP для /webapp должна содержать https://t.me. URL: ${url}, CSP: ${scriptSrcDirective}`
          ).toContain('https://t.me');

          // 3. frame-ancestors для встраивания в Telegram
          expect(
            cspHeader,
            `CSP для /webapp должна содержать frame-ancestors. URL: ${url}, CSP: ${cspHeader}`
          ).toContain('frame-ancestors');

          expect(
            cspHeader,
            `CSP для /webapp должна содержать https://web.telegram.org. URL: ${url}, CSP: ${cspHeader}`
          ).toContain('https://web.telegram.org');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2.2: Другие страницы должны продолжать получать строгую CSP без unsafe-inline
   * 
   * Preservation Requirement 3.2: Строгая CSP для остальных роутов должна остаться неизменной
   * 
   * Наблюдаемое поведение на неисправленном коде:
   * - script-src содержит только 'self', БЕЗ 'unsafe-inline'
   * - Нет доменов Telegram
   * - frame-ancestors отсутствует или установлен в 'none'
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirement 3.2**
   */
  it('Property 2.2: Другие страницы должны продолжать получать строгую CSP без unsafe-inline', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные роуты, которые НЕ являются /webapp, /login, /admin
        fc.constantFrom(
          '/',
          '/about',
          '/contact',
          '/pricing',
          '/features',
          '/docs',
          '/blog',
          '/blog/post-1',
          '/api/public/health'
        ),
        async (pathname) => {
          const url = `https://example.com${pathname}`;
          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(cspHeader).not.toBeNull();

          // Проверяем script-src директиву
          const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
          expect(scriptSrcMatch).toBeTruthy();
          const scriptSrcDirective = scriptSrcMatch![0];

          // Строгая CSP НЕ должна содержать:
          // 1. 'unsafe-inline' - защита от XSS
          expect(
            scriptSrcDirective,
            `Строгая CSP для ${pathname} НЕ должна содержать 'unsafe-inline'. CSP: ${scriptSrcDirective}`
          ).not.toContain("'unsafe-inline'");

          // 2. Домены Telegram - они нужны только для /webapp
          expect(
            scriptSrcDirective,
            `Строгая CSP для ${pathname} НЕ должна содержать https://telegram.org. CSP: ${scriptSrcDirective}`
          ).not.toContain('https://telegram.org');

          expect(
            scriptSrcDirective,
            `Строгая CSP для ${pathname} НЕ должна содержать https://t.me. CSP: ${scriptSrcDirective}`
          ).not.toContain('https://t.me');

          // 3. Должна содержать только 'self'
          expect(
            scriptSrcDirective,
            `Строгая CSP для ${pathname} должна содержать 'self'. CSP: ${scriptSrcDirective}`
          ).toContain("'self'");
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2.3: Аутентификация должна продолжать корректно редиректить неавторизованных пользователей
   * 
   * Preservation Requirement 3.3: Проверка аутентификации должна работать корректно
   * 
   * Наблюдаемое поведение на неисправленном коде:
   * - Неавторизованные запросы к /admin редиректятся на /login
   * - Неавторизованные запросы к /api/support редиректятся на /login
   * - callbackUrl параметр сохраняется для возврата после логина
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirement 3.3**
   */
  it('Property 2.3: Аутентификация должна корректно редиректить неавторизованных пользователей', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные защищённые роуты
        fc.constantFrom(
          '/admin',
          '/admin/dashboard',
          '/admin/users',
          '/api/support',
          '/api/support/tickets'
        ),
        async (pathname) => {
          // Мокируем отсутствие токена (неавторизованный пользователь)
          vi.mocked(getToken).mockResolvedValue(null);

          const url = `https://example.com${pathname}`;
          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          // Проверяем редирект на /login
          expect(
            response.status,
            `Неавторизованный запрос к ${pathname} должен редиректить. Status: ${response.status}`
          ).toBe(307); // Next.js использует 307 для редиректов

          const location = response.headers.get('location');
          expect(
            location,
            `Редирект должен быть на /login. Location: ${location}`
          ).toContain('/login');

          // Проверяем, что callbackUrl сохраняется
          expect(
            location,
            `callbackUrl должен содержать оригинальный путь ${pathname}. Location: ${location}`
          ).toContain(`callbackUrl=${encodeURIComponent(pathname)}`);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 2.4: Авторизованные пользователи должны получать доступ к защищённым роутам
   * 
   * Preservation Requirement 3.3: Аутентификация должна работать корректно
   * 
   * Наблюдаемое поведение на неисправленном коде:
   * - Авторизованные запросы к /admin НЕ редиректятся
   * - Авторизованные запросы к /api/support НЕ редиректятся
   * - Response содержит корректные заголовки безопасности
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirement 3.3**
   */
  it('Property 2.4: Авторизованные пользователи должны получать доступ к защищённым роутам', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные защищённые роуты
        fc.constantFrom(
          '/admin',
          '/admin/dashboard',
          '/admin/users',
          '/api/support',
          '/api/support/tickets'
        ),
        async (pathname) => {
          // Мокируем наличие токена (авторизованный пользователь)
          vi.mocked(getToken).mockResolvedValue({
            name: 'Test Admin',
            email: 'admin@example.com',
            sub: '1',
          } as any);

          const url = `https://example.com${pathname}`;
          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          // Проверяем, что НЕТ редиректа
          expect(
            response.status,
            `Авторизованный запрос к ${pathname} НЕ должен редиректить. Status: ${response.status}`
          ).not.toBe(307);

          // Проверяем наличие заголовков безопасности
          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(
            cspHeader,
            `Response для ${pathname} должен содержать CSP заголовок`
          ).not.toBeNull();
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 2.5: Дополнительные заголовки безопасности должны устанавливаться корректно
   * 
   * Preservation Requirement 3.4: Дополнительные заголовки безопасности должны работать корректно
   * 
   * Наблюдаемое поведение на неисправленном коде:
   * - X-Content-Type-Options: nosniff
   * - Referrer-Policy: strict-origin-when-cross-origin
   * - Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
   * - X-Frame-Options: DENY (для всех роутов кроме /webapp)
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirement 3.4**
   */
  it('Property 2.5: Дополнительные заголовки безопасности должны устанавливаться корректно', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные роуты
        fc.constantFrom(
          '/',
          '/about',
          '/webapp',
          '/login',
          '/admin'
        ),
        async (pathname) => {
          // Мокируем авторизацию для защищённых роутов
          vi.mocked(getToken).mockResolvedValue({
            name: 'Test User',
            email: 'user@example.com',
            sub: '1',
          } as any);

          const url = `https://example.com${pathname}`;
          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          // 1. X-Content-Type-Options должен быть установлен для всех роутов
          expect(
            response.headers.get('X-Content-Type-Options'),
            `X-Content-Type-Options должен быть 'nosniff' для ${pathname}`
          ).toBe('nosniff');

          // 2. Referrer-Policy должен быть установлен для всех роутов
          expect(
            response.headers.get('Referrer-Policy'),
            `Referrer-Policy должен быть установлен для ${pathname}`
          ).toBe('strict-origin-when-cross-origin');

          // 3. Permissions-Policy должен быть установлен для всех роутов
          const permissionsPolicy = response.headers.get('Permissions-Policy');
          expect(
            permissionsPolicy,
            `Permissions-Policy должен быть установлен для ${pathname}`
          ).not.toBeNull();
          expect(
            permissionsPolicy,
            `Permissions-Policy должен содержать camera=() для ${pathname}`
          ).toContain('camera=()');
          expect(
            permissionsPolicy,
            `Permissions-Policy должен содержать microphone=() для ${pathname}`
          ).toContain('microphone=()');

          // 4. X-Frame-Options должен быть DENY для всех роутов кроме /webapp, /login, /admin
          // После исправления бага /login и /admin используют мягкую CSP с frame-ancestors,
          // поэтому X-Frame-Options для них не устанавливается
          if (pathname === '/webapp' || pathname === '/login' || pathname === '/admin') {
            expect(
              response.headers.get('X-Frame-Options'),
              `X-Frame-Options НЕ должен быть установлен для ${pathname} (используют frame-ancestors в CSP)`
            ).toBeNull();
          } else {
            expect(
              response.headers.get('X-Frame-Options'),
              `X-Frame-Options должен быть 'DENY' для ${pathname}`
            ).toBe('DENY');
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 2.6: Граничные случаи - роуты похожие на /login и /admin не должны получать мягкую CSP
   * 
   * Preservation Requirement 3.2: Строгая CSP для остальных роутов
   * 
   * Наблюдаемое поведение на неисправленном коде:
   * - /login-page НЕ получает мягкую CSP (не начинается с /login)
   * - /administrator НЕ получает мягкую CSP (не начинается с /admin)
   * - /mylogin НЕ получает мягкую CSP
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirement 3.2**
   */
  it('Property 2.6: Граничные случаи - похожие роуты не должны получать мягкую CSP', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем роуты, похожие на /login и /admin, но не являющиеся ими
        fc.constantFrom(
          '/login-page',
          '/loginform',
          '/mylogin',
          '/administrator',
          '/adminpanel',
          '/myadmin'
        ),
        async (pathname) => {
          const url = `https://example.com${pathname}`;
          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(cspHeader).not.toBeNull();

          const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
          expect(scriptSrcMatch).toBeTruthy();
          const scriptSrcDirective = scriptSrcMatch![0];

          // Эти роуты НЕ должны получать мягкую CSP
          expect(
            scriptSrcDirective,
            `${pathname} НЕ должен получать 'unsafe-inline'. CSP: ${scriptSrcDirective}`
          ).not.toContain("'unsafe-inline'");

          expect(
            scriptSrcDirective,
            `${pathname} НЕ должен получать домены Telegram. CSP: ${scriptSrcDirective}`
          ).not.toContain('https://telegram.org');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 2.7: Комплексная проверка - все preservation требования вместе
   * 
   * Проверяет все аспекты Preservation Requirements одновременно
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПРОХОДИТ на неисправленном коде
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */
  it('Property 2.7: Комплексная проверка - все preservation требования', async () => {
    // Мокируем авторизацию
    vi.mocked(getToken).mockResolvedValue({
      name: 'Test User',
      email: 'user@example.com',
      sub: '1',
    } as any);

    const testCases = [
      { 
        path: '/webapp', 
        expectUnsafeInline: true, 
        expectTelegramDomains: true,
        expectFrameAncestors: true,
        expectXFrameOptions: false
      },
      { 
        path: '/', 
        expectUnsafeInline: false, 
        expectTelegramDomains: false,
        expectFrameAncestors: false,
        expectXFrameOptions: true
      },
      { 
        path: '/about', 
        expectUnsafeInline: false, 
        expectTelegramDomains: false,
        expectFrameAncestors: false,
        expectXFrameOptions: true
      },
    ];

    for (const { path, expectUnsafeInline, expectTelegramDomains, expectFrameAncestors, expectXFrameOptions } of testCases) {
      const url = `https://example.com${path}`;
      const request = new NextRequest(new URL(url));
      const response = await middleware(request);

      const cspHeader = response.headers.get('Content-Security-Policy');
      expect(cspHeader).not.toBeNull();

      const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
      expect(scriptSrcMatch).toBeTruthy();
      const scriptSrcDirective = scriptSrcMatch![0];

      // Проверка unsafe-inline
      if (expectUnsafeInline) {
        expect(
          scriptSrcDirective,
          `${path} должен содержать 'unsafe-inline'. CSP: ${scriptSrcDirective}`
        ).toContain("'unsafe-inline'");
      } else {
        expect(
          scriptSrcDirective,
          `${path} НЕ должен содержать 'unsafe-inline'. CSP: ${scriptSrcDirective}`
        ).not.toContain("'unsafe-inline'");
      }

      // Проверка доменов Telegram
      if (expectTelegramDomains) {
        expect(
          scriptSrcDirective,
          `${path} должен содержать домены Telegram. CSP: ${scriptSrcDirective}`
        ).toContain('https://telegram.org');
      } else {
        expect(
          scriptSrcDirective,
          `${path} НЕ должен содержать домены Telegram. CSP: ${scriptSrcDirective}`
        ).not.toContain('https://telegram.org');
      }

      // Проверка frame-ancestors
      if (expectFrameAncestors) {
        expect(
          cspHeader,
          `${path} должен содержать frame-ancestors. CSP: ${cspHeader}`
        ).toContain('frame-ancestors');
      }

      // Проверка X-Frame-Options
      if (expectXFrameOptions) {
        expect(
          response.headers.get('X-Frame-Options'),
          `${path} должен иметь X-Frame-Options: DENY`
        ).toBe('DENY');
      } else {
        expect(
          response.headers.get('X-Frame-Options'),
          `${path} НЕ должен иметь X-Frame-Options`
        ).toBeNull();
      }

      // Проверка других заголовков безопасности (должны быть для всех)
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    }
  });
});
