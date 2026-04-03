"""
Скрипт для полной очистки базы данных

Удаляет все данные из всех таблиц, сохраняя структуру базы данных.
ВНИМАНИЕ: Это действие необратимо!
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


async def clear_all_tables():
    """
    Очищает все таблицы в базе данных
    
    Порядок очистки важен из-за внешних ключей:
    1. Сначала удаляем зависимые таблицы
    2. Потом удаляем основные таблицы
    """
    async with get_session() as session:
        try:
            logger.info("🗑️  Начинаем очистку базы данных...")
            
            # Отключаем проверку внешних ключей для ускорения
            await session.execute(text("SET session_replication_role = 'replica';"))
            
            # Список таблиц для очистки в правильном порядке
            tables_to_clear = [
                'support_messages',      # Зависит от support_sessions
                'support_sessions',      # Основная таблица сессий
                'auth_attempts',         # Попытки входа
                'system_config',         # Конфигурация (зависит от administrators)
                'administrators',        # Администраторы
                'prizes',                # Призы
            ]
            
            # Очищаем каждую таблицу
            for table_name in tables_to_clear:
                logger.info(f"  Очистка таблицы: {table_name}")
                
                # TRUNCATE быстрее DELETE и сбрасывает счетчики SERIAL
                await session.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE;"))
                
                # Проверяем количество записей
                result = await session.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                count = result.scalar()
                logger.info(f"    ✓ Таблица {table_name} очищена (осталось записей: {count})")
            
            # Включаем обратно проверку внешних ключей
            await session.execute(text("SET session_replication_role = 'origin';"))
            
            # Восстанавливаем начальные данные для system_config
            logger.info("  Восстановление начальных данных для system_config...")
            await session.execute(text("""
                INSERT INTO system_config (key, value, updated_at, updated_by)
                VALUES ('session_lifetime_hours', '24', NOW(), NULL)
            """))
            logger.info("    ✓ Начальные данные восстановлены")
            
            # Коммитим все изменения
            await session.commit()
            
            logger.info("✅ База данных успешно очищена!")
            logger.info("")
            logger.info("📊 Статистика:")
            
            # Выводим статистику по всем таблицам
            for table_name in tables_to_clear:
                result = await session.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                count = result.scalar()
                logger.info(f"  {table_name}: {count} записей")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Ошибка при очистке базы данных: {e}")
            await session.rollback()
            raise


async def confirm_and_clear():
    """
    Запрашивает подтверждение у пользователя перед очисткой
    """
    print("=" * 70)
    print("⚠️  ВНИМАНИЕ: ПОЛНАЯ ОЧИСТКА БАЗЫ ДАННЫХ")
    print("=" * 70)
    print()
    print("Это действие удалит ВСЕ данные из следующих таблиц:")
    print("  • prizes (призы)")
    print("  • support_sessions (сессии поддержки)")
    print("  • support_messages (сообщения)")
    print("  • administrators (администраторы)")
    print("  • auth_attempts (попытки входа)")
    print("  • system_config (конфигурация)")
    print()
    print("⚠️  ЭТО ДЕЙСТВИЕ НЕОБРАТИМО!")
    print()
    
    # Запрашиваем подтверждение
    confirmation = input("Введите 'YES' для подтверждения очистки: ")
    
    if confirmation != "YES":
        print("❌ Очистка отменена")
        return False
    
    print()
    print("Начинаем очистку...")
    print()
    
    # Выполняем очистку
    success = await clear_all_tables()
    
    return success


async def main():
    """Главная функция"""
    try:
        success = await confirm_and_clear()
        
        if success:
            print()
            print("=" * 70)
            print("✅ Очистка завершена успешно!")
            print("=" * 70)
            sys.exit(0)
        else:
            sys.exit(1)
            
    except KeyboardInterrupt:
        print()
        print("❌ Очистка прервана пользователем")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Критическая ошибка: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
