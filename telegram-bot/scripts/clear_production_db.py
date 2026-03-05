"""
Скрипт для очистки production базы данных

ВНИМАНИЕ: Удаляет ВСЕ данные из таблиц support_messages и support_sessions
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
    print("  - Все сессии поддержки")
    print("  - Все сообщения")
    print("  - Сбросит счётчики ID\n")
    
    confirmation = input("Введите 'YES' для подтверждения: ")
    
    if confirmation != 'YES':
        print("\n❌ Операция отменена")
        return
    
    # Инициализируем подключение к БД
    init_database(database_url)
    db = get_database()
    
    try:
        async with db.session() as session:
            # Удаляем все сообщения
            result = await session.execute(text("DELETE FROM support_messages"))
            messages_count = result.rowcount
            print(f"✓ Удалено сообщений: {messages_count}")
            
            # Удаляем все сессии
            result = await session.execute(text("DELETE FROM support_sessions"))
            sessions_count = result.rowcount
            print(f"✓ Удалено сессий: {sessions_count}")
            
            # Сбрасываем счётчики автоинкремента
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
