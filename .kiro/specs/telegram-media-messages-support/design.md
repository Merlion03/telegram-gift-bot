# Документ технического дизайна: Поддержка медиа-сообщений в Telegram-боте

## Обзор

Данный документ описывает техническое решение для добавления поддержки медиа-контента (фото, видео, анимации, стикеры, голосовые сообщения, документы) в существующую систему Telegram-бота и веб-админки. Решение включает расширение схемы базы данных, создание модульной архитектуры обработки медиа на backend, автоматическое скачивание и конвертацию файлов, а также динамическое отображение медиа-контента в веб-интерфейсе.

### Цели дизайна

1. **Расширяемость**: Архитектура должна легко поддерживать добавление новых типов медиа в будущем
2. **Модульность**: Каждый компонент системы реализован в отдельном файле с чёткой ответственностью
3. **Надёжность**: Обработка всех ошибок с подробным логированием и graceful degradation
4. **Производительность**: Оптимизация запросов к БД через индексы, кэширование медиафайлов
5. **Обратная совместимость**: Существующие текстовые сообщения продолжают работать без изменений

### Ключевые решения

- **Локальное хранение файлов**: Медиафайлы скачиваются на сервер из-за ограничения времени жизни ссылок Telegram (~1 час)
- **Структурированное хранилище**: Файлы организованы по типу медиа и chat_id для удобства управления
- **Конвертация стикеров**: TGS стикеры конвертируются в GIF/WebP для веб-отображения
- **Динамический рендеринг**: React компонент автоматически выбирает правильный HTML элемент для каждого типа медиа
- **API для медиа**: Next.js API route раздаёт медиафайлы с корректными Content-Type заголовками

## Архитектура

### Общая схема системы

```
┌─────────────────┐
│  Telegram User  │
└────────┬────────┘
         │ Отправка медиа
         ▼
┌─────────────────────────────────────────────────────────┐
│              Telegram Bot (Python/aiogram)              │
│                                                         │
│  ┌──────────────────┐      ┌────────────────────────┐ │
│  │  Media Handler   │─────▶│  File Downloader       │ │
│  │  (обработка      │      │  (скачивание файлов)   │ │
│  │   входящих       │      └────────────────────────┘ │
│  │   медиа)         │               │                  │
│  └──────────────────┘               │                  │
│           │                         ▼                  │
│           │              ┌────────────────────────┐    │
│           │              │  Sticker Converter     │    │
│           │              │  (конвертация TGS)     │    │
│           │              └────────────────────────┘    │
│           │                         │                  │
│           ▼                         ▼                  │
│  ┌──────────────────────────────────────────────────┐ │
│  │           File Storage (локальная ФС)            │ │
│  │  telegram-bot/media/{media_type}/{chat_id}/      │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         │ Сохранение метаданных
         ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL Database                        │
│                                                         │
│  support_messages table:                                │
│  ┌────────────────────────────────────────────────┐    │
│  │ id, session_id, telegram_id, message_type,     │    │
│  │ message_text, file_id, created_at, delivered,  │    │
│  │ + NEW: media_type, file_path, caption,         │    │
│  │        file_size                                │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         │
         │ Чтение данных через API
         ▼
┌─────────────────────────────────────────────────────────┐
│           Next.js WebApp (Frontend + API)               │
│                                                         │
│  ┌──────────────────┐      ┌────────────────────────┐ │
│  │  Media Renderer  │◀─────│  API: /api/media/      │ │
│  │  (React          │      │  [...path]/route.ts    │ │
│  │   компонент)     │      │  (раздача файлов)      │ │
│  └──────────────────┘      └────────────────────────┘ │
│           │                         ▲                  │
│           │                         │                  │
│           ▼                         │                  │
│  Динамический выбор HTML элемента   │                  │
│  (<img>, <video>, <audio>, <a>)     │                  │
│                                     │                  │
│                    Запрос файла ────┘                  │
└─────────────────────────────────────────────────────────┘
```

### Поток данных

1. **Получение медиа от пользователя**:
   - Пользователь отправляет медиафайл в Telegram
   - `media_handler.py` перехватывает сообщение
   - Определяется тип медиа (photo, video, animation, sticker, voice, document)
   - Извлекается File_ID и caption (если есть)

2. **Скачивание и обработка файла**:
   - `file_downloader.py` скачивает файл через Telegram Bot API
   - Файл сохраняется в структурированную директорию: `media/{media_type}/{chat_id}/{timestamp}_{file_id}.{ext}`
   - Для TGS стикеров: `sticker_converter.py` конвертирует в GIF/WebP
   - Для других форматов: сохраняется оригинальный файл

3. **Сохранение метаданных**:
   - В БД сохраняется запись с полями: `media_type`, `file_path`, `file_id`, `caption`, `file_size`
   - Для текстовых сообщений: `media_type='text'`, остальные поля NULL

4. **Отображение в WebApp**:
   - WebApp запрашивает сообщения из БД
   - `MediaRenderer.tsx` анализирует `media_type` каждого сообщения
   - Для медиа: запрос к `/api/media/{file_path}`
   - API route проверяет существование файла и возвращает с корректным Content-Type
   - Компонент рендерит соответствующий HTML элемент

## Компоненты и интерфейсы

### Backend компоненты (Python)

#### 1. Media Handler (`telegram-bot/handlers/media_handler.py`)

**Ответственность**: Обработка входящих медиа-сообщений от пользователей

**Интерфейс**:
```python
class MediaHandler:
    def __init__(self, file_downloader: FileDownloader, 
                 sticker_converter: StickerConverter,
                 support_service: SupportService):
        """Инициализация обработчика медиа"""
        
    async def handle_media_message(self, message: Message, 
                                   state: FSMContext, 
                                   session_id: int) -> None:
        """
        Обрабатывает входящее медиа-сообщение
        
        Args:
            message: Сообщение от Telegram
            state: FSM контекст
            session_id: ID сессии поддержки
        """
        
    def _determine_media_type(self, message: Message) -> str:
        """
        Определяет тип медиа из сообщения
        
        Returns:
            Один из: 'text', 'photo', 'video', 'animation', 
                    'sticker', 'voice', 'document'
        """
        
    def _extract_file_info(self, message: Message, 
                          media_type: str) -> tuple[str, str]:
        """
        Извлекает File_ID и расширение файла
        
        Returns:
            (file_id, extension)
        """
```

**Логика работы**:
1. Определить тип медиа через `_determine_media_type()`
2. Извлечь File_ID и caption через `_extract_file_info()`
3. Вызвать `file_downloader.download_file()` для скачивания
4. Если стикер TGS: вызвать `sticker_converter.convert_tgs()`
5. Сохранить метаданные через `support_service.save_message()`
6. Обработать ошибки с логированием

#### 2. File Downloader (`telegram-bot/services/file_downloader.py`)

**Ответственность**: Скачивание файлов через Telegram Bot API

