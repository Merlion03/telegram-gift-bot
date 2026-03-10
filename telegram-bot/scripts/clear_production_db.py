"""
Скрипт для очистки production базы данных

ВНИМАНИЕ: Удаляет ВСЕ данные из всех таблиц (users, chat_sessions, chat_messages, support_sessions, support_messages)
Используйте с осторожностью!
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env
load_dotenv('.env')

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import get_database, init_database
from sqlalchemy import text


async def clear_production_database():
    """Очищает все таблицы в production БД"""
    # Формируем DATABASE_URL из переменных окружения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    print("⚠️  ВНИМАНИЕ: Вы собираетесь очистить PRODUCTION базу данных!")
    print(f"   База: {db_host}:{db_port}/{db_name}")
    print("\nЭто действие удалит:")
    print("  - Всех пользователей")
    print("  - Все чат-сессии и сообщения")
    print("  - Все сессии поддержки и сообщения")
    print("  - Сбросит счётчики ID\n")
    
    confirmation = input("Введите 'YES' для подтверждения: ").strip()
    
    if confirmation != 'YES':
        print(f"\n❌ Операция отменена (получено: '{confirmation}')")
        return
    
    # Инициализируем подключение к БД
    init_database(database_url)
    db = get_database()
    
    try:
        async with db.session() as session:
            # Удаляем все данные в правильном порядке (учитываем foreign keys)
            result = await session.execute(text("TRUNCATE TABLE support_messages CASCADE"))
            print(f"✓ Таблица support_messages очищена")
            
            result = await session.execute(text("TRUNCATE TABLE support_sessions CASCADE"))
            print(f"✓ Таблица support_sessions очищена")
            
            result = await session.execute(text("TRUNCATE TABLE chat_messages CASCADE"))
            print(f"✓ Таблица chat_messages очищена")
            
            result = await session.execute(text("TRUNCATE TABLE chat_sessions CASCADE"))
            print(f"✓ Таблица chat_sessions очищена")
            
            result = await session.execute(text("TRUNCATE TABLE users CASCADE"))
            print(f"✓ Таблица users очищена")
            
            # Сбрасываем счётчики автоинкремента
            await session.execute(text("ALTER SEQUENCE users_id_seq RESTART WITH 1"))
            await session.execute(text("ALTER SEQUENCE chat_sessions_id_seq RESTART WITH 1"))
            await session.execute(text("ALTER SEQUENCE chat_messages_id_seq RESTART WITH 1"))
            await session.execute(text("ALTER SEQUENCE support_sessions_id_seq RESTART WITH 1"))
            await session.execute(text("ALTER SEQUENCE support_messages_id_seq RESTART WITH 1"))
            print("✓ Счётчики ID сброшены")
            
            await session.commit()
            print("\n✅ Production база данных успешно очищена!")
            
    except Exception as e:
        print(f"\n❌ Ошибка при очистке БД: {e}")
        raise
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(clear_production_database())
