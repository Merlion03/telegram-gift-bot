#!/usr/bin/env python3
"""
Скрипт для применения миграции 007: добавление информации о пользователях
"""

import asyncio
import asyncpg
import os
from pathlib import Path

async def apply_migration():
    """Применяет миграцию 007"""
    
    # Получаем строку подключения из переменных окружения
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ Ошибка: переменная DATABASE_URL не установлена")
        return False
    
    try:
        # Подключаемся к базе данных
        conn = await asyncpg.connect(database_url)
        print("✅ Подключение к базе данных установлено")
        
        # Читаем файл миграции
        migration_file = Path(__file__).parent.parent / 'database' / 'migrations' / '007_add_user_info.sql'
        
        if not migration_file.exists():
            print(f"❌ Ошибка: файл миграции не найден: {migration_file}")
            return False
        
        migration_sql = migration_file.read_text(encoding='utf-8')
        print(f"📄 Читаем миграцию из файла: {migration_file}")
        
        # Выполняем миграцию
        print("🔄 Применяем миграцию...")
        await conn.execute(migration_sql)
        print("✅ Миграция 007 успешно применена")
        
        # Проверяем, что поля добавлены
        result = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'support_sessions' 
            AND column_name IN ('first_name', 'last_name', 'username')
            ORDER BY column_name
        """)
        
        print("📋 Добавленные поля:")
        for row in result:
            print(f"  - {row['column_name']}: {row['data_type']}")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Ошибка при применении миграции: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Применение миграции 007: добавление информации о пользователях")
    success = asyncio.run(apply_migration())
    
    if success:
        print("✅ Миграция завершена успешно")
    else:
        print("❌ Миграция завершена с ошибками")
        exit(1)