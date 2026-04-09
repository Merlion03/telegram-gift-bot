# Документ дизайна: bot-messages-tracking

## Обзор

### Цель

Обеспечить полную прозрачность диалога между партнёром и ботом для администраторов путём отслеживания системных команд (например, `/start`, `/help`) и автоматических ответов бота в админ-панели.

### Проблема

В настоящее время система отслеживает только сообщения, которые администратор отправляет партнёру. Системные команды от партнёра фильтруются в `MessageInterceptor` через список `SYSTEM_COMMANDS`, а ответы бота не всегда корректно сохраняются. Это создаёт неполную картину диалога для администраторов.

### Решение

Минимальные изменения в существующий код:
1. Убрать фильтрацию системных команд в `MessageInterceptor._is_system_command()` при сохранении сообщений
2. Проверить и обеспечить корректное сохранение всех ответов бота через `SessionManager.save_bot_message()`
3. Убедиться, что `ChatWindow.tsx` корректно отображает сообщения типа `from_bot` (уже реализовано)

### Границы

**В рамках фичи:**
- Сохранение системных команд (`/start`, `/help`) в базу данных
- Сохранение всех ответов бота на команды
- Отображение системных команд и ответов бота в админ-панели
- Real-time обновления через WebSocket для сообщений бота

**Вне рамок фичи:**
- Сохранение inline keyboard кнопок (они удаляются после взаимодействия)
- Изменение схемы базы данных (работаем с существующей)
- Изменение WebSocket архитектуры (уже настроена)
- Изменение визуального стиля `ChatWindow.tsx` (уже реализован)

## Архитектура

### Текущая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Bot API                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              MessageInterceptor (Middleware)                 │
│  - Перехватывает все входящие сообщения                     │
│  - Фильтрует системные команды (/start, /help) ❌           │
│  - Создаёт/получает активную сессию                         │
│  - Сохраняет сообщения пользователя                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Handlers Layer                             │
│  - CommonHandler: обрабатывает /start, /help                │
│  - SupportHandler: режим поддержки                          │
│  - PrizeFlowHandler: процесс получения приза                │
│  - Другие handlers...                                        │
│                                                              │
│  Каждый handler вызывает save_bot_message() ✅               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   SessionManager                             │
│  - save_user_message(): сохраняет сообщения пользователя    │
│  - save_bot_message(): сохраняет ответы бота                │
│  - get_or_create_session(): управление сессиями             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  SupportRepository                           │
│  - save_message(): сохранение в БД                          │
│  - Триггер PostgreSQL: отправка через WebSocket             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket System                          │
│  - Real-time передача сообщений в админ-панель              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              ChatWindow.tsx (Admin Panel)                    │
│  - Отображает сообщения from_user                           │
│  - Отображает сообщения from_bot (фиолетовый фон, 🤖)       │
│  - Отображает сообщения from_support                        │
└─────────────────────────────────────────────────────────────┘
```

### Изменения в архитектуре

```
┌─────────────────────────────────────────────────────────────┐
│              MessageInterceptor (Middleware)                 │
│  - Перехватывает все входящие сообщения                     │
│  - НЕ фильтрует системные команды ✅ ИЗМЕНЕНИЕ              │
│  - Создаёт/получает активную сессию                         │
│  - Сохраняет ВСЕ сообщения пользователя (включая команды)   │
└─────────────────────────────────────────────────────────────┘
```

Все остальные компоненты остаются без изменений. Handlers уже корректно вызывают `save_bot_message()`, WebSocket система работает, `ChatWindow.tsx` поддерживает отображение сообщений бота.

### Принципы дизайна

1. **Минимальные изменения**: Изменяем только логику фильтрации в `MessageInterceptor`
2. **Обратная совместимость**: Существующая функциональность не нарушается
3. **Модульность**: Каждый компонент сохраняет свою ответственность
4. **Прозрачность**: Полная история диалога доступна администраторам

## Компоненты и интерфейсы

### 1. MessageInterceptor (Изменения)

**Файл:** `telegram-bot/middleware/message_interceptor.py`

**Текущая реализация:**
```python
def _is_system_command(self, message: Message) -> bool:
    """Проверяет, является ли сообщение системной командой"""
    if not message.text:
        return False
    
    text = message.text.strip()
    for command in SYSTEM_COMMANDS:
        if text.startswith(command):
            return True
    
    return False

