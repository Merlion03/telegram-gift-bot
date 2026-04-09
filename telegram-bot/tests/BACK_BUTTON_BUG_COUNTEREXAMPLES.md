# Bug Condition Counterexamples - Кнопка "Назад" в процессе получения физического приза

## Дата тестирования
2026-04-08

## Статус
**БАГ ПОДТВЕРЖДЁН** - Все 3 exploratory теста провалились на неисправленном коде

## Описание бага
Когда пользователь уже заполнил форму доставки для физического приза и вводит кодовое слово снова, система показывает сообщение с кнопками "Назад" и "Изменить данные". При нажатии кнопки "Назад" система ошибочно отправляет уведомления о подтверждении доставки вместо простого возврата в главное меню.

## Найденные Counterexamples

### Counterexample 1: Вызов send_delivery_notifications
**Тест**: `test_back_button_should_not_send_delivery_notifications`

**Входные данные**:
- telegram_id: 123456
- prize_id: 1
- callback_data: "confirm_delivery:1"
- Пользователь уже заполнил форму доставки (claimed_at IS NOT NULL)

**Ожидаемое поведение**:
- `notification_service.send_delivery_notifications` НЕ должен вызываться
- Inline-клавиатура должна быть удалена
- Главное меню должно быть отправлено
- callback.answer должен быть вызван БЕЗ текста

**Фактическое поведение (БАГ)**:
- `notification_service.send_delivery_notifications` был вызван 1 раз
- Это приводит к отправке уведомлений о подтверждении доставки

**Вывод**: Баг подтверждён. Метод `handle_confirm_delivery_callback` вызывает `send_delivery_notifications`, хотя не должен этого делать при нажатии кнопки "Назад".

---

### Counterexample 2: Текст всплывающего уведомления
**Тест**: `test_back_button_callback_answer_text`

**Входные данные**:
- telegram_id: 789012
- prize_id: 2
- callback_data: "confirm_delivery:2"
- Пользователь уже заполнил форму доставки

**Ожидаемое поведение**:
- `callback.answer()` должен быть вызван БЕЗ текста (пустая строка или None)
- Пользователь НЕ должен видеть всплывающее уведомление

**Фактическое поведение (БАГ)**:
- `callback.answer("Данные отправлены!")` был вызван с текстом "Данные отправлены!"
- Пользователь видит всплывающее уведомление, которое вводит его в заблуждение

**Вывод**: Баг подтверждён. Система показывает всплывающее уведомление "Данные отправлены!", хотя пользователь нажал "Назад", а не подтвердил отправку данных.

---

### Counterexample 3: Отправка сообщения о готовности к отправке
**Тест**: `test_back_button_should_not_trigger_delivery_confirmation_message`

**Входные данные**:
- telegram_id: 345678
- prize_id: 3
- callback_data: "confirm_delivery:3"
- Пользователь уже заполнил форму доставки

**Ожидаемое поведение**:
- Сообщение "Отлично, всё готово к отправке! В среднем доставка занимает 2-3 недели..." НЕ должно отправляться
- Пользователь должен просто вернуться в главное меню

**Фактическое поведение (БАГ)**:
- `notification_service.send_delivery_notifications` был вызван 1 раз
- Это приводит к отправке сообщения о готовности к отправке
- Пользователь получает сообщение, которое создаёт путаницу

**Вывод**: Баг подтверждён. Система отправляет сообщение о готовности к отправке, хотя пользователь не подтверждал доставку, а просто хотел вернуться в меню.

---

## Корневая причина (подтверждена)

Анализ кода подтверждает гипотезу о корневой причине:

1. **Неправильное использование callback_data**: Кнопка "Назад" в `get_delivery_actions_keyboard` использует `callback_data=f"confirm_delivery:{prize_id}"`, который семантически означает "подтвердить доставку", а не "вернуться назад".

2. **Отсутствие отдельного handler**: Нет отдельного callback handler для действия "вернуться в меню". Кнопка "Назад" переиспользует существующий handler `handle_confirm_delivery_callback`, который предназначен для подтверждения доставки.

3. **Ошибочная логика в handler**: Метод `handle_confirm_delivery_callback` безусловно вызывает `notification_service.send_delivery_notifications` и `callback.answer("Данные отправлены!")`, не проверяя намерение пользователя.

## Код, демонстрирующий баг

### Файл: `telegram-bot/keyboards/reply_keyboards.py`
```python
def get_delivery_actions_keyboard(prize_id: int, webapp_url: str) -> InlineKeyboardMarkup:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text="Назад", 
                callback_data=f"confirm_delivery:{prize_id}",  # ❌ БАГ: неправильный callback_data
                style="primary",
                icon_custom_emoji_id="5316911646906541152"
            )],
            # ...
        ]
    )
    return keyboard
```

### Файл: `telegram-bot/handlers/prize_flow_handler.py`
```python
async def handle_confirm_delivery_callback(
    self,
    callback: CallbackQuery,
    state: FSMContext,
    prize_id: int,
    session_id: Optional[int] = None
) -> None:
    # ❌ БАГ: безусловно отправляет уведомления
    notification_result = await self.notification_service.send_delivery_notifications(
        telegram_id=telegram_id,
        prize_id=prize_id,
        session_id=session_id
    )
    
    # ❌ БАГ: показывает всплывающее уведомление
    await callback.answer("Данные отправлены!")
```

## Рекомендации по исправлению

1. **Изменить callback_data кнопки "Назад"**: Заменить `confirm_delivery:{prize_id}` на `back_to_menu:{prize_id}`

2. **Создать новый handler**: Создать метод `handle_back_to_menu_callback`, который будет:
   - Удалять inline-клавиатуру
   - Показывать главное меню
   - Вызывать `callback.answer()` БЕЗ текста
   - НЕ вызывать `send_delivery_notifications`

3. **Зарегистрировать новый handler**: Добавить регистрацию handler для `back_to_menu:{prize_id}` в `main.py`

4. **Обновить docstring**: Уточнить в `handle_confirm_delivery_callback`, что метод больше не обрабатывает кнопку "Назад"

## Следующие шаги

1. ✅ Exploratory тесты написаны и провалились (подтверждают баг)
2. ⏳ Написать preservation property тесты (задача 2)
3. ⏳ Реализовать исправление (задача 3)
4. ⏳ Проверить, что exploratory тесты проходят после исправления (задача 3.5)
5. ⏳ Проверить, что preservation тесты всё ещё проходят (задача 3.6)

## Примечания

- Все 3 теста провалились ожидаемым образом, подтверждая существование бага
- Тесты кодируют ОЖИДАЕМОЕ поведение системы после исправления
- Когда баг будет исправлен, эти тесты должны пройти
- НЕ ПЫТАТЬСЯ исправить тесты или код на этом этапе - провал тестов является ожидаемым и правильным результатом
