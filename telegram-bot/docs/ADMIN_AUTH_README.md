# Система авторизации и ролевой модели администраторов

## Обзор

Система авторизации администраторов обеспечивает безопасный доступ к административной панели Telegram-бота через WebApp. Реализует многоуровневую ролевую модель, автоматическую регистрацию при первом входе и управление сессиями через JWT токены.

## Архитектура системы

### Компоненты

1. **Telegram Bot** (Python/aiogram)
   - Обработка команды /start
   - Автоматическое определение администраторов
   - Отправка уведомлений о предоставлении прав

2. **WebApp** (Next.js/TypeScript)
   - Страница входа с автоматическим определением первого входа
   - API endpoints для аутентификации
   - Защищённые административные страницы

3. **Core Services**
   - AuthService: логика аутентификации и регистрации
   - JWTSessionService: управление JWT сессиями
   - RoleService: управление ролями и правами
   - RateLimitService: защита от brute-force атак
   - PasswordHasher: безопасное хеширование паролей (Argon2id)

4. **Database Layer** (PostgreSQL)
   - Таблица administrators: хранение данных администраторов
   - Таблица auth_attempts: rate limiting
   - Таблица system_config: конфигурация системы

### Архитектурные принципы

- **Clean Architecture**: разделение на слои (Domain, Application, Infrastructure)
- **Dependency Injection**: инверсия зависимостей для тестируемости
- **Stateless Design**: JWT токены без серверного хранения сессий
- **Single Responsibility**: один модуль = один файл = одна ответственность
- **Security by Design**: безопасность на каждом уровне


## Ролевая модель

Система использует четырёхуровневую иерархию ролей:

| Роль | Уровень | Права доступа |
|------|---------|---------------|
| **Developer** | 0 | Полный доступ к системе, изменение конфигурации, назначение всех ролей |
| **Assistant** | 1 | Эквивалентен Developer, изменение конфигурации, назначение всех ролей |
| **Administrator** | 2 | Назначение операторов, ответы пользователям |
| **Operator** | 3 | Базовый уровень доступа, ответы пользователям |

### Права доступа

- **Назначение операторов**: Developer, Assistant, Administrator (role <= 2)
- **Изменение конфигурации**: Developer, Assistant (role <= 1)
- **Ответы пользователям**: Все роли (role <= 3)

## Процесс первого входа

### Шаг 1: Добавление администратора в БД

Администратор добавляется в систему через SQL или административный интерфейс:

```sql
INSERT INTO administrators (tg_id, username, role, password_hash)
VALUES (123456789, 'john_doe', 2, NULL);
```

### Шаг 2: Автоматическое уведомление

После добавления записи срабатывает триггер БД, который отправляет уведомление пользователю через Telegram Bot:

```
🎉 Поздравляем, john_doe!

Вам предоставлены права администратора.
Ваша роль: Администратор

Нажмите кнопку ниже для доступа к административной панели.
```

Вместе с уведомлением отправляется Reply Keyboard с кнопкой WebApp.

### Шаг 3: Открытие WebApp

Пользователь нажимает кнопку "🔐 Админ-панель" и открывает WebApp. Telegram автоматически передаёт tg_id через WebApp API.

### Шаг 4: Установка пароля

WebApp определяет, что это первый вход (password_hash IS NULL) и показывает форму установки пароля:


- Поле "Пароль" с placeholder "Установите пароль"
- Кнопка "Установить пароль"

После ввода пароля отправляется запрос:

```
POST /api/auth/register
{
  "tgId": 123456789,
  "password": "MySecurePassword123"
}
```

### Шаг 5: Успешная регистрация

WebApp получает JWT токен, сохраняет его в cookie и перенаправляет на административную панель.

## Процесс повторного входа

### Шаг 1: Команда /start

Администратор отправляет команду /start боту. Бот проверяет наличие tg_id в таблице administrators и отправляет Reply Keyboard с кнопкой WebApp.

### Шаг 2: Открытие WebApp

Администратор нажимает кнопку "🔐 Админ-панель". Telegram автоматически передаёт tg_id через WebApp API.

### Шаг 3: Форма входа

WebApp определяет, что пароль уже установлен (password_hash NOT NULL) и показывает форму входа:

- Поле "Пароль" с placeholder "Пароль"
- Кнопка "Войти"

### Шаг 4: Аутентификация

После ввода пароля отправляется запрос:

```
POST /api/auth/login
{
  "tgId": 123456789,
  "password": "MySecurePassword123"
}
```

Система проверяет:
1. Rate limit (не более 5 попыток за 15 минут)
2. Существование администратора
3. Корректность пароля через Argon2id

### Шаг 5: Успешный вход

