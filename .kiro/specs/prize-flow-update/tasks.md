# Implementation Plan: Prize Flow Update

## Overview

Реализация обновлённой логики получения призов в Telegram боте с добавлением главного меню, проверки GDPR согласия, FSM управления состояниями и улучшенной обработки ошибок. Все задачи строятся инкрементально, каждая следующая задача использует результаты предыдущих.

## Tasks

- [x] 1. Database migration и модели
  - [x] 1.1 Добавить поле gdpr_consent_date в модель Prize
    - Добавить поле `gdpr_consent_date: Mapped[Optional[datetime]]` в класс Prize
    - Добавить метод `has_gdpr_consent()` для проверки наличия согласия
    - Обновить docstring модели с описанием нового поля
    - _Requirements: 3.3, 10.3_

  - [x] 1.2 Создать SQL миграцию для добавления поля
    - Создать файл миграции `migrations/add_gdpr_consent_field.sql`
    - Добавить ALTER TABLE для поля gdpr_consent_date
    - Создать индекс idx_prizes_gdpr_consent для оптимизации запросов
    - Добавить комментарий к полю
    - _Requirements: 3.3, Performance 2_

  - [x] 1.3 Расширить PrizeRepository новыми методами
    - Реализовать `check_user_exists(telegram_id)` для проверки наличия пользователя
    - Реализовать `get_gdpr_consent_date(telegram_id)` для получения даты согласия
    - Реализовать `update_gdpr_consent(telegram_id, consent_date)` для сохранения согласия
    - _Requirements: 2.1, 2.2, 3.1, 3.3_

  - [x] 1.4 Написать unit тесты для PrizeRepository
    - Тест для check_user_exists с существующим и несуществующим пользователем
    - Тест для get_gdpr_consent_date с наличием и отсутствием согласия
    - Тест для update_gdpr_consent с проверкой сохранения timestamp
    - _Requirements: 2.1, 3.1, 3.3_

- [x] 2. FSM States и клавиатуры
  - [x] 2.1 Создать PrizeFlowStates в fsm/states.py
    - Создать класс PrizeFlowStates(StatesGroup)
    - Определить состояния: waiting_for_consent, waiting_for_code_word, waiting_for_delivery_data
    - Добавить docstring с описанием переходов между состояниями
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.2 Создать модуль keyboards/reply_keyboards.py
    - Реализовать `get_main_menu_keyboard()` с кнопкой "🎁 Получить приз"
    - Реализовать `get_consent_keyboard()` с кнопками "✅ Согласен" и "◀️ Назад"
    - Реализовать `remove_keyboard()` для удаления клавиатуры
    - _Requirements: 1.2, 3.2, 8.1_

  - [x] 2.3 Написать unit тесты для клавиатур
    - Тест для get_main_menu_keyboard с проверкой структуры кнопок
    - Тест для get_consent_keyboard с проверкой текста кнопок
    - Тест для remove_keyboard с проверкой типа возвращаемого объекта
    - _Requirements: 1.2, 3.2, 8.1_

- [ ] 3. Checkpoint - Проверка базовой инфраструктуры
  - Убедиться, что миграция применяется без ошибок
  - Убедиться, что все тесты проходят
  - Спросить пользователя, если возникли вопросы

- [x] 4. Расширение PrizeService
  - [x] 4.1 Добавить метод check_user_exists в PrizeService
    - Реализовать проверку наличия пользователя через PrizeRepository
    - Добавить обработку DatabaseUnavailableError
    - Добавить логирование результата проверки
    - _Requirements: 2.1, 2.2, 12.1_

  - [x] 4.2 Добавить метод check_gdpr_consent в PrizeService
    - Реализовать проверку наличия GDPR согласия через PrizeRepository
    - Добавить обработку DatabaseUnavailableError
    - Добавить логирование результата проверки
    - _Requirements: 3.1, 12.1_

  - [x] 4.3 Добавить метод save_gdpr_consent в PrizeService
    - Реализовать сохранение GDPR согласия с текущим timestamp
    - Добавить обработку DatabaseUnavailableError
    - Добавить логирование сохранения согласия
    - _Requirements: 3.3, 12.1, 12.5_

  - [x] 4.4 Добавить метод validate_code_word в PrizeService
    - Реализовать валидацию кодового слова через PrizeRepository
    - Добавить проверку на пустое или слишком длинное кодовое слово
    - Добавить обработку DatabaseUnavailableError
    - _Requirements: 5.3, 12.4_

  - [x] 4.5 Написать unit тесты для PrizeService
    - Тест для check_user_exists с существующим и несуществующим пользователем
    - Тест для check_gdpr_consent с наличием и отсутствием согласия
    - Тест для save_gdpr_consent с проверкой timestamp
    - Тест для validate_code_word с валидными и невалидными данными
    - Тест для обработки DatabaseUnavailableError в каждом методе
    - _Requirements: 2.1, 3.1, 3.3, 5.3, 12.1_

  - [x] 4.6 Написать property тест для GDPR consent persistence
    - **Property 5: GDPR Consent Persistence**
    - **Validates: Requirements 3.3**
    - Проверить, что сохранённое согласие можно получить из БД
    - Проверить, что timestamp находится в корректном диапазоне

