"""
Скрипт для применения миграции добавления медиа-поддержки

Применяет миграцию 010_add_media_support.sql к базе данных.
"""

import asyncio
import sys
from pathlib import Path
from sqlalchemy import text

# Добавляем путь к модулям telegram-bot
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import DatabaseConnection
import os
from dotenv import load_dotenv


async def apply_migration():
    """Применяет миграцию к базе данных"""
    
    # Загружаем переменные окружения
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(env_path)
    
    # Параметры подключения
    db_host = 'localhost'
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
        # Читаем файл миграции
        migration_file = Path(__file__).parent.parent / 'database' / 'migrations' / '010_add_media_support.sql'
        
        if not migration_file.exists():
            print(f"❌ Файл миграции не найден: {migration_file}")
            return False
        
        print(f"\nЧтение миграции из: {migration_file}")
        migration_sql = migration_file.read_text(encoding='utf-8')
        
        print("\n" + "="*80)
        print("Применение миграции 010_add_media_support.sql")
        print("="*80)
        
        # Разбиваем миграцию на отдельные команды (asyncpg не поддерживает multiple commands)
        # Удаляем BEGIN/COMMIT и комментарии, разбиваем по точке с запятой
        commands = []
        current_command = []
        
        for line in migration_sql.split('\n'):
            # Пропускаем комментарии и пустые строки
            stripped = line.strip()
            if not stripped or stripped.startswith('--'):
                continue
            
            # Пропускаем BEGIN и COMMIT
            if stripped.upper() in ('BEGIN;', 'COMMIT;'):
                continue
            
            current_command.append(line)
            
            # Если строка заканчивается на точку с запятой - это конец команды
            if stripped.endswith(';'):
                command_text = '\n'.join(current_command)
                commands.append(command_text)
                current_command = []
        
        # Выполняем команды по одной
        for i, command in enumerate(commands, 1):
            if command.strip():
                print(f"\nВыполнение команды {i}/{len(commands)}...")
                await session.execute(text(command))
        
        await session.commit()
        
        print("\n✅ Миграция успешно применена!")
        
        # Проверяем результат
        print("\nПроверка добавленных полей...")
        result = await session.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'support_messages'
            AND column_name IN ('media_type', 'file_path', 'caption', 'file_size')
            ORDER BY column_name
        """))
        
        columns = result.fetchall()
        
        if columns:
            print("\n✓ Новые поля в таблице support_messages:")
            for col in columns:
                print(f"  - {col[0]}: {col[1]} (nullable: {col[2]}, default: {col[3]})")
        else:
            print("\n⚠ Не удалось найти новые поля")
        
        # Проверяем индексы
        print("\nПроверка индексов...")
        result = await session.execute(text("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'support_messages'
            AND indexname IN ('idx_messages_media_type', 'idx_messages_session_media')
            ORDER BY indexname
        """))
        
        indexes = result.fetchall()
        
        if indexes:
            print("\n✓ Созданные индексы:")
            for idx in indexes:
                print(f"  - {idx[0]}")
        else:
            print("\n⚠ Не удалось найти новые индексы")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Ошибка при применении миграции: {e}")
        await session.rollback()
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        await session.close()
        await db.close()


if __name__ == '__main__':
    try:
        success = asyncio.run(apply_migration())
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
