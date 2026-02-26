# CSP Telegram WebApp Fix - Bugfix Design

## Overview

Исправление критической проблемы Content Security Policy (CSP), которая блокирует работу Telegram WebApp. Текущая строгая CSP политика (`script-src 'self'`) применяется ко всем роутам и запрещает inline-скрипты, необходимые для Next.js hydration и Telegram WebApp SDK. Решение заключается в создании отдельной, более мягкой CSP политики для роута `/webapp`, сохраняя строгую защиту для остальных роутов (`/admin`, API endpoints).

Подход:
- Определить условие роута (pathname === '/webapp')
- Применить специальную CSP политику для Telegram WebApp
- Сохранить строгую CSP для всех остальных роутов
- Исправить проблему с favicon.ico

## Glossary

- **Bug_Condition (C)**: Условие, при котором проявляется баг - когда пользователь обращается к роуту `/webapp` и middleware применяет строгую CSP политику, блокирующую inline-скрипты
- **Property (P)**: Желаемое поведение для багового условия - CSP политика для `/webapp` должна разрешать inline-скрипты Next.js, скрипты с доменов Telegram и iframe встраивание
- **Preservation**: Существующая строгая CSP политика и заголовки безопасности для роутов `/admin` и `/api/*` должны остаться неизменными
- **middleware.ts**: Файл `nextjs-app/middleware.ts`, содержащий логику применения CSP заголовков и проверки аутентификации
- **CSP_DIRECTIVES**: Объект с директивами Content Security Policy, определяющий разрешённые источники контента
- **pathname**: Свойство `request.nextUrl.pathname`, определяющее текущий роут запроса
- **Next.js hydration**: Процесс "оживления" серверного HTML на клиенте, требующий выполнения inline-скриптов
- **Telegram WebApp SDK**: JavaScript SDK от Telegram для работы с WebApp API, загружается с доменов telegram.org/t.me

## Bug Details

### Fault Condition

Баг проявляется когда пользователь открывает страницу `/webapp` через Telegram Bot. Middleware в `nextjs-app/middleware.ts` применяет строгую CSP политику (`script-src 'self'`) ко всем роутам без исключений, что блокирует inline-скрипты Next.js hydration и Telegram WebApp SDK.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type NextRequest
  OUTPUT: boolean
  
  RETURN input.nextUrl.pathname === '/webapp'
         AND currentCSPPolicy.scriptSrc === ["'self'"]
         AND (nextJsHydrationScriptsBlocked OR telegramSDKScriptsBlocked)
END FUNCTION
```

### Examples

- **Пример 1**: Пользователь открывает `https://domain.com/webapp?prize_id=123` через Telegram Bot → CSP блокирует inline-скрипты → в консоли ошибка "Executing inline script violates CSP directive 'script-src 'self''" → страница не работает корректно
- **Пример 2**: Next.js пытается выполнить hydration на `/webapp` → CSP блокирует выполнение → ошибка "Either 'unsafe-inline', hash, or nonce is required" → React компоненты не оживают на клиенте
- **Пример 3**: Telegram WebApp SDK загружается с `telegram.org` → CSP блокирует скрипт → ошибка "Connection closed" → SDK не инициализируется
- **Edge case**: Пользователь открывает `/webapp` напрямую (не через Telegram iframe) → CSP блокирует скрипты → та же проблема, но дополнительно может быть ошибка отсутствия Telegram контекста

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Строгая CSP политика (`script-src 'self'`) должна продолжать применяться к роуту `/admin` для защиты от XSS-атак
- Строгая CSP политика должна продолжать применяться к API endpoints `/api/support` и другим защищённым роутам
- Заголовки безопасности (X-Content-Type-Options, Referrer-Policy, Permissions-Policy) должны продолжать применяться ко всем роутам
- Логика проверки аутентификации для защищённых роутов должна работать без изменений
- Matcher конфигурация middleware должна остаться неизменной

**Scope:**
Все запросы, которые НЕ направлены на роут `/webapp`, должны быть полностью не затронуты этим исправлением. Это включает:
- Запросы к `/admin` и всем его подстраницам
- Запросы к `/api/support` и другим API endpoints
- Запросы к `/login` и другим публичным страницам
- Статические файлы и изображения

## Hypothesized Root Cause

На основе анализа кода и описания бага, наиболее вероятные причины:

1. **Отсутствие роут-специфичной CSP политики**: Middleware применяет одну и ту же строгую CSP политику ко всем роутам без различия. Нет логики для определения роута `/webapp` и применения к нему отдельной политики.
   - Текущий код: `const cspHeader = buildCSPHeader();` вызывается для всех роутов
   - Нет условной логики типа `if (pathname === '/webapp')`

2. **Блокировка inline-скриптов**: Директива `script-src: ["'self'"]` запрещает inline-скрипты, которые критически необходимы для Next.js hydration. Next.js генерирует inline-скрипты для передачи данных от сервера к клиенту.

3. **Блокировка внешних доменов Telegram**: Текущая политика не включает домены `telegram.org` и `t.me` в `script-src`, что блокирует загрузку Telegram WebApp SDK.