- [x] 5. Реализация PrizeFlowHandler
  - [x] 5.1 Создать класс PrizeFlowHandler в handlers/prize_flow_handler.py
    - Создать класс с зависимостями: PrizeService, SessionManager
    - Добавить конструктор с инициализацией зависимостей
    - Добавить docstring с описанием назначения handler
    - _Requirements: 10.6_

  - [x] 5.2 Реализовать метод start_prize_flow
    - Проверить наличие пользователя через PrizeService.check_user_exists
    - Если не найден - отправить сообщение об отсутствии в списке и главное меню
    - Если найден - проверить GDPR согласие через PrizeService.check_gdpr_consent
    - Если согласия нет - запросить согласие с клавиатурой consent
    - Если согласие есть - запросить кодовое слово
    - Сохранить все сообщения через SessionManager
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 11.1, 11.2_

  - [x] 5.3 Реализовать метод handle_consent_response
    - Проверить текст сообщения на соответствие кнопкам
    - Если "✅ Согласен" - сохранить согласие и запросить кодовое слово
    - Если "◀️ Назад" - отобразить главное меню и сбросить состояние
    - Сохранить все сообщения через SessionManager
    - _Requirements: 3.3, 3.4, 8.2, 8.3, 8.4, 11.1, 11.2_

  - [x] 5.4 Реализовать метод handle_code_word_input
    - Валидировать кодовое слово через PrizeService.validate_code_word
    - Если неверно - отправить сообщение об ошибке и сохранить состояние
    - Если верно - получить данные приза через PrizeService.check_prize
    - Определить тип приза (digital/physical)
    - Вызвать _send_digital_prize или _send_physical_prize_form
    - Сохранить все сообщения через SessionManager
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 11.1, 11.2_

  - [x] 5.5 Реализовать метод _send_digital_prize
    - Отправить поздравительное сообщение с промокодом
    - Отправить инструкцию по использованию промокода
    - Отметить приз как полученный через PrizeService.mark_prize_claimed
    - Отобразить главное меню
    - Сбросить FSM состояние
    - Сохранить все сообщения через SessionManager
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 11.1, 11.2_

  - [x] 5.6 Реализовать метод _send_physical_prize_form
    - Отправить инструкцию по заполнению формы доставки
    - Отправить WebApp кнопку с prize_id
    - Установить состояние waiting_for_delivery_data
    - Отметить приз как полученный через PrizeService.mark_prize_claimed
    - Сохранить все сообщения через SessionManager
    - _Requirements: 7.1, 7.2, 7.3, 11.1, 11.2_

  - [x] 5.7 Написать unit тесты для PrizeFlowHandler
    - Тест для start_prize_flow с пользователем не в таблице
    - Тест для start_prize_flow с пользователем без GDPR согласия
    - Тест для start_prize_flow с пользователем с GDPR согласием
    - Тест для handle_consent_response с кнопкой "Согласен"
    - Тест для handle_consent_response с кнопкой "Назад"
    - Тест для handle_code_word_input с неверным кодовым словом
    - Тест для handle_code_word_input с верным кодовым словом (digital)
    - Тест для handle_code_word_input с верным кодовым словом (physical)
    - Тест для _send_digital_prize с проверкой всех шагов
    - Тест для _send_physical_prize_form с проверкой WebApp кнопки
    - _Requirements: 2.1, 2.4, 3.3, 3.4, 5.3, 5.5, 6.1, 7.1_

  - [x] 5.8 Написать property тест для user not found response
    - **Property 2: User Not Found Response**
    - **Validates: Requirements 2.4, 2.5, 2.6**
    - Проверить, что для любого telegram_id не в таблице отправляется корректное сообщение

  - [x] 5.9 Написать property тест для unlimited code word attempts
    - **Property 12: Unlimited Code Word Attempts**
    - **Validates: Requirements 5.7**
    - Проверить, что система позволяет неограниченное количество попыток ввода кодового слова

