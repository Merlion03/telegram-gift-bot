# Implementation Plan

- [x] 1. Написать exploratory тест для bug condition
  - **Property 1: Fault Condition** - CSP блокирует Telegram WebApp скрипты
  - **КРИТИЧЕСКИ ВАЖНО**: Этот тест ДОЛЖЕН ПРОВАЛИТЬСЯ на неисправленном коде - провал подтверждает существование бага
  - **НЕ ПЫТАТЬСЯ исправить тест или код когда он провалится**
  - **ПРИМЕЧАНИЕ**: Этот тест кодирует ожидаемое поведение - он будет валидировать исправление когда пройдёт после реализации
  - **ЦЕЛЬ**: Выявить counterexamples, демонстрирующие существование бага
  - **Подход Scoped PBT**: Для детерминированных багов ограничить property конкретными проваливающимися случаями для воспроизводимости
  - Тестировать детали реализации из Fault Condition в design документе
  - Утверждения теста должны соответствовать Expected Behavior Properties из design
  - Запустить тест на НЕИСПРАВЛЕННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОВАЛИТСЯ (это правильно - доказывает существование бага)
  - Задокументировать найденные counterexamples для понимания первопричины
  - Отметить задачу выполненной когда тест написан, запущен и провал задокументирован
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Написать preservation property тесты (ДО реализации исправления)
  - **Property 2: Preservation** - Строгая CSP для не-WebApp роутов
  - **ВАЖНО**: Следовать методологии observation-first
  - Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для не-багованных входов
  - Написать property-based тесты, фиксирующие наблюдаемые паттерны поведения из Preservation Requirements
  - Property-based тестирование генерирует множество тестовых случаев для более сильных гарантий
  - Запустить тесты на НЕИСПРАВЛЕННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (подтверждает базовое поведение для сохранения)
  - Отметить задачу выполненной когда тесты написаны, запущены и проходят на неисправленном коде
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Исправление для CSP блокировки Telegram WebApp

  - [x] 3.1 Создать функцию buildWebAppCSPHeader()
    - Создать новую функцию `buildWebAppCSPHeader()` в `nextjs-app/middleware.ts`
    - Добавить `'unsafe-inline'` в `script-src` для Next.js hydration
    - Добавить `https://telegram.org` и `https://t.me` в `script-src` для Telegram SDK
    - Добавить `frame-ancestors https://web.telegram.org https://telegram.org` для iframe встраивания
    - Сохранить остальные директивы безопасности (style-src, img-src, connect-src и т.д.)
    - Добавить комментарии, объясняющие необходимость каждой директивы
    - _Bug_Condition: isBugCondition(input) where input.nextUrl.pathname === '/webapp' AND currentCSPPolicy.scriptSrc === ["'self'"]_
    - _Expected_Behavior: CSP политика для /webapp разрешает inline-скрипты Next.js, скрипты с доменов Telegram и iframe встраивание_
    - _Preservation: Строгая CSP политика для роутов /admin и /api/* остаётся неизменной_
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 3.2 Добавить условную логику в middleware
    - В функции `middleware` добавить проверку `if (pathname === '/webapp')`
    - Использовать `buildWebAppCSPHeader()` для роута `/webapp`
    - Использовать `buildCSPHeader()` для всех остальных роутов
    - Добавить комментарии, объясняющие роут-специфичную логику
    - _Bug_Condition: isBugCondition(input) where input.nextUrl.pathname === '/webapp'_
    - _Expected_Behavior: Middleware применяет разные CSP политики в зависимости от роута_
    - _Preservation: Логика аутентификации и применение CSP для других роутов остаются неизменными_
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3_

  - [x] 3.3 Отключить X-Frame-Options для /webapp
    - Добавить условие `if (pathname !== '/webapp')` перед установкой заголовка `X-Frame-Options: DENY`
    - Это разрешит встраивание страницы `/webapp` в Telegram iframe
    - Для всех остальных роутов заголовок `X-Frame-Options: DENY` должен продолжать применяться
    - Добавить комментарий, объясняющий необходимость исключения для WebApp
    - _Bug_Condition: isBugCondition(input) where input.nextUrl.pathname === '/webapp' AND X-Frame-Options === 'DENY'_
    - _Expected_Behavior: X-Frame-Options не устанавливается для /webapp, разрешая iframe встраивание_
    - _Preservation: X-Frame-Options: DENY продолжает применяться ко всем остальным роутам_
    - _Requirements: 2.5, 3.5_

  - [x] 3.4 Создать или настроить favicon.ico (опционально)
    - Создать файл `nextjs-app/public/favicon.ico` с простой иконкой
    - Альтернатива: добавить `/favicon.ico` в matcher исключения middleware
    - Это устранит 404 ошибки в логах (побочная проблема, не критично)
    - _Bug_Condition: Браузер запрашивает favicon.ico и получает 404_
    - _Expected_Behavior: Браузер получает корректный файл или 204 No Content_
    - _Preservation: Не влияет на существующую функциональность_
    - _Requirements: 1.4, 2.4_

  - [x] 3.5 Проверить что exploratory тест теперь проходит
    - **Property 1: Expected Behavior** - CSP разрешает Telegram WebApp скрипты
    - **ВАЖНО**: Перезапустить ТОТ ЖЕ тест из задачи 1 - НЕ писать новый тест
    - Тест из задачи 1 кодирует ожидаемое поведение
    - Когда этот тест проходит, это подтверждает что ожидаемое поведение удовлетворено
    - Запустить bug condition exploratory тест из шага 1
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОХОДИТ (подтверждает что баг исправлен)
    - _Requirements: Expected Behavior Properties из design (2.1, 2.2, 2.3, 2.5)_

  - [x] 3.6 Проверить что preservation тесты всё ещё проходят
    - **Property 2: Preservation** - Строгая CSP для не-WebApp роутов
    - **ВАЖНО**: Перезапустить ТЕ ЖЕ тесты из задачи 2 - НЕ писать новые тесты
    - Запустить preservation property тесты из шага 2
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (подтверждает отсутствие регрессий)
    - Подтвердить что все тесты всё ещё проходят после исправления (нет регрессий)
    - _Requirements: Preservation Requirements из design (3.1, 3.2, 3.3, 3.4, 3.5)_

- [x] 4. Checkpoint - Убедиться что все тесты проходят
  - Убедиться что все тесты проходят, спросить пользователя если возникнут вопросы
