# Implementation Plan: Button Auto-Hide on Click

## Overview

Реализация механизма автоматического удаления inline-кнопок в Telegram боте после их нажатия. Функциональность включает создание утилитного модуля keyboard_utils.py и интеграцию в существующие обработчики (PrizeFlowHandler, DeliveryHandler, SupportHandler) с полным покрытием тестами.

## Tasks

- [x] 1. Создать утилитный модуль keyboard_utils.py
  - [x] 1.1 Реализовать функцию remove_inline_keyboard()
    - Принимает callback: CallbackQuery и logger: Optional[structlog.BoundLogger]
    - Вызывает callback.message.edit_reply_markup(reply_markup=None)
    - Обрабатывает ошибки: "message is not modified" (успех), "message to edit not found" (WARNING), "message can't be edited" (WARNING), другие ошибки (ERROR)
    - Возвращает bool: True при успехе, False при ошибке
    - Логирует все операции с полным контекстом (telegram_id, message_id, callback_data, success, error)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_
  
  - [x] 1.2 Реализовать функцию remove_inline_keyboard_by_id()
    - Принимает bot: Bot, chat_id: int, message_id: int, logger: Optional[structlog.BoundLogger]
    - Вызывает bot.edit_message_reply_markup(chat_id=chat_id, message_id=message_id, reply_markup=None)
    - Обрабатывает те же ошибки, что и remove_inline_keyboard()
    - Возвращает bool: True при успехе, False при ошибке
    - Логирует все операции с полным контекстом
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 2. Интегрировать remove_inline_keyboard в PrizeFlowHandler
  - [x] 2.1 Добавить вызов remove_inline_keyboard в handle_get_prize_callback()
    - Импортировать remove_inline_keyboard из keyboard_utils
    - Вызвать remove_inline_keyboard(callback, logger) в начале метода (до start_prize_flow_from_callback)
    - Убедиться, что обработка продолжается независимо от результата удаления
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 2.2 Добавить вызов remove_inline_keyboard в handle_consent_callback()
    - Вызвать remove_inline_keyboard(callback, logger) в начале метода
    - Обработать оба callback_data: "consent_agree" и "consent_back"
    - Убедиться, что удаление происходит до отправки следующего сообщения
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Интегрировать remove_inline_keyboard_by_id в DeliveryHandler
  - [x] 3.1 Модифицировать отправку WebApp кнопки для сохранения message_id
    - В PrizeFlowHandler, где отправляется WebApp кнопка, сохранить message_id в FSM state
    - Использовать ключ 'webapp_message_id' в state data
    - Убедиться, что message_id сохраняется до перехода в состояние ожидания данных доставки
    - _Requirements: 3.1, 3.2_
  
  - [x] 3.2 Добавить удаление клавиатуры в handle_delivery_data()
    - Импортировать remove_inline_keyboard_by_id из keyboard_utils
    - Получить webapp_message_id из FSM state после валидации prize_id
    - Вызвать remove_inline_keyboard_by_id(bot, chat_id, webapp_message_id, logger) если message_id существует
    - Удалить клавиатуру ДО вызова NotificationService.send_delivery_notifications()
    - Убедиться, что обработка продолжается независимо от результата удаления
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Интегрировать remove_inline_keyboard в SupportHandler
  - [x] 4.1 Добавить вызов remove_inline_keyboard в handle_support_end_callback()
    - Импортировать remove_inline_keyboard из keyboard_utils
    - Вызвать remove_inline_keyboard(callback, logger) в начале метода
    - Удалить клавиатуру до отправки подтверждающего сообщения
    - Убедиться, что обработка продолжается независимо от результата удаления
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 5. Checkpoint - Проверка базовой функциональности
  - Убедиться, что все обработчики корректно интегрированы
  - Проверить, что логирование работает
  - Убедиться, что ошибки не прерывают основной процесс
  - Спросить пользователя, если возникли вопросы

