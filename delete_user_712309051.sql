-- Удаление всех данных пользователя 712309051
-- ВНИМАНИЕ: Это действие необратимо!

BEGIN;

-- 1. Удаляем призы (включая архивированные)
DELETE FROM prizes WHERE telegram_id = 712309051;

-- 2. Удаляем GDPR согласия
DELETE FROM gdpr_consents WHERE telegram_id = 712309051;

-- 3. Удаляем сообщения поддержки
DELETE FROM support_messages WHERE telegram_id = 712309051;

-- 4. Удаляем сессии поддержки
DELETE FROM support_sessions WHERE telegram_id = 712309051;

COMMIT;

-- Проверка: должно вернуть 0 записей
SELECT 'prizes' as table_name, COUNT(*) as count FROM prizes WHERE telegram_id = 712309051
UNION ALL
SELECT 'gdpr_consents', COUNT(*) FROM gdpr_consents WHERE telegram_id = 712309051
UNION ALL
SELECT 'support_messages', COUNT(*) FROM support_messages WHERE telegram_id = 712309051
UNION ALL
SELECT 'support_sessions', COUNT(*) FROM support_sessions WHERE telegram_id = 712309051;