async def __call__(self, handler, event, data):
    # ...
    # Фильтруем системные команды
    if self._is_system_command(event):
        logger.debug("system_command_skipped", ...)
        return await handler(event, data)
    # ...
```

**Новая реализация:**
```python
async def __call__(self, handler, event, data):
    # ...
    # УБИРАЕМ фильтрацию системных команд при сохранении
    # Команды должны сохраняться в историю диалога
    
    # Сохраняем сообщение (включая системные команды)
    if not in_support_mode and not has_media:
        message_text = self._extract_message_text(event)
        file_id = self._extract_file_id(event)
        
        await self.session_manager.save_user_message(
            session_id=session_id,
            telegram_id=telegram_id,
            message_text=message_text,
            file_id=file_id
        )
    # ...
```

**Изменения:**
- Убрать проверку `if self._is_system_command(event)` перед сохранением сообщения
- Метод `_is_system_command()` можно оставить для других целей или удалить, если не используется
- Все остальные проверки (режим поддержки, медиа) остаются без изменений

**Интерфейс (без изменений):**
```python
class MessageInterceptor:
    async def __call__(
        self,
        handler: Callable,
        event: Message,
        data: dict
    ) -> Any:
        """Перехватывает сообщение, создаёт/обновляет сессию, сохраняет сообщение"""
```

### 2. SessionManager (Без изменений)

**Файл:** `telegram-bot/services/session_manager.py`

**Интерфейс:**
```python
class SessionManager:
    async def save_user_message(
        self,
        session_id: int,
        telegram_id: int,
        message_text: str,
        file_id: Optional[str] = None
    ) -> int:
        """Сохраняет сообщение пользователя"""
    
    async def save_bot_message(
        self,
        session_id: int,
        message_text: str
    ) -> int:
        """Сохраняет ответ бота с telegram_id=0 и message_type='from_bot'"""
```

**Проверка:** Убедиться, что все handlers корректно вызывают `save_bot_message()` после отправки ответа пользователю.

### 3. Handlers (Проверка существующей реализации)

**Файлы:**
- `telegram-bot/handlers/common_handler.py`
- `telegram-bot/handlers/support_handler.py`
- `telegram-bot/handlers/prize_flow_handler.py`
- Другие handlers...

**Требование:** Каждый handler, который отправляет ответ пользователю через `message.answer()`, должен вызывать `save_bot_message()`.

**Паттерн:**
```python
async def handle_command(self, message: Message, session_id: Optional[int] = None):
    # Отправка ответа пользователю
    await message.answer(RESPONSE_TEXT)
    
    # Сохранение ответа бота
    if self.session_manager and session_id:
        try:
            await self.session_manager.save_bot_message(
                session_id=session_id,
                message_text=RESPONSE_TEXT
            )
        except Exception as e:
            logger.error("failed_to_save_bot_response", ...)
```

**Проверка:** Пройтись по всем handlers и убедиться, что паттерн соблюдается.

### 4. ChatWindow.tsx (Без изменений)

**Файл:** `nextjs-app/components/admin/ChatWindow.tsx`

**Текущая реализация:** Уже поддерживает отображение сообщений типа `from_bot` с фиолетовым фоном и иконкой 🤖.

```typescript
const isFromBot = message.message_type === 'from_bot';

// Стиль для сообщений бота
className={`rounded-2xl px-4 py-2 ${
  isFromBot
    ? 'bg-purple-100 text-purple-900 border border-purple-200'
    : '...'
}`}