4. **Блокировка iframe встраивания**: Заголовок `X-Frame-Options: DENY` и отсутствие `frame-ancestors` в CSP запрещают встраивание страницы в Telegram iframe.

5. **Отсутствие favicon.ico**: Побочная проблема - файл `favicon.ico` не существует в проекте, что вызывает 404 ошибки (не критично, но загрязняет логи).

## Correctness Properties

Property 1: Fault Condition - CSP разрешает скрипты для Telegram WebApp

_For any_ HTTP запрос к роуту `/webapp`, исправленный middleware SHALL применять специальную CSP политику, которая разрешает inline-скрипты Next.js (`'unsafe-inline'`), скрипты с доменов Telegram (`https://telegram.org`, `https://t.me`), и iframe встраивание от Telegram (`frame-ancestors https://web.telegram.org https://telegram.org`), обеспечивая корректную работу Telegram WebApp без ошибок CSP.

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**

Property 2: Preservation - Строгая CSP для остальных роутов

_For any_ HTTP запрос к роутам, отличным от `/webapp` (включая `/admin`, `/api/*`, `/login`), исправленный middleware SHALL применять ту же строгую CSP политику (`script-src 'self'`), что и оригинальный код, сохраняя защиту от XSS-атак и все существующие заголовки безопасности без изменений.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Предполагая, что наш анализ корректен:

**File**: `nextjs-app/middleware.ts`

**Function**: `middleware`

**Specific Changes**:

1. **Создать отдельную функцию для CSP политики WebApp**: Добавить функцию `buildWebAppCSPHeader()`, которая возвращает более мягкую CSP политику для роута `/webapp`
   - Добавить `'unsafe-inline'` в `script-src` для Next.js hydration
   - Добавить `https://telegram.org` и `https://t.me` в `script-src` для Telegram SDK
   - Добавить `frame-ancestors https://web.telegram.org https://telegram.org` для iframe встраивания
   - Сохранить остальные директивы безопасности

2. **Добавить условную логику в middleware**: В функции `middleware` добавить проверку `if (pathname === '/webapp')` для применения специальной CSP политики
   - Использовать `buildWebAppCSPHeader()` для `/webapp`
   - Использовать `buildCSPHeader()` для всех остальных роутов

3. **Изменить X-Frame-Options для WebApp**: Для роута `/webapp` не устанавливать заголовок `X-Frame-Options: DENY`, чтобы разрешить встраивание в Telegram iframe
   - Добавить условие: `if (pathname !== '/webapp')` перед установкой X-Frame-Options

4. **Создать favicon.ico**: Добавить файл `nextjs-app/public/favicon.ico` или настроить Next.js для возврата 204 No Content
   - Можно использовать простую иконку или пустой файл
   - Альтернатива: добавить `/favicon.ico` в matcher исключения

5. **Добавить комментарии**: Документировать причину отдельной CSP политики для `/webapp` в комментариях кода
   - Объяснить необходимость `'unsafe-inline'` для Next.js
   - Объяснить необходимость доменов Telegram
   - Объяснить необходимость `frame-ancestors`

### Пример кода (концептуальный):

```typescript
// Новая функция для WebApp CSP
function buildWebAppCSPHeader(): string {
  const WEBAPP_CSP_DIRECTIVES = {
    'script-src': ["'self'", "'unsafe-inline'", 'https://telegram.org', 'https://t.me'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:', 'http:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ['https://web.telegram.org', 'https://telegram.org'],
    'upgrade-insecure-requests': [],
    'block-all-mixed-content': [],
  };
  
  return Object.entries(WEBAPP_CSP_DIRECTIVES)
    .map(([directive, sources]) => {
      if (sources.length === 0) return directive;
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

// Изменённая middleware функция
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // ... существующая логика аутентификации ...
  
  const response = NextResponse.next();
  
  // Применяем разные CSP политики в зависимости от роута
  const cspHeader = pathname === '/webapp' 
    ? buildWebAppCSPHeader() 
    : buildCSPHeader();
  response.headers.set('Content-Security-Policy', cspHeader);
  
  // X-Frame-Options только для не-WebApp роутов
  if (pathname !== '/webapp') {
    response.headers.set('X-Frame-Options', 'DENY');
  }
  
  // ... остальные заголовки безопасности ...
  
  return response;
}
```

## Testing Strategy

### Validation Approach

Стратегия тестирования следует двухфазному подходу: сначала продемонстрировать баг на неисправленном коде (exploratory fault condition checking), затем проверить, что исправление работает корректно и сохраняет существующее поведение (fix checking и preservation checking).

### Exploratory Fault Condition Checking

**Goal**: Продемонстрировать баг ДО внедрения исправления. Подтвердить или опровергнуть анализ первопричины. Если опровергнем, потребуется пересмотр гипотезы.

**Test Plan**: Написать тесты, которые симулируют HTTP запросы к роуту `/webapp` и проверяют CSP заголовки в ответе. Запустить эти тесты на НЕИСПРАВЛЕННОМ коде, чтобы наблюдать ошибки и понять первопричину.

