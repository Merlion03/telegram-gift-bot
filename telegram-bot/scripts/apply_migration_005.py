"""
Скрипт для применения миграции 005: PostgreSQL LISTEN/NOTIFY триггеры

Применяет SQL миграцию для создания триггеров real-time уведомлений
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


def apply_migration():
    """
    Применяет миграцию 005_realtime_triggers.sql
    """
    # Получаем параметры подключения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5433')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    # Формируем URL подключения для psycopg (синхронный)
    conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    logger.info(
        "Подключение к базе данных",
        host=db_host,
        port=db_port,
        database=db_name
    )
    
    try:
        # Читаем SQL файл миграции
        migration_file = Path(__file__).parent.parent / 'database' / 'migrations' / '005_realtime_triggers.sql'
        
        if not migration_file.exists():
            logger.error("Файл миграции не найден", path=str(migration_file))
            return False
        
        logger.info("Чтение файла миграции", path=str(migration_file))
        
        with open(migration_file, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        # Применяем миграцию через psycopg (синхронный)
        logger.info("Применение миграции 005_realtime_triggers.sql")
        
        with psycopg.connect(conn_string) as conn:
            with conn.cursor() as cur:
                try:
                    logger.info("Выполнение SQL миграции")
                    # psycopg может выполнять несколько команд в одном запросе
                    cur.execute(migration_sql)
                    conn.commit()
                    logger.info("Миграция применена успешно")
                except Exception as e:
                    logger.error(
                        "Ошибка при выполнении миграции",
                        error=str(e)
                    )
                    conn.rollback()
                    raise
        
        return True
        
    except Exception as e:
        logger.error("Ошибка при применении миграции", error=str(e), exc_info=True)
        return False


def main():
    """
    Главная функция скрипта
    """
    logger.info("=" * 80)
    logger.info("Применение миграции 005: PostgreSQL LISTEN/NOTIFY триггеры")
    logger.info("=" * 80)
    
    success = apply_migration()
    
    if success:
        logger.info("✓ Миграция применена успешно")
        sys.exit(0)
    else:
        logger.error("✗ Ошибка при применении миграции")
        sys.exit(1)


if __name__ == '__main__':
    main()
