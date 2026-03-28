# Requirements Document

## Введение

Функциональность отслеживания отправки запроса на получение приза и отправки уведомлений в Telegram чат. После того, как пользователь заполнил форму доставки и подтвердил отправку данных, система должна отследить момент отправки запроса и отправить в чат два последовательных сообщения: подтверждение получения данных и возврат в главное меню.

## Глоссарий

- **Delivery_Handler**: Обработчик данных доставки из WebApp, который принимает и сохраняет данные доставки физических призов
- **Request_Tracking**: Механизм отслеживания момента отправки запроса на получение приза
- **Confirmation_Message**: Сообщение "Данные получили, скоро отправим приз", отправляемое после успешной обработки запроса
- **Main_Menu_Message**: Сообщение с главным меню и кнопкой «Получить приз», возвращающее пользователя в начальное состояние
- **Bot**: Telegram бот, обрабатывающий запросы пользователей
- **WebApp**: Telegram WebApp с формой доставки
- **Prize_Request**: Запрос на получение приза, содержащий данные доставки

## Требования

### Requirement 1: Отслеживание момента отправки запроса

**User Story:** Как система, я хочу отслеживать момент отправки запроса на получение приза, чтобы своевременно уведомить пользователя о получении данных

#### Acceptance Criteria

1. WHEN пользователь подтверждает отправку данных доставки в WebApp, THE Delivery_Handler SHALL зафиксировать момент получения запроса
2. WHEN данные доставки успешно сохранены в Google Sheets, THE Delivery_Handler SHALL инициировать отправку уведомлений в чат
3. WHEN данные доставки успешно сохранены в PostgreSQL, THE Delivery_Handler SHALL продолжить процесс отправки уведомлений
4. IF сохранение данных в Google Sheets завершилось ошибкой, THEN THE Delivery_Handler SHALL прервать процесс отправки уведомлений

### Requirement 2: Отправка подтверждающего сообщения

**User Story:** Как пользователь, я хочу получить подтверждение, что мои данные получены, чтобы быть уверенным в успешной отправке

#### Acceptance Criteria

1. WHEN данные доставки успешно сохранены, THE Bot SHALL отправить Confirmation_Message в чат пользователя
2. THE Confirmation_Message SHALL содержать текст "Данные получили, скоро отправим приз"
3. THE Bot SHALL отправить Confirmation_Message до отправки Main_Menu_Message
4. THE Confirmation_Message SHALL быть отправлено в течение 1 секунды после сохранения данных
5. IF отправка Confirmation_Message завершилась ошибкой, THEN THE Bot SHALL залогировать ошибку и продолжить отправку Main_Menu_Message

### Requirement 3: Отправка сообщения с главным меню

**User Story:** Как пользователь, я хочу вернуться в главное меню после отправки данных, чтобы продолжить взаимодействие с ботом

#### Acceptance Criteria

1. WHEN Confirmation_Message успешно отправлено, THE Bot SHALL отправить Main_Menu_Message в чат пользователя
2. THE Main_Menu_Message SHALL содержать кнопку «Получить приз»
3. THE Main_Menu_Message SHALL использовать существующую клавиатуру главного меню (get_main_menu_keyboard)
4. THE Bot SHALL отправить Main_Menu_Message в течение 1 секунды после отправки Confirmation_Message
5. THE Main_Menu_Message SHALL возвращать пользователя в начальное состояние взаимодействия с ботом

### Requirement 4: Последовательность отправки сообщений

**User Story:** Как пользователь, я хочу получать сообщения в правильной последовательности, чтобы понимать статус обработки моего запроса

#### Acceptance Criteria

1. THE Bot SHALL отправить Confirmation_Message перед Main_Menu_Message
2. THE Bot SHALL гарантировать порядок доставки сообщений (первое Confirmation_Message, затем Main_Menu_Message)
3. WHEN оба сообщения отправлены, THE Bot SHALL завершить обработку запроса
4. THE Bot SHALL не отправлять дублирующие сообщения при повторной обработке того же запроса

