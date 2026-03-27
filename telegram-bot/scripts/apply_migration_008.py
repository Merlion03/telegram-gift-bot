#!/usr/bin/env python3
"""
Скрипт для применения миграции 008: добавление поля GDPR согласия
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
    """Применяет миграцию 008"""
    
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
        migration_file = Path(__file__).parent.parent / 'database' / 'migrations' / '008_add_gdpr_consent_field.sql'
        
        if not migration_file.exists():
            print(f"❌ Ошибка: файл миграции не найден: {migration_file}")
            return False
        
        migration_sql = migration_file.read_text(encoding='utf-8')
        print(f"📄 Читаем миграцию из файла: {migration_file}")
        
        # Выполняем миграцию
        print("🔄 Применяем миграцию...")
        await conn.execute(migration_sql)
        print("✅ Миграция 008 успешно применена")
        
        # Проверяем, что поле добавлено
        result = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'prizes' 
            AND column_name = 'gdpr_consent_date'
        """)
        
        if result:
            print("📋 Добавленное поле:")
            for row in result:
                print(f"  - {row['column_name']}: {row['data_type']} (nullable: {row['is_nullable']})")
        else:
            print("⚠️ Предупреждение: поле gdpr_consent_date не найдено в таблице prizes")
        
        # Проверяем, что индекс создан
        index_result = await conn.fetch("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'prizes'
            AND indexname = 'idx_prizes_gdpr_consent'
        """)
        
        if index_result:
            print("📋 Созданный индекс:")
            for row in index_result:
                print(f"  - {row['indexname']}")
        else:
            print("⚠️ Предупреждение: индекс idx_prizes_gdpr_consent не найден")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при применении миграции: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Применение миграции 008: добавление поля GDPR согласия")
    success = asyncio.run(apply_migration())
    
    if success:
        print("✅ Миграция завершена успешно")
    else:
        print("❌ Миграция завершена с ошибками")
        exit(1)
