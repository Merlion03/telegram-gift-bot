"""
Скрипт для применения миграции 006: добавление поля last_activity
"""
import asyncio
import sys
from pathlib import Path

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import DatabaseConnection
from sqlalchemy import text
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
env_path = Path(__file__).parent.parent.parent / '.env.test'
load_dotenv(env_path)


async def apply_migration():
    """Применяет миграцию 006"""
    
    # Параметры подключения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f'postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    print(f"Подключение к БД: {db_host}:{db_port}/{db_name}")
    
    # Создаём подключение
    db = DatabaseConnection(database_url, echo=True)
    session = db.get_session()
    
    try:
        # Читаем SQL миграцию
        migration_path = Path(__file__).parent.parent / 'database' / 'migrations' / '006_add_last_activity.sql'
        
        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        print("\n=== Применение миграции 006 ===\n")
        
        # Разбиваем на отдельные команды (по точке с запятой)
        commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
        
        for i, command in enumerate(commands, 1):
            if command:
                print(f"\nВыполнение команды {i}/{len(commands)}:")
                print(f"{command[:100]}...")
                
                await session.execute(text(command))
                await session.commit()
                
                print("✓ Успешно")
        
        print("\n=== Миграция 006 успешно применена ===")
        
    except Exception as e:
        print(f"\n✗ Ошибка при применении миграции: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()
        await db.close()


if __name__ == '__main__':
    asyncio.run(apply_migration())
