-- Rollback Migration 010: Remove media support from support_messages
-- Description: Откат миграции добавления медиа-поддержки
-- Date: 2026-03-30

BEGIN;

-- ============================================================================
-- Удаление индексов
-- ============================================================================

DROP INDEX IF EXISTS idx_messages_session_media;
DROP INDEX IF EXISTS idx_messages_media_type;

-- ============================================================================
-- Удаление constraint
-- ============================================================================

ALTER TABLE support_messages
    DROP CONSTRAINT IF EXISTS chk_media_type;

-- ============================================================================
-- Удаление полей медиа-контента
-- ============================================================================

ALTER TABLE support_messages
    DROP COLUMN IF EXISTS file_size,
    DROP COLUMN IF EXISTS caption,
    DROP COLUMN IF EXISTS file_path,
    DROP COLUMN IF EXISTS media_type;

COMMIT;
