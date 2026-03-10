# Контрпримеры для бага отображения отправителя

## Дата выполнения: 2024-03-06

## Статус: БАГ ПОДТВЕРЖДЁН ✗

Исследовательский тест успешно выявил баг в логике преобразования типа отправителя в компоненте ChatWindow.tsx.

---

## Контрпример 1: Сообщение от бота преобразуется неправильно

### Входные данные
```typescript
{
  data: {
    id: 124,
    session_id: 5,
    sender_type: 'bot',
    message_text: 'Автоматический ответ от бота',
    created_at: '2024-03-06T15:00:00Z',
    is_read: false
  }
}
```

### Ожидаемый результат
```typescript
{
  message_type: 'from_bot'
}
```

### Фактический результат (на неисправленном коде)
```typescript
{
  message_type: 'from_support'  // ✗ НЕПРАВИЛЬНО
}
```

### Анализ
Текущая логика в ChatWindow.tsx (строка 83):
```typescript
message_type: serverMessage.data.sender_type === 'user' ? 'from_user' : 'from_support'
```

Проблема: бинарный тернарный оператор не учитывает третий тип отправителя - 'bot'. Когда `sender_type='bot'`, условие `sender_type === 'user'` возвращает `false`, и message_type устанавливается в 'from_support', что неверно.

---

## Контрпример 2: Множественные сообщения от бота

### Входные данные
```typescript
[
  { id: 1, sender_type: 'bot', message_text: 'Привет! Я бот.' },
  { id: 2, sender_type: 'bot', message_text: 'Чем могу помочь?' },
  { id: 3, sender_type: 'bot', message_text: 'Ваш запрос принят.' }
]
```

### Результаты
- Сообщение 1: `message_type="from_support"` (ожидается `"from_bot"`) ✗
- Сообщение 2: `message_type="from_support"` (ожидается `"from_bot"`) ✗
- Сообщение 3: `message_type="from_support"` (ожидается `"from_bot"`) ✗

### Вывод
Все сообщения от бота систематически преобразуются неправильно.

---

## Контрпример 3: Проверка всех полей для сообщения от бота

### Входные данные
```typescript
{
  data: {
    id: 200,
    session_id: 10,
    sender_type: 'bot',
    message_text: 'Бот: Ваш запрос обрабатывается',
    created_at: '2024-03-06T16:30:00Z',
    is_read: true
  }
}
```

### Результаты проверки полей
- ✓ `id: 200` - корректно
- ✓ `session_id: 10` - корректно
- ✓ `telegram_id: 111222333` - корректно
- ✓ `message_text: 'Бот: Ваш запрос обрабатывается'` - корректно
- ✓ `created_at: '2024-03-06T16:30:00Z'` - корректно
- ✓ `delivered: true` - корректно
- ✗ `message_type: 'from_support'` - **НЕПРАВИЛЬНО** (ожидается `'from_bot'`)

### Вывод
Все поля преобразуются корректно, кроме критически важного поля `message_type`.

---

## Контрпример 4: Граничный случай - is_read=false

### Входные данные
```typescript
{
  data: {
    id: 300,
    session_id: 15,
    sender_type: 'bot',
    message_text: 'Бот: Новое уведомление',
    created_at: '2024-03-06T17:00:00Z',
    is_read: false
  }
}
```

### Результаты
- ✓ `delivered: false` - корректно преобразовано из `is_read: false`
- ✗ `message_type: 'from_support'` - **НЕПРАВИЛЬНО** (ожидается `'from_bot'`)

---

## Корректные случаи (для сравнения)

### Случай 1: sender_type='admin'
```typescript
Входные данные: sender_type='admin'
Результат: message_type='from_support' ✓ ПРАВИЛЬНО
```

### Случай 2: sender_type='user'
```typescript
Входные данные: sender_type='user'
Результат: message_type='from_user' ✓ ПРАВИЛЬНО
```

---

## Первопричина бага

**Локация**: `nextjs-app/components/admin/ChatWindow.tsx`, строка 83

**Проблемный код**:
```typescript
message_type: serverMessage.data.sender_type === 'user' ? 'from_user' : 'from_support'
```

**Анализ**:
1. Логика предполагает только два возможных значения: 'user' и не-'user'
2. В системе существует три типа отправителей: 'user', 'admin', 'bot'
3. При `sender_type='bot'` условие возвращает `false`, и устанавливается `'from_support'`
4. Это приводит к неправильному визуальному отображению сообщений от бота

**Влияние на UI**:
- Сообщения от бота отображаются как сообщения от поддержки (справа, синий фон)
- Теряется визуальное различие между ботом и администратором
- Пользователь не может понять, что сообщение автоматическое

---

## Рекомендуемое исправление

Заменить бинарный тернарный оператор на полное условие:

```typescript
// Было:
message_type: serverMessage.data.sender_type === 'user' ? 'from_user' : 'from_support'

// Должно быть:
message_type: 
  serverMessage.data.sender_type === 'user' ? 'from_user' :
  serverMessage.data.sender_type === 'bot' ? 'from_bot' :
  'from_support'
```

Или с использованием switch:
```typescript
let message_type: MessageType;
switch (serverMessage.data.sender_type) {
  case 'user':
    message_type = 'from_user';
    break;
  case 'bot':
    message_type = 'from_bot';
    break;
  case 'admin':
  default:
    message_type = 'from_support';
    break;
}
```

---

## Результаты тестирования

### Тесты провалились (как ожидалось)
- ✗ Тест 1: "должен преобразовывать sender_type='bot' в message_type='from_bot'"
- ✗ Тест 4: "должен корректно преобразовывать все поля для сообщения от бота"
- ✗ Тест 5: "должен корректно обрабатывать is_read=false для сообщения от бота"

### Тесты прошли (подтверждают корректность для других типов)
- ✓ Тест 2: "должен преобразовывать sender_type='admin' в message_type='from_support'"
- ✓ Тест 3: "должен преобразовывать sender_type='user' в message_type='from_user'"

### Контрпримеры задокументированы
- ✓ Контрпример 1: sender_type='bot' → message_type='from_support' (неправильно)
- ✓ Контрпример 2: Множественные сообщения от бота преобразуются неправильно

---

## Вывод

Баг подтверждён. Исследовательский тест успешно выявил контрпримеры, демонстрирующие некорректное преобразование типа отправителя для сообщений от бота. Первопричина установлена: неполная логика преобразования в бинарном тернарном операторе.

**Следующий шаг**: Реализация исправления согласно задаче 3.1 в tasks.md.
