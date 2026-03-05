"""
Скрипт для очистки тестовой базы данных

Удаляет все данные из таблиц support_messages и support_sessions
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env.test
load_dotenv('.env.test')

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import get_database, init_database
from sqlalchemy import text


async def clear_test_database():
    """Очищает все таблицы в тестовой БД"""
    # Формируем DATABASE_URL из переменных окружения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # Инициализируем подключение к БД (не async функция)
    init_database(database_url)
    db = get_database()
    
    try:
        async with db.session() as session:
            # Удаляем все сообщения
            await session.execute(text("DELETE FROM support_messages"))
            print("✓ Таблица support_messages очищена")
            
            # Удаляем все сессии
            await session.execute(text("DELETE FROM support_sessions"))
            print("✓ Таблица support_sessions очищена")
            
            # Сбрасываем счётчики автоинкремента
            await session.execute(text("ALTER SEQUENCE support_sessions_id_seq RESTART WITH 1"))
            await session.execute(text("ALTER SEQUENCE support_messages_id_seq RESTART WITH 1"))
            print("✓ Счётчики ID сброшены")
            
            await session.commit()
            print("\n✅ Тестовая база данных успешно очищена!")
            
    except Exception as e:
        print(f"\n❌ Ошибка при очистке БД: {e}")
        raise
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(clear_test_database())
