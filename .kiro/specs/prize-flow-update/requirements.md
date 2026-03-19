# Requirements Document

## Introduction

Данный документ описывает требования к обновлению логики получения призов в Telegram боте для розыгрышей. Текущая реализация предполагает прямую отправку кодового слова после команды /start. Новая логика добавляет главное меню, проверку согласия на обработку персональных данных, улучшенную обработку ошибок и управление состояниями через FSM.

Обновление направлено на улучшение пользовательского опыта, соответствие требованиям по защите персональных данных и создание более гибкой архитектуры для будущих расширений.

## Glossary

- **Bot**: Telegram бот для розыгрыша призов на базе aiogram 3.x
- **User**: Пользователь Telegram, взаимодействующий с ботом
- **Main_Menu**: Главное меню бота с описанием функций и кнопкой "Получить приз"
- **Prize_Flow**: Процесс получения приза от нажатия кнопки до выдачи промокода или формы доставки
- **FSM**: Finite State Machine (конечный автомат) для управления состояниями диалога
- **GDPR_Consent**: Согласие пользователя на обработку персональных данных
- **Code_Word**: Кодовое слово для идентификации приза в таблице
- **Digital_Prize**: Цифровой приз (промокод)
- **Physical_Prize**: Физический приз, требующий заполнения формы доставки
- **Prize_Table**: Таблица с данными о призах (PostgreSQL + Google Sheets)
- **WebApp_Form**: Веб-форма для ввода данных доставки физического приза
- **Session_Manager**: Менеджер сессий для сохранения истории диалогов

## Requirements

### Requirement 1: Отображение главного меню

**User Story:** Как пользователь, я хочу видеть главное меню с описанием функций бота после команды /start, чтобы понимать возможности бота и начать получение приза.

#### Acceptance Criteria

1. WHEN User отправляет команду /start, THE Bot SHALL отобразить Main_Menu с описанием функций
2. THE Main_Menu SHALL содержать кнопку "Получить приз"
3. THE Main_Menu SHALL содержать текстовое описание возможностей бота
4. THE Bot SHALL НЕ упоминать слово "бот" в описании функций

### Requirement 2: Проверка пользователя в таблице

**User Story:** Как система, я хочу проверять наличие пользователя в таблице призов при нажатии кнопки "Получить приз", чтобы определить право на получение приза.

#### Acceptance Criteria

1. WHEN User нажимает кнопку "Получить приз", THE Bot SHALL проверить наличие User в Prize_Table
2. THE Bot SHALL выполнить проверку в PostgreSQL и Google Sheets согласно текущей конфигурации синхронизации
3. IF User найден в Prize_Table, THEN THE Bot SHALL перейти к проверке GDPR_Consent
4. IF User НЕ найден в Prize_Table, THEN THE Bot SHALL отправить сообщение "Ваш аккаунт отсутствует в списке победителей"
5. WHEN User НЕ найден в Prize_Table, THE Bot SHALL предложить зайти с другого аккаунта
6. WHEN User НЕ найден в Prize_Table, THE Bot SHALL отобразить Main_Menu

### Requirement 3: Проверка согласия на обработку персональных данных

**User Story:** Как система, я хочу проверять согласие пользователя на обработку персональных данных, чтобы соответствовать требованиям законодательства о защите данных.

#### Acceptance Criteria

1. WHEN User найден в Prize_Table, THE Bot SHALL проверить наличие GDPR_Consent для данного User
2. IF GDPR_Consent отсутствует, THEN THE Bot SHALL запросить согласие с кнопками "Согласен" и "Назад"
3. IF User нажимает "Согласен", THEN THE Bot SHALL сохранить GDPR_Consent в Prize_Table с текущей датой и временем
4. IF User нажимает "Назад", THEN THE Bot SHALL отобразить Main_Menu без сохранения согласия
5. IF GDPR_Consent уже дано, THEN THE Bot SHALL перейти к запросу Code_Word

### Requirement 4: FSM состояния для управления Prize_Flow

**User Story:** Как разработчик, я хочу использовать FSM для управления состояниями процесса получения приза, чтобы обеспечить корректную обработку пользовательского ввода на каждом этапе.

#### Acceptance Criteria

1. THE Bot SHALL определить FSM состояние "waiting_for_consent" для ожидания согласия на обработку данных
2. THE Bot SHALL определить FSM состояние "waiting_for_code_word" для ожидания ввода кодового слова
3. THE Bot SHALL определить FSM состояние "waiting_for_delivery_data" для ожидания данных доставки из WebApp_Form
4. WHEN User находится в FSM состоянии, THE Bot SHALL обрабатывать только релевантные сообщения для данного состояния
5. WHEN Prize_Flow завершён, THE Bot SHALL сбросить FSM состояние в default_state

### Requirement 5: Запрос и валидация кодового слова

**User Story:** Как пользователь, я хочу ввести кодовое слово для получения приза, чтобы подтвердить свою победу в конкурсе.

#### Acceptance Criteria

