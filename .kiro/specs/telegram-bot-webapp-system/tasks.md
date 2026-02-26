# План реализации: Telegram Bot WebApp System

## Обзор

Реализация системы будет выполняться инкрементально, начиная с базовой инфраструктуры и постепенно добавляя функциональность. Каждый этап включает реализацию компонентов и их тестирование.

## Задачи

- [x] 1. Настройка инфраструктуры и базовой конфигурации
  - Создать структуру проекта для Python бота и Next.js приложения
  - Настроить файлы конфигурации (.env.example, .gitignore)
  - Настроить зависимости (requirements.txt, package.json)
  - Создать базовые модули конфигурации (config.py, environment variables)
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 2. Настройка базы данных PostgreSQL
  - [x] 2.1 Создать схему базы данных
    - Написать SQL миграции для таблиц support_sessions и support_messages
    - Добавить индексы на telegram_id, session_id, created_at
    - _Requirements: 17.3_
  
  - [x] 2.2 Реализовать модели SQLAlchemy
    - Создать models.py с классами SupportSession и SupportMessage
    - Настроить relationships между моделями
    - _Requirements: 14.4_
  
  - [x] 2.3 Создать модуль подключения к БД
    - Реализовать connection.py с async engine и session factory
    - Добавить connection pooling
    - _Requirements: 14.4_
  
  - [x] 2.4 Реализовать repository слой
    - Создать repository.py с методами для работы с сессиями и сообщениями
    - Методы: create_session, save_message, get_messages, close_session, get_active_sessions
    - _Requirements: 14.1, 14.5_

- [x] 3. Реализация Google Sheets интеграции
  - [x] 3.1 Создать GoogleSheetsService
    - Реализовать инициализацию клиента gspread с credentials
    - Добавить методы find_winner и save_delivery_data
    - Использовать asyncio.run_in_executor для неблокирующей работы
    - _Requirements: 1.2, 2.1, 4.5, 14.4_
  
  - [x] 3.2 Написать property-тест для поиска призов
    - **Property 1: Корректный поиск приза в Google Sheets**
    - **Validates: Requirements 1.2, 2.1**
  
  - [x] 3.3 Написать property-тест для round-trip сохранения данных
    - **Property 8: Round-trip сохранения данных доставки**
    - **Validates: Requirements 4.5**
  
  - [x] 3.4 Написать unit-тесты для edge cases
    - Тест: обработка несуществующего worksheet
    - Тест: обработка недоступности Google Sheets API
    - Тест: retry логика при ошибках
    - _Requirements: 1.5, 16.1_


- [x] 4. Реализация сервисов бота
  - [x] 4.1 Создать PrizeService
    - Реализовать метод check_prize с интеграцией GoogleSheetsService
    - Добавить логику определения типа приза (digital/physical)
    - Реализовать отметку о получении приза (claimed_at)
    - _Requirements: 1.1, 1.2, 2.1, 2.4_
  
  - [x] 4.2 Написать property-тест для отметки получения приза
    - **Property 3: Отметка о получении приза**
    - **Validates: Requirements 2.4**
  
  - [x] 4.3 Создать SupportService
    - Реализовать методы create_session, save_message, close_session
    - Интегрировать с repository слоем
    - _Requirements: 5.1, 6.2, 9.1, 14.4_
  
  - [x] 4.4 Написать property-тесты для SupportService
    - **Property 10: Создание сессии поддержки**
    - **Property 13: Перехват и сохранение сообщений в режиме поддержки**
    - **Property 21: Завершение сессии поддержки**
    - **Validates: Requirements 5.1, 5.5, 6.1, 6.2, 6.3, 9.1, 9.2, 9.4**

- [x] 5. Реализация FSM состояний
  - [x] 5.1 Создать FSM states
    - Определить SupportStates с состоянием in_support
    - Настроить FSM storage (Redis или Memory)
    - _Requirements: 5.2, 14.4_
  
  - [x] 5.2 Написать property-тест для перехода в FSM состояние
    - **Property 11: Переход в FSM состояние поддержки**
    - **Validates: Requirements 5.2**

