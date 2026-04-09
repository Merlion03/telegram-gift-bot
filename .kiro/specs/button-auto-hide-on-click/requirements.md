# Requirements Document

## Introduction

Данная спецификация описывает функциональность автоматического скрытия inline-кнопок в Telegram боте после их нажатия. В текущей реализации при нажатии на inline-кнопки (такие как "Получить приз", "Согласен", "Назад") они остаются видимыми в сообщении, что создаёт путаницу для пользователя и позволяет повторное нажатие. Требуется реализовать механизм автоматического удаления клавиатуры из сообщения после обработки callback-запроса.

## Glossary

- **Inline_Button**: Кнопка, встроенная в сообщение Telegram (InlineKeyboardButton), которая отправляет callback_query при нажатии
- **Callback_Handler**: Обработчик callback_query от inline-кнопок в aiogram
- **Reply_Markup**: Клавиатура (InlineKeyboardMarkup), прикреплённая к сообщению
- **Bot_Message**: Сообщение, отправленное ботом пользователю
- **Edit_Message_API**: Метод Telegram Bot API для редактирования существующих сообщений (edit_message_reply_markup)
- **Prize_Flow**: Процесс получения приза, включающий проверку пользователя, GDPR согласие и валидацию кодового слова
- **Main_Menu_Button**: Inline-кнопка "Получить приз" в главном меню (callback_data="get_prize")
- **Consent_Buttons**: Inline-кнопки "Согласен" и "Назад" для GDPR согласия (callback_data="consent_agree", "consent_back")
- **Delivery_Action_Buttons**: Inline-кнопки для действий с данными доставки (callback_data="confirm_delivery:{prize_id}")

## Requirements

### Requirement 1: Автоматическое удаление клавиатуры после нажатия кнопки "Получить приз"

**User Story:** Как пользователь, я хочу, чтобы кнопка "Получить приз" исчезала после нажатия, чтобы избежать повторных нажатий и путаницы

#### Acceptance Criteria

1. WHEN пользователь нажимает на inline-кнопку "Получить приз" (callback_data="get_prize"), THE Callback_Handler SHALL удалить Reply_Markup из Bot_Message
2. THE Callback_Handler SHALL использовать Edit_Message_API для удаления клавиатуры до начала обработки Prize_Flow
3. WHEN клавиатура успешно удалена, THE Callback_Handler SHALL продолжить обработку callback-запроса
4. IF удаление клавиатуры завершается ошибкой, THEN THE Callback_Handler SHALL залогировать ошибку и продолжить обработку callback-запроса

### Requirement 2: Автоматическое удаление клавиатуры после нажатия кнопок GDPR согласия

**User Story:** Как пользователь, я хочу, чтобы кнопки "Согласен" и "Назад" исчезали после нажатия, чтобы интерфейс оставался чистым

#### Acceptance Criteria

1. WHEN пользователь нажимает на inline-кнопку "Согласен" (callback_data="consent_agree"), THE Callback_Handler SHALL удалить Reply_Markup из Bot_Message
2. WHEN пользователь нажимает на inline-кнопку "Назад" (callback_data="consent_back"), THE Callback_Handler SHALL удалить Reply_Markup из Bot_Message
3. THE Callback_Handler SHALL удалить клавиатуру до отправки следующего сообщения пользователю
4. IF удаление клавиатуры завершается ошибкой, THEN THE Callback_Handler SHALL залогировать ошибку и продолжить обработку

### Requirement 3: Автоматическое удаление кнопки WebApp после отправки данных доставки

**User Story:** Как пользователь, я хочу, чтобы кнопка "📦 Указать данные доставки" исчезала после того, как я отправил данные через WebApp, чтобы не было путаницы и дублирования интерфейса

#### Acceptance Criteria

