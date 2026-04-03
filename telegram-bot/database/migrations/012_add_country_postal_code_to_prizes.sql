-- Миграция: Добавление полей country и postal_code в таблицу prizes
-- Дата: 2024-01-15
-- Цель: Хранение полных данных доставки для синхронизации с Google Sheets

-- Добавление столбца country
ALTER TABLE prizes 
ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- Добавление столбца postal_code
ALTER TABLE prizes 
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

-- Комментарии к полям
COMMENT ON COLUMN prizes.country IS 'Страна доставки физического приза';
COMMENT ON COLUMN prizes.postal_code IS 'Почтовый индекс для доставки физического приза';

-- Индекс для оптимизации обратной синхронизации PostgreSQL → Google Sheets
-- Используется для поиска записей с данными доставки, требующих синхронизации
CREATE INDEX IF NOT EXISTS idx_prizes_sync_delivery 
ON prizes(claimed_at, updated_at) 
WHERE claimed_at IS NOT NULL;

COMMENT ON INDEX idx_prizes_sync_delivery IS 'Индекс для оптимизации обратной синхронизации данных доставки в Google Sheets';

-- Откат миграции (если потребуется):
-- DROP INDEX IF EXISTS idx_prizes_sync_delivery;
-- ALTER TABLE prizes DROP COLUMN IF EXISTS postal_code;
-- ALTER TABLE prizes DROP COLUMN IF EXISTS country;
