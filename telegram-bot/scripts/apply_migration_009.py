#!/usr/bin/env python3
"""
Скрипт для применения миграции 009: создание таблиц системы авторизации администраторов
"""

import asyncio
import asyncpg
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

async def apply_migration():
    """Применяет миграцию 009"""
    
    # Получаем строку подключения из переменных окружения
    database_url = os.getenv('DATABASE_URL')
    
    # Если DATABASE_URL не задан, собираем его из отдельных переменных
    if not database_url:
        db_host = os.getenv('DB_HOST', 'localhost')
        db_port = os.getenv('DB_PORT', '5433')
        db_name = os.getenv('DB_NAME', 'telegram_bot')
        db_user = os.getenv('DB_USER', 'postgres')
        db_password = os.getenv('DB_PASSWORD', 'postgres')
        
        database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        print(f"📝 Собрана строка подключения из переменных окружения")
    
    if not database_url:
        print("❌ Ошибка: не удалось получить параметры подключения к БД")
        return False
    
    try:
        # Подключаемся к базе данных
        conn = await asyncpg.connect(database_url)
        print("✅ Подключение к базе данных установлено")
        
        # Читаем файл миграции
        migration_file = Path(__file__).parent.parent / 'database' / 'migrations' / '009_create_admin_tables.sql'
        
        if not migration_file.exists():
            print(f"❌ Ошибка: файл миграции не найден: {migration_file}")
            return False
        
        migration_sql = migration_file.read_text(encoding='utf-8')
        print(f"📄 Читаем миграцию из файла: {migration_file}")
        
        # Выполняем миграцию
        print("🔄 Применяем миграцию...")
        await conn.execute(migration_sql)
        print("✅ Миграция 009 успешно применена")
        
        # Проверяем, что таблица administrators создана
        admin_table = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'administrators'
            ORDER BY ordinal_position
        """)
        
        if admin_table:
            print("📋 Таблица administrators создана:")
            for row in admin_table:
                print(f"  - {row['column_name']}: {row['data_type']} (nullable: {row['is_nullable']})")
        else:
            print("⚠️ Предупреждение: таблица administrators не найдена")
        
        # Проверяем, что таблица auth_attempts создана
        auth_table = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'auth_attempts'
            ORDER BY ordinal_position
        """)
        
        if auth_table:
            print("📋 Таблица auth_attempts создана:")
            for row in auth_table:
                print(f"  - {row['column_name']}: {row['data_type']} (nullable: {row['is_nullable']})")
        else:
            print("⚠️ Предупреждение: таблица auth_attempts не найдена")
        
        # Проверяем, что таблица system_config создана
        config_table = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'system_config'
            ORDER BY ordinal_position
        """)
        
        if config_table:
            print("📋 Таблица system_config создана:")
            for row in config_table:
                print(f"  - {row['column_name']}: {row['data_type']} (nullable: {row['is_nullable']})")
        else:
            print("⚠️ Предупреждение: таблица system_config не найдена")
        
        # Проверяем начальное значение session_lifetime_hours
        config_value = await conn.fetchrow("""
            SELECT key, value FROM system_config WHERE key = 'session_lifetime_hours'
        """)
        
        if config_value:
            print(f"📋 Начальная конфигурация: {config_value['key']} = {config_value['value']}")
        else:
            print("⚠️ Предупреждение: начальное значение session_lifetime_hours не найдено")
        
        # Проверяем, что триггер создан
        trigger_check = await conn.fetch("""
            SELECT trigger_name, event_manipulation, event_object_table
            FROM information_schema.triggers
            WHERE trigger_name = 'trigger_notify_new_admin'
        """)
        
        if trigger_check:
            print("📋 Триггер создан:")
            for row in trigger_check:
                print(f"  - {row['trigger_name']} на {row['event_manipulation']} в {row['event_object_table']}")
        else:
            print("⚠️ Предупреждение: триггер trigger_notify_new_admin не найден")
        
        # Проверяем индексы
        indexes = await conn.fetch("""
            SELECT indexname, tablename
            FROM pg_indexes
            WHERE tablename IN ('administrators', 'auth_attempts', 'system_config')
            AND schemaname = 'public'
            ORDER BY tablename, indexname
        """)
        
        if indexes:
            print("📋 Созданные индексы:")
            for row in indexes:
                print(f"  - {row['indexname']} на {row['tablename']}")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при применении миграции: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🚀 Применение миграции 009: создание таблиц системы авторизации администраторов")
    success = asyncio.run(apply_migration())
    
    if success:
        print("✅ Миграция завершена успешно")
    else:
        print("❌ Миграция завершена с ошибками")
        exit(1)
