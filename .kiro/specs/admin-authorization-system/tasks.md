# Implementation Plan: Система авторизации и ролевой модели администраторов

## Overview

Реализация системы авторизации администраторов для Telegram-бота с WebApp интерфейсом. Система включает:
- Четырёхуровневую ролевую модель (Developer, Assistant, Administrator, Operator)
- Безопасную аутентификацию через Argon2id
- Stateless JWT сессии для горизонтального масштабирования
- Rate limiting для защиты от brute-force атак
- Автоматическую регистрацию при первом входе
- Динамическое предоставление прав администратора

**ВАЖНО: Интеграция с существующей инфраструктурой**

Система интегрируется с существующими компонентами проекта вместо создания дубликатов:
- **nextjs-app/app/login/page.tsx** - обновляем существующую страницу (Task 8.2)
- **nextjs-app/app/admin/page.tsx** - используем существующую админ-панель
- **nextjs-app/middleware.ts** - обновляем существующий middleware (Task 7.8)
- **nextjs-app/lib/database/client.ts** - используем существующий DatabaseClient (Task 7.2)
- **nextjs-app/lib/telegram/initDataValidator.ts** - используем как референс (Task 8.1)
- **telegram-bot/handlers/common_handler.py** - обновляем существующий обработчик /start (Task 6.2)
- **telegram-bot/services/session_manager.py** - НЕ трогаем (для support сессий), создаём jwt_session_service.py (Task 4.2)

**Технологический стек:**
- Backend: Python (aiogram, asyncpg, argon2-cffi, PyJWT)
- Frontend: Next.js 16 (TypeScript, React 19, jose)
- Database: PostgreSQL 15
- Testing: Hypothesis (Python), fast-check (TypeScript)

**Архитектурные принципы:**
- Clean Architecture с разделением на слои
- Один модуль = один файл = одна ответственность
- Dependency Injection для тестируемости
- Комментарии в коде на русском языке
- Все Python скрипты через виртуальное окружение

## Tasks

- [x] 1. Создание миграций базы данных
  - Создать файл `telegram-bot/database/migrations/009_create_admin_tables.sql`
  - Реализовать таблицу `administrators` с полями: tg_id (PK), username, role, password_hash, created_at, updated_at
  - Реализовать таблицу `auth_attempts` для rate limiting с полями: id, tg_id, timestamp, ip_address, success
  - Реализовать таблицу `system_config` для конфигурации с полями: key (PK), value, updated_at, updated_by
  - Добавить индексы для оптимизации запросов
  - Создать триггер `notify_new_admin()` для автоматических уведомлений
  - Добавить начальное значение `session_lifetime_hours = 24` в system_config
  - Выполнить миграцию через виртуальное окружение: `source venv/bin/activate && python run_migration.py`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.4, 11.1, 11.2_


- [x] 2. Реализация моделей данных (Domain Layer)
  - [x] 2.1 Создать модель Administrator
    - Создать файл `telegram-bot/models/administrator.py`
    - Реализовать dataclass Administrator с полями: tg_id, username, role, password_hash, created_at, updated_at
    - Добавить метод `is_first_login()` для проверки password_hash IS NULL
    - Добавить метод `can_assign_operators()` для проверки role <= 2
    - Добавить метод `can_modify_config()` для проверки role <= 1
    - Комментарии на русском языке
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 8.1_
  
  - [x] 2.2 Создать enum AdminRole
    - Создать файл `telegram-bot/models/role.py`
    - Реализовать IntEnum AdminRole с значениями: DEVELOPER=0, ASSISTANT=1, ADMINISTRATOR=2, OPERATOR=3
    - Добавить метод `get_display_name()` для получения русских названий ролей
    - Комментарии на русском языке
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 2.3 Создать модель Session
    - Создать файл `telegram-bot/models/session.py`
    - Реализовать dataclass Session с полями: tg_id, role, issued_at, expires_at
    - Добавить метод `is_expired()` для проверки истечения сессии
    - Добавить метод `to_jwt_claims()` для конвертации в JWT claims
    - Комментарии на русском языке
    - _Requirements: 10.1, 10.2, 10.4_

- [x] 3. Реализация Repository Layer (Infrastructure)
  - [x] 3.1 Создать AdminRepository
    - Создать файл `telegram-bot/database/repositories/admin_repository.py`
    - **Примечание:** Следуем структуре существующих репозиториев в database/repositories/
    - Реализовать метод `get_by_tg_id(tg_id: int) -> Optional[Administrator]`
    - Реализовать метод `exists(tg_id: int) -> bool`
    - Реализовать метод `create(tg_id: int, username: str, role: int) -> Administrator`
    - Реализовать метод `update_password(tg_id: int, password_hash: str) -> None`
    - Реализовать метод `get_all() -> List[Administrator]`
    - Использовать asyncpg для асинхронных запросов
    - Комментарии на русском языке
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.3_
  
  - [x] 3.2 Создать AuthAttemptsRepository
    - Создать файл `telegram-bot/database/repositories/auth_attempts_repository.py`
    - Реализовать метод `count_recent_attempts(tg_id: int, minutes: int = 15) -> int`
    - Реализовать метод `record_attempt(tg_id: int, ip_address: Optional[str] = None) -> None`
    - Реализовать метод `clear_attempts(tg_id: int) -> None`
    - Реализовать метод `cleanup_old_attempts(hours: int = 24) -> int`
    - Реализовать метод `get_oldest_in_window(tg_id: int, window_start: datetime) -> Optional[AuthAttempt]`
    - Использовать asyncpg для асинхронных запросов
    - Комментарии на русском языке
    - _Requirements: 12.4, 12.5_
  
  - [x] 3.3 Создать ConfigRepository
    - Создать файл `telegram-bot/database/repositories/config_repository.py`
    - Реализовать метод `get_value(key: str) -> Optional[str]`
    - Реализовать метод `set_value(key: str, value: str) -> None`
    - Реализовать метод `get_session_lifetime_hours() -> int` (по умолчанию 24)
    - Реализовать метод `set_session_lifetime_hours(hours: int) -> None`
    - Использовать asyncpg для асинхронных запросов
    - Комментарии на русском языке
    - _Requirements: 11.1, 11.2, 11.4_

