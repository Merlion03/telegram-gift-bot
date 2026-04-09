# Implementation Plan

- [x] 1. Написать exploratory тест для демонстрации бага с кнопкой "Назад"
  - **Property 1: Bug Condition** - Кнопка "Назад" ошибочно отправляет уведомления о доставке
  - **КРИТИЧЕСКИ ВАЖНО**: Этот тест ДОЛЖЕН ПРОВАЛИТЬСЯ на неисправленном коде - провал подтверждает существование бага
  - **НЕ ПЫТАТЬСЯ исправить тест или код когда он провалится**
  - **ПРИМЕЧАНИЕ**: Этот тест кодирует ожидаемое поведение - он будет валидировать исправление когда пройдёт после реализации
  - **ЦЕЛЬ**: Выявить конкретные примеры, демонстрирующие баг
  - **Подход Scoped PBT**: Для детерминистичного бага ограничить property конкретными проваливающимися случаями для воспроизводимости
  - Тест должен симулировать callback с `data="confirm_delivery:123"` от пользователя с уже заполненной формой доставки
  - Проверить, что вызывается `notification_service.send_delivery_notifications` (из Bug Condition в design)
  - Проверить, что `callback.answer` вызывается с текстом "Данные отправлены!" (из Bug Condition в design)
  - Проверить, что отправляется сообщение "Отлично, всё готово к отправке!" (из Bug Condition в design)
  - Запустить тест на НЕИСПРАВЛЕННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОВАЛИТСЯ (это правильно - доказывает существование бага)
  - Задокументировать найденные counterexamples для понимания корневой причины
  - Отметить задачу выполненной когда тест написан, запущен и провал задокументирован
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Написать preservation property тесты (ДО реализации исправления)
  - **Property 2: Preservation** - Поведение кнопки "Изменить данные" и других процессов
  - **ВАЖНО**: Следовать методологии observation-first
  - Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для не-багованных входов
  - Написать property-based тесты, фиксирующие наблюдаемые паттерны поведения из Preservation Requirements
  - Property-based тестирование генерирует множество тестовых случаев для более сильных гарантий
  - Запустить тесты на НЕИСПРАВЛЕННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОЙДУТ (это подтверждает базовое поведение для сохранения)
  - Отметить задачу выполненной когда тесты написаны, запущены и проходят на неисправленном коде
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Исправление бага с кнопкой "Назад" в процессе получения физического приза

  - [x] 3.1 Изменить callback_data кнопки "Назад" в get_delivery_actions_keyboard
    - Открыть файл `telegram-bot/keyboards/reply_keyboards.py`
    - Найти функцию `get_delivery_actions_keyboard`
    - Заменить `callback_data=f"confirm_delivery:{prize_id}"` на `callback_data=f"back_to_menu:{prize_id}"`
    - Это разделит семантику "подтвердить доставку" и "вернуться в меню"
    - Сохранить изменения
    - _Bug_Condition: isBugCondition(input) где input.data.startswith("confirm_delivery:") AND user_clicked_back_button_
    - _Expected_Behavior: Кнопка "Назад" должна использовать callback_data "back_to_menu:{prize_id}" вместо "confirm_delivery:{prize_id}"_
    - _Preservation: Кнопка "Изменить данные" (WebApp) должна остаться без изменений_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Создать новый handler handle_back_to_menu_callback
    - Открыть файл `telegram-bot/handlers/prize_flow_handler.py`
    - Создать новый метод `handle_back_to_menu_callback` в классе `PrizeFlowHandler`
    - Метод должен принимать параметры: `callback: CallbackQuery`, `state: FSMContext`, `prize_id: int`, `session_id: Optional[int] = None`
    - Реализовать логику:
      - Удалить inline-клавиатуру из сообщения: `await callback.message.edit_reply_markup(reply_markup=None)`
      - Отправить главное меню: `await callback.message.answer(text="Главное меню", reply_markup=get_main_menu_keyboard())`
      - Вызвать `await callback.answer()` БЕЗ текста (закрывает callback без всплывающего уведомления)
      - Сбросить FSM состояние: `await state.clear()`
      - Залогировать действие: `logger.info("back_to_menu_callback", telegram_id=telegram_id, prize_id=prize_id)`
    - НЕ вызывать `notification_service.send_delivery_notifications`
    - Добавить docstring на русском языке с описанием метода
    - _Bug_Condition: isBugCondition(input) где input.data.startswith("back_to_menu:")_
    - _Expected_Behavior: expectedBehavior(result) - удаление клавиатуры, показ главного меню, отсутствие уведомлений_
    - _Preservation: Метод handle_confirm_delivery_callback остаётся без изменений_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Зарегистрировать новый callback handler в main.py
    - Открыть файл `telegram-bot/main.py`
    - Найти секцию регистрации callback handlers для Prize Flow (около строки 406)
    - Создать wrapper функцию `back_to_menu_callback_wrapper`:
      ```python
      async def back_to_menu_callback_wrapper(callback: CallbackQuery, state: FSMContext, **kwargs):
          session_id = kwargs.get('session_id')
          prize_id = int(callback.data.split(':')[1])
          await prize_flow_handler.handle_back_to_menu_callback(callback, state, prize_id, session_id)
      ```
    - Зарегистрировать handler:
      ```python
      self.dp.callback_query.register(
          back_to_menu_callback_wrapper,
          F.data.startswith("back_to_menu:")
      )
      ```
    - Разместить регистрацию ПЕРЕД регистрацией `confirm_delivery_callback_wrapper` (более специфичные handlers регистрируются первыми)
    - _Bug_Condition: Регистрация handler для callback_data "back_to_menu:{prize_id}"_
    - _Expected_Behavior: Handler должен корректно обрабатывать callback от кнопки "Назад"_
    - _Preservation: Существующие callback handlers остаются без изменений_
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Обновить docstring метода handle_confirm_delivery_callback
    - Открыть файл `telegram-bot/handlers/prize_flow_handler.py`
    - Найти метод `handle_confirm_delivery_callback`
    - Обновить docstring, уточнив что метод больше не обрабатывает кнопку "Назад"
    - Указать, что метод используется для других механизмов подтверждения доставки (если такие есть)
    - Если метод больше не используется нигде, добавить комментарий о возможном удалении в будущем
    - _Preservation: Логика метода остаётся без изменений, обновляется только документация_
    - _Requirements: 2.5_

  - [x] 3.5 Проверить, что exploratory тест теперь проходит
    - **Property 1: Expected Behavior** - Кнопка "Назад" возвращает в меню без уведомлений
    - **ВАЖНО**: Перезапустить ТОТ ЖЕ тест из задачи 1 - НЕ писать новый тест
    - Тест из задачи 1 кодирует ожидаемое поведение
    - Когда этот тест проходит, это подтверждает что ожидаемое поведение достигнуто
    - Запустить bug condition exploratory тест из шага 1
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОХОДИТ (подтверждает что баг исправлен)
    - Проверить, что:
      - `notification_service.send_delivery_notifications` НЕ вызывается
      - `callback.answer` вызывается БЕЗ текста
      - Inline-клавиатура удалена
      - Главное меню отправлено
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Проверить, что preservation тесты всё ещё проходят
    - **Property 2: Preservation** - Поведение кнопки "Изменить данные" и других процессов
    - **ВАЖНО**: Перезапустить ТЕ ЖЕ тесты из задачи 2 - НЕ писать новые тесты
    - Запустить preservation property тесты из шага 2
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (подтверждает отсутствие регрессий)
    - Проверить, что все тесты всё ещё проходят после исправления (нет регрессий)
    - Проверить конкретно:
      - Кнопка "Изменить данные" открывает WebApp форму
      - Первичное заполнение формы доставки работает
      - Отправка данных через WebApp вызывает уведомления
      - Процесс получения цифровых призов работает
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Checkpoint - Убедиться что все тесты проходят
  - Запустить полный набор тестов для Prize Flow
  - Проверить, что exploratory тест (задача 1) теперь проходит
  - Проверить, что preservation тесты (задача 2) всё ещё проходят
  - Проверить, что не появились новые ошибки в других частях системы
  - Если возникают вопросы или проблемы, обратиться к пользователю
  - Убедиться что все изменения соответствуют требованиям из bugfix.md и design.md