- [x] 6. Checkpoint - Проверка Prize Flow Handler
  - Убедиться, что все методы PrizeFlowHandler работают корректно
  - Убедиться, что все тесты проходят
  - Спросить пользователя, если возникли вопросы

- [x] 7. Обновление CommonHandler
  - [x] 7.1 Обновить метод handle_start в CommonHandler
    - Изменить текст приветствия (убрать слово "бот")
    - Добавить отображение главного меню через get_main_menu_keyboard()
    - Сохранить сообщение через SessionManager
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.7, 10.8_

  - [x] 7.2 Написать unit тест для обновлённого handle_start
    - Тест для проверки текста приветствия (отсутствие слова "бот")
    - Тест для проверки отображения главного меню
    - Тест для проверки сохранения сообщения через SessionManager
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 7.3 Написать property тест для main menu text constraint
    - **Property 23: Main Menu Text Constraint**
    - **Validates: Requirements 1.4**
    - Проверить, что текст главного меню не содержит слово "бот"

- [x] 8. Обновление DeliveryHandler
  - [x] 8.1 Обновить метод handle_delivery_data в DeliveryHandler
    - Добавить отображение главного меню после сохранения данных
    - Добавить сброс FSM состояния через state.clear()
    - Сохранить подтверждающее сообщение через SessionManager
    - _Requirements: 7.9, 7.10, 7.11, 10.4_

  - [x] 8.2 Написать unit тест для обновлённого handle_delivery_data
    - Тест для проверки сохранения данных доставки
    - Тест для проверки отображения главного меню
    - Тест для проверки сброса FSM состояния
    - Тест для проверки отправки подтверждающего сообщения
    - _Requirements: 7.8, 7.9, 7.10, 7.11_

  - [x] 8.3 Написать property тест для delivery data persistence
    - **Property 17: Delivery Data Persistence**
    - **Validates: Requirements 7.8**
    - Проверить round-trip consistency для данных доставки

- [x] 9. Интеграция в main.py
  - [x] 9.1 Зарегистрировать PrizeFlowHandler в диспетчере
    - Создать экземпляр PrizeFlowHandler с зависимостями
    - Зарегистрировать обработчик для кнопки "🎁 Получить приз"
    - Зарегистрировать обработчик для состояния waiting_for_consent
    - Зарегистрировать обработчик для состояния waiting_for_code_word
    - Зарегистрировать обработчик для состояния waiting_for_delivery_data
    - _Requirements: 10.6_

  - [x] 9.2 Настроить роутинг для кнопок и состояний
    - Добавить фильтр для текста кнопки "🎁 Получить приз"
    - Добавить фильтр для состояния waiting_for_consent
    - Добавить фильтр для состояния waiting_for_code_word
    - Добавить фильтр для состояния waiting_for_delivery_data
    - _Requirements: 4.4_

  - [x] 9.3 Написать интеграционные тесты для Prize Flow
    - Тест для полного флоу получения цифрового приза
    - Тест для полного флоу получения физического приза
    - Тест для флоу с отменой через кнопку "Назад"
    - Тест для флоу с пользователем не в таблице
    - Тест для флоу с неверным кодовым словом и повторной попыткой
    - _Requirements: 2.1, 3.3, 5.3, 6.1, 7.1, 8.2_

  - [x] 9.4 Написать property тест для FSM state reset on completion
    - **Property 19: FSM State Reset on Completion**
    - **Validates: Requirements 4.5, 6.5, 7.11, 8.3**
    - Проверить, что FSM состояние сбрасывается при любом завершении флоу

  - [x] 9.5 Написать property тест для main menu display on completion
    - **Property 20: Main Menu Display on Completion**
    - **Validates: Requirements 2.6, 6.4, 7.10, 8.2**
    - Проверить, что главное меню отображается при любом завершении флоу

