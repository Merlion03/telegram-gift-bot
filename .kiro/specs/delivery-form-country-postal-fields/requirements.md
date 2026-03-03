# Requirements Document

## Introduction

Данный документ описывает требования к добавлению двух новых полей в форму доставки Telegram Web App: "Страна" и "Почтовый индекс". Эти поля расширяют существующий раздел "Адрес доставки" для более полного сбора информации о месте доставки физических призов.

## Glossary

- **DeliveryForm**: React компонент формы доставки в Next.js приложении, отображаемый в Telegram Web App
- **API_Endpoint**: REST API endpoint `/api/delivery` для обработки данных формы доставки
- **GoogleSheetsService**: Python сервис для сохранения данных доставки в Google Sheets
- **Validation_Schema**: Zod схема валидации данных формы на фронтенде и бэкенде
- **Address_Section**: Раздел формы "Адрес доставки", содержащий поля: Город, Улица, Дом, Квартира
- **Country_Field**: Новое поле "Страна" для указания страны доставки
- **Postal_Code_Field**: Новое поле "Почтовый индекс" для указания почтового индекса

## Requirements

### Requirement 1: Добавление поля "Страна"

**User Story:** Как пользователь, я хочу указать страну доставки, чтобы обеспечить корректную доставку приза в любую страну.

#### Acceptance Criteria

1. THE DeliveryForm SHALL отображать поле "Страна" в разделе Address_Section
2. THE Country_Field SHALL быть обязательным полем с визуальной индикацией (красная звездочка)
3. THE Country_Field SHALL принимать текстовые значения длиной от 2 до 100 символов
4. THE Country_Field SHALL отображать placeholder "Россия" для подсказки пользователю
5. WHEN пользователь вводит значение короче 2 символов, THE Validation_Schema SHALL отклонить данные с сообщением "Минимум 2 символа"
6. WHEN пользователь вводит значение длиннее 100 символов, THE Validation_Schema SHALL отклонить данные с сообщением "Максимум 100 символов"
7. THE Country_Field SHALL автоматически удалять пробелы в начале и конце значения (trim)

### Requirement 2: Добавление поля "Почтовый индекс"

**User Story:** Как пользователь, я хочу указать почтовый индекс, чтобы служба доставки могла точно определить место назначения.

#### Acceptance Criteria

1. THE DeliveryForm SHALL отображать поле "Почтовый индекс" в разделе Address_Section
2. THE Postal_Code_Field SHALL быть обязательным полем с визуальной индикацией (красная звездочка)
3. THE Postal_Code_Field SHALL принимать текстовые значения длиной от 3 до 20 символов
4. THE Postal_Code_Field SHALL отображать placeholder "123456" для подсказки пользователю
5. WHEN пользователь вводит значение короче 3 символов, THE Validation_Schema SHALL отклонить данные с сообщением "Минимум 3 символа"
6. WHEN пользователь вводит значение длиннее 20 символов, THE Validation_Schema SHALL отклонить данные с сообщением "Максимум 20 символов"
7. THE Postal_Code_Field SHALL автоматически удалять пробелы в начале и конце значения (trim)
8. THE Postal_Code_Field SHALL поддерживать различные форматы почтовых индексов (цифры, буквы, дефисы, пробелы)

### Requirement 3: Позиционирование новых полей

**User Story:** Как пользователь, я хочу видеть логичное расположение полей адреса, чтобы удобно заполнять форму.

#### Acceptance Criteria

1. THE Country_Field SHALL быть расположено первым полем в разделе Address_Section
2. THE Postal_Code_Field SHALL быть расположено вторым полем в разделе Address_Section
3. THE DeliveryForm SHALL отображать поля в следующем порядке: Страна, Почтовый индекс, Город, Улица, Дом, Квартира
4. THE DeliveryForm SHALL сохранять визуальное единообразие с существующими полями (стили, отступы, шрифты)

### Requirement 4: Валидация на фронтенде

**User Story:** Как пользователь, я хочу получать мгновенную обратную связь при заполнении формы, чтобы исправить ошибки до отправки.

#### Acceptance Criteria

1. WHEN пользователь покидает Country_Field с невалидным значением, THE DeliveryForm SHALL отображать сообщение об ошибке под полем красным цветом
2. WHEN пользователь покидает Postal_Code_Field с невалидным значением, THE DeliveryForm SHALL отображать сообщение об ошибке под полем красным цветом
3. WHEN пользователь пытается отправить форму с пустым Country_Field, THE Validation_Schema SHALL предотвратить отправку и показать ошибку
4. WHEN пользователь пытается отправить форму с пустым Postal_Code_Field, THE Validation_Schema SHALL предотвратить отправку и показать ошибку
5. THE DeliveryForm SHALL применять Telegram Web App темизацию к новым полям (цвета фона, текста, границ)

### Requirement 5: Валидация на бэкенде

**User Story:** Как система, я должна валидировать данные на сервере, чтобы предотвратить сохранение некорректных данных.

#### Acceptance Criteria

