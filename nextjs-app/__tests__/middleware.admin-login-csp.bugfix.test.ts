/**
 * Exploratory Property-Based Test для Bug Condition
 * 
 * Bugfix Spec: CSP Admin Login Fix
 * 
 * ЦЕЛЬ: Выявить counterexamples, демонстрирующие существование бага
 * 
 * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: Этот тест ПРОВАЛИТСЯ на неисправленном коде
 * Провал подтверждает существование бага и помогает понять первопричину
 * 
 * ВАЖНО: Этот тест кодирует ОЖИДАЕМОЕ поведение (Expected Behavior)
 * После исправления бага этот же тест должен ПРОЙТИ, подтверждая корректность исправления
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { getToken } from 'next-auth/jwt';
import * as fc from 'fast-check';

// Мокируем next-auth/jwt
vi.mock('next-auth/jwt');

describe('Bugfix Exploratory Test - Property 1: Fault Condition - CSP блокирует inline-скрипты Next.js для /login и /admin', () => {
  beforeEach(() => {
    // Мокируем getToken для предотвращения редиректа
    vi.mocked(getToken).mockResolvedValue({
      name: 'Test Admin',
      email: 'admin@example.com',
      sub: '1',
    } as any);
  });

  /**
   * Property 1.1: CSP для /login должна разрешать unsafe-inline для Next.js hydration
   * 
   * Bug Condition: pathname === '/login' AND browserReceivedCSP.scriptSrc НЕ содержит 'unsafe-inline'
   * Expected Behavior: CSP должна содержать 'unsafe-inline' для Next.js hydration
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Текущая CSP блокирует inline-скрипты, что ломает Next.js hydration
   * 
   * **Validates: Requirements 1.1, 2.1**
   */
  it('Property 1.1: CSP для /login должна разрешать unsafe-inline для Next.js hydration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные варианты /login роута
        fc.record({
          queryParams: fc.option(
            fc.record({
              callbackUrl: fc.option(
                fc.constantFrom('/admin', '/admin/dashboard', '/webapp'),
                { nil: undefined }
              ),
              error: fc.option(
                fc.constantFrom('CredentialsSignin', 'AccessDenied'),
                { nil: undefined }
              ),
            }),
            { nil: undefined }
          ),
          hash: fc.option(fc.constantFrom('', '#form', '#error'), { nil: undefined }),
        }),
        async ({ queryParams, hash }) => {
          // Формируем URL для /login с различными параметрами
          let url = 'https://example.com/login';
          
          if (queryParams) {
            const params = new URLSearchParams();
            if (queryParams.callbackUrl) params.set('callbackUrl', queryParams.callbackUrl);
            if (queryParams.error) params.set('error', queryParams.error);
            const queryString = params.toString();
            if (queryString) url += `?${queryString}`;
          }
          
          if (hash) url += hash;

          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(cspHeader).not.toBeNull();

          // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: CSP должна содержать 'unsafe-inline' в script-src
          // Это необходимо для Next.js hydration скриптов
          const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
          expect(scriptSrcMatch).toBeTruthy();

          const scriptSrcDirective = scriptSrcMatch![0];
          
          // КРИТИЧЕСКАЯ ПРОВЕРКА: должен быть 'unsafe-inline'
          expect(
            scriptSrcDirective,
            `CSP для /login должна содержать 'unsafe-inline' для Next.js hydration. ` +
            `Текущая CSP: ${scriptSrcDirective}`
          ).toContain("'unsafe-inline'");
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 1.2: CSP для /admin должна разрешать unsafe-inline для Next.js hydration
   * 
   * Bug Condition: pathname === '/admin' AND browserReceivedCSP.scriptSrc НЕ содержит 'unsafe-inline'
   * Expected Behavior: CSP должна содержать 'unsafe-inline' для Next.js hydration
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Текущая CSP блокирует inline-скрипты, что ломает React-компоненты
   * 
   * **Validates: Requirements 1.2, 2.2**
   */
  it('Property 1.2: CSP для /admin должна разрешать unsafe-inline для Next.js hydration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные варианты /admin роута
        fc.record({
          subpath: fc.option(
            fc.constantFrom('', '/dashboard', '/users', '/settings'),
            { nil: undefined }
          ),
          queryParams: fc.option(
            fc.record({
              tab: fc.option(
                fc.constantFrom('overview', 'analytics', 'settings'),
                { nil: undefined }
              ),
            }),
            { nil: undefined }
          ),
        }),
        async ({ subpath, queryParams }) => {
          // Формируем URL для /admin с различными подпутями и параметрами
          let url = `https://example.com/admin${subpath || ''}`;
          
          if (queryParams && queryParams.tab) {
            url += `?tab=${queryParams.tab}`;
          }

          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(cspHeader).not.toBeNull();

          // ОЖИДАЕМОЕ ПОВЕДЕНИЕ: CSP должна содержать 'unsafe-inline' в script-src
          const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
          expect(scriptSrcMatch).toBeTruthy();

          const scriptSrcDirective = scriptSrcMatch![0];
          
          // КРИТИЧЕСКАЯ ПРОВЕРКА: должен быть 'unsafe-inline'
          expect(
            scriptSrcDirective,
            `CSP для /admin должна содержать 'unsafe-inline' для Next.js hydration. ` +
            `Текущая CSP: ${scriptSrcDirective}. URL: ${url}`
          ).toContain("'unsafe-inline'");
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 1.3: Middleware устанавливает CSP с unsafe-inline, но браузер получает строгую CSP
   * 
   * Bug Condition: middlewareSetCSP.scriptSrc содержит 'unsafe-inline' 
   *                AND browserReceivedCSP.scriptSrc НЕ содержит 'unsafe-inline'
   * 
   * Эта проверка демонстрирует первопричину: middleware вызывает buildWebAppCSPHeader()
   * и устанавливает заголовок с 'unsafe-inline', но что-то переопределяет его
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Демонстрирует, что заголовки переопределяются после middleware
   * 
   * **Validates: Requirements 1.3, 2.3**
   */
  it('Property 1.3: Middleware корректно устанавливает CSP для /login и /admin', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные роуты /login и /admin
        fc.constantFrom(
          'https://example.com/login',
          'https://example.com/login?callbackUrl=/admin',
          'https://example.com/admin',
          'https://example.com/admin/dashboard',
          'https://example.com/admin/users'
        ),
        async (url) => {
          const request = new NextRequest(new URL(url));
          const response = await middleware(request);

          const cspHeader = response.headers.get('Content-Security-Policy');
          expect(cspHeader).not.toBeNull();

          // Проверяем, что middleware устанавливает правильную CSP
          // Согласно коду middleware.ts, для /login и /admin должна применяться
          // функция buildWebAppCSPHeader(), которая включает 'unsafe-inline'
          
          const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
          expect(scriptSrcMatch).toBeTruthy();

          const scriptSrcDirective = scriptSrcMatch![0];

          // КРИТИЧЕСКАЯ ПРОВЕРКА: middleware должен установить 'unsafe-inline'
          expect(
            scriptSrcDirective,
            `Middleware должен установить CSP с 'unsafe-inline' для ${url}. ` +
            `Текущая CSP: ${scriptSrcDirective}`
          ).toContain("'unsafe-inline'");

          // Дополнительная проверка: должны быть домены Telegram (из buildWebAppCSPHeader)
          expect(
            scriptSrcDirective,
            `CSP должна содержать https://telegram.org (из buildWebAppCSPHeader). ` +
            `Текущая CSP: ${scriptSrcDirective}`
          ).toContain('https://telegram.org');

          expect(
            scriptSrcDirective,
            `CSP должна содержать https://t.me (из buildWebAppCSPHeader). ` +
            `Текущая CSP: ${scriptSrcDirective}`
          ).toContain('https://t.me');
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property 1.4: Граничный случай - подпути /admin должны получать ту же CSP
   * 
   * Bug Condition: pathname.startsWith('/admin') AND CSP не содержит 'unsafe-inline'
   * Expected Behavior: Все подпути /admin должны получать мягкую CSP
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * 
   * **Validates: Requirements 2.2, 2.4**
   */
  it('Property 1.4: Все подпути /admin должны получать мягкую CSP с unsafe-inline', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Генерируем различные подпути /admin
        fc.constantFrom(
          '/admin',
          '/admin/',
          '/admin/dashboard',
          '/admin/users',
          '/admin/settings',
          '/admin/analytics/reports'
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

          // КРИТИЧЕСКАЯ ПРОВЕРКА: все подпути /admin должны получать 'unsafe-inline'
          expect(
            scriptSrcDirective,
            `Все подпути /admin должны получать CSP с 'unsafe-inline'. ` +
            `Путь: ${pathname}, CSP: ${scriptSrcDirective}`
          ).toContain("'unsafe-inline'");
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 1.5: Комплексная проверка - все требования для /login и /admin
   * 
   * Проверяет все аспекты Expected Behavior одновременно
   * 
   * ОЖИДАЕМЫЙ РЕЗУЛЬТАТ НА НЕИСПРАВЛЕННОМ КОДЕ: ПРОВАЛ
   * Демонстрирует полную картину бага
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   */
  it('Property 1.5: Комплексная проверка - CSP для /login и /admin должна поддерживать Next.js', async () => {
    const testCases = [
      { url: 'https://example.com/login', path: '/login' },
      { url: 'https://example.com/login?callbackUrl=/admin', path: '/login' },
      { url: 'https://example.com/admin', path: '/admin' },
      { url: 'https://example.com/admin/dashboard', path: '/admin/dashboard' },
    ];

    for (const { url, path } of testCases) {
      const request = new NextRequest(new URL(url));
      const response = await middleware(request);

      const cspHeader = response.headers.get('Content-Security-Policy');
      expect(cspHeader).not.toBeNull();

      // Все критические проверки вместе
      const scriptSrcMatch = cspHeader?.match(/script-src[^;]+/);
      expect(scriptSrcMatch).toBeTruthy();
      const scriptSrcDirective = scriptSrcMatch![0];

      // 1. unsafe-inline для Next.js hydration
      expect(
        scriptSrcDirective,
        `CSP для ${path} должна содержать 'unsafe-inline'. CSP: ${scriptSrcDirective}`
      ).toContain("'unsafe-inline'");

      // 2. Домены Telegram (из buildWebAppCSPHeader)
      expect(
        scriptSrcDirective,
        `CSP для ${path} должна содержать https://telegram.org. CSP: ${scriptSrcDirective}`
      ).toContain('https://telegram.org');

      expect(
        scriptSrcDirective,
        `CSP для ${path} должна содержать https://t.me. CSP: ${scriptSrcDirective}`
      ).toContain('https://t.me');

      // 3. frame-ancestors для iframe (из buildWebAppCSPHeader)
      expect(
        cspHeader,
        `CSP для ${path} должна содержать frame-ancestors. CSP: ${cspHeader}`
      ).toContain('frame-ancestors');

      expect(
        cspHeader,
        `CSP для ${path} должна содержать https://web.telegram.org. CSP: ${cspHeader}`
      ).toContain('https://web.telegram.org');
    }
  });
});