**Интерфейс**:
```python
class FileDownloader:
    def __init__(self, bot: Bot, base_media_path: str):
        """
        Инициализация загрузчика файлов
        
        Args:
            bot: Экземпляр Telegram Bot
            base_media_path: Базовый путь для сохранения (telegram-bot/media)
        """
        
    async def download_file(self, file_id: str, 
                           media_type: str,
                           chat_id: int,
                           extension: str) -> str:
        """
        Скачивает файл и сохраняет в структурированную директорию
        
        Args:
            file_id: Telegram File_ID
            media_type: Тип медиа (photo, video, etc.)
            chat_id: ID чата для организации файлов
            extension: Расширение файла
            
        Returns:
            Относительный путь к сохранённому файлу
            
        Raises:
            FileDownloadError: При ошибке скачивания
        """
        
    def _generate_file_path(self, media_type: str, 
                           chat_id: int,
                           file_id: str, 
                           extension: str) -> str:
        """
        Генерирует путь для сохранения файла
        
        Returns:
            media/{media_type}/{chat_id}/{timestamp}_{file_id}.{extension}
        """
        
    def _ensure_directory_exists(self, directory: str) -> None:
        """Создаёт директорию если не существует"""
        
    def _get_file_size(self, file_path: str) -> int:
        """Возвращает размер файла в байтах"""
```

**Логика работы**:
1. Генерировать путь через `_generate_file_path()`
2. Создать директорию через `_ensure_directory_exists()`
3. Получить файл через `bot.get_file(file_id)`
4. Скачать файл через `bot.download_file()`
5. Сохранить в целевую директорию
6. Проверить размер файла, если >20MB - записать warning в лог
7. Вернуть относительный путь к файлу

#### 3. Sticker Converter (`telegram-bot/services/sticker_converter.py`)

**Ответственность**: Конвертация TGS стикеров в веб-совместимые форматы

**Интерфейс**:
```python
class StickerConverter:
    def __init__(self):
        """Инициализация конвертера стикеров"""
        
    async def convert_tgs(self, tgs_file_path: str) -> str:
        """
        Конвертирует TGS стикер в GIF или WebP
        
        Args:
            tgs_file_path: Путь к TGS файлу
            
        Returns:
            Путь к сконвертированному файлу
            
        Raises:
            ConversionError: При ошибке конвертации
        """
        
    def _is_tgs_format(self, file_path: str) -> bool:
        """Проверяет, является ли файл TGS форматом"""
```

**Логика работы**:
1. Проверить формат файла через `_is_tgs_format()`
2. Использовать библиотеку `rlottie-python` или `lottie` для конвертации
3. Сохранить результат в том же каталоге с расширением `.gif` или `.webp`
4. При ошибке: записать warning в лог, вернуть путь к оригинальному файлу
5. Вернуть путь к сконвертированному файлу


#### 4. Расширение Support Service (`telegram-bot/services/support_service.py`)

**Изменения**: Добавление параметров для медиа в метод `save_message()`

**Обновлённый интерфейс**:
```python
async def save_message(
    self,
    session_id: int,
    telegram_id: int,
    message_type: str,
    message_text: str,
    file_id: Optional[str] = None,
    media_type: str = 'text',  # NEW
    file_path: Optional[str] = None,  # NEW
    caption: Optional[str] = None,  # NEW
    file_size: Optional[int] = None  # NEW
) -> int:
    """
    Сохраняет сообщение с медиа-метаданными в БД
    
    Args:
        session_id: ID сессии поддержки
        telegram_id: Telegram ID отправителя
        message_type: Тип сообщения ('from_user', 'from_support', 'from_bot')
        message_text: Текст сообщения или caption
        file_id: Telegram File_ID (опционально)
        media_type: Тип медиа (по умолчанию 'text')
        file_path: Путь к файлу на сервере (опционально)
        caption: Текстовое описание медиа (опционально)
        file_size: Размер файла в байтах (опционально)
        
    Returns:
        ID созданного сообщения
    """
```

### Frontend компоненты (TypeScript/React)

#### 5. Media Renderer (`nextjs-app/components/MediaRenderer.tsx`)

**Ответственность**: Динамическое отображение медиа-контента

**Интерфейс**:
```typescript
interface MediaRendererProps {
  mediaType: string;
  filePath?: string;
  caption?: string;
  messageText: string;
}

export function MediaRenderer({
  mediaType,
  filePath,
  caption,
  messageText
}: MediaRendererProps): JSX.Element {
  // Рендерит соответствующий HTML элемент
}
```

**Логика работы**:
```typescript
// Псевдокод логики рендеринга
switch (mediaType) {
  case 'photo':
    return <img src={`/api/media/${filePath}`} alt={caption || 'Фото'} 
                onError={handleImageError} />;
                
  case 'video':
    return <video src={`/api/media/${filePath}`} controls>
             {caption && <track kind="captions" label={caption} />}
           </video>;
           
  case 'animation':
    return <video src={`/api/media/${filePath}`} autoPlay loop muted />;
    
  case 'sticker':
    // Определить формат по расширению
    const isVideo = filePath.endsWith('.webm');
    return isVideo 
      ? <video src={`/api/media/${filePath}`} autoPlay loop muted />
      : <img src={`/api/media/${filePath}`} alt="Стикер" />;
      
  case 'voice':
    return <audio src={`/api/media/${filePath}`} controls />;
    
  case 'document':
    return <a href={`/api/media/${filePath}`} download>
             📎 Скачать файл
           </a>;
           
  case 'text':
  default:
    return <p>{messageText}</p>;
}
```

**Обработка ошибок**:
```typescript
const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  console.error('Ошибка загрузки медиа:', filePath);
  e.currentTarget.src = '/placeholder-image.png'; // Placeholder
  e.currentTarget.alt = 'Файл недоступен';
};
```

#### 6. Media API Route (`nextjs-app/app/api/media/[...path]/route.ts`)

**Ответственность**: Раздача медиафайлов с корректными заголовками

**Интерфейс**:
```typescript
export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
): Promise<Response> {
  // Возвращает файл или 404
}
```

**Логика работы**:
```typescript
// 1. Получить путь к файлу из params
const filePath = params.path.join('/');
const fullPath = path.join(process.cwd(), '..', 'telegram-bot', 'media', filePath);

// 2. Проверить существование файла
if (!fs.existsSync(fullPath)) {
  return new Response('File not found', { status: 404 });
}

// 3. Определить Content-Type по расширению
const extension = path.extname(fullPath).toLowerCase();
const contentType = getContentType(extension);

// 4. Прочитать файл
const fileBuffer = fs.readFileSync(fullPath);

// 5. Вернуть с заголовками
return new Response(fileBuffer, {
  headers: {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  },
});
```

**Маппинг Content-Type**:
```typescript
function getContentType(extension: string): string {
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
  };
  
  return contentTypes[extension] || 'application/octet-stream';
}
```


## Модели данных

### Расширение таблицы support_messages

**SQL миграция** (`telegram-bot/database/migrations/add_media_support.sql`):

```sql
-- Миграция для добавления поддержки медиа-контента
-- Версия: 010
-- Дата: 2024

BEGIN;

-- Добавление новых полей для медиа-контента
ALTER TABLE support_messages 
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Обновление существующих записей: установка media_type='text'
UPDATE support_messages 
SET media_type = 'text' 
WHERE media_type IS NULL OR media_type = '';

-- Добавление constraint для проверки типа медиа
ALTER TABLE support_messages
  ADD CONSTRAINT chk_media_type 
  CHECK (media_type IN ('text', 'photo', 'video', 'animation', 
                        'sticker', 'voice', 'document'));

-- Создание индекса для оптимизации запросов по типу медиа
CREATE INDEX IF NOT EXISTS idx_messages_media_type 
  ON support_messages(media_type);

-- Создание составного индекса для фильтрации по сессии и типу медиа
CREATE INDEX IF NOT EXISTS idx_messages_session_media 
  ON support_messages(session_id, media_type);

-- Комментарии к новым полям
COMMENT ON COLUMN support_messages.media_type IS 
  'Тип медиа-контента: text, photo, video, animation, sticker, voice, document';
COMMENT ON COLUMN support_messages.file_path IS 
  'Относительный путь к файлу на сервере (от корня telegram-bot/media)';
COMMENT ON COLUMN support_messages.caption IS 
  'Текстовое описание, прикреплённое к медиафайлу';
COMMENT ON COLUMN support_messages.file_size IS 
  'Размер файла в байтах для мониторинга использования хранилища';

COMMIT;
```

