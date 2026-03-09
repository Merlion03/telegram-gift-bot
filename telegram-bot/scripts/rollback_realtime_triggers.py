"""
Скрипт для отката миграции 005: PostgreSQL LISTEN/NOTIFY триггеры

Удаляет все триггеры и функции, созданные миграцией 005_realtime_triggers.sql
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


def rollback_migration():
    """
    Откатывает миграцию 005_realtime_triggers.sql
    Удаляет все триггеры и функции
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
        with psycopg.connect(conn_string) as conn:
            with conn.cursor() as cur:
                # Удаляем триггеры
                logger.info("Удаление триггера trigger_notify_new_message")
                cur.execute("""
                    DROP TRIGGER IF EXISTS trigger_notify_new_message 
                    ON support_messages CASCADE
                """)
                logger.info("✓ Триггер trigger_notify_new_message удалён")
                
                logger.info("Удаление триггера trigger_notify_session_status_change")
                cur.execute("""
                    DROP TRIGGER IF EXISTS trigger_notify_session_status_change 
                    ON support_sessions CASCADE
                """)
                logger.info("✓ Триггер trigger_notify_session_status_change удалён")
                
                logger.info("Удаление триггера trigger_notify_session_type_change")
                cur.execute("""
                    DROP TRIGGER IF EXISTS trigger_notify_session_type_change 
                    ON support_sessions CASCADE
                """)
                logger.info("✓ Триггер trigger_notify_session_type_change удалён")
                
                # Удаляем функции
                logger.info("Удаление функции notify_new_message")
                cur.execute("""
                    DROP FUNCTION IF EXISTS notify_new_message() CASCADE
                """)
                logger.info("✓ Функция notify_new_message удалена")
                
                logger.info("Удаление функции notify_session_status_change")
                cur.execute("""
                    DROP FUNCTION IF EXISTS notify_session_status_change() CASCADE
                """)
                logger.info("✓ Функция notify_session_status_change удалена")
                
                logger.info("Удаление функции notify_session_type_change")
                cur.execute("""
                    DROP FUNCTION IF EXISTS notify_session_type_change() CASCADE
                """)
                logger.info("✓ Функция notify_session_type_change удалена")
                
                # Коммитим изменения
                conn.commit()
                logger.info("✓ Все изменения применены")
        
        return True
        
    except Exception as e:
        logger.error("Ошибка при откате миграции", error=str(e), exc_info=True)
        return False


def main():
    """
    Главная функция скрипта
    """
    logger.info("=" * 80)
    logger.info("Откат миграции 005: PostgreSQL LISTEN/NOTIFY триггеры")
    logger.info("=" * 80)
    
    # Запрашиваем подтверждение
    logger.warning("ВНИМАНИЕ: Эта операция удалит все триггеры real-time уведомлений!")
    logger.warning("После отката real-time обновления в админ-панели перестанут работать.")
    
    try:
        confirmation = input("\nВы уверены, что хотите продолжить? (yes/no): ")
        if confirmation.lower() not in ['yes', 'y', 'да']:
            logger.info("Откат отменён пользователем")
            sys.exit(0)
    except KeyboardInterrupt:
        logger.info("\nОткат отменён пользователем")
        sys.exit(0)
    
    logger.info("Начало отката миграции")
    success = rollback_migration()
    
    if success:
        logger.info("=" * 80)
        logger.info("✓ Откат миграции выполнен успешно")
        logger.info("=" * 80)
        logger.info("Следующие шаги:")
        logger.info("1. Перезапустите WebSocket сервер (если он запущен)")
        logger.info("2. Отключите feature flag NEXT_PUBLIC_USE_POSTGRES_REALTIME")
        logger.info("3. Вернитесь к использованию Supabase Realtime (если необходимо)")
        sys.exit(0)
    else:
        logger.error("=" * 80)
        logger.error("✗ Ошибка при откате миграции")
        logger.error("=" * 80)
        sys.exit(1)


if __name__ == '__main__':
    main()
