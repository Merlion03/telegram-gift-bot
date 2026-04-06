-- Migration: Add is_archived field to prizes table
-- Purpose: Маркировка архивных записей (удалены из Google Sheets, но данные доставки сохранены)
-- Date: 2026-04-03

-- Добавление поля is_archived
ALTER TABLE prizes ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Создание частичного индекса для архивных записей (оптимизация запросов)
CREATE INDEX idx_prizes_archived ON prizes(is_archived) WHERE is_archived = TRUE;

-- Добавление комментария для документации
COMMENT ON COLUMN prizes.is_archived IS 'Маркер архивной записи (удалена из Google Sheets, но данные доставки сохранены)';