**Откат миграции** (`telegram-bot/database/migrations/rollback_media_support.sql`):

```sql
-- Откат миграции медиа-поддержки
BEGIN;

-- Удаление индексов
DROP INDEX IF EXISTS idx_messages_session_media;
DROP INDEX IF EXISTS idx_messages_media_type;

-- Удаление constraint
ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS chk_media_type;

-- Удаление полей
ALTER TABLE support_messages
  DROP COLUMN IF EXISTS file_size,
  DROP COLUMN IF EXISTS caption,
  DROP COLUMN IF EXISTS file_path,
  DROP COLUMN IF EXISTS media_type;

COMMIT;
```

### Обновление модели SupportMessage

**Расширение модели** (`telegram-bot/database/models/support.py`):

```python
from sqlalchemy import String, Text, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional

class SupportMessage(Base):
    """Модель сообщения в рамках сессии поддержки"""
    
    __tablename__ = 'support_messages'
    
    # Существующие поля
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey('support_sessions.id'))
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), nullable=False)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    file_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # НОВЫЕ поля для медиа-контента
    media_type: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default='text',
        index=True
    )
    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    
    def __init__(
        self,
        session_id: int,
        telegram_id: int,
        message_type: str,
        message_text: str,
        file_id: Optional[str] = None,
        media_type: str = 'text',  # NEW
        file_path: Optional[str] = None,  # NEW
        caption: Optional[str] = None,  # NEW
        file_size: Optional[int] = None,  # NEW
        **kwargs
    ):
        super().__init__(**kwargs)
        self.session_id = session_id
        self.telegram_id = telegram_id
        self.message_type = message_type
        self.message_text = message_text
        self.file_id = file_id
        self.media_type = media_type
        self.file_path = file_path
        self.caption = caption
        self.file_size = file_size
        self.created_at = datetime.now(timezone.utc)
        self.delivered = False
    
    def is_media_message(self) -> bool:
        """Проверяет, является ли сообщение медиа-контентом"""
        return self.media_type != 'text'
    
    def has_caption(self) -> bool:
        """Проверяет, есть ли у медиа caption"""
        return self.caption is not None and len(self.caption) > 0
```

### TypeScript типы для Frontend

**Обновление типов** (`nextjs-app/types/support.ts`):

```typescript
export type MediaType = 
  | 'text' 
  | 'photo' 
  | 'video' 
  | 'animation' 
  | 'sticker' 
  | 'voice' 
  | 'document';

export interface SupportMessage {
  id: number;
  session_id: number;
  telegram_id: number;
  message_type: 'from_user' | 'from_support' | 'from_bot';
  message_text: string;
  file_id?: string;
  created_at: string;
  delivered: boolean;
  
  // Новые поля для медиа
  media_type: MediaType;
  file_path?: string;
  caption?: string;
  file_size?: number;
}
```


## Correctness Properties

*Свойство (property) — это характеристика или поведение, которое должно выполняться для всех допустимых выполнений системы. По сути, это формальное утверждение о том, что должна делать система. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.*

### Property 1: Корректность определения типа медиа

*Для любого* входящего сообщения от Telegram, система должна корректно определить его media_type на основе присутствующих полей (photo, video, animation, sticker, voice, document, или text если ничего нет).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8**

### Property 2: Извлечение File_ID для медиа

*Для любого* медиа-сообщения (не text), система должна успешно извлечь File_ID из соответствующего поля Telegram сообщения.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

### Property 3: Сохранение caption с медиа

*Для любого* медиа-сообщения, содержащего caption, система должна сохранить caption в базе данных вместе с метаданными файла.

**Validates: Requirements 2.7**

### Property 4: Структура пути сохранения файла

*Для любого* скачанного медиафайла, путь сохранения должен соответствовать формату `media/{media_type}/{chat_id}/{timestamp}_{file_id}.{extension}`.

**Validates: Requirements 3.2, 3.3**

### Property 5: Сохранение оригинального расширения

*Для любого* скачанного файла, система должна сохранить оригинальное расширение файла, определённое из Telegram API.

**Validates: Requirements 3.6**

### Property 6: Round-trip сохранения file_path

*Для любого* успешно скачанного медиафайла, если путь сохранён в базу данных, то запрос этого пути из БД должен вернуть тот же самый путь.

**Validates: Requirements 3.4**

### Property 7: Обработка ошибок скачивания

*Для любого* медиа-сообщения, если скачивание файла завершилось ошибкой, система должна сохранить запись в БД с media_type, но с NULL значением для file_path, и записать ошибку в лог.

**Validates: Requirements 3.5**

### Property 8: Конвертация TGS стикеров

*Для любого* стикера формата TGS, система должна конвертировать его в формат GIF или WebP, и сохранённый file_path должен указывать на сконвертированный файл.

**Validates: Requirements 4.1, 4.5**

### Property 9: Сохранение не-TGS стикеров без конвертации

*Для любого* стикера формата WEBM или WEBP, система должна сохранить оригинальный файл без конвертации.

**Validates: Requirements 4.2, 4.3**

### Property 10: Fallback при ошибке конвертации

*Для любого* TGS стикера, если конвертация завершилась ошибкой, система должна сохранить оригинальный TGS файл и записать предупреждение в лог.

**Validates: Requirements 4.4**

### Property 11: Валидация NULL для текстовых сообщений

*Для любого* сообщения с media_type='text', поля file_path и file_id должны иметь значение NULL в базе данных.

**Validates: Requirements 1.5**

### Property 12: Поддержка всех типов медиа в БД

*Для любого* значения media_type из списка (text, photo, video, animation, sticker, voice, document), система должна успешно сохранить запись в базу данных без ошибок constraint.

**Validates: Requirements 1.6**


### Property 13: Проверка существования файла в API

*Для любого* запроса к API endpoint `/api/media/{file_path}`, если файл не существует на File_Storage, API должен вернуть HTTP статус 404.

**Validates: Requirements 5.2, 5.4**

### Property 14: Корректность Content-Type заголовка

*Для любого* существующего медиафайла, возвращаемого через API, Content-Type заголовок должен соответствовать расширению файла согласно маппингу (jpg→image/jpeg, mp4→video/mp4, и т.д.).

**Validates: Requirements 5.3, 5.6**

### Property 15: Наличие Cache-Control заголовка

*Для любого* медиафайла, возвращаемого через API, ответ должен содержать заголовок Cache-Control для оптимизации загрузки.

**Validates: Requirements 5.5**

### Property 16: Рендеринг фото через img элемент

*Для любого* сообщения с media_type='photo', компонент MediaRenderer должен сгенерировать HTML содержащий элемент `<img>` с корректным src атрибутом.

**Validates: Requirements 6.1**

### Property 17: Рендеринг видео с контролами