1. WHEN GDPR_Consent подтверждено, THE Bot SHALL запросить Code_Word у User
2. THE Bot SHALL установить FSM состояние "waiting_for_code_word"
3. WHEN User отправляет текстовое сообщение в состоянии "waiting_for_code_word", THE Bot SHALL проверить Code_Word в Prize_Table
4. IF Code_Word верно, THEN THE Bot SHALL определить тип приза (Digital_Prize или Physical_Prize)
5. IF Code_Word неверно, THEN THE Bot SHALL отправить сообщение "Кодовое слово введено неверно. Попробуйте ещё раз"
6. WHEN Code_Word неверно, THE Bot SHALL сохранить FSM состояние "waiting_for_code_word" для повторного ввода
7. THE Bot SHALL позволить неограниченное количество попыток ввода Code_Word

### Requirement 6: Выдача цифрового приза

**User Story:** Как пользователь, я хочу получить промокод и инструкцию при выигрыше цифрового приза, чтобы использовать его для покупки.

#### Acceptance Criteria

1. WHEN Code_Word верно И тип приза Digital_Prize, THE Bot SHALL отправить поздравительное сообщение с промокодом
2. THE Bot SHALL отправить инструкцию по использованию промокода
3. THE Bot SHALL записать время получения промокода в Prize_Table (столбец claimed_at)
4. WHEN промокод отправлен, THE Bot SHALL отобразить Main_Menu
5. THE Bot SHALL сбросить FSM состояние в default_state

### Requirement 7: Выдача физического приза

**User Story:** Как пользователь, я хочу заполнить форму доставки при выигрыше физического приза, чтобы получить приз по указанному адресу.

#### Acceptance Criteria

1. WHEN Code_Word верно И тип приза Physical_Prize, THE Bot SHALL отправить сообщение с инструкцией по заполнению формы
2. THE Bot SHALL отправить кнопку для открытия WebApp_Form с параметром prize_id
3. THE Bot SHALL установить FSM состояние "waiting_for_delivery_data"
4. WHEN User открывает WebApp_Form, THE WebApp_Form SHALL отобразить поля для ввода данных доставки
5. THE WebApp_Form SHALL отобразить модальное окно с введёнными данными и кнопками "Данные верны" и "Внести изменения"
6. IF User нажимает "Внести изменения", THEN THE WebApp_Form SHALL закрыть модальное окно и позволить редактирование
7. IF User нажимает "Данные верны", THEN THE WebApp_Form SHALL отправить данные в Bot через web_app_data
8. WHEN Bot получает web_app_data, THE Bot SHALL сохранить данные доставки в Prize_Table
9. WHEN данные сохранены, THE Bot SHALL отправить подтверждение получения данных
10. WHEN данные сохранены, THE Bot SHALL отобразить Main_Menu
11. THE Bot SHALL сбросить FSM состояние в default_state

### Requirement 8: Обработка кнопки "Назад"

**User Story:** Как пользователь, я хочу иметь возможность отменить процесс получения приза на этапе согласия, чтобы вернуться в главное меню.

#### Acceptance Criteria

1. WHEN User находится в FSM состоянии "waiting_for_consent", THE Bot SHALL отображать кнопку "Назад"
2. WHEN User нажимает "Назад" в состоянии "waiting_for_consent", THE Bot SHALL отобразить Main_Menu
3. THE Bot SHALL сбросить FSM состояние в default_state
4. THE Bot SHALL НЕ сохранять GDPR_Consent при нажатии "Назад"

### Requirement 9: Возврат в главное меню после получения приза

**User Story:** Как пользователь, я хочу видеть главное меню после получения приза, чтобы продолжить взаимодействие с ботом.

#### Acceptance Criteria

1. WHEN Digital_Prize выдан, THE Bot SHALL отобразить Main_Menu
2. WHEN данные доставки для Physical_Prize сохранены, THE Bot SHALL отобразить Main_Menu
3. WHEN User НЕ найден в Prize_Table, THE Bot SHALL отобразить Main_Menu
4. WHEN User нажимает "Назад" при запросе согласия, THE Bot SHALL отобразить Main_Menu

### Requirement 10: Интеграция с существующей архитектурой

**User Story:** Как разработчик, я хочу интегрировать новую логику с существующей архитектурой бота, чтобы сохранить совместимость и избежать дублирования кода.

#### Acceptance Criteria

1. THE Bot SHALL использовать существующий PrizeService для проверки призов
2. THE Bot SHALL использовать существующий GoogleSheetsService для работы с таблицами
3. THE Bot SHALL использовать существующий PrizeRepository для работы с PostgreSQL
4. THE Bot SHALL использовать существующий SessionManager для сохранения истории диалогов
5. THE Bot SHALL создать новый PrizeFlowStates в модуле fsm/states.py для управления состояниями Prize_Flow
6. THE Bot SHALL создать новый PrizeFlowHandler для обработки Prize_Flow
7. THE Bot SHALL обновить CommonHandler для отображения Main_Menu
8. THE Bot SHALL сохранить существующую логику обработки команды /start