- [x] 4. Реализация Service Layer (Application)
  - [x] 4.1 Создать PasswordHasher
    - Создать файл `telegram-bot/services/password_hasher.py`
    - Использовать библиотеку argon2-cffi
    - Инициализировать с параметрами: time_cost=2, memory_cost=65536, parallelism=4, hash_len=32, salt_len=16
    - Реализовать метод `hash_password(password: str) -> str`
    - Реализовать метод `verify_password(password_hash: str, password: str) -> bool`
    - Обработка исключений argon2.exceptions
    - Комментарии на русском языке
    - _Requirements: 8.2, 8.5, 9.1, 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [x] 4.2 Создать JWTSessionService
    - Создать файл `telegram-bot/services/jwt_session_service.py`
    - **Примечание:** Используем название JWTSessionService, чтобы избежать конфликта с существующим services/session_manager.py (для support сессий)
    - Использовать библиотеку PyJWT
    - Инициализировать с параметрами: secret_key, session_lifetime_hours
    - Реализовать метод `generate_token(tg_id: int, role: int) -> str` (генерация JWT с HS256)
    - Реализовать метод `validate_token(token: str) -> Optional[SessionClaims]` (валидация подписи и exp)
    - Реализовать метод `is_token_expired(token: str) -> bool`
    - Обработка исключений jwt.exceptions
    - Комментарии на русском языке
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3_
  
  - [x] 4.3 Создать RateLimitService
    - Создать файл `telegram-bot/services/rate_limit_service.py`
    - Dependency Injection: AuthAttemptsRepository
    - Реализовать метод `check_rate_limit(tg_id: int) -> RateLimitResult` (проверка <= 5 попыток за 15 минут)
    - Реализовать метод `record_failed_attempt(tg_id: int) -> None`
    - Реализовать метод `clear_attempts(tg_id: int) -> None`
    - Реализовать dataclass RateLimitResult с полями: allowed, attempts_count, blocked_until
    - Использовать sliding window алгоритм
    - Комментарии на русском языке
    - _Requirements: 12.4, 12.5_
  
  - [x] 4.4 Создать RoleService
    - Создать файл `telegram-bot/services/role_service.py`
    - Реализовать статический метод `get_role_name(role: int) -> str`
    - Реализовать статический метод `can_assign_operators(role: int) -> bool` (role <= 2)
    - Реализовать статический метод `can_modify_session_lifetime(role: int) -> bool` (role <= 1)
    - Реализовать статический метод `can_respond_to_users(role: int) -> bool` (всегда True для role 0-3)
    - Комментарии на русском языке
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.3_
  
  - [x] 4.5 Создать AuthService
    - Создать файл `telegram-bot/services/auth_service.py`
    - Dependency Injection: AdminRepository, RateLimitService, PasswordHasher
    - Реализовать метод `register_password(tg_id: int, password: str) -> Administrator`
    - Реализовать метод `authenticate(tg_id: int, password: str) -> Optional[Administrator]`
    - Реализовать метод `is_first_login(tg_id: int) -> bool`
    - Проверка rate limit перед аутентификацией
    - Запись неудачных попыток в auth_attempts
    - Очистка попыток после успешной аутентификации
    - Единообразные сообщения об ошибках (не раскрывать существование tg_id)
    - Комментарии на русском языке
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 12.4, 12.5_
  
  - [x] 4.6 Создать ConfigService
    - Создать файл `telegram-bot/services/config_service.py`
    - Dependency Injection: ConfigRepository
    - Реализовать метод `get_session_lifetime() -> int`
    - Реализовать метод `set_session_lifetime(hours: int, admin_role: int) -> bool` (проверка прав role <= 1)
    - Валидация hours > 0
    - Комментарии на русском языке
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 4.7 Создать AdminNotificationService
    - Создать файл `telegram-bot/services/admin_notification_service.py`
    - Dependency Injection: Bot (aiogram)
    - Реализовать метод `notify_new_admin(tg_id: int, username: str, role: int) -> None`
    - Формирование текста уведомления с указанием роли
    - Создание Reply Keyboard с кнопкой WebApp
    - Отправка сообщения через Bot API
    - Обработка ошибок отправки
    - Комментарии на русском языке
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5. Checkpoint - Проверка базовых сервисов
  - Убедиться, что все сервисы корректно инициализируются
  - Проверить Dependency Injection между компонентами
  - Убедиться, что миграции применены успешно
  - Ensure all tests pass, ask the user if questions arise.