*Для любого* сообщения с media_type='video', компонент MediaRenderer должен сгенерировать HTML содержащий элемент `<video>` с атрибутом controls.

**Validates: Requirements 6.2**

### Property 18: Рендеринг анимации с autoplay и loop

*Для любого* сообщения с media_type='animation', компонент MediaRenderer должен сгенерировать HTML содержащий элемент `<video>` с атрибутами autoplay и loop.

**Validates: Requirements 6.3**

### Property 19: Рендеринг стикеров

*Для любого* сообщения с media_type='sticker', компонент MediaRenderer должен сгенерировать HTML содержащий либо `<img>` (для статичных), либо `<video>` (для анимированных) в зависимости от расширения файла.

**Validates: Requirements 6.4**

### Property 20: Рендеринг голосовых сообщений

*Для любого* сообщения с media_type='voice', компонент MediaRenderer должен сгенерировать HTML содержащий элемент `<audio>` с атрибутом controls.

**Validates: Requirements 6.5**

### Property 21: Рендеринг документов как ссылки

*Для любого* сообщения с media_type='document', компонент MediaRenderer должен сгенерировать HTML содержащий элемент `<a>` с атрибутом download для скачивания файла.

**Validates: Requirements 6.6**

### Property 22: Отображение caption

*Для любого* медиа-сообщения с непустым caption, компонент MediaRenderer должен отобразить caption в сгенерированном HTML.

**Validates: Requirements 6.7**

### Property 23: Рендеринг текстовых сообщений

*Для любого* сообщения с media_type='text', компонент MediaRenderer должен отобразить только текст без медиа-элементов.

**Validates: Requirements 6.8**

### Property 24: Placeholder при недоступности файла

*Для любого* медиа-сообщения, если файл недоступен на File_Storage, компонент MediaRenderer должен отобразить placeholder с информативным сообщением.

**Validates: Requirements 7.1, 7.2**

### Property 25: Alt текст при ошибке загрузки

*Для любого* изображения, если загрузка завершилась ошибкой, элемент `<img>` должен содержать альтернативный текст с типом медиа.

**Validates: Requirements 7.3**

### Property 26: Логирование ошибок загрузки

*Для любого* медиафайла, если загрузка завершилась ошибкой, система должна записать ошибку в консоль браузера (console.error).

**Validates: Requirements 7.4**

### Property 27: Автоматическое создание директорий

*Для любого* нового chat_id или media_type, при первом сохранении файла система должна автоматически создать необходимую структуру директорий.

**Validates: Requirements 9.1, 9.2**

### Property 28: Сохранение размера файла

*Для любого* скачанного медиафайла, система должна сохранить размер файла в байтах в поле file_size базы данных.

**Validates: Requirements 9.5**


## Обработка ошибок

### Стратегия обработки ошибок

Система использует многоуровневую стратегию обработки ошибок с graceful degradation:

#### 1. Ошибки скачивания файлов

**Сценарий**: Telegram API недоступен или файл не может быть скачан

**Обработка**:
```python
try:
    file_path = await file_downloader.download_file(
        file_id=file_id,
        media_type=media_type,
        chat_id=chat_id,
        extension=extension
    )
except FileDownloadError as e:
    logger.error(
        "failed_to_download_media_file",
        file_id=file_id,
        media_type=media_type,
        error=str(e),
        exc_info=True
    )
    # Сохраняем сообщение без file_path
    file_path = None
```

**Результат**: Сообщение сохраняется в БД с media_type, но без file_path. В админке отображается placeholder.

#### 2. Ошибки конвертации стикеров

**Сценарий**: TGS стикер не может быть сконвертирован

**Обработка**:
```python
try:
    converted_path = await sticker_converter.convert_tgs(tgs_file_path)
except ConversionError as e:
    logger.warning(
        "sticker_conversion_failed_using_original",
        file_path=tgs_file_path,
        error=str(e)
    )
    # Используем оригинальный файл
    converted_path = tgs_file_path
```

**Результат**: Сохраняется оригинальный TGS файл. Браузер может не отобразить его корректно, но данные не теряются.

#### 3. Ошибки создания директорий

**Сценарий**: Недостаточно прав или диск заполнен

**Обработка**:
```python
try:
    os.makedirs(directory, exist_ok=True)
except OSError as e:
    logger.error(
        "failed_to_create_directory",
        directory=directory,
        error=str(e),
        exc_info=True
    )
    raise FileDownloadError(f"Cannot create directory: {directory}")
```

**Результат**: Исключение пробрасывается выше, сообщение сохраняется без file_path.

#### 4. Ошибки доступа к файлам в API

**Сценарий**: Файл удалён или недоступен

**Обработка**:
```typescript
if (!fs.existsSync(fullPath)) {
  console.error('Media file not found:', fullPath);
  return new Response('File not found', { 
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
}
```

**Результат**: API возвращает 404, MediaRenderer отображает placeholder.

#### 5. Ошибки загрузки медиа в браузере

**Сценарий**: Сетевая ошибка или файл повреждён

**Обработка**:
```typescript
const handleMediaError = (e: React.SyntheticEvent) => {
  console.error('Failed to load media:', filePath);
  
  if (e.target instanceof HTMLImageElement) {
    e.target.src = '/placeholder-error.png';
    e.target.alt = `Файл недоступен (${mediaType})`;
  }
};
```

**Результат**: Отображается placeholder с информативным сообщением.

### Логирование

Все ошибки логируются с использованием `structlog` (backend) и `console.error` (frontend):

**Backend логирование**:
```python
logger.error(
    "error_event_name",
    context_field_1=value1,
    context_field_2=value2,
    error=str(exception),
    exc_info=True  # Включает stack trace
)
```

**Frontend логирование**:
```typescript
console.error('Error description:', {
  filePath,
  mediaType,
  error: error.message
});
```

### Мониторинг размера файлов

Система предупреждает о больших файлах:

```python
file_size = os.path.getsize(file_path)

if file_size > 20 * 1024 * 1024:  # 20 MB
    logger.warning(
        "large_media_file_detected",
        file_path=file_path,
        file_size_mb=file_size / (1024 * 1024),
        chat_id=chat_id
    )
```


## Стратегия тестирования

### Двойной подход к тестированию

Система использует комбинацию unit-тестов и property-based тестов для обеспечения комплексного покрытия:

#### Unit-тесты

**Назначение**: Проверка конкретных примеров, edge cases и интеграционных точек

**Примеры unit-тестов**:

1. **Тест определения типа медиа**:
```python
def test_determine_media_type_for_photo():
    """Проверяет определение типа для фото-сообщения"""
    message = create_mock_message(photo=[PhotoSize(...)])
    handler = MediaHandler(...)
    
    media_type = handler._determine_media_type(message)
    
    assert media_type == 'photo'
```

2. **Тест генерации пути файла**:
```python
def test_generate_file_path_format():
    """Проверяет формат генерируемого пути"""
    downloader = FileDownloader(...)
    
    path = downloader._generate_file_path(
        media_type='photo',
        chat_id=12345,
        file_id='ABC123',
        extension='jpg'
    )
    
    assert path.startswith('media/photo/12345/')
    assert 'ABC123' in path
    assert path.endswith('.jpg')
```

3. **Тест миграции базы данных**:
```python
def test_migration_adds_media_fields():
    """Проверяет успешное добавление полей миграцией"""
    # Применить миграцию
    apply_migration('add_media_support.sql')
    
    # Проверить наличие полей
    columns = get_table_columns('support_messages')
    
    assert 'media_type' in columns
    assert 'file_path' in columns
    assert 'caption' in columns
    assert 'file_size' in columns
```