### Requirement 5: Логирование событий отправки

**User Story:** Как разработчик, я хочу отслеживать события отправки уведомлений, чтобы диагностировать проблемы и анализировать поведение системы

#### Acceptance Criteria

1. WHEN запрос на получение приза получен, THE Delivery_Handler SHALL залогировать событие "request_received" с telegram_id и prize_id
2. WHEN Confirmation_Message отправлено, THE Bot SHALL залогировать событие "confirmation_message_sent" с telegram_id
3. WHEN Main_Menu_Message отправлено, THE Bot SHALL залогировать событие "main_menu_message_sent" с telegram_id
4. IF отправка любого сообщения завершилась ошибкой, THEN THE Bot SHALL залогировать событие с уровнем "error" и деталями ошибки
5. THE Bot SHALL использовать структурированное логирование с полями telegram_id, prize_id, event_type, timestamp

### Requirement 6: Обработка ошибок отправки сообщений

**User Story:** Как система, я хочу корректно обрабатывать ошибки отправки сообщений, чтобы не блокировать пользователя и сохранить данные

#### Acceptance Criteria

1. IF отправка Confirmation_Message завершилась ошибкой, THEN THE Bot SHALL продолжить отправку Main_Menu_Message
2. IF отправка Main_Menu_Message завершилась ошибкой, THEN THE Bot SHALL залогировать ошибку и завершить обработку
3. WHEN произошла ошибка отправки сообщения, THE Bot SHALL не откатывать сохранённые данные доставки
4. THE Bot SHALL использовать существующий механизм логирования ошибок (utils.logging_config)

### Requirement 7: Интеграция с существующим процессом обработки

**User Story:** Как разработчик, я хочу интегрировать новую функциональность без нарушения существующего процесса, чтобы сохранить стабильность системы

#### Acceptance Criteria

1. THE Delivery_Handler SHALL сохранять существующую логику сохранения данных в Google Sheets и PostgreSQL
2. THE Delivery_Handler SHALL отправлять новые уведомления вместо существующего сообщения "✅ Спасибо! Ваши данные успешно сохранены"
3. THE Delivery_Handler SHALL сохранять существующую логику сброса FSM состояния
4. THE Delivery_Handler SHALL сохранять существующую логику сохранения ответов бота через session_manager
5. THE Delivery_Handler SHALL не изменять существующие методы валидации и обработки ошибок

### Requirement 8: Сохранение сообщений в session_manager

**User Story:** Как система поддержки, я хочу видеть все отправленные сообщения в истории сессии, чтобы отслеживать взаимодействие с пользователем

#### Acceptance Criteria

1. WHEN Confirmation_Message отправлено, THE Bot SHALL сохранить его через session_manager.save_bot_message
2. WHEN Main_Menu_Message отправлено, THE Bot SHALL сохранить его через session_manager.save_bot_message
3. WHERE session_manager доступен, THE Bot SHALL сохранять оба сообщения с соответствующим session_id
4. IF session_manager недоступен или session_id отсутствует, THEN THE Bot SHALL продолжить отправку сообщений без сохранения в историю
5. IF сохранение в session_manager завершилось ошибкой, THEN THE Bot SHALL залогировать ошибку и продолжить выполнение

### Requirement 9: Удаление старого сообщения об успехе

**User Story:** Как разработчик, я хочу заменить старое сообщение новыми уведомлениями, чтобы избежать дублирования информации

#### Acceptance Criteria

1. THE Delivery_Handler SHALL удалить отправку существующего сообщения "✅ Спасибо! Ваши данные успешно сохранены. Мы свяжемся с вами для уточнения деталей доставки."
2. THE Delivery_Handler SHALL заменить его на последовательную отправку Confirmation_Message и Main_Menu_Message
3. THE Delivery_Handler SHALL сохранить отправку главного меню (get_main_menu_keyboard) в Main_Menu_Message
4. THE Delivery_Handler SHALL не изменять текст сообщений об ошибках