- [x] 6. Реализация handlers бота
  - [x] 6.1 Создать PrizeHandler
    - Реализовать handle_code_word для обработки кодовых слов
    - Добавить методы _send_digital_prize и _send_physical_prize_button
    - Интегрировать с PrizeService
    - _Requirements: 1.1, 1.3, 2.2, 2.3, 3.1, 14.1_
  
  - [x] 6.2 Написать property-тесты для PrizeHandler
    - **Property 2: Структура сообщения с цифровым призом**
    - **Property 4: Отправка кнопки WebApp для физического приза**
    - **Validates: Requirements 2.2, 2.3, 3.1**
  
  - [x] 6.3 Написать unit-тесты для edge cases
    - Тест: ID не найден в таблице (сообщение "Вы ещё не победили")
    - Тест: отсутствующий промокод
    - _Requirements: 1.3, 2.5_
  
  - [x] 6.4 Создать SupportHandler
    - Реализовать start_support для начала сессии
    - Реализовать handle_support_message для перехвата сообщений
    - Реализовать end_support для завершения диалога
    - Добавить обработку медиа-контента (file_id)
    - _Requirements: 5.1, 5.3, 5.4, 6.1, 6.2, 6.4, 6.5, 9.1, 9.3, 14.1_
  
  - [x] 6.5 Написать property-тесты для SupportHandler
    - **Property 12: Отображение кнопки завершения диалога**
    - **Property 14: Изоляция команд в режиме поддержки**
    - **Property 15: Сохранение file_id для медиа-контента**
    - **Property 22: Восстановление обработки команд после поддержки**
    - **Validates: Requirements 5.3, 6.4, 6.5, 9.4**
  
  - [x] 6.6 Создать CommonHandler
    - Реализовать обработчики /start и /help
    - Добавить кнопку "Позвать человека"
    - _Requirements: 5.1, 14.1_

- [x] 7. Настройка логирования и обработки ошибок
  - [x] 7.1 Настроить структурированное логирование
    - Настроить structlog с JSON форматом
    - Добавить фильтрацию секретных данных из логов
    - _Requirements: 13.5, 16.5, 16.6_
  
  - [x] 7.2 Написать property-тест для отсутствия секретов в логах
    - **Property 30: Отсутствие секретов в логах**
    - **Validates: Requirements 13.5**
  
  - [x] 7.3 Реализовать retry логику
    - Создать утилиту retry_with_backoff
    - Интегрировать в GoogleSheetsService
    - _Requirements: 16.1_
  
  - [x] 7.4 Написать property-тест для retry логики
    - **Property 31: Retry логика для Google Sheets API**
    - **Validates: Requirements 16.1**
  
  - [x] 7.5 Добавить глобальный обработчик ошибок
    - Реализовать ExceptionHandler для бота
    - Добавить логирование с контекстом
    - _Requirements: 16.3, 16.5_
  
  - [x] 7.6 Написать property-тест для логирования ошибок БД
    - **Property 32: Логирование ошибок БД**
    - **Validates: Requirements 16.3, 16.5**

- [x] 8. Инициализация и запуск бота
  - [x] 8.1 Создать main.py
    - Инициализировать Bot и Dispatcher
    - Зарегистрировать все handlers
    - Настроить FSM storage
    - Добавить graceful shutdown
    - _Requirements: 14.1, 17.1_
  
  - [x] 8.2 Добавить Dockerfile для бота
    - Создать multi-stage build
    - Настроить health checks
    - _Requirements: 14.1_

- [x] 9. Checkpoint - Проверка работы бота
  - Убедиться, что все тесты бота проходят
  - Проверить работу с тестовой Google Таблицей
  - Проверить создание и завершение сессий поддержки
  - Спросить пользователя, если возникли вопросы

- [x] 10. Настройка Next.js проекта
  - [x] 10.1 Создать структуру Next.js приложения
    - Инициализировать Next.js с TypeScript
    - Настроить структуру папок (app, components, lib, types)
    - Настроить Tailwind CSS для стилизации
    - _Requirements: 15.1, 15.5_
  
  - [x] 10.2 Создать TypeScript типы
    - Создать types/telegram.ts с типами Telegram
    - Создать types/support.ts с типами поддержки
    - Создать types/delivery.ts с типами данных доставки
    - _Requirements: 15.5_

- [x] 11. Реализация InitData валидации
  - [x] 11.1 Создать InitDataValidator
    - Реализовать метод validate с криптографической проверкой
    - Добавить проверку timestamp (не старше 24 часов)
    - Реализовать метод extractUserData
    - _Requirements: 4.3, 10.1, 10.2, 10.3, 10.5, 10.6_
  
  - [x] 11.2 Написать property-тест для валидации InitData
    - **Property 7: Криптографическая валидация InitData**
    - **Property 24: Проверка срока действия InitData**
    - **Validates: Requirements 4.3, 10.2, 10.3, 10.6**
  
  - [x] 11.3 Написать unit-тесты для edge cases
    - Тест: невалидная подпись (HTTP 403)
    - Тест: устаревшие InitData (старше 24 часов)
    - _Requirements: 4.4, 10.5_