- [x] 6. Реализация Telegram Bot Handlers
  - [x] 6.1 Создать AdminStartHandler
    - Создать файл `telegram-bot/handlers/admin_start_handler.py`
    - Dependency Injection: AdminRepository, SessionManager (существующий для support сессий)
    - Реализовать метод `handle_start(message: Message, session_id: Optional[int]) -> None`
    - Извлечение tg_id из message.from_user.id
    - Проверка существования tg_id в таблице administrators
    - Если найден - отправка Reply Keyboard с WebApp кнопкой
    - Если не найден - запуск Standard Flow (существующая логика)
    - Комментарии на русском языке
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3_
  
  - [x] 6.2 Интегрировать AdminStartHandler в существующий handlers/common_handler.py
    - Обновить файл `telegram-bot/handlers/common_handler.py`
    - **Примечание:** Интегрируем с существующим обработчиком /start вместо создания нового
    - Добавить инициализацию AdminRepository в существующий handler
    - Добавить проверку администратора перед Standard Flow
    - Если tg_id найден в administrators - отправить Reply Keyboard с WebApp кнопкой
    - Если не найден - продолжить существующую логику Standard Flow
    - Комментарии на русском языке
    - _Requirements: 3.1, 4.1_
  
  - [x] 6.3 Настроить PostgreSQL LISTEN/NOTIFY для триггера
    - Обновить файл `telegram-bot/main.py` или создать отдельный listener
    - **Примечание:** Интегрируем с существующей структурой main.py
    - Добавить asyncpg listener для канала 'new_admin_notification'
    - При получении уведомления вызывать AdminNotificationService.notify_new_admin()
    - Обработка ошибок подключения и переподключение
    - Комментарии на русском языке
    - _Requirements: 5.1, 5.4_