### Requirement 11: Сохранение истории диалогов

**User Story:** Как администратор, я хочу сохранять историю взаимодействия пользователей с ботом в процессе получения приза, чтобы анализировать поведение и решать проблемы.

#### Acceptance Criteria

1. THE Bot SHALL использовать Session_Manager для сохранения всех сообщений User в Prize_Flow
2. THE Bot SHALL использовать Session_Manager для сохранения всех ответов Bot в Prize_Flow
3. THE Bot SHALL сохранять session_id для связи сообщений с сессией пользователя
4. THE Bot SHALL сохранять временные метки для всех сообщений

### Requirement 12: Обработка ошибок и граничных случаев

**User Story:** Как пользователь, я хочу получать понятные сообщения об ошибках, чтобы понимать, что пошло не так и как действовать дальше.

#### Acceptance Criteria

1. IF Prize_Table недоступна, THEN THE Bot SHALL отправить сообщение "Сервис временно недоступен. Попробуйте позже"
2. IF промокод отсутствует для Digital_Prize, THEN THE Bot SHALL отправить сообщение "Произошла ошибка. Обратитесь в поддержку"
3. IF WebApp_Form не отправляет данные, THEN THE Bot SHALL сохранить FSM состояние "waiting_for_delivery_data"
4. IF User отправляет некорректные данные в FSM состоянии, THE Bot SHALL отправить подсказку о корректном формате
5. THE Bot SHALL логировать все ошибки с контекстом (telegram_id, code_word, состояние FSM)

### Requirement 13: Property-Based Testing для Prize_Flow

**User Story:** Как разработчик, я хочу использовать property-based testing для проверки корректности Prize_Flow, чтобы обнаружить граничные случаи и ошибки.

#### Acceptance Criteria (Correctness Properties)

1. **Invariant: FSM State Consistency**
   - FOR ALL Prize_Flow executions, IF User завершает Prize_Flow успешно, THEN FSM состояние SHALL быть default_state
   - FOR ALL Prize_Flow executions, IF User отменяет Prize_Flow, THEN FSM состояние SHALL быть default_state

2. **Invariant: GDPR Consent Persistence**
   - FOR ALL Users, IF GDPR_Consent сохранён в Prize_Table, THEN повторный запрос согласия SHALL НЕ происходить
   - FOR ALL Users, IF GDPR_Consent НЕ сохранён, THEN запрос согласия SHALL происходить при каждом Prize_Flow

3. **Metamorphic Property: Code Word Validation**
   - FOR ALL Code_Word inputs, IF Code_Word неверно N раз, THEN Bot SHALL запросить Code_Word N раз
   - FOR ALL Code_Word inputs, количество запросов Code_Word SHALL быть равно количеству неверных попыток + 1

4. **Round-Trip Property: Prize Data Consistency**
   - FOR ALL Physical_Prize, IF User отправляет delivery_data через WebApp_Form, THEN данные в Prize_Table SHALL совпадать с отправленными данными
   - FOR ALL Digital_Prize, IF Bot отправляет promo_code, THEN promo_code SHALL совпадать с данными в Prize_Table

5. **Error Condition: Invalid User Handling**
   - FOR ALL telegram_id NOT IN Prize_Table, THE Bot SHALL отправить сообщение об отсутствии в списке победителей
   - FOR ALL telegram_id NOT IN Prize_Table, THE Bot SHALL отобразить Main_Menu

6. **Error Condition: Missing Promo Code**
   - FOR ALL Digital_Prize WHERE promo_code IS NULL, THE Bot SHALL отправить сообщение об ошибке
   - FOR ALL Digital_Prize WHERE promo_code IS NULL, THE Bot SHALL НЕ записывать claimed_at в Prize_Table

7. **Idempotence: Main Menu Display**
   - FOR ALL Prize_Flow completions, отображение Main_Menu SHALL быть идемпотентным (повторное отображение не изменяет состояние)
   - FOR ALL Prize_Flow cancellations, отображение Main_Menu SHALL быть идемпотентным

8. **State Transition Property**
   - FOR ALL FSM state transitions, переход из состояния A в состояние B SHALL происходить только через определённые действия User
   - FOR ALL FSM states, недопустимые действия User SHALL НЕ изменять текущее состояние

## Special Requirements

### Parser and Serializer Requirements

Данная фича не требует создания парсеров или сериализаторов для новых форматов данных. Используются существующие механизмы aiogram для обработки JSON данных из WebApp.

### Performance Requirements

1. THE Bot SHALL обрабатывать запрос на проверку User в Prize_Table за время не более 500ms
2. THE Bot SHALL обрабатывать сохранение GDPR_Consent за время не более 200ms
3. THE Bot SHALL обрабатывать сохранение данных доставки за время не более 500ms

### Security Requirements

1. THE Bot SHALL НЕ отображать промокоды других пользователей
2. THE Bot SHALL валидировать prize_id из WebApp_Form перед сохранением данных
3. THE Bot SHALL логировать все попытки доступа к Prize_Table с telegram_id
