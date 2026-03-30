-- Migration 010: Add media support to support_messages
-- Description: Добавление поддержки медиа-контента (фото, видео, анимации, стикеры, голосовые, документы)
-- Date: 2026-03-30
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.1, 8.2, 8.3, 8.4

BEGIN;

-- ============================================================================
-- Добавление новых полей для медиа-контента в таблицу support_messages
-- ============================================================================

-- Добавление поля media_type (тип медиа-контента)
ALTER TABLE support_messages 
    ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) NOT NULL DEFAULT 'text';

-- Добавление поля file_path (путь к файлу на сервере)
ALTER TABLE support_messages 
    ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Добавление поля caption (текстовое описание медиа)
ALTER TABLE support_messages 
    ADD COLUMN IF NOT EXISTS caption TEXT;

-- Добавление поля file_size (размер файла в байтах)
ALTER TABLE support_messages 
    ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- ============================================================================
-- Обновление существующих записей
-- ============================================================================

-- Установка media_type='text' для всех существующих записей
UPDATE support_messages 
SET media_type = 'text' 
WHERE media_type IS NULL OR media_type = '';

-- ============================================================================
-- Добавление constraint для проверки типа медиа
-- ============================================================================

ALTER TABLE support_messages
    ADD CONSTRAINT chk_media_type 
    CHECK (media_type IN ('text', 'photo', 'video', 'animation', 
                          'sticker', 'voice', 'document'));

-- ============================================================================
-- Создание индексов для оптимизации запросов
-- ============================================================================

-- Индекс для фильтрации по типу медиа
CREATE INDEX IF NOT EXISTS idx_messages_media_type 
    ON support_messages(media_type);

-- Составной индекс для фильтрации по сессии и типу медиа
CREATE INDEX IF NOT EXISTS idx_messages_session_media 
    ON support_messages(session_id, media_type);

-- ============================================================================
-- Комментарии к новым полям
-- ============================================================================

COMMENT ON COLUMN support_messages.media_type IS 
    'Тип медиа-контента: text, photo, video, animation, sticker, voice, document';

COMMENT ON COLUMN support_messages.file_path IS 
    'Относительный путь к файлу на сервере (от корня telegram-bot/media)';

COMMENT ON COLUMN support_messages.caption IS 
    'Текстовое описание, прикреплённое к медиафайлу';

COMMENT ON COLUMN support_messages.file_size IS 
    'Размер файла в байтах для мониторинга использования хранилища';

COMMIT;
