# Bugfix Requirements Document

## Введение

Критическая проблема с Content Security Policy (CSP) блокирует работу Telegram WebApp в Next.js приложении. Текущая строгая CSP политика (`script-src 'self'`) запрещает выполнение inline-скриптов, которые необходимы для:
- Next.js hydration (оживление React компонентов на клиенте)
- Telegram WebApp SDK инициализации
- Корректной работы WebApp внутри Telegram

Это приводит к множественным ошибкам CSP в консоли браузера и невозможности использования функционала доставки призов через Telegram WebApp.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN пользователь открывает страницу /webapp через Telegram Bot THEN браузер блокирует inline-скрипты с ошибкой "Executing inline script violates the following Content Security Policy directive 'script-src 'self''"

1.2 WHEN Next.js пытается выполнить hydration скрипты на странице /webapp THEN CSP блокирует выполнение и показывает ошибку "Either the 'unsafe-inline' keyword, a hash, or a nonce is required to enable inline execution"

1.3 WHEN Telegram WebApp SDK пытается инициализироваться THEN inline-скрипты блокируются CSP политикой, что приводит к ошибке "Connection closed" в Next.js скриптах

1.4 WHEN браузер запрашивает favicon.ico THEN возвращается 404 ошибка (побочная проблема)

### Expected Behavior (Correct)

2.1 WHEN пользователь открывает страницу /webapp через Telegram Bot THEN все необходимые inline-скрипты должны выполняться без ошибок CSP

2.2 WHEN Next.js выполняет hydration на странице /webapp THEN CSP политика должна разрешать выполнение этих скриптов

2.3 WHEN Telegram WebApp SDK инициализируется THEN CSP должна разрешать загрузку скриптов с доменов Telegram (telegram.org, t.me) и выполнение необходимых inline-скриптов

2.4 WHEN браузер запрашивает favicon.ico THEN должен возвращаться корректный файл или 204 No Content

2.5 WHEN страница /webapp загружается внутри Telegram iframe THEN CSP директива frame-ancestors должна разрешать встраивание с доменов Telegram

### Unchanged Behavior (Regression Prevention)

3.1 WHEN пользователь обращается к админ-панели /admin THEN строгая CSP политика должна продолжать защищать от XSS-атак

3.2 WHEN пользователь обращается к API endpoints /api/support THEN заголовки безопасности должны продолжать применяться

3.3 WHEN пользователь обращается к любым другим страницам (кроме /webapp) THEN текущая строгая CSP политика должна продолжать работать

3.4 WHEN middleware проверяет аутентификацию для защищённых роутов THEN логика аутентификации должна продолжать работать без изменений

3.5 WHEN применяются дополнительные заголовки безопасности (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) THEN они должны продолжать применяться ко всем страницам кроме /webapp где требуется iframe встраивание