- [-] 12. Реализация Google Sheets клиента для Next.js
  - [x] 12.1 Создать GoogleSheetsClient
    - Реализовать инициализацию с credentials
    - Добавить метод saveDeliveryData
    - _Requirements: 4.5, 15.3_
  
  - [x] 12.2 Написать unit-тесты для сохранения данных
    - Тест: успешное сохранение данных
    - Тест: обработка ошибок API
    - _Requirements: 4.5, 4.7_

- [x] 13. Реализация Telegram Bot API клиента
  - [x] 13.1 Создать TelegramBotApi
    - Реализовать метод sendMessage
    - Добавить обработку ошибок отправки
    - _Requirements: 8.3, 8.4, 15.3_
  
  - [x] 13.2 Написать property-тест для отправки сообщений
    - **Property 20: Полный цикл отправки сообщения от поддержки** (часть)
    - **Validates: Requirements 8.3, 8.4**

- [x] 14. Реализация Database клиента для Next.js
  - [x] 14.1 Создать DatabaseClient
    - Настроить подключение к PostgreSQL (pg или Prisma)
    - Реализовать методы: getSessions, getMessages, saveMessage
    - Добавить пагинацию для getSessions
    - _Requirements: 7.4, 7.5, 8.2, 15.3, 17.4_
  
  - [x] 14.2 Написать property-тест для пагинации
    - **Property 34: Пагинация списка сессий**
    - **Validates: Requirements 17.4**

- [-] 15. Реализация API routes для данных доставки
  - [x] 15.1 Создать POST /api/delivery route
    - Реализовать валидацию схемы с Zod
    - Добавить валидацию InitData
    - Интегрировать с GoogleSheetsClient
    - Обработать все типы ошибок (400, 403, 500)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 15.2_
  
  - [x] 15.2 Написать property-тесты для API
    - **Property 5: Передача InitData при открытии WebApp**
    - **Property 6: Валидация обязательных полей формы**
    - **Property 8: Round-trip сохранения данных доставки**
    - **Validates: Requirements 3.4, 4.1, 4.2, 4.5, 10.1**
  
  - [x] 15.3 Написать unit-тесты для edge cases
    - Тест: невалидные InitData (403)
    - Тест: ошибка валидации полей (400)
    - Тест: ошибка сохранения в Google Sheets (500)
    - _Requirements: 4.4, 4.7_

- [x] 16. Реализация WebApp компонентов
  - [x] 16.1 Создать DeliveryForm компонент
    - Реализовать форму с react-hook-form и Zod валидацией
    - Добавить все поля: ФИО, адрес, телефон, комментарий
    - Интегрировать с Telegram WebApp SDK (@twa-dev/sdk)
    - Добавить отправку на /api/delivery
    - Реализовать закрытие WebApp после успеха
    - _Requirements: 3.3, 3.5, 4.1, 4.2, 4.6_
  
  - [x] 16.2 Написать тесты для DeliveryForm
    - **Property 9: Закрытие WebApp после успешного сохранения**
    - Unit-тест: отображение всех обязательных полей
    - Unit-тест: валидация невалидного телефона
    - **Validates: Requirements 3.5, 4.1, 4.6**
  
  - [x] 16.3 Создать страницу app/webapp/page.tsx
    - Рендерить DeliveryForm с prize_id из query params
    - Добавить обработку ошибок
    - _Requirements: 3.3_

- [-] 17. Реализация защиты от XSS
  - [x] 17.1 Добавить санитизацию пользовательского контента
    - Использовать встроенное экранирование React
    - Добавить серверную валидацию и санитизацию
    - _Requirements: 12.1, 12.3_
  
  - [x] 17.2 Написать property-тесты для XSS защиты
    - **Property 27: Экранирование HTML в пользовательском контенте**
    - **Property 28: Серверная валидация пользовательского ввода**
    - **Validates: Requirements 12.1, 12.3**
  
  - [x] 17.3 Настроить Content Security Policy
    - Добавить CSP заголовки в middleware.ts
    - Запретить inline scripts и внешние источники
    - _Requirements: 12.4_
  
  - [x] 17.4 Написать unit-тест для CSP заголовков
    - Тест: проверка наличия CSP заголовков в ответах
    - _Requirements: 12.4_
  
  - [x] 17.5 Добавить валидацию URL
    - Создать утилиту для проверки протокола URL
    - Разрешить только http и https
    - _Requirements: 12.5_
  
  - [x] 17.6 Написать property-тест для валидации URL
    - **Property 29: Валидация протокола URL**
    - **Validates: Requirements 12.5**