При успешной аутентификации:
- Очищаются все неудачные попытки входа
- Генерируется JWT токен со сроком действия 24 часа
- Токен сохраняется в cookie
- Происходит редирект на /admin


## Добавление нового администратора

### Вариант 1: Через SQL

```sql
-- Добавление администратора с ролью Administrator
INSERT INTO administrators (tg_id, username, role, password_hash)
VALUES (987654321, 'jane_smith', 2, NULL);

-- Добавление администратора с ролью Operator
INSERT INTO administrators (tg_id, username, role, password_hash)
VALUES (555666777, 'operator_bob', 3, NULL);
```

После выполнения INSERT автоматически:
1. Срабатывает триггер `notify_new_admin()`
2. Отправляется уведомление пользователю через Telegram Bot
3. Пользователь получает Reply Keyboard с кнопкой WebApp

### Вариант 2: Через административный интерфейс

(Будет реализовано в будущих версиях)

## Конфигурация переменных окружения

### Telegram Bot (.env)

```env
# Telegram Bot Token
BOT_TOKEN=your_bot_token_here

# JWT Secret Key (минимум 32 символа)
JWT_SECRET_KEY=your_very_long_secret_key_at_least_32_characters

# Session Lifetime (часы)
SESSION_LIFETIME_HOURS=24

# WebApp URL
WEBAPP_URL=https://your-domain.com

# Database Connection
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Logging
LOG_LEVEL=INFO
JSON_LOGGING=true
```

### Next.js WebApp (.env.local)

```env
# Database Connection
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# JWT Secret Key (должен совпадать с Telegram Bot)
JWT_SECRET_KEY=your_very_long_secret_key_at_least_32_characters

# Session Lifetime (должен совпадать с Telegram Bot)
SESSION_LIFETIME_HOURS=24
```


## API Endpoints

### 1. Check First Login

Проверяет, первый ли это вход администратора.

**Endpoint:** `GET /api/auth/check-first-login?tgId={tg_id}`

**Response (200 OK):**
```json
{
  "isFirstLogin": true,
  "exists": true
}
```

**Errors:**
- `400 Bad Request`: Невалидный tgId
- `403 Forbidden`: Администратор не найден
- `500 Internal Server Error`: Ошибка сервера

### 2. Register Password

Регистрирует пароль для нового администратора (первый вход).

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "tgId": 123456789,
  "password": "MySecurePassword123"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": 2,
  "expiresAt": "2026-03-29T12:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: Невалидные данные или пароль < 8 символов
- `403 Forbidden`: Пароль уже установлен или администратор не найден
- `500 Internal Server Error`: Ошибка сервера

### 3. Login

Аутентифицирует существующего администратора.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "tgId": 123456789,
  "password": "MySecurePassword123"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": 2,
  "expiresAt": "2026-03-29T12:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: Невалидные данные
- `401 Unauthorized`: Неверный пароль или администратор не найден
- `429 Too Many Requests`: Превышен лимит попыток (5 за 15 минут)
- `500 Internal Server Error`: Ошибка сервера

### 4. Validate Token

Валидирует JWT токен.

**Endpoint:** `POST /api/auth/validate`

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "valid": true,
  "tgId": 123456789,
  "role": 2,
  "expiresAt": "2026-03-29T12:00:00Z"
}
```

**Response (401 Unauthorized):**
```json
{
  "valid": false
}
```


## Безопасность

### Хеширование паролей

Система использует **Argon2id** для хеширования паролей с параметрами:

- **time_cost**: 2 итерации
- **memory_cost**: 64 MB (65536 KB)
- **parallelism**: 4 потока
- **hash_len**: 32 байта
- **salt_len**: 16 байт

Каждый пароль хешируется с уникальной солью, что делает невозможным использование rainbow tables.

### JWT токены

- **Алгоритм**: HS256 (HMAC with SHA-256)
- **Secret Key**: Минимум 32 символа
- **Срок действия**: Конфигурируемый (по умолчанию 24 часа)
- **Claims**: tg_id, role, iat, exp

### Rate Limiting

Защита от brute-force атак:

- **Лимит**: 5 попыток за 15 минут
- **Блокировка**: Автоматическая на 15 минут после 5-й неудачной попытки
- **Алгоритм**: Sliding window
- **Очистка**: Автоматическая после успешного входа

### Логирование

Система использует структурированное JSON логирование с автоматической фильтрацией секретных данных:

**Фильтруются:**
- Пароли (password, password_hash)
- JWT токены (token, jwt, session_token)
- API ключи (api_key, api_secret)
- Любые строки, похожие на токены (длинные строки без пробелов)

**Уровни логирования:**
- **DEBUG**: Генерация/валидация JWT токенов
- **INFO**: Успешные аутентификации, регистрации, уведомления
- **WARNING**: Неудачные попытки входа, превышение rate limit
- **ERROR**: Ошибки отправки уведомлений, ошибки БД


## Примеры использования

### Python (Telegram Bot)

#### Инициализация сервисов

```python
from database.connection import DatabaseConnection
from database.repositories.admin_repository import AdminRepository
from database.repositories.auth_attempts_repository import AuthAttemptsRepository
from services.password_hasher import PasswordHasher
from services.jwt_session_service import JWTSessionService
from services.rate_limit_service import RateLimitService
from services.auth_service import AuthService

