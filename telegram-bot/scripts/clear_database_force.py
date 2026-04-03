"""
Скрипт для принудительной очистки базы данных БЕЗ подтверждения

Используется для автоматизации и тестирования.
ВНИМАНИЕ: Очищает базу данных немедленно без запроса подтверждения!
"""
import asyncio
import sys
from pathlib import Path

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database.connection import get_session
from utils.logger import get_logger

logger = get_logger(__name__)


async def force_clear_database():
    """
    Принудительно очищает все таблицы в базе данных БЕЗ подтверждения
    """
    async with get_session() as session:
        try:
            logger.info("🗑️  Принудительная очистка базы данных...")
            
            # Отключаем проверку внешних ключей
            await session.execute(text("SET session_replication_role = 'replica';"))
            
            # Список таблиц для очистки
            tables_to_clear = [
                'support_messages',
                'support_sessions',
                'auth_attempts',
                'system_config',
                'administrators',
                'prizes',
            ]
            
            # Очищаем каждую таблицу
            for table_name in tables_to_clear:
                logger.info(f"  Очистка таблицы: {table_name}")
                await session.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE;"))
            
            # Включаем обратно проверку внешних ключей
            await session.execute(text("SET session_replication_role = 'origin';"))
            
            # Восстанавливаем начальные данные
            logger.info("  Восстановление начальных данных...")
            await session.execute(text("""
                INSERT INTO system_config (key, value, updated_at, updated_by)
                VALUES ('session_lifetime_hours', '24', NOW(), NULL)
            """))
            
            # Коммитим изменения
            await session.commit()
            
            logger.info("✅ База данных успешно очищена!")
            
            # Статистика
            logger.info("📊 Статистика:")
            for table_name in tables_to_clear:
                result = await session.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                count = result.scalar()
                logger.info(f"  {table_name}: {count} записей")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Ошибка при очистке: {e}")
            await session.rollback()
            raise


async def main():
    """Главная функция"""
    try:
        print("⚠️  ПРИНУДИТЕЛЬНАЯ ОЧИСТКА БАЗЫ ДАННЫХ (БЕЗ ПОДТВЕРЖДЕНИЯ)")
        print()
        
        await force_clear_database()
        
        print()
        print("✅ Очистка завершена!")
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"❌ Критическая ошибка: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
