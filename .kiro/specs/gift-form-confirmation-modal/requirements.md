# Requirements Document

## Введение

Модальное окно подтверждения данных перед отправкой формы физического подарка. Функция предотвращает случайную отправку неверных данных, позволяя пользователю проверить все введённые данные перед финальной отправкой. Это повышает качество данных доставки и снижает количество ошибок при заполнении адресов.

## Глоссарий

- **Gift_Form**: Форма для ввода данных доставки физического подарка в WebApp
- **Confirmation_Modal**: Модальное окно для проверки введённых данных перед отправкой
- **Submit_Button**: Кнопка "Отправить данные" в основной форме
- **Confirm_Button**: Кнопка "Отправить" в модальном окне подтверждения
- **Edit_Button**: Кнопка "Изменить" в модальном окне подтверждения
- **Success_Message**: Сообщение "Данные были отправлены. Ожидайте"
- **Delivery_Data**: Данные доставки (ФИО, адрес, телефон, комментарий)
- **WebApp**: Telegram Mini App для заполнения формы доставки

## Требования

### Requirement 1: Перехват отправки формы

**User Story:** Как пользователь, я хочу, чтобы форма не отправлялась сразу при нажатии кнопки "Отправить данные", чтобы иметь возможность проверить введённые данные перед финальной отправкой.

#### Acceptance Criteria

1. WHEN пользователь нажимает Submit_Button, THE Gift_Form SHALL предотвратить немедленную отправку данных
2. WHEN пользователь нажимает Submit_Button, THE Gift_Form SHALL открыть Confirmation_Modal
3. THE Gift_Form SHALL сохранить все введённые данные в памяти до момента подтверждения

### Requirement 2: Отображение данных в модальном окне

**User Story:** Как пользователь, я хочу видеть все введённые данные в модальном окне, чтобы проверить их корректность перед отправкой.

#### Acceptance Criteria

1. WHEN Confirmation_Modal открывается, THE Confirmation_Modal SHALL отобразить все поля Delivery_Data
2. THE Confirmation_Modal SHALL отобразить фамилию пользователя
3. THE Confirmation_Modal SHALL отобразить имя пользователя
4. THE Confirmation_Modal SHALL отобразить отчество пользователя (если указано)
5. THE Confirmation_Modal SHALL отобразить город доставки
6. THE Confirmation_Modal SHALL отобразить улицу
7. THE Confirmation_Modal SHALL отобразить номер дома
8. THE Confirmation_Modal SHALL отобразить номер квартиры (если указан)
9. THE Confirmation_Modal SHALL отобразить номер телефона
10. THE Confirmation_Modal SHALL отобразить комментарий (если указан)
11. THE Confirmation_Modal SHALL форматировать данные в читаемом виде с подписями полей

### Requirement 3: Подтверждение и отправка данных

**User Story:** Как пользователь, я хочу подтвердить отправку данных, если они верны, чтобы завершить процесс заполнения формы.

#### Acceptance Criteria

1. THE Confirmation_Modal SHALL отображать Confirm_Button с текстом "Отправить"
2. WHEN пользователь нажимает Confirm_Button, THE WebApp SHALL отправить Delivery_Data в Telegram Bot
3. WHEN данные успешно отправлены, THE WebApp SHALL закрыть Confirmation_Modal
4. WHEN данные успешно отправлены, THE WebApp SHALL отобразить Success_Message с текстом "Данные были отправлены. Ожидайте"
5. WHEN Success_Message отображается, THE WebApp SHALL заблокировать возможность повторной отправки формы
6. THE WebApp SHALL позволить пользователю самостоятельно закрыть WebApp после отображения Success_Message

### Requirement 4: Редактирование данных

**User Story:** Как пользователь, я хочу вернуться к редактированию формы, если обнаружил ошибку в данных, чтобы исправить её перед отправкой.

#### Acceptance Criteria

1. THE Confirmation_Modal SHALL отображать Edit_Button с текстом "Изменить"
2. WHEN пользователь нажимает Edit_Button, THE Confirmation_Modal SHALL закрыться
3. WHEN Confirmation_Modal закрывается по Edit_Button, THE Gift_Form SHALL сохранить все введённые данные в полях формы
4. WHEN Confirmation_Modal закрывается по Edit_Button, THE Gift_Form SHALL позволить редактирование любого поля
5. WHEN пользователь снова нажимает Submit_Button после редактирования, THE Gift_Form SHALL открыть Confirmation_Modal с обновлёнными данными

### Requirement 5: Обработка ошибок отправки

**User Story:** Как пользователь, я хочу получить понятное сообщение об ошибке, если отправка данных не удалась, чтобы понимать, что делать дальше.

#### Acceptance Criteria

1. IF отправка данных завершилась ошибкой, THEN THE WebApp SHALL закрыть Confirmation_Modal
2. IF отправка данных завершилась ошибкой, THEN THE WebApp SHALL отобразить сообщение об ошибке с описанием проблемы
3. IF отправка данных завершилась ошибкой, THEN THE Gift_Form SHALL сохранить все введённые данные в полях формы
4. IF отправка данных завершилась ошибкой, THEN THE Gift_Form SHALL позволить повторную попытку отправки

### Requirement 6: Закрытие модального окна

**User Story:** Как пользователь, я хочу иметь возможность закрыть модальное окно стандартными способами, чтобы управлять интерфейсом привычным образом.

#### Acceptance Criteria

1. WHEN пользователь нажимает на область вне Confirmation_Modal, THE Confirmation_Modal SHALL закрыться
2. WHEN пользователь нажимает клавишу Escape, THE Confirmation_Modal SHALL закрыться
3. WHEN Confirmation_Modal закрывается без нажатия Confirm_Button, THE Gift_Form SHALL сохранить все введённые данные
4. THE Confirmation_Modal SHALL отображать кнопку закрытия (крестик) в правом верхнем углу

### Requirement 7: Валидация данных перед открытием модального окна

**User Story:** Как пользователь, я хочу, чтобы модальное окно открывалось только при корректно заполненной форме, чтобы не тратить время на проверку заведомо неполных данных.

#### Acceptance Criteria

1. WHEN пользователь нажимает Submit_Button, THE Gift_Form SHALL проверить заполнение всех обязательных полей
2. IF обязательные поля не заполнены, THEN THE Gift_Form SHALL отобразить сообщения об ошибках валидации
3. IF обязательные поля не заполнены, THEN THE Gift_Form SHALL предотвратить открытие Confirmation_Modal
4. WHEN все обязательные поля заполнены корректно, THE Gift_Form SHALL открыть Confirmation_Modal

### Requirement 8: Доступность и UX

**User Story:** Как пользователь, я хочу, чтобы модальное окно было удобным и доступным, чтобы комфортно использовать функцию на любом устройстве.

#### Acceptance Criteria

1. THE Confirmation_Modal SHALL быть адаптивным для мобильных устройств
2. THE Confirmation_Modal SHALL поддерживать навигацию с клавиатуры (Tab, Enter, Escape)
3. WHEN Confirmation_Modal открывается, THE Confirmation_Modal SHALL установить фокус на Confirm_Button
4. THE Confirmation_Modal SHALL блокировать прокрутку основной страницы при открытии
5. THE Confirmation_Modal SHALL использовать читаемые шрифты и достаточный контраст цветов
6. THE Confirmation_Modal SHALL отображать данные с достаточными отступами для удобного чтения
