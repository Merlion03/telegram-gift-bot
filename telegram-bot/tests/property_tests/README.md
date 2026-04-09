# Property-Based Tests для bot-messages-tracking

Эта директория содержит property-based тесты с использованием библиотеки Hypothesis для проверки универсальных свойств корректности системы отслеживания сообщений бота.

## Структура тестов

### Properties 1-4: Сохранение системных команд
- `test_property_01_system_commands.py` - Сохранение системных команд без фильтрации
- `test_property_02_session_creation.py` - Создание сессии при системной команде
- `test_property_03_command_text.py` - Полнота текста системной команды
- `test_property_04_last_activity.py` - Обновление времени активности сессии

### Properties 5-8: Сохранение ответов бота
- `test_property_05_bot_message_type.py` - Сохранение ответов бота с правильным типом
- `test_property_06_text_only.py` - Сохранение только текстового содержимого
- `test_property_07_bot_telegram_id.py` - Системный идентификатор для ответов бота
- `test_property_08_bot_session_link.py` - Связь ответа бота с сессией

### Properties 17-18: Обратная совместимость
- `test_property_17_18_backward_compatibility.py` - Обратная совместимость текстовых и медиа-сообщений

### Properties 23-26: Производительность и масштабируемость
- `test_property_23_26_performance.py` - Производительность сохранения, обработка ошибок, параллельная обработка

### Properties 27-30: Логирование и отладка
- `test_property_27_30_logging.py` - Логирование сохранения команд, ответов бота, ошибок, операций с сессиями

## Запуск тестов

### Запуск всех property-based тестов
```bash
pytest tests/property_tests/ -v -m pbt
```

### Запуск с показом статистики Hypothesis
```bash
pytest tests/property_tests/ -v --hypothesis-show-statistics
```

### Запуск конкретного теста
```bash
pytest tests/property_tests/test_property_01_system_commands.py -v
```

## Конфигурация

Все property-based тесты настроены на выполнение минимум 100 итераций (`@settings(max_examples=100)`), за исключением тестов производительности, которые используют 50 итераций для ускорения.

## Маркеры

Все property-based тесты помечены маркером `@pytest.mark.pbt` для удобной фильтрации.

## Validates

Каждый тест содержит комментарий с указанием, какие requirements он проверяет:
- Requirements 1.1-1.5: Сохранение системных команд
- Requirements 2.1-2.6: Сохранение ответов бота
- Requirements 6.1-6.2: Обратная совместимость
- Requirements 7.1-7.5: Производительность и масштабируемость
- Requirements 8.1-8.4: Логирование и отладка
