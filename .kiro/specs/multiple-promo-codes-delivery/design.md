# Технический дизайн: Выдача нескольких промокодов

## Overview

Данный дизайн описывает реализацию функциональности выдачи нескольких цифровых призов (промокодов) в одном сообщении Telegram-бота. Система должна корректно парсить данные из PostgreSQL, где несколько промокодов и инструкций хранятся в виде строк, разделённых символом тильды `~`, и формировать единое сообщение с правильным форматированием для удобного копирования пользователем.

Основная задача — обеспечить модульную, масштабируемую архитектуру с чёткой ответственностью каждого компонента, интегрируясь с существующей системой без нарушения текущей логики.

## Architecture

### Общая архитектура

Система состоит из трёх основных компонентов:

1. **PromoCodeParser** — модуль парсинга промокодов и инструкций из базы данных
2. **MessageFormatter** — модуль форматирования сообщений с промокодами
3. **PrizeHandler** — существующий обработчик призов (модифицируется для интеграции)

```
┌─────────────────────────────────────────────────────────────┐
│                      Telegram Bot                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PrizeHandler                            │
│  (telegram-bot/handlers/prize_handler.py)                   │
│                                                              │
│  • Получает данные приза из PrizeService                    │
│  • Вызывает PromoCodeParser для разбора промокодов          │
│  • Вызывает MessageFormatter для форматирования             │
│  • Отправляет сообщение пользователю                        │
└─────────────────────────────────────────────────────────────┘
                    │                      │
                    ▼                      ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│   PromoCodeParser        │   │   MessageFormatter           │
│   (utils/promo_parser.py)│   │   (utils/message_formatter.py)│
│                          │   │                              │
│  • parse_promo_codes()   │   │  • format_multiple_promos()  │
│  • parse_instructions()  │   │  • escape_markdown()         │
│  • combine_data()        │   │  • format_single_promo()     │
└──────────────────────────┘   └──────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
│                                                              │
│  prizes table:                                               │
│    • promo_code: "CODE1~CODE2~CODE3"                        │
│    • instructions: "Инструкция1~Инструкция2~Инструкция3"    │
└─────────────────────────────────────────────────────────────┘
```

### Поток данных

1. Пользователь вводит кодовое слово
2. `PrizeHandler` получает данные приза из `PrizeService`
3. `PromoCodeParser` разбирает строки промокодов и инструкций
4. `MessageFormatter` формирует итоговое сообщение
5. `PrizeHandler` отправляет сообщение пользователю с кнопкой возврата

### Принципы проектирования

- **Модульность**: каждый компонент в отдельном файле с чёткой ответственностью
- **Обратная совместимость**: система корректно работает с одним промокодом (существующий формат)
- **Расширяемость**: легко добавить новые форматы или типы промокодов
- **Отказоустойчивость**: обработка всех граничных случаев с логированием
- **Безопасность**: экранирование специальных символов для предотвращения инъекций

## Components and Interfaces

### 1. PromoCodeParser

**Файл**: `telegram-bot/utils/promo_parser.py`

**Назначение**: Парсинг и валидация промокодов и инструкций из базы данных.

**Интерфейс**:

```python
from typing import List, Optional
from dataclasses import dataclass

@dataclass
class PromoCodeData:
    """
    Структура данных для одного промокода с инструкцией
    
    Attributes:
        promo_code: Промокод
        instructions: Инструкция по использованию
    """
    promo_code: str
    instructions: str

class PromoCodeParser:
    """Парсер промокодов и инструкций из базы данных"""
    
    SEPARATOR: str = "~"
    DEFAULT_INSTRUCTION: str = "Используйте промокод при оформлении заказа"
    
    @staticmethod
    def parse_promo_codes(promo_code_string: Optional[str]) -> List[str]:
        """
        Парсит строку с промокодами, разделёнными тильдой
        
        Args:
            promo_code_string: Строка с промокодами (например "CODE1~CODE2~CODE3")
            
        Returns:
            Список промокодов (пустой список если строка пустая или None)
            
        Validates: Requirements 1.1, 1.5, 5.2, 5.3
        """
        pass
    
    @staticmethod
    def parse_instructions(instructions_string: Optional[str]) -> List[str]:
        """
        Парсит строку с инструкциями, разделёнными тильдой
        
        Args:
            instructions_string: Строка с инструкциями (например "Инстр1~Инстр2~Инстр3")
            
        Returns:
            Список инструкций (пустой список если строка пустая или None)
            
        Validates: Requirements 1.2, 1.5, 5.3
        """
        pass
    
    @staticmethod
    def combine_promo_data(
        promo_codes: List[str],
        instructions: List[str],
        telegram_id: int,
        prize_id: Optional[int] = None
    ) -> List[PromoCodeData]:
        """
        Объединяет промокоды и инструкции в единую структуру данных
        
        Args:
            promo_codes: Список промокодов
            instructions: Список инструкций
            telegram_id: Telegram ID пользователя (для логирования)
            prize_id: ID приза (для логирования, опционально)
            
        Returns:
            Список PromoCodeData с парами промокод-инструкция
            
        Validates: Requirements 1.3, 1.4
        
        Логика:
        - Если количество промокодов == количество инструкций: связываем по индексу
        - Если инструкций меньше: используем DEFAULT_INSTRUCTION для недостающих
        - Если инструкций больше: игнорируем лишние инструкции
        - Логирует предупреждение при несоответствии количества
        """
        pass
```

**Алгоритм `parse_promo_codes`**:
1. Проверить, что строка не None и не пустая
2. Разделить строку по символу `~`
3. Для каждого элемента: удалить пробелы с краёв (strip)
4. Отфильтровать пустые элементы (обработка множественных `~`)
5. Вернуть список промокодов

**Алгоритм `combine_promo_data`**:
1. Получить длины списков промокодов и инструкций
2. Если длины не совпадают — логировать предупреждение
3. Для каждого промокода по индексу:
   - Если есть инструкция с таким индексом — использовать её
   - Иначе — использовать DEFAULT_INSTRUCTION
4. Создать список PromoCodeData
5. Вернуть результат

### 2. MessageFormatter

**Файл**: `telegram-bot/utils/message_formatter.py`

**Назначение**: Форматирование сообщений с промокодами для Telegram.

**Интерфейс**:

```python
from typing import List
from utils.promo_parser import PromoCodeData

class MessageFormatter:
    """Форматтер сообщений с промокодами для Telegram"""
    
    TELEGRAM_MESSAGE_LIMIT: int = 4096
    CONGRATULATIONS_TEXT: str = "Поздравляем с победой и надеемся снова увидеть вас среди наших участников и победителей :)"
    MENU_PROMPT_TEXT: str = "Если вы выиграли в конкурсе и знаете кодовое слово, нажмите «Получить приз»."
    
    @staticmethod
    def format_multiple_promos(
        promo_data_list: List[PromoCodeData],
        telegram_id: int
    ) -> str:
        """
        Форматирует сообщение с несколькими промокодами
        
        Args:
            promo_data_list: Список данных промокодов с инструкциями
            telegram_id: Telegram ID пользователя (для логирования)
            
        Returns:
            Отформатированное сообщение в HTML формате
            
        Validates: Requirements 2.1, 2.2, 3.1-3.7, 4.1, 4.2
        
        Формат сообщения:
        - Поздравление
        - Пустая строка
        - Первый промокод: "Вот ваш промокод — <code>CODE1</code>\nИнструкция1"
        - Последующие: "\nТакже вот ещё — <code>CODE2</code>\nИнструкция2"
        - Пустая строка
        - Текст кнопки меню
        """
        pass
    
    @staticmethod
    def format_single_promo(promo_data: PromoCodeData) -> str:
        """
        Форматирует сообщение с одним промокодом (обратная совместимость)
        
        Args:
            promo_data: Данные промокода с инструкцией
            
        Returns:
            Отформатированное сообщение в HTML формате
            
        Validates: Requirements 6.5
        
        Формат: "Вот ваш промокод — <code>CODE</code>\nИнструкция"
        """
        pass
    
    @staticmethod
    def escape_html(text: str) -> str:
        """
        Экранирует специальные HTML символы
        
        Args:
            text: Исходный текст
            
        Returns:
            Текст с экранированными символами
            
        Validates: Requirements 2.4
        
        Экранирует: <, >, &
        """
        pass
    
    @staticmethod
    def split_message_if_needed(
        message: str,
        telegram_id: int
    ) -> List[str]:
        """
        Разделяет сообщение на части, если превышен лимит Telegram
        
        Args:
            message: Исходное сообщение
            telegram_id: Telegram ID пользователя (для логирования)
            
        Returns:
            Список частей сообщения (один элемент если не превышен лимит)
            
        Validates: Requirements 5.5
        
        Логика:
        - Если длина <= 4096: вернуть [message]
        - Иначе: разделить по блокам промокод+инструкция
        - Логировать предупреждение о разделении
        """
        pass
```

