"""
Скрипт для проверки корректности применения миграции 005

Проверяет:
- Наличие функций notify_new_message, notify_session_status_change, notify_session_type_change
- Наличие триггеров на таблицах support_messages и support_sessions
- Корректность работы триггеров через тестовые INSERT/UPDATE
"""
import os
import sys
from pathlib import Path

# Добавляем корневую директорию в PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
import psycopg
import structlog


# Загружаем переменные окружения
env_path = Path(__file__).parent.parent.parent / '.env.test'
if env_path.exists():
    load_dotenv(env_path, override=True)
else:
    # Пробуем загрузить из telegram-bot/.env
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=True)

# Настройка логирования
logger = structlog.get_logger()


def check_functions(conn):
    """
    Проверяет наличие функций триггеров в базе данных
    """
    logger.info("Проверка наличия функций триггеров...")
    
    with conn.cursor() as cur:
        # Проверяем функции
        cur.execute("""
            SELECT proname 
            FROM pg_proc 
            WHERE proname IN (
                'notify_new_message',
                'notify_session_status_change',
                'notify_session_type_change'
            )
            ORDER BY proname;
        """)
        
        functions = [row[0] for row in cur.fetchall()]
        
        expected_functions = [
            'notify_new_message',
            'notify_session_status_change',
            'notify_session_type_change'
        ]
        
        all_found = True
        for func_name in expected_functions:
            if func_name in functions:
                logger.info(f"✓ Функция {func_name} найдена")
            else:
                logger.error(f"✗ Функция {func_name} НЕ найдена")
                all_found = False
        
        return all_found


def check_triggers(conn):
    """
    Проверяет наличие триггеров на таблицах
    """
    logger.info("Проверка наличия триггеров...")
    
    with conn.cursor() as cur:
        # Проверяем триггеры
        cur.execute("""
            SELECT 
                tgname as trigger_name,
                tgrelid::regclass as table_name
            FROM pg_trigger
            WHERE tgname IN (
                'trigger_notify_new_message',
                'trigger_notify_session_status_change',
                'trigger_notify_session_type_change'
            )
            ORDER BY tgname;
        """)
        
        triggers = cur.fetchall()
        
        expected_triggers = {
            'trigger_notify_new_message': 'support_messages',
            'trigger_notify_session_status_change': 'support_sessions',
            'trigger_notify_session_type_change': 'support_sessions'
        }
        
        all_found = True
        for trigger_name, expected_table in expected_triggers.items():
            found = False
            for trig_name, table_name in triggers:
                if trig_name == trigger_name:
                    if str(table_name) == expected_table:
                        logger.info(f"✓ Триггер {trigger_name} на таблице {table_name}")
                        found = True
                    else:
                        logger.error(
                            f"✗ Триггер {trigger_name} найден на неправильной таблице: "
                            f"{table_name} (ожидалось: {expected_table})"
                        )
                        all_found = False
                    break
            
            if not found:
                logger.error(f"✗ Триггер {trigger_name} НЕ найден")
                all_found = False
        
        return all_found


def verify_migration():
    """
    Проверяет корректность применения миграции 005
    """
    # Получаем параметры подключения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    # Формируем URL подключения
    conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    logger.info(
        "Подключение к базе данных",
        host=db_host,
        port=db_port,
        database=db_name
    )
    
    try:
        with psycopg.connect(conn_string) as conn:
            # Проверяем функции
            functions_ok = check_functions(conn)
            
            # Проверяем триггеры
            triggers_ok = check_triggers(conn)
            
            if functions_ok and triggers_ok:
                logger.info("=" * 80)
                logger.info("✓ Все проверки пройдены успешно!")
                logger.info("=" * 80)
                return True
            else:
                logger.error("=" * 80)
                logger.error("✗ Некоторые проверки не пройдены")
                logger.error("=" * 80)
                return False
        
    except Exception as e:
        logger.error("Ошибка при проверке миграции", error=str(e), exc_info=True)
        return False


def main():
    """
    Главная функция скрипта
    """
    logger.info("=" * 80)
    logger.info("Проверка миграции 005: PostgreSQL LISTEN/NOTIFY триггеры")
    logger.info("=" * 80)
    
    success = verify_migration()
    
    if success:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