4. **Тест API endpoint**:
```typescript
test('API returns 404 for non-existent file', async () => {
  const response = await fetch('/api/media/non/existent/file.jpg');
  
  expect(response.status).toBe(404);
});
```

5. **Тест рендеринга компонента**:
```typescript
test('MediaRenderer renders img for photo', () => {
  const { container } = render(
    <MediaRenderer 
      mediaType="photo" 
      filePath="media/photo/123/file.jpg"
      messageText=""
    />
  );
  
  const img = container.querySelector('img');
  expect(img).toBeInTheDocument();
  expect(img?.src).toContain('/api/media/media/photo/123/file.jpg');
});
```

#### Property-Based тесты

**Назначение**: Проверка универсальных свойств на большом количестве сгенерированных входных данных

**Библиотека**: `hypothesis` (Python), `fast-check` (TypeScript)

**Конфигурация**: Минимум 100 итераций на каждый property-тест

**Примеры property-тестов**:

1. **Property: Корректность определения типа медиа**:
```python
from hypothesis import given, strategies as st

@given(st.one_of(
    st.builds(create_photo_message),
    st.builds(create_video_message),
    st.builds(create_animation_message),
    st.builds(create_sticker_message),
    st.builds(create_voice_message),
    st.builds(create_document_message),
    st.builds(create_text_message)
))
@settings(max_examples=100)
def test_media_type_determination_property(message):
    """
    Feature: telegram-media-messages-support, Property 1:
    Для любого входящего сообщения от Telegram, система должна 
    корректно определить его media_type
    """
    handler = MediaHandler(...)
    media_type = handler._determine_media_type(message)
    
    # Проверяем соответствие типа содержимому сообщения
    if message.photo:
        assert media_type == 'photo'
    elif message.video:
        assert media_type == 'video'
    elif message.animation:
        assert media_type == 'animation'
    elif message.sticker:
        assert media_type == 'sticker'
    elif message.voice:
        assert media_type == 'voice'
    elif message.document:
        assert media_type == 'document'
    else:
        assert media_type == 'text'
```

2. **Property: Структура пути сохранения**:
```python
@given(
    media_type=st.sampled_from(['photo', 'video', 'animation', 'sticker', 'voice', 'document']),
    chat_id=st.integers(min_value=1, max_value=999999999),
    file_id=st.text(min_size=1, max_size=100, alphabet=st.characters(blacklist_categories=('Cs',))),
    extension=st.sampled_from(['jpg', 'png', 'mp4', 'gif', 'webp', 'ogg', 'pdf'])
)
@settings(max_examples=100)
def test_file_path_structure_property(media_type, chat_id, file_id, extension):
    """
    Feature: telegram-media-messages-support, Property 4:
    Для любого скачанного медиафайла, путь сохранения должен 
    соответствовать формату media/{media_type}/{chat_id}/{timestamp}_{file_id}.{extension}
    """
    downloader = FileDownloader(...)
    
    path = downloader._generate_file_path(media_type, chat_id, file_id, extension)
    
    # Проверяем структуру пути
    assert path.startswith(f'media/{media_type}/{chat_id}/')
    assert file_id in path
    assert path.endswith(f'.{extension}')
    
    # Проверяем наличие timestamp в имени файла
    filename = os.path.basename(path)
    assert '_' in filename  # timestamp_fileid.ext
```

3. **Property: Round-trip сохранения file_path**:
```python
@given(
    media_type=st.sampled_from(['photo', 'video', 'animation', 'sticker', 'voice', 'document']),
    file_path=st.text(min_size=10, max_size=200)
)
@settings(max_examples=100)
async def test_file_path_roundtrip_property(media_type, file_path):
    """
    Feature: telegram-media-messages-support, Property 6:
    Для любого успешно скачанного медиафайла, если путь сохранён в БД,
    то запрос этого пути из БД должен вернуть тот же самый путь
    """
    # Сохраняем сообщение с file_path
    message_id = await support_service.save_message(
        session_id=1,
        telegram_id=12345,
        message_type='from_user',
        message_text='Test',
        media_type=media_type,
        file_path=file_path
    )
    
    # Получаем сообщение обратно
    messages = await support_service.get_messages(session_id=1)
    saved_message = next(m for m in messages if m.id == message_id)
    
    # Проверяем round-trip
    assert saved_message.file_path == file_path
```

4. **Property: Корректность Content-Type**:
```typescript
import fc from 'fast-check';

test('Property 14: Content-Type соответствует расширению', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant('jpg'),
        fc.constant('png'),
        fc.constant('gif'),
        fc.constant('webp'),
        fc.constant('mp4'),
        fc.constant('webm'),
        fc.constant('ogg')
      ),
      (extension) => {
        /**
         * Feature: telegram-media-messages-support, Property 14:
         * Для любого существующего медиафайла, Content-Type заголовок
         * должен соответствовать расширению файла
         */
        const contentType = getContentType(`.${extension}`);
        
        const expectedTypes: Record<string, string> = {
          'jpg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'mp4': 'video/mp4',
          'webm': 'video/webm',
          'ogg': 'audio/ogg'
        };
        
        expect(contentType).toBe(expectedTypes[extension]);
      }
    ),
    { numRuns: 100 }
  );
});
```


