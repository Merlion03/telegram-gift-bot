-- Скрипт для полной очистки всех данных из базы данных
-- ВНИМАНИЕ: Это действие необратимо!

-- Отключаем проверку внешних ключей для ускорения
SET session_replication_role = 'replica';

-- Очищаем все таблицы с CASCADE (автоматически очистит зависимые таблицы)
-- RESTART IDENTITY сбрасывает счетчики SERIAL к начальному значению
TRUNCATE TABLE support_messages RESTART IDENTITY CASCADE;
TRUNCATE TABLE support_sessions RESTART IDENTITY CASCADE;
TRUNCATE TABLE auth_attempts RESTART IDENTITY CASCADE;
TRUNCATE TABLE system_config RESTART IDENTITY CASCADE;
TRUNCATE TABLE administrators RESTART IDENTITY CASCADE;
TRUNCATE TABLE prizes RESTART IDENTITY CASCADE;

-- Включаем обратно проверку внешних ключей
SET session_replication_role = 'origin';

-- Восстанавливаем начальные данные для system_config
INSERT INTO system_config (key, value, updated_at, updated_by)
VALUES ('session_lifetime_hours', '24', NOW(), NULL);

-- Выводим статистику
SELECT 'prizes' as table_name, COUNT(*) as records FROM prizes
UNION ALL
SELECT 'support_sessions', COUNT(*) FROM support_sessions
UNION ALL
SELECT 'support_messages', COUNT(*) FROM support_messages
UNION ALL
SELECT 'administrators', COUNT(*) FROM administrators
UNION ALL
SELECT 'auth_attempts', COUNT(*) FROM auth_attempts
UNION ALL
SELECT 'system_config', COUNT(*) FROM system_config
ORDER BY table_name;