**Алгоритм `format_multiple_promos`**:
1. Начать с текста поздравления + `\n\n`
2. Для первого промокода:
   - Добавить "Вот ваш промокод — `<code>{promo_code}</code>`\n{instructions}\n\n"
3. Для остальных промокодов (индекс >= 1):
   - Добавить "Также вот ещё — `<code>{promo_code}</code>`\n{instructions}\n\n"
4. Добавить текст кнопки меню
5. Проверить длину сообщения
6. Если > 4096 — логировать предупреждение и вызвать split_message_if_needed
7. Вернуть сообщение

**Алгоритм `split_message_if_needed`**:
1. Если длина <= 4096: вернуть [message]
2. Логировать предупреждение
3. Разделить сообщение на блоки по "\n\n"
4. Группировать блоки в части, не превышающие 4096 символов
5. Сохранить структуру (поздравление в первой части, меню в последней)
6. Вернуть список частей

### 3. Модификация PrizeHandler

**Файл**: `telegram-bot/handlers/prize_handler.py`

**Изменения**:

Модифицировать метод `_send_digital_prize` для поддержки нескольких промокодов:

```python
async def _send_digital_prize(
    self, 
    message: Message, 
    prize_result, 
    session_id: Optional[int] = None
) -> None:
    """
    Отправляет цифровой приз (один или несколько промокодов)
    
    Args:
        message: Сообщение пользователя
        prize_result: Результат проверки приза с промокодом(ами)
        session_id: ID сессии из middleware (опционально)
        
    Validates: Requirements 6.1, 6.2, 6.3, 6.4
    """
    from utils.promo_parser import PromoCodeParser
    from utils.message_formatter import MessageFormatter
    from keyboards.reply_keyboards import get_main_menu_keyboard
    
    telegram_id = message.from_user.id
    
    # Парсинг промокодов и инструкций
    promo_codes = PromoCodeParser.parse_promo_codes(prize_result.promo_code)
    instructions = PromoCodeParser.parse_instructions(prize_result.instructions)
    
    # Обработка случая отсутствия промокодов
    if not promo_codes:
        logger.error(
            "no_promo_codes_after_parsing",
            telegram_id=telegram_id,
            prize_id=getattr(prize_result, 'prize_id', None)
        )
        await message.answer(MISSING_PROMO_CODE_ERROR)
        return
    
    # Объединение данных
    promo_data_list = PromoCodeParser.combine_promo_data(
        promo_codes=promo_codes,
        instructions=instructions,
        telegram_id=telegram_id,
        prize_id=getattr(prize_result, 'prize_id', None)
    )
    
    # Форматирование сообщения
    text = MessageFormatter.format_multiple_promos(
        promo_data_list=promo_data_list,
        telegram_id=telegram_id
    )
    
    # Разделение сообщения если необходимо
    message_parts = MessageFormatter.split_message_if_needed(text, telegram_id)
    
    # Отправка сообщения(й)
    for i, part in enumerate(message_parts):
        # Кнопка только в последнем сообщении
        keyboard = get_main_menu_keyboard() if i == len(message_parts) - 1 else None
        
        await message.answer(
            part,
            parse_mode="HTML",
            reply_markup=keyboard
        )
        
        # Сохранение ответа бота
        if self.session_manager and session_id:
            try:
                await self.session_manager.save_bot_message(
                    session_id=session_id,
                    message_text=part
                )
            except Exception as e:
                logger.error(
                    "failed_to_save_bot_response",
                    session_id=session_id,
                    error=str(e)
                )
    
    logger.info(
        "digital_prize_sent",
        telegram_id=telegram_id,
        promo_count=len(promo_codes),
        message_parts=len(message_parts)
    )
```