1. WHEN DeliveryHandler получает web_app_data с данными доставки, THE DeliveryHandler SHALL удалить Reply_Markup из сообщения с WebApp кнопкой
2. THE DeliveryHandler SHALL удалить клавиатуру в методе handle_delivery_data() после успешной валидации prize_id
3. THE DeliveryHandler SHALL удалить клавиатуру ДО вызова NotificationService.send_delivery_notifications()
4. THE DeliveryHandler SHALL удалить клавиатуру ДО отправки подтверждающих сообщений пользователю
5. IF удаление клавиатуры завершается ошибкой, THEN THE DeliveryHandler SHALL залогировать ошибку и продолжить обработку данных доставки

### Requirement 4: Универсальный механизм удаления клавиатур

**User Story:** Как разработчик, я хочу иметь переиспользуемый механизм удаления клавиатур, чтобы легко применять его к новым inline-кнопкам

#### Acceptance Criteria

1. THE Bot SHALL предоставить утилитную функцию для удаления Reply_Markup из Bot_Message
2. THE утилитная функция SHALL принимать callback_query в качестве параметра
3. THE утилитная функция SHALL использовать Edit_Message_API для удаления клавиатуры
4. THE утилитная функция SHALL обрабатывать исключения и возвращать статус успеха/неудачи
5. THE утилитная функция SHALL логировать все попытки удаления клавиатуры с указанием telegram_id и message_id

### Requirement 5: Обработка ошибок при удалении клавиатуры

**User Story:** Как разработчик, я хочу, чтобы ошибки при удалении клавиатуры не прерывали основной процесс, чтобы пользователь мог продолжить работу

#### Acceptance Criteria

1. IF Edit_Message_API возвращает ошибку "message is not modified", THEN THE Bot SHALL считать операцию успешной
2. IF Edit_Message_API возвращает ошибку "message to edit not found", THEN THE Bot SHALL залогировать предупреждение и продолжить обработку
3. IF Edit_Message_API возвращает ошибку "message can't be edited", THEN THE Bot SHALL залогировать предупреждение и продолжить обработку
4. FOR ALL других ошибок Edit_Message_API, THE Bot SHALL залогировать ошибку с полным контекстом и продолжить обработку
5. THE Bot SHALL НЕ прерывать Prize_Flow при любых ошибках удаления клавиатуры

### Requirement 6: Логирование операций удаления клавиатуры

**User Story:** Как администратор, я хочу видеть логи удаления клавиатур, чтобы отслеживать работу системы и диагностировать проблемы

#### Acceptance Criteria

1. WHEN клавиатура успешно удалена, THE Bot SHALL залогировать событие с уровнем INFO
2. WHEN удаление клавиатуры завершается ошибкой, THE Bot SHALL залогировать событие с уровнем WARNING или ERROR
3. THE лог-запись SHALL содержать telegram_id, message_id, callback_data и статус операции
4. THE лог-запись SHALL содержать текст ошибки, если операция завершилась неудачей

### Requirement 7: Совместимость с существующими обработчиками

**User Story:** Как разработчик, я хочу, чтобы новый механизм не нарушал работу существующих обработчиков, чтобы избежать регрессии

#### Acceptance Criteria

1. THE механизм удаления клавиатуры SHALL быть интегрирован в существующие Callback_Handler без изменения их сигнатур
2. THE существующие тесты Prize_Flow SHALL продолжать проходить после интеграции
3. THE механизм SHALL работать с callback.answer() без конфликтов
4. THE механизм SHALL НЕ влиять на отправку новых сообщений с клавиатурами

### Requirement 8: Применение к кнопкам завершения диалога с поддержкой

**User Story:** Как пользователь, я хочу, чтобы кнопка "Завершить диалог" исчезала после нажатия, чтобы интерфейс оставался чистым

#### Acceptance Criteria

1. WHEN пользователь нажимает на inline-кнопку "Завершить диалог" (callback_data="support_end"), THE Callback_Handler SHALL удалить Reply_Markup из Bot_Message
2. THE Callback_Handler SHALL удалить клавиатуру до отправки подтверждающего сообщения
3. IF удаление клавиатуры завершается ошибкой, THEN THE Callback_Handler SHALL залогировать ошибку и продолжить обработку
