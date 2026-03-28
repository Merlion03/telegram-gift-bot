# Implementation Plan: Request Tracking and Chat Notifications

## Overview

Реализация функциональности отслеживания отправки запроса на получение приза и отправки последовательных уведомлений в Telegram чат. Система заменяет текущее одиночное сообщение об успехе на два последовательных сообщения: подтверждение получения данных и возврат в главное меню.

## Tasks

- [x] 1. Создать файл констант сообщений
  - Создать новый файл `telegram-bot/constants/messages.py`
  - Определить константы для текстов сообщений о доставке
  - Определить константы для сообщений об ошибках (для справки)
  - _Requirements: 2.2, 3.2, 9.1_

- [x] 2. Реализовать NotificationService
  - [x] 2.1 Создать data class NotificationResult
    - Создать файл `telegram-bot/services/notification_service.py`
    - Реализовать data class NotificationResult с полями: confirmation_sent, main_menu_sent, both_sent
    - Добавить property at_least_one_sent
    - _Requirements: 2.1, 3.1, 4.3_
  
  - [x] 2.2 Реализовать класс NotificationService
    - Реализовать конструктор с параметрами bot и session_manager (опционально)
    - Добавить инициализацию logger
    - _Requirements: 7.1, 7.2_
  
  - [x] 2.3 Реализовать метод send_delivery_notifications
    - Реализовать основной метод для отправки последовательных уведомлений
    - Вызывать _send_confirmation_message и _send_main_menu_message последовательно
    - Логировать событие delivery_notifications_sent с результатами
    - Возвращать NotificationResult
    - _Requirements: 1.2, 1.3, 2.3, 4.1, 4.2, 4.3_
  
  - [x] 2.4 Реализовать метод _send_confirmation_message
    - Отправлять подтверждающее сообщение с текстом из констант
    - Обрабатывать ошибки отправки с graceful degradation
    - Логировать события confirmation_message_sent или confirmation_message_failed
    - Сохранять сообщение через session_manager при наличии session_id
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 5.2, 6.1, 8.1, 8.3_
  
  - [x] 2.5 Реализовать метод _send_main_menu_message
    - Отправлять сообщение с главным меню используя get_main_menu_keyboard
    - Обрабатывать ошибки отправки
    - Логировать события main_menu_message_sent или main_menu_message_failed
    - Сохранять сообщение через session_manager при наличии session_id
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.3, 6.2, 8.2, 8.3_
  
  - [x] 2.6 Реализовать метод _save_to_session_manager
    - Сохранять текст сообщения через session_manager.save_bot_message
    - Обрабатывать ошибки сохранения без прерывания основного процесса
    - Логировать событие session_manager_save_failed при ошибке
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

- [x] 2.7 Написать property-тесты для NotificationService
  - **Property 4: Отправка подтверждающего сообщения**
  - **Validates: Requirements 2.1, 2.2**
  
- [x] 2.8 Написать property-тесты для порядка отправки
  - **Property 5: Порядок отправки сообщений**
  - **Validates: Requirements 2.3, 4.1, 4.2**
  
- [x] 2.9 Написать property-тесты для graceful degradation
  - **Property 7: Graceful degradation при ошибке первого сообщения**
  - **Validates: Requirements 2.5, 6.1**
  
- [x] 2.10 Написать property-тесты для главного меню
  - **Property 8: Отправка сообщения с главным меню**
  - **Validates: Requirements 3.1, 3.2, 3.3**
  
- [x] 2.11 Написать property-тесты для логирования
  - **Property 11: Логирование отправленных сообщений**
  - **Property 12: Логирование ошибок отправки**
  - **Property 13: Структурированное логирование**
  - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
  
- [x] 2.12 Написать property-тесты для session_manager
  - **Property 16: Сохранение сообщений в session_manager**
  - **Property 17: Работа без session_manager**
  - **Property 18: Обработка ошибок session_manager**
  - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
  