# Инициализация подключения к БД
db = DatabaseConnection(database_url=os.getenv("DATABASE_URL"))

# Инициализация репозиториев
admin_repo = AdminRepository(db)
auth_attempts_repo = AuthAttemptsRepository(db)

# Инициализация сервисов
password_hasher = PasswordHasher()
jwt_service = JWTSessionService(
    secret_key=os.getenv("JWT_SECRET_KEY"),
    session_lifetime_hours=int(os.getenv("SESSION_LIFETIME_HOURS", "24"))
)
rate_limiter = RateLimitService(auth_attempts_repo)
auth_service = AuthService(admin_repo, rate_limiter, password_hasher)
```

#### Регистрация пароля

```python
# Регистрация пароля для нового администратора
try:
    admin = await auth_service.register_password(
        tg_id=123456789,
        password="MySecurePassword123"
    )
    
    # Генерация JWT токена
    token = jwt_service.generate_token(admin.tg_id, admin.role)
    
    print(f"Пароль установлен для {admin.username}")
    print(f"JWT токен: {token}")
except ValueError as e:
    print(f"Ошибка: {e}")
```

#### Аутентификация

```python
# Аутентификация администратора
admin = await auth_service.authenticate(
    tg_id=123456789,
    password="MySecurePassword123"
)

if admin:
    # Генерация JWT токена
    token = jwt_service.generate_token(admin.tg_id, admin.role)
    print(f"Вход выполнен: {admin.username} ({admin.role})")
    print(f"JWT токен: {token}")
else:
    print("Неверный пароль или превышен лимит попыток")
```

### TypeScript (Next.js)

#### Проверка первого входа

```typescript
// Проверка первого входа
const response = await fetch(`/api/auth/check-first-login?tgId=${tgId}`);
const data = await response.json();

if (data.isFirstLogin) {
  // Показать форму установки пароля
  setPlaceholder("Установите пароль");
} else {
  // Показать форму входа
  setPlaceholder("Пароль");
}
```

#### Регистрация пароля

```typescript
// Регистрация пароля (первый вход)
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tgId: 123456789,
    password: 'MySecurePassword123'
  })
});

if (response.ok) {
  const data = await response.json();
  // Сохранить токен в cookie
  document.cookie = `admin-token=${data.token}; path=/; max-age=${24 * 60 * 60}`;
  // Редирект на админ-панель
  router.push('/admin');
}
```

#### Аутентификация

```typescript
// Вход (повторный вход)
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tgId: 123456789,
    password: 'MySecurePassword123'
  })
});

if (response.status === 429) {
  // Превышен лимит попыток
  alert('Слишком много попыток. Попробуйте позже.');
} else if (response.ok) {
  const data = await response.json();
  // Сохранить токен
  document.cookie = `admin-token=${data.token}; path=/; max-age=${24 * 60 * 60}`;
  router.push('/admin');
} else {
  // Неверный пароль
  alert('Неверный пароль');
}
```


## Структура файлов

### Telegram Bot (Python)

```
telegram-bot/
├── models/
│   ├── administrator.py          # Модель администратора
│   ├── role.py                   # Enum ролей
│   └── session.py                # Модель сессии (JWT claims)
├── database/
│   ├── repositories/
│   │   ├── admin_repository.py           # Репозиторий администраторов
│   │   ├── auth_attempts_repository.py   # Репозиторий попыток входа
│   │   └── config_repository.py          # Репозиторий конфигурации
│   └── migrations/
│       └── 009_create_admin_tables.sql   # Миграция таблиц
├── services/
│   ├── auth_service.py                   # Сервис аутентификации
│   ├── jwt_session_service.py            # Сервис JWT сессий
│   ├── rate_limit_service.py             # Сервис rate limiting
│   ├── role_service.py                   # Сервис управления ролями
│   ├── password_hasher.py                # Сервис хеширования паролей
│   ├── config_service.py                 # Сервис конфигурации
│   └── admin_notification_service.py     # Сервис уведомлений
├── handlers/
│   ├── admin_start_handler.py            # Обработчик /start для админов
│   └── common_handler.py                 # Обновлённый общий обработчик
└── utils/
    └── logger.py                         # Структурированное логирование