- [x] 18. Checkpoint - Проверка WebApp
  - Убедиться, что все тесты WebApp проходят
  - Проверить работу формы доставки
  - Проверить валидацию InitData
  - Спросить пользователя, если возникли вопросы

- [x] 19. Настройка NextAuth.js для админки
  - [x] 19.1 Создать auth configuration
    - Настроить NextAuth.js с credentials provider
    - Создать lib/auth/authOptions.ts
    - Настроить защищённые сессии
    - _Requirements: 11.3, 11.4_
  
  - [x] 19.2 Создать API route для аутентификации
    - Создать app/api/auth/[...nextauth]/route.ts
    - Интегрировать с authOptions
    - _Requirements: 11.3_
  
  - [x] 19.3 Создать middleware для защиты роутов
    - Реализовать middleware.ts для проверки сессии
    - Защитить /admin и /api/support routes
    - Добавить редирект на /login для неавторизованных
    - _Requirements: 11.1, 11.2_
  
  - [x] 19.4 Написать property-тесты для аутентификации
    - **Property 25: Проверка аутентификации в админке**
    - **Property 26: Создание сессии после успешной аутентификации**
    - **Validates: Requirements 11.1, 11.3, 11.4**
  
  - [x] 19.5 Написать unit-тест для редиректа
    - Тест: неавторизованный доступ к админке (редирект на /login)
    - _Requirements: 11.2_

- [-] 20. Реализация API routes для поддержки
  - [x] 20.1 Создать GET /api/support/sessions route
    - Реализовать получение списка сессий с фильтром по статусу
    - Добавить пагинацию (50 сессий на страницу)
    - Добавить проверку аутентификации
    - _Requirements: 7.4, 17.4_
  
  - [x] 20.2 Создать GET /api/support/messages route
    - Реализовать получение сообщений по session_id
    - Добавить проверку аутентификации
    - _Requirements: 7.5_
  
  - [x] 20.3 Создать POST /api/support/messages route
    - Реализовать сохранение сообщения в БД
    - Интегрировать с TelegramBotApi для отправки
    - Добавить обработку ошибок отправки
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_
  
  - [x] 20.4 Написать property-тест для полного цикла отправки
    - **Property 20: Полный цикл отправки сообщения от поддержки**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
  
  - [x] 20.5 Написать unit-тесты для edge cases
    - Тест: ошибка отправки через Telegram API
    - _Requirements: 8.6_

- [-] 21. Настройка real-time обновлений (Supabase Realtime)
  - [x] 21.1 Настроить Supabase клиент
    - Инициализировать Supabase с credentials
    - Настроить подключение к PostgreSQL через Supabase
    - _Requirements: 7.1_
  
  - [x] 21.2 Настроить real-time подписки на стороне БД
    - Включить Realtime для таблицы support_messages
    - Настроить публикацию изменений
    - _Requirements: 7.1_
  
  - [x] 21.3 Написать property-тест для real-time уведомлений
    - **Property 16: Real-time уведомления о новых сообщениях**
    - **Validates: Requirements 7.1**

- [x] 22. Реализация компонентов админки
  - [x] 22.1 Создать SessionList компонент
    - Реализовать отображение списка активных сессий
    - Добавить автообновление каждые 10 секунд
    - Показывать unread_count для каждой сессии
    - _Requirements: 7.4_
  
  - [x] 22.2 Написать unit-тест для SessionList
    - Тест: отображение активных сессий при загрузке
    - _Requirements: 7.4_
  
  - [x] 22.3 Создать ChatWindow компонент
    - Реализовать отображение истории сообщений
    - Добавить Supabase real-time подписку на новые сообщения
    - Реализовать форму отправки ответа
    - Добавить автоскролл к новым сообщениям
    - _Requirements: 7.2, 7.3, 7.5, 8.1_
  
  - [x] 22.4 Написать property-тесты для ChatWindow
    - **Property 17: Обновление UI админки без перезагрузки**
    - **Property 18: Отображение полей сообщения в админке**
    - **Property 19: Загрузка истории переписки**
    - **Validates: Requirements 7.2, 7.3, 7.5**
  
  - [x] 22.5 Создать MessageInput компонент
    - Реализовать поле ввода с валидацией
    - Добавить кнопку отправки
    - Показывать состояние отправки
    - _Requirements: 8.1_
  
  - [x] 22.6 Создать страницу app/admin/page.tsx
    - Интегрировать SessionList и ChatWindow
    - Добавить layout с навигацией
    - Реализовать выбор сессии
    - _Requirements: 7.4, 7.5_

