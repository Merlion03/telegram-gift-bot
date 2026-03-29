# Requirements Document

## Introduction

Система авторизации и ролевой модели администраторов предназначена для управления доступом к административной панели Telegram-бота через WebApp. Система обеспечивает безопасную аутентификацию администраторов с различными уровнями доступа, автоматическую регистрацию при первом входе и управление сессиями.

## Glossary

- **Admin_System**: Система авторизации и управления ролями администраторов
- **Database**: PostgreSQL база данных для хранения информации об администраторах
- **Telegram_Bot**: Telegram бот, обрабатывающий команды и предоставляющий доступ к WebApp
- **WebApp**: Веб-приложение административной панели на Next.js
- **Admin_Table**: Таблица administrators в базе данных
- **Role_Level**: Числовой уровень доступа администратора (0-3)
- **Session_Token**: JWT токен для аутентификации пользователя в WebApp
- **Password_Hash**: Хэшированный пароль администратора
- **Reply_Keyboard**: Клавиатура Telegram с кнопкой доступа к WebApp
- **Standard_Flow**: Стандартный пользовательский сценарий получения приза
- **Session_Lifetime**: Время жизни авторизационной сессии в часах

## Requirements

### Requirement 1: Хранение данных администраторов

**User Story:** Как система, я хочу хранить информацию об администраторах в базе данных, чтобы управлять их доступом и ролями

#### Acceptance Criteria

1. THE Admin_Table SHALL contain field tg_id of type integer as Primary Key
2. THE Admin_Table SHALL contain field username of type string for Telegram username
3. THE Admin_Table SHALL contain field role of type integer for Role_Level
4. THE Admin_Table SHALL contain field password_hash of type string for Password_Hash
5. THE Admin_Table SHALL allow password_hash field to be NULL for new administrators

### Requirement 2: Определение ролевой модели

**User Story:** Как администратор системы, я хочу иметь четкую иерархию ролей, чтобы разграничивать уровни доступа

#### Acceptance Criteria

1. WHEN Role_Level equals 0, THE Admin_System SHALL grant Developer role with full system access
2. WHEN Role_Level equals 1, THE Admin_System SHALL grant Assistant role with access equivalent to Developer
3. WHEN Role_Level equals 2, THE Admin_System SHALL grant Administrator role with permission to assign Operator roles
4. WHEN Role_Level equals 3, THE Admin_System SHALL grant Operator role with base access level
5. FOR ALL Role_Level values from 0 to 3, THE Admin_System SHALL grant permission to respond to user messages

### Requirement 3: Обработка команды /start для обычных пользователей

**User Story:** Как обычный пользователь, я хочу получить доступ к стандартному функционалу при вводе /start, чтобы участвовать в программе

#### Acceptance Criteria

1. WHEN Telegram_Bot receives /start command, THE Telegram_Bot SHALL query Admin_Table for sender tg_id
2. IF sender tg_id is not found in Admin_Table, THEN THE Telegram_Bot SHALL initiate Standard_Flow
3. THE Standard_Flow SHALL provide prize acquisition functionality to the user

### Requirement 4: Обработка команды /start для администраторов

**User Story:** Как администратор, я хочу получить доступ к админ-панели при вводе /start, чтобы управлять системой

#### Acceptance Criteria

1. WHEN Telegram_Bot receives /start command, THE Telegram_Bot SHALL query Admin_Table for sender tg_id
2. IF sender tg_id is found in Admin_Table, THEN THE Telegram_Bot SHALL send Reply_Keyboard with WebApp access button
3. THE Reply_Keyboard SHALL contain button that opens WebApp administrative panel

### Requirement 5: Динамическое предоставление прав администратора

**User Story:** Как система, я хочу автоматически уведомлять пользователей о предоставлении прав администратора, чтобы они могли сразу получить доступ без перезапуска бота

#### Acceptance Criteria

1. WHEN new administrator record is created in Admin_Table for existing user, THE Admin_System SHALL send notification message via Telegram_Bot
2. THE notification message SHALL inform user about granted administrative access
3. THE Admin_System SHALL attach Reply_Keyboard with WebApp access button to notification message
4. THE notification SHALL be sent immediately after role assignment

### Requirement 6: Передача идентификатора пользователя в WebApp

**User Story:** Как система безопасности, я хочу автоматически передавать tg_id при открытии WebApp, чтобы предотвратить несанкционированный доступ

#### Acceptance Criteria

1. WHEN administrator opens WebApp from Telegram, THE Telegram_Bot SHALL automatically transmit tg_id to WebApp
2. THE WebApp SHALL receive tg_id through Telegram WebApp API
3. IF WebApp is accessed without valid tg_id, THEN THE WebApp SHALL deny access
4. THE WebApp SHALL prevent access from regular web browsers without valid Telegram context

### Requirement 7: Интерфейс страницы входа

**User Story:** Как администратор, я хочу видеть минималистичный интерфейс входа, чтобы быстро авторизоваться

#### Acceptance Criteria

1. THE WebApp login page SHALL display single visible input field with placeholder "Пароль"
2. THE WebApp login page SHALL contain hidden field for tg_id
3. THE WebApp SHALL automatically populate hidden tg_id field from Telegram WebApp context
4. THE WebApp login page SHALL not display username or login input fields