// Метка для сообщений бота
{isFromBot && (
  <div className="flex items-center gap-1 mb-1">
    <span className="text-xs font-semibold text-purple-700">🤖 Бот</span>
  </div>
)}
```

**Проверка:** Убедиться, что визуальный стиль соответствует требованиям.

### 5. WebSocket System (Без изменений)

**Компоненты:**
- PostgreSQL триггер: автоматически отправляет уведомления при вставке новых сообщений
- WebSocket сервер: передаёт уведомления в админ-панель
- `ChatWindow.tsx`: подписывается на обновления и отображает новые сообщения

**Проверка:** Убедиться, что сообщения с `message_type='from_bot'` корректно передаются через WebSocket.

## Модели данных

### SupportMessage (Без изменений)

**Таблица:** `support_messages`

```sql
CREATE TABLE support_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES support_sessions(id),
    telegram_id BIGINT NOT NULL,  -- 0 для сообщений бота
    message_type VARCHAR(20) NOT NULL,  -- 'from_user', 'from_bot', 'from_support'
    message_text TEXT NOT NULL,
    file_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered BOOLEAN DEFAULT FALSE
);
```

**Типы сообщений:**
- `from_user`: Сообщения от пользователя (включая системные команды)
- `from_bot`: Автоматические ответы бота (telegram_id = 0)
- `from_support`: Сообщения от администратора

### SupportSession (Без изменений)

**Таблица:** `support_sessions`

```sql
CREATE TABLE support_sessions (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    session_type VARCHAR(20) NOT NULL,  -- 'chat' или 'support'
    status VARCHAR(20) NOT NULL,  -- 'active' или 'closed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);
```


## Correctness Properties

*Свойство (property) — это характеристика или поведение, которое должно выполняться для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.*

### Property Reflection

После анализа acceptance criteria выявлены следующие избыточности:

**Объединённые свойства:**
- 1.1 и 1.2: Оба проверяют, что системные команды сохраняются (1.2 — инверсия 1.1)
- 2.3 и 2.4: Оба проверяют, что inline keyboard не сохраняются
- 3.2 и 3.5: Оба проверяют визуальный стиль системных команд
- 7.3 и 7.4: Оба проверяют, что обработка продолжается при ошибках

**Исключённые свойства (не тестируемые автоматически):**
- 3.2, 3.5, 4.2, 4.6: Визуальные стили (требуют ручного тестирования)

**Итоговые свойства:** 35 уникальных тестируемых свойств

### Property 1: Сохранение системных команд

*For any* системной команды (например, `/start`, `/help`) и любого пользователя, когда пользователь отправляет команду, система должна сохранить её в базу данных как сообщение типа `from_user` без фильтрации.

**Validates: Requirements 1.1, 1.2**

### Property 2: Создание сессии при системной команде

*For any* системной команды и любого пользователя, когда команда сохранена, система должна создать или получить активную сессию для этого пользователя.

**Validates: Requirements 1.3**

### Property 3: Полнота текста системной команды

*For any* системной команды с параметрами, сохранённое сообщение должно содержать полный текст команды, включая символ `/` и все параметры.

**Validates: Requirements 1.4**

### Property 4: Обновление времени активности сессии

*For any* сохранённой системной команды, поле `last_activity` соответствующей сессии должно быть обновлено текущим временем.

**Validates: Requirements 1.5**

### Property 5: Сохранение ответов бота с правильным типом

*For any* ответа бота на команду пользователя, система должна сохранить этот ответ в базу данных как сообщение типа `from_bot`.

**Validates: Requirements 2.1**

### Property 6: Сохранение только текстового содержимого

*For any* ответа бота, сохранённое сообщение должно содержать только текстовое содержимое без дополнительных элементов (например, inline keyboard).

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 7: Системный идентификатор для ответов бота

*For any* ответа бота, сохранённое сообщение должно содержать `telegram_id = 0` (системный идентификатор).

**Validates: Requirements 2.5**

### Property 8: Связь ответа бота с сессией

*For any* сохранённого ответа бота, сообщение должно быть связано с активной сессией пользователя через валидный `session_id`.

**Validates: Requirements 2.6**

### Property 9: Хронологический порядок системных команд

*For any* диалога с партнёром, когда администратор открывает ChatWindow, все системные команды должны отображаться в хронологическом порядке (по возрастанию `created_at`).

**Validates: Requirements 3.1**

### Property 10: Полнота отображаемого текста команды

*For any* отображаемой системной команды, текст в ChatWindow должен полностью совпадать с текстом, сохранённым в базе данных.

**Validates: Requirements 3.3**

### Property 11: Хронологический порядок ответов бота

*For any* диалога с партнёром, когда администратор открывает ChatWindow, все ответы бота должны отображаться в хронологическом порядке (по возрастанию `created_at`).

**Validates: Requirements 4.1**

### Property 12: Real-time передача через WebSocket

*For any* ответа бота пользователю, WebSocket система должна передать это сообщение в админ-панель в реальном времени.

**Validates: Requirements 5.1**

### Property 13: Автоматическое отображение новых ответов бота

*For any* нового ответа бота, когда администратор наблюдает за диалогом, ChatWindow должен автоматически отобразить сообщение без перезагрузки страницы.

**Validates: Requirements 5.2**

### Property 14: Формат WebSocket сообщений бота

*For any* сообщения бота, передаваемого через WebSocket, данные должны содержать `sender_type='bot'`.

**Validates: Requirements 5.3**

### Property 15: Добавление в конец списка сообщений

*For any* нового сообщения бота, полученного через WebSocket, ChatWindow должен добавить его в конец списка сообщений.

**Validates: Requirements 5.4**

### Property 16: Автоматическая прокрутка к новому сообщению

*For any* нового сообщения бота, добавленного в ChatWindow, список должен автоматически прокрутиться к последнему сообщению.

**Validates: Requirements 5.5**

### Property 17: Обратная совместимость текстовых сообщений

*For any* обычного текстового сообщения пользователя, после изменений в MessageInterceptor, система должна продолжать корректно сохранять его в базу данных.

**Validates: Requirements 6.1**

### Property 18: Обратная совместимость медиа-сообщений

*For any* медиа-сообщения пользователя, после изменений в MessageInterceptor, система должна продолжать корректно сохранять его с `file_id` в базу данных.

**Validates: Requirements 6.2**

### Property 19: Работа режима поддержки

*For any* сессии в режиме поддержки, когда администратор отвечает пользователю, система должна корректно сохранять и доставлять сообщения.

**Validates: Requirements 6.3**

### Property 20: Отображение сообщений администратора

*For any* сообщения администратора, ChatWindow должен корректно отображать его с правильным визуальным стилем.

**Validates: Requirements 6.4**

### Property 21: Доставка сообщений администратора

*For any* сообщения, отправленного администратором пользователю, система должна корректно доставить его через Telegram API.

**Validates: Requirements 6.5**

### Property 22: WebSocket передача всех типов сообщений

*For any* сообщения (от пользователя, бота или администратора), WebSocket система должна корректно передавать его в админ-панель.

**Validates: Requirements 6.6**

### Property 23: Производительность сохранения команд

*For any* системной команды, MessageInterceptor должен выполнить операцию сохранения за время не более 100ms.

**Validates: Requirements 7.1**

### Property 24: Производительность сохранения ответов бота

*For any* ответа бота, SessionManager должен выполнить операцию сохранения за время не более 100ms.

**Validates: Requirements 7.2**

### Property 25: Обработка ошибок без блокировки

*For any* ошибки при сохранении сообщения, MessageInterceptor должен залогировать ошибку и продолжить обработку сообщения без блокировки.

**Validates: Requirements 7.3, 7.4**

### Property 26: Сохранение при параллельной обработке

*For any* набора команд, обрабатываемых одновременно, система должна сохранить все сообщения без потерь.

**Validates: Requirements 7.5**

### Property 27: Логирование сохранения команд

*For any* системной команды, сохранённой MessageInterceptor, система должна залогировать событие с уровнем `debug`, включая `telegram_id`, `session_id` и `command_text`.

**Validates: Requirements 8.1**

### Property 28: Логирование сохранения ответов бота

*For any* ответа бота, сохранённого SessionManager, система должна залогировать событие с уровнем `debug`, включая `session_id` и `message_id`.

**Validates: Requirements 8.2**

### Property 29: Логирование ошибок с stack trace

*For any* ошибки при сохранении сообщения, система должна залогировать ошибку с уровнем `error`, включая полный stack trace.

**Validates: Requirements 8.3**

### Property 30: Логирование операций с сессиями

*For any* операции с сессией (создание, обновление, закрытие), система должна залогировать событие с соответствующими деталями.

**Validates: Requirements 8.4**

### Property 31: Логирование WebSocket передачи

*For any* сообщения бота, передаваемого через WebSocket, система должна залогировать событие с уровнем `debug`, включая `session_id` и `message_type`.

**Validates: Requirements 8.5**

## Обработка ошибок

### Стратегия обработки ошибок

Система следует принципу **graceful degradation** — ошибки не должны блокировать основную функциональность.

### Сценарии ошибок

#### 1. Ошибка сохранения сообщения в БД

**Сценарий:** MessageInterceptor не может сохранить сообщение из-за проблем с БД.

**Обработка:**
```python
try:
    await self.session_manager.save_user_message(...)
except Exception as e:
    logger.error(
        "failed_to_save_user_message",
        session_id=session_id,
        telegram_id=telegram_id,
        error=str(e),
        exc_info=True
    )
    # Продолжаем обработку сообщения
```

**Результат:** Сообщение не сохраняется в историю, но обработка продолжается. Администратор не увидит это сообщение в админ-панели, но пользователь получит ответ бота.

#### 2. Ошибка создания сессии

**Сценарий:** SessionManager не может создать сессию из-за проблем с БД.

**Обработка:**
```python
try:
    session_id = await self.session_manager.get_or_create_session(...)
except Exception as e:
    logger.error(
        "failed_to_create_or_get_session",
        telegram_id=telegram_id,
        error=str(e),
        exc_info=True
    )
    # Продолжаем обработку без session_id
```

**Результат:** Сообщения не сохраняются в историю, но бот продолжает работать.

#### 3. Ошибка сохранения ответа бота

**Сценарий:** Handler не может сохранить ответ бота через SessionManager.

**Обработка:**
```python
if self.session_manager and session_id:
    try:
        await self.session_manager.save_bot_message(...)
    except Exception as e:
        logger.error(
            "failed_to_save_bot_response",
            session_id=session_id,
            error=str(e)
        )
        # Не прерываем выполнение
```

**Результат:** Ответ бота отправляется пользователю, но не сохраняется в историю. Администратор не увидит этот ответ в админ-панели.

#### 4. Ошибка WebSocket передачи

**Сценарий:** WebSocket система не может передать сообщение в админ-панель.

**Обработка:** PostgreSQL триггер логирует ошибку, но не блокирует вставку в БД.

**Результат:** Сообщение сохраняется в БД, но не приходит в реальном времени. Администратор увидит его при перезагрузке страницы.

### Логирование ошибок

Все ошибки логируются с уровнем `error` и включают:
- Контекст операции (telegram_id, session_id, и т.д.)
- Текст ошибки
- Полный stack trace (`exc_info=True`)

### Мониторинг

Рекомендуется настроить мониторинг для отслеживания:
- Частоты ошибок сохранения сообщений
- Частоты ошибок создания сессий
- Задержек WebSocket передачи

## Стратегия тестирования

### Двойной подход к тестированию

Система использует комбинацию unit-тестов и property-based тестов для обеспечения полного покрытия.

#### Unit-тесты

**Назначение:** Проверка конкретных примеров, edge cases и интеграционных точек.

**Примеры:**
- Проверка сохранения конкретной команды `/start`
- Проверка отображения метки "🤖 Бот" в DOM
- Проверка отсутствия inline keyboard в сохранённом тексте
- Интеграционные тесты WebSocket системы

**Инструменты:**
- Python: `pytest`, `pytest-asyncio`
- TypeScript/React: `Jest`, `React Testing Library`

#### Property-based тесты

**Назначение:** Проверка универсальных свойств на большом количестве сгенерированных входных данных.

**Конфигурация:**
- Минимум 100 итераций на тест
- Библиотека: `hypothesis` (Python), `fast-check` (TypeScript)
- Каждый тест помечен комментарием: `# Feature: bot-messages-tracking, Property {N}: {text}`

**Примеры:**
```python
from hypothesis import given, strategies as st, settings

@given(
    command=st.text(min_size=1).map(lambda t: f"/{t}"),
    telegram_id=st.integers(min_value=1, max_value=999999999)
)
@settings(max_examples=100)
def test_property_1_system_commands_saved(command, telegram_id):
    """
    Feature: bot-messages-tracking, Property 1: Сохранение системных команд
    
    For any системной команды и любого пользователя, система должна 
    сохранить её в БД как сообщение типа from_user без фильтрации.
    """
    # Arrange
    message = create_mock_message(text=command, telegram_id=telegram_id)
    
    # Act
    result = await interceptor(handler, message, {})
    
    # Assert
    saved_message = db.get_last_message(telegram_id)
    assert saved_message is not None
    assert saved_message.message_type == 'from_user'
    assert saved_message.message_text == command
```

### Тестовое покрытие

#### Backend (Python)

**Компоненты для тестирования:**
1. `MessageInterceptor.__call__()` — сохранение системных команд
2. `SessionManager.save_user_message()` — корректность сохранения
3. `SessionManager.save_bot_message()` — сохранение с telegram_id=0
4. Handlers — вызов `save_bot_message()` после ответа

**Типы тестов:**
- Unit-тесты: конкретные команды, edge cases
- Property-тесты: Properties 1-8, 17-31
- Интеграционные тесты: взаимодействие с БД, WebSocket

#### Frontend (TypeScript/React)

**Компоненты для тестирования:**
1. `ChatWindow.tsx` — отображение сообщений бота
2. WebSocket подписка — получение real-time обновлений
3. Рендеринг — правильный визуальный стиль

**Типы тестов:**
- Unit-тесты: конкретные примеры отображения (Properties 3.4, 4.3, 4.4, 4.5)
- Property-тесты: Properties 9-16, 20, 22
- E2E тесты: полный flow от команды до отображения

### Стратегия регрессионного тестирования

**Цель:** Убедиться, что изменения не сломали существующую функциональность.

**Подход:**
1. Запустить все существующие тесты перед изменениями
2. Внести изменения в `MessageInterceptor`
3. Запустить все тесты снова
4. Проверить Properties 17-22 (обратная совместимость)

**Критерии успеха:**
- Все существующие тесты проходят
- Новые property-тесты проходят (минимум 100 итераций)
- Нет регрессий в функциональности

### Тестирование производительности

**Цель:** Проверить Properties 23-26 (производительность и масштабируемость).

**Подход:**
1. Измерить время выполнения `save_user_message()` и `save_bot_message()`
2. Проверить, что время < 100ms для 95% запросов
3. Нагрузочное тестирование: 100 параллельных команд
4. Проверить отсутствие потерь сообщений

**Инструменты:**
- `pytest-benchmark` для измерения времени
- `asyncio.gather()` для параллельной обработки

### Тестирование логирования

**Цель:** Проверить Properties 27-31 (логирование).

**Подход:**
1. Использовать `structlog.testing.CapturingLogger` для перехвата логов
2. Проверить наличие нужных полей в логах
3. Проверить уровни логирования (debug, error)
4. Проверить наличие stack trace при ошибках

**Пример:**
```python
def test_property_27_logging_system_commands(caplog):
    """
    Feature: bot-messages-tracking, Property 27: Логирование сохранения команд
    """
    # Act
    await interceptor(handler, message, {})
    
    # Assert
    assert any(
        record.levelname == 'DEBUG' and
        'user_message_intercepted_and_saved' in record.message and
        'telegram_id' in record.extra and
        'session_id' in record.extra
        for record in caplog.records
    )
```

### План тестирования

**Этап 1: Unit-тесты (конкретные примеры)**
- Тестирование сохранения `/start` и `/help`
- Тестирование отображения метки "🤖 Бот"
- Тестирование отсутствия inline keyboard

**Этап 2: Property-based тесты (универсальные свойства)**
- Реализация Properties 1-31
- Минимум 100 итераций на тест
- Проверка на различных входных данных

**Этап 3: Интеграционные тесты**
- Тестирование WebSocket передачи
- Тестирование полного flow: команда → сохранение → отображение
- Тестирование режима поддержки

**Этап 4: Регрессионное тестирование**
- Запуск всех существующих тестов
- Проверка обратной совместимости

**Этап 5: Производительность и нагрузка**
- Измерение времени выполнения
- Нагрузочное тестирование
- Проверка отсутствия потерь

**Этап 6: E2E тестирование**
- Полный сценарий в реальном окружении
- Проверка визуального отображения
- Проверка real-time обновлений

