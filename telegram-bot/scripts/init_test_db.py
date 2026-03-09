"""
Скрипт для инициализации тестовой базы данных
Создаёт все таблицы и применяет миграции
"""
import asyncio
import sys
import os
from pathlib import Path

# КРИТИЧЕСКИ ВАЖНО: Настроить event loop policy ДО импорта других модулей
# psycopg не работает с ProactorEventLoop на Windows
if sys.platform == 'win32':
    try:
        if sys.version_info >= (3, 14):
            # Для Python 3.14+ создаём custom policy для SelectorEventLoop
            import selectors
            
            class SelectorEventLoopPolicy(asyncio.DefaultEventLoopPolicy):
                def new_event_loop(self):
                    return asyncio.SelectorEventLoop(selectors.DefaultSelector())
            
            asyncio.set_event_loop_policy(SelectorEventLoopPolicy())
        else:
            # Для старых версий используем WindowsSelectorEventLoopPolicy
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except AttributeError:
        # Fallback для совместимости
        pass

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

# Устанавливаем переменные окружения для тестовой БД
os.environ['DB_HOST'] = 'localhost'
os.environ['DB_PORT'] = '5433'
os.environ['DB_NAME'] = 'telegram_bot'
os.environ['DB_USER'] = 'postgres'
os.environ['DB_PASSWORD'] = 'postgres'

from database.connection import init_database
from database.models import Base
from sqlalchemy import text
import structlog

logger = structlog.get_logger(__name__)


async def init_db():
    """Инициализирует тестовую базу данных"""
    try:
        # Формируем URL подключения с psycopg
        database_url = f"postgresql+psycopg://postgres:postgres@localhost:5433/telegram_bot"
        
        logger.info("Подключение к тестовой БД...", url=database_url)
        db = init_database(database_url, echo=False)
        
        # Создаём все таблицы
        logger.info("Создание таблиц...")
        await db.create_tables()
        
        logger.info("✅ Таблицы успешно созданы!")
        
        # Проверяем созданные таблицы
        async with db.session() as session:
            result = await session.execute(text("""
                SELECT tablename 
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename;
            """))
            tables = result.fetchall()
            
            logger.info(f"Созданные таблицы ({len(tables)}):")
            for table in tables:
                logger.info(f"  - {table[0]}")
        
        await db.close()
        return True
        
    except Exception as e:
        logger.error("Ошибка при инициализации БД", error=str(e), exc_info=True)
        return False


async def main():
    """Главная функция"""
    logger.info("=" * 60)
    logger.info("Инициализация тестовой базы данных")
    logger.info("=" * 60)
    
    success = await init_db()
    
    if not success:
        logger.error("Не удалось инициализировать БД")
        sys.exit(1)
    
    logger.info("=" * 60)
    logger.info("Инициализация завершена успешно!")
    logger.info("=" * 60)


if __name__ == '__main__':
    asyncio.run(main())
