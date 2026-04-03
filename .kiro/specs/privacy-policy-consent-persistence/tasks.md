# План реализации исправления бага с сохранением согласия на политику конфиденциальности

- [x] 1. Написать тест исследования Bug Condition
  - **Property 1: Bug Condition** - GDPR Consent Persistence для пользователей без призов
  - **КРИТИЧЕСКИ ВАЖНО**: Этот тест ДОЛЖЕН ПРОВАЛИТЬСЯ на неисправленном коде - провал подтверждает существование бага
  - **НЕ ПЫТАЙТЕСЬ исправить тест или код, когда он провалится**
  - **ПРИМЕЧАНИЕ**: Этот тест кодирует ожидаемое поведение - он будет валидировать исправление, когда пройдет после реализации
  - **ЦЕЛЬ**: Выявить контрпримеры, демонстрирующие существование бага
  - **Подход Scoped PBT**: Для детерминированного бага ограничить property конкретными проваливающимися случаями для обеспечения воспроизводимости
  - Тестировать детали реализации из Bug Condition в design.md:
    - Пользователь дает согласие (вызов `save_gdpr_consent(telegram_id)`)
    - У пользователя нет записей в таблице `prizes` (user_has_no_prizes == TRUE)
    - Проверка согласия (вызов `check_gdpr_consent(telegram_id)`)
    - Ожидаемое поведение: согласие должно быть найдено (из Expected Behavior Properties)
  - Утверждения теста должны соответствовать Expected Behavior Properties из design.md:
    - `check_gdpr_consent(telegram_id)` возвращает TRUE
    - Согласие сохранено в базе данных с корректным telegram_id и consent_date
  - Запустить тест на НЕИСПРАВЛЕННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОВАЛИТСЯ (это корректно - доказывает существование бага)
  - Задокументировать найденные контрпримеры для понимания корневой причины:
    - `update_gdpr_consent()` возвращает False для пользователей без призов
    - `get_gdpr_consent_date()` возвращает None даже после вызова `save_gdpr_consent()`
  - Отметить задачу выполненной, когда тест написан, запущен и провал задокументирован
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Написать property-based тесты для preservation (ДО реализации исправления)
  - **Property 2: Preservation** - Существующее поведение флоу согласия
  - **ВАЖНО**: Следовать методологии observation-first
  - Наблюдать поведение на НЕИСПРАВЛЕННОМ коде для операций, не связанных с GDPR:
    - Обработка кнопки "Назад" на экране согласия
    - Валидация кодового слова через `validate_code_word()`
    - Операции с призами: `find_prize()`, `update_delivery_data()`
  - Написать property-based тесты, фиксирующие наблюдаемые паттерны поведения из Preservation Requirements:
    - Для всех новых пользователей (без согласия) система запрашивает согласие
    - Кнопка "Назад" возвращает в главное меню без сохранения согласия
    - После согласия запрашивается кодовое слово
    - Все операции с призами работают идентично
  - Property-based тестирование генерирует множество тестовых случаев для более сильных гарантий
  - Запустить тесты на НЕИСПРАВЛЕННОМ коде
  - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (подтверждает базовое поведение для сохранения)
  - Отметить задачу выполненной, когда тесты написаны, запущены и проходят на неисправленном коде
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Исправление для бага с сохранением GDPR согласия

  - [x] 3.1 Создать модель GdprConsent
    - Создать файл `telegram-bot/database/models/gdpr_consent.py`
    - Определить SQLAlchemy модель с полями: id (PK), telegram_id (unique, indexed), consent_date, created_at, updated_at
    - Добавить уникальный индекс на telegram_id
    - Наследовать от Base класса
    - _Bug_Condition: isBugCondition(input) где input.user_has_no_prizes == TRUE OR input.bot_restarted == TRUE_
    - _Expected_Behavior: Согласие сохраняется в отдельную таблицу gdpr_consents независимо от наличия призов_
    - _Preservation: Не влияет на существующие операции с таблицей prizes_
    - _Requirements: 2.1_

  - [x] 3.2 Создать GdprConsentRepository
    - Создать файл `telegram-bot/database/repositories/gdpr_consent_repository.py`
    - Реализовать методы:
      - `get_consent(telegram_id)` - получить согласие пользователя
      - `save_consent(telegram_id, consent_date)` - сохранить согласие (upsert)
      - `check_consent_exists(telegram_id)` - проверить наличие согласия
    - Наследовать от BaseRepository
    - Добавить логирование времени выполнения
    - _Bug_Condition: isBugCondition(input) где get_gdpr_consent_date(input.telegram_id) == NULL_
    - _Expected_Behavior: Методы работают независимо от таблицы prizes_
    - _Preservation: Не изменяет существующие методы PrizeRepository_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Обновить PrizeService для использования GdprConsentRepository
    - Добавить инициализацию `gdpr_consent_repository` в конструкторе `__init__()`
    - В методе `check_gdpr_consent()`: заменить `prize_repository.get_gdpr_consent_date()` на `gdpr_consent_repository.check_consent_exists()`
    - В методе `save_gdpr_consent()`: заменить `prize_repository.update_gdpr_consent()` на `gdpr_consent_repository.save_consent()`
    - Сохранить всю существующую логику логирования
    - _Bug_Condition: isBugCondition(input) где input.user_gave_consent == TRUE_
    - _Expected_Behavior: Согласие сохраняется и проверяется через новый репозиторий_
    - _Preservation: Все остальные методы PrizeService остаются неизменными_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Создать миграцию Alembic для таблицы gdpr_consents
    - Создать новую миграцию: `alembic revision -m "create_gdpr_consents_table"`
    - В методе `upgrade()`:
      - Создать таблицу `gdpr_consents` с полями: id, telegram_id, consent_date, created_at, updated_at
      - Создать уникальный индекс на telegram_id
      - Перенести существующие данные из `prizes.gdpr_consent_date` в `gdpr_consents`
    - В методе `downgrade()`:
      - Удалить таблицу `gdpr_consents`
    - _Bug_Condition: isBugCondition(input) где данные согласия теряются при отсутствии призов_
    - _Expected_Behavior: Таблица gdpr_consents создана и заполнена существующими данными_
    - _Preservation: Таблица prizes остается неизменной_
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Зарегистрировать модель GdprConsent
    - Добавить импорт в `telegram-bot/database/models/__init__.py`
    - `from database.models.gdpr_consent import GdprConsent`
    - _Bug_Condition: Модель должна быть зарегистрирована для автоматического создания таблицы_
    - _Expected_Behavior: SQLAlchemy видит модель и может создавать таблицу_
    - _Preservation: Не влияет на существующие модели_
    - _Requirements: 2.1_

  - [x] 3.6 Удалить устаревшие методы GDPR из PrizeRepository
    - Удалить метод `get_gdpr_consent_date()` из `prize_repository.py`
    - Удалить метод `update_gdpr_consent()` из `prize_repository.py`
    - Эти методы больше не нужны, так как согласие хранится в отдельной таблице
    - _Bug_Condition: Старые методы создавали зависимость от таблицы prizes_
    - _Expected_Behavior: GDPR логика полностью отделена от PrizeRepository_
    - _Preservation: Все остальные методы PrizeRepository остаются неизменными_
    - _Requirements: 2.1, 2.2_

  - [x] 3.7 Проверить, что тест исследования Bug Condition теперь проходит
    - **Property 1: Expected Behavior** - GDPR Consent Persistence
    - **ВАЖНО**: Перезапустить ТОТ ЖЕ тест из задачи 1 - НЕ писать новый тест
    - Тест из задачи 1 кодирует ожидаемое поведение
    - Когда этот тест проходит, это подтверждает, что ожидаемое поведение выполнено
    - Запустить тест исследования Bug Condition из шага 1
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тест ПРОХОДИТ (подтверждает, что баг исправлен)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.8 Проверить, что preservation тесты все еще проходят
    - **Property 2: Preservation** - Существующее поведение флоу согласия
    - **ВАЖНО**: Перезапустить ТЕ ЖЕ тесты из задачи 2 - НЕ писать новые тесты
    - Запустить preservation property тесты из шага 2
    - **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**: Тесты ПРОХОДЯТ (подтверждает отсутствие регрессий)
    - Подтвердить, что все тесты все еще проходят после исправления (нет регрессий)

- [x] 4. Checkpoint - Убедиться, что все тесты проходят
  - Запустить все тесты и убедиться, что они проходят
  - Если возникают вопросы, обратиться к пользователю