- [ ] 10. Checkpoint - Финальная проверка
  - Убедиться, что все компоненты интегрированы корректно
  - Убедиться, что все unit и property тесты проходят
  - Убедиться, что интеграционные тесты проходят
  - Спросить пользователя, если возникли вопросы

- [ ] 11. Обработка ошибок и логирование
  - [x] 11.1 Добавить обработку DatabaseUnavailableError во всех handlers
    - Добавить try-except блоки для всех вызовов PrizeService
    - Отправлять сообщение "Сервис временно недоступен" при ошибке
    - Отображать главное меню и сбрасывать состояние
    - Логировать ошибку с контекстом
    - _Requirements: 12.1, 12.5_

  - [x] 11.2 Добавить обработку MissingPromoCodeError
    - Добавить try-except для выдачи цифрового приза
    - Отправлять сообщение "Произошла ошибка. Обратитесь в поддержку"
    - Отображать главное меню и сбрасывать состояние
    - Логировать ошибку с контекстом
    - _Requirements: 12.2, 12.5_

  - [x] 11.3 Добавить валидацию входных данных в FSM состояниях
    - Проверять корректность текста в waiting_for_code_word
    - Проверять корректность кнопок в waiting_for_consent
    - Отправлять подсказки при некорректных данных
    - _Requirements: 12.4_

  - [x] 11.4 Добавить логирование всех ключевых операций
    - Логировать начало prize_flow с telegram_id и session_id
    - Логировать сохранение GDPR согласия с timestamp
    - Логировать валидацию кодового слова с результатом
    - Логировать выдачу призов с типом и данными
    - Логировать все ошибки с полным контекстом
    - _Requirements: 12.5, Security 3_

  - [x] 11.5 Написать unit тесты для обработки ошибок
    - Тест для DatabaseUnavailableError в start_prize_flow
    - Тест для DatabaseUnavailableError в handle_consent_response
    - Тест для DatabaseUnavailableError в handle_code_word_input
    - Тест для MissingPromoCodeError в _send_digital_prize
    - Тест для валидации входных данных в каждом состоянии
    - _Requirements: 12.1, 12.2, 12.4_

- [x] 12. Security и валидация
  - [x] 12.1 Добавить валидацию prize_id из WebApp
    - Реализовать validate_prize_id в PrizeService
    - Проверять, что prize_id принадлежит пользователю
    - Добавить обработку невалидного prize_id
    - _Requirements: Security 2_

  - [x] 12.2 Добавить проверку доступа к промокодам
    - Убедиться, что пользователь видит только свой промокод
    - Добавить логирование попыток доступа к промокодам
    - _Requirements: Security 1, Security 3_

  - [x] 12.3 Написать unit тесты для security проверок
    - Тест для validate_prize_id с валидным и невалидным prize_id
    - Тест для проверки, что пользователь не видит чужие промокоды
    - Тест для логирования попыток доступа
    - _Requirements: Security 1, Security 2, Security 3_

- [-] 13. Финальное тестирование и документация
  - [ ] 13.1 Запустить все тесты и проверить coverage
    - Запустить pytest tests/ для всех тестов
    - Запустить pytest --cov для проверки покрытия
    - Убедиться, что coverage >= 90% для handlers и services
    - Исправить найденные ошибки
    - _Requirements: Testing Coverage Goals_

  - [ ] 13.2 Провести ручное тестирование полного флоу
    - Протестировать получение цифрового приза
    - Протестировать получение физического приза
    - Протестировать отмену через кнопку "Назад"
    - Протестировать обработку ошибок
    - Протестировать неверное кодовое слово
    - _Requirements: All user stories_

  - [ ] 13.3 Подготовить миграционный скрипт
    - Создать скрипт для применения миграции на production
    - Создать rollback скрипт на случай проблем
    - Протестировать миграцию на staging окружении
    - _Requirements: Migration Strategy_

## Notes

- Все тесты (unit, property-based, integration) являются обязательными
- Каждая задача ссылается на конкретные requirements для трассируемости
- Checkpoint задачи обеспечивают инкрементальную валидацию
- Property тесты валидируют универсальные свойства корректности
- Unit тесты валидируют конкретные примеры и edge cases
- Все операции с БД асинхронные для соответствия performance requirements
- Логирование всех операций для соответствия security requirements