## Data Models

### PromoCodeData

```python
@dataclass
class PromoCodeData:
    """
    Структура данных для одного промокода с инструкцией
    
    Attributes:
        promo_code: Промокод (обязательное поле)
        instructions: Инструкция по использованию (обязательное поле)
    """
    promo_code: str
    instructions: str
```

### Модификация Prize Model

Модель `Prize` в `telegram-bot/database/models/prize.py` уже содержит необходимые поля:
- `promo_code: Optional[str]` — строка с промокодами, разделёнными `~`
- `instructions: Optional[str]` — строка с инструкциями, разделёнными `~`

Изменений в модель не требуется.

### Примеры данных

**Один промокод**:
```python
promo_code = "SUMMER2024"
instructions = "Используйте промокод при оформлении заказа"
```

**Несколько промокодов**:
```python
promo_code = "PROMO1~PROMO2~PROMO3"
instructions = "Скидка 10% на первый заказ~Бесплатная доставка~Подарок при заказе от 1000₽"
```

**Несоответствие количества** (обрабатывается):
```python
promo_code = "CODE1~CODE2~CODE3"
instructions = "Инструкция1~Инструкция2"
# Результат: CODE3 получит инструкцию по умолчанию
```


## Correctness Properties

*Свойство корректности — это характеристика или поведение, которое должно выполняться для всех допустимых выполнений системы. По сути, это формальное утверждение о том, что должна делать система. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.*


### Property Reflection

После анализа всех критериев приёмки, выполнен анализ на избыточность свойств:

**Объединённые свойства:**
- 2.1 и 2.2 объединены: оба проверяют обёртывание промокодов в теги `<code>`
- 1.4 и 5.4 объединены: оба проверяют использование инструкции по умолчанию при отсутствии

**Исключённые свойства:**
- 2.3: MarkdownV2 не используется в текущей реализации (только HTML)
- 4.3, 4.4: интеграционные тесты UI, не unit-тесты свойств
- 6.1-6.4: архитектурные требования, не функциональные свойства
- 7.1-7.4: требования к логированию, проверяются в интеграционных тестах

**Граничные случаи (edge cases):**
- 1.5: пустые/NULL строки
- 5.1: отсутствие промокодов в БД
- 5.2: один промокод без разделителя

**Примеры (examples):**
- 3.3: формат для одного промокода
- 6.5: обратная совместимость

### Correctness Properties

### Property 1: Парсинг промокодов по разделителю

*For any* строка с промокодами, разделёнными символом `~`, парсер должен вернуть массив промокодов, где количество элементов равно количеству разделителей плюс один (если строка не пустая).

**Validates: Requirements 1.1**

### Property 2: Парсинг инструкций по разделителю

*For any* строка с инструкциями, разделёнными символом `~`, парсер должен вернуть массив инструкций, где количество элементов равно количеству разделителей плюс один (если строка не пустая).

**Validates: Requirements 1.2**

### Property 3: Связывание промокодов и инструкций по индексу

*For any* два массива одинаковой длины (промокоды и инструкции), функция combine_promo_data должна вернуть массив PromoCodeData, где каждый элемент содержит промокод и инструкцию с соответствующим индексом.

**Validates: Requirements 1.3**

### Property 4: Использование инструкции по умолчанию при несоответствии

*For any* массив промокодов длиной N и массив инструкций длиной M, где N > M, функция combine_promo_data должна использовать DEFAULT_INSTRUCTION для промокодов с индексами >= M.

**Validates: Requirements 1.4, 5.4**

### Property 5: Фильтрация пустых элементов при множественных разделителях

*For any* строка с множественными последовательными разделителями `~` (например "CODE1~~CODE2"), парсер должен отфильтровать пустые элементы и вернуть только непустые промокоды.

**Validates: Requirements 5.3**