- [x] 7. Реализация Next.js Backend (API Routes)
  - [x] 7.1 Создать TypeScript модели
    - Создать файл `nextjs-app/lib/models/administrator.ts`
    - Создать интерфейс Administrator с полями: tgId, username, role, passwordHash, createdAt, updatedAt
    - Создать файл `nextjs-app/lib/models/role.ts`
    - Создать enum AdminRole с значениями: DEVELOPER=0, ASSISTANT=1, ADMINISTRATOR=2, OPERATOR=3
    - Создать файл `nextjs-app/lib/models/session.ts`
    - Создать интерфейс SessionClaims с полями: tgId, role, iat, exp
    - Комментарии на русском языке
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 10.2_
  
  - [x] 7.2 Создать TypeScript repositories
    - Создать файл `nextjs-app/lib/repositories/adminRepository.ts`
    - **Примечание:** Используем существующий lib/database/client.ts для подключения к БД
    - Реализовать методы: getByTgId, exists, updatePassword
    - Использовать DatabaseClient из lib/database/client.ts
    - Создать файл `nextjs-app/lib/repositories/authAttemptsRepository.ts`
    - Реализовать методы: countRecentAttempts, recordAttempt, clearAttempts
    - Комментарии на русском языке
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 12.4, 12.5_
  
  - [x] 7.3 Создать TypeScript services
    - Создать файл `nextjs-app/lib/services/passwordHasher.ts`
    - Использовать библиотеку argon2 (Node.js binding)
    - Реализовать методы: hashPassword, verifyPassword
    - Создать файл `nextjs-app/lib/services/jwtSessionService.ts`
    - **Примечание:** Используем название jwtSessionService для ясности (JWT токены для админов)
    - Использовать библиотеку jose для JWT
    - Реализовать методы: generateToken, validateToken, isTokenExpired
    - Создать файл `nextjs-app/lib/services/rateLimitService.ts`
    - Реализовать методы: checkRateLimit, recordFailedAttempt, clearAttempts
    - Создать файл `nextjs-app/lib/services/adminAuthService.ts`
    - **Примечание:** Используем название adminAuthService для ясности (аутентификация админов)
    - Реализовать методы: registerPassword, authenticate, isFirstLogin
    - Комментарии на русском языке
    - _Requirements: 8.2, 8.5, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 12.4, 12.5, 13.1, 13.2_
  
  - [x] 7.4 Создать API route: check-first-login
    - Создать файл `nextjs-app/app/api/auth/check-first-login/route.ts`
    - Реализовать GET handler
    - Валидация query параметра tgId
    - Проверка существования администратора
    - Проверка password_hash IS NULL
    - Возврат { isFirstLogin: boolean, exists: boolean }
    - Обработка ошибок (400, 403, 500)
    - Комментарии на русском языке
    - _Requirements: 8.1_
  
  - [x] 7.5 Создать API route: register
    - Создать файл `nextjs-app/app/api/auth/register/route.ts`
    - Реализовать POST handler
    - Валидация body: tgId, password (минимум 8 символов)
    - Проверка, что password_hash IS NULL (первый вход)
    - Хеширование пароля через PasswordHasher
    - Обновление password_hash в БД
    - Генерация JWT токена через JWTSessionService
    - Возврат { token, role, expiresAt }
    - Обработка ошибок (400, 403, 500)
    - Комментарии на русском языке
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 7.6 Создать API route: login
    - Создать файл `nextjs-app/app/api/auth/login/route.ts`
    - Реализовать POST handler
    - Валидация body: tgId, password
    - Проверка rate limit через RateLimitService
    - Если заблокирован - возврат 429 Too Many Requests
    - Аутентификация через AuthService
    - Если успех - очистка auth_attempts, генерация JWT
    - Если неудача - запись попытки, возврат 401 Unauthorized
    - Единообразные сообщения об ошибках
    - Комментарии на русском языке
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 12.4, 12.5_
  
  - [x] 7.7 Создать API route: validate
    - Создать файл `nextjs-app/app/api/auth/validate/route.ts`
    - Реализовать POST handler
    - Валидация body: token
    - Верификация JWT через JWTSessionService
    - Проверка подписи и срока действия
    - Возврат { valid: boolean, tgId?, role?, expiresAt? }
    - Обработка ошибок (401)
    - Комментарии на русском языке
    - _Requirements: 10.3, 10.4, 12.1, 12.2, 12.3_
  
  - [x] 7.8 Обновить Auth Middleware
    - Обновить файл `nextjs-app/middleware.ts`
    - **Примечание:** Обновляем существующий middleware, который уже использует NextAuth.js
    - Заменить NextAuth.js getToken() на кастомную JWT валидацию через JWTSessionService
    - Сохранить существующую логику CSP заголовков
    - Извлечение JWT из cookie 'admin-token' или Authorization header
    - Валидация токена через JWTSessionService
    - Если невалиден - редирект на /login (существующая страница)
    - Если валиден - добавление claims в request headers
    - Настройка matcher для защиты роутов: /admin/*, /api/admin/*
    - Комментарии на русском языке
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 8. Реализация Next.js Frontend (UI Components)
  - [x] 8.1 Создать утилиту для Telegram WebApp API
    - Создать файл `nextjs-app/lib/utils/telegramWebApp.ts`
    - **Примечание:** Используем существующий lib/telegram/initDataValidator.ts как референс для работы с Telegram WebApp API
    - Реализовать функцию `getTelegramUserId(): number | null`
    - Извлечение tg_id из window.Telegram.WebApp.initDataUnsafe.user.id
    - Реализовать функцию `isTelegramWebApp(): boolean`
    - Проверка наличия Telegram WebApp API
    - Реализовать функцию `getInitData(): string | null`
    - Получение initData для серверной валидации
    - Комментарии на русском языке
    - _Requirements: 6.1, 6.2_
  
  - [x] 8.2 Обновить существующую страницу входа
    - Обновить файл `nextjs-app/app/login/page.tsx`
    - **Примечание:** Обновляем существующую страницу /login, которая уже использует NextAuth.js
    - Заменить NextAuth.js signIn на прямые API вызовы к нашим новым endpoints
    - Убрать поле username, оставить только поле password
    - Автоматическое извлечение tg_id через getTelegramUserId() (использовать существующий lib/telegram/initDataValidator.ts как референс)
    - Проверка первого входа через GET /api/auth/check-first-login
    - Если первый вход - показать placeholder "Установите пароль"
    - Если повторный вход - показать placeholder "Пароль"
    - Отправка данных на POST /api/auth/register или POST /api/auth/login
    - Сохранение JWT в cookie 'admin-token'
    - Редирект на /admin (существующая страница) при успехе
    - Отображение ошибок (401, 429)
    - Блокировка доступа без tg_id (проверка isTelegramWebApp)
    - Комментарии на русском языке
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 9.4_
  
  - [x] 8.3 Обновить Header компонент для отображения роли
    - Обновить файл `nextjs-app/components/admin/Header.tsx`
    - Добавить извлечение роли из JWT токена
    - Отображение роли администратора (Разработчик/Помощник/Администратор/Оператор)
    - Обновить кнопку выхода: очистка JWT cookie, редирект на /login
    - Комментарии на русском языке
    - _Requirements: 10.3_

- [x] 9. Checkpoint - Проверка интеграции компонентов
  - Убедиться, что все API routes работают корректно
  - Проверить интеграцию Telegram Bot с WebApp
  - Проверить работу middleware для защиты роутов
  - Проверить передачу tg_id через Telegram WebApp API
  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. Property-Based тесты для Python (Hypothesis)
  - [x] 10.1 Property 1: Создание администраторов без пароля
    - Создать файл `tests/property_tests/test_admin_creation_property.py`
    - **Property 1: Администраторы могут быть созданы без пароля**
    - **Validates: Requirements 1.5**
    - Использовать @given с генераторами tg_id, username
    - Проверить успешное создание с password_hash = NULL
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.2 Property 2: Проверка прав назначения операторов
    - Создать файл `tests/property_tests/test_role_permissions_property.py`
    - **Property 2: Проверка прав назначения операторов**
    - **Validates: Requirements 2.3**
    - Использовать @given с генератором role (0-3)
    - Проверить can_assign_operators() для всех ролей
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.3 Property 3: Все роли могут отвечать пользователям
    - Добавить в файл `tests/property_tests/test_role_permissions_property.py`
    - **Property 3: Все роли могут отвечать пользователям**
    - **Validates: Requirements 2.5**
    - Использовать @given с генератором role (0-3)
    - Проверить can_respond_to_users() возвращает True для всех
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.4 Property 11: Определение первого входа
    - Создать файл `tests/property_tests/test_first_login_property.py`
    - **Property 11: Определение первого входа**
    - **Validates: Requirements 8.1**
    - Использовать @given с генератором Administrator
    - Проверить is_first_login() для password_hash = NULL и NOT NULL
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.5 Property 12: Пароли всегда хешируются
    - Создать файл `tests/property_tests/test_password_hashing_property.py`
    - **Property 12: Пароли всегда хешируются**
    - **Validates: Requirements 8.2, 9.1, 13.3**
    - Использовать @given с генератором password
    - Проверить, что hash_password() никогда не возвращает открытый пароль
    - Проверить, что хеш начинается с $argon2id$
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.6 Property 13: Round-trip установки пароля
    - Добавить в файл `tests/property_tests/test_password_hashing_property.py`
    - **Property 13: Round-trip установки пароля**
    - **Validates: Requirements 8.3, 8.4**
    - Использовать @given с генераторами tg_id, username, password
    - Создать администратора, установить пароль, аутентифицироваться
    - Проверить успешность аутентификации с тем же паролем
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.7 Property 14: Верификация паролей
    - Добавить в файл `tests/property_tests/test_password_hashing_property.py`
    - **Property 14: Верификация паролей**
    - **Validates: Requirements 9.2, 9.3, 9.4**
    - Использовать @given с генераторами correct_password, wrong_password
    - Проверить успех с правильным паролем, неудачу с неправильным
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.8 Property 16: Уникальность солей
    - Добавить в файл `tests/property_tests/test_password_hashing_property.py`
    - **Property 16: Уникальность солей**
    - **Validates: Requirements 13.2**
    - Использовать @given с генератором password
    - Хешировать один пароль дважды
    - Проверить, что хеши различаются
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.9 Property 17: JWT структура и срок действия
    - Создать файл `tests/property_tests/test_jwt_property.py`
    - **Property 17: JWT структура и срок действия**
    - **Validates: Requirements 10.1, 10.2, 10.5**
    - Использовать @given с генераторами tg_id, role
    - Генерировать JWT, валидировать, проверять claims
    - Проверить exp = iat + session_lifetime_hours * 3600
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.10 Property 20: Конфигурация session lifetime
    - Создать файл `tests/property_tests/test_config_property.py`
    - **Property 20: Конфигурация session lifetime**
    - **Validates: Requirements 11.1, 11.2**
    - Использовать @given с генератором session_lifetime_hours (1-168)
    - Установить значение, прочитать обратно (round-trip)
    - Проверить совпадение значений
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.11 Property 21: Права на изменение конфигурации
    - Добавить в файл `tests/property_tests/test_config_property.py`
    - **Property 21: Права на изменение конфигурации**
    - **Validates: Requirements 11.3**
    - Использовать @given с генератором role (0-3)
    - Проверить успех для role <= 1, отказ для role > 1
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.12 Property 22: Применение конфигурации к токенам
    - Добавить в файл `tests/property_tests/test_config_property.py`
    - **Property 22: Применение конфигурации к токенам**
    - **Validates: Requirements 11.4**
    - Использовать @given с генератором session_lifetime_hours
    - Установить конфигурацию, сгенерировать JWT
    - Проверить, что exp соответствует установленному значению
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.13 Property 23: Валидация положительного времени жизни
    - Добавить в файл `tests/property_tests/test_config_property.py`
    - **Property 23: Валидация положительного времени жизни**
    - **Validates: Requirements 11.5**
    - Использовать @given с генератором session_lifetime <= 0
    - Проверить, что set_session_lifetime() отклоняет операцию
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 10.14 Property 24: Rate limiting после 5 попыток
    - Создать файл `tests/property_tests/test_rate_limit_property.py`
    - **Property 24: Rate limiting после 5 попыток**
    - **Validates: Requirements 12.4, 12.5**
    - Использовать @given с генератором tg_id
    - Записать 5 неудачных попыток
    - Проверить блокировку 6-й попытки
    - Минимум 100 итераций
    - Комментарии на русском языке

- [x] 11. Property-Based тесты для TypeScript (fast-check)
  - [x] 11.1 Property 17: JWT структура и срок действия (TypeScript)
    - Создать файл `nextjs-app/__tests__/property/jwt.property.test.ts`
    - **Property 17: JWT структура и срок действия**
    - **Validates: Requirements 10.1, 10.2, 10.5**
    - Использовать fc.asyncProperty с генераторами tgId, role
    - Генерировать JWT, валидировать, проверять claims
    - Проверить exp = iat + session_lifetime_hours * 3600
    - Минимум 100 итераций (numRuns: 100)
    - Комментарии на русском языке
  
  - [x] 11.2 Property 12: Пароли всегда хешируются (TypeScript)
    - Создать файл `nextjs-app/__tests__/property/password.property.test.ts`
    - **Property 12: Пароли всегда хешируются**
    - **Validates: Requirements 8.2, 9.1, 13.3**
    - Использовать fc.asyncProperty с генератором password
    - Проверить, что hashPassword() никогда не возвращает открытый пароль
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 11.3 Property 16: Уникальность солей (TypeScript)
    - Добавить в файл `nextjs-app/__tests__/property/password.property.test.ts`
    - **Property 16: Уникальность солей**
    - **Validates: Requirements 13.2**
    - Использовать fc.asyncProperty с генератором password
    - Хешировать один пароль дважды
    - Проверить, что хеши различаются
    - Минимум 100 итераций
    - Комментарии на русском языке
  
  - [x] 11.4 Property 24: Rate limiting после 5 попыток (TypeScript)
    - Создать файл `nextjs-app/__tests__/property/rateLimit.property.test.ts`
    - **Property 24: Rate limiting после 5 попыток**
    - **Validates: Requirements 12.4, 12.5**
    - Использовать fc.asyncProperty с генератором tgId
    - Записать 5 неудачных попыток
    - Проверить блокировку 6-й попытки
    - Минимум 100 итераций
    - Комментарии на русском языке

- [x] 12. Unit-тесты для критических компонентов (Python)
  - [x] 12.1 Unit-тесты для PasswordHasher
    - Создать файл `tests/unit/test_password_hasher.py`
    - Тест успешного хеширования пароля
    - Тест верификации правильного пароля
    - Тест отказа верификации неправильного пароля
    - Тест граничных случаев (пароль 8 символов, 128 символов)
    - Тест производительности (100-500ms)
    - Комментарии на русском языке
    - _Requirements: 8.2, 8.5, 9.1, 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [x] 12.2 Unit-тесты для JWTSessionService
    - Создать файл `tests/unit/test_jwt_session_service.py`
    - Тест генерации JWT токена
    - Тест валидации валидного токена
    - Тест отказа валидации истёкшего токена
    - Тест отказа валидации токена с неправильной подписью
    - Тест отказа валидации токена с модифицированными claims
    - Комментарии на русском языке
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3_
  
  - [x] 12.3 Unit-тесты для RateLimitService
    - Создать файл `tests/unit/test_rate_limit_service.py`
    - Тест разрешения первых 5 попыток
    - Тест блокировки 6-й попытки
    - Тест очистки попыток после успешного входа
    - Тест изоляции между разными tg_id
    - Тест разблокировки через 15 минут
    - Комментарии на русском языке
    - _Requirements: 12.4, 12.5_
  
  - [x] 12.4 Unit-тесты для AuthService
    - Создать файл `tests/unit/test_auth_service.py`
    - Тест успешной регистрации пароля
    - Тест отказа повторной регистрации пароля
    - Тест успешной аутентификации с правильным паролем
    - Тест отказа аутентификации с неправильным паролем
    - Тест единообразия сообщений об ошибках
    - Тест проверки rate limit перед аутентификацией
    - Комментарии на русском языке
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 12.4, 12.5_
  
  - [x] 12.5 Unit-тесты для RoleService
    - Создать файл `tests/unit/test_role_service.py`
    - Тест получения названий ролей
    - Тест проверки прав назначения операторов
    - Тест проверки прав изменения конфигурации
    - Тест проверки прав ответа пользователям
    - Комментарии на русском языке
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.3_
  
  - [x] 12.6 Unit-тесты для ConfigService
    - Создать файл `tests/unit/test_config_service.py`
    - Тест получения session_lifetime
    - Тест установки session_lifetime с правами
    - Тест отказа установки session_lifetime без прав
    - Тест валидации положительного значения
    - Комментарии на русском языке
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 13. Unit-тесты для критических компонентов (TypeScript)
  - [x] 13.1 Unit-тесты для JWTSessionService (TypeScript)
    - Создать файл `nextjs-app/__tests__/unit/jwtSessionService.test.ts`
    - Тест генерации JWT токена
    - Тест валидации валидного токена
    - Тест отказа валидации истёкшего токена
    - Тест отказа валидации токена с неправильной подписью
    - Использовать vitest
    - Комментарии на русском языке
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 13.2 Unit-тесты для AdminAuthService (TypeScript)
    - Создать файл `nextjs-app/__tests__/unit/adminAuthService.test.ts`
    - Тест успешной регистрации пароля
    - Тест успешной аутентификации
    - Тест отказа аутентификации с неправильным паролем
    - Тест проверки первого входа
    - Использовать vitest
    - Комментарии на русском языке
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_
  
  - [x] 13.3 Unit-тесты для RateLimitService (TypeScript)
    - Создать файл `nextjs-app/__tests__/unit/rateLimitService.test.ts`
    - Тест разрешения первых 5 попыток
    - Тест блокировки 6-й попытки
    - Тест очистки попыток
    - Использовать vitest
    - Комментарии на русском языке
    - _Requirements: 12.4, 12.5_

- [x] 14. Интеграционные тесты
  - [x] 14.1 End-to-End: Первый вход администратора
    - Создать файл `tests/integration/test_first_login_flow.py`
    - Создать администратора в БД с password_hash = NULL
    - Симулировать команду /start → проверить Reply Keyboard
    - Симулировать открытие WebApp → проверить определение первого входа
    - Симулировать установку пароля → проверить сохранение в БД
    - Симулировать генерацию JWT → проверить успешный доступ
    - Комментарии на русском языке
    - _Requirements: 4.2, 6.1, 6.2, 7.1, 8.1, 8.2, 8.3, 10.1_
  
  - [x] 14.2 End-to-End: Повторный вход администратора
    - Создать файл `tests/integration/test_repeat_login_flow.py`
    - Создать администратора с установленным паролем
    - Симулировать команду /start → проверить Reply Keyboard
    - Симулировать вход с правильным паролем → проверить JWT
    - Симулировать доступ к защищённому endpoint → проверить успех
    - Комментарии на русском языке
    - _Requirements: 4.2, 9.2, 9.3, 10.1, 10.3, 12.1_
  
  - [x] 14.3 End-to-End: Rate limiting
    - Создать файл `tests/integration/test_rate_limiting_flow.py`
    - Симулировать 5 неудачных попыток входа
    - Проверить блокировку 6-й попытки (429 Too Many Requests)
    - Симулировать ожидание 15 минут (изменение timestamp в БД)
    - Проверить разблокировку
    - Комментарии на русском языке
    - _Requirements: 12.4, 12.5_
  
  - [x] 14.4 Database Trigger: Уведомление нового администратора
    - Создать файл `tests/integration/test_admin_notification_trigger.py`
    - Выполнить INSERT в таблицу administrators
    - Проверить срабатывание триггера (LISTEN/NOTIFY)
    - Проверить вызов AdminNotificationService
    - Проверить отправку уведомления через Bot API (mock)
    - Комментарии на русском языке
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 15. Security тесты
  - [x] 15.1 SQL Injection Protection
    - Создать файл `tests/security/test_sql_injection.py`
    - Тест попыток инъекции в поле username
    - Тест попыток инъекции в поле password
    - Проверить использование параметризованных запросов
    - Комментарии на русском языке
  
  - [x] 15.2 JWT Security
    - Создать файл `tests/security/test_jwt_security.py`
    - Тест модификации claims без изменения подписи
    - Тест использования токена с другим secret key
    - Тест replay attacks (проверка exp claim)
    - Комментарии на русском языке
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [x] 15.3 Password Security
    - Создать файл `tests/security/test_password_security.py`
    - Тест, что пароли не логируются
    - Тест минимальной сложности хеширования (cost factor)
    - Тест уникальности солей
    - Комментарии на русском языке
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 16. Checkpoint - Проверка всех тестов
  - Запустить все property-based тесты: `source venv/bin/activate && pytest -m property`
  - Запустить все unit-тесты: `source venv/bin/activate && pytest tests/unit/`
  - Запустить все интеграционные тесты: `source venv/bin/activate && pytest tests/integration/`
  - Запустить все security тесты: `source venv/bin/activate && pytest tests/security/`
  - Запустить TypeScript тесты: `cd nextjs-app && npm test`
  - Проверить покрытие: `source venv/bin/activate && pytest --cov=services --cov=database --cov=handlers --cov-report=html`
  - Ensure all tests pass, ask the user if questions arise.


- [x] 17. Конфигурация и переменные окружения
  - [x] 17.1 Обновить .env файлы
    - Обновить файл `.env` (корневой)
    - Добавить переменные: JWT_SECRET, JWT_ALGORITHM, SESSION_LIFETIME_HOURS
    - Добавить переменные: RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MINUTES
    - Добавить переменные: ARGON2_TIME_COST, ARGON2_MEMORY_COST, ARGON2_PARALLELISM
    - Сгенерировать JWT_SECRET через: `openssl rand -base64 32`
    - Комментарии на русском языке
    - _Requirements: 10.5, 11.1, 12.4, 13.1_
  
  - [x] 17.2 Обновить .env.example
    - Обновить файл `.env.example`
    - Добавить все новые переменные с примерами значений
    - Добавить комментарии на русском языке
  
  - [x] 17.3 Создать AuthConfig класс
    - Создать файл `telegram-bot/config/auth_config.py`
    - Реализовать dataclass AuthConfig с полями для всех переменных
    - Реализовать метод `from_env()` для загрузки из переменных окружения
    - Валидация обязательных переменных (JWT_SECRET)
    - Комментарии на русском языке
  
  - [x] 17.4 Обновить Next.js .env.local
    - Обновить файл `nextjs-app/.env.local`
    - Добавить переменные: JWT_SECRET, SESSION_LIFETIME_HOURS
    - Добавить переменные для подключения к PostgreSQL
    - Комментарии на русском языке

- [x] 18. Документация и логирование
  - [x] 18.1 Настроить структурированное логирование
    - Обновить файл `telegram-bot/utils/logger.py`
    - Настроить JSON логирование для всех событий
    - Добавить уровни: DEBUG, INFO, WARNING, ERROR
    - Настроить безопасность логирования (не логировать пароли, JWT токены)
    - Комментарии на русском языке
  
  - [x] 18.2 Добавить логирование в сервисы
    - Обновить AuthService: логировать успешные/неудачные аутентификации
    - Обновить RateLimitService: логировать срабатывания блокировок
    - Обновить JWTSessionService: логировать генерацию/валидацию токенов (DEBUG)
    - Обновить AdminNotificationService: логировать отправку уведомлений
    - Комментарии на русском языке
  
  - [x] 18.3 Создать README для системы авторизации
    - Создать файл `telegram-bot/docs/ADMIN_AUTH_README.md`
    - Описать архитектуру системы на русском языке
    - Описать процесс первого входа и повторного входа
    - Описать ролевую модель
    - Описать процесс добавления нового администратора
    - Описать конфигурацию переменных окружения
    - Примеры использования API endpoints

- [x] 19. Обновление зависимостей
  - [x] 19.1 Обновить requirements.txt (Python)
    - Активировать виртуальное окружение: `source venv/bin/activate`
    - Установить новые зависимости: `pip install argon2-cffi PyJWT asyncpg hypothesis pytest-asyncio pytest-cov`
    - Обновить requirements.txt: `pip freeze > requirements.txt`
    - Комментарии на русском языке
  
  - [x] 19.2 Обновить package.json (Next.js)
    - Установить новые зависимости: `cd nextjs-app && npm install argon2 jose pg fast-check`
    - Установить dev зависимости: `npm install --save-dev @types/pg vitest`
    - Проверить package.json на наличие всех зависимостей

- [x] 20. Финальная интеграция и тестирование
  - [x] 20.1 Создать скрипт для инициализации БД
    - Создать файл `telegram-bot/scripts/init_admin_system.py`
    - Применить миграцию 009_create_admin_tables.sql
    - Создать первого администратора (Developer) из переменных окружения
    - Установить начальную конфигурацию в system_config
    - Выполнить через виртуальное окружение
    - Комментарии на русском языке
  
  - [x] 20.2 Создать скрипт для добавления администратора
    - Создать файл `telegram-bot/scripts/add_admin.py`
    - Принимать аргументы: tg_id, username, role
    - Создавать запись в administrators с password_hash = NULL
    - Триггер автоматически отправит уведомление
    - Выполнить через виртуальное окружение
    - Комментарии на русском языке
    - _Requirements: 5.1, 5.4_
  
  - [x] 20.3 Создать скрипт для очистки старых auth_attempts
    - Создать файл `telegram-bot/scripts/cleanup_auth_attempts.py`
    - Удалять записи старше 24 часов
    - Настроить как cron job или scheduled task
    - Выполнить через виртуальное окружение
    - Комментарии на русском языке
  
  - [x] 20.4 Тестирование полного цикла
    - Запустить Telegram Bot: `source venv/bin/activate && python telegram-bot/main.py`
    - Запустить Next.js: `cd nextjs-app && npm run dev`
    - Создать тестового администратора через add_admin.py
    - Проверить получение уведомления в Telegram
    - Открыть WebApp, установить пароль
    - Выйти и войти снова с паролем
    - Проверить работу rate limiting (5 неудачных попыток)
    - Проверить доступ к защищённым роутам
    - Проверить работу middleware

- [ ] 21. Финальный checkpoint - Полная проверка системы
  - Убедиться, что все миграции применены
  - Убедиться, что все сервисы работают корректно
  - Убедиться, что все тесты проходят (property, unit, integration, security)
  - Убедиться, что логирование настроено правильно
  - Убедиться, что конфигурация загружается из .env
  - Убедиться, что Telegram Bot интегрирован с WebApp
  - Убедиться, что rate limiting работает
  - Убедиться, что JWT токены генерируются и валидируются
  - Убедиться, что пароли хешируются через Argon2id
  - Убедиться, что триггер уведомлений работает
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи, помеченные `*`, являются опциональными и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные requirements для трассируемости
- Checkpoints обеспечивают инкрементальную валидацию
- Property-based тесты валидируют универсальные свойства корректности (минимум 100 итераций)
- Unit-тесты валидируют конкретные примеры и граничные случаи
- Интеграционные тесты валидируют end-to-end сценарии
- Security тесты валидируют защиту от атак
- Все Python скрипты выполняются через виртуальное окружение
- Комментарии в коде на русском языке
- Один модуль = один файл = одна ответственность
- Zero tolerance policy к ошибкам - исправлять немедленно

## Property-Based Tests Coverage

Все 24 свойства корректности из Design Document покрыты property-based тестами:

**Python (Hypothesis):**
- Property 1: Создание администраторов без пароля (10.1)
- Property 2: Проверка прав назначения операторов (10.2)
- Property 3: Все роли могут отвечать пользователям (10.3)
- Property 11: Определение первого входа (10.4)
- Property 12: Пароли всегда хешируются (10.5)
- Property 13: Round-trip установки пароля (10.6)
- Property 14: Верификация паролей (10.7)
- Property 16: Уникальность солей (10.8)
- Property 17: JWT структура и срок действия (10.9)
- Property 20: Конфигурация session lifetime (10.10)
- Property 21: Права на изменение конфигурации (10.11)
- Property 22: Применение конфигурации к токенам (10.12)
- Property 23: Валидация положительного времени жизни (10.13)
- Property 24: Rate limiting после 5 попыток (10.14)

**TypeScript (fast-check):**
- Property 17: JWT структура и срок действия (11.1)
- Property 12: Пароли всегда хешируются (11.2)
- Property 16: Уникальность солей (11.3)
- Property 24: Rate limiting после 5 попыток (11.4)

**Покрыты через интеграционные тесты:**
- Property 4: Команда /start запрашивает БД (14.1, 14.2)
- Property 5: Несуществующий tg_id запускает Standard Flow (14.1)
- Property 6: Существующий tg_id получает админ-клавиатуру (14.1, 14.2)
- Property 7: Админ-клавиатура содержит WebApp кнопку (14.1, 14.2)
- Property 8: Новые администраторы получают уведомления (14.4)
- Property 9: Уведомление содержит информацию о правах (14.4)
- Property 10: WebApp отклоняет доступ без tg_id (14.1)
- Property 15: Единообразие сообщений об ошибках (12.4, 14.2)
- Property 18: Валидация токенов в middleware (14.2)
- Property 19: Истёкшие токены требуют повторной аутентификации (12.2)

## Requirements Coverage

Все 15 requirements из Requirements Document покрыты задачами:

- Requirement 1: Хранение данных администраторов → Tasks 1, 2.1, 3.1
- Requirement 2: Определение ролевой модели → Tasks 2.2, 4.4
- Requirement 3: Обработка /start для обычных пользователей → Task 6.1
- Requirement 4: Обработка /start для администраторов → Tasks 6.1, 6.2
- Requirement 5: Динамическое предоставление прав → Tasks 4.7, 6.3, 20.2
- Requirement 6: Передача tg_id в WebApp → Tasks 8.1, 8.2
- Requirement 7: Интерфейс страницы входа → Task 8.2
- Requirement 8: Первичная регистрация пароля → Tasks 4.1, 4.5, 7.5, 8.2
- Requirement 9: Аутентификация существующих администраторов → Tasks 4.5, 7.6, 8.2
- Requirement 10: Управление сессиями → Tasks 4.2, 7.3, 7.7, 7.8
- Requirement 11: Конфигурируемое время жизни сессии → Tasks 3.3, 4.6, 17.1
- Requirement 12: Защита от несанкционированного доступа → Tasks 4.3, 7.6, 7.7, 7.8
- Requirement 13: Безопасное хранение паролей → Tasks 4.1, 15.3
- Requirement 14: Модульная архитектура → All tasks (один модуль = один файл)
- Requirement 15: Масштабируемость системы → Architecture design (stateless JWT, connection pooling)

## Execution Order

Рекомендуемый порядок выполнения задач:

1. **Phase 1: Database & Models** (Tasks 1-2) - Создание фундамента
2. **Phase 2: Repository Layer** (Task 3) - Доступ к данным
3. **Phase 3: Service Layer** (Task 4) - Бизнес-логика
4. **Phase 4: Telegram Bot** (Task 6) - Интеграция с Telegram
5. **Phase 5: Next.js Backend** (Task 7) - API endpoints
6. **Phase 6: Next.js Frontend** (Task 8) - UI компоненты
7. **Phase 7: Testing** (Tasks 10-15) - Валидация корректности
8. **Phase 8: Configuration** (Tasks 17-19) - Настройка окружения
9. **Phase 9: Integration** (Task 20) - Финальная интеграция

Checkpoints (Tasks 5, 9, 16, 21) обеспечивают валидацию на каждом этапе.