- [x] 23. Реализация обновления статусов в админке
  - [x] 23.1 Добавить real-time обновление статусов сессий
    - Подписаться на изменения в support_sessions
    - Обновлять UI при закрытии сессии
    - _Requirements: 9.5_
  
  - [x] 23.2 Написать property-тест для обновления статуса
    - **Property 23: Обновление статуса сессии в админке**
    - **Property 25: Отображение отметки о доставке** (часть Property 20)
    - **Validates: Requirements 8.5, 9.5**

- [x] 24. Реализация обработки ошибок в WebApp и админке
  - [x] 24.1 Добавить error boundaries в React компонентах
    - Создать ErrorBoundary компонент
    - Обернуть основные компоненты
    - _Requirements: 16.4_
  
  - [x] 24.2 Добавить отображение понятных сообщений об ошибках
    - Создать компонент ErrorMessage
    - Использовать в формах и API вызовах
    - _Requirements: 16.4_
  
  - [x] 24.3 Написать property-тест для отображения ошибок
    - **Property 33: Отображение понятных сообщений об ошибках**
    - **Validates: Requirements 16.4**

- [x] 25. Checkpoint - Проверка админки
  - Убедиться, что все тесты админки проходят
  - Проверить real-time обновления сообщений
  - Проверить отправку ответов пользователям
  - Проверить аутентификацию и защиту роутов
  - Спросить пользователя, если возникли вопросы

- [x] 26. Интеграционное тестирование ✅
  - [x] 26.1 Написать интеграционный тест для полного цикла розыгрыша ✅
    - Тест: пользователь отправляет кодовое слово → получает цифровой приз ✅
    - Тест: пользователь отправляет кодовое слово → получает кнопку WebApp → заполняет форму → данные сохраняются ✅
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.5_
  
  - [x] 26.2 Написать интеграционный тест для полного цикла поддержки ✅
    - Тест: пользователь начинает диалог → отправляет сообщения → поддержка отвечает → пользователь завершает диалог ✅
    - _Requirements: 5.1, 6.1, 6.2, 8.1, 8.3, 9.1_
  
  - [x] 26.3 Написать интеграционный тест для real-time обновлений ✅
    - Тест: новое сообщение в БД → уведомление в админке → отображение в UI ✅
    - _Requirements: 7.1, 7.2_

- [x] 27. Настройка Docker и docker-compose
  - [x] 27.1 Создать Dockerfile для бота
    - Multi-stage build для оптимизации размера
    - Добавить health checks
    - _Requirements: 14.1_
  
  - [x] 27.2 Создать Dockerfile для Next.js
    - Multi-stage build с production оптимизациями
    - Настроить переменные окружения
    - _Requirements: 15.1_
  
  - [x] 27.3 Создать docker-compose.yml
    - Настроить сервисы: bot, nextjs, postgres
    - Добавить volumes для персистентности данных
    - Настроить networks для изоляции
    - _Requirements: 14.1, 15.1_

- [x] 28. Документация и финальная проверка
  - [x] 28.1 Создать README.md
    - Описание проекта и архитектуры
    - Инструкции по установке и запуску
    - Описание переменных окружения
    - _Requirements: 13.1, 13.3_
  
  - [x] 28.2 Создать .env.example
    - Перечислить все необходимые переменные окружения
    - Добавить комментарии с описанием
    - _Requirements: 13.1, 13.3_
  
  - [x] 28.3 Проверить .gitignore
    - Убедиться, что .env добавлен
    - Добавить node_modules, __pycache__, .pytest_cache
    - _Requirements: 13.4_

- [x] 29. Финальный checkpoint
  - Запустить все тесты (unit, property-based, integration)
  - Проверить покрытие кода (минимум 80%)
  - Запустить систему через docker-compose
  - Протестировать все основные сценарии вручную
  - Проверить логирование и обработку ошибок
  - Спросить пользователя о готовности к деплою

## Примечания

- Все тесты являются обязательными для выполнения
- Каждая property-based тест должна выполняться минимум 100 итераций
- Все критические компоненты (InitDataValidator, GoogleSheetsService, SupportService) требуют 100% покрытия тестами
- Checkpoints предназначены для проверки работоспособности системы на каждом этапе
- Политика нулевой терпимости к ошибкам: все тесты должны проходить перед переходом к следующей задаче