1. THE API_Endpoint SHALL валидировать поле country с теми же правилами, что и на фронтенде
2. THE API_Endpoint SHALL валидировать поле postal_code с теми же правилами, что и на фронтенде
3. WHEN API_Endpoint получает запрос без поля country, THE API_Endpoint SHALL вернуть HTTP 400 с описанием ошибки
4. WHEN API_Endpoint получает запрос без поля postal_code, THE API_Endpoint SHALL вернуть HTTP 400 с описанием ошибки
5. WHEN API_Endpoint получает запрос с невалидным country, THE API_Endpoint SHALL вернуть HTTP 400 с детальным описанием ошибки валидации
6. WHEN API_Endpoint получает запрос с невалидным postal_code, THE API_Endpoint SHALL вернуть HTTP 400 с детальным описанием ошибки валидации

### Requirement 6: Сохранение данных в Google Sheets

**User Story:** Как администратор, я хочу видеть страну и почтовый индекс в таблице Google Sheets, чтобы организовать доставку призов.

#### Acceptance Criteria

1. THE API_Endpoint SHALL передавать поле country в GoogleSheetsService для сохранения
2. THE API_Endpoint SHALL передавать поле postal_code в GoogleSheetsService для сохранения
3. THE GoogleSheetsService SHALL сохранять country в колонку N таблицы Google Sheets
4. THE GoogleSheetsService SHALL сохранять postal_code в колонку O таблицы Google Sheets
5. THE GoogleSheetsService SHALL сохранять данные в той же строке, что и остальные данные доставки
6. WHEN сохранение в Google Sheets завершается успешно, THE API_Endpoint SHALL вернуть HTTP 200 с сообщением об успехе

### Requirement 7: Санитизация данных

**User Story:** Как система, я должна очищать пользовательский ввод, чтобы предотвратить XSS атаки и инъекции.

#### Acceptance Criteria

1. THE API_Endpoint SHALL применять функцию sanitizeDeliveryData к полю country перед сохранением
2. THE API_Endpoint SHALL применять функцию sanitizeDeliveryData к полю postal_code перед сохранением
3. THE sanitizeDeliveryData SHALL удалять HTML теги из значений country и postal_code
4. THE sanitizeDeliveryData SHALL экранировать специальные символы в значениях country и postal_code
5. THE sanitizeDeliveryData SHALL сохранять валидные символы (буквы, цифры, дефисы, пробелы) в postal_code

### Requirement 8: Обратная совместимость

**User Story:** Как разработчик, я хочу убедиться, что новые поля не нарушают существующую функциональность, чтобы избежать регрессии.

#### Acceptance Criteria

1. THE DeliveryForm SHALL сохранять работоспособность всех существующих полей после добавления новых
2. THE API_Endpoint SHALL продолжать корректно обрабатывать все существующие поля
3. THE GoogleSheetsService SHALL продолжать сохранять существующие поля в правильные колонки
4. THE DeliveryForm SHALL сохранять существующее поведение отправки формы и закрытия WebApp
5. THE DeliveryForm SHALL сохранять существующую обработку ошибок и отображение сообщений

### Requirement 9: Тестирование

**User Story:** Как разработчик, я хочу иметь автоматические тесты для новых полей, чтобы гарантировать их корректную работу.

#### Acceptance Criteria

1. THE тестовый набор SHALL включать unit тесты для валидации country на фронтенде
2. THE тестовый набор SHALL включать unit тесты для валидации postal_code на фронтенде
3. THE тестовый набор SHALL включать integration тесты для API_Endpoint с новыми полями
4. THE тестовый набор SHALL включать тесты для GoogleSheetsService с новыми полями
5. THE тестовый набор SHALL включать тесты для sanitizeDeliveryData с новыми полями
6. THE тестовый набор SHALL включать property-based тесты для валидации различных форматов почтовых индексов
7. FOR ALL валидных данных формы с country и postal_code, отправка через API_Endpoint SHALL завершаться успешно
8. FOR ALL невалидных значений country и postal_code, валидация SHALL отклонять данные с соответствующими сообщениями об ошибках

### Requirement 10: Доступность (Accessibility)

**User Story:** Как пользователь с ограниченными возможностями, я хочу иметь возможность заполнить новые поля с помощью вспомогательных технологий.

#### Acceptance Criteria

1. THE Country_Field SHALL иметь атрибут aria-label="Страна" для screen readers
2. THE Postal_Code_Field SHALL иметь атрибут aria-label="Почтовый индекс" для screen readers
3. THE Country_Field SHALL иметь атрибут aria-required="true" для индикации обязательности
4. THE Postal_Code_Field SHALL иметь атрибут aria-required="true" для индикации обязательности
5. WHEN поле содержит ошибку валидации, THE DeliveryForm SHALL устанавливать атрибут aria-invalid="true"
6. WHEN поле содержит ошибку валидации, THE DeliveryForm SHALL связывать сообщение об ошибке с полем через aria-describedby
7. THE DeliveryForm SHALL обеспечивать корректную навигацию по новым полям с помощью клавиатуры (Tab, Shift+Tab)