### Property 6: Обёртывание промокодов в HTML теги

*For any* список PromoCodeData, отформатированное сообщение должно содержать каждый промокод, обёрнутый в теги `<code>` и `</code>`.

**Validates: Requirements 2.1, 2.2**

### Property 7: Экранирование специальных HTML символов

*For any* текст, содержащий специальные HTML символы (`<`, `>`, `&`), функция escape_html должна заменить их на соответствующие HTML entities (`&lt;`, `&gt;`, `&amp;`).

**Validates: Requirements 2.4**

### Property 8: Начало сообщения с поздравления

*For any* список PromoCodeData, отформатированное сообщение должно начинаться с текста "Поздравляем с победой и надеемся снова увидеть вас среди наших участников и победителей :)" с последующей пустой строкой.

**Validates: Requirements 3.1, 3.2**

### Property 9: Формат первого промокода при множественных

*For any* список PromoCodeData длиной N > 1, первый блок промокода в сообщении должен иметь формат "Вот ваш промокод — `<code>{promo_code}</code>`\n{instructions}".

**Validates: Requirements 3.4**

### Property 10: Формат последующих промокодов

*For any* список PromoCodeData длиной N > 1, каждый блок промокода с индексом i >= 1 должен иметь формат "\nТакже вот ещё — `<code>{promo_code}</code>`\n{instructions}".

**Validates: Requirements 3.5**

### Property 11: Разделение блоков пустой строкой

*For any* список PromoCodeData длиной N >= 2, между каждым блоком промокод+инструкция должна быть пустая строка (`\n\n`).

**Validates: Requirements 3.6**

### Property 12: Сохранение порядка промокодов

*For any* список PromoCodeData с элементами в определённом порядке, отформатированное сообщение должно содержать промокоды в том же порядке.

**Validates: Requirements 3.7**

### Property 13: Окончание сообщения текстом кнопки

*For any* список PromoCodeData, отформатированное сообщение должно заканчиваться текстом "Если вы выиграли в конкурсе и знаете кодовое слово, нажмите «Получить приз»." с предшествующей пустой строкой.

**Validates: Requirements 4.1, 4.2**

### Property 14: Разделение длинных сообщений

*For any* сообщение длиной более 4096 символов, функция split_message_if_needed должна вернуть массив строк, где каждая строка не превышает 4096 символов, и структура сообщения сохранена (поздравление в первой части, текст кнопки в последней).

**Validates: Requirements 5.5**

### Property 15: Round-trip парсинга и форматирования (идемпотентность)

*For any* список промокодов и инструкций, если мы объединим их в строки с разделителем `~`, затем распарсим обратно и отформатируем, количество промокодов в результате должно совпадать с исходным количеством.

**Validates: Requirements 1.1, 1.2, 1.3 (комплексная проверка)**

## Error Handling

### Обработка ошибок парсинга

**PromoCodeParser**:

1. **Пустые или NULL строки**:
   - Возвращать пустой список `[]`
   - Логировать информационное сообщение
   - Не выбрасывать исключения

2. **Множественные разделители**:
   - Фильтровать пустые элементы после split
   - Логировать предупреждение если обнаружены пустые элементы
   - Продолжать обработку

3. **Несоответствие количества промокодов и инструкций**:
   - Логировать предупреждение с указанием telegram_id и prize_id
   - Использовать DEFAULT_INSTRUCTION для недостающих инструкций
   - Продолжать обработку

**Пример логирования**:
```python
logger.warning(
    "promo_instructions_count_mismatch",
    telegram_id=telegram_id,
    prize_id=prize_id,
    promo_count=len(promo_codes),
    instructions_count=len(instructions)
)
```

### Обработка ошибок форматирования

**MessageFormatter**:

1. **Превышение лимита Telegram (4096 символов)**:
   - Логировать предупреждение
   - Разделить сообщение на части
   - Сохранить структуру (поздравление в начале, меню в конце)
   - Продолжать обработку

2. **Специальные символы в промокодах**:
   - Экранировать HTML символы (`<`, `>`, `&`)
   - Не выбрасывать исключения
   - Продолжать обработку

