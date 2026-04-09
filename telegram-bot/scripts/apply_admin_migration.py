"""
Скрипт для применения миграции 009_create_admin_tables.sql к существующей базе данных

Использование:
    python scripts/apply_admin_migration.py
"""
import asyncio
import asyncpg
import sys
from pathlib import Path

# Добавляем корневую директорию в путь для импорта config
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import get_config


async def apply_migration():
    """Применяет миграцию 009_create_admin_tables.sql"""
    config = get_config()
    
    # Формируем строку подключения
    db_url = f"postgresql://{config.database.user}:{config.database.password}@{config.database.host}:{config.database.port}/{config.database.name}"
    
    print(f"Подключение к базе данных: {config.database.host}:{config.database.port}/{config.database.name}")
    
    try:
        conn = await asyncpg.connect(db_url)
        print("✓ Подключение установлено")
        
        # Читаем файл миграции
        migration_path = Path(__file__).parent.parent / 'database' / 'migrations' / '009_create_admin_tables.sql'
        
        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        print(f"\n✓ Миграция загружена из: {migration_path}")
        
        # Применяем миграцию целиком (PostgreSQL поддерживает множественные команды)
        await conn.execute(migration_sql)
        
        print("\n✓ Миграция 009_create_admin_tables.sql применена успешно!")
        print("\nСозданные таблицы:")
        print("  - administrators (администраторы системы)")
        print("  - auth_attempts (попытки входа)")
        print("  - system_config (конфигурация системы)")
        
        # Проверяем, что таблицы созданы
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('administrators', 'auth_attempts', 'system_config')
            ORDER BY table_name
        """)
        
        print("\nПроверка созданных таблиц:")
        for table in tables:
            print(f"  ✓ {table['table_name']}")
        
        await conn.close()
        print("\n✓ Подключение закрыто")
        
    except Exception as e:
        print(f"\n✗ Ошибка применения миграции: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(apply_migration())
