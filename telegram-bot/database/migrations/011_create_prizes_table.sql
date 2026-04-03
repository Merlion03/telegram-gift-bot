-- Миграция: Создание таблицы prizes для хранения данных о призах
-- Дата: 2026-04-02

-- Создание таблицы prizes
CREATE TABLE IF NOT EXISTS prizes (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    username VARCHAR(255),
    prize_type VARCHAR(20) NOT NULL,
    promo_code VARCHAR(255),
    instructions TEXT,
    last_name VARCHAR(255),
    first_name VARCHAR(255),
    patronymic VARCHAR(255),
    city VARCHAR(255),
    street VARCHAR(255),
    house VARCHAR(50),
    apartment VARCHAR(50),
    phone VARCHAR(50),
    comment TEXT,
    sheet_name VARCHAR(255) NOT NULL,
    code_word VARCHAR(255) NOT NULL,
    row_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    gdpr_consent_date TIMESTAMP WITH TIME ZONE,
    claimed_at TIMESTAMP WITH TIME ZONE,
    
    -- Ограничения
    CONSTRAINT chk_prize_type CHECK (prize_type IN ('digital', 'physical'))
);

-- Создание индексов
CREATE UNIQUE INDEX IF NOT EXISTS idx_prizes_telegram_code ON prizes(telegram_id, code_word);
CREATE INDEX IF NOT EXISTS idx_prizes_code_word ON prizes(code_word);
CREATE INDEX IF NOT EXISTS idx_prizes_sheet_name ON prizes(sheet_name);
CREATE INDEX IF NOT EXISTS idx_prizes_gdpr_consent ON prizes(telegram_id, gdpr_consent_date);
CREATE INDEX IF NOT EXISTS idx_prizes_claimed_at ON prizes(telegram_id, claimed_at);

-- Комментарии к полям
COMMENT ON COLUMN prizes.gdpr_consent_date IS 'Дата и время согласия на обработку персональных данных';
COMMENT ON COLUMN prizes.claimed_at IS 'Дата и время получения приза пользователем';
