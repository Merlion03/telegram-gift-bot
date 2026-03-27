-- Migration 008: Add GDPR consent field to prizes table
-- Description: Добавляет поле gdpr_consent_date для хранения даты согласия на обработку персональных данных
-- Date: 2026-03-19
-- Requirements: 3.3, Performance 2

-- Добавление поля gdpr_consent_date
ALTER TABLE prizes 
ADD COLUMN gdpr_consent_date TIMESTAMP WITH TIME ZONE;

-- Добавление комментария к полю
COMMENT ON COLUMN prizes.gdpr_consent_date IS 'Дата и время согласия на обработку персональных данных';

-- Создание индекса для оптимизации запросов по telegram_id и gdpr_consent_date
CREATE INDEX idx_prizes_gdpr_consent ON prizes(telegram_id, gdpr_consent_date);

-- Комментарий к индексу
COMMENT ON INDEX idx_prizes_gdpr_consent IS 'Индекс для быстрого поиска согласия GDPR по telegram_id';
