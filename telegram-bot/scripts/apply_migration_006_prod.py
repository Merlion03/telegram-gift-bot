"""
Скрипт для применения миграции 006 к ОСНОВНОЙ БД (порт 5432)
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

# Загружаем переменные окружения из основного .env
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)


async def apply_migration():
    """Применяет миграцию 006 к основной БД"""
    
    # Параметры подключения к ОСНОВНОЙ БД (порт 5432)
    # ВАЖНО: используем localhost, т.к. подключаемся снаружи контейнера
    db_host = 'localhost'
    db_port = '5432'  # ОСНОВНАЯ БД
    db_name = 'telegram_bot'
    db_user = 'postgres'
    db_password = 'postgres'
    
    database_url = f'postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    print(f"Подключение к ОСНОВНОЙ БД: {db_host}:{db_port}/{db_name}")
    
    # Создаём подключение
    db = DatabaseConnection(database_url, echo=True)
    session = db.get_session()
    
    try:
        # Читаем SQL миграцию
        migration_path = Path(__file__).parent.parent / 'database' / 'migrations' / '006_add_last_activity.sql'
        
        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        print("\n=== Применение миграции 006 к ОСНОВНОЙ БД ===\n")
        
        # Разбиваем на отдельные команды (по точке с запятой)
        commands = [cmd.strip() for cmd in migration_sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
        
        for i, command in enumerate(commands, 1):
            if command:
                print(f"\nВыполнение команды {i}/{len(commands)}:")
                print(f"{command[:100]}...")
                
                await session.execute(text(command))
                await session.commit()
                
                print("✓ Успешно")
        
        print("\n=== Миграция 006 успешно применена к ОСНОВНОЙ БД ===")
        
    except Exception as e:
        print(f"\n✗ Ошибка при применении миграции: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()
        await db.close()


if __name__ == '__main__':
    asyncio.run(apply_migration())