**Test Cases**:
1. **WebApp CSP Test**: Запрос к `/webapp` → проверить, что CSP содержит `script-src 'self'` без `'unsafe-inline'` (будет fail на неисправленном коде)
2. **WebApp X-Frame-Options Test**: Запрос к `/webapp` → проверить, что заголовок `X-Frame-Options: DENY` присутствует (будет fail - блокирует iframe)
3. **Telegram Domains Test**: Запрос к `/webapp` → проверить, что CSP не содержит `telegram.org` в `script-src` (будет fail на неисправленном коде)
4. **Frame Ancestors Test**: Запрос к `/webapp` → проверить отсутствие `frame-ancestors` директивы (будет fail на неисправленном коде)

**Expected Counterexamples**:
- CSP заголовок для `/webapp` содержит `script-src 'self'` без разрешения inline-скриптов
- Заголовок `X-Frame-Options: DENY` блокирует встраивание в Telegram iframe
- Отсутствуют домены Telegram в `script-src`
- Возможные причины: отсутствие роут-специфичной логики, единая CSP политика для всех роутов

### Fix Checking

**Goal**: Проверить, что для всех запросов, где выполняется условие бага (роут `/webapp`), исправленная функция применяет корректную CSP политику.

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition(request) DO
  response := middleware_fixed(request)
  ASSERT response.headers['Content-Security-Policy'] CONTAINS "'unsafe-inline'"
  ASSERT response.headers['Content-Security-Policy'] CONTAINS "https://telegram.org"
  ASSERT response.headers['Content-Security-Policy'] CONTAINS "frame-ancestors"
  ASSERT response.headers['X-Frame-Options'] IS NOT SET
END FOR
```

### Preservation Checking

**Goal**: Проверить, что для всех запросов, где условие бага НЕ выполняется (роуты отличные от `/webapp`), исправленная функция применяет ту же строгую CSP политику, что и оригинальный код.

**Pseudocode:**
```
FOR ALL request WHERE NOT isBugCondition(request) DO
  ASSERT middleware_original(request).headers['CSP'] = middleware_fixed(request).headers['CSP']
  ASSERT middleware_original(request).headers['X-Frame-Options'] = middleware_fixed(request).headers['X-Frame-Options']
END FOR
```

**Testing Approach**: Property-based testing рекомендуется для preservation checking, потому что:
- Автоматически генерирует множество тестовых случаев для различных роутов
- Ловит edge cases, которые могут быть пропущены в ручных unit тестах
- Предоставляет сильные гарантии, что поведение не изменилось для всех не-багованных роутов

**Test Plan**: Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для роутов `/admin`, `/api/support`, `/login`, затем написать property-based тесты, фиксирующие это поведение.

**Test Cases**:
1. **Admin CSP Preservation**: Наблюдать CSP для `/admin` на неисправленном коде → написать тест, проверяющий, что после исправления CSP остаётся `script-src 'self'` без `'unsafe-inline'`
2. **API CSP Preservation**: Наблюдать CSP для `/api/support/messages` на неисправленном коде → написать тест, проверяющий сохранение строгой политики
3. **X-Frame-Options Preservation**: Наблюдать заголовок `X-Frame-Options: DENY` для `/admin` → написать тест, проверяющий его сохранение после исправления
4. **Authentication Logic Preservation**: Проверить, что логика аутентификации для защищённых роутов продолжает работать идентично

### Unit Tests

- Тест middleware для роута `/webapp` с проверкой CSP заголовков (должен содержать `'unsafe-inline'`, домены Telegram, `frame-ancestors`)
- Тест middleware для роута `/admin` с проверкой строгой CSP политики (должен содержать только `'self'`)
- Тест middleware для роута `/api/support` с проверкой строгой CSP и аутентификации
- Тест отсутствия `X-Frame-Options` для `/webapp`
- Тест наличия `X-Frame-Options: DENY` для всех остальных роутов
- Edge case: тест для подроутов `/webapp/something` (должны использовать WebApp CSP)

### Property-Based Tests

- Генерировать случайные роуты (не `/webapp`) и проверять, что CSP политика остаётся строгой (`script-src 'self'`)
- Генерировать различные варианты роута `/webapp` (с query параметрами, с trailing slash) и проверять применение WebApp CSP
- Генерировать случайные защищённые роуты и проверять сохранение логики аутентификации
- Тестировать, что все заголовки безопасности (кроме X-Frame-Options для `/webapp`) применяются корректно для всех роутов

### Integration Tests

- Полный тест открытия `/webapp` через симуляцию Telegram iframe и проверка отсутствия CSP ошибок
- Тест переключения между `/admin` и `/webapp` с проверкой применения разных CSP политик
- Тест загрузки Telegram WebApp SDK на странице `/webapp` без блокировки CSP
- Тест Next.js hydration на странице `/webapp` без ошибок CSP
- Тест, что админ-панель `/admin` продолжает блокировать inline-скрипты (защита от XSS)
