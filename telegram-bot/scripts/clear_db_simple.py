"""
Простой скрипт для очистки базы данных
Использует psycopg3 для синхронного подключения
"""
import os
import sys
from dotenv import load_dotenv
import psycopg

# Загружаем переменные окружения
load_dotenv('.env')

def clear_database():
    """Очищает все таблицы в БД"""
    # Получаем параметры подключения из переменных окружения
    db_host = os.getenv('DB_HOST', 'postgres')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'botuser')
    db_password = os.getenv('DB_PASSWORD', 'changeme')
    
    # Формируем строку подключения
    conn_string = f"host={db_host} port={db_port} dbname={db_name} user={db_user} password={db_password}"
    
    print(f"🔌 Подключение к БД: {db_host}:{db_port}/{db_name}")
    
    try:
        # Подключаемся к БД
        with psycopg.connect(conn_string) as conn:
            with conn.cursor() as cur:
                print("\n🗑️  Начинаем очистку таблиц...")
                
                # Удаляем все данные в правильном порядке (учитываем foreign keys)
                cur.execute("TRUNCATE TABLE support_messages CASCADE")
                print("✓ Таблица support_messages очищена")
                
                cur.execute("TRUNCATE TABLE support_sessions CASCADE")
                print("✓ Таблица support_sessions очищена")
                
                cur.execute("TRUNCATE TABLE chat_messages CASCADE")
                print("✓ Таблица chat_messages очищена")
                
                cur.execute("TRUNCATE TABLE chat_sessions CASCADE")
                print("✓ Таблица chat_sessions очищена")
                
                cur.execute("TRUNCATE TABLE users CASCADE")
                print("✓ Таблица users очищена")
                
                # Сбрасываем счётчики автоинкремента
                print("\n🔄 Сброс счётчиков ID...")
                cur.execute("ALTER SEQUENCE users_id_seq RESTART WITH 1")
                cur.execute("ALTER SEQUENCE chat_sessions_id_seq RESTART WITH 1")
                cur.execute("ALTER SEQUENCE chat_messages_id_seq RESTART WITH 1")
                cur.execute("ALTER SEQUENCE support_sessions_id_seq RESTART WITH 1")
                cur.execute("ALTER SEQUENCE support_messages_id_seq RESTART WITH 1")
                print("✓ Счётчики ID сброшены")
                
                # Коммитим изменения
                conn.commit()
                
                print("\n✅ База данных успешно очищена!")
                
    except psycopg.Error as e:
        print(f"\n❌ Ошибка при работе с БД: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Неожиданная ошибка: {e}")
        sys.exit(1)


if __name__ == "__main__":
    clear_database()