**Пример логирования**:
```python
logger.warning(
    "message_exceeds_telegram_limit",
    telegram_id=telegram_id,
    message_length=len(message),
    limit=4096,
    parts_count=len(parts)
)
```

### Обработка ошибок в PrizeHandler

**PrizeHandler._send_digital_prize**:

1. **Отсутствие промокодов после парсинга**:
   - Логировать ошибку
   - Отправить пользователю сообщение `MISSING_PROMO_CODE_ERROR`
   - Прервать выполнение (return)

2. **Ошибка сохранения сообщения в session_manager**:
   - Логировать ошибку
   - Продолжать выполнение (не критично)

3. **Ошибка отправки сообщения в Telegram**:
   - Логировать ошибку с полным traceback
   - Пробросить исключение наверх для глобального обработчика

**Пример обработки**:
```python
if not promo_codes:
    logger.error(
        "no_promo_codes_after_parsing",
        telegram_id=telegram_id,
        prize_id=getattr(prize_result, 'prize_id', None)
    )
    await message.answer(MISSING_PROMO_CODE_ERROR)
    return
```

### Стратегия восстановления

1. **Graceful degradation**: при ошибках парсинга использовать значения по умолчанию
2. **Fail-fast**: при критических ошибках (отсутствие промокодов) немедленно прерывать выполнение
3. **Логирование**: все ошибки и предупреждения логируются с контекстом (telegram_id, prize_id)
4. **Пользовательские сообщения**: понятные сообщения об ошибках для пользователя

## Testing Strategy

### Dual Testing Approach

Система тестирования использует два взаимодополняющих подхода:

1. **Unit Tests**: проверка конкретных примеров, граничных случаев и условий ошибок
2. **Property-Based Tests**: проверка универсальных свойств на большом количестве сгенерированных входных данных

### Property-Based Testing

**Библиотека**: `hypothesis` (для Python)

**Конфигурация**:
- Минимум 100 итераций на каждый тест
- Каждый тест помечен комментарием с ссылкой на свойство из дизайна

**Формат тега**:
```python
# Feature: multiple-promo-codes-delivery, Property 1: Парсинг промокодов по разделителю
```

**Примеры property-based тестов**:

```python
from hypothesis import given, strategies as st
from utils.promo_parser import PromoCodeParser

# Feature: multiple-promo-codes-delivery, Property 1: Парсинг промокодов по разделителю
@given(st.lists(st.text(min_size=1, max_size=50), min_size=1, max_size=10))
def test_parse_promo_codes_count(promo_codes_list):
    """
    Property: количество элементов после парсинга равно количеству промокодов
    """
    promo_string = "~".join(promo_codes_list)
    result = PromoCodeParser.parse_promo_codes(promo_string)
    assert len(result) == len(promo_codes_list)

# Feature: multiple-promo-codes-delivery, Property 5: Фильтрация пустых элементов
@given(st.lists(st.text(min_size=1, max_size=50), min_size=1, max_size=10))
def test_parse_filters_empty_elements(promo_codes_list):
    """
    Property: множественные разделители не создают пустые элементы
    """
    promo_string = "~~".join(promo_codes_list)  # Двойные разделители
    result = PromoCodeParser.parse_promo_codes(promo_string)
    assert all(code.strip() != "" for code in result)

# Feature: multiple-promo-codes-delivery, Property 15: Round-trip
@given(
    st.lists(st.text(min_size=1, max_size=50), min_size=1, max_size=10),
    st.lists(st.text(min_size=1, max_size=100), min_size=1, max_size=10)
)
def test_parse_format_roundtrip(promo_codes, instructions):
    """
    Property: парсинг и форматирование сохраняют количество промокодов
    """
    promo_string = "~".join(promo_codes)
    instr_string = "~".join(instructions)
    
    parsed_promos = PromoCodeParser.parse_promo_codes(promo_string)
    parsed_instrs = PromoCodeParser.parse_instructions(instr_string)
    
    assert len(parsed_promos) == len(promo_codes)
    assert len(parsed_instrs) == len(instructions)
```

### Unit Testing

**Фреймворк**: `pytest`