```

### Next.js WebApp (TypeScript)

```
nextjs-app/
├── app/
│   ├── login/
│   │   └── page.tsx                      # Страница входа (обновлённая)
│   ├── admin/
│   │   └── page.tsx                      # Админ-панель (существующая)
│   └── api/
│       └── auth/
│           ├── check-first-login/
│           │   └── route.ts              # API: проверка первого входа
│           ├── register/
│           │   └── route.ts              # API: регистрация пароля
│           ├── login/
│           │   └── route.ts              # API: вход
│           └── validate/
│               └── route.ts              # API: валидация токена
├── lib/
│   ├── models/
│   │   ├── administrator.ts              # TypeScript модель администратора
│   │   ├── role.ts                       # TypeScript enum ролей
│   │   └── session.ts                    # TypeScript интерфейс сессии
│   ├── repositories/
│   │   ├── adminRepository.ts            # TypeScript репозиторий админов
│   │   └── authAttemptsRepository.ts     # TypeScript репозиторий попыток
│   ├── services/
│   │   ├── adminAuthService.ts           # TypeScript сервис аутентификации
│   │   ├── jwtSessionService.ts          # TypeScript сервис JWT
│   │   ├── passwordHasher.ts             # TypeScript сервис хеширования
│   │   └── rateLimitService.ts           # TypeScript сервис rate limiting
│   └── utils/
│       └── telegramWebApp.ts             # Утилиты Telegram WebApp API
└── middleware.ts                         # Auth middleware (обновлённый)
```


## Тестирование

### Property-Based тесты (Hypothesis)

Система включает property-based тесты для проверки корректности:

```bash
# Активация виртуального окружения
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Запуск всех property-based тестов
pytest tests/property_tests/ -v

# Запуск конкретного property теста
pytest tests/property_tests/test_password_hashing_property.py -v
```

**Основные properties:**
- Property 1: Администраторы могут быть созданы без пароля
- Property 2: Проверка прав назначения операторов
- Property 12: Пароли всегда хешируются
- Property 16: Уникальность солей
- Property 17: JWT структура и срок действия
- Property 24: Rate limiting после 5 попыток

### Unit-тесты

```bash
# Запуск всех unit-тестов
pytest tests/unit/ -v

# Запуск тестов конкретного компонента
pytest tests/unit/test_auth_service.py -v
```

### Integration тесты

```bash
# Запуск интеграционных тестов
pytest tests/integration/ -v
```

## Устранение неполадок

### Проблема: "Превышен лимит попыток"

**Причина:** Более 5 неудачных попыток входа за 15 минут.

**Решение:**
1. Подождать 15 минут
2. Или очистить попытки вручную через SQL:
```sql
DELETE FROM auth_attempts WHERE tg_id = 123456789;
```

### Проблема: "Токен невалиден"

**Причина:** JWT токен истёк или имеет неправильную подпись.

**Решение:**
1. Проверить, что JWT_SECRET_KEY одинаковый в Telegram Bot и Next.js
2. Проверить срок действия токена
3. Повторно войти в систему

### Проблема: "Не могу установить пароль"

**Причина:** Пароль уже установлен (password_hash NOT NULL).

**Решение:**
1. Использовать форму входа вместо регистрации
2. Или сбросить пароль через SQL:
```sql
UPDATE administrators SET password_hash = NULL WHERE tg_id = 123456789;
```

## Миграция и развёртывание

### Применение миграций

```bash
# Активация виртуального окружения
source venv/bin/activate

# Запуск миграции
python run_migration.py
```

### Проверка таблиц

```sql
-- Проверка структуры таблицы administrators
\d administrators

-- Проверка триггера
SELECT tgname, tgtype, tgenabled 
FROM pg_trigger 
WHERE tgrelid = 'administrators'::regclass;

-- Проверка начальной конфигурации
SELECT * FROM system_config WHERE key = 'session_lifetime_hours';
```

## Дальнейшее развитие

### Планируемые улучшения

1. **Административный интерфейс для управления администраторами**
   - Добавление/удаление администраторов через UI
   - Изменение ролей
   - Просмотр истории входов

2. **Двухфакторная аутентификация (2FA)**
   - TOTP для дополнительной защиты
   - Опциональная для ролей Developer и Assistant

3. **Аудит действий администраторов**
   - Логирование всех действий в БД
   - Просмотр истории изменений

4. **Управление сессиями**
   - Просмотр активных сессий
   - Принудительное завершение сессий