- [x] 6. Написать unit тесты для keyboard_utils.py
  - [x] 6.1 Тест успешного удаления клавиатуры (remove_inline_keyboard)
    - Mock callback с клавиатурой
    - Проверить вызов edit_reply_markup(reply_markup=None)
    - Проверить возврат True
    - Проверить INFO лог с полным контекстом
    - _Requirements: 4.3, 4.4, 6.1, 6.3_
  
  - [x] 6.2 Тест обработки "message is not modified"
    - Mock API возвращает TelegramBadRequest с "message is not modified"
    - Проверить возврат True (считается успехом)
    - Проверить INFO лог
    - _Requirements: 5.1, 6.1_
  
  - [x] 6.3 Тест обработки "message to edit not found"
    - Mock API возвращает TelegramBadRequest с "message to edit not found"
    - Проверить возврат False
    - Проверить WARNING лог с текстом ошибки
    - _Requirements: 5.2, 6.2, 6.4_
  
  - [x] 6.4 Тест обработки "message can't be edited"
    - Mock API возвращает TelegramBadRequest с "message can't be edited"
    - Проверить возврат False
    - Проверить WARNING лог с текстом ошибки
    - _Requirements: 5.3, 6.2, 6.4_
  
  - [x] 6.5 Тест обработки неожиданных ошибок
    - Mock API выбрасывает различные исключения (NetworkError, неизвестные TelegramBadRequest)
    - Проверить возврат False
    - Проверить ERROR лог с полным контекстом
    - _Requirements: 5.4, 6.2, 6.4_
  
  - [x] 6.6 Тест успешного удаления клавиатуры по ID (remove_inline_keyboard_by_id)
    - Mock bot.edit_message_reply_markup
    - Проверить вызов с правильными параметрами (chat_id, message_id, reply_markup=None)
    - Проверить возврат True
    - Проверить INFO лог
    - _Requirements: 4.3, 4.4, 6.1, 6.3_
  
  - [x] 6.7 Тест обработки ошибок в remove_inline_keyboard_by_id
    - Mock bot.edit_message_reply_markup выбрасывает различные ошибки
    - Проверить возврат False для всех типов ошибок
    - Проверить корректное логирование
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.2, 6.4_

- [x] 7. Написать property-based тесты (Hypothesis)
  - [x] 7.1 Property 1: Клавиатура удаляется для всех callback'ов
    - **Property 1: Клавиатура удаляется для всех callback-обработчиков**
    - **Validates: Requirements 1.1, 2.1, 2.2, 8.1**
    - Генерировать callback_data из ["get_prize", "consent_agree", "consent_back", "support_end"]
    - Mock callback с различными callback_data
    - Вызвать соответствующий обработчик
    - Проверить вызов edit_reply_markup(reply_markup=None)
    - Минимум 100 итераций
  
  - [x] 7.2 Property 4: Ошибки не прерывают процесс
    - **Property 4: Ошибки удаления не прерывают основной процесс**
    - **Validates: Requirements 1.4, 2.4, 3.5, 5.5, 8.3**
    - Генерировать callback_data и типы ошибок ["not_found", "cant_edit", "network", "unknown"]
    - Mock API выбрасывает различные ошибки
    - Вызвать обработчик
    - Проверить, что последующие операции выполнены (вызовы сервисов, отправка сообщений)
    - Проверить, что исключение не пробросилось
    - Минимум 100 итераций
  
  - [x] 7.3 Property 7: Корректный статус возврата
    - **Property 7: Утилитная функция возвращает корректный статус**
    - **Validates: Requirements 4.4, 5.1**
    - Генерировать результаты API: "success", "not_modified", "not_found", "cant_edit", "other_error"
    - Mock API с различными результатами
    - Вызвать remove_inline_keyboard
    - Проверить: True для success/not_modified, False для остальных
    - Минимум 100 итераций
  
  - [x] 7.4 Property 8: Полный контекст в логах
    - **Property 8: Все операции логируются с полным контекстом**
    - **Validates: Requirements 4.5, 6.3**
    - Генерировать случайные telegram_id, message_id, callback_data
    - Вызвать remove_inline_keyboard
    - Проверить наличие всех полей в лог-записи: telegram_id, message_id, callback_data, success
    - Минимум 100 итераций
  
  - [x] 7.5 Property 9: Уровень логирования соответствует результату
    - **Property 9: Уровень логирования соответствует результату**
    - **Validates: Requirements 6.1, 6.2**
    - Генерировать успешные и неуспешные операции
    - Mock API: успех или ошибка
    - Вызвать remove_inline_keyboard
    - Проверить: INFO для успеха, WARNING/ERROR для ошибки
    - Минимум 100 итераций
  
  - [x] 7.6 Property 13: Независимость операций
    - **Property 13: Удаление старой клавиатуры не влияет на новые сообщения**
    - **Validates: Requirements 7.4**
    - Генерировать old_message_id и список кнопок для новой клавиатуры
    - Удалить клавиатуру из старого сообщения
    - Отправить новое сообщение с клавиатурой
    - Проверить, что новое сообщение содержит клавиатуру
    - Минимум 100 итераций