**Фокус unit-тестов**:
- Конкретные примеры использования
- Граничные случаи (edge cases)
- Условия ошибок
- Интеграция между компонентами

**Примеры unit-тестов**:

```python
import pytest
from utils.promo_parser import PromoCodeParser, PromoCodeData
from utils.message_formatter import MessageFormatter

class TestPromoCodeParser:
    """Unit тесты для PromoCodeParser"""
    
    def test_parse_single_promo_code(self):
        """Граничный случай: один промокод без разделителя"""
        result = PromoCodeParser.parse_promo_codes("SUMMER2024")
        assert result == ["SUMMER2024"]
    
    def test_parse_empty_string(self):
        """Граничный случай: пустая строка"""
        result = PromoCodeParser.parse_promo_codes("")
        assert result == []
    
    def test_parse_none(self):
        """Граничный случай: None"""
        result = PromoCodeParser.parse_promo_codes(None)
        assert result == []
    
    def test_combine_mismatched_lengths(self):
        """Пример: несоответствие количества промокодов и инструкций"""
        promos = ["CODE1", "CODE2", "CODE3"]
        instrs = ["Инструкция1", "Инструкция2"]
        
        result = PromoCodeParser.combine_promo_data(promos, instrs, 12345)
        
        assert len(result) == 3
        assert result[0].instructions == "Инструкция1"
        assert result[1].instructions == "Инструкция2"
        assert result[2].instructions == PromoCodeParser.DEFAULT_INSTRUCTION

class TestMessageFormatter:
    """Unit тесты для MessageFormatter"""
    
    def test_format_single_promo(self):
        """Пример: форматирование одного промокода (обратная совместимость)"""
        data = PromoCodeData(
            promo_code="SUMMER2024",
            instructions="Скидка 10%"
        )
        
        result = MessageFormatter.format_multiple_promos([data], 12345)
        
        assert "Поздравляем с победой" in result
        assert "<code>SUMMER2024</code>" in result
        assert "Скидка 10%" in result
        assert "Вот ваш промокод —" in result
        assert "Также вот ещё —" not in result  # Не должно быть для одного
    
    def test_format_multiple_promos(self):
        """Пример: форматирование нескольких промокодов"""
        data = [
            PromoCodeData("CODE1", "Инструкция1"),
            PromoCodeData("CODE2", "Инструкция2"),
            PromoCodeData("CODE3", "Инструкция3")
        ]
        
        result = MessageFormatter.format_multiple_promos(data, 12345)
        
        assert result.count("<code>") == 3
        assert "Вот ваш промокод —" in result
        assert result.count("Также вот ещё —") == 2
    
    def test_escape_html_special_chars(self):
        """Пример: экранирование специальных символов"""
        text = "Test <script>alert('XSS')</script> & more"
        result = MessageFormatter.escape_html(text)
        
        assert "&lt;" in result
        assert "&gt;" in result
        assert "&amp;" in result
        assert "<script>" not in result
    
    def test_split_long_message(self):
        """Граничный случай: сообщение превышает лимит Telegram"""
        # Создаём очень длинный список промокодов
        data = [
            PromoCodeData(f"CODE{i}", "Инструкция " * 50)
            for i in range(50)
        ]
        
        message = MessageFormatter.format_multiple_promos(data, 12345)
        parts = MessageFormatter.split_message_if_needed(message, 12345)
        
        assert len(parts) > 1
        for part in parts:
            assert len(part) <= 4096

class TestPrizeHandlerIntegration:
    """Интеграционные тесты для PrizeHandler"""
    
    @pytest.mark.asyncio
    async def test_send_digital_prize_with_multiple_promos(self, mock_message):
        """Интеграция: отправка нескольких промокодов"""
        # Тест интеграции между компонентами
        pass
```

### Test Coverage Goals

- **PromoCodeParser**: 100% покрытие (простая логика)
- **MessageFormatter**: 100% покрытие (простая логика)
- **PrizeHandler._send_digital_prize**: 90%+ покрытие (исключая сложные async случаи)

### Continuous Testing

- Запуск property-based тестов на каждый commit
- Запуск unit-тестов на каждый pull request
- Интеграционные тесты перед деплоем в production

