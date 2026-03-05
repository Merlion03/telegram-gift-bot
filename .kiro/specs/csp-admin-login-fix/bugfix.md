# Bugfix Requirements Document

## Введение

Исправление бага с Content-Security-Policy (CSP) для страниц админки (`/admin`) и логина (`/login`). 

**Проблема:** Несмотря на то, что в `middleware.ts` для этих роутов настроена "мягкая" CSP с `'unsafe-inline'` в директиве `script-src`, браузер блокирует inline-скрипты Next.js, показывая строгую политику `script-src 'self'` без `'unsafe-inline'`.

**Воздействие:** Страницы `/login` и `/admin` не работают корректно в браузере из-за блокировки критически важных inline-скриптов Next.js, необходимых для гидратации и работы React-компонентов.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN пользователь открывает страницу `/login` в браузере THEN браузер блокирует inline-скрипты Next.js с ошибкой CSP, показывая директиву `script-src 'self'` без `'unsafe-inline'`

1.2 WHEN пользователь открывает страницу `/admin` в браузере THEN браузер блокирует inline-скрипты Next.js с ошибкой CSP, показывая директиву `script-src 'self'` без `'unsafe-inline'`

1.3 WHEN middleware обрабатывает запрос к `/login` или `/admin` THEN функция `buildWebAppCSPHeader()` вызывается и должна устанавливать `'unsafe-inline'`, но браузер получает строгую CSP без этой директивы

### Expected Behavior (Correct)

2.1 WHEN пользователь открывает страницу `/login` в браузере THEN система SHALL применять CSP с директивой `script-src 'self' 'unsafe-inline'`, позволяя выполнение inline-скриптов Next.js

2.2 WHEN пользователь открывает страницу `/admin` в браузере THEN система SHALL применять CSP с директивой `script-src 'self' 'unsafe-inline'`, позволяя выполнение inline-скриптов Next.js

2.3 WHEN middleware обрабатывает запрос к `/login` или `/admin` THEN система SHALL корректно устанавливать заголовок `Content-Security-Policy` с мягкой политикой из функции `buildWebAppCSPHeader()`

2.4 WHEN страницы `/login` и `/admin` загружаются в браузере THEN все Next.js inline-скрипты SHALL выполняться без ошибок CSP

### Unchanged Behavior (Regression Prevention)

3.1 WHEN пользователь открывает страницу `/webapp` THEN система SHALL CONTINUE TO применять мягкую CSP с `'unsafe-inline'` и доменами Telegram, как это работает сейчас

3.2 WHEN пользователь открывает любую другую страницу (не `/webapp`, `/login`, `/admin`) THEN система SHALL CONTINUE TO применять строгую CSP с `script-src 'self'` без `'unsafe-inline'`

3.3 WHEN middleware проверяет аутентификацию для защищённых роутов THEN система SHALL CONTINUE TO корректно редиректить неавторизованных пользователей на страницу логина

3.4 WHEN middleware устанавливает дополнительные заголовки безопасности (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) THEN система SHALL CONTINUE TO устанавливать их корректно для всех роутов
