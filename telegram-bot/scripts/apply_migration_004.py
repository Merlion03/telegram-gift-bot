"""
Скрипт для применения миграции 004: Оптимизация производительности
Добавляет индексы для оптимизации частых запросов
"""
import asyncio
import sys
from pathlib import Path

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import init_database, get_database
from config import get_config
from sqlalchemy import text
import structlog

logger = structlog.get_logger(__name__)


async def apply_migration():
    """Применяет миграцию 004 для оптимизации производительности"""
    try:
        # Получаем конфигурацию и инициализируем подключение к БД
        logger.info("Инициализация подключения к БД...")
        cfg = get_config()
        db = init_database(cfg.database.connection_url)
        
        db = get_database()
        
        # Путь к файлу миграции
        migration_file = Path(__file__).parent.parent / 'database' / 'migrations' / '004_optimize_performance_indexes.sql'
        
        if not migration_file.exists():
            logger.error("Файл миграции не найден", path=str(migration_file))
            return False
        
        logger.info("Применение миграции 004...", file=str(migration_file))
        
        # Читаем SQL из файла
        with open(migration_file, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        # Выполняем миграцию
        async with db.session() as session:
            # Разбиваем на отдельные команды (по точке с запятой)
            commands = [cmd.strip() for cmd in sql.split(';') if cmd.strip() and not cmd.strip().startswith('--')]
            
            for i, command in enumerate(commands, 1):
                # Пропускаем комментарии
                if command.startswith('COMMENT'):
                    logger.debug(f"Выполнение команды {i}/{len(commands)}: COMMENT")
                elif command.startswith('CREATE INDEX'):
                    index_name = command.split('IF NOT EXISTS')[1].split('ON')[0].strip() if 'IF NOT EXISTS' in command else 'unknown'
                    logger.info(f"Создание индекса {i}/{len(commands)}: {index_name}")
                elif command.startswith('ANALYZE'):
                    logger.info(f"Анализ таблицы {i}/{len(commands)}")
                else:
                    logger.debug(f"Выполнение команды {i}/{len(commands)}")
                
                try:
                    await session.execute(text(command))
                except Exception as e:
                    # Игнорируем ошибки "индекс уже существует"
                    if 'already exists' in str(e).lower():
                        logger.warning(f"Индекс уже существует, пропускаем: {str(e)}")
                    else:
                        raise
            
            await session.commit()
        
        logger.info("✅ Миграция 004 успешно применена!")
        logger.info("Добавлены индексы для оптимизации производительности:")
        logger.info("  - idx_sessions_status_type_created")
        logger.info("  - idx_messages_unread")
        logger.info("  - idx_messages_session_last")
        logger.info("  - idx_messages_type_created")
        logger.info("  - idx_sessions_active_type")
        logger.info("  - idx_sessions_telegram_type_created")
        
        return True
        
    except Exception as e:
        logger.error("Ошибка при применении миграции", error=str(e), exc_info=True)
        return False


async def verify_indexes():
    """Проверяет наличие созданных индексов"""
    try:
        db = get_database()
        
        logger.info("Проверка созданных индексов...")
        
        async with db.session() as session:
            # Запрос для получения списка индексов
            query = """
                SELECT 
                    indexname,
                    tablename,
                    indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                    AND indexname LIKE 'idx_%'
                ORDER BY tablename, indexname;
            """
            
            result = await session.execute(text(query))
            indexes = result.fetchall()
            
            logger.info(f"Найдено индексов: {len(indexes)}")
            
            # Проверяем наличие новых индексов
            new_indexes = [
                'idx_sessions_status_type_created',
                'idx_messages_unread',
                'idx_messages_session_last',
                'idx_messages_type_created',
                'idx_sessions_active_type',
                'idx_sessions_telegram_type_created'
            ]
            
            found_indexes = [idx[0] for idx in indexes]
            
            for idx_name in new_indexes:
                if idx_name in found_indexes:
                    logger.info(f"✅ Индекс {idx_name} создан")
                else:
                    logger.warning(f"❌ Индекс {idx_name} не найден")
        
        return True
        
    except Exception as e:
        logger.error("Ошибка при проверке индексов", error=str(e), exc_info=True)
        return False


async def main():
    """Главная функция"""
    logger.info("=" * 60)
    logger.info("Применение миграции 004: Оптимизация производительности")
    logger.info("=" * 60)
    
    # Применяем миграцию
    success = await apply_migration()
    
    if not success:
        logger.error("Не удалось применить миграцию")
        sys.exit(1)
    
    # Проверяем индексы
    await verify_indexes()
    
    logger.info("=" * 60)
    logger.info("Миграция завершена успешно!")
    logger.info("=" * 60)


if __name__ == '__main__':
    asyncio.run(main())