- [x] 8. Написать интеграционные тесты для обработчиков
  - [x] 8.1 Интеграционный тест PrizeFlowHandler.handle_get_prize_callback
    - Mock callback с callback_data="get_prize"
    - Вызвать handle_get_prize_callback
    - Проверить вызов remove_inline_keyboard в начале метода
    - Проверить продолжение Prize Flow после удаления
    - Проверить вызов callback.answer()
    - _Requirements: 1.1, 1.2, 1.3, 7.3_
  
  - [x] 8.2 Интеграционный тест PrizeFlowHandler.handle_consent_callback
    - Mock callback с callback_data="consent_agree" и "consent_back"
    - Вызвать handle_consent_callback для обоих случаев
    - Проверить вызов remove_inline_keyboard в начале метода
    - Проверить удаление до отправки следующего сообщения
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 8.3 Интеграционный тест DeliveryHandler.handle_delivery_data
    - Mock message с web_app_data
    - Сохранить webapp_message_id в FSM state
    - Вызвать handle_delivery_data
    - Проверить вызов remove_inline_keyboard_by_id с правильными параметрами
    - Проверить удаление ДО вызова NotificationService
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 8.4 Интеграционный тест SupportHandler.handle_support_end_callback
    - Mock callback с callback_data="support_end"
    - Вызвать handle_support_end_callback
    - Проверить вызов remove_inline_keyboard в начале метода
    - Проверить удаление до отправки подтверждающего сообщения
    - _Requirements: 8.1, 8.2_
  
  - [x] 8.5 Интеграционный тест: ошибки не прерывают Prize Flow
    - Mock API выбрасывает ошибку при удалении клавиатуры
    - Вызвать handle_get_prize_callback
    - Проверить, что Prize Flow продолжается (вызовы сервисов, отправка сообщений)
    - Проверить логирование ошибки
    - _Requirements: 1.4, 5.5_

- [ ] 9. Регрессионное тестирование
  - [ ] 9.1 Запустить все существующие тесты PrizeFlowHandler
    - Выполнить pytest для test_prize_flow_handler.py
    - Убедиться, что все тесты проходят
    - _Requirements: 7.2_
  
  - [ ] 9.2 Запустить все существующие тесты DeliveryHandler
    - Выполнить pytest для test_delivery_handler.py
    - Убедиться, что все тесты проходят
    - _Requirements: 7.2_
  
  - [ ] 9.3 Запустить все существующие тесты SupportHandler
    - Выполнить pytest для test_support_handler.py
    - Убедиться, что все тесты проходят
    - _Requirements: 7.2_

- [ ] 10. Final checkpoint - Финальная проверка
  - Убедиться, что все тесты проходят (unit, property-based, интеграционные, регрессионные)
  - Проверить покрытие кода (целевое: 90%+ для нового кода)
  - Убедиться, что логирование работает корректно
  - Проверить, что все требования покрыты
  - Спросить пользователя, если возникли вопросы

## Notes

- Задачи, помеченные `*`, являются опциональными и могут быть пропущены для быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Checkpoint'ы обеспечивают инкрементальную валидацию
- Property-based тесты проверяют универсальные свойства корректности
- Unit тесты проверяют конкретные примеры и edge cases
- Интеграционные тесты проверяют взаимодействие компонентов
- Регрессионное тестирование гарантирует отсутствие поломок в существующем коде