- [x] 2.13 Написать unit-тесты для NotificationService
  - Тест успешной отправки обоих уведомлений
  - Тест ошибки отправки первого сообщения
  - Тест ошибки отправки второго сообщения
  - Тест работы без session_manager
  - Тест содержимого подтверждающего сообщения
  - Тест наличия кнопки "🎁 Получить приз" в главном меню
  - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2, 6.1, 6.2, 8.4_

- [x] 3. Checkpoint - Убедиться что NotificationService работает корректно
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Интегрировать NotificationService в DeliveryHandler
  - [x] 4.1 Добавить NotificationService в конструктор DeliveryHandler
    - Добавить параметр notification_service в __init__
    - Сохранить ссылку на notification_service как атрибут класса
    - _Requirements: 7.2, 7.3_
  
  - [x] 4.2 Модифицировать метод handle_delivery_data
    - Удалить блок отправки старого сообщения "✅ Спасибо! Ваши данные успешно сохранены..."
    - Добавить вызов notification_service.send_delivery_notifications после успешного сохранения в Sheets
    - Логировать событие request_received в начале обработки
    - Логировать результат отправки уведомлений
    - Сохранить существующую логику сброса FSM состояния
    - _Requirements: 1.1, 1.2, 5.1, 7.2, 7.3, 7.4, 9.1, 9.2_
  
  - [x] 4.3 Обновить инициализацию DeliveryHandler в main.py
    - Создать экземпляр NotificationService с bot и session_manager
    - Передать notification_service в конструктор DeliveryHandler
    - _Requirements: 7.2_

- [x] 4.4 Написать property-тесты для интеграции
  - **Property 1: Логирование получения запроса**
  - **Property 2: Инициация уведомлений после успешного сохранения**
  - **Property 3: Прерывание при ошибке Sheets**
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 5.1**
  
- [x] 4.5 Написать property-тесты для FSM и завершения
  - **Property 9: Сброс FSM состояния**
  - **Property 10: Завершение обработки**
  - **Validates: Requirements 3.5, 4.3, 7.3**
  
- [x] 4.6 Написать property-тесты для сохранения данных
  - **Property 14: Обработка ошибки второго сообщения**
  - **Property 15: Сохранение данных при ошибке отправки**
  - **Validates: Requirements 6.2, 6.3**
  
- [x] 4.7 Написать unit-тесты для интеграции DeliveryHandler
  - Тест полного flow с успешной отправкой уведомлений
  - Тест прерывания при ошибке Sheets
  - Тест продолжения при ошибке PostgreSQL
  - Тест сброса FSM состояния после отправки уведомлений
  - Тест отсутствия дублирующих сообщений
  - _Requirements: 1.2, 1.3, 1.4, 3.5, 4.4, 7.1, 7.3_

- [x] 4.8 Написать property-тест для производительности
  - **Property 6: Производительность отправки уведомлений**
  - **Validates: Requirements 2.4, 3.4**

- [x] 5. Final checkpoint - Убедиться что все тесты проходят
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Регрессионное тестирование
  - [x] 6.1 Проверить существующие тесты DeliveryHandler
    - Запустить существующие unit-тесты для DeliveryHandler
    - Запустить существующие property-тесты для DeliveryHandler
    - Убедиться что все тесты проходят или обновить их при необходимости
    - _Requirements: 7.1, 7.4, 7.5_
  
  - [x] 6.2 Проверить интеграционные тесты
    - Запустить интеграционные тесты prize flow
    - Убедиться что процесс получения приза работает end-to-end
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Final checkpoint - Завершение реализации
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Все задачи обязательны для выполнения, включая все тесты
- Каждая задача ссылается на конкретные требования для отслеживаемости
- Checkpoints обеспечивают инкрементальную валидацию
- Property-тесты валидируют универсальные свойства корректности
- Unit-тесты валидируют конкретные примеры и граничные случаи
- NotificationService реализуется как отдельный модуль для соблюдения принципа единственной ответственности
- Graceful degradation гарантирует, что ошибки не блокируют пользователя
- Все изменения сохраняют обратную совместимость с существующей функциональностью
