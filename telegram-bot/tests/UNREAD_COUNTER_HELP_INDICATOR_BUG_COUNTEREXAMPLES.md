# Bug Condition Exploration - Counterexamples

Этот документ содержит counterexamples (контрпримеры), найденные при запуске bug exploration тестов на неисправленном коде.

## Дата выполнения

**Дата**: 2026-04-09
**Статус**: Тесты запущены на неисправленном коде
**Результат**: Баги подтверждены

## БАГ 1: Счётчик непрочитанных сообщений не уменьшается

### Описание бага

При открытии диалога оператором через GET `/api/support/sessions/[id]/messages` счётчик непрочитанных сообщений не обнуляется, потому что флаг `delivered` для сообщений от пользователя не обновляется.

### Counterexamples

**Тест**: `test_bug1_unread_counter_not_decreasing_on_dialog_open`

**Сценарий**:
1. Создана тестовая сессия с telegram_id
2. Добавлено N непрочитанных сообщений от пользователя (delivered = false)
3. Симулировано открытие диалога оператором

**Ожидаемое поведение**:
- Все сообщения от пользователя должны быть помечены как delivered = true
- Счётчик unread_count должен обнулиться (0)

**Текущее поведение (БАГ)**:
- Флаг delivered остаётся false для всех сообщений
- Счётчик unread_count остаётся неизменным (N)

**Первопричина**:
1. В API route `GET /api/support/sessions/[id]/messages` отсутствует вызов метода для обновления флага delivered
2. В DatabaseClient отсутствует метод `markMessagesAsDelivered(sessionId)` для массового обновления
3. Текущий метод `markMessageAsDelivered(messageId)` работает только для одного сообщения

**Необходимые изменения**:
1. Добавить метод `markMessagesAsDelivered(sessionId)` в DatabaseClient
2. Вызвать этот метод в GET handler после загрузки сообщений
3. Обновить SQL запрос для массового обновления: `UPDATE support_messages SET delivered = true WHERE session_id = $1 AND message_type = 'from_user' AND delivered = false`

---

## БАГ 2: Индикатор "Нужна помощь" не меняет цвет

### Описание бага

При нажатии кнопки "Нужна помощь" счётчик непрочитанных сообщений не меняет цвет с красного на зелёный, потому что:
1. В таблице `support_sessions` отсутствует поле `help_needed`
2. Обработчик `handle_need_help_callback` не устанавливает флаг в БД
3. Компонент `SessionList.tsx` не проверяет флаг `help_needed` при рендеринге

### Counterexamples

**Тест**: `test_bug2_help_needed_field_missing_in_database_schema`

**Сценарий**:
1. Создана тестовая сессия
2. Проверено наличие поля `help_needed` в модели SupportSession

**Ожидаемое поведение**:
- Модель SupportSession должна содержать поле `help_needed` типа bool
- Поле должно поддерживать установку значений true/false

**Текущее поведение (БАГ)**:
- Поле `help_needed` отсутствует в модели SupportSession
- `hasattr(session, 'help_needed')` возвращает False

**Первопричина**:
1. В файле `telegram-bot/database/schema.sql` таблица `support_sessions` не содержит поле `help_needed`
2. В модели `telegram-bot/database/models/support.py` класс SupportSession не содержит поле `help_needed`
3. Отсутствует миграция для добавления поля в существующую БД

**Необходимые изменения**:
1. Добавить поле `help_needed BOOLEAN NOT NULL DEFAULT FALSE` в таблицу support_sessions
2. Добавить поле в модель SupportSession: `help_needed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)`
3. Создать миграцию для добавления поля
4. Добавить методы `set_help_needed(value: bool)` и `reset_help_needed()` в модель
5. Обновить обработчик `handle_need_help_callback` для установки флага
6. Добавить метод `setHelpNeeded(sessionId, helpNeeded)` в DatabaseClient
7. Обновить компонент SessionList.tsx для проверки флага и изменения цвета

---

**Тест**: `test_bug2_help_needed_indicator_not_changing_color`

**Сценарий**:
1. Создана тестовая сессия с непрочитанными сообщениями
2. Симулировано нажатие кнопки "Нужна помощь"
3. Проверена установка флага help_needed

**Ожидаемое поведение**:
- Флаг help_needed должен быть установлен в true
- Счётчик должен отображаться зелёным цветом (#34c759)

**Текущее поведение (БАГ)**:
- Тест не может выполниться, потому что поле help_needed отсутствует
- pytest.fail() с сообщением о том, что поле отсутствует

---

**Тест**: `test_bug2_help_needed_reset_on_dialog_open`

**Сценарий**:
1. Создана сессия с help_needed = true
2. Симулировано открытие диалога оператором
3. Проверен сброс флага help_needed в false

**Ожидаемое поведение**:
- При открытии диалога флаг help_needed должен автоматически сброситься в false
- Счётчик должен вернуться к красному цвету для последующих непрочитанных сообщений

**Текущее поведение (БАГ)**:
- Тест пропускается (pytest.skip), потому что поле help_needed отсутствует

---

## Выводы

Оба бага подтверждены на неисправленном коде:

1. **БАГ 1**: Счётчик непрочитанных сообщений не обнуляется при открытии диалога
   - Причина: отсутствие логики обновления флага delivered
   - Требуется: добавить метод markMessagesAsDelivered и вызвать его в API route

2. **БАГ 2**: Индикатор "Нужна помощь" не меняет цвет
   - Причина: отсутствие поля help_needed в схеме БД и модели
   - Требуется: добавить поле, миграцию, методы и логику в компоненте

Тесты готовы для валидации исправлений. После внедрения исправлений эти же тесты должны пройти успешно.

## Следующие шаги

1. Отметить задачу 1 (Write bug condition exploration tests) как выполненную
2. Перейти к задаче 2 (Write preservation property tests)
3. После написания всех тестов перейти к Implementation Phase (задачи 3-9)
4. После имплементации запустить все тесты для валидации исправлений (задачи 10-11)
