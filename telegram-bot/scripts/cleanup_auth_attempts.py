"""
Скрипт для очистки старых записей из таблицы auth_attempts

Удаляет записи старше указанного количества часов (по умолчанию 24 часа).
Рекомендуется настроить как cron job или scheduled task для периодического выполнения.

Использование:
    source venv/bin/activate && python telegram-bot/scripts/cleanup_auth_attempts.py [hours]
    
Аргументы:
    hours - Количество часов (опционально, по умолчанию 24)
    
Примеры:
    python telegram-bot/scripts/cleanup_auth_attempts.py        # Удалить записи старше 24 часов
    python telegram-bot/scripts/cleanup_auth_attempts.py 48     # Удалить записи старше 48 часов
    python telegram-bot/scripts/cleanup_auth_attempts.py 1      # Удалить записи старше 1 часа
    
Настройка cron job (Linux/Mac):
    # Запускать каждый день в 3:00 ночи
    0 3 * * * cd /path/to/project && source venv/bin/activate && python telegram-bot/scripts/cleanup_auth_attempts.py
    
Настройка Task Scheduler (Windows):
    1. Откройте Task Scheduler
    2. Создайте новую задачу
    3. Триггер: Ежедневно в 3:00
    4. Действие: Запустить программу
       - Программа: C:\path\to\project\venv\Scripts\python.exe
       - Аргументы: telegram-bot/scripts/cleanup_auth_attempts.py
       - Рабочая папка: C:\path\to\project
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Добавляем корневую директорию в путь для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.connection import DatabaseConnection
from sqlalchemy import text
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)


def parse_hours_argument():
    """Парсит аргумент hours из командной строки"""
    
    if len(sys.argv) > 2:
        print("✗ Ошибка: Слишком много аргументов")
        print("\nИспользование: python telegram-bot/scripts/cleanup_auth_attempts.py [hours]")
        sys.exit(1)
    
    if len(sys.argv) == 2:
        try:
            hours = int(sys.argv[1])
            if hours <= 0:
                raise ValueError("hours должен быть положительным числом")
            return hours
        except ValueError as e:
            print(f"✗ Ошибка: {e}")
            print("\nИспользование: python telegram-bot/scripts/cleanup_auth_attempts.py [hours]")
            sys.exit(1)
    
    # По умолчанию 24 часа
    return 24


async def cleanup_old_attempts(hours: int):
    """Удаляет записи auth_attempts старше указанного количества часов"""
    
    # Параметры подключения
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '5432')
    db_name = os.getenv('DB_NAME', 'telegram_bot')
    db_user = os.getenv('DB_USER', 'postgres')
    db_password = os.getenv('DB_PASSWORD', 'postgres')
    
    database_url = f'postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
    
    print("=" * 80)
    print("ОЧИСТКА СТАРЫХ ПОПЫТОК ВХОДА")
    print("=" * 80)
    print(f"\nПодключение к БД: {db_host}:{db_port}/{db_name}")
    print(f"Удаление записей старше: {hours} часов")
    
    # Вычисляем граничную дату
    cutoff_time = datetime.now() - timedelta(hours=hours)
    print(f"Граничная дата: {cutoff_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Создаём подключение
    db = DatabaseConnection(database_url, echo=False)
    session = db.get_session()
    
    try:
        # Подсчитываем количество записей для удаления
        result = await session.execute(
            text("SELECT COUNT(*) FROM auth_attempts WHERE timestamp < NOW() - INTERVAL ':hours hours'"),
            {"hours": hours}
        )
        count_before = result.scalar()
        
        print(f"\nНайдено записей для удаления: {count_before}")
        
        if count_before == 0:
            print("✓ Нет записей для удаления")
            return
        
        # Удаляем старые записи
        result = await session.execute(
            text("DELETE FROM auth_attempts WHERE timestamp < NOW() - INTERVAL ':hours hours'"),
            {"hours": hours}
        )
        await session.commit()
        
        deleted_count = result.rowcount
        
        print(f"✓ Успешно удалено записей: {deleted_count}")
        
        # Проверяем оставшееся количество
        result = await session.execute(
            text("SELECT COUNT(*) FROM auth_attempts")
        )
        count_after = result.scalar()
        
        print(f"\nСтатистика:")
        print(f"  Записей до очистки: {count_before + count_after}")
        print(f"  Удалено: {deleted_count}")
        print(f"  Осталось: {count_after}")
        
    except Exception as e:
        print(f"\n✗ Ошибка при очистке: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()
        await db.close()


async def main():
    """Главная функция"""
    
    # Парсим аргументы
    hours = parse_hours_argument()
    
    # Выполняем очистку
    await cleanup_old_attempts(hours)
    
    print("\n" + "=" * 80)
    print("✓ ОЧИСТКА ЗАВЕРШЕНА")
    print("=" * 80)


if __name__ == '__main__':
    asyncio.run(main())