5. **Property: Рендеринг медиа элементов**:
```typescript
import fc from 'fast-check';
import { render } from '@testing-library/react';

test('Property 16-23: Корректный рендеринг для всех типов медиа', () => {
  fc.assert(
    fc.property(
      fc.record({
        mediaType: fc.oneof(
          fc.constant('photo'),
          fc.constant('video'),
          fc.constant('animation'),
          fc.constant('sticker'),
          fc.constant('voice'),
          fc.constant('document'),
          fc.constant('text')
        ),
        filePath: fc.string({ minLength: 5, maxLength: 100 }),
        caption: fc.option(fc.string({ maxLength: 200 })),
        messageText: fc.string({ maxLength: 500 })
      }),
      ({ mediaType, filePath, caption, messageText }) => {
        /**
         * Feature: telegram-media-messages-support, Properties 16-23:
         * Для любого типа медиа, компонент должен рендерить
         * соответствующий HTML элемент
         */
        const { container } = render(
          <MediaRenderer
            mediaType={mediaType}
            filePath={filePath}
            caption={caption ?? undefined}
            messageText={messageText}
          />
        );
        
        const html = container.innerHTML;
        
        switch (mediaType) {
          case 'photo':
            expect(html).toContain('<img');
            break;
          case 'video':
            expect(html).toContain('<video');
            expect(html).toContain('controls');
            break;
          case 'animation':
            expect(html).toContain('<video');
            expect(html).toContain('autoplay');
            expect(html).toContain('loop');
            break;
          case 'voice':
            expect(html).toContain('<audio');
            expect(html).toContain('controls');
            break;
          case 'document':
            expect(html).toContain('<a');
            expect(html).toContain('download');
            break;
          case 'text':
            expect(html).not.toContain('<img');
            expect(html).not.toContain('<video');
            expect(html).not.toContain('<audio');
            break;
        }
        
        // Проверка caption
        if (caption && mediaType !== 'text') {
          expect(html).toContain(caption);
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

### Баланс между unit и property тестами

**Unit-тесты используются для**:
- Конкретных примеров поведения
- Интеграционных точек между компонентами
- Edge cases (большие файлы >20MB, специфичные форматы стикеров)
- Проверки миграций базы данных
- Тестирования обработки ошибок с конкретными сценариями

**Property-тесты используются для**:
- Универсальных свойств, которые должны выполняться для всех входных данных
- Проверки корректности на большом количестве случайных входов
- Выявления граничных случаев, о которых не подумали при написании unit-тестов
- Валидации инвариантов системы (например, структура путей, round-trip свойства)

**Соотношение**: Примерно 40% unit-тестов, 60% property-тестов для максимального покрытия при минимальном количестве тестов.

### Интеграционные тесты

Дополнительно создаются интеграционные тесты для проверки полного потока:

```python
@pytest.mark.integration
async def test_full_media_message_flow():
    """
    Интеграционный тест полного потока обработки медиа-сообщения:
    1. Получение сообщения от Telegram
    2. Скачивание файла
    3. Сохранение в БД
    4. Получение через API
    5. Рендеринг в WebApp
    """
    # 1. Создаём mock сообщение с фото
    message = create_mock_photo_message(
        chat_id=12345,
        file_id='TEST_FILE_ID',
        caption='Тестовое фото'
    )
    
    # 2. Обрабатываем через MediaHandler
    await media_handler.handle_media_message(message, state, session_id=1)
    
    # 3. Проверяем сохранение в БД
    messages = await support_service.get_messages(session_id=1)
    assert len(messages) == 1
    assert messages[0].media_type == 'photo'
    assert messages[0].file_path is not None
    assert messages[0].caption == 'Тестовое фото'
    
    # 4. Проверяем доступность через API
    response = await client.get(f'/api/media/{messages[0].file_path}')
    assert response.status_code == 200
    assert response.headers['Content-Type'] == 'image/jpeg'
    
    # 5. Проверяем рендеринг
    rendered = render_media_renderer(messages[0])
    assert '<img' in rendered
    assert messages[0].file_path in rendered
    assert 'Тестовое фото' in rendered
```

### Покрытие тестами

**Целевое покрытие**:
- Backend (Python): минимум 85% покрытие кода
- Frontend (TypeScript): минимум 80% покрытие кода
- Все Correctness Properties: 100% покрытие property-тестами

**Инструменты**:
- Python: `pytest-cov` для измерения покрытия
- TypeScript: `vitest` с coverage reporter
- CI/CD: автоматический запуск всех тестов при каждом commit


## Детали реализации

### Структура файлов проекта

```
telegram-bot/
├── handlers/
│   ├── media_handler.py          # NEW: Обработчик медиа-сообщений
│   ├── support_handler.py         # MODIFIED: Интеграция с media_handler
│   └── ...
├── services/
│   ├── file_downloader.py         # NEW: Сервис скачивания файлов
│   ├── sticker_converter.py       # NEW: Конвертация TGS стикеров
│   ├── support_service.py         # MODIFIED: Добавление медиа-параметров
│   └── ...
├── database/
│   ├── models/
│   │   └── support.py             # MODIFIED: Расширение модели SupportMessage
│   └── migrations/
│       ├── add_media_support.sql  # NEW: Миграция для медиа-полей
│       └── rollback_media_support.sql  # NEW: Откат миграции
├── media/                          # NEW: Директория для медиафайлов
│   ├── photo/
│   ├── video/
│   ├── animation/
│   ├── sticker/
│   ├── voice/
│   └── document/
└── requirements.txt                # MODIFIED: Добавление зависимостей

nextjs-app/
├── components/
│   └── MediaRenderer.tsx           # NEW: Компонент рендеринга медиа
├── app/
│   └── api/
│       └── media/
│           └── [...path]/
│               └── route.ts        # NEW: API endpoint для медиафайлов
├── types/
│   └── support.ts                  # MODIFIED: Добавление MediaType
└── package.json                    # MODIFIED: Добавление зависимостей (если нужны)
```

### Зависимости

#### Python (telegram-bot/requirements.txt)

```txt
# Существующие зависимости
aiogram>=3.0.0
sqlalchemy>=2.0.0
asyncpg>=0.27.0
structlog>=23.0.0
...

# НОВЫЕ зависимости для медиа-поддержки
rlottie-python>=1.3.0    # Конвертация TGS стикеров в GIF/WebP
Pillow>=10.0.0           # Обработка изображений (опционально)
```

**Установка**:
```bash
cd telegram-bot
source venv/bin/activate  # или venv\Scripts\activate на Windows
pip install rlottie-python Pillow
pip freeze > requirements.txt
```

#### TypeScript (nextjs-app/package.json)

Дополнительные зависимости не требуются, используются встроенные возможности Next.js и React.

### Конфигурация

#### Настройки путей (telegram-bot/config.py)

```python
import os
from pathlib import Path

# Базовый путь проекта
BASE_DIR = Path(__file__).resolve().parent

# Путь к директории медиафайлов
MEDIA_DIR = BASE_DIR / 'media'

# Максимальный размер файла для предупреждения (в байтах)
MAX_FILE_SIZE_WARNING = 20 * 1024 * 1024  # 20 MB

# Поддерживаемые типы медиа
SUPPORTED_MEDIA_TYPES = [
    'text', 'photo', 'video', 'animation', 
    'sticker', 'voice', 'document'
]

# Маппинг расширений для разных типов медиа
MEDIA_EXTENSIONS = {
    'photo': ['jpg', 'jpeg', 'png', 'webp'],
    'video': ['mp4', 'mov', 'avi'],
    'animation': ['gif', 'mp4'],
    'sticker': ['webp', 'tgs', 'webm'],
    'voice': ['ogg', 'oga'],
    'document': ['pdf', 'doc', 'docx', 'txt', 'zip', 'rar']
}

# Настройки конвертации стикеров
STICKER_CONVERSION_FORMAT = 'gif'  # или 'webp'
STICKER_CONVERSION_QUALITY = 90
```

### Пример использования

#### Backend: Обработка медиа-сообщения

```python
# В main.py или где регистрируются handlers

from handlers.media_handler import MediaHandler
from services.file_downloader import FileDownloader
from services.sticker_converter import StickerConverter
from services.support_service import SupportService

# Инициализация сервисов
file_downloader = FileDownloader(bot=bot, base_media_path=str(MEDIA_DIR))
sticker_converter = StickerConverter()
support_service = SupportService(repository=support_repository)

# Инициализация обработчика
media_handler = MediaHandler(
    file_downloader=file_downloader,
    sticker_converter=sticker_converter,
    support_service=support_service
)

# Регистрация обработчика для всех типов медиа
@router.message(StateFilter(SupportStates.in_support))
async def handle_support_media(message: Message, state: FSMContext):
    """Обрабатывает медиа-сообщения в режиме поддержки"""
    data = await state.get_data()
    session_id = data.get('support_session_id')
    
    if not session_id:
        await message.answer("Ошибка: сессия не найдена")
        return
    
    await media_handler.handle_media_message(message, state, session_id)
```

#### Frontend: Использование MediaRenderer

```typescript
// В компоненте отображения сообщений

import { MediaRenderer } from '@/components/MediaRenderer';
import { SupportMessage } from '@/types/support';

