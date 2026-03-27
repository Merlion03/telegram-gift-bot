#!/usr/bin/env python3
"""
Скрипт для проверки применения миграции 008
"""

import asyncio
import asyncpg
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

async def verify_migration():
    """Проверяет применение миграции 008"""
    
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
    
    try:
        # Подключаемся к базе данных
        conn = await asyncpg.connect(database_url)
        print("✅ Подключение к базе данных установлено")
        
        # Проверяем, что поле добавлено
        result = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'prizes' 
            AND column_name = 'gdpr_consent_date'
        """)
        
        if result:
            print("✅ Поле gdpr_consent_date найдено в таблице prizes:")
            for row in result:
                print(f"  - {row['column_name']}: {row['data_type']} (nullable: {row['is_nullable']})")
        else:
            print("❌ Поле gdpr_consent_date НЕ найдено в таблице prizes")
            await conn.close()
            return False
        
        # Проверяем, что индекс создан
        index_result = await conn.fetch("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'prizes'
            AND indexname = 'idx_prizes_gdpr_consent'
        """)
        
        if index_result:
            print("✅ Индекс idx_prizes_gdpr_consent найден:")
            for row in index_result:
                print(f"  - {row['indexname']}")
                print(f"    Определение: {row['indexdef']}")
        else:
            print("❌ Индекс idx_prizes_gdpr_consent НЕ найден")
            await conn.close()
            return False
        
        # Проверяем комментарий к полю
        comment_result = await conn.fetch("""
            SELECT 
                col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as column_comment
            FROM information_schema.columns
            WHERE table_name = 'prizes'
            AND column_name = 'gdpr_consent_date'
        """)
        
        if comment_result and comment_result[0]['column_comment']:
            print(f"✅ Комментарий к полю: {comment_result[0]['column_comment']}")
        else:
            print("⚠️ Комментарий к полю не найден")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при проверке миграции: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Проверка миграции 008: добавление поля GDPR согласия")
    print("=" * 70)
    success = asyncio.run(verify_migration())
    print("=" * 70)
    
    if success:
        print("✅ Миграция 008 применена корректно")
    else:
        print("❌ Миграция 008 НЕ применена или применена некорректно")
        exit(1)