### Requirement 8: Первичная регистрация пароля

**User Story:** Как новый администратор, я хочу установить пароль при первом входе, чтобы защитить свой аккаунт

#### Acceptance Criteria

1. WHEN administrator with NULL password_hash opens WebApp, THE WebApp SHALL detect first-time login
2. WHEN administrator enters password on first login, THE WebApp SHALL hash the password
3. THE WebApp SHALL store Password_Hash in Admin_Table for corresponding tg_id
4. THE WebApp SHALL use stored Password_Hash for all subsequent authentication attempts
5. THE WebApp SHALL use cryptographically secure hashing algorithm for password storage

### Requirement 9: Аутентификация существующих администраторов

**User Story:** Как администратор с установленным паролем, я хочу входить в систему используя свой пароль, чтобы получить доступ к панели

#### Acceptance Criteria

1. WHEN administrator with existing password_hash enters password, THE WebApp SHALL hash entered password
2. THE WebApp SHALL compare hashed password with stored Password_Hash
3. IF passwords match, THEN THE WebApp SHALL generate Session_Token
4. IF passwords do not match, THEN THE WebApp SHALL deny access and display error message
5. THE WebApp SHALL not reveal whether tg_id exists in system during authentication failure

### Requirement 10: Управление сессиями

**User Story:** Как администратор, я хочу оставаться авторизованным в течение рабочего дня, чтобы не вводить пароль постоянно

#### Acceptance Criteria

1. WHEN authentication succeeds, THE WebApp SHALL create Session_Token with 24-hour expiration
2. THE Session_Token SHALL contain tg_id and Role_Level claims
3. THE WebApp SHALL validate Session_Token on each protected request
4. IF Session_Token expires, THEN THE WebApp SHALL require re-authentication
5. THE Session_Token SHALL use JWT format with secure signing algorithm

### Requirement 11: Конфигурируемое время жизни сессии

**User Story:** Как разработчик или помощник, я хочу настраивать время жизни сессий, чтобы адаптировать безопасность под требования

#### Acceptance Criteria

1. THE Admin_System SHALL store Session_Lifetime as configurable parameter
2. THE Admin_System SHALL allow Session_Lifetime modification through configuration
3. WHERE Role_Level equals 0 OR Role_Level equals 1, THE Admin_System SHALL permit Session_Lifetime modification
4. THE WebApp SHALL apply configured Session_Lifetime value when creating Session_Token
5. THE Session_Lifetime SHALL be expressed in hours as positive integer

### Requirement 12: Защита от несанкционированного доступа

**User Story:** Как система безопасности, я хочу предотвращать доступ неавторизованных пользователей, чтобы защитить административные функции

#### Acceptance Criteria

1. WHEN WebApp receives request without valid Session_Token, THE WebApp SHALL return 401 Unauthorized status
2. WHEN WebApp receives request with expired Session_Token, THE WebApp SHALL return 401 Unauthorized status
3. WHEN WebApp receives request with invalid signature in Session_Token, THE WebApp SHALL return 401 Unauthorized status
4. THE WebApp SHALL implement rate limiting for authentication attempts
5. IF authentication fails more than 5 times within 15 minutes for same tg_id, THEN THE WebApp SHALL temporarily block authentication attempts

### Requirement 13: Безопасное хранение паролей

**User Story:** Как система безопасности, я хочу безопасно хранить пароли администраторов, чтобы предотвратить их компрометацию

#### Acceptance Criteria

1. THE WebApp SHALL use bcrypt or argon2 algorithm for password hashing
2. THE WebApp SHALL generate unique salt for each Password_Hash
3. THE WebApp SHALL never store passwords in plain text
4. THE WebApp SHALL never log or transmit passwords in plain text
5. THE Password_Hash SHALL have minimum cost factor of 12 for bcrypt or equivalent for argon2

### Requirement 14: Модульная архитектура

**User Story:** Как разработчик, я хочу иметь модульную структуру кода, чтобы легко поддерживать и расширять систему

#### Acceptance Criteria

1. THE Admin_System SHALL implement database operations in separate module
2. THE Admin_System SHALL implement authentication logic in separate module
3. THE Admin_System SHALL implement role management in separate module
4. THE Admin_System SHALL implement session management in separate module
5. THE Admin_System SHALL implement Telegram bot handlers in separate module
6. THE Admin_System SHALL implement WebApp API endpoints in separate module
7. WHEN module is modified, THE Admin_System SHALL not require changes in unrelated modules

### Requirement 15: Масштабируемость системы

**User Story:** Как архитектор системы, я хочу обеспечить масштабируемость, чтобы система могла расти без архитектурных изменений

#### Acceptance Criteria

1. THE Database SHALL support connection pooling for concurrent requests
2. THE WebApp SHALL support horizontal scaling through stateless Session_Token design
3. THE Admin_System SHALL separate business logic from infrastructure concerns
4. THE Admin_System SHALL use dependency injection for component coupling
5. THE Admin_System SHALL implement clean architecture principles with clear layer separation