interface MessageListProps {
  messages: SupportMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className="message-item">
          <div className="message-header">
            <span className="sender">
              {message.message_type === 'from_user' ? 'Пользователь' : 'Поддержка'}
            </span>
            <span className="timestamp">
              {new Date(message.created_at).toLocaleString()}
            </span>
          </div>
          
          <div className="message-content">
            <MediaRenderer
              mediaType={message.media_type}
              filePath={message.file_path}
              caption={message.caption}
              messageText={message.message_text}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Миграция существующих данных

При применении миграции все существующие сообщения автоматически получат `media_type='text'`:

```sql
-- Это выполняется автоматически в миграции
UPDATE support_messages 
SET media_type = 'text' 
WHERE media_type IS NULL OR media_type = '';
```

Никаких дополнительных действий не требуется. Система полностью обратно совместима.

### Производительность и оптимизация

#### Индексы базы данных

Созданные индексы оптимизируют следующие запросы:

1. **idx_messages_media_type**: Фильтрация по типу медиа
   ```sql
   SELECT * FROM support_messages WHERE media_type = 'photo';
   ```

2. **idx_messages_session_media**: Фильтрация по сессии и типу
   ```sql
   SELECT * FROM support_messages 
   WHERE session_id = 123 AND media_type IN ('photo', 'video');
   ```

#### Кэширование медиафайлов

API endpoint устанавливает агрессивное кэширование:

```typescript
headers: {
  'Cache-Control': 'public, max-age=31536000, immutable'
}
```

Это означает:
- Браузер кэширует файл на 1 год
- Файл считается неизменяемым (immutable)
- Повторные запросы не отправляются на сервер

#### Асинхронная обработка

Все операции с файлами выполняются асинхронно:

```python
async def download_file(...):
    # Асинхронное скачивание через aiogram
    file = await self.bot.get_file(file_id)
    await self.bot.download_file(file.file_path, destination)
```

Это предотвращает блокировку обработки других сообщений.


## Безопасность

### Валидация путей к файлам

API endpoint должен предотвращать path traversal атаки:

```typescript
export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
): Promise<Response> {
  const filePath = params.path.join('/');
  
  // Валидация: путь не должен содержать '..' или начинаться с '/'
  if (filePath.includes('..') || filePath.startsWith('/')) {
    console.error('Path traversal attempt detected:', filePath);
    return new Response('Invalid path', { status: 400 });
  }
  
  // Нормализация пути
  const normalizedPath = path.normalize(filePath);
  
  // Проверка, что путь находится внутри media директории
  const fullPath = path.join(process.cwd(), '..', 'telegram-bot', 'media', normalizedPath);
  const mediaDir = path.join(process.cwd(), '..', 'telegram-bot', 'media');
  
  if (!fullPath.startsWith(mediaDir)) {
    console.error('Path outside media directory:', fullPath);
    return new Response('Forbidden', { status: 403 });
  }
  
  // Продолжаем обработку...
}
```

### Права доступа к файлам

При создании директорий устанавливаются безопасные права:

```python
def _ensure_directory_exists(self, directory: str) -> None:
    """Создаёт директорию с безопасными правами доступа"""
    try:
        os.makedirs(directory, mode=0o755, exist_ok=True)
        # 0o755 = rwxr-xr-x (владелец: rwx, группа: rx, остальные: rx)
    except OSError as e:
        logger.error("failed_to_create_directory", directory=directory, error=str(e))
        raise
```

### Валидация типов файлов

Система проверяет соответствие расширения файла заявленному типу медиа:

```python
def _validate_file_extension(self, media_type: str, extension: str) -> bool:
    """
    Проверяет, что расширение соответствует типу медиа
    
    Returns:
        True если валидно, False иначе
    """
    allowed_extensions = MEDIA_EXTENSIONS.get(media_type, [])
    
    if extension.lower() not in allowed_extensions:
        logger.warning(
            "invalid_file_extension_for_media_type",
            media_type=media_type,
            extension=extension,
            allowed=allowed_extensions
        )
        return False
    
    return True
```

### Ограничение размера файлов

Telegram Bot API автоматически ограничивает размер файлов:
- Фото: до 10 MB
- Видео: до 50 MB
- Документы: до 50 MB
- Голосовые: до 20 MB

Дополнительная проверка на стороне бота:

```python
async def download_file(self, file_id: str, ...) -> str:
    # Получаем информацию о файле
    file = await self.bot.get_file(file_id)
    
    # Проверяем размер (если доступен)
    if hasattr(file, 'file_size') and file.file_size:
        if file.file_size > 50 * 1024 * 1024:  # 50 MB
            raise FileDownloadError(f"File too large: {file.file_size} bytes")
    
    # Продолжаем скачивание...
```

### Санитизация имён файлов

File_ID от Telegram используется в имени файла, необходима санитизация:

```python
def _sanitize_filename(self, filename: str) -> str:
    """
    Удаляет опасные символы из имени файла
    
    Returns:
        Безопасное имя файла
    """
    # Разрешены только буквы, цифры, дефис, подчёркивание, точка
    safe_chars = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    
    # Ограничиваем длину
    if len(safe_chars) > 255:
        safe_chars = safe_chars[:255]
    
    return safe_chars
```

## План развёртывания

### Этапы внедрения

#### Этап 1: Подготовка инфраструктуры

1. **Создание директории для медиафайлов**:
```bash
cd telegram-bot
mkdir -p media/{photo,video,animation,sticker,voice,document}
chmod 755 media
```

2. **Установка зависимостей**:
```bash
source venv/bin/activate
pip install rlottie-python Pillow
pip freeze > requirements.txt
```

3. **Проверка доступного места на диске**:
```bash
df -h
# Рекомендуется минимум 10 GB свободного места
```

#### Этап 2: Миграция базы данных

1. **Создание бэкапа БД**:
```bash
pg_dump -U postgres -d telegram_bot > backup_before_media_migration.sql
```

2. **Применение миграции**:
```bash
psql -U postgres -d telegram_bot -f database/migrations/add_media_support.sql
```

3. **Проверка миграции**:
```sql
-- Проверить наличие новых полей
\d support_messages

-- Проверить индексы
\di idx_messages_media_type
\di idx_messages_session_media
```

#### Этап 3: Развёртывание backend

1. **Создание новых модулей**:
   - `handlers/media_handler.py`
   - `services/file_downloader.py`
   - `services/sticker_converter.py`

2. **Обновление существующих модулей**:
   - `services/support_service.py`
   - `database/models/support.py`

3. **Интеграция в main.py**:
   - Инициализация новых сервисов
   - Регистрация media_handler

4. **Тестирование**:
```bash
pytest tests/test_media_handler.py -v
pytest tests/test_file_downloader.py -v
pytest tests/test_sticker_converter.py -v
```

#### Этап 4: Развёртывание frontend

1. **Создание компонентов**:
   - `components/MediaRenderer.tsx`
   - `app/api/media/[...path]/route.ts`

2. **Обновление типов**:
   - `types/support.ts`

3. **Тестирование**:
```bash
npm run test -- MediaRenderer
npm run test -- api/media
```

4. **Сборка**:
```bash
npm run build
```

#### Этап 5: Постепенный запуск

1. **Запуск в тестовом режиме**:
   - Включить обработку медиа только для тестовых пользователей
   - Мониторинг логов на наличие ошибок

2. **Постепенное расширение**:
   - Включить для 10% пользователей
   - Мониторинг производительности и использования диска
   - Включить для 50% пользователей
   - Полное включение для всех

3. **Мониторинг**:
   - Размер директории media
   - Количество ошибок скачивания
   - Время обработки медиа-сообщений
   - Использование CPU при конвертации стикеров

### Откат изменений

В случае критических проблем:

1. **Откат кода**:
```bash
git revert <commit-hash>
```

2. **Откат миграции БД**:
```bash
psql -U postgres -d telegram_bot -f database/migrations/rollback_media_support.sql
```

3. **Восстановление из бэкапа** (крайний случай):
```bash
psql -U postgres -d telegram_bot < backup_before_media_migration.sql
```

### Мониторинг после развёртывания

**Метрики для отслеживания**:

1. **Использование диска**:
```bash
du -sh telegram-bot/media/*
```

2. **Количество медиафайлов**:
```sql
SELECT media_type, COUNT(*) 
FROM support_messages 
WHERE media_type != 'text' 
GROUP BY media_type;
```

3. **Средний размер файлов**:
```sql
SELECT media_type, AVG(file_size) as avg_size_bytes, MAX(file_size) as max_size_bytes
FROM support_messages 
WHERE file_size IS NOT NULL
GROUP BY media_type;
```

4. **Ошибки скачивания** (из логов):
```bash
grep "failed_to_download_media_file" telegram-bot/logs/*.log | wc -l
```

5. **Производительность API**:
   - Среднее время ответа `/api/media/*`
   - Количество 404 ошибок
   - Количество запросов в секунду


## Альтернативные решения и обоснование выбора

### Хранение файлов

#### Рассмотренные варианты:

1. **Локальное хранение на сервере** (ВЫБРАНО)
   - ✅ Простота реализации
   - ✅ Полный контроль над файлами
   - ✅ Быстрый доступ без внешних зависимостей
   - ✅ Нет дополнительных затрат
   - ❌ Требует резервного копирования
   - ❌ Ограничено размером диска сервера

2. **Облачное хранилище (S3, Google Cloud Storage)**
   - ✅ Масштабируемость
   - ✅ Встроенное резервное копирование
   - ✅ CDN для быстрой раздачи
   - ❌ Дополнительные затраты
   - ❌ Зависимость от внешнего сервиса
   - ❌ Сложность настройки

3. **Хранение в PostgreSQL (bytea)**
   - ✅ Всё в одной БД
   - ✅ ACID гарантии
   - ❌ Раздувание размера БД
   - ❌ Медленные запросы при больших файлах
   - ❌ Сложность резервного копирования

**Обоснование выбора**: Локальное хранение оптимально для MVP и малых/средних объёмов. При росте можно мигрировать на облачное хранилище без изменения архитектуры (только изменить FileDownloader).

### Конвертация TGS стикеров

#### Рассмотренные варианты:

1. **rlottie-python** (ВЫБРАНО)
   - ✅ Официальная библиотека от Telegram
   - ✅ Хорошая производительность
   - ✅ Поддержка всех TGS фич
   - ❌ Требует компиляции нативных модулей

2. **lottie-python**
   - ✅ Pure Python реализация
   - ❌ Медленнее rlottie
   - ❌ Не все фичи TGS поддерживаются

3. **Внешний сервис конвертации**
   - ✅ Не нагружает основной сервер
   - ❌ Зависимость от внешнего сервиса
   - ❌ Дополнительная задержка

**Обоснование выбора**: rlottie-python обеспечивает лучшее качество и производительность. Fallback на оригинальный файл при ошибке конвертации обеспечивает надёжность.

### Структура API для медиафайлов

#### Рассмотренные варианты:

1. **Dynamic route `/api/media/[...path]`** (ВЫБРАНО)
   - ✅ Гибкость в структуре путей
   - ✅ Простота реализации
   - ✅ Естественный URL для файлов
   - ❌ Требует валидации путей

2. **Query parameter `/api/media?path=...`**
   - ✅ Явная передача параметра
   - ❌ Менее читаемые URL
   - ❌ Проблемы с кодированием спецсимволов

3. **Отдельный статический сервер (nginx)**
   - ✅ Максимальная производительность
   - ✅ Встроенное кэширование
   - ❌ Сложность настройки
   - ❌ Дополнительная конфигурация

**Обоснование выбора**: Dynamic route обеспечивает баланс между простотой и функциональностью. При необходимости можно добавить nginx перед Next.js для кэширования.

### Модель данных

#### Рассмотренные варианты:

1. **Расширение существующей таблицы support_messages** (ВЫБРАНО)
   - ✅ Простота запросов (всё в одной таблице)
   - ✅ Обратная совместимость
   - ✅ Меньше JOIN операций
   - ❌ Некоторые поля NULL для текстовых сообщений

2. **Отдельная таблица media_files**
   - ✅ Нормализация данных
   - ✅ Нет NULL полей
   - ❌ Требуется JOIN для каждого запроса
   - ❌ Сложнее миграция

3. **Полиморфная таблица (EAV pattern)**
   - ✅ Максимальная гибкость
   - ❌ Сложные запросы
   - ❌ Плохая производительность
   - ❌ Сложность поддержки

**Обоснование выбора**: Расширение существующей таблицы минимизирует изменения в коде и обеспечивает простоту запросов. NULL поля для текстовых сообщений — приемлемый компромисс.

## Будущие улучшения

### Краткосрочные (1-3 месяца)

1. **Превью для видео**:
   - Генерация thumbnail для видеофайлов
   - Отображение превью вместо загрузки полного видео

2. **Сжатие изображений**:
   - Автоматическое сжатие больших фото
   - Создание нескольких размеров (thumbnail, medium, full)

3. **Прогресс-бар загрузки**:
   - Индикатор загрузки для больших файлов
   - Отмена загрузки

### Среднесрочные (3-6 месяцев)

1. **Миграция на облачное хранилище**:
   - Интеграция с S3/Google Cloud Storage
   - CDN для быстрой раздачи
   - Автоматическая миграция старых файлов

2. **Расширенная обработка медиа**:
   - Автоматическое распознавание текста на изображениях (OCR)
   - Модерация контента через ML модели
   - Автоматическая категоризация

3. **Аналитика медиа**:
   - Статистика по типам медиа
   - Самые популярные файлы
   - Использование хранилища по пользователям

### Долгосрочные (6+ месяцев)

1. **Потоковая передача видео**:
   - HLS/DASH для адаптивного стриминга
   - Поддержка разных качеств видео

2. **Редактирование медиа**:
   - Обрезка изображений в админке
   - Добавление водяных знаков
   - Базовое редактирование видео

3. **Интеграция с внешними сервисами**:
   - Автоматическая загрузка в Google Drive
   - Синхронизация с облачными хранилищами
   - Экспорт медиа в различных форматах

## Заключение

Данный дизайн обеспечивает надёжное, масштабируемое и поддерживаемое решение для обработки медиа-контента в Telegram-боте. Ключевые преимущества:

1. **Модульная архитектура**: Каждый компонент имеет чёткую ответственность и может быть заменён независимо
2. **Обратная совместимость**: Существующие текстовые сообщения продолжают работать без изменений
3. **Надёжность**: Graceful degradation при ошибках, подробное логирование
4. **Тестируемость**: Комплексное покрытие unit и property-based тестами
5. **Производительность**: Оптимизация через индексы БД и кэширование
6. **Безопасность**: Валидация путей, санитизация имён файлов, контроль прав доступа

Система готова к внедрению и дальнейшему развитию.

